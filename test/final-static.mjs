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
assert.match(worker,/complete-platform-2026-09-27\.10/);
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
for(const token of ["request-partial-options","request-partial-waitlist","joinCurrentRequestWaitlist","openHelpOffers","data-select-offer","data-remove-waitlist","calendar.ics"])assert.ok((appClient+indexHtml).includes(token),token+" missing from waitlist/community/calendar UI");
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

assert.ok(platform.includes("/api/me/organization-transfers"),"ownership transfer listing route missing");

assert.ok(worker.includes("requestAccountDeletion"),"account deletion request endpoint missing");

for(const token of ["saved-entity-form","recurring-loan-form","data-waitlist-accept","data-waitlist-decline"])assert.ok(finalClient.includes(token),token+" missing from saved/recurring/waitlist UI");

for(const token of ["myWaitlistOffers","/api/me/waitlist-offers","const expiredOffers="])assert.ok(finalWorker.includes(token),token+" missing from actionable waitlist lifecycle");

for(const token of ["openHelpMatches","data-help-matches","data-offer-match"])assert.ok(appClient.includes(token),token+" missing from community matching UI");

assert.ok(appClient.includes("data-counter-pickup"),"pickup counter proposal UI missing");

for(const token of ["maps.apple.com","data-copy-map-address","navigator.geolocation","/api/maps/geocode"])assert.ok(remainingClient.includes(token),token+" missing from completed map/navigation UI");

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
assert.ok(platform.includes("turnstileRequired:true"),"repeated suspicious login attempts should require Turnstile");
assert.ok(platformClient.includes("requireLogin"),"the UI should render a login Turnstile only when required");
assert.ok(appClient.includes('location.hash === "#/community"'),"community board should have a direct route");
for(const token of ["events-stages","medical-ramps","community-projectors"])assert.ok(platform.includes(token),token+" missing from expanded category catalog");

for(const token of ["overlapping_requests","dateCompatible","requestedFrom:hr.requested_from","distanceKm:hr.distance_km"])assert.ok(finalWorker.includes(token),token+" missing from date-aware community matching");
assert.ok(platform.includes("2026-09-24"),"legal consent default version is not aligned");

for(const token of ["legalConsents","recentOrganizations","securityEvents","notificationPreferences","savedEntities","dataRequests"])assert.ok(platform.includes(token),token+" missing from comprehensive personal data export");

assert.ok(worker.includes("EXISTS (SELECT 1 FROM items vi WHERE vi.organization_id=o.id"),"public discovery must hide gmachs without active items");
for(const token of ["has_active_item","!r.has_active_item"])assert.ok(finalWorker.includes(token),token+" missing from organization SEO visibility guard");

for(const token of ["organization_status","organization_hidden","r.status!==\"approved\"","o.status='approved'"])assert.ok(finalWorker.includes(token),token+" missing from approved-only SEO visibility");

assert.ok(worker.includes("Promise.all([ensureCompletePlatformSchema(env),ensureFinalFeaturesSchema(env)])"),"public gmach route must self-heal relation schema");

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
assert.ok(indexHtml.includes("./requirements-expansion.js"),"requirements expansion client not loaded");
console.log("Requirements expansion static release gate passed.");


const launchWorker=await readFile("worker/launch-readiness.js","utf8");
const launchClient=await readFile("dist/launch-readiness.js","utf8");
const launchMigration=await readFile("migrations/0020_launch_readiness.sql","utf8");
for(const token of ["/api/admin/loan-requests","/timeline","/override","inventory-workspace","/api/admin/operations/health","runLaunchReadinessMaintenance"]) assert.ok(launchWorker.includes(token),token+" missing from launch readiness backend");
for(const token of ["מרכז ניהול השאלות","מדיניות מלאי לסניף","בריאות מערכת והפצה","data-loan-override","data-resolve-alert"]) assert.ok(launchClient.includes(token),token+" missing from launch readiness UI");
for(const token of ["operational_health_snapshots","system_alerts_type_open_idx"]) assert.ok(launchMigration.includes(token),token+" missing from launch readiness migration");
assert.ok(worker.includes("handleLaunchReadiness"),"launch readiness handler not wired");
assert.ok(worker.includes("runLaunchReadinessMaintenance"),"launch readiness maintenance not wired");
assert.ok(indexHtml.includes("./launch-readiness.js"),"launch readiness client not loaded");
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
assert.ok(indexHtml.includes("./distribution-completion.js"),"distribution completion client not loaded");
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
assert.ok(indexHtml.includes("./navigation-admin.js"),"navigation admin client not loaded");
console.log("Navigation admin static release gate passed.");


