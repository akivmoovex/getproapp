# PHASE2_080 — Public website & announcement manual test readiness audit

**Date:** 2026-07-24  
**Scope:** BlessBoard V5 testing (`blessboard.org` / Hostinger testing) — audit of Prompts **076–079** only  
**Constraint:** Fix only clear defects inside 076–079; no V4 changes

## Verdict

**READY_WITH_GAPS**

Automated coverage for announcements, preview/published parity, demo seed, and public page rendering is green. Manual browser checks on the live testing tenant (especially 390px overflow and seeded hostname) remain before treating the pass as fully closed. Known product gaps that are intentional or out of scope are listed below.

---

## Checklist (1–28)

| # | Check | Result | Evidence |
|---|--------|--------|----------|
| 1 | Testing Platform Admin create/edit/publish/unpublish | **PASS** | `DEPLOYMENT_ENV=testing` → `allowPlatformAdminPublish`; archive = soft unpublish (`announcement_archived`). `tests/blessboard-announcement-platform-admin-testing-policy.test.js` |
| 2 | Production Platform Admin read-only | **PASS with note** | Publish denied (`platform_publish_denied`). Legacy draft create/edit still allowed when policy off (076 intentional). Not full write lock. |
| 3 | Announcement CSRF | **PASS** | POSTs gated via `validateCsrfPost`; HTTP 403 without token |
| 4 | Organization-scoped | **PASS** | Cross-org update → `reason: church` |
| 5 | Audit events | **PASS** | `announcement_created` / `_updated` / `_published` / `_archived` on `platform.audit_events` |
| 6 | Preview uses shared public renderer | **PASS** | `contentAdminRoutes` → `loadTenantPublicPageModel` + `renderTenantPublicPage` |
| 7 | Preview shows drafts | **PASS** | Draft leaders appear in authenticated preview; not on public |
| 8 | Public published-only | **PASS** | Draft sections/entities omitted (`blessboard-public-pages.test.js`) |
| 9 | Preview banner not public | **PASS** | `data-bb-preview-banner` only when `isPreview`; asserted absent on `/` |
| 10 | No admin controls on public | **PASS** | No `/hq`, `/branch-admin`, admin chrome on public responses |
| 11 | Home seeded sections | **PASS** (code + seed) | Hero, service times, announcement highlight, welcome, teasers, Give/Contact CTAs — requires 078 `--apply` on target org |
| 12 | About story/mission/vision/values/service info | **PASS** | `about.ejs` + service strip; covered by public-pages tests |
| 13 | Leadership profiles / empty | **PASS** | Cards + initials; honest empty state |
| 14 | Ministries | **PASS** | Published grid from stored data |
| 15 | Events upcoming | **PASS** | Upcoming-only via `preparePublicEvents` |
| 16 | Sermons/resources | **PASS** | Title/speaker/date/summary/category |
| 17 | Contact | **PASS** | Channels, address, office hours section, service times strip |
| 18 | Giving test-only + disclaimer | **PASS** | Disclaimer + no payment form; demo `DEMO-00-0000` |
| 19 | Empty sections collapse | **PASS** | Blank sections skipped; empty states without fake counts |
| 20 | Escaped content | **PASS** | XSS fixture escaped in EJS output |
| 21 | Desktop nav | **PASS** | `bb-tp-nav--desktop` + active states |
| 22 | Mobile drawer | **PASS** | `#bb-tp-drawer` / `#bb-tp-menu-btn` |
| 23 | No horizontal overflow @ 390px | **PASS with note** | `overflow-x: clip/hidden` on body; **no pixel-level automation** — manual Browser check required |
| 24 | Preview/published status codes | **PASS** | Public 200; preview 200 authed; unauth preview 303/401; suspended public 503 |
| 25 | Demo seed idempotent | **PASS** | Second `--apply` does not duplicate |
| 26 | Demo seed refuses production | **PASS** | `DEPLOYMENT_ENV=production` → refused |
| 27 | User content not overwritten by default | **PASS** | Fill-empty; user sections `SKIPPED`; refresh only demo-owned |
| 28 | No V4 files changed | **PASS** | No dirty paths under `views/church`, `src/routes/church`, `public/church` for this workstream |

---

## Announcement publishing (076)

- Policy: `src/blessboard/services/announcementProductPolicy.js` (`DEPLOYMENT_ENV=testing` or explicit opt-in flag).
- Routes: HQ/branch `/announcements` create, edit, publish confirm, publish POST, archive POST.
- Testing UI banner: `data-bb-announcement-testing-platform-admin-publish="1"`.
- **Unpublish** in product terms = **archive** (soft end). There is no “revert published → draft” action.

