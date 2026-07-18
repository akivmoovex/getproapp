# BlessBoard V5 — Demo tenant end-to-end smoke-test plan

**Date:** 2026-07-19
**Purpose:** Final manual smoke plan for one BlessBoard V5 demo tenant after catalogue readiness + test users/content are in place.
**Constraint:** Documentation only. Does **not** change application code, seed data, or authorize deploy.
**Companions:** [`V5_DEMO_TENANT_READINESS.md`](./V5_DEMO_TENANT_READINESS.md) · [`V5_GUI_PRODUCTION_SMOKE_TEST.md`](../ui/V5_GUI_PRODUCTION_SMOKE_TEST.md) · [`V5_FULL_GUI_REGRESSION_AUDIT.md`](../gui/V5_FULL_GUI_REGRESSION_AUDIT.md) · [`V5_HOSTED_MIGRATION_AND_CUTOVER.md`](../database/V5_HOSTED_MIGRATION_AND_CUTOVER.md) · [`V5_SHADOW_ROUTING_READINESS.md`](../deployment/V5_SHADOW_ROUTING_READINESS.md)

---

## 0. Plan execution readiness

| Question | Answer |
|----------|--------|
| Is this **plan** complete and ready to execute as a runbook? | **YES** — 31 journey tests, failure taxonomy, evidence, checklists, and rollback are defined. |
| Can operators run the **full** plan against hosted data **today**? | **NO** until [`V5_DEMO_TENANT_READINESS.md`](./V5_DEMO_TENANT_READINESS.md) full-E2E gaps are closed (users, roles, published Home/About, sample module rows) **and** `BLESSBOARD_TENANT_ROUTING_MODE=authoritative` after shadow sign-off. |
| Partial execution allowed now? | **YES** — Apex-only rows (T01–T05, parts of T09/T20/T29–T31) under `off`/`shadow`; full tenant journey only in `authoritative`. |

### Hosts (fill before run)

| Alias | Value (current demo candidate) | Used for |
|-------|--------------------------------|----------|
| **Apex** | `https://blessboard.org` | Marketing, login, account, platform admin |
| **Tenant** | `https://diagnostic.blessboard.org` | Public CMS, register, transfer, portals |
| **Org key** | `diagnostic-church` | Platform / HQ / roles |
| **Church key** | `diagnostic-church` | Role assign / verification |
| **Primary branch key** | `hq` | Branch admin scope (HQ is primary) |
| **Deployment** | `blessboard-org-v5` | Session / routing identity |
| **DB identity** | `blessboard-platform-v5` / `testing` | Physical database purpose |

### Required personas (create before full run)

| Persona | Role key | Notes |
|---------|----------|-------|
| **PA** | `platform_admin` | Apex `/admin*` |
| **HQ** | `church_hq_admin` | Tenant `/hq*` |
| **BA** | `branch_admin` on `hq` | Tenant `/branch-admin*` |
| **MEM** | active member + primary membership on `hq` | Tenant `/member*` |
| **ANON** | none | Public pages |
| **INACTIVE_USER** | user with `status≠active` (disposable fixture) | Negative only |
| **WRONG_BRANCH_BA** | `branch_admin` on a non-target branch (if second branch exists) | Negative only; else Skip |

Use private/incognito windows per persona. Never reuse a staff session for member checks.

### Routing mode gates

| Phase | Mode | Smoke allowed |
|-------|------|---------------|
| Preflight | `off` or `shadow` | Apex-only + shadow log checks (not full tenant CMS) |
| Full journey (this plan) | `authoritative` | All rows below except fixture-gated negatives |
| On failure | set `off`, restart | Re-check Apex `/healthz` + `/login` |

### Marking

Each test: ☐ Pass · ☐ Fail · ☐ Blocked (precondition) · ☐ Skip (reason)

### Failure classification taxonomy

| Code | Meaning |
|------|---------|
| **SECURITY** | Secret leak, authz bypass, CSRF bypass, private media public, cookie Domain parent-shared |
| **CONFIG** | Routing mode, env, DNS, cookie name, deployment identity mismatch |
| **DATA** | Missing user/role/content; fixture not provisioned |
| **PRODUCT** | Wrong UI/shell, 5xx, dead enabled nav, broken transfer |
| **A11Y_UX** | Overflow, focus trap, unusable mobile chrome (non-blocking unless smoke gate) |
| **SKIP_FIXTURE** | No safe inactive/wrong-branch/wrong-church fixture without harming shared demo |

---

## 1. Journey tests (T01–T31)

### T01 — Apex homepage

