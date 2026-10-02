# Phase 4 Stages 4–5 — Website Governance Implementation

## Verdict

`IMPLEMENTED` — seven Stitch screens delivered on existing Phase 3 submission/approval/version services (no parallel system).

## Stitch screens (1–7)

1. `Phase4 - Website Change Requests` → `phase4-website-change-requests.ejs` (+ mobile cards)
2. `Phase4 - Review Website Update` → `phase4-review-website-update.ejs`
3. `Phase4 - Advanced Website Management` → `phase4-advanced-website-management.ejs`
4. `Phase4 - Website Change Requests - Mobile` → same list template (`data-bb-phase4-wcrq-mobile`)
5. `Phase4 - Network Approval Settings` → `phase4-network-approval-settings.ejs`
6. `Phase4 - Network Website Version History` → `phase4-network-website-version-history.ejs`
7. `Phase4 - Submit Branch Website Update - Mobile` → `phase4-submit-branch-website-update.ejs`

## Route map

| Route | Role |
| --- | --- |
| `GET /hq/website/change-submissions` | Change requests list (Phase4 view) |
| `GET /hq/website/change-requests` | Alias → change-submissions |
| `GET/POST /hq/website/change-submissions/:id…` | Review / approve / request-changes / reject |
| `POST /hq/website/change-requests/:id/{approve,request-changes,reject}` | Phase4 aliases |
| `GET /hq/website/advanced` | Advanced Website Management hub |
| `GET/POST /hq/website/approval-settings` | Network approval settings (Phase4 view) |
| `GET/POST /hq/website/network-approval-settings` | Preferred Network path |
| `GET /hq/website/version-history` | Network version history (Phase4 view) |
| `GET /hq/website/network-version-history` | Preferred Network path |
| `GET /branch-admin/website/submit` | Branch submit (Phase4 mobile-first view) |

## Migration

`db/migrations/blessboard/046_website_network_approval_restore.sql`

- `require_restore_approval`
- `hq_direct_publish_enabled` (default true)

## Services / repositories

- Reused: `websiteChangeSubmissionService`, `websiteApprovalSettingsService`, publication version services/repos, publish validation
- Added: `websiteAdvancedManagementService.js`
- Extended: approval settings repo/service; restore note enforcement; `draft_only` blocks branch submit; HQ direct-publish gate in publication validation

## Authorization

HQ (`church_hq_admin` / `platform_admin`) for review, settings, history, advanced hub. Branch admin for own-branch submit/track only. Org-scoped lookups; CSRF on POSTs; cross-tenant → 404.

## Request lifecycle

Unchanged DB statuses: `draft` → `pending_review` → `approved` / `changes_requested` / `rejected` → `published` via normal publish (approve does **not** publish).

## Approval settings

Persisted: branch edit mode, content types, self-approval, comment/reason rules, preview rules, restore approval, HQ direct publish, notification prefs (delivery still unavailable). Decorative Stitch controls (geofence, audit retention, multi-signature) shown **disabled** with “Not available yet”. Trusted branch publish remains inactive.

## Version history reuse

Same `loadVersionHistory` / preview / restore routes; Phase4 Network chrome. Restore still creates draft + history (no history deletion).

## Tests

| Suite | Result |
| --- | --- |
| `phase4-website-governance-stages4-5.test.js` | 13 pass |
| `phase3-website-change-submissions` | pass |
| `phase3-website-approval-settings` | pass |
| `phase3-branch-website-submissions` | pass |
| `phase3-website-version-history` | pass |
| **Batch** | **54 pass / 0 fail** |

## Visual parity

Matched Stitch hierarchy for titles, summary cards, filters, mobile cards, review compare tabs, advanced hub tiles, network settings sections, network history table, branch submit steps/safety copy. Unsupported Stitch controls are explicitly disabled.

## Deferred / gaps

- **Intentionally deferred:** Network selective restore, multi-signature, change freezing, geofenced media, audit retention UI, notification delivery, approve-and-publish-now content apply
- **Product:** Trusted branch direct publish remains inactive by design
- **Stitch:** “Approve & Publish” shown disabled; Approve → publish review remains separate

## Changed files (primary)

- Views: `phase4-website-change-requests.ejs`, `phase4-review-website-update.ejs`, `phase4-advanced-website-management.ejs`, `phase4-network-approval-settings.ejs`, `phase4-network-website-version-history.ejs`, `phase4-submit-branch-website-update.ejs`; branch detail success panel
- Routes: change submission admin/branch, workflow batch C, publication version admin
- Services/repos: advanced hub, approval settings, change submission, publication validation, version restore note
- Migration `046_…`, CSS (`hq-admin.css?v=67`, `branch-admin.css?v=41`), tests + this report