## Preview / published parity (079)

- Same `views/blessboard/v5/public/*.ejs` + shell for preview and live.
- Preview: drafts + sticky admin banner + noindex.
- Public: published site + published content only; no preview banner.

## Demo content (078)

- Target org: `automated-test-church`.
- CLI: `db/scripts/blessboard-testing-demo-content-seed.js` (`--diagnose` / `--apply` / `--refresh-demo-content`).
- Includes home `announcement_highlight` (079 extension).
- Hostinger: set `DEPLOYMENT_ENV=testing` even if `NODE_ENV=production`.

## Desktop / mobile

- Shared responsive shell (desktop nav + mobile drawer).
- Hero/about/giving/contact use desktop vs mobile eyebrow/CTA class splits.
- 390px: rely on CSS overflow guards + manual verification in Cursor Browser / device mode.

## Tests run (2026-07-24)

In-scope suites (all pass):

| Suite | Result |
|-------|--------|
| `blessboard-announcement-platform-admin-testing-policy.test.js` | pass |
| `blessboard-announcements.test.js` | pass |
| `blessboard-public-pages.test.js` | pass |
| `blessboard-content-admin.test.js` | pass |
| `blessboard-testing-demo-content-seed.test.js` | pass |
| `blessboard-church-website-publish.test.js` | pass |
| `blessboard-v5-frontend-assets.test.js` | pass |

**Totals:** **104 / 104 pass** (in-scope set above).

### Out of scope residual

`tests/blessboard-public-content-schema.test.js` fails: `EXPECTED_TABLES` allowlist missing registration/onboarding tables from earlier Phase2 migrations. **Not introduced by 076–079**; not fixed in this audit.

## Remaining gaps

1. **Manual 390px overflow** — not pixel-asserted in CI.
2. **Production Platform Admin draft writes** — still allowed (076 legacy); publish blocked.
3. **Live tenant hostname** — seed fixture uses `automated-test.blessboard.test`; Hostinger testing host for `automated-test-church` must be confirmed before manual pass.
4. **Demo seed apply** must be run on testing DB before public pages look “Stitch-complete.”
5. **HQ website dashboard / editor dual-pane** Stitch chrome still deferred (077).
6. **Schema allowlist drift** (above) — separate fix.

## Manual test URLs (testing)

Replace `<TENANT_HOST>` with the authoritative hostname for `automated-test-church` on the testing deployment (confirm in `platform.domains`).

### Announcements (Platform Admin, `DEPLOYMENT_ENV=testing`)

- List: `https://<TENANT_HOST>/hq/announcements`
- New: `https://<TENANT_HOST>/hq/announcements/new`
- Detail / edit / publish / archive: `https://<TENANT_HOST>/hq/announcements/<id>` (+ `/edit`, `/publish`)

### Website preview (HQ auth)

- `https://<TENANT_HOST>/hq/content/preview/home`
- `https://<TENANT_HOST>/hq/content/preview/about`
- `https://<TENANT_HOST>/hq/content/preview/leadership`
- `https://<TENANT_HOST>/hq/content/preview/ministries`
- `https://<TENANT_HOST>/hq/content/preview/events`
- `https://<TENANT_HOST>/hq/content/preview/sermons`
- `https://<TENANT_HOST>/hq/content/preview/contact`
- `https://<TENANT_HOST>/hq/content/preview/giving`

### Published public pages

- `https://<TENANT_HOST>/`
- `https://<TENANT_HOST>/about`
- `https://<TENANT_HOST>/leadership`
- `https://<TENANT_HOST>/ministries`
- `https://<TENANT_HOST>/events`
- `https://<TENANT_HOST>/sermons`
- `https://<TENANT_HOST>/contact`
- `https://<TENANT_HOST>/giving`

### Apex (platform)

- `https://blessboard.org/` (platform / admin entry as configured for testing)

### Demo seed (Hostinger app root)

```bash
DEPLOYMENT_ENV=testing \
DATABASE_IDENTITY_EXPECTED='blessboard-platform-v5' \
node db/scripts/blessboard-testing-demo-content-seed.js --diagnose \
  --organization-key=automated-test-church

DEPLOYMENT_ENV=testing \
DATABASE_IDENTITY_EXPECTED='blessboard-platform-v5' \
node db/scripts/blessboard-testing-demo-content-seed.js --apply \
  --organization-key=automated-test-church
```

## Defects fixed in this pass

None — no clear in-scope runtime defects found; audit-only.

## V4 confirmation

**Untouched.** No modifications under `views/church/**`, `src/routes/church/**`, or `public/church/**` for Prompts 076–079 / this audit.