| Field | Detail |
|-------|--------|
| **Test number** | T01 |
| **Route** | `GET /` |
| **Hostname** | Apex |
| **Role** | ANON (optional: any signed-in) |
| **Setup** | App healthy; apex marketing assets deployed; routing any mode |
| **Action** | Open Apex home; scroll hero → capabilities → footer; check primary nav |
| **Expected result** | **200**; Sacred Modernity apex chrome; nav includes Home / Features / Pricing / Directory / Register / Login (or Account); footer Powered by GetPro; no tenant CMS chrome; no fabricated org KPIs |
| **Evidence to capture** | Desktop + mobile first-viewport screenshots; status; CSS `apex.css?v=` in source |
| **Cleanup** | None |
| **Failure classification** | PRODUCT (wrong shell/5xx) · CONFIG if healthz also fails |

### T02 — Features

| Field | Detail |
|-------|--------|
| **Test number** | T02 |
| **Route** | `GET /features` |
| **Hostname** | Apex |
| **Role** | ANON |
| **Setup** | Same as T01 |
| **Action** | Open Features; follow in-page CTAs that stay on apex |
| **Expected result** | **200**; marketing features content; no live checkout; no tenant admin chrome |
| **Evidence to capture** | Screenshot; note any broken in-page anchors |
| **Cleanup** | None |
| **Failure classification** | PRODUCT |

### T03 — Pricing

| Field | Detail |
|-------|--------|
| **Test number** | T03 |
| **Route** | `GET /pricing` |
| **Hostname** | Apex |
| **Role** | ANON |
| **Setup** | Same as T01 |
| **Action** | Open Pricing; inspect plan cards/CTAs |
| **Expected result** | **200**; plans/copy render; **no** live payment checkout; amounts only from content/locals (no fabricated MRR) |
| **Evidence to capture** | Screenshot; confirm no Stripe/checkout iframe |
| **Cleanup** | None |
| **Failure classification** | PRODUCT · SECURITY if payment secrets appear |

### T04 — Directory

| Field | Detail |
|-------|--------|
| **Test number** | T04 |
| **Route** | `GET /directory` |
| **Hostname** | Apex |
| **Role** | ANON |
| **Setup** | Same as T01; directory may list testing orgs when env allows |
| **Action** | Open Directory; try search if present; follow one listed tenant link if shown |
| **Expected result** | **200**; safe org labels/hosts only (no UUIDs/secrets); dead nav absent |
| **Evidence to capture** | Screenshot; list of `href`s followed + status |
| **Cleanup** | None |
| **Failure classification** | PRODUCT · SECURITY if UUID/secret leak |

### T05 — Register Church enquiry state

| Field | Detail |
|-------|--------|
| **Test number** | T05 |
| **Route** | `GET /register-church` |
| **Hostname** | Apex |
| **Role** | ANON |
| **Setup** | Same as T01 |
| **Action** | Open Register Your Church; confirm enquiry-only chrome (no provision POST success) |
| **Expected result** | **200**; visual enquiry layout; **no** self-serve provisioning POST; **no** fake “request sent” success |
| **Evidence to capture** | Screenshot; confirm no `method=post` provision form that creates orgs |
| **Cleanup** | None |
| **Failure classification** | PRODUCT · DATA if page invents provisioned org |

### T06 — Tenant homepage

| Field | Detail |
|-------|--------|
| **Test number** | T06 |
| **Route** | `GET /` |
| **Hostname** | Tenant |
| **Role** | ANON |
| **Setup** | `authoritative` routing; published `home` **or** accepted honest empty; active org/church/domain |
| **Action** | Open tenant `/`; check header, main, footer, Sign in |
| **Expected result** | **200** tenant public shell; church display name; published Home **or** intentional empty; apex link present; **no** HQ/admin links in public chrome; no UUID leakage |
| **Evidence to capture** | First-viewport screenshot; title/h1 snippet; Host used |
| **Cleanup** | None |
| **Failure classification** | CONFIG if apex marketing on tenant host · DATA if content expected but missing · PRODUCT |

### T07 — Tenant navigation

| Field | Detail |
|-------|--------|
| **Test number** | T07 |
| **Route** | Tenant public nav/footer links (e.g. `/`, `/about`, `/contact`, `/register`, sermons/events/ministries as published) |
| **Hostname** | Tenant |
| **Role** | ANON |
| **Setup** | Authoritative; published About recommended |
| **Action** | Click every enabled header + footer link once (desktop + mobile drawer) |
| **Expected result** | Enabled links **200** or intentional empty; draft not public; no admin portal links in public nav |
| **Evidence to capture** | `href` → status table; mobile drawer screenshot |
| **Cleanup** | None |
| **Failure classification** | PRODUCT (dead enabled link) · DATA (missing About when required for demo) |

