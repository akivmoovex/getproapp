# BlessBoard V5 — Full GUI regression audit

**Date:** 2026-07-19
**Stitch project:** `projects/17124191473876947591`
**Scope:** Apex, tenant public, tenant auth, member portal, branch admin, HQ admin, platform admin, shared media.
**Constraint:** Presentation / a11y / shell consistency only. No product features, routes, queries, schema, migrations, sessions, authentication, CSRF, or authorization changes. No routing changes.

**Inputs reviewed**

- [`TENANT_PUBLIC_PARITY_AUDIT.md`](./TENANT_PUBLIC_PARITY_AUDIT.md)
- [`MEMBER_PORTAL_PARITY_AUDIT.md`](./MEMBER_PORTAL_PARITY_AUDIT.md)
- [`BRANCH_ADMIN_PARITY_AUDIT.md`](./BRANCH_ADMIN_PARITY_AUDIT.md)
- [`HQ_ADMIN_PARITY_AUDIT.md`](./HQ_ADMIN_PARITY_AUDIT.md)
- [`PLATFORM_ADMIN_PARITY_AUDIT.md`](./PLATFORM_ADMIN_PARITY_AUDIT.md)
- [`BATCH_22C_MEDIA_DETAIL.md`](./BATCH_22C_MEDIA_DETAIL.md) (+ 22 / 22A / 22B)
- Live CSS/EJS under `public/blessboard/v5/` and `views/blessboard/v5/`

---

## 1. Verdict

**Ready for one complete demo tenant** — with intentional product omissions already documented in the per-portal parity audits (no fabricated KPIs, no payment checkout, no create-org UI, contact/giving info-only where data is blocked, soft-archive media only, etc.).

Shared chrome remains Sacred Modernity (`#6C5CE7` / Hanken Grotesk). This pass closed remaining cross-shell presentation defects (duplicate button rules, undefined token aliases, auth/media overflow, participation admin chrome, HQ empty-state drift) without changing backend behavior.

| Portal | Demo-ready? | MATERIAL GAPS |
|--------|-------------|-----------------|
| Apex | Yes | — |
| Tenant public | Yes | Tenant login vs Stitch password card (apex transfer intentional) |
| Tenant auth | Yes | — |
| Member | Yes | 0 (no prayer route — intentional) |
| Branch admin | Yes | 0 |
| HQ admin | Yes | 0 |
| Platform admin | Yes | 0 |
| Shared media (22A–C) | Yes | Shared UI States only; soft-archive honest |

**Shell CSS pins (current):** design-system/tokens `?v=3` · apex `?v=5` · apex-auth `?v=6` · tenant-public `?v=26` · tenant-auth `?v=12` · member `?v=19` · branch `?v=35` · HQ `?v=44` · PA `?v=24` · media-picker `?v=7`.

---

## 2. Audit method

1. Re-read five portal parity audits + media Batch 22C.
2. Scanned V5 CSS for conflicting selectors, undefined variables, Inter/`#3b22b5` leaks, `100vw` overflow, missing `overflow-x` clip.
3. Scanned V5 EJS for dead `href="#"`, fabricated metrics, secrets, missing empty/focus patterns.
4. Fixed **safe presentation** defects only.
5. Ran focused V5 GUI tests, authorization, sessions, CSRF, tenant-routing, deployment-identity (`test:platform:host-comparison` + PA shell identity assertions), sensitive-data assertions (PA shell / a11y / reports-audit), stylelint on changed V5 CSS, and `git diff --check`.

---

## 3. Shared consistency findings

| Area | Finding | Action |
|------|---------|--------|
| Brand tokens | Primary stays `#6C5CE7`; no Inter / `#3b22b5` leaks | Confirmed OK |
| Undefined token aliases | `--bb-radius-md`, `--bb-surface-dim`, `--bb-text`, `--bb-auth-radius-sm` used with lucky fallbacks | Added canonical aliases in tokens / auth `:root` |
| Duplicate `.bb-ba-btn` | Chrome + page rules conflicted (0.5 vs 0.55 rem radius) | Logout-only chrome rule; single canonical `.bb-ba-btn` |
| HQ bare form submit | Hardcoded `8px` / `#6c5ce7` | Tokenized radius + primary color |
| HQ shared `.bb-ba-btn` embed | Matched BA radius to `--bb-radius-sm` | Aligned |
| Auth overflow | `.bb-auth-body` lacked default `overflow-x: clip` | Added |
| Media drawer | `width: 100vw` risked horizontal scroll | `100%` |
| Participation admin | Bare markup / unstyled buttons / plain empties | Page-head, panels, dashed empties, `.bb-ba-btn` |
| HQ reports giving empty | Missing `bb-hq-empty` vs attendance sibling | Class + `role="status"` |
| PA focus / org cards | Prior parity polish (status tone, deploy focus) | Kept (`platform-admin.css?v=24`) |
| Dead links | No bare `href="#"` without in-page targets; nav matches V5 routers | None to resolve |
| Fake data | No MRR / uptime % / fabricated demo rows | Confirmed absent |
| PA empty families | Orgs use DS empty (CTA); other PA lists use dashed `.bb-pa-empty` | Documented remaining cosmetic drift |
| Button radius across shells | PA `0.45rem` vs DS `1rem` intentional ops chrome | Deferred |

