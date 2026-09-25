import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

const worker=await readFile("worker/index.js","utf8");
const platform=await readFile("worker/platform-completion.js","utf8");
const finalWorker=await readFile("worker/final-features.js","utf8");
const html=await readFile("dist/index.html","utf8");
const finalClient=await readFile("dist/final-features.js","utf8");
const migration=await readFile("migrations/0014_final_features.sql","utf8");

for(const file of ["dist/sw.js","dist/platform-completion.js","migrations/0013_platform_completion.sql","migrations/0015_notification_delivery.sql"]) await access(file);

assert.match(worker,/handleFinalFeatures/);
assert.match(worker,/runFinalMaintenance/);
assert.match(worker,/complete-platform-2026-09-25\.7/);
assert.match(worker,/finalFeaturesSchema/);
assert.match(worker,/\/sitemap\.xml/);
assert.match(worker,/\/robots\.txt/);

for(const table of [
  "organization_drafts","organization_onboarding","branch_inventory_policies","pickup_branch_proposals",
  "unit_events","bulk_inventory_jobs","item_change_confirmations","recurring_loan_rules","saved_entities",
  "community_match_events","notification_outbox","email_templates","holiday_rules","moderation_jobs",
  "faq_articles","page_versions","performance_events","backup_objects","restore_drills"
]) assert.ok(migration.includes(table),table+" missing from final migration");

for(const route of [
  "/api/me/organization-drafts","/api/me/recurring-loans","/api/me/saved-entities",
  "/api/admin/email-templates","/api/admin/holiday-rules","/api/admin/moderation",
  "/api/admin/audit","/api/admin/analytics/operations","/api/faqs","/api/performance","/api/admin/backups"
]) assert.ok(finalWorker.includes(route),route+" missing");

assert.ok(html.includes("./platform-completion.js"));
assert.ok(html.includes("./final-features.js"));
assert.ok(finalClient.includes("אשף פתיחת גמ״ח"));
assert.ok(finalClient.includes("chat-attachment"));
assert.ok(finalClient.includes("pushManager"));
assert.ok(platform.includes("verifyTurnstile"));
assert.ok(platform.includes("processWaitlist"));
assert.ok(platform.includes("createBackup"));

console.log("Final completion static release gate passed.");