### T08 — Tenant login redirect

| Field | Detail |
|-------|--------|
| **Test number** | T08 |
| **Route** | `GET /login` (optional `?next=/member` / `?next=/hq` / `?next=/branch-admin`) |
| **Hostname** | Tenant |
| **Role** | ANON |
| **Setup** | Authoritative tenant resolution |
| **Action** | Click Sign in or open `/login` |
| **Expected result** | Redirect to Apex `/login?tr=…`; **no** tenant password form; HTML never embeds raw transfer secrets beyond opaque `tr` |
| **Evidence to capture** | Redirect chain (status + Location); tenant HTML snippet proving no password fields |
| **Cleanup** | Abandoned transfers expire via product TTL |
| **Failure classification** | PRODUCT · SECURITY if raw token/secret in HTML |

### T09 — Apex authentication

| Field | Detail |
|-------|--------|
| **Test number** | T09 |
| **Route** | `GET/POST /login` (and controlled auth-error) |
| **Hostname** | Apex |
| **Role** | PA / HQ / BA / MEM (each as needed) |
| **Setup** | Valid test users with passwords; CSRF field present |
| **Action** | Valid login; invalid password; observe cookie attributes |
| **Expected result** | Valid → **303** to `/`, `/account`, or transfer continuation; invalid → controlled error, no stack; session cookie **host-only** (not `.blessboard.org` parent Domain) |
| **Evidence to capture** | Cookie jar (Name/Domain/Secure/HttpOnly); error page screenshot; status |
| **Cleanup** | Logout after suite section or use fresh windows |
| **Failure classification** | SECURITY (parent Domain cookie) · PRODUCT · DATA (user missing) |

### T10 — Tenant transfer callback

| Field | Detail |
|-------|--------|
| **Test number** | T10 |
| **Route** | Tenant login → Apex login → transfer callback → destination (`/member`, `/hq`, `/branch-admin`) |
| **Hostname** | Tenant → Apex → Tenant |
| **Role** | MEM, HQ, BA (separate windows) |
| **Setup** | Start from Tenant `/login?next=…` for each destination |
| **Action** | Complete apex login from transfer; land on callback then destination |
| **Expected result** | Lands on intended portal **200**; transfer single-use; replay fails closed; cookie remains host-scoped |
| **Evidence to capture** | Final URL per persona; one replay attempt status |
| **Cleanup** | None beyond logout later |
| **Failure classification** | PRODUCT · SECURITY · CONFIG |

### T11 — Member registration

| Field | Detail |
|-------|--------|
| **Test number** | T11 |
| **Route** | `GET/POST /register` |
| **Hostname** | Tenant |
| **Role** | ANON |
| **Setup** | Authoritative; CSRF; use disposable email |
| **Action** | Submit valid registration; try invalid required fields |
| **Expected result** | Valid → redirect to submitted confirmation; invalid → field errors, no stack; no sensitive category collection beyond product fields |
| **Evidence to capture** | Form screenshot; success redirect URL; validation error shot |
| **Cleanup** | Leave pending registration for T13; do not invent DELETE SQL |
| **Failure classification** | PRODUCT · DATA · SECURITY if secrets in response |

### T12 — Registration submitted

| Field | Detail |
|-------|--------|
| **Test number** | T12 |
| **Route** | `GET /register/submitted` |
| **Hostname** | Tenant |
| **Role** | ANON (post T11) |
| **Setup** | Arrived via successful T11 |
| **Action** | Read confirmation; follow Home/Contact links |
| **Expected result** | **200** confirmation chrome; honest “pending review” messaging; no auto-login as member |
| **Evidence to capture** | Screenshot |
| **Cleanup** | None |
| **Failure classification** | PRODUCT |

### T13 — Branch registration review

| Field | Detail |
|-------|--------|
| **Test number** | T13 |
| **Route** | `GET /branch-admin/registrations` (+ detail if present) |
| **Hostname** | Tenant |
| **Role** | BA |
| **Setup** | BA session via T10; pending registration from T11 |
| **Action** | Open registrations list/detail; approve/activate per product UI (CSRF) |
| **Expected result** | Pending row visible in branch scope; approve succeeds with CSRF; cross-branch/church rows absent |
| **Evidence to capture** | List screenshot; post-approve status; CSRF network note |
| **Cleanup** | Keep member for T14; document email key only |
| **Failure classification** | PRODUCT · DATA · SECURITY if cross-tenant leak |

### T14 — Member portal

