import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

const worker=await readFile("worker/index.js","utf8");
const platform=await readFile("worker/platform-completion.js","utf8");
const finalWorker=await readFile("worker/final-features.js","utf8");
const html=await readFile("dist/index.html","utf8");
const css=await readFile("dist/styles.css","utf8");
const finalClient=await readFile("dist/final-features.js","utf8");
const remainingWorker=await readFile("worker/remaining-features.js","utf8");
const remainingClient=await readFile("dist/remaining-features.js","utf8");
const migration=await readFile("migrations/0014_final_features.sql","utf8");

for(const file of ["dist/sw.js","dist/platform-completion.js","migrations/0013_platform_completion.sql","migrations/0015_notification_delivery.sql","migrations/0018_backfill_missing_item_units.sql","migrations/0022_reconcile_loan_unit_states.sql"]) await access(file);

assert.match(worker,/handleFinalFeatures/);
assert.match(worker,/runFinalMaintenance/);
assert.match(worker,/complete-platform-\d{4}-\d{2}-\d{2}\.\d+/);
assert.match(worker,/ensureFinalFeaturesSchema/);
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

assert.ok(/src="\/?platform-completion\.js(?:\?[^"]*)?"/.test(html));
assert.ok(/src="\/?final-features\.js(?:\?[^"]*)?"/.test(html));
assert.ok(/src="\/?remaining-features\.js(?:\?[^"]*)?"/.test(html));
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
assert.ok(remainingClient.includes("is-partial")&&remainingClient.includes("יחידות תפוסות")&&remainingClient.includes("data.totalQuantity"),"availability calendar must show explicit available/busy quantities");
assert.ok(remainingClient.includes("observeTranslations"));
assert.ok(remainingClient.includes("Saved items & recurring requests"));
assert.ok(remainingClient.includes("Advanced operations"));

const appClient=await readFile("dist/app.js","utf8");
const launchSelectorClient=await readFile("dist/launch-readiness.js","utf8");
assert.ok(!/(?<!\$)\$\('\[data-(?:edit-org|manage-org|org-transfers|org-advanced)\]'\)\.forEach/.test(appClient),"single-element selector used with forEach in organization controls");
assert.ok(!/(?<!\$)\$\("\[data-(?:entity-edit|support-open)\]",out\)\.forEach/.test(launchSelectorClient),"single-element selector used with forEach in launch controls");
for(const token of ["openOrganizationManager","data-manage-org","org-branch-form","org-member-form","openUnitManager","data-units-item","print-unit-qrs","data-unit-history"])assert.ok(appClient.includes(token),token+" missing from app client");

const indexHtml=await readFile("dist/index.html","utf8");
for(const condition of ["חדש","כמו חדש","מצב טוב","מצב סביר","בלאי נראה לעין"])assert.ok(indexHtml.includes(condition),"condition taxonomy missing: "+condition);

for(const token of ["listItemWaitlist","leaveWaitlist","updateHelpOffer","waitlistEntry","helpOffer"])assert.ok(worker.includes(token),token+" missing from waitlist/community lifecycle");
for(const token of ["request-partial-options","request-partial-waitlist","joinCurrentRequestWaitlist","openHelpOffers","data-select-offer","data-remove-waitlist","calendar.ics"])assert.ok((appClient+indexHtml).includes(token),token+" missing from waitlist/community/calendar UI");
assert.ok(appClient.includes('[data-calendar-request]')&&appClient.includes("openCalendarMenu(button.dataset.calendarRequest)"),"calendar request button must be wired");
assert.ok(worker.includes("loanRequestCalendar")&&worker.includes("/calendar\\.ics"),"loan calendar endpoint missing");
for(const token of ["renderCalendar","preferredApp","data-k=\"push\"","reminderMinutes"])assert.ok(platformClient.includes(token),token+" missing from calendar/push settings UI");

for(const token of ["item-publish-at","item-max-per-user","item-preparation","item-max-loan-days","item-service-radius","עד 12 תמונות"])assert.ok(html.includes(token),token+" missing from advanced item form");
for(const token of ["publishAt:$(\"#item-publish-at\")","maxPerUser:$(\"#item-max-per-user\")","serviceRadiusKm:$(\"#item-service-radius\")","data-review-helpful","data-review-report","עד 12 תמונות"])assert.ok(appClient.includes(token),token+" missing from advanced item/review UI");
for(const token of ["preparation_minutes","max_loan_days","מועד האיסוף מוקדם מדי לפי זמן ההזמנה וההכנה","status:nextStatus"])assert.ok(worker.includes(token),token+" missing from advanced item enforcement");

for(const token of ["suggest-category-button","לא מצאת קטגוריה? - אפשר להציע חדשה"])assert.ok(html.includes(token),token+" missing from category suggestion entry point");
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

assert.ok(platform.includes("/api/me/organization-transfers"),"ownership transfer listing route missing");

assert.ok(worker.includes("requestAccountDeletion"),"account deletion request endpoint missing");

for(const token of ["saved-entity-form","recurring-loan-form","data-waitlist-accept","data-waitlist-decline"])assert.ok(finalClient.includes(token),token+" missing from saved/recurring/waitlist UI");

for(const token of ["myWaitlistOffers","/api/me/waitlist-offers","const expiredOffers="])assert.ok(finalWorker.includes(token),token+" missing from actionable waitlist lifecycle");

for(const token of ["openHelpMatches","data-help-matches","data-offer-match"])assert.ok(appClient.includes(token),token+" missing from community matching UI");

assert.ok(appClient.includes("data-counter-pickup"),"pickup counter proposal UI missing");

for(const token of ["maps.apple.com","data-copy-map-address","navigator.geolocation","/api/geocode"])assert.ok(remainingClient.includes(token),token+" missing from completed map/navigation UI");
assert.ok(remainingClient.includes("createInteractiveOsmMap")&&remainingClient.includes("/api/maps/tiles/")&&remainingClient.includes("showCountry"),"interactive full-country gmach map missing");
assert.ok(remainingClient.includes("map-nav-pref-label"),"map navigation preference control must use non-overlapping layout");
assert.ok(remainingWorker.includes("maps\\/tiles\\/")&&remainingWorker.includes("tile.openstreetmap.org"),"same-origin map tile proxy missing");
const remainingHandler=remainingWorker.slice(remainingWorker.indexOf("export async function handleRemainingFeatures"));
assert.ok(remainingWorker.includes("ensureMapSchema")&&remainingHandler.indexOf("api\\/maps\\/tiles")<remainingHandler.indexOf("await ensureSchema(env)"),"map endpoints must not depend on full schema reconciliation");
assert.ok(remainingClient.includes('/api/geocode?q=')&&remainingClient.includes('gmach:open-organization'),"gmach map geocoding/open flow regression");
assert.ok(remainingClient.includes('org.review_count')&&remainingClient.includes('"★".repeat(filled)+"☆".repeat(5-filled)')&&remainingClient.includes('class="organization-name" translate="no"'),"map gmach rating stars/name preservation missing");
assert.ok(remainingClient.includes('/api/translate/user-content')&&remainingClient.includes('queueAiTranslation')&&remainingClient.includes('NEVER_TRANSLATE_SELECTOR=".organization-name'),"English dynamic-content translation fallback missing");
assert.ok(remainingClient.includes('?"Hebrew":"English"')&&!remainingClient.includes('?"עברית":"English"'),"English mode language switch must stay English-only");

