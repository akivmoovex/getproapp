# BlessBoard V5 tenant public GUI audit

**Date:** 2026-07-18  
**Scope:** Tenant public routes only (`/`, `/about`, `/leadership`, `/ministries`, `/events`, `/sermons`, `/contact`, `/giving`, `/register`, `/register/submitted`, tenant `/login`)  
**Stitch project:** `projects/17124191473876947591` (GetPro Church Platform) via live MCP  
**Constraint:** Audit only — no code changes.

**Canonical screen rule:** Prefer **populated / refined** variants with screenshot + HTML over empty or duplicate titles. Older base titles kept as alternates only.

---

## Shared chrome (current V5 vs Stitch / V4)

| Concern | Current V5 | Stitch / V4 reference | Gap |
|---------|------------|----------------------|-----|
| Shared public header/footer | **None as partials** — duplicated markup in `page.ejs`, `register.ejs`, `register-submitted.ejs` | Stitch: sticky brand header, primary nav, footer with Powered by GetPro; V4: `public_shell_start` / `public_shell_end` | Extract V5 partials; add lockup + footer |
| Shared mobile navigation | **None** — wrapping link row only (`.bb-tp-nav`) | Stitch/V4: hamburger + drawer | Missing drawer/JS |
| Shared CSS tokens | `public/blessboard/v5/tenant-public.css` (`--bb-violet`, `--bb-ink`, `--bb-muted`, `--bb-bg`, `--bb-surface`, `--bb-line`, `--bb-ok`, `--bb-warm`) | Sacred Modernity: Hanken Grotesk, violet `#6C5CE7`, warm neutrals, full-bleed heroes | Tokens thin; no spacing/type scale; no hero/layout primitives |
| Font load | CSS names Hanken; **no** `<link>` to Google Fonts | Required for Sacred Modernity | Falls back to system-ui |
| Brand lockup | Text-only `.bb-tp-brand` | Logo + Powered by GetPro (orange GetPro) | Missing assets/partial |
| Dev badges | “BlessBoard V5” / env pills in header | Not in Stitch product chrome | Remove from production public UI (keep testing badge if needed, scoped) |

### Routes with no dedicated Stitch screen

| Route | Notes |
|-------|--------|
| Tenant `/login` | Stitch has **member login** (`09-auth-*`) but that is a **password form**. V5 tenant `/login` **never renders a form** — it creates an auth transfer and **303-redirects to apex**. No tenant EJS. Do not invent a tenant password page. |
| CMS empty states | Stitch has empty variants for leadership/events/sermons/giving; V5 uses generic `.bb-tp-empty` — no separate Stitch “empty route”. |

### V4 behavior that must **not** be copied into V5

1. **Apex marketing chrome** on tenant hosts (`church-body--apex`, Register Your Church, Find a Church, platform nav).
2. **`public.tenants` / legacy path prefixes** (`publicPathPrefix`, `/branch/website-preview`).
3. **Hardcoded demo imagery / Stitch sample copy** as if it were live CMS (`home_branch.ejs` stitch lead fallbacks, demo QR, Kafue map as default content).
4. **Inter font** for tenant public (V4 non-apex used Inter; V5/Stitch use **Hanken Grotesk**).
5. **Password collection on tenant host** (V4 could serve `/login` locally; V5 must keep transfer-only).
6. **Serving Stitch PNG exports as UI** (inventory rule).
7. **Material Symbols + Explore dropdown** only if Stitch desktop/mobile for *tenant* screens require them — do not blindly port V4 nav JS; match Stitch per device.
8. **V4 `church.css` monolith** — keep V5 scoped under `.bb-tp-*` / `public/blessboard/v5/*` so tenant/auth shells stay isolated.

---

## Per-route matrix

Backend column = already available on V5 foundation when `BLESSBOARD_TENANT_ROUTING_MODE=authoritative` (CMS published rows / registration / transfer).

### `/` (home)