---

## 4. Presentation fixes applied

| Fix | Files |
|-----|-------|
| Token aliases (`--bb-radius-md`, `--bb-surface-dim`, `--bb-text`) + DS cache `v=3` | `design-tokens.css`, `head-design-system.ejs` |
| Unify BA button rules + participation list chrome | `branch-admin.css` |
| HQ form submit tokens + shared BA btn radius + participation chrome | `hq-admin.css` |
| Auth overflow + `--bb-auth-radius-sm` | `tenant-auth.css` |
| Media drawer `100%` width | `media-picker.css` |
| Participation admin Stitch-consistent chrome | `participation/admin-overview.ejs` |
| Giving empty state class | `hq/reports.ejs` |
| Cache bumps | BA `?v=35`, HQ `?v=44`, tenant-auth `?v=12`, media `?v=7` |
| PA parity polish (pre-existing uncommitted) | `platform-admin.css`, orgs/account/shell, a11y pins `?v=24` |
| Test version pins | `blessboard-v5-a11y-structure.test.js`, `blessboard-apex-auth-gui.test.js` |

**Preserved:** all routes, queries, CSRF contracts (`_csrf` on participation review), authz, sessions, hostname resolution, media storage/validation, no fabricated metrics.

---

## 5. Files changed (this regression pass)

### CSS
- `public/blessboard/v5/design-tokens.css`
- `public/blessboard/v5/branch-admin.css`
- `public/blessboard/v5/hq-admin.css`
- `public/blessboard/v5/tenant-auth.css`
- `public/blessboard/v5/media-picker.css`
- `public/blessboard/v5/platform-admin.css` (PA parity polish)

### Views / partials
- `views/blessboard/v5/partials/head-design-system.ejs`
- `views/blessboard/v5/partials/branch-admin-shell-start.ejs`
- `views/blessboard/v5/partials/hq-shell-start.ejs`
- `views/blessboard/v5/partials/platform-admin-shell-start.ejs`
- `views/blessboard/v5/participation/admin-overview.ejs`
- `views/blessboard/v5/hq/reports.ejs`
- `views/blessboard/v5/apex/login.ejs`, `auth-error.ejs`
- `views/blessboard/v5/public/register.ejs`, `register-submitted.ejs`
- `views/blessboard/v5/platform-admin/account.ejs`, `organizations.ejs`

### Tests / docs
- `tests/blessboard-v5-a11y-structure.test.js`
- `tests/blessboard-apex-auth-gui.test.js`
- `docs/gui/V5_FULL_GUI_REGRESSION_AUDIT.md` (this file)
- `docs/gui/BATCH_22C_MEDIA_DETAIL.md` (final-regression stamp)
- `docs/gui/PLATFORM_ADMIN_PARITY_AUDIT.md` (media/final pointer)

---

## 6. Remaining blocked / intentional items

Do **not** “fix” these for Stitch parity:

| Item | Status |
|------|--------|
| Contact POST form / Giving payments / QR | BLOCKED BY DATA |
| Tenant password login card (Stitch) | Product uses apex transfer |
| Member prayer route | MISSING route |
| Fabricated dashboard KPIs / MRR / uptime / tickets | Intentionally omitted |
| Create Organization UI | CLI provisioning only |
| DNS/SSL automation, deploy/restart/rollback | No V5 ops controls |
| Admin button radius fully unified across shells | Cosmetic drift; deferred |
| PA orgs DS empty vs dashed PA list empties | Cosmetic; orgs keep CTA card |
| Dedicated Stitch pairs for Account/Settings/some details | Sacred Modernity composition intentional |
| Media: no dedicated Stitch pair | Shared UI States reference only |
| Full website builder / calendar / reports modules | Out of V5 product scope |
| Hosted `diagnostic-church` demo users / CMS rows | Data readiness gate — see `docs/testing/V5_DEMO_TENANT_READINESS.md` |