| Field | Detail |
|-------|--------|
| **Test number** | T14 |
| **Route** | `/member`, `/member/profile`, announcements, events, ministries, giving, forms/requests as mounted |
| **Hostname** | Tenant |
| **Role** | MEM |
| **Setup** | Active member + primary membership; sample content optional |
| **Action** | Walk enabled member nav; open one item per module; attempt staff URLs |
| **Expected result** | Enabled modules **200** or honest empty; staff URLs **403**/redirect; no prayer route required; giving instructional only |
| **Evidence to capture** | Dashboard screenshot; one 403 proof to `/branch-admin` |
| **Cleanup** | Logout in T20 |
| **Failure classification** | PRODUCT · DATA · SECURITY |

### T15 — Branch Admin

| Field | Detail |
|-------|--------|
| **Test number** | T15 |
| **Route** | `/branch-admin` + modules: account, settings, registrations, members, announcements, content, attendance, giving, forms, requests, participation as mounted |
| **Hostname** | Tenant |
| **Role** | BA |
| **Setup** | BA on `hq`; sample rows for modules you click |
| **Action** | Open each enabled nav item; spot-check one write with CSRF where safe |
| **Expected result** | Branch-scoped data only; no fabricated KPIs; media picker entry where wired; HQ-only routes forbidden |
| **Evidence to capture** | Dashboard + one module shot; one CSRF POST status |
| **Cleanup** | Soft-revert test writes via UI when possible |
| **Failure classification** | PRODUCT · DATA · SECURITY |

### T16 — HQ Admin

| Field | Detail |
|-------|--------|
| **Test number** | T16 |
| **Route** | `/hq` + branches, members, registrations, announcements, content, attendance/giving, reports, audit, settings, account |
| **Hostname** | Tenant |
| **Role** | HQ |
| **Setup** | HQ session; optional branch jump to `hq` |
| **Action** | Walk enabled HQ nav; open reports/audit; jump to branch admin for `hq` if offered |
| **Expected result** | Church-wide oversight chrome; no fabricated charts; audit privacy-safe; inactive branch jump fail-closed |
| **Evidence to capture** | Dashboard + reports/audit shots |
| **Cleanup** | Logout in T20 |
| **Failure classification** | PRODUCT · DATA · SECURITY |

### T17 — Platform Admin

| Field | Detail |
|-------|--------|
| **Test number** | T17 |
| **Route** | `/admin`, `/admin/organizations`, org detail, plans, subscriptions, domains, deployments, settings, account |
| **Hostname** | Apex |
| **Role** | PA |
| **Setup** | PA login on apex |
| **Action** | Walk enabled PA nav; open `diagnostic-church` detail; open deployments/domains; avoid inventing ops actions |
| **Expected result** | Live counts only; unavailable cards non-linked; no MRR/uptime fabrication; secrets absent on deployment detail |
| **Evidence to capture** | Dashboard + org detail + one deployment detail shot |
| **Cleanup** | Logout |
| **Failure classification** | PRODUCT · SECURITY · CONFIG |

### T18 — Media picker

| Field | Detail |
|-------|--------|
| **Test number** | T18 |
| **Route** | Content-admin media picker dialog (BA `/branch-admin/content…` or HQ `/hq/content…`) |
| **Hostname** | Tenant |
| **Role** | BA or HQ |
| **Setup** | Storage configured; at least one library asset optional |
| **Action** | Open picker; filter/grid; focus/select; Escape closes; check empty library honesty |
| **Expected result** | Picker opens with Shared UI States chrome; church-scoped library only; focus trap; no stock/Unsplash search |
| **Evidence to capture** | Desktop + mobile drawer screenshots |
| **Cleanup** | Close dialog |
| **Failure classification** | PRODUCT · DATA · A11Y_UX |

### T19 — Media upload

| Field | Detail |
|-------|--------|
| **Test number** | T19 |
| **Route** | Media upload in picker; soft-archive confirm; `GET /_bb/media/:id` for public assets |
| **Hostname** | Tenant (+ Apex N/A) |
| **Role** | BA or HQ; ANON for private deny |
| **Setup** | Allowlisted JPEG/PNG/WebP/GIF ≤5MiB or PDF ≤15MiB; CSRF |
| **Action** | Upload valid; reject SVG/oversize; archive confirm (soft); ANON fetch private |
| **Expected result** | Upload OK; CSRF **403** without token (safe JSON `reason` where API); SVG rejected; soft-archive only; private not public; no storage keys in HTML/JSON |
| **Evidence to capture** | Network statuses; success + reject shots; private GET status |
| **Cleanup** | Soft-archive test asset via UI; no hard-delete SQL |
| **Failure classification** | SECURITY · PRODUCT · CONFIG (buckets) |

### T20 — Logout

