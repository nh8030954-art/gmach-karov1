#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE_BUCKET="gmach-karov-images"
BACKUP_BUCKET="gmach-karov-backups"
CF_API="https://api.cloudflare.com/client/v4"

for name in CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID; do
  if [ -z "${!name:-}" ]; then
    echo "Missing required secret: $name" >&2
    exit 1
  fi
done

TS="$(date -u +'%Y%m%dT%H%M%SZ')"
NOW="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
ROOT="$RUNNER_TEMP/gmach-full-$TS"
ARCHIVE="$RUNNER_TEMP/gmach-full-$TS.zip"
VERIFY_COPY="$RUNNER_TEMP/gmach-full-$TS.verify.zip"
mkdir -p "$ROOT"/{database,storage/files,storage/manifests,site,config}

r2_get(){
  npx wrangler r2 object get "$BACKUP_BUCKET/$1" --file "$2" --remote >/dev/null 2>&1
}
r2_put(){
  npx wrangler r2 object put "$BACKUP_BUCKET/$1" --file "$2" --remote --content-type "$3" --force >/dev/null
}
r2_delete(){
  npx wrangler r2 object delete "$BACKUP_BUCKET/$1" --remote --force >/dev/null 2>&1 || true
}
read_pointer(){
  local key="$1" out="$2"
  if r2_get "$key" "$out"; then
    jq -e . "$out" >/dev/null 2>&1 || printf '{}\n' > "$out"
  else
    printf '{}\n' > "$out"
  fi
}

read_pointer CURRENT.json "$RUNNER_TEMP/CURRENT.before.json"
read_pointer PREVIOUS.json "$RUNNER_TEMP/PREVIOUS.before.json"
read_pointer STATUS.json "$RUNNER_TEMP/STATUS.before.json"

publish_failure(){
  local exit_code=$?
  set +e
  jq \
    --arg status "failed" \
    --arg last_attempt_at "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
    --arg run_url "https://github.com/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID" \
    --arg bucket "$BACKUP_BUCKET" \
    --arg schedule "Daily at 00:30 UTC" \
    --argjson exit_code "$exit_code" \
    --slurpfile current "$RUNNER_TEMP/CURRENT.before.json" \
    --slurpfile previous "$RUNNER_TEMP/PREVIOUS.before.json" \
    '. + {status:$status,last_attempt_at:$last_attempt_at,run_url:$run_url,bucket:$bucket,retention:2,schedule:$schedule,exit_code:$exit_code,current:$current[0],previous:$previous[0]}' \
    "$RUNNER_TEMP/STATUS.before.json" > "$RUNNER_TEMP/STATUS.failed.json" 2>/dev/null || true
  [ -s "$RUNNER_TEMP/STATUS.failed.json" ] && r2_put STATUS.json "$RUNNER_TEMP/STATUS.failed.json" application/json || true
  exit "$exit_code"
}
trap publish_failure ERR

echo "[1/8] Exporting complete D1 database"
npx wrangler d1 export DB --remote --output "$ROOT/database/full.sql"
test -s "$ROOT/database/full.sql"

echo "[2/8] Listing and downloading every production R2 media object"
: > "$ROOT/storage/manifests/remote.ndjson"
cursor=""
while :; do
  page="$RUNNER_TEMP/r2-page.json"
  if [ -n "$cursor" ]; then
    curl -fsS -G "$CF_API/accounts/$CLOUDFLARE_ACCOUNT_ID/r2/buckets/$SOURCE_BUCKET/objects" \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
      --data-urlencode "per_page=1000" --data-urlencode "cursor=$cursor" > "$page"
  else
    curl -fsS -G "$CF_API/accounts/$CLOUDFLARE_ACCOUNT_ID/r2/buckets/$SOURCE_BUCKET/objects" \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
      --data-urlencode "per_page=1000" > "$page"
  fi
  jq -e '.success == true and (.result|type=="array")' "$page" >/dev/null
  jq -c '.result[]' "$page" >> "$ROOT/storage/manifests/remote.ndjson"
  truncated="$(jq -r '.result_info.is_truncated // false' "$page")"
  cursor="$(jq -r '.result_info.cursor // empty' "$page")"
  [ "$truncated" = "true" ] && [ -n "$cursor" ] || break