---

## 7. Test results

Run serially (parallel DB harness contention can flake otherwise).
**2026-07-19 full regression** — GUI suites below **0 failures**.

### Focused V5 GUI

| Command | Result |
|---------|--------|
| `npm run test:blessboard:design-system` | **8/8 pass** |
| `npm run test:blessboard:a11y-structure` | **83/83 pass** |
| `npm run test:blessboard:apex-home` | **3/3 pass** |
| `npm run test:blessboard:apex-marketing` | **7/7 pass** |
| `npm run test:blessboard:apex-auth-gui` | **4/4 pass** |
| `npm run test:blessboard:public-pages` | **29/29 pass** |
| `npm run test:blessboard:member-registration` | **17/17 pass** |
| `npm run test:blessboard:tenant-auth` | **13/13 pass** |
| `npm run test:blessboard:member-portal` | **16/16 pass** |
| `npm run test:blessboard:forms-requests` | **10/10 pass** |
| `npm run test:blessboard:participation` | **11/11 pass** |
| `npm run test:blessboard:branch-admin-shell` | **12/12 pass** |
| `npm run test:blessboard:hq-shell` | **9/9 pass** |
| `npm run test:blessboard:platform-admin-shell` | **12/12 pass** (includes sensitive-data exclusion + deployment identity highlight) |
| `npm run test:blessboard:media` | **21/21 pass** |
| `npm run test:blessboard:settings` | **7/7 pass** |
| `npm run test:blessboard:announcements` | **16/16 pass** |
| `npm run test:blessboard:content-admin` | **14/14 pass** |
| `npm run test:blessboard:attendance` | **8/8 pass** |
| `npm run test:blessboard:giving` | **8/8 pass** |
| `npm run test:blessboard:reports-audit` | **7/7 pass** (includes sensitive-data assertions) |

### Authorization / sessions / routing / CSRF / deployment identity

| Command | Result |
|---------|--------|
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:platform:sessions` | **3/3 pass** |
| `npm run test:blessboard:tenant-routing` | **44/44 pass** |
| `npm run test:platform:host-comparison` | **24/24 pass** (deployment identity ≠ database identity) |
| `node --test tests/church-branch-hq-csrf-coverage.test.js` | **7/7 pass** |
| `node --test tests/church-member-csrf-coverage.test.js` | **7/7 pass** |
| `node --test tests/church-platform-admin-csrf-audit.test.js` | **4/4 pass** (2 skipped) |
| `node --test tests/church-mutation-csrf-inventory.test.js` | **2/2 pass** |

### Outside GUI scope (noted)

| Command | Result |
|---------|--------|
| `node --test tests/church-database-identity.test.js` | **18/21 pass**, 2 skipped, **1 fail** — `latestChurchSchemaMigration` constant expects `124_…` but disk has `126_church_platform_support_access.sql`. **Not a GUI defect**; do not change migrations in this audit. |

### Lint / whitespace

| Command | Result |
|---------|--------|
| `npx stylelint` (changed V5 CSS set) | **0 errors** (hex token warnings only) |
| `git diff --check` | **clean** |

---

## 8. Demo tenant readiness

| Surface | Ready? | Caveat |
|---------|--------|--------|
| Apex marketing + login transfer | Yes | Transfer chrome, not Stitch password card |
| Tenant public | Yes | Published CMS only; contact/giving info-only |
| Tenant auth | Yes | Apex transfer + register chrome |
| Member portal | Yes | No prayer route; giving instructional |
| Branch admin | Yes | No fabricated KPIs / reports module |
| HQ admin | Yes | Oversight chrome; no builder canvas |
| Platform admin | Yes | Live counts only; no ops/billing controls |
| Shared media | Yes | Church-scoped library; soft-archive only |

**Overall:** **YES — ready for a demo tenant** end-to-end walkthrough across public → member → branch → HQ → platform, provided demo content is real published CMS / provisioned orgs and expectations match intentional omissions above. Hosted `diagnostic-church` still needs users + CMS rows per `V5_DEMO_TENANT_READINESS.md` (data gate, not GUI).

---

## 9. Suggested commit message

```
Harden V5 cross-shell GUI consistency for demo-tenant readiness.
```