| Field | Detail |
|-------|--------|
| **Test number** | T20 |
| **Route** | `POST` logout on Apex `/logout` (or account), `/member/logout`, `/branch-admin/logout`, `/hq/logout`, `/admin/logout` |
| **Hostname** | Matching shell host |
| **Role** | Each persona |
| **Setup** | Authenticated session |
| **Action** | Logout **with** CSRF; retry protected route; attempt logout **without** CSRF |
| **Expected result** | Session cleared; protected → login/transfer; missing CSRF → **403** |
| **Evidence to capture** | Cookie jar after logout; 403 proof |
| **Cleanup** | None |
| **Failure classification** | SECURITY · PRODUCT |

### T21 — Wrong-role access

| Field | Detail |
|-------|--------|
| **Test number** | T21 |
| **Route** | Cross-hit matrix: MEM→`/branch-admin`,`/hq`,`/admin`; BA→`/hq`,`/admin`; HQ→`/admin`; PA on tenant `/member` (must not imply membership) |
| **Hostname** | Tenant and Apex as applicable |
| **Role** | Wrong role for target |
| **Setup** | Four persona sessions |
| **Action** | Request each forbidden surface |
| **Expected result** | **403** HTML forbidden or controlled redirect policy; never **200** with other-role data; never UUID dump |
| **Evidence to capture** | Status + short body snippet per pair |
| **Cleanup** | Close windows |
| **Failure classification** | SECURITY (if 200 with data) · PRODUCT |

### T22 — Wrong-branch access

| Field | Detail |
|-------|--------|
| **Test number** | T22 |
| **Route** | BA scoped to `hq` attempts another branch’s BA URLs / HQ branch jump to foreign key |
| **Hostname** | Tenant |
| **Role** | BA (and HQ jump) |
| **Setup** | Prefer second disposable branch fixture. If only `hq` exists → **Skip** (`SKIP_FIXTURE`) |
| **Action** | Request other-branch admin paths; HQ open inactive/unknown branch key |
| **Expected result** | **403**/**404** controlled; no other-branch member/registration leak |
| **Evidence to capture** | Status + URL; note fixture used |
| **Cleanup** | Do not leave shared demo branch inactive |
| **Failure classification** | SECURITY · SKIP_FIXTURE · PRODUCT |

### T23 — Wrong-church access

| Field | Detail |
|-------|--------|
| **Test number** | T23 |
| **Route** | Staff/member of `diagnostic-church` hits another org’s tenant host (if exists) or forged church-scoped IDs |
| **Hostname** | Other tenant host **or** Tenant with forged IDs |
| **Role** | HQ/BA/MEM |
| **Setup** | Second org only if disposable. Else attempt IDOR on known object IDs from HTML (should 404) |
| **Action** | Open other host portals; swap IDs in URLs |
| **Expected result** | Fail-closed **403**/**404**; no cross-church data |
| **Evidence to capture** | Status table; keys only |
| **Cleanup** | None |
| **Failure classification** | SECURITY · SKIP_FIXTURE · DATA |

### T24 — Inactive user

| Field | Detail |
|-------|--------|
| **Test number** | T24 |
| **Route** | Apex `POST /login` with inactive user; then protected routes |
| **Hostname** | Apex / Tenant |
| **Role** | INACTIVE_USER fixture |
| **Setup** | Disposable user with `blessboard.users.status` ≠ `active` (operator-approved). Do not disable shared PA/HQ/BA without recovery plan |
| **Action** | Attempt login and transfer |
| **Expected result** | Login denied / controlled error; no session grant; no stack |
| **Evidence to capture** | Error page shot; status |
| **Cleanup** | Re-activate fixture via approved CLI/UI only |
| **Failure classification** | SECURITY · SKIP_FIXTURE · PRODUCT |

### T25 — Inactive branch

| Field | Detail |
|-------|--------|
| **Test number** | T25 |
| **Route** | HQ `/hq/branches/:branchKey` and BA entry for inactive branch |
| **Hostname** | Tenant |
| **Role** | HQ / BA |
| **Setup** | **Only** disposable inactive branch — do **not** inactivate primary `hq` on shared demo without approval |
| **Action** | Resolve/jump to inactive branch |
| **Expected result** | Controlled inactive / **404**; not served as live admin |
| **Evidence to capture** | Status + body reason keys |
| **Cleanup** | Re-activate via approved procedure |
| **Failure classification** | PRODUCT · SKIP_FIXTURE · CONFIG |

### T26 — Suspended church / website