| Field | Value |
|-------|--------|
| Stitch desktop | **`ead45db5be774baa9454412262096ffc`** — `01-public-home-desktop-v2 (Refined)` |
| Stitch mobile | **`89177588fbf8405dbebd5747c38e19ce`** — `01-public-home-mobile-v2 (Refined)` |
| Alternates | Duplicate base `01-public-home-desktop/mobile` IDs (do not use for parity) |
| Current V5 view | `views/blessboard/v5/public/page.ejs` (`pageKey=home`) |
| Relevant V4 view | `views/church/public/home.ejs` → `partials/home_branch.ejs` |
| Status | **placeholder** |
| Backend | `loadTenantPublicPageModel` + `publicContentReadService` (sections) |
| Missing assets | Full-bleed hero (repo has `public/church/images/tenant-public/home-desktop-hero.jpg`, `home-mobile-hero.jpg`, `home-mobile-map.jpg` — **unwired** in V5); ministry cards; logo lockup |
| Main visual gaps | No hero plane; no CTA group; inset list shell; no desktop/mobile composition split; “BlessBoard V5” badge |
| Batch | **B1 shell + B2 home** |

### `/about`

| Field | Value |
|-------|--------|
| Stitch desktop | **`44492f6abbe849d0a8a89303ce83129b`** — `02-public-about-desktop-v3 (Populated)` |
| Stitch mobile | **`3f0b8a5c30544d9495064df8d5f9e62e`** — `02-public-about-mobile-v3 (Populated)` |
| Alternates | Base `4537dc72…` / `338e5c78…`; sample DS `fa8f1b84…` (ignore for product) |
| Current V5 view | `page.ejs` (`pageKey=about`) |
| Relevant V4 view | `views/church/public/about.ejs` |
| Status | **placeholder** |
| Backend | Same CMS sections |
| Missing assets | About hero / culture collage (`public/church/images/about/*`, `tenant-public/about-hero-building.jpg` unwired) |
| Main visual gaps | No page hero; flat section stack; no values/culture grid |
| Batch | **B3 inner pages** |

### `/leadership`

| Field | Value |
|-------|--------|
| Stitch desktop | **`372faa60f8df4983b627db3cb5d35f9d`** — `03-public-leadership-desktop-v2 (Populated)` |
| Stitch mobile | **`0f4e816fd64d4592bd3677fbde3b7544`** — `03-public-leadership-mobile-v4 (Restored)` |
| Empty variant | `5f7b1d44…` desktop empty — use for empty-state parity only |
| Current V5 view | `page.ejs` + leader list |
| Relevant V4 view | `views/church/public/leadership.ejs` |
| Status | **placeholder** |
| Backend | Published `leaders` via read service |
| Missing assets | Pastor/elder portraits (`public/church/images/leadership/*` unwired as Stitch chrome; CMS `imageUrl` OK when set) |
| Main visual gaps | Card grid/profile layout vs plain `.bb-tp-item` list; no featured pastor treatment |
| Batch | **B3** |

### `/ministries`

| Field | Value |
|-------|--------|
| Stitch desktop | **`f146cdccadb34ff3bd8b0b75a0450d15`** — `04-public-ministries-desktop-v4 (Populated)` |
| Stitch mobile | **`d2fd7ecc586541d3beb5d0d3bed98d56`** — `04-public-ministries-mobile-v4 (Populated)` |
| Alternates | v3 `67fdba76…` / `ba2fbcfd…` |
| Current V5 view | `page.ejs` + ministry list |
| Relevant V4 view | `views/church/public/ministries.ejs` |
| Status | **placeholder** |
| Backend | Published `ministries` |
| Missing assets | Ministry imagery (V4/Stitch under `leadership/ministry-*`, `homepage/mobile-ministry-*`) |
| Main visual gaps | Image cards / grid; meeting meta styling |
| Batch | **B3** |

### `/events`