done

: > "$ROOT/storage/manifests/verified.ndjson"
while IFS= read -r row; do
  [ -n "$row" ] || continue
  key="$(printf '%s' "$row" | jq -r '.key')"
  expected="$(printf '%s' "$row" | jq -r '.size // 0')"
  case "$key" in
    ""|/*|../*|*/../*|*/..|..) echo "Unsafe R2 key: $key" >&2; exit 1 ;;
  esac
  target="$ROOT/storage/files/$key"
  mkdir -p "$(dirname "$target")"
  npx wrangler r2 object get "$SOURCE_BUCKET/$key" --file "$target" --remote >/dev/null
  actual="$(stat -c '%s' "$target")"
  [ "$actual" = "$expected" ] || { echo "R2 size mismatch for $key" >&2; exit 1; }
  sha="$(sha256sum "$target" | awk '{print $1}')"
  printf '%s' "$row" | jq -c --arg sha256 "$sha" '. + {sha256:$sha256}' >> "$ROOT/storage/manifests/verified.ndjson"
done < "$ROOT/storage/manifests/remote.ndjson"
jq -s '.' "$ROOT/storage/manifests/verified.ndjson" > "$ROOT/storage/manifest.json"
object_count="$(jq 'length' "$ROOT/storage/manifest.json")"
storage_bytes="$(jq '[.[].size // 0] | add // 0' "$ROOT/storage/manifest.json")"

echo "[3/8] Capturing exact site code and complete Git history"
git rev-parse HEAD > "$ROOT/site/git-head.txt"
git log -1 --format='%H%n%cI%n%s' > "$ROOT/site/git-commit.txt"
git remote -v > "$ROOT/site/git-remotes.txt"
git archive --format=zip --output="$ROOT/site/repository-head.zip" HEAD
git bundle create "$ROOT/site/repository.bundle" --all
unzip -tq "$ROOT/site/repository-head.zip" >/dev/null
git bundle verify "$ROOT/site/repository.bundle" >/dev/null 2>&1
cp wrangler.jsonc "$ROOT/config/wrangler.jsonc"
cp package.json "$ROOT/config/package.json"
cp package-lock.json "$ROOT/config/package-lock.json"

echo "[4/8] Building manifest and internal checksums"
db_bytes="$(stat -c '%s' "$ROOT/database/full.sql")"
jq -n \
  --arg created_at_utc "$TS" \
  --arg git_sha "$GITHUB_SHA" \
  --argjson database_bytes "$db_bytes" \
  --argjson storage_object_count "$object_count" \
  --argjson storage_bytes "$storage_bytes" \
  '{
    format_version:1,
    backup_type:"gmach-full-production",
    created_at_utc:$created_at_utc,
    git_sha:$git_sha,
    database:{engine:"Cloudflare D1",export:"database/full.sql",bytes:$database_bytes},
    storage:{bucket:"gmach-karov-images",manifest:"storage/manifest.json",object_count:$storage_object_count,total_bytes:$storage_bytes},
    site:{snapshot:"site/repository-head.zip",history:"site/repository.bundle"},
    configuration:["config/wrangler.jsonc","config/package.json","config/package-lock.json"],
    secret_values_included:false,
    restore_components:["D1 schema and data","all R2 media objects","exact Git commit","complete Git history","non-secret deployment configuration"]
  }' > "$ROOT/manifest.json"

(
  cd "$ROOT"
  find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
  sha256sum -c SHA256SUMS >/dev/null
  zip -qr "$ARCHIVE" .
)
unzip -tq "$ARCHIVE" >/dev/null
archive_sha="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
archive_size="$(stat -c '%s' "$ARCHIVE")"
test "$archive_size" -gt 0

echo "[5/8] Uploading archive to private backup R2"
final_key="backups/gmach-full-$TS.zip"
r2_put "$final_key" "$ARCHIVE" application/zip