| Field | Detail |
|-------|--------|
| **Test number** | T26 |
| **Route** | Tenant `/` (and login) when church/website suspended |
| **Hostname** | Tenant (throwaway) or documented suspended fixture |
| **Role** | ANON |
| **Setup** | Do **not** suspend `diagnostic-church` on shared testing without approval. Prefer separate throwaway org |
| **Action** | Open public home + `/login` |
| **Expected result** | Controlled unavailable (`website_suspended` / catalogue inactive) — not 500 stack; no catalogue bypass |
| **Evidence to capture** | Status; log keys only |
| **Cleanup** | Restore status via approved operator procedure |
| **Failure classification** | PRODUCT · SKIP_FIXTURE · SECURITY if bypass |

### T27 — CSRF rejection

| Field | Detail |
|-------|--------|
| **Test number** | T27 |
| **Route** | Representative POSTs: apex logout, BA settings or registration decision, media upload/archive, PA mutation if exercised |
| **Hostname** | Apex / Tenant |
| **Role** | Matching authenticated role |
| **Setup** | Valid session; strip/omit CSRF token |
| **Action** | Submit without `_csrf` / header |
| **Expected result** | **403**; HTML or JSON `{ ok:false, reason:"csrf" }` for media APIs; **no** state change |
| **Evidence to capture** | Network status + response body (redact cookies) |
| **Cleanup** | Re-submit correctly once to confirm still works |
| **Failure classification** | SECURITY |

### T28 — Mobile navigation

| Field | Detail |
|-------|--------|
| **Test number** | T28 |
| **Route** | Same hosts as T01–T17 at ≤390px (spot 320px) |
| **Hostname** | Apex + Tenant |
| **Role** | ANON + one staff + MEM |
| **Setup** | Device or DevTools responsive |
| **Action** | Open drawers/bottom tabs; Tab/Escape; primary CTAs |
| **Expected result** | No horizontal scroll; focus trap in drawers; bottom tabs = enabled subset; touch targets usable; Powered by GetPro where required |
| **Evidence to capture** | 320/390 screenshots; note overflow selector if any |
| **Cleanup** | None |
| **Failure classification** | A11Y_UX · PRODUCT |

### T29 — No secret leakage

| Field | Detail |
|-------|--------|
| **Test number** | T29 |
| **Route** | Spot: Apex `/`, `/login`, `/account`, `/admin/deployments/:code`; Tenant `/`, `/register`, `/member`, `/hq/audit`, `/branch-admin` |
| **Hostname** | Both |
| **Role** | ANON + PA + HQ |
| **Setup** | View Source / search HTML+JSON |
| **Action** | Search `DATABASE_URL`, `SESSION_SECRET`, `password`, connection strings, raw transfer tokens, storage keys, env cookie names |
| **Expected result** | No secrets; deployment diagnostics pass/fail only; audit refs truncated |
| **Evidence to capture** | Matching snippet redacted mid-value; URL; role |
| **Cleanup** | If leaking → routing `off` immediately |
| **Failure classification** | SECURITY |

### T30 — No dead links

| Field | Detail |
|-------|--------|
| **Test number** | T30 |
| **Route** | Primary nav + footer + dashboard quick actions on Apex, Tenant public, Member, BA, HQ, PA |
| **Hostname** | Both |
| **Role** | Matching persona per shell |
| **Setup** | Authoritative mode |
| **Action** | Click every primary enabled control once |
| **Expected result** | **200** or intentional unavailable non-link; no **404** for enabled nav |
| **Evidence to capture** | `href` → status table |
| **Cleanup** | File defect ticket; no DB change |
| **Failure classification** | PRODUCT |

### T31 — No legacy database / session usage

| Field | Detail |
|-------|--------|
| **Test number** | T31 |
| **Route** | N/A (ops + runtime) |
| **Hostname** | N/A (DB + Hostinger env) |
| **Role** | Operator |
| **Setup** | Read-only DB verify + env inspection (values redacted) |
| **Action** | Confirm `public.tenants` / `public.session` absent; app uses `DATABASE_URL` + V5 `platform.deployment_sessions`; `GETPRO_DATABASE_URL` unset; identity `blessboard-platform-v5` |
| **Expected result** | Legacy tables null; host-only session cookie; no V4 `public.session` store |
| **Evidence to capture** | Identity check output (no secrets); env key presence list |
| **Cleanup** | Do not recreate legacy tables |
| **Failure classification** | CONFIG · SECURITY |

---

## 2. Desktop checklist (≥1280px)