| Field | Value |
|-------|--------|
| Stitch desktop | **`6f618576f0304982bd239bfe04946e72`** — `05-public-events-desktop-v2 (Populated)` (list) |
| Stitch mobile | **`f58c416cbbd545429258d963b3a15b60`** — `05-public-events-mobile-v2 (Populated)` |
| Calendar alternates | `84b91938…` / `25677650…` desktop calendar; `0a38bd5b…` / `26db8f19…` mobile — **not** matched by V5 list renderer |
| Empty | `6c3a2b46…` |
| Current V5 view | `page.ejs` + event list |
| Relevant V4 view | `views/church/public/events.ejs` |
| Status | **placeholder** (layout); calendar Stitch = **obsolete** for current V5 data model unless calendar is re-scoped |
| Backend | Published `events` (list + registration URL) |
| Missing assets | Event covers (`public/church/images/events/*`) |
| Main visual gaps | Featured event; date chrome; no calendar UI (by design of V5 CMS) |
| Batch | **B3** (list parity); calendar deferred |

### `/sermons`

| Field | Value |
|-------|--------|
| Stitch desktop | **`4f4995dc4ec84354ac80ed022a767ef3`** — `06-public-sermons-desktop-v2 (Populated)` |
| Stitch mobile | **`96b380d4e47649c1bd7f05cabe9c3a1d`** — `06-public-sermons-mobile-v2 (Populated)` |
| Alternates | `ebe20757…` / `5902746f…` “sermons-resources”; empty `0c7262cd…` |
| Current V5 view | `page.ejs` + sermon list |
| Relevant V4 view | `views/church/public/sermons.ejs` |
| Status | **placeholder** |
| Backend | Published `sermons` |
| Missing assets | Featured/thumbs (`public/church/images/sermons/*`) |
| Main visual gaps | Featured row; media/resource affordances as layout not link stack |
| Batch | **B3** |

### `/contact`

| Field | Value |
|-------|--------|
| Stitch desktop | **`ab93d842bf2e49caa838a1fd414eb35b`** — `08-public-contact-desktop-v2 (Populated)` |
| Stitch mobile | **`9cbad6aacb6246549913e275f228fa80`** — `08-public-contact-mobile-v2 (Populated)` |
| Alternates | Base `6d4d6ae2…` / `8f6f1528…` |
| Current V5 view | `page.ejs` + contact channels |
| Relevant V4 view | `views/church/public/contact.ejs` |
| Status | **placeholder** |
| Backend | Published `contact_channels` |
| Missing assets | Map (`contact/contact-map-desktop.jpg`, `contact-map-mobile.jpg`) |
| Main visual gaps | Map block; channel iconography; form-less info layout vs Stitch |
| Batch | **B3** |

### `/giving`

| Field | Value |
|-------|--------|
| Stitch desktop | **`59c8fdedf68a43e3a5d2384b0c2212df`** — `07-public-giving-desktop-v2 (Populated)` |
| Stitch mobile | **`a0616f23568c464a95eda9e317e2fa9d`** — `07-public-giving-mobile-v2 (Populated)` |
| Alternates | `14115440…` / `5b65875a…` “giving-information”; empty `a08093b9…` |
| Current V5 view | `page.ejs` + giving methods |
| Relevant V4 view | `views/church/public/giving.ejs` |
| Status | **placeholder** |
| Backend | Published `giving_methods` (info only — no payment gateway) |
| Missing assets | QR / method visuals (`giving/*`) — only if CMS/media provides; do not hardcode demo QR |
| Main visual gaps | Method cards; instructions hierarchy; avoid fake payment UI |
| Batch | **B3** |

### `/register`

