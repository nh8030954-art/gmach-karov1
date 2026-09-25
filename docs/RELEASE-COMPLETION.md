# Full release completion

This branch is the single integration branch for all remaining production requirements.

## Release gate
A feature is not considered complete merely because a table or endpoint exists. It must have: database schema, server authorization/validation, usable UI where applicable, automated tests, and production-safe failure handling.

## Workstreams
- [ ] Accounts: consent versions, device/session security UI, deletion grace/recovery, language.
- [ ] Inventory: per-unit stock, holds, branch transfers, availability calendar, extensions, FIFO waitlist, QR lifecycle.
- [ ] Organizations: branches, scoped roles, invitations, ownership transfer, temporary closure/deletion safety.
- [ ] Discovery: geocoding/distance/radius, categories/suggestions, saved searches, SEO routes.
- [ ] Chat: attachments, audio/location/item/help cards, read state, deletion, block/report safety.
- [ ] Notifications: in-app/email/push preferences, quiet hours, digest, delivery log.
- [ ] Support/admin: ticket lifecycle, CMS/settings, reports, deletion queue, system alerts.
- [ ] Operations: scheduled jobs, backup manifests/restore drill, monitoring, rollback/QA gate.
- [ ] Security: Turnstile/bot protection, rate limits, CSP/headers, admin protections, abuse tests.
- [ ] Accessibility/i18n: keyboard/focus/ARIA/reduced-motion, Hebrew/English UI, RTL/LTR.
- [ ] Verification: syntax, migrations, smoke, E2E, concurrency, load/security checks, live health.

Production must not be merged until the automated release gate is green and remaining external-only audits are explicitly recorded.