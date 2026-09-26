import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

const worker=await readFile("worker/index.js","utf8");
const platform=await readFile("worker/platform-completion.js","utf8");
const finalWorker=await readFile("worker/final-features.js","utf8");
const html=await readFile("dist/index.html","utf8");
const finalClient=await readFile("dist/final-features.js","utf8");
const remainingWorker=await readFile("worker/remaining-features.js","utf8");
const remainingClient=await readFile("dist/remaining-features.js","utf8");
const migration=await readFile("migrations/0014_final_features.sql","utf8");

for(const file of ["dist/sw.js","dist/platform-completion.js","migrations/0013_platform_completion.sql","migrations/0015_notification_delivery.sql"]) await access(file);

assert.match(worker,/handleFinalFeatures/);
assert.match(worker,/runFinalMaintenance/);
assert.match(worker,/complete-platform-2026-09-25\.9/);
assert.match(worker,/finalFeaturesSchema/);
assert.match(worker,/\/sitemap\.xml/);
assert.match(worker,/\/robots\.txt/);
assert.ok(worker.includes("updateAdminCategory"));
assert.ok(worker.includes("updateAdminClosure"));

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
assert.ok(html.includes("./remaining-features.js"));
assert.ok(finalClient.includes("אשף פתיחת גמ״ח"));
assert.ok(finalClient.includes("chat-attachment"));
assert.ok(finalClient.includes("מועדפים ובקשות קבועות"));
assert.ok(finalClient.includes("template-editor"));
assert.ok(finalClient.includes("audit-export"));
assert.ok(finalClient.includes("data-holiday"));
assert.ok(finalClient.includes("data-mod"));
assert.ok(finalClient.includes("pushManager"));
assert.ok(platform.includes("verifyTurnstile"));
assert.ok(platform.includes("processWaitlist"));
assert.ok(platform.includes("createBackup"));
const platformClient=await readFile("dist/platform-completion.js","utf8");
assert.ok(platformClient.includes("pt-admin-categories"));
assert.ok(platformClient.includes("/api/admin/categories/"));
assert.ok(platformClient.includes("/api/admin/closures/"));
assert.ok(platformClient.includes("/api/admin/category-suggestions"));
assert.ok(platformClient.includes("pt-category-suggestions"));
assert.ok(platformClient.includes("data-approve"));
assert.ok(platformClient.includes("data-reject"));

console.log("Final completion static release gate passed.");

for(const token of ["/availability-calendar","/similar","operations-dashboard","/api/admin/page-content","/validate"]) assert.ok(remainingWorker.includes(token),token+" missing from remaining worker");
for(const token of ["ניהול תמונות","לוח זמינות","CMS ותוכן","language-switch"]) assert.ok(remainingClient.includes(token),token+" missing from remaining client");
assert.ok(remainingClient.includes("observeTranslations"));
assert.ok(remainingClient.includes("Saved items & recurring requests"));
assert.ok(remainingClient.includes("Advanced operations"));

const appClient=await readFile("dist/app.js","utf8");
for(const token of ["openOrganizationManager","data-manage-org","org-branch-form","org-member-form","openUnitManager","data-units-item","print-unit-qrs","data-unit-history"])assert.ok(appClient.includes(token),token+" missing from app client");

const indexHtml=await readFile("dist/index.html","utf8");
for(const condition of ["חדש","כמו חדש","מצב טוב","מצב סביר","בלאי נראה לעין"])assert.ok(indexHtml.includes(condition),"condition taxonomy missing: "+condition);

for(const token of ["listItemWaitlist","leaveWaitlist","updateHelpOffer","waitlistEntry","helpOffer"])assert.ok(worker.includes(token),token+" missing from waitlist/community lifecycle");
for(const token of ["request-waitlist input","openHelpOffers","data-select-offer","data-remove-waitlist","calendar.ics"])assert.ok(appClient.includes(token),token+" missing from waitlist/community/calendar UI");
for(const token of ["renderCalendar","preferredApp","data-k=\"push\"","reminderMinutes"])assert.ok(platformClient.includes(token),token+" missing from calendar/push settings UI");