| # | Check | ☐ |
|---|-------|---|
| D1 | Apex first viewport: brand, hero, CTAs, no KPI clutter | ☐ |
| D2 | Features / Pricing / Directory / Register-Church enquiry OK | ☐ |
| D3 | Tenant Home desktop nav (not hamburger) | ☐ |
| D4 | Apex login dual-pane / account chrome | ☐ |
| D5 | Member sidebar ≥900px | ☐ |
| D6 | Branch Admin sidebar + tables | ☐ |
| D7 | HQ sidebar + branch selector | ☐ |
| D8 | Platform Admin dark ops sidebar + tables | ☐ |
| D9 | Focus-visible rings on primary controls | ☐ |
| D10 | No horizontal overflow on main shells | ☐ |

---

## 3. Mobile checklist (≤390px; spot 320px)

| # | Check | ☐ |
|---|-------|---|
| M1 | Apex drawer open/close + Escape | ☐ |
| M2 | Tenant public drawer | ☐ |
| M3 | Member bottom tabs + drawer | ☐ |
| M4 | BA / HQ / PA bottom tabs + drawer | ☐ |
| M5 | Forms usable; primary button not clipped by keyboard | ☐ |
| M6 | Media picker drawer stack ≤767px | ☐ |
| M7 | Cards/tables switch to mobile card pattern | ☐ |
| M8 | No horizontal scroll at 320px | ☐ |
| M9 | Touch targets ≥44px on icon toggles | ☐ |
| M10 | Powered by GetPro where shell requires | ☐ |

---

## 4. Database verification checklist

Run **read-only** checks only. Do not invent INSERT/UPDATE/DELETE for smoke.

| # | Check | Pass criteria | ☐ |
|---|-------|---------------|---|
| DB1 | Identity | `blessboard-platform-v5` / expected env | ☐ |
| DB2 | Forbidden legacy | `public.tenants` and `public.session` absent | ☐ |
| DB3 | Org | `diagnostic-church` active / `testing` | ☐ |
| DB4 | Enrolment | BlessBoard product enrolment `active` | ☐ |
| DB5 | Church + HQ/primary | `diagnostic-church` / `hq` active; `is_primary` true | ☐ |
| DB6 | Domain | `diagnostic.blessboard.org` active canonical → `blessboard-org-v5` | ☐ |
| DB7 | Deployment | `blessboard-org-v5` active / `testing` | ☐ |
| DB8 | Roles | Active PA, HQ, BA role rows | ☐ |
| DB9 | Member | Active member + primary membership on `hq` | ☐ |
| DB10 | Content | Published `home` + `about` (or accepted empty with ticket) | ☐ |
| DB11 | Samples | ≥1 safe row in modules you will click | ☐ |
| DB12 | No `GETPRO_DATABASE_URL` on V5 host | Unset | ☐ |

---

## 5. Authorization checklist

| # | Check | ☐ |
|---|-------|---|
| A1 | MEM cannot open BA / HQ / PA | ☐ |
| A2 | BA cannot open HQ / PA | ☐ |
| A3 | HQ cannot open PA | ☐ |
| A4 | PA on tenant does not gain membership portal by default | ☐ |
| A5 | Branch scope: BA sees only assigned branch data | ☐ |
| A6 | Church scope: no cross-org IDOR on object URLs | ☐ |
| A7 | Unauthenticated protected routes → login/transfer | ☐ |
| A8 | Inactive user cannot establish session (T24) | ☐ |
| A9 | Inactive branch / suspended church fail closed (T25–T26) | ☐ |
| A10 | Wrong-role matrix evidence saved (T21) | ☐ |

---

## 6. Security checklist

| # | Check | ☐ |
|---|-------|---|
| S1 | CSRF present on all state-changing forms tested | ☐ |
| S2 | CSRF missing → 403 / safe JSON `reason` (media) | ☐ |
| S3 | Session cookie host-only; not parent-domain shared | ☐ |
| S4 | Transfer `tr` opaque; not raw secrets in HTML | ☐ |
| S5 | No open redirect on `next` (allowlisted paths only) | ☐ |
| S6 | No secret leakage (T29) | ☐ |
| S7 | Media: SVG rejected; private not public | ☐ |
| S8 | Audit/admin pages redact tokens/connection strings | ☐ |
| S9 | Unknown host controlled 404/503 (not stack) | ☐ |
| S10 | Legacy `public.tenants` / `public.session` / `GETPRO_DATABASE_URL` unused (T31) | ☐ |

---

## 7. Media checklist

| # | Check | ☐ |
|---|-------|---|
| MD1 | Picker opens from content admin | ☐ |
| MD2 | Library church-scoped only | ☐ |
| MD3 | Upload allowlisted types/sizes | ☐ |
| MD4 | SVG / oversize rejected | ☐ |
| MD5 | CSRF required on upload + archive | ☐ |
| MD6 | Soft-archive confirm honest (no fabricated in-use blockers) | ☐ |
| MD7 | Detail panel shows safe metadata only | ☐ |
| MD8 | Public delivery path works for public assets | ☐ |
| MD9 | Private assets denied to ANON | ☐ |
| MD10 | No storage keys / credentials in HTML or JSON | ☐ |