echo "[6/8] Reading archive back and verifying SHA-256"
r2_get "$final_key" "$VERIFY_COPY"
[ "$(stat -c '%s' "$VERIFY_COPY")" = "$archive_size" ]
[ "$(sha256sum "$VERIFY_COPY" | awk '{print $1}')" = "$archive_sha" ]
unzip -tq "$VERIFY_COPY" >/dev/null
rm -f "$VERIFY_COPY"

jq -n \
  --arg key "$final_key" \
  --arg sha256 "$archive_sha" \
  --arg git_sha "$GITHUB_SHA" \
  --arg updated_at "$NOW" \
  --argjson size "$archive_size" \
  '{key:$key,sha256:$sha256,size:$size,git_sha:$git_sha,updated_at:$updated_at}' > "$RUNNER_TEMP/CURRENT.new.json"

old_current_key="$(jq -r '.key // empty' "$RUNNER_TEMP/CURRENT.before.json")"
old_previous_key="$(jq -r '.key // empty' "$RUNNER_TEMP/PREVIOUS.before.json")"

if [ -n "$old_current_key" ]; then
  cp "$RUNNER_TEMP/CURRENT.before.json" "$RUNNER_TEMP/PREVIOUS.new.json"
else
  printf '{}\n' > "$RUNNER_TEMP/PREVIOUS.new.json"
fi

echo "[7/8] Rotating CURRENT and PREVIOUS only after successful verification"
r2_put PREVIOUS.json "$RUNNER_TEMP/PREVIOUS.new.json" application/json
r2_put CURRENT.json "$RUNNER_TEMP/CURRENT.new.json" application/json

if [ -n "$old_previous_key" ] && [ "$old_previous_key" != "$old_current_key" ] && [ "$old_previous_key" != "$final_key" ]; then
  r2_delete "$old_previous_key"
fi

# Remove any stale full-backup ZIPs that are not CURRENT or PREVIOUS.
keep_previous="$(jq -r '.key // empty' "$RUNNER_TEMP/PREVIOUS.new.json")"
cursor=""
while :; do
  page="$RUNNER_TEMP/backup-page.json"
  if [ -n "$cursor" ]; then
    curl -fsS -G "$CF_API/accounts/$CLOUDFLARE_ACCOUNT_ID/r2/buckets/$BACKUP_BUCKET/objects" \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
      --data-urlencode "per_page=1000" --data-urlencode "prefix=backups/gmach-full-" --data-urlencode "cursor=$cursor" > "$page"
  else
    curl -fsS -G "$CF_API/accounts/$CLOUDFLARE_ACCOUNT_ID/r2/buckets/$BACKUP_BUCKET/objects" \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
      --data-urlencode "per_page=1000" --data-urlencode "prefix=backups/gmach-full-" > "$page"
  fi
  jq -e '.success == true' "$page" >/dev/null
  while IFS= read -r stale; do
    [ "$stale" = "$final_key" ] && continue
    [ -n "$keep_previous" ] && [ "$stale" = "$keep_previous" ] && continue
    r2_delete "$stale"
  done < <(jq -r '.result[].key' "$page")
  truncated="$(jq -r '.result_info.is_truncated // false' "$page")"
  cursor="$(jq -r '.result_info.cursor // empty' "$page")"
  [ "$truncated" = "true" ] && [ -n "$cursor" ] || break
done

echo "[8/8] Publishing backup status"
jq -n \
  --arg status "success" \
  --arg last_attempt_at "$NOW" \
  --arg last_success_at "$NOW" \
  --arg run_url "https://github.com/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID" \
  --arg bucket "$BACKUP_BUCKET" \
  --arg schedule "Daily at 00:30 UTC" \
  --slurpfile current "$RUNNER_TEMP/CURRENT.new.json" \
  --slurpfile previous "$RUNNER_TEMP/PREVIOUS.new.json" \
  '{status:$status,last_attempt_at:$last_attempt_at,last_success_at:$last_success_at,run_url:$run_url,bucket:$bucket,retention:2,schedule:$schedule,current:$current[0],previous:$previous[0]}' > "$RUNNER_TEMP/STATUS.success.json"
r2_put STATUS.json "$RUNNER_TEMP/STATUS.success.json" application/json
trap - ERR

echo "Full backup completed: $final_key"
