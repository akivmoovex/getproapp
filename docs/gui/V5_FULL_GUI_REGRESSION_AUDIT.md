# BlessBoard V5 — Full GUI regression audit

**Date:** 2026-07-18  
**Stitch project:** `projects/17124191473876947591`  
**Scope:** Cross-surface shared design consistency across apex, tenant public, member, branch admin, HQ, platform admin, and shared media workflows.  
**Constraint:** Presentation / a11y / shell consistency only. No product features, routes, schema, sessions, auth, or authorization changes.

**Inputs reviewed**

- [`TENANT_PUBLIC_PARITY_AUDIT.md`](./TENANT_PUBLIC_PARITY_AUDIT.md)
- [`MEMBER_PORTAL_PARITY_AUDIT.md`](./MEMBER_PORTAL_PARITY_AUDIT.md)
- [`BRANCH_ADMIN_PARITY_AUDIT.md`](./BRANCH_ADMIN_PARITY_AUDIT.md)
- [`HQ_ADMIN_PARITY_AUDIT.md`](./HQ_ADMIN_PARITY_AUDIT.md)
- [`PLATFORM_ADMIN_PARITY_AUDIT.md`](./PLATFORM_ADMIN_PARITY_AUDIT.md)
- Media batches: [`BATCH_22_SHARED_MEDIA.md`](./BATCH_22_SHARED_MEDIA.md), [`BATCH_22A_MEDIA_PICKER.md`](./BATCH_22A_MEDIA_PICKER.md), [`BATCH_22B_MEDIA_UPLOAD.md`](./BATCH_22B_MEDIA_UPLOAD.md), [`BATCH_22C_MEDIA_DETAIL.md`](./BATCH_22C_MEDIA_DETAIL.md)
- Live CSS/EJS under `public/blessboard/v5/` and `views/blessboard/v5/`

---

## 1. Verdict

**Ready for a demo tenant** — with the intentional product omissions already documented in the per-portal parity audits (no fabricated KPIs, no payment checkout, no create-org UI, contact/giving info-only where data is blocked, etc.).

Shared chrome is token-aligned on Sacred Modernity (`#6C5CE7` / Hanken Grotesk). This pass closed cross-shell presentation defects (focus, overflow, undefined tokens, nav fallbacks, misleading unavailable cards) without changing backend behavior.

---

## 2. Audit method

1. Re-read all five portal parity audits + media batch docs for known intentional gaps vs remaining defects.
2. Cross-checked design tokens, shell CSS, focus sweeps, empty states, nav fallbacks, and hrefs across all six product surfaces + media picker.
3. Fixed **safe presentation** defects only.
4. Ran focused V5 GUI tests, authorization, sessions, CSRF, tenant-routing, stylelint on changed V5 CSS, and `git diff --check`.

---

## 3. Shared consistency findings

| Area | Finding | Action |
|------|---------|--------|
| Brand tokens | Primary stays `#6C5CE7`; no Inter / `#3b22b5` leaks | Confirmed OK |
| Undefined tokens | `--bb-border`, `--bb-primary-soft`, `--bb-radius-lg` used with lucky fallbacks | Replaced with canonical tokens |
| Hardcoded borders / errors | `#d0cad8`, `#b42318`, `#b91c1c`, `#f97066` drifted from tokens | Pointed at `--bb-color-*` |
| Apex overflow | Missing `overflow-x` guard vs other shells | Added clip + 320px guard |
| Apex focus | Brand / nav / drawer lacked `:focus-visible` | Added shared focus sweep |
| Admin table links | PA / HQ / BA table anchors missing from focus sweeps | Added |
| Empty states | BA / content-admin soft-fill empties diverged from dashed card pattern | Aligned to dashed + surface |
| Nav fallbacks | HQ shell-end truncated; member shell had no fallback | Expanded / added |
| Breadcrumb | Branch registrations parented under Members | Corrected to Dashboard |
| Unavailable cards | PA tickets/health linked to deployments as if those modules exist | Non-link articles |
| Cache versions | `design-system.js` split `v=2`/`v=3`; shell CSS bumps needed | Unified to `v=3` + bumped CSS |
| Fake data | No MRR / uptime / fabricated demo rows in templates | Confirmed absent |
| Dead routes | No true dead `href`s in V5 templates | Confirmed |
| Media (22A–C) | Picker / upload / detail already polished; CSRF + soft-archive honest | No further change this pass |
| Platform dark sidebar | Intentional Stitch ops chrome | Left alone |
| Button radius drift across shells | Cosmetic; shells intentionally prefixed | Deferred (not demo-blocking) |

---

## 4. Presentation fixes applied