| Field | Value |
|-------|--------|
| Stitch desktop | **`c360aef636d341a8ad3eb47c4c2e5c21`** — `10-auth-member-registration-desktop` |
| Stitch mobile | **`7d77190575b54d1b8277726570aec1c4`** — `10-auth-member-registration-mobile` |
| Current V5 view | `views/blessboard/v5/public/register.ejs` |
| Relevant V4 view | `views/church/auth/register.ejs` (+ `register_closed.ejs`) |
| Status | **close** (fields/CSRF/host-scope work); visual **placeholder** |
| Backend | `createTenantRegistrationRouter` + `memberRegistrationService` |
| Missing assets | Auth dual-layout imagery (`auth/login-bg-desktop.jpg` pattern); brand lockup |
| Main visual gaps | Auth split layout; typography; missing closed-state Stitch if registration disabled |
| Batch | **B4 auth** |

### `/register/submitted`

| Field | Value |
|-------|--------|
| Stitch desktop | **`1d37704351d6425ca872f8803322175c`** — `11-auth-registration-submitted-desktop` |
| Stitch mobile | **`f222e55152c349cc880548037aa7d540`** — `11-auth-registration-submitted-mobile` |
| Current V5 view | `views/blessboard/v5/public/register-submitted.ejs` |
| Relevant V4 view | `views/church/auth/registration_submitted.ejs` |
| Status | **close** (copy/flow); visual **placeholder** |
| Backend | Same registration router (GET confirmation) |
| Missing assets | `auth/registration-submitted.jpg` unwired |
| Main visual gaps | Confirmation composition; illustration |
| Batch | **B4** |

### Tenant `/login`

| Field | Value |
|-------|--------|
| Stitch desktop | **`9b264ef3081f4b5aab493d9b9710b00b`** — `09-auth-member-login-desktop` |
| Stitch mobile | **`68a84bcc8dff4f4ca5836216c22a2e6a`** — `09-auth-member-login-mobile` |
| Current V5 view | **None** — `v5FoundationServer` redirects to apex `/login?tr=…` |
| Visual target for password UI | Inline `renderLoginPage` in `src/blessboard/http/renderTenantLandingPage.js` (**apex**) |
| Relevant V4 view | `views/church/auth/login.ejs` |
| Status | **obsolete** as a tenant rendered page; Stitch login applies to **apex transfer login** → treat as **placeholder** there |
| Backend | `createTenantLoginTransferRequest` / auth transfer — **available** |
| Missing assets | Login background (`auth/login-bg-desktop.jpg`) for apex form |
| Main visual gaps | Apex form is minimal inline CSS; tenant never shows Stitch login chrome (correct) |
| Batch | **B4** (style apex login used after tenant redirect; optional brief tenant interstitial only if product wants — not in Stitch as redirect) |

---

## Status rollup

| Route | Status |
|-------|--------|
| `/` | placeholder |
| `/about` | placeholder |
| `/leadership` | placeholder |
| `/ministries` | placeholder |
| `/events` | placeholder (calendar Stitch obsolete for V5 list) |
| `/sermons` | placeholder |
| `/contact` | placeholder |
| `/giving` | placeholder |
| `/register` | close (functional) / placeholder (visual) |
| `/register/submitted` | close (functional) / placeholder (visual) |
| Tenant `/login` | no tenant view (redirect); Stitch maps to apex login placeholder |

**None** in this scope are **exact**.

---

## Recommended implementation batches

### B0 — Preconditions (ops, not GUI)
Authoritative tenant host + published CMS content + media buckets as needed. GUI work can proceed against local fixtures.

### B1 — Shared tenant public shell
Shared header/footer partials, Hanken load, Powered by GetPro, mobile drawer matching Stitch, token expansion in `tenant-public.css`, remove production “BlessBoard V5” chrome. Wire logo assets.

### B2 — Home (`/`)
Desktop + mobile compositions from refined Stitch IDs; full-bleed hero; CTA; section mapping from CMS without hardcoding demo copy.

### B3 — Inner CMS pages
About → Leadership → Ministries → Events (list) → Sermons → Contact → Giving, each against populated Stitch pair; empty states from empty variants where they exist.