for(const token of ["item-publish-at","item-max-per-user","item-preparation","item-max-loan-days","item-service-radius","עד 12 תמונות"])assert.ok(html.includes(token),token+" missing from advanced item form");
for(const token of ["publishAt:$(\"#item-publish-at\")","maxPerUser:$(\"#item-max-per-user\")","serviceRadiusKm:$(\"#item-service-radius\")","data-review-helpful","data-review-report","עד 12 תמונות"])assert.ok(appClient.includes(token),token+" missing from advanced item/review UI");
for(const token of ["preparation_minutes","max_loan_days","מועד האיסוף מוקדם מדי לפי זמן ההזמנה וההכנה","status:nextStatus"])assert.ok(worker.includes(token),token+" missing from advanced item enforcement");

for(const token of ["suggest-category-button","לא מצאתי קטגוריה"])assert.ok(html.includes(token),token+" missing from category suggestion entry point");
assert.ok(appClient.includes("/api/category-suggestions"),"category suggestion UI is not connected");

for(const token of ["/change/respond","/undo-cancel","/extension/respond","data-change-request","data-change-decision","data-extension-alternative","async function openLoanChange"])assert.ok(appClient.includes(token),token+" missing from completed loan workflow UI");

assert.ok(finalClient.includes('$("[data-template]",d).forEach'),"multi-element bindings regression in final features");

for(const token of ["async function updateBranch","async function archiveBranch","const branchDetail = path.match","branch.update","branch.archive"])assert.ok(worker.includes(token),token+" missing from completed branch lifecycle");

for(const token of ["data-branch-reopen","data-branch-reopen-now","הסניף נסגר זמנית והלווים הפעילים עודכנו"])assert.ok(appClient.includes(token),token+" missing from temporary branch closure UI");

for(const token of ["function openAddressEditor","data-edit-address","/api/me/addresses/"])assert.ok(appClient.includes(token),token+" missing from address editing UI");

for(const token of ["dashboard-priority","ההשאלה הקרובה","פריטים שממתינים להחזרה","בקשות שממתינות לפעולה שלך","בקשות קהילה פתוחות"])assert.ok(appClient.includes(token),token+" missing from personal dashboard priorities");

for(const token of ["f.branches.selectedOptions","f.categories.selectedOptions","ללא בחירה = כל הסניפים","ללא בחירה = כל הקטגוריות"])assert.ok(appClient.includes(token),token+" missing from manager permission scope UI");

for(const token of ["openOrganizationAdvanced","data-org-advanced","ownership-transfer-form","branch-transfer-form","data-receive-transfer","request_delete","cancel_delete"])assert.ok(appClient.includes(token),token+" missing from organization lifecycle/transfer UI");

for(const token of ["openBulkInventory","data-org-bulk","/inventory/bulk","/api/items/import","bulk-import-preview"])assert.ok(appClient.includes(token),token+" missing from bulk inventory/import UI");

for(const token of ["data-remove-item","/remove","מחיקה לפי היסטוריה"])assert.ok(appClient.includes(token),token+" missing from history-aware item removal UI");

for(const token of ["renderPrivacy","/api/me/export","/api/me/data-request","request-deletion"])assert.ok(platformClient.includes(token),token+" missing from privacy/data UI");

for(const token of ["renderTransfers","/api/me/organization-transfers","data-transfer-accept","data-transfer-decline"])assert.ok(platformClient.includes(token),token+" missing from ownership transfer account UI");

assert.ok(platformWorker.includes("/api/me/organization-transfers"),"ownership transfer listing route missing");

assert.ok(worker.includes("requestAccountDeletion"),"account deletion request endpoint missing");

for(const token of ["saved-entity-form","recurring-loan-form","data-waitlist-accept","data-waitlist-decline"])assert.ok(finalClient.includes(token),token+" missing from saved/recurring/waitlist UI");

for(const token of ["myWaitlistOffers","/api/me/waitlist-offers","const expiredOffers="])assert.ok(finalWorker.includes(token),token+" missing from actionable waitlist lifecycle");

for(const token of ["openHelpMatches","data-help-matches","data-offer-match"])assert.ok(appClient.includes(token),token+" missing from community matching UI");

assert.ok(appClient.includes("data-counter-pickup"),"pickup counter proposal UI missing");
