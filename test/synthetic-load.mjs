import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare } from "miniflare";

// Every account, organization and item below exists only inside this Miniflare instance.
const mf = new Miniflare({
  modules: true,
  modulesRules: [{ type: "ESModule", include: ["**/*.js"], fallthrough: true }],
  scriptPath: "worker/index.js",
  compatibilityDate: "2026-08-06",
  d1Databases: { DB: "synthetic-db" },
  r2Buckets: ["ITEM_IMAGES"],
  bindings: { DATA_ENCRYPTION_KEY: "isolated-synthetic-test-only-key-123456789" }
});

function statements(sql) {
  const result = [];
  let buffer = "", trigger = false;
  for (const line of sql.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("--")) continue;
    buffer += `${line}\n`;
    if (!trigger && /^\s*CREATE\s+TRIGGER\b/i.test(buffer)) trigger = true;
    if (trigger ? /^\s*END;\s*$/i.test(line) : /;\s*$/.test(line)) {
      result.push(buffer.trim().replace(/;\s*$/, ""));
      buffer = "";
      trigger = false;
    }
  }
  if (buffer.trim()) result.push(buffer.trim());
  return result;
}

try {
  const db = await mf.getD1Database("DB");
  for (const file of (await readdir("migrations")).filter(x => /^\d+.*\.sql$/.test(x)).sort()) {
    await db.batch(statements(await readFile(`migrations/${file}`, "utf8")).map(sql => db.prepare(sql)));
  }
  const users = 250, organizations = 50, items = 500;
  for (let start = 0; start < users; start += 50) {
    await db.batch(Array.from({ length: Math.min(50, users - start) }, (_, n) => {
      const i = start + n;
      return db.prepare("INSERT INTO users(id,email,password_hash,password_salt,full_name) VALUES(?,?,?,?,?)")
        .bind(`synthetic-user-${i}`, `synthetic-${i}@example.invalid`, "unusable-test-hash", "test-salt", `Synthetic User ${i}`);
    }));
  }
  for (let start = 0; start < organizations; start += 25) {
    await db.batch(Array.from({ length: Math.min(25, organizations - start) }, (_, n) => {
      const i = start + n;
      return db.prepare("INSERT INTO organizations(id,owner_id,name,primary_category,city,description,status) VALUES(?,?,?,?,?,?,'approved')")
        .bind(`synthetic-org-${i}`, `synthetic-user-${i}`, `Synthetic Gmach ${i}`, "אירועים", "ירושלים", "Test organization with loan equipment");
    }));
  }
  for (let start = 0; start < items; start += 50) {
    await db.batch(Array.from({ length: Math.min(50, items - start) }, (_, n) => {
      const i = start + n;
      return db.prepare("INSERT INTO items(id,organization_id,title,category,description,condition,quantity,city,status,availability_status) VALUES(?,?,?,?,?, 'טוב',3,'ירושלים','active',?)")
        .bind(`synthetic-item-${i}`, `synthetic-org-${i % organizations}`, `Synthetic item ${i}`, "אירועים", "Equipment for load testing", i === 0 ? "unavailable" : "available");
    }));
  }

  const get = async path => {
    const response = await mf.dispatchFetch(`http://local.test${path}`);
    if (response.status !== 200) throw new Error(`${path}: ${response.status} ${await response.text()}`);
    return response.json();
  };
  await get("/api/health?deep=1");
  assert.equal((await get("/api/discovery")).organizations.length, organizations);
  assert.equal((await get("/api/organizations/synthetic-org-0/public")).items.length, 10);
  assert.ok((await get("/api/items?q=Synthetic%20item%200")).items.some(item => item.id === "synthetic-item-0"), "An item offered by arrangement must remain discoverable");
  assert.ok(!(await get("/api/items?q=Synthetic%20item%200&available_only=true")).items.some(item => item.id === "synthetic-item-0"));

  const routes = ["/api/health", "/api/categories", "/api/items", "/api/discovery", "/api/organizations/synthetic-org-0/public"];
  for (const concurrency of [10, 25, 50, 100]) {
    const start = performance.now();
    const results = await Promise.all(Array.from({ length: concurrency }, async (_, i) => {
      const statuses = [];
      for (let n = 0; n < 5; n++) {
        const response = await mf.dispatchFetch(`http://local.test${routes[(i + n) % routes.length]}`);
        statuses.push(response.status);
        await response.arrayBuffer();
      }
      return statuses;
    }));
    const statuses = results.flat();
    assert.ok(statuses.every(status => status === 200), `${concurrency} clients: ${JSON.stringify(statuses.filter(status => status !== 200))}`);
    console.log(JSON.stringify({ users, organizations, items, concurrency, requests: statuses.length, success: statuses.length, durationMs: Math.round(performance.now() - start) }));
  }
  // Reproduce a live database whose optional review column has not migrated.
  // Listing equipment must remain possible even if the richer review query fails.
  await db.prepare("ALTER TABLE reviews DROP COLUMN item_rating").run();
  const olderSchemaPage = await get("/api/organizations/synthetic-org-0/public");
  assert.equal(olderSchemaPage.items.length, 10, "Public gmach must retain its listed items with an older review schema");
} finally {
  await mf.dispose();
}