### B4 — Registration + login chrome
`/register`, `/register/submitted` Stitch auth layouts; apex `renderLoginPage` Stitch dual layout (tenant stays redirect-only).

### B5 — Visual regression
Playwright/browser compare vs Stitch screenshots for desktop and mobile breakpoints; bump CSS `?v=`.

**Do not** batch-copy `views/church/*` or `church.css` wholesale.

---

## Exact files likely to change (when implementing)

### Create / extract
- `views/blessboard/v5/partials/tenant-public-shell-start.ejs`
- `views/blessboard/v5/partials/tenant-public-shell-end.ejs`
- `views/blessboard/v5/partials/tenant-public-nav.ejs` (desktop + mobile drawer)
- `views/blessboard/v5/partials/powered_by_getpro.ejs` (or reuse/adapt existing powered-by partial under V5 scope)
- `public/blessboard/v5/tenant-public.js` (drawer only, if needed)
- Optional: `public/blessboard/images/tenant-public/**` (copy/relocate from `public/church/images` — prefer V5-scoped paths)

### Edit (primary)
- `views/blessboard/v5/public/page.ejs`
- `views/blessboard/v5/public/register.ejs`
- `views/blessboard/v5/public/register-submitted.ejs`
- `public/blessboard/v5/tenant-public.css`
- `src/blessboard/http/renderTenantPublicPage.js` (partial includes / asset helpers)
- `src/blessboard/http/loadTenantPublicPageModel.js` (view-model fields for hero/CTA if needed — **no business-logic change** beyond presentation DTOs)
- `src/blessboard/http/renderTenantLandingPage.js` (apex login Stitch chrome only)
- `src/blessboard/http/tenantRegistrationRoutes.js` (template locals only, if shell needs them)

### Touch lightly / verify only
- `src/blessboard/http/tenantPublicRoutes.js` (routing unchanged)
- `src/platform/http/v5FoundationServer.js` (login redirect unchanged)
- CSS cache bust wherever public shell links `tenant-public.css?v=`

### Do **not** change for this GUI phase
- `views/church/**`, `public/church/church.css` (V4)
- Registration/auth **services**, CSRF, transfer protocol
- Tenant routing mode semantics
- Stitch HTML downloads as runtime pages

---

## Canonical Stitch ID quick reference

| Route | Desktop ID | Mobile ID |
|-------|------------|-----------|
| `/` | `ead45db5be774baa9454412262096ffc` | `89177588fbf8405dbebd5747c38e19ce` |
| `/about` | `44492f6abbe849d0a8a89303ce83129b` | `3f0b8a5c30544d9495064df8d5f9e62e` |
| `/leadership` | `372faa60f8df4983b627db3cb5d35f9d` | `0f4e816fd64d4592bd3677fbde3b7544` |
| `/ministries` | `f146cdccadb34ff3bd8b0b75a0450d15` | `d2fd7ecc586541d3beb5d0d3bed98d56` |
| `/events` | `6f618576f0304982bd239bfe04946e72` | `f58c416cbbd545429258d963b3a15b60` |
| `/sermons` | `4f4995dc4ec84354ac80ed022a767ef3` | `96b380d4e47649c1bd7f05cabe9c3a1d` |
| `/contact` | `ab93d842bf2e49caa838a1fd414eb35b` | `9cbad6aacb6246549913e275f228fa80` |
| `/giving` | `59c8fdedf68a43e3a5d2384b0c2212df` | `a0616f23568c464a95eda9e317e2fa9d` |
| `/register` | `c360aef636d341a8ad3eb47c4c2e5c21` | `7d77190575b54d1b8277726570aec1c4` |
| `/register/submitted` | `1d37704351d6425ca872f8803322175c` | `f222e55152c349cc880548037aa7d540` |
| Tenant `/login` → apex form | `9b264ef3081f4b5aab493d9b9710b00b` | `68a84bcc8dff4f4ca5836216c22a2e6a` |

*End of audit.*