const privacyAvailabilityWorker=await readFile("worker/privacy-availability.js","utf8");
const privacyAvailabilityClient=await readFile("dist/privacy-availability.js","utf8");
const privacyAvailabilityMigration=await readFile("migrations/0023_privacy_availability.sql","utf8");
for(const token of ["/availability-rules","/api/admin/data-requests","checkAvailabilityRules","weekly_window","advance_limit"]) assert.ok(privacyAvailabilityWorker.includes(token),token+" missing from privacy/availability backend");
for(const token of ["ניהול זמינות מתקדם","בקשות פרטיות","data-privacy-save","data-rule-toggle"]) assert.ok(privacyAvailabilityClient.includes(token),token+" missing from privacy/availability UI");
for(const token of ["admin_note","assigned_to","due_at","availability_rules_scope_idx"]) assert.ok(privacyAvailabilityMigration.includes(token),token+" missing from privacy/availability migration");
assert.ok(worker.includes("handlePrivacyAvailability"),"privacy/availability handler not wired");
assert.ok(worker.includes("checkAvailabilityRules(env,itemId,from,until"),"availability rules not enforced for loan requests");
assert.ok(indexHtml.includes("./privacy-availability.js"),"privacy/availability client not loaded");
console.log("Privacy availability static release gate passed.");


const hardeningWorker=await readFile("worker/distribution-completion.js","utf8");
const hardeningClient=await readFile("dist/distribution-completion.js","utf8");
const productionDeploy=await readFile(".github/workflows/production-deploy.yml","utf8");
const wranglerConfig=await readFile("wrangler.jsonc","utf8");
for(const token of ["release-readiness","restore-drill","system_alert_deliveries","deliverOpenAlerts","performRestoreDrill","backup_stale","backup_not_separate"])assert.ok(hardeningWorker.includes(token),token+" missing from release hardening backend");
for(const token of ["מוכנות להפצה","Release readiness","data-run-restore-drill","data-test-alert"])assert.ok(hardeningClient.includes(token),token+" missing from release hardening UI");
assert.ok(productionDeploy.includes("Ensure dedicated backup R2 bucket"),"production deploy must provision backup bucket");
assert.ok(wranglerConfig.includes('"binding": "BACKUP_STORAGE"'),"dedicated backup R2 binding missing");
assert.ok(remainingWorker.includes("system_alerts")&&!remainingWorker.includes("INSERT INTO operational_alerts"),"backup failure alert must use system_alerts");
console.log("Release hardening static gate passed.");


const releaseExperience=await readFile("dist/release-experience.js","utf8");
for(const token of ["Loan terms and availability","My support requests","support-faq-suggestions","Branch map","data-branch-visual-map","/api/me/support-tickets","/api/faqs?lang="]) assert.ok(releaseExperience.includes(token),token+" missing from release experience");
for(const token of ["minLoanMinutes","bookingNoticeMinutes","turnaroundMinutes","depositAmountAgorot","recurringAllowed"]) assert.ok(worker.includes(token),token+" missing from public item policy payload");
assert.ok(indexHtml.includes("./release-experience.js"),"release experience client not loaded");
assert.ok(expansionClient.includes("שעות פעילות"),"branch hours missing from public branch UI");
assert.ok(expansionClient.includes("data-copy-branch"),"branch copy-address action missing");
console.log("Release experience static release gate passed.");
