import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files={
  worker:await readFile("worker/index.js","utf8"),
  completion:await readFile("worker/platform-completion.js","utf8"),
  final:await readFile("worker/final-features.js","utf8"),
  html:await readFile("dist/index.html","utf8"),
  consoleJs:await readFile("dist/platform-console.js","utf8"),
  migration13:await readFile("migrations/0013_full_completion.sql","utf8"),
  migration14:await readFile("migrations/0014_final_features.sql","utf8")
};

for(const needle of [
  "handlePlatformApi","runCompletionMaintenance","completionHealth",
  "handleFinalFeatures","runFinalMaintenance","ensureFinalFeaturesSchema",
  "complete-platform-2026-09-25.6"
]) assert.ok(files.worker.includes(needle),`worker missing ${needle}`);

for(const needle of [
  "inventory_holds","ownership_transfers","chat_attachments","data_subject_requests",
  "organization_drafts","unit_events","notification_outbox","holiday_rules","moderation_jobs","backup_objects"
]) assert.ok((files.migration13+"\n"+files.migration14).includes(needle),`schema missing ${needle}`);

for(const needle of [
  "/api/me/tours/","/api/me/organization-drafts","publish-readiness","inventory/bulk",
  "item-units/scan","recurring-loans","saved-entities","help-requests/","admin/email-templates",
  "admin/holiday-rules","admin/moderation","admin/analytics/operations","admin/backups","/sitemap.xml"
]) assert.ok(files.final.includes(needle),`final API missing ${needle}`);

assert.ok(files.html.includes("./platform-console.css"));
assert.ok(files.html.includes("./platform-console.js"));
assert.ok(files.html.includes("./security-integrations.js"));
assert.ok(files.consoleJs.includes("מרכז מתקדם"));
assert.ok(files.html.includes("hero"),"public home hero marker missing");
assert.ok(!files.html.includes("platform-console" id="home"),"advanced console leaked into home markup");

console.log("Release static checks passed: completion layers, schema, routes and home isolation.");