assert.ok(worker.includes("organization_branches b")&&worker.includes("AS latitude")&&worker.includes("AS longitude"),"discovery must expose stored branch coordinates for the map");
assert.ok(remainingClient.includes("row.latitude")&&remainingClient.includes("/api/maps/tiles/"),"map must prefer stored coordinates and use same-origin tile loading");


for(const token of ["manageLoanUnits","const loanUnits =","loan_unit_assignments"])assert.ok(worker.includes(token),token+" missing from pickup unit assignment backend");

for(const token of ["openPickupScreen","openReturnScreen","data-pickup-request","data-return-request","/units"])assert.ok(appClient.includes(token),token+" missing from pickup/return UI");

for(const token of ["I18N_EXTRA","translateText","Ownership transfers","Needs your attention","Pickup screen","Return screen"])assert.ok(remainingClient.includes(token),token+" missing from full English localization");

for(const token of ["newlyOverdue","ההשאלה באיחור","detectedAt"])assert.ok(worker.includes(token),token+" missing from overdue notification workflow");

for(const token of ["createOrganizationInvitation","acceptOrganizationInvitation","cancelOrganizationInvitation","expiresAt"])assert.ok(worker.includes(token),token+" missing from manager invitation workflow");
for(const token of ["org-invite-form","data-cancel-invite","invitationsData"])assert.ok(appClient.includes(token),token+" missing from manager invitation UI");
for(const token of ["data-edit-search","notifyMatchingSavedSearches","פריט חדש מתאים לחיפוש שמור"])assert.ok((appClient+worker).includes(token),token+" missing from saved search completion");
for(const token of ["listMySecurityEvents","/api/me/security-events","אירועי אבטחה אחרונים"])assert.ok((worker+appClient).includes(token),token+" missing from personal security center");
for(const token of ['data-channel="push"','data-channel="digest"','data-channel="quietStart"'])assert.ok(appClient.includes(token),token+" missing from notification preference UI");
for(const token of ["editRequestMessage","message_edited","data-edit-message","message.read_at"])assert.ok((worker+appClient).includes(token),token+" missing from chat edit/read workflow");
for(const token of ["scheduledItems","publish_at IS NOT NULL","notifyMatchingSavedSearches"])assert.ok(worker.includes(token),token+" missing from scheduled publication workflow");
for(const token of ["openHelpMatches","data-help-matches","data-select-offer"])assert.ok(appClient.includes(token),token+" missing from community match/offer workflow");
for(const source of [appClient,finalClient,platformClient,remainingClient])assert.ok(!/(?<!\$)\$\((?:'[^']*'|"[^"]*")(?:,[^)]*)?\)\.forEach/.test(source),"single-element selector used as collection");
assert.ok(!appClient.includes("$$$("),"invalid triple-dollar selector helper must never reach runtime");
assert.ok(!worker.includes("כבר קיים בגמ״ח פריט פעיל בשם הזה ובאותה קטגוריה"),"item creation must not hard-block duplicate names/categories");
for(const token of ["relationReady","CREATE TABLE IF NOT EXISTS organization_categories","CREATE TABLE IF NOT EXISTS item_categories"])assert.ok(worker.includes(token),token+" missing from production schema repair");

for(const token of ["const inviteMatch=","/accept","הצטרפת לצוות הניהול"])assert.ok(appClient.includes(token),token+" missing from manager invite acceptance UI");

for(const token of ["deletionReminderUsers","תזכורת לפני מחיקת החשבון","-5 days"])assert.ok(worker.includes(token),token+" missing from account deletion reminder lifecycle");

assert.ok(appClient.includes("button.dataset.orgBulk"),"bulk inventory dashboard button is not bound");

for(const token of ["installFormErrorFocus","aria-invalid",":invalid","scrollIntoView"])assert.ok(appClient.includes(token),token+" missing from accessible form error focus");

for(const token of ["image/svg+xml","X-Gmach-QR-Payload","<metadata>"])assert.ok(platform.includes(token),token+" missing from printable unit label endpoint");

for(const token of ["lr.workflow_status","lr.extension_status","lr.change_pending_json","lr.cancellation_undo_until"])assert.ok(worker.includes(token),token+" missing from dashboard workflow state");

for(const token of ["data-manager-cancel","ביטול מצד הגמ״ח","managerCancel"])assert.ok(appClient.includes(token),token+" missing from approved-loan manager cancellation UI");

for(const token of ["expiredHolds","missedPickups","hold_expired","pickup_expired"])assert.ok(worker.includes(token),token+" missing from hold/no-show maintenance");

for(const token of ["data-pickup-expiry","pickup-expired"])assert.ok(appClient.includes(token),token+" missing from missed pickup recovery UI");

for(const token of ["data-org-reviews","openOrganizationReviews","data-respond-review"])assert.ok(appClient.includes(token),token+" missing from organization review response UI");

for(const token of ["data-edit-my-review","הביקורות שלי"])assert.ok(finalClient.includes(token),token+" missing from review editing UI");

for(const token of ["no_show","const expiredHolds=","hold_expired","advanceWaitlist(env,row.item_id)"])assert.ok(worker.includes(token),token+" missing from hold/no-show lifecycle");

for(const token of ["data-no-show","אי-הגעה"])assert.ok(appClient.includes(token),token+" missing from no-show UI");

for(const token of ["History-aware deletion","Advanced gmach tools","No-show","Inventory hold expired"])assert.ok(remainingClient.includes(token),token+" missing from English advanced workflow localization");

for(const token of ["data-counter-pickup",`$$("[data-counter-pickup]",d).forEach`])assert.ok(appClient.includes(token),token+" missing from corrected counter proposal binding");

for(const token of ["branchRating:branch","דירוג סניף 1-5"])assert.ok(finalClient.includes(token),token+" missing from branch review editing");

for(const token of ["My reviews","Smart matches","Community request offers"])assert.ok(remainingClient.includes(token),token+" missing from English review/community localization");


for(const token of ["recentlyViewedOrganizations","recordOrganizationView","recently_viewed_organizations"])assert.ok((worker+appClient).includes(token),token+" missing from recent gmach workflow");
for(const token of ["requestedFrom","requestedUntil","distanceKm","help-distance","help-until"])assert.ok((worker+appClient).includes(token),token+" missing from extended community request fields");
for(const token of ["preferredNavigation","preferred_navigation","navigation_preferences"])assert.ok((worker+platform+appClient+platformClient).includes(token),token+" missing from navigation preference persistence");
for(const token of ["TERMS_VERSION","PRIVACY_VERSION","legal_consents"])assert.ok(worker.includes(token),token+" missing from versioned legal consent history");
for(const token of ["organizationOnboarding","previewSeen","tipsDismissed","showOrganizationOnboarding","openOrganizationOnboardingPreview"])assert.ok((finalWorker+finalClient).includes(token),token+" missing from post-creation gmach onboarding");
for(const token of ["branch-proposal","data-branch-proposal","data-branch-response","toBranchName"])assert.ok((finalWorker+appClient).includes(token),token+" missing from alternate pickup branch workflow");
for(const token of ["editDistance","fuzzyQueryMatch"])assert.ok(appClient.includes(token),token+" missing from typo-tolerant search fallback");


for(const token of ["analyticsAcquisition","searchScore","openNearbyGmachs","account-start-nearby","/api/admin/analytics/export.csv"])assert.ok((appClient+worker).includes(token),token+" missing from discovery/analytics completion");
for(const token of ["source","referrer","page_path","adminAnalyticsCsv"])assert.ok(worker.includes(token),token+" missing from acquisition analytics backend");
for(const token of ["מקורות הגעה","אתרים מפנים","ייצוא נתוני שימוש CSV"])assert.ok((appClient+remainingClient).includes(token),token+" missing from analytics UI/localization");


for(const token of ["categoryAliases","loadCategoryAliases","dynamicAliases","synonyms_json"])assert.ok((appClient+worker).includes(token),token+" missing from synonym-powered search");
for(const token of ["pendingCommunityItem","data-create-help-item","קושר אוטומטית לבקשת הקהילה"])assert.ok((appClient+remainingClient).includes(token),token+" missing from create-and-link community item flow");
for(const token of ["data-board-share","?help=","sharedHelp"])assert.ok(appClient.includes(token),token+" missing from shareable community request flow");
assert.ok(finalWorker.includes("request:hr"),"community smart matches must return request context");


for(const token of ["orgOperationsCsv","operations-export","range:{from:rangeFrom","daily:daily.results","upcoming:upcoming.results","filters:{branches"])assert.ok(remainingWorker.includes(token),token+" missing from expanded manager reporting backend");
for(const token of ["ops-filters","מגמת בקשות","לוח פעולות קרובות","ייצוא פעולות מסוננות ל-CSV"])assert.ok(remainingClient.includes(token),token+" missing from expanded manager reporting UI");
for(const token of ["orgQuery","orgCity","orgCategory","minRating","orgAvailable","available_items"])assert.ok(worker.includes(token),token+" missing from advanced gmach discovery backend");
for(const token of ["advanced-gmach-search","openAdvancedGmachSearch","data-advanced-org","רק גמ״חים עם פריט זמין"])assert.ok(appClient.includes(token),token+" missing from advanced gmach search UI");
for(const token of ["openSupportForError","data-support-organization","dashboard-support-error"])assert.ok(appClient.includes(token),token+" missing from support-ready error handling");


for(const token of ["login_failed","recordSecurityFailure"])assert.ok(worker.includes(token),token+" missing from adaptive login security");
assert.ok(platform.includes("turnstileEnabled:false"),"the branded verification widget must be disabled");
assert.ok(worker.includes("enforceAuthRateLimit"),"login must keep server-side rate limiting");
assert.ok(appClient.includes('path==="/community"')||appClient.includes('location.pathname==="/community"'),"community board should have a clean direct route");
for(const token of ["events-stages","medical-ramps","community-projectors"])assert.ok(platform.includes(token),token+" missing from expanded category catalog");

for(const token of ["overlapping_requests","dateCompatible","requestedFrom:hr.requested_from","distanceKm:hr.distance_km"])assert.ok(finalWorker.includes(token),token+" missing from date-aware community matching");
assert.ok(platform.includes("2026-09-24"),"legal consent default version is not aligned");

for(const token of ["legalConsents","recentOrganizations","securityEvents","notificationPreferences","savedEntities","dataRequests"])assert.ok(platform.includes(token),token+" missing from comprehensive personal data export");

assert.ok(worker.includes("EXISTS (SELECT 1 FROM items vi WHERE vi.organization_id=o.id"),"public discovery must hide gmachs without active items");
for(const token of ["has_active_item","!r.has_active_item"])assert.ok(finalWorker.includes(token),token+" missing from organization SEO visibility guard");

for(const token of ["organization_status","organization_hidden","r.status!==\"approved\"","o.status='approved'"])assert.ok(finalWorker.includes(token),token+" missing from approved-only SEO visibility");

assert.ok(worker.includes("await ensureCompletePlatformSchema(env).catch"),"public gmach route must self-heal relation schema");

for(const token of ["זמינות חלקית","request-use-available","request-change-dates"])assert.ok((appClient+indexHtml).includes(token),token+" missing from partial availability choice UI");
assert.ok(worker.includes("turnaround_minutes||0"),"waitlist availability must respect turnaround time");


const expansionWorker=await readFile("worker/requirements-expansion.js","utf8");
const expansionClient=await readFile("dist/requirements-expansion.js","utf8");
const expansionMigration=await readFile("migrations/0019_requirements_expansion.sql","utf8");
for(const token of ["/multi-range-check","/multi-range-request","/api/me/reports","/full","/control","/api/admin/audit/export.csv","branches-public"]) assert.ok(expansionWorker.includes(token),token+" missing from requirements expansion backend");
for(const token of ["כמה טווחים","הדיווחים שלי","ניהול משתמשים מתקדם","כל הסניפים ונקודות האיסוף","data-loan-hold","data-user-schedule"]) assert.ok(expansionClient.includes(token),token+" missing from requirements expansion UI");
for(const token of ["admin_user_controls","admin_loan_holds","multi_range_batch_id"]) assert.ok(expansionMigration.includes(token),token+" missing from requirements expansion migration");
assert.ok(worker.includes("handleRequirementsExpansion"),"requirements expansion handler not wired");
assert.ok(worker.includes("requirementsExpansionPreflight"),"requirements expansion preflight not wired");
assert.ok(worker.includes("runRequirementsExpansionMaintenance"),"requirements expansion maintenance not wired");
assert.ok(indexHtml.includes("/requirements-expansion.js"),"requirements expansion client not loaded");
console.log("Requirements expansion static release gate passed.");


const launchWorker=await readFile("worker/launch-readiness.js","utf8");
const launchClient=await readFile("dist/launch-readiness.js","utf8");
const launchMigration=await readFile("migrations/0020_launch_readiness.sql","utf8");
for(const token of ["/api/admin/loan-requests","/timeline","/override","inventory-workspace","/api/admin/operations/health","runLaunchReadinessMaintenance"]) assert.ok(launchWorker.includes(token),token+" missing from launch readiness backend");
for(const token of ["מרכז ניהול השאלות","מדיניות מלאי לסניף","בריאות מערכת והפצה","data-loan-override","data-resolve-alert"]) assert.ok(launchClient.includes(token),token+" missing from launch readiness UI");
for(const token of ["operational_health_snapshots","system_alerts_type_open_idx"]) assert.ok(launchMigration.includes(token),token+" missing from launch readiness migration");
assert.ok(worker.includes("handleLaunchReadiness"),"launch readiness handler not wired");
assert.ok(worker.includes("runLaunchReadinessMaintenance"),"launch readiness maintenance not wired");
assert.ok(indexHtml.includes("/launch-readiness.js"),"launch readiness client not loaded");
console.log("Launch readiness static release gate passed.");

for(const token of ["moderateItemImage","@cf/moondream/moondream3.1-9B-A2B","moderationFindings","autoHidden"])assert.ok(worker.includes(token),token+" missing from automatic item image moderation");
for(const token of ["PAGE_LOAD","JS_ERROR","INP","ביצועים - 7 ימים","analytics.performance"])assert.ok(finalClient.includes(token),token+" missing from performance monitoring dashboard");
for(const token of ["moderation?.autoHidden","moderation?.reviewRequired"])assert.ok(appClient.includes(token),token+" missing from item image moderation upload feedback");
for(const token of ["moderateChatImage","validJpeg","validPng","validWebp","chat_image","reviewRequired"])assert.ok(platform.includes(token),token+" missing from chat image validation/moderation");
assert.ok(finalClient.includes("התמונה נשלחה לבדיקת תוכן נוספת לפני טיפול מנהל."),"chat moderation feedback missing");
assert.ok(finalWorker.includes('new Set(["LCP","CLS","INP","PAGE_LOAD","JS_ERROR"])'),"performance telemetry allowlist missing");


const distributionWorker=await readFile("worker/distribution-completion.js","utf8");
const distributionClient=await readFile("dist/distribution-completion.js","utf8");
const distributionMigration=await readFile("migrations/0021_distribution_completion.sql","utf8");
for(const token of ["/api/search/branches","/api/admin/support-tickets","/messages","/api/admin/server-errors","recordDistributionError","runDistributionCompletionMaintenance"]) assert.ok(distributionWorker.includes(token),token+" missing from distribution completion backend");
for(const token of ["חיפוש סניפים ונקודות איסוף","מרכז תמיכה","תקלות שרת","data-use-location","data-admin-ticket"]) assert.ok(distributionClient.includes(token),token+" missing from distribution completion UI");
for(const token of ["server_errors","priority","assigned_to","last_staff_reply_at"]) assert.ok(distributionMigration.includes(token),token+" missing from distribution completion migration");
assert.ok(worker.includes("handleDistributionCompletion"),"distribution completion handler not wired");
assert.ok(worker.includes("recordDistributionError"),"server error recording not wired");
assert.ok(indexHtml.includes("/distribution-completion.js"),"distribution completion client not loaded");
console.log("Distribution completion static release gate passed.");

for(const token of ["/api/admin/entities","patchAdminEntity","branchManagement"])assert.ok(launchWorker.includes(token),token+" missing from admin entity controls and branch editing");
for(const token of ["מרכז ישויות","openAdminEntities","openBranchEdit","dataset.branchEdit"])assert.ok(launchClient.includes(token),token+" missing from admin entity controls and branch editing UI");
for(const token of ["entities|support-tickets|server-errors"])assert.ok(platform.includes(token),token+" missing from sensitive admin step-up coverage");


const navigationWorker=await readFile("worker/navigation-admin.js","utf8");
const navigationClient=await readFile("dist/navigation-admin.js","utf8");
const navigationMigration=await readFile("migrations/0022_navigation_admin.sql","utf8");
for(const token of ["/api/navigation-links","/api/admin/navigation-links","navigation.create","navigation.update","navigation.delete"]) assert.ok(navigationWorker.includes(token),token+" missing from navigation admin backend");
for(const token of ["ניהול קישורים ותפריטים","applyPublicLinks","data-navigation-admin","#action:support"]) assert.ok(navigationClient.includes(token),token+" missing from navigation admin UI");
for(const token of ["navigation_links","footer_find","footer_share","footer_info"]) assert.ok(navigationMigration.includes(token),token+" missing from navigation migration");
assert.ok(worker.includes("handleNavigationAdmin"),"navigation admin handler not wired");
assert.ok(indexHtml.includes("/navigation-admin.js"),"navigation admin client not loaded");
console.log("Navigation admin static release gate passed.");


const privacyAvailabilityWorker=await readFile("worker/privacy-availability.js","utf8");
const privacyAvailabilityClient=await readFile("dist/privacy-availability.js","utf8");
const privacyAvailabilityMigration=await readFile("migrations/0023_privacy_availability.sql","utf8");
for(const token of ["/availability-rules","/api/admin/data-requests","checkAvailabilityRules","weekly_window","advance_limit"]) assert.ok(privacyAvailabilityWorker.includes(token),token+" missing from privacy/availability backend");
for(const token of ["ניהול זמינות מתקדם","בקשות פרטיות","data-privacy-save","data-rule-toggle"]) assert.ok(privacyAvailabilityClient.includes(token),token+" missing from privacy/availability UI");
for(const token of ["admin_note","assigned_to","due_at","availability_rules_scope_idx"]) assert.ok(privacyAvailabilityMigration.includes(token),token+" missing from privacy/availability migration");
assert.ok(worker.includes("handlePrivacyAvailability"),"privacy/availability handler not wired");
assert.ok(worker.includes("checkAvailabilityRules(env,itemId,from,until"),"availability rules not enforced for loan requests");
assert.ok(indexHtml.includes("/privacy-availability.js"),"privacy/availability client not loaded");
console.log("Privacy availability static release gate passed.");


const hardeningWorker=await readFile("worker/distribution-completion.js","utf8");
const hardeningClient=await readFile("dist/distribution-completion.js","utf8");
const productionDeploy=await readFile(".github/workflows/production-deploy.yml","utf8");
const wranglerConfig=await readFile("wrangler.jsonc","utf8");
for(const token of ["release-readiness","restore-drill","system_alert_deliveries","deliverOpenAlerts","performRestoreDrill","backup_stale","backup_not_separate"])assert.ok(hardeningWorker.includes(token),token+" missing from release hardening backend");
for(const token of ["מוכנות להפצה","Release readiness","data-run-restore-drill","data-test-alert"])assert.ok(hardeningClient.includes(token),token+" missing from release hardening UI");
assert.ok(productionDeploy.includes("Ensure dedicated backup R2 bucket"),"production deploy must provision backup bucket");
assert.ok(wranglerConfig.includes('"binding": "BACKUP_STORAGE"'),"dedicated backup R2 binding missing");
for(const backupFile of [".github/workflows/full-production-backup.yml",".github/workflows/verify-full-backup.yml",".github/scripts/gmach-full-backup.sh","BACKUP-RESTORE.md"]) await access(backupFile);
const fullBackupWorkflow=await readFile(".github/workflows/full-production-backup.yml","utf8");
const fullBackupScript=await readFile(".github/scripts/gmach-full-backup.sh","utf8");
assert.ok(fullBackupWorkflow.includes("schedule:")&&fullBackupWorkflow.includes("workflow_dispatch:"),"full backup workflow must be daily and manually runnable");
assert.ok(fullBackupScript.includes("CURRENT.json")&&fullBackupScript.includes("PREVIOUS.json"),"full backup must retain CURRENT and PREVIOUS pointers");
assert.ok(finalWorker.includes("/api/admin/backups/archive-status")&&finalWorker.includes("archiveBackupDownload"),"authenticated archive backup routes missing");
assert.ok(remainingWorker.includes("system_alerts")&&!remainingWorker.includes("INSERT INTO operational_alerts"),"backup failure alert must use system_alerts");
console.log("Release hardening static gate passed.");


const releaseExperience=await readFile("dist/release-experience.js","utf8");
for(const token of ["Loan terms and availability","My support requests","support-faq-suggestions","Branch map","data-branch-visual-map","/api/me/support-tickets","/api/faqs?lang="]) assert.ok(releaseExperience.includes(token),token+" missing from release experience");
for(const token of ["minLoanMinutes","bookingNoticeMinutes","turnaroundMinutes","depositAmountAgorot","recurringAllowed"]) assert.ok(worker.includes(token),token+" missing from public item policy payload");
assert.ok(indexHtml.includes("/release-experience.js"),"release experience client not loaded");
assert.ok(expansionClient.includes("שעות פעילות"),"branch hours missing from public branch UI");
assert.ok(expansionClient.includes("data-copy-branch"),"branch copy-address action missing");
console.log("Release experience static release gate passed.");

const adminControlCenter=await readFile("dist/admin-control-center.js","utf8");
for(const token of ["מרכז ניהול־על","/api/admin/site-settings","/api/admin/categories","/api/admin/category-suggestions","/api/admin/closures","/api/admin/holiday-rules","/api/admin/email-templates","/api/admin/moderation","/api/admin/security-events","/api/admin/users","/api/admin/content","/api/admin/loan-requests","/api/admin/support-tickets","/api/admin/audit"]) assert.ok(adminControlCenter.includes(token),token+" missing from admin control center");
assert.ok(!adminControlCenter.includes("data-merge-category"),"destructive category merge must not be exposed in super-admin UI");
for(const token of ["data-new-subcategory","data-delete-category","gmach:categories-changed","ניהול קטגוריות וקטגוריות משנה"])assert.ok(adminControlCenter.includes(token),token+" missing from hierarchical admin category management");
for(const token of ["deleteAdminCategory","category.delete","UPDATE items SET category=?","UPDATE items SET subcategory=NULL",'"/api/categories": { fresh:0, stale:86400 }'])assert.ok(worker.includes(token),token+" missing from live category propagation backend");
for(const token of ["state.categoryCatalog","itemSubcategoriesFor","populateItemCategorySelector","bindCategoryRailButtons","gmach:categories-changed","#gmach-category","#help-category"])assert.ok(appClient.includes(token),token+" missing from dynamic live category catalog");
assert.ok(appClient.includes("const selectedUnits=()=>$$('input[name=\"pickup-unit\"]:checked',d).map(x=>x.value);"),"pickup unit buttons must read all selected units");

assert.ok(indexHtml.includes("/admin-control-center.js"),"admin control center client not loaded");
for(const token of ["optionalReportQuery","sources:{items:items.length","/api/me/reports"]) assert.ok(expansionWorker.includes(token),token+" missing from resilient report tracking");
console.log("Admin control center static release gate passed.");



const privacyPurgeWorker=await readFile("worker/privacy-purge.js","utf8");
const privacyPurgeClient=await readFile("dist/privacy-purge.js","utf8");
const privacyPurgeMigration=await readFile("migrations/0024_privacy_purge.sql","utf8");
for(const token of ["privacy_purge_runs","privacy_retention_policies","purgeDeletedUser","applyRetention","/api/admin/privacy-retention","media_url=NULL"]) assert.ok(privacyPurgeWorker.includes(token),token+" missing from privacy purge backend");
for(const token of ["מחיקה, פרטיות ושמירת נתונים","Retention days","data-privacy-retention","Run purge and retention now"]) assert.ok(privacyPurgeClient.includes(token),token+" missing from privacy purge UI");
for(const token of ["privacy_purge_runs","privacy_retention_policies","security_events","analytics_events"]) assert.ok(privacyPurgeMigration.includes(token),token+" missing from privacy purge migration");
assert.ok(worker.includes("handlePrivacyPurge"),"privacy purge handler not wired");
assert.ok(worker.includes("runPrivacyPurgeMaintenance"),"privacy purge maintenance not wired");
assert.ok(worker.includes("blockedByOwnedOrganizations"),"account deletion ownership guard missing");
assert.ok(platform.includes("privacy-retention"),"privacy retention admin operations are not step-up protected");
assert.ok(indexHtml.includes("/privacy-purge.js"),"privacy purge client not loaded");
console.log("Privacy purge static release gate passed.");


const communityChatWorker=await readFile("worker/community-chat.js","utf8");
const communityChatMigration=await readFile("migrations/0025_community_chat_retention.sql","utf8");
for(const token of ["community_offer_messages","community_offer_message_reports","chat_retention_runs","help-offers","archiveOldChats","365 days"]) assert.ok(communityChatWorker.includes(token),token+" missing from community chat backend");
for(const token of ["community_offer_messages","community_offer_message_reports","chat_retention_runs"]) assert.ok(communityChatMigration.includes(token),token+" missing from community chat migration");
assert.ok(worker.includes("handleCommunityChat"),"community chat handler not wired");
assert.ok(worker.includes("runCommunityChatMaintenance"),"community chat maintenance not wired");
assert.ok(worker.includes("chatWritableUntil"),"exact loan chat write deadline missing");
assert.ok(appClient.includes("openCommunityOfferChat"),"community offer chat UI missing");
assert.ok(appClient.includes("chat-retention-note"),"loan chat retention notice missing");
assert.ok(finalClient.includes("קריאה בלבד"),"chat media readonly guard missing");
console.log("Community chat retention static release gate passed.");

const releaseShell=await readFile("dist/release-shell.js","utf8");
const swClient=await readFile("dist/sw.js","utf8");
const manifestText=await readFile("dist/manifest.webmanifest","utf8");
for(const token of ["beforeinstallprompt","serviceWorker.register","connection-status-banner","appinstalled"])assert.ok(releaseShell.includes(token),token+" missing from release shell");
for(const token of ["CACHE_NAME","caches.open","req.mode===\"navigate\"","notificationclick"])assert.ok(swClient.includes(token),token+" missing from service worker");
assert.ok(indexHtml.includes('rel="manifest"'),"web app manifest is not linked");
assert.ok(indexHtml.includes("/release-shell.js"),"release shell is not loaded");
assert.ok(indexHtml.includes("family=Assistant:wght@400;500;600;700;800&display=block"),"Assistant must be the first painted site font");
assert.ok(!indexHtml.includes('localStorage.getItem("gmach-site-settings-v1")'),"layout bootstrap must not live in blocked inline script");
const i18nBoot=await readFile("dist/i18n-boot.js","utf8");
assert.ok(i18nBoot.includes("scrollRestoration")&&i18nBoot.includes('gmach-site-settings-v1'),"early external layout bootstrap missing");
assert.ok(i18nBoot.includes("cache_version===3")&&i18nBoot.includes('--site-font","Assistant, Arial, sans-serif"'),"font boot must set Assistant safely before cached overrides");
assert.ok(appClient.includes("cache_version:3"),"live settings must refresh versioned font cache");
assert.ok(appClient.includes('לא הצלחנו לאשר את ההחזרה')&&appClient.includes('setButtonBusy(button,true,"מאשרים…")'),"return confirmation must handle errors and double submits");
assert.ok(appClient.includes("formatDateTime(r.requested_from)")&&appClient.includes("STATUS_LABELS[r.status]"),"admin loan dates/status must be human formatted");
assert.ok(worker.includes("outboundNotificationsPaused")&&worker.includes("israelShabbatState(now).closed")&&worker.includes("israelHolidayState(now).closed"),"outbound notifications must pause during Shabbat and holidays");
assert.ok(worker.includes('url.pathname === "/gmach-berega-logo.jpg"'),"closure landing logo must remain available while site is closed");

assert.ok(worker.includes("post-return follower notification failed")&&worker.includes("post-status waitlist advance failed"),"return completion must survive noncritical side-effect failures");

assert.ok(indexHtml.includes('/app.js?v='),"app cache-busting version missing");
assert.ok(!/(?:src|href)="\.\//.test(indexHtml),"route pages must use root-relative static assets");
assert.ok(appClient.includes("$('[data-org-item]'")&&appClient.includes("$('[data-review-item]'")&&appClient.includes("$('[data-review-helpful]'"),"public gmach listeners must use querySelectorAll helper");
assert.ok(appClient.includes('else if(path.startsWith("/gmach/"))')&&appClient.includes('await openOrganization(decodeURIComponent(path.slice(7)))'),"direct gmach refresh must hydrate the requested gmach route");
assert.ok(!indexHtml.includes('id="app-boot-guard"'),"full-page boot loader must stay disabled");
assert.ok(!indexHtml.includes('class="app-booting site-copy-pending"'),"boot-hiding classes must stay disabled");
const motionCss=await readFile("dist/motion.css","utf8");
assert.ok(motionCss.includes("Instant hero: no startup fade or design flash"),"instant hero override missing");
assert.ok(swClient.includes('CACHE_NAME="gmach-shell-v6"'),"service worker cache version not updated");
assert.ok(swClient.includes('/\\.(?:js|css)$/i.test(url.pathname)')||swClient.includes('js|css'),"runtime assets are not network-first");
assert.equal(JSON.parse(manifestText).display,"standalone");
assert.ok((await readFile("worker/launch-readiness.js","utf8")).includes("/api/admin/export.csv"),"admin CSV export route missing");
assert.ok((await readFile("dist/admin-control-center.js","utf8")).includes("ייצוא נתונים"),"admin export UI missing");

for(const token of ["scan-unit-qr","BarcodeDetector","getUserMedia","unit-qr-manual"])assert.ok(appClient.includes(token),token+" missing from camera QR scanner");
for(const token of ["/dashboard?unit=","/api/item-units/by-serial/","openManagedUnitFromQr","data-unit-serial"])assert.ok((platform+appClient).includes(token),token+" missing from direct QR-to-manager flow");
for(const token of ['application/ld+json','SearchAction','og:site_name','twitter:card'])assert.ok(indexHtml.includes(token),token+" missing from structured SEO metadata");
assert.ok(indexHtml.includes('class="skip-link"'),"global skip link missing");
console.log("QR scanning, structured SEO and accessibility shell gate passed.");

assert.ok((await readFile("worker/launch-readiness.js","utf8")).includes("/api/admin/export.xls"),"Excel-compatible admin export route missing");
assert.ok((await readFile("worker/launch-readiness.js","utf8")).includes("application/vnd.ms-excel"),"Excel export content type missing");
assert.ok((await readFile("dist/admin-control-center.js","utf8")).includes("ייצוא Excel"),"Excel export UI missing");
assert.ok(appClient.includes("unit-qr-image"),"QR image scanner fallback missing");
console.log("Excel export and QR image scanner gate passed.");

assert.ok(finalClient.includes("MediaRecorder"),"in-browser voice message recording missing");
assert.ok(finalClient.includes("voice-message.webm"),"voice message upload missing");
console.log("Voice message recording gate passed.");

const adminControlCenterLatest=await readFile("dist/admin-control-center.js","utf8");
for(const token of ["/api/admin/export.xls?type=","ייצוא Excel","aria-live","polite"])assert.ok(adminControlCenterLatest.includes(token),token+" missing from Excel/accessibility admin completion");
for(const token of ["unit-qr-image","createImageBitmap(file)","capture="])assert.ok(appClient.includes(token),token+" missing from QR image scanning");
assert.ok((await readFile("worker/launch-readiness.js","utf8")).includes("/api/admin/export.xls"),"Excel-compatible export backend missing");
console.log("Excel export, accessible admin status and QR image scanning gate passed.");


// Full-list completion regressions added after line-by-line acceptance review.
for(const token of ["uploadRequestChatAttachment","reportRequestMessage","blockChatUser","/chat-attachment","/chat-rich","/report","/block"]) assert.ok(worker.includes(token),token+" missing from complete loan chat runtime");
for(const token of ["data-chat-media=\"location\"","voice-message.webm","data-chat-media=\"item\""]) assert.ok(finalClient.includes(token),token+" missing from rich chat controls");
for(const token of ["dataset.requestId","data-open-chat-item","chat-media-image"]) assert.ok(appClient.includes(token),token+" missing from rich chat rendering/binding");
for(const token of ["deliverNotificationChannels","sendEmptyWebPush","vapidJwt","deliverDailyDigests","inQuietHours","communityUnsubscribeToken","/api/unsubscribe/community"]) assert.ok(worker.includes(token),token+" missing from real notification delivery runtime");
const qaWorkflow=await readFile(".github/workflows/qa.yml","utf8"),prodWorkflow=await readFile(".github/workflows/production-deploy.yml","utf8");
for(const token of ["Provision isolated QA resources","gmach-karov-db-qa","gmach-karov-images-qa","Moderate QA load test"]) assert.ok(qaWorkflow.includes(token),token+" missing from isolated QA gate");
assert.ok(prodWorkflow.includes("Read-only production load gate"),"real production load gate missing");
await access("test/production-load.mjs");
await access("migrations/0026_notification_delivery_runtime.sql");
await access("migrations/0027_notification_templates.sql");
console.log("Full requirements regression extensions passed.");


/* End-to-end wiring invariants: client actions must have matching server routes. */
for (const token of [
  '/api/push-subscriptions',
  '/chat-attachment',
  '/chat-rich',
  '/report',
  '/block'
]) assert.ok((appClient+finalClient+platformClient).includes(token), token+" missing from client wiring");
for (const token of [
  'path==="/api/push-subscriptions"',
  '/chat-attachment$/',
  '/chat-rich$/',
  '/report$/',
  '/block$/'
]) assert.ok((worker+platform).includes(token), token+" missing from server wiring");
assert.ok(!finalClient.includes('/api/me/push-subscriptions'),"stale Web Push endpoint must not remain in client");
assert.ok(appClient.includes("function openComparison"),"comparison client must expose a complete comparison dialog");
assert.ok(appClient.includes("navigator.share"),"native share with clipboard fallback is missing");
assert.ok(platform.includes('path==="/api/compare"'),"comparison backend route is missing");
assert.ok(worker.includes('/api/unsubscribe/community'),"community email unsubscribe route is missing");
for (const token of ['messageType:"location"','uploadRequestChatAttachment','reportRequestMessage','blockChatUser']) assert.ok(worker.includes(token),token+" missing from request chat backend");


/* Acceptance coverage for account/privacy and advanced user workflows. */
for (const token of [
  "/api/me/sessions","/api/me/addresses","/api/me/account/request-deletion","/api/me/account/cancel-deletion",
  "/api/me/organization-transfers","/api/me/notification-preferences","/api/me/export","/api/me/data-request"
]) assert.ok((appClient+platformClient).includes(token),token+" missing from account UI");
for (const token of [
  "/api/me/sessions","/api/me/addresses","/api/me/account/request-deletion","/api/me/account/cancel-deletion",
  "/api/me/organization-transfers","/api/me/notification-preferences"
]) assert.ok((worker+platform).includes(token),token+" missing from account backend");

// Regression: catalog availability must only subtract inventory that overlaps now.
const catalogWorker = await readFile(new URL("../worker/index.js", import.meta.url), "utf8");
assert.ok(catalogWorker.includes("lq.requested_from <= strftime('%Y-%m-%dT%H:%M','now')"),"catalog minimum quantity must use overlapping loans");
assert.ok(catalogWorker.includes("ib.starts_at <= strftime('%Y-%m-%dT%H:%M','now')"),"catalog availability must subtract overlapping inventory blocks");

// Regression: bulk inventory/import UI routes must have backend handlers.
assert.ok(worker.includes("bulkInventoryAction"),"bulk inventory backend missing");
assert.ok(worker.includes('path==="/api/items/import"'),"item import backend missing");
assert.ok(worker.includes("bulk_inventory_jobs"),"bulk inventory audit/job record missing");

for(const token of ["openItemImageEditor","data-images-item","/image-edits","blurRegions","rotation"])assert.ok(appClient.includes(token),token+" missing from product image editor UI");

const adminControlClient=await readFile("dist/admin-control-center.js","utf8");
assert.ok(adminControlClient.includes('["backups",t("גיבויים","Backups")]'),"backup admin tab missing");
assert.ok(adminControlClient.includes("full-production-backup.yml"),"manual full-backup workflow control missing");
assert.ok(adminControlClient.includes("CURRENT — "),"CURRENT backup slot missing");
assert.ok(adminControlClient.includes("PREVIOUS — "),"PREVIOUS backup slot missing");
assert.ok(adminControlClient.includes("/api/admin/backups/archive/"),"backup download route missing from UI");
assert.ok(appClient.includes("refreshUser(hydrate=true)"),"lightweight auth bootstrap missing");

const emailWorkerSource=await readFile("worker/index.js","utf8");
assert.ok(emailWorkerSource.includes('גמ״ח ברגע <no-reply@gmach-berega.co.il>'),"verified no-reply sender fallback missing");
assert.ok(!/reply_to\s*:/.test(emailWorkerSource),"personal support email must never be exposed as Reply-To");
assert.ok(!emailWorkerSource.includes("netanelhirsh@gmail.com"),"personal email must not be hardcoded in the worker");

const emailDesignerMigration=await readFile("migrations/0031_email_template_designer.sql","utf8");
assert.ok(emailDesignerMigration.includes("design_json"),"email designer migration missing");
assert.ok(emailDesignerMigration.includes("verification")&&emailDesignerMigration.includes("password_reset")&&emailDesignerMigration.includes("manager_invite"),"core managed email templates missing");
assert.ok(adminControlCenter.includes("עורך ועיצוב מיילים"),"email designer UI missing");
assert.ok(adminControlCenter.includes("email-preview"),"email live preview missing");
assert.ok(adminControlCenter.includes("primaryColor")&&adminControlCenter.includes("buttonColor")&&adminControlCenter.includes("logoUrl"),"email design controls missing");
assert.ok(worker.includes("managedEmailTemplate"),"managed email renderer missing");
assert.ok(worker.includes('"verification"')&&worker.includes('"password_reset"')&&worker.includes('"manager_invite"'),"auth and invitation emails are not template-managed");

assert.ok(indexHtml.includes('id="gmach-hours-by-appointment"'),"gmach by-appointment hours option missing");
assert.ok(indexHtml.includes('id="gmach-suggest-category-button"'),"gmach category suggestion missing");
assert.ok(indexHtml.includes('id="item-subcategory" disabled'),"fixed item subcategory selector missing");
assert.ok(indexHtml.includes('id="item-free" type="checkbox" required')&&!indexHtml.includes('id="item-free" type="checkbox" checked required'),"free-loan confirmation must start unchecked");
assert.ok(appClient.includes("updateItemSubcategories"),"subcategory dependency logic missing");
assert.ok(indexHtml.includes('id="subcategory-filter"'),"catalog subcategory filter missing");
assert.ok(!appClient.includes("ITEM_SUBCATEGORIES"),"site must not fall back to hardcoded subcategories");
assert.ok(appClient.includes("state.categoryCatalog")&&appClient.includes("/api/categories"),"live category catalog must drive site-wide category UI");
assert.ok(adminControlCenter.includes("ניהול קטגוריות וקטגוריות משנה")&&adminControlCenter.includes("data-new-subcategory")&&adminControlCenter.includes("data-delete-category"),"super-admin category CRUD UI missing");

for(const token of ["updateCatalogSubcategories","!subcategory || item.subcategory === subcategory","item.subcategory?","subcategory:$(\"#subcategory-filter\")?.value"])assert.ok(appClient.includes(token),token+" missing from category/subcategory separation UI");
assert.ok(worker.includes("matchesSubcategory=!f.subcategory"),"saved-search subcategory separation missing");
assert.ok(appClient.includes("function ratingStars(")&&appClient.includes('size:"review-primary"')&&appClient.includes('size:"item-large"')&&appClient.includes("rating-star"),"five-star rating UI missing");
assert.ok(appClient.includes("item-rating-hero")&&!appClient.includes('<span>דירוג הפריט</span>'),"item detail rating must be prominent and unlabeled");
assert.ok(appClient.includes('label:"גמ״ח",size:"gmach-hero"'),"gmach hero rating must be prominent");
assert.ok(appClient.includes('organization-card-rating')&&appClient.includes('size:"gmach-card-top"'),"nationwide gmach cards must show prominent star ratings at the top");
assert.ok(appClient.includes("if(!shellReady) toast"),"boot error toast must only appear when the visible shell is unavailable");

assert.ok(worker.includes("nextQuantity=currentQuantity+count"),"unit creation must increase item quantity");
assert.ok(worker.includes("Math.max(150,Number(nextOrgCode?.max_code||149)+1)"),"gmach serial numbering must start at 150");
assert.ok(worker.includes("יש להקצות בדיוק את היחידות הסידוריות שנמסרות לפני אישור האיסוף"),"serialized pickup must require exact unit allocation");
assert.ok(worker.includes('["declined","cancelled","no_show"].includes(target)')&&worker.includes("UPDATE loan_unit_assignments SET returned_at=? WHERE request_id=? AND returned_at IS NULL"),"approved loans ending without pickup must release allocated units");
assert.ok(appClient.includes("function requestProgress")&&appClient.includes("data-confirm-collected")&&appClient.includes("אישור איסוף")&&appClient.includes("אישור שהמשתמש החזיר"),"loan lifecycle progress and separate manager confirmations missing");
assert.ok(appClient.includes("const selectedUnits=()=>$$("),"pickup unit selection must use collection selector");
assert.ok(!/const selectedUnits=\(\)=>\$\((?!\$)/.test(appClient),"pickup unit selection must not use single-element selector");
assert.ok(worker.includes("item_serial_codes_v2"),"item serial codes must be scoped per gmach");

assert.ok(appClient.includes('$$("[data-open-account-tab]",$("#dashboard-content")).forEach'),"saved dashboard selector regression");
assert.ok(worker.includes("function fixedSubcategory(value)")&&worker.includes("return cleanOptional(value,80)"),"subcategory sanitization missing");
assert.ok(worker.includes('body.freeConfirmed!==true'),"server-side free confirmation missing");
assert.ok(worker.includes('if(!Object.values(parsed).some(entry=>String(entry||"").trim().length>=3))return "{}"'),"empty gmach hours must be allowed");
assert.ok(indexHtml.includes('name="auth-account-intent" value="owner"'),"owner registration intent missing");

assert.ok(appClient.includes("GmachLastIncidentNumber")&&appClient.includes("/api/client-errors"),"client incident references must be recorded");
assert.ok(appClient.includes("מספר תקלה:")&&worker.includes("incidentNumber()"),"system errors must expose traceable incident numbers");
assert.ok(appClient.includes("window.GmachToast=toast"),"global toast channel missing");
assert.ok(indexHtml.includes("toast-region"),"toast region missing");

assert.equal((appClient.match(/data-no-show=/g)||[]).length,1,"approved request should render exactly one no-show action");
assert.ok(appClient.includes("openPickupScreen(button.dataset.pickupRequest)"),"pickup screen button must be wired");
assert.ok(appClient.includes('updateRequestStatus(button.dataset.noShow,"no_show")'),"no-show button must be wired");
assert.ok(worker.includes("async function manageLoanUnits("),"pickup unit endpoint implementation missing");
assert.ok(appClient.includes('encodeURIComponent(requestId)+"/status"')&&appClient.includes('status:"returned"'),"return confirmation must use status endpoint");
assert.ok(indexHtml.includes("family=Assistant:wght@400;500;600;700;800&display=block")&&!indexHtml.includes('class="site-font-loading"')&&!indexHtml.includes("site-font-loading body{visibility:hidden}"),"Assistant must load first without hiding the whole page");
assert.ok(appClient.includes("cache_version:3")&&i18nBoot.includes("s.cache_version===3"),"site settings font cache must use current version");
assert.ok(await access("migrations/0019_normalize_site_font.sql").then(()=>true),"font normalization migration missing");
assert.ok(worker.includes('storedStatus=target==="no_show"?"cancelled":target'),"no-show must respect loan_requests status constraint");

assert.ok(worker.includes("if(active.length<desired)")&&worker.includes("else if(active.length>desired)"),"serial units must stay synchronized with item quantity");
assert.ok(worker.includes("reconcileSerializedQuantity"),"legacy serialized inventory must reconcile to canonical quantity");
assert.ok(worker.includes("tracked_count")&&worker.includes("usable_tracked"),"availability must account for fully serialized units that are inactive or under repair");
assert.ok(worker.includes("Number(existingUnits?.count||0)>quantity")&&worker.includes("Number(existingUnits.count)-quantity>Number(removable?.count||0)"),"item quantity reduction must protect assigned or unavailable serial units");

assert.ok(worker.includes("CREATE TABLE IF NOT EXISTS organization_serial_codes")&&worker.includes("CREATE TABLE IF NOT EXISTS item_serial_codes"),"serial identity tables must self-heal at runtime");

assert.ok(indexHtml.includes("route-dashboard-boot")&&indexHtml.includes("טוענים את האזור שלי")&&appClient.includes('classList.remove("route-dashboard-boot")'),"dashboard boot stability shell missing");
assert.ok(appClient.includes("categoryRailPresentation")&&appClient.includes('rail.classList.add("carousel-ready")')&&appClient.includes("window.GmachResetCategoryCarousel=start")&&appClient.includes("Category carousel continuous autoplay v3"),"category carousel visuals and autoplay must both be present");
assert.ok(!appClient.includes('setAuthMode("login"); updateAuthUI();'),"startup must not flash logged-out auth UI before /auth/me resolves");
assert.ok(indexHtml.includes('id="notifications-button"')&&indexHtml.includes('style="visibility:visible"'),"notification slot must remain reserved during auth hydration without a layout shift");
assert.ok(appClient.includes('window.scrollTo({ top: 0, behavior: "auto" })'),"dashboard must not smooth-scroll during startup");

assert.ok(appClient.includes("navigateHomeSection")&&appClient.includes('a[href="/catalog"],a[href="/how-it-works"],a[href="/gmachim"]'),"top navigation must route in-place without a page-top jump");

assert.ok(appClient.includes("data-confirm-collected")&&appClient.includes("שמירת הקצאת יחידות"),"pickup confirmation must stay separate from unit assignment");

assert.ok(appClient.includes('confirmCollected)+"/status"'),"separate pickup confirmation must call the status endpoint");

assert.ok(!indexHtml.includes("site-font-loading body{visibility:hidden}"),"body must never be hidden waiting for a font");
assert.ok(!indexHtml.includes("<script>\n(()=>{const root=document.documentElement,done="),"CSP-blocked inline font boot must not return");

assert.ok(remainingClient.includes("data-osm-tiles")&&remainingClient.includes('img.src="/api/maps/tiles/"'),"map base must use same-origin proxied OpenStreetMap tiles");

assert.ok(css.includes("Keep the English desktop links visible")&&css.includes("padding-inline-start:28px"),"English desktop nav must stay visible with spacing before My account");

assert.ok(remainingClient.includes('row.latitude!==null')&&remainingClient.includes('(storedLat!==0||storedLon!==0)'),"map must not treat null coordinates as 0,0");
assert.ok(remainingClient.includes('pointer-events:none;z-index:3'),"gmach marker layer must stay above the map frame");

assert.ok(remainingClient.includes("attempt<4")&&remainingClient.includes("city!==full")&&remainingClient.includes("await sleep(1250)"),"gmach map geocoding must retry throttled requests and fall back to city");

assert.ok(remainingClient.includes("screenX=wp.x-left")&&remainingClient.includes("screenY=wp.y-top"),"gmach markers must be positioned from Web Mercator coordinates on every render");

assert.ok(adminControlCenter.includes("admin-control-entry"),"super-admin control center entry must use dedicated high-contrast styling");
assert.ok(worker.includes("specificRow")&&worker.includes("Number(specificRow.enabled)===0"),"disabled specific email templates must suppress operational email delivery without generic fallback");
assert.ok(platform.includes("suppressed: email template disabled")&&platform.includes("suppressed: email preference disabled"),"legacy notification queue must re-check email switches at send time");
assert.ok(appClient.includes("subtitleEn")&&appClient.includes("Everything available")&&appClient.includes("categoryDisplayName"),"English category carousel and dynamic category options must render in English");

assert.ok(css.includes("#dashboard-view .admin-control-entry")&&css.includes("color:#fff!important"),"super-admin control-center entry must be visible");
assert.ok(worker.includes("operationalTemplateKey")&&worker.includes('emailTemplateState(env,specific,lang)'),"operational emails must honor the matching admin template toggle");
assert.ok(adminControlCenter.includes("read-back verification")||adminControlCenter.includes("אימות הקריאה החוזרת"),"admin email template saves must be verified by read-back");

assert.ok(appClient.includes('formatDateTime(row.requested_from))} — ${escapeHTML(formatDateTime(row.requested_until))'),"user loan cards must display localized date/time instead of raw ISO timestamps");
assert.ok(finalWorker.includes('path==="/api/admin/loan-requests"')&&finalWorker.includes('launch-readiness layer'),"admin loan routes must bypass unrelated final-schema bootstrap");