| Fix | Files |
|-----|-------|
| Apex `overflow-x` + chrome `:focus-visible` | `apex.css` |
| Apex account note link focus | `apex-auth.css` |
| Replace `--bb-primary-soft` / error hex | `tenant-public.css` |
| Auth border + invalid border tokens | `tenant-auth.css` |
| Replace `--bb-border`; empty-state dashed card; table link focus | `branch-admin.css` |
| Token borders/errors; CA empty; table link focus | `hq-admin.css` |
| Danger chip + form borders + table link focus | `platform-admin.css` |
| Registrations breadcrumb → Dashboard | `branch-admin/registrations.ejs` |
| HQ shell-end fallback = full HQ nav | `hq-shell-end.ejs` |
| Member shell nav / tab fallbacks | `member-shell-start.ejs`, `member-shell-end.ejs` |
| PA tickets/health → unavailable articles | `platform-admin/dashboard.ejs` |
| Cache bumps | apex `?v=5`, apex-auth `?v=6`, tenant-public `?v=26`, tenant-auth `?v=11`, branch `?v=34`, HQ `?v=43`, PA `?v=22`; `design-system.js?v=3` everywhere |
| cssHref bump | `loadTenantPublicPageModel.js` |
| Test version pins | `blessboard-apex-auth-gui.test.js`, `blessboard-v5-a11y-structure.test.js` |

**Preserved:** all routes, queries, CSRF contracts, authz, sessions, hostname resolution, media storage/validation, no fabricated metrics.

---

## 5. Files changed (this regression pass)

### CSS
- `public/blessboard/v5/apex.css`
- `public/blessboard/v5/apex-auth.css`
- `public/blessboard/v5/tenant-public.css`
- `public/blessboard/v5/tenant-auth.css`
- `public/blessboard/v5/branch-admin.css`
- `public/blessboard/v5/hq-admin.css`
- `public/blessboard/v5/platform-admin.css`

### Views / partials
- `views/blessboard/v5/partials/apex-shell-start.ejs`, `apex-shell-end.ejs`
- `views/blessboard/v5/partials/tenant-public-shell-start.ejs`, `tenant-public-shell-end.ejs`
- `views/blessboard/v5/partials/member-shell-start.ejs`, `member-shell-end.ejs`
- `views/blessboard/v5/partials/branch-admin-shell-start.ejs`
- `views/blessboard/v5/partials/hq-shell-start.ejs`, `hq-shell-end.ejs`
- `views/blessboard/v5/partials/platform-admin-shell-start.ejs`, `platform-admin-shell-end.ejs`
- `views/blessboard/v5/apex/login.ejs`, `auth-error.ejs`
- `views/blessboard/v5/public/register.ejs`, `register-submitted.ejs`
- `views/blessboard/v5/branch-admin/registrations.ejs`
- `views/blessboard/v5/platform-admin/dashboard.ejs`

### Other
- `src/blessboard/http/loadTenantPublicPageModel.js` (CSS cache only)
- `tests/blessboard-apex-auth-gui.test.js`
- `tests/blessboard-v5-a11y-structure.test.js`
- `docs/gui/V5_FULL_GUI_REGRESSION_AUDIT.md` (this file)

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
| Dedicated Stitch pairs for Account/Settings/some details | Sacred Modernity composition intentional |
| Media: no dedicated Stitch pair | Shared UI States reference only |
| Full website builder / calendar / reports modules | Out of V5 product scope |

---

## 7. Test results

Run serially (parallel DB harness contention can flake otherwise).

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
| `npm run test:blessboard:platform-admin-shell` | **12/12 pass** |
| `npm run test:blessboard:media` | **21/21 pass** |
| `npm run test:blessboard:settings` | **7/7 pass** |
| `npm run test:blessboard:announcements` | **16/16 pass** |
| `npm run test:blessboard:content-admin` | **14/14 pass** |
| `npm run test:blessboard:attendance` | **8/8 pass** |
| `npm run test:blessboard:giving` | **8/8 pass** |
| `npm run test:blessboard:reports-audit` | **7/7 pass** |

### Authorization / sessions / routing / CSRF

| Command | Result |
|---------|--------|
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:platform:sessions` | **3/3 pass** |
| `npm run test:blessboard:tenant-routing` | **44/44 pass** |
| `npm run test:platform:host-comparison` | **24/24 pass** |
| `node --test tests/church-branch-hq-csrf-coverage.test.js` | **7/7 pass** |
| `node --test tests/church-member-csrf-coverage.test.js` | **7/7 pass** |
| `node --test tests/church-platform-admin-csrf-audit.test.js` | **4/4 pass** (2 skipped) |
| `node --test tests/church-mutation-csrf-inventory.test.js` | **2/2 pass** |

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
| Member portal | Yes | No prayer route; giving instructional |
| Branch admin | Yes | No fabricated KPIs / reports module |
| HQ admin | Yes | Oversight chrome; no builder canvas |
| Platform admin | Yes | Live counts only; no ops/billing controls |
| Shared media | Yes | Church-scoped library; soft-archive only |

**Overall:** **YES — ready for a demo tenant** end-to-end walkthrough across public → member → branch → HQ → platform, provided demo content is real published CMS / provisioned orgs and expectations match intentional omissions above.

---

## 9. Suggested commit message

```
Harden V5 cross-shell GUI consistency for demo-tenant readiness.
```