---

## 8. Post-deployment checklist

Run immediately after Hostinger restart / routing change.

| Step | Action | Expect | ☐ |
|------|--------|--------|---|
| P1 | `GET /healthz` on Apex | **200** ok V5 mode string | ☐ |
| P2 | Apex `/` + `/login` | **200** | ☐ |
| P3 | Confirm routing mode env | matches intended (`shadow` then later `authoritative`) | ☐ |
| P4 | Shadow (if applicable): Tenant `/` | **200** foundation; log `blessboard_tenant_route_shadow` | ☐ |
| P5 | Authoritative: Tenant `/` | **200** tenant shell | ☐ |
| P6 | One PA login + `/admin` | **200** | ☐ |
| P7 | One HQ transfer → `/hq` | **200** | ☐ |
| P8 | One BA transfer → `/branch-admin` | **200** | ☐ |
| P9 | One MEM → `/member` | **200** | ☐ |
| P10 | Logout all personas | sessions cleared | ☐ |
| P11 | Capture evidence pack | screenshots + HAR notes + mode timestamp | ☐ |
| P12 | Go / Hold / Rollback decision | recorded below | ☐ |

**Decision:** ☐ Go · ☐ Hold · ☐ Rollback

---

## 9. Rollback checklist

**Immediate rollback triggers**

1. Apex `/` or `/login` **5xx** or auth completely broken.
2. Session cookie set on parent `.blessboard.org` Domain.
3. Cross-tenant / cross-church data visible (**SECURITY**).
4. Secret leakage in HTML/JSON (**SECURITY**).
5. Private media publicly readable.
6. Tenant host serves wrong product shell after authoritative cutover with no recovery path.

**Rollback steps**

```bash
# Hostinger env + restart all workers
BLESSBOARD_TENANT_ROUTING_MODE=off
```

Then:

| Step | Action | ☐ |
|------|--------|---|
| R1 | Confirm mode `off` after restart | ☐ |
| R2 | Apex `/healthz` **200** | ☐ |
| R3 | Apex `/` + `/login` **200** | ☐ |
| R4 | Tenant host no longer serves authoritative CMS (foundation/unavailable as designed) | ☐ |
| R5 | Notify stakeholders; preserve evidence pack | ☐ |
| R6 | Do **not** recreate `public.tenants` / `public.session` | ☐ |
| R7 | Do **not** set `GETPRO_DATABASE_URL` on V5 | ☐ |

DNS revert only if apex itself is broken beyond routing mode.

---

## 10. Evidence pack (minimum)

| Artifact | Required |
|----------|----------|
| Desktop screenshots: Apex home, Tenant home, one portal per role | Yes |
| Mobile screenshots: Apex drawer, Tenant home, one admin shell | Yes |
| Cookie attribute shot (host-only) | Yes |
| One CSRF failure proof | Yes |
| One 403 wrong-role proof | Yes |
| Media upload success + SVG reject | If T18–T19 run |
| DB verify notes (keys only, no secrets) | Yes |
| Routing mode + timestamp | Yes |
| Go/Hold/Rollback decision | Yes |

---

## 11. Suggested run order (same day)

1. Database checklist DB1–DB12
2. Security/env spot (S3, T31)
3. Post-deploy P1–P5
4. T01–T05 (apex marketing)
5. T06–T10 (tenant public + auth transfer)
6. T11–T14 (registration → member)
7. T15–T17 (BA → HQ → PA)
8. T18–T19 (media)
9. T20–T21, T27, T29–T30 (logout, authz, CSRF, secrets, links)
10. T28 (mobile sweep)
11. T22–T26 only with safe fixtures (else Skip)
12. Sign-off (section 8)

---

## 12. Plan execution verdict

| Item | Status |
|------|--------|
| Plan document complete (T01–T31 + all checklists) | **Ready** |
| Executable against current hosted demo tenant **without** further setup | **Not yet** — close gaps in [`V5_DEMO_TENANT_READINESS.md`](./V5_DEMO_TENANT_READINESS.md) first |
| Executable after users + published content + authoritative routing | **Yes** |
| Apex-only / shadow partial run | **Yes** (T01–T05, T09 partial, T29–T31) |

**Bottom line:** The smoke-test **plan is ready to execute** as an operator runbook. Do **not** start the full authoritative journey until demo-tenant readiness reports users, roles, Home/About, and (for module clicks) sample rows as READY.
