# BlessBoard V5 — Stitch implementation backlog

**Created:** 2026-07-18  
**Companion map:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md)  
**Stitch project:** `projects/17124191473876947591` (GetPro Church Platform)  
**Constraint:** Presentation/CSS/EJS batches only unless a batch explicitly notes a product decision. Do not alter migrations, schema, authentication, authorization, sessions, or hostname resolution.

## How to use this backlog

- One batch = one shared shell, **or** 2–4 closely related screens, **or** one operational module.
- Prefer canonical Stitch IDs from the screen map (Populated / Refined / Restored).
- Never invent demo metrics, tickets, billing, or payment UI to match Stitch mocks.
- Run only the focused tests listed; avoid whole-suite runs unless a batch touches shared auth/host code (none of these should).

## Priority order (fixed)

1. Shared visual design system  
2. Apex Home, Login and Account  
3. Tenant public shell, Home and About  
4. Leadership and Ministries  
5. Events and Sermons  
6. Contact and Giving  
7. Registration and login transfer  
8. Member portal  
9. Branch administration  
10. HQ administration  
11. Platform administration  
12. Shared media picker/upload  
13. Responsive and accessibility audit  
14. Final Stitch parity audit  

---

## Batch 1 — Shared visual design system

**Objective:** Align Sacred Modernity tokens and shared UI states with Stitch Visual System Specification + Shared UI States Board without changing routes or data.

**Stitch screens involved**

| Title | ID |
|-------|-----|
| BlessBoard Visual System Specification | `c8d8352b1b95400cb25e32a79c2f0b2e` |
| BlessBoard Shared UI States Board | `b61a1ea8176648408211b681e942e0a6` |
| BlessBoard Public Visual System Board | `8f689e44024444839a9c3174f03d4101` |
| Logo / header / Powered by GetPro boards | `7880f0e354…`, `43d6d1cb…`, `2d430d96…`, `503ff0d7…`, `59da7230…` |

**V5 files likely involved**

- `public/blessboard/v5/design-tokens.css`
- `public/blessboard/v5/design-system.css`
- `public/blessboard/v5/design-system.js`
- `views/blessboard/v5/partials/empty-state.ejs`, `error-state.ejs`, `loading-state.ejs`, `success-state.ejs`, `flash-message.ejs`, `form-errors.ejs`, `powered-by-getpro.ejs`, `icon.ejs`

**Shared components affected:** empty/error/loading/success/flash/form-error patterns used by all shells.

**Backend risk:** Low  
**Visual risk:** Medium (token drift across portals)

**Focused tests**

- Existing structure/a11y tests that assert partials render
- `npm test -- tests/blessboard-v5-a11y-structure.test.js` (if present)

**Acceptance criteria**

- [ ] Token names/colors/radii documented against Stitch spec IDs
- [ ] Shared state partials reusable without per-portal copy/paste
- [ ] No route, auth, or schema changes
- [ ] Powered by GetPro lockup preserved on marketing/public shells

**Recommended commit message**

```
Align V5 design tokens and shared UI states with Stitch system boards.
```

---

## Batch 2 — Apex Home, Login and Account

**Objective:** Finish apex marketing home + login/account chrome against canonical Stitch; do not invent missing marketing routes in this batch unless scoped separately as 2b.

**Stitch screens involved**

| Screen | Desktop | Mobile |
|--------|---------|--------|
| Apex Home | `46081ff8f3d04090b9de33020bdf1530` | `9f9927a608024e4ebaae11f13e68bdc5` |
| Login | `9b264ef3081f4b5aab493d9b9710b00b` | `68a84bcc8dff4f4ca5836216c22a2e6a` |
| Account / auth-error | — (STITCH_MISSING) | — |

**Optional follow-on (Batch 2b — marketing routes):** Features, Pricing (+FAQ), For Churches, Register Church, Directory — all currently **MISSING** routes (`7ef3518f…`, `1c50e898…`, `c47840e7…`, `fc4bf5aa…`, `8640e853…`, `2b9df962…` + mobiles). Requires product decision to add routes; still no auth/session changes.

**V5 files likely involved**

- `views/blessboard/v5/apex/*.ejs`
- `views/blessboard/v5/partials/apex-shell-*.ejs`, `apex-nav-links.ejs`
- `public/blessboard/v5/apex.css`, `apex-auth.css`, `apex.js`
- `src/blessboard/http/renderTenantLandingPage.js` (presentation locals only)

**Shared components affected:** apex shell, auth chrome, Powered by GetPro.

**Backend risk:** Low (presentation); Medium if Batch 2b adds routes  
**Visual risk:** High (marketing first impression)

**Focused tests**

- Apex login / foundation home smoke tests already in repo
- CSRF cookie presence checks on `/login` if covered

**Acceptance criteria**

- [ ] Home D+M match canonical BlessBoard marketing IDs within known intentional nav gaps
- [ ] Login remains apex transfer auth; no tenant password form; no forgot-password without product decision
- [ ] Account/auth-error stay session-safe (no token/UUID leakage)
- [ ] Batch 2b not started without explicit route approval

**Recommended commit message**

```
Tighten apex home and login presentation to canonical Stitch pairs.
```

---

## Batch 3 — Tenant public shell, Home and About

**Objective:** Regress/polish tenant public shell + Home/About against refined/populated Stitch (already largely PARTIAL).

**Stitch screens involved**

| Screen | Desktop | Mobile |
|--------|---------|--------|
| Home v2 Refined | `ead45db5be774baa9454412262096ffc` | `89177588fbf8405dbebd5747c38e19ce` |
| About v3 Populated | `44492f6abbe849d0a8a89303ce83129b` | `3f0b8a5c30544d9495064df8d5f9e62e` |

**V5 files likely involved**

- `views/blessboard/v5/partials/tenant-public-shell-*.ejs`
- `views/blessboard/v5/public/page.ejs`, `home.ejs`, `about.ejs`
- `public/blessboard/v5/tenant-public.css`, `tenant-public.js`
- `src/blessboard/http/loadTenantPublicPageModel.js` (cache/CSS bump only)

**Shared components affected:** tenant public shell, empty states, Powered by GetPro.

**Backend risk:** Low  
**Visual risk:** Medium

**Focused tests**

- Tenant public page render tests
- Drawer/nav structure tests

**Acceptance criteria**

- [ ] No fabricated Stitch widgets (member counts, prayer, newsletter)
- [ ] Published CMS sections only; intentional empty states OK
- [ ] Obsolete home/about Stitch IDs not used as targets

**Recommended commit message**

```
Polish tenant public shell, home, and about against refined Stitch.
```

---

## Batch 4 — Leadership and Ministries

**Objective:** Directory chrome parity for leadership + ministries (PARTIAL → closer MATCHED candidates).

**Stitch screens involved**

| Screen | Desktop | Mobile |
|--------|---------|--------|
| Leadership populated | `372faa60f8df4983b627db3cb5d35f9d` | `0f4e816fd64d4592bd3677fbde3b7544` |
| Leadership empty | `5f7b1d44bd454d45a0b72fb76d94bbd0` | — |
| Ministries v4 | `f146cdccadb34ff3bd8b0b75a0450d15` | `d2fd7ecc586541d3beb5d0d3bed98d56` |

**V5 files likely involved**

- `views/blessboard/v5/public/leadership.ejs`, `ministries.ejs`
- `public/blessboard/v5/tenant-public.css`

**Shared components affected:** card grids, initials avatars, empty-state CTAs.

**Backend risk:** Low  
**Visual risk:** Medium

**Focused tests**

- Public leadership/ministries content tests if present

**Acceptance criteria**

- [ ] No Contact Pastor / fake schedules / fabricated stats
- [ ] Empty leadership uses empty Stitch reference pattern
- [ ] Mobile leadership uses v4 Restored, not obsolete v2 duplicates

**Recommended commit message**

```
Align leadership and ministries public directories with canonical Stitch.
```

---

## Batch 5 — Events and Sermons

**Objective:** List/featured Events + Sermons parity; explicitly skip calendar Stitch frames.

**Stitch screens involved**

| Screen | Desktop | Mobile |
|--------|---------|--------|
| Events populated | `6f618576f0304982bd239bfe04946e72` | `f58c416cbbd545429258d963b3a15b60` |
| Events empty | `6c3a2b460ac54e6a88336af9085e8c38` | — |
| Sermons populated | `4f4995dc4ec84354ac80ed022a767ef3` | `96b380d4e47649c1bd7f05cabe9c3a1d` |
| Sermons empty | `0c7262cdda4547739ec0c1fa5128fb51` | — |

**Do not implement:** `05-public-events-calendar-*` IDs.

**V5 files likely involved**

- `views/blessboard/v5/public/events.ejs`, `sermons.ejs`
- `public/blessboard/v5/tenant-public.css`

**Shared components affected:** list cards, featured blocks, empty states.

**Backend risk:** Low  
**Visual risk:** Medium

**Focused tests**

- Public events/sermons publish/list tests

**Acceptance criteria**

- [ ] List UI only; no calendar grid
- [ ] Empty states match empty Stitch references when no published content
- [ ] No demo sermon/event fabrications

**Recommended commit message**

```
Polish public events and sermons list UI to Stitch populated pairs.
```

---

## Batch 6 — Contact and Giving

**Objective:** Contact + Giving info pages against v2 populated Stitch; keep giving info-only.

**Stitch screens involved**

| Screen | Desktop | Mobile |
|--------|---------|--------|
| Giving populated | `59c8fdedf68a43e3a5d2384b0c2212df` | `a0616f23568c464a95eda9e317e2fa9d` |
| Giving empty | `a08093b9ec32467bad300ef43ac800fa` | — |
| Contact populated | `ab93d842bf2e49caa838a1fd414eb35b` | `9cbad6aacb6246549913e275f228fa80` |

**V5 files likely involved**

- `views/blessboard/v5/public/contact.ejs`, `giving.ejs`
- `public/blessboard/v5/tenant-public.css`

**Shared components affected:** method cards, channel list, contact form chrome, map block.

**Backend risk:** Low  
**Visual risk:** Medium

**Focused tests**

- Contact form validation/CSRF tests
- Giving methods publish tests

**Acceptance criteria**

- [ ] No payment gateway / QR invention
- [ ] Map only when lat/lng available
- [ ] Form posts unchanged

**Recommended commit message**

```
Align public contact and giving pages with Stitch populated designs.
```

---

## Batch 7 — Registration and login transfer

**Objective:** Tenant registration + submitted confirmation chrome; preserve apex login transfer (no tenant password UI).

**Stitch screens involved**

| Screen | Desktop | Mobile |
|--------|---------|--------|
| Registration | `c360aef636d341a8ad3eb47c4c2e5c21` | `7d77190575b54d1b8277726570aec1c4` |
| Submitted | `1d37704351d6425ca872f8803322175c` | `f222e55152c349cc880548037aa7d540` |
| Login (apex, already Batch 2) | `9b264ef3…` | `68a84bcc…` |

**Deferred (product decision required):** waiting-verification (`239beae5…` / `8e6e504f…`), forgot-password (`61a6861b…` / `f4bb9457…`) — status **MISSING**.

**V5 files likely involved**

- `views/blessboard/v5/public/register.ejs`, `register-submitted.ejs`
- `public/blessboard/v5/tenant-auth.css`, `tenant-auth.js`
- `src/blessboard/http/tenantRegistrationRoutes.js` (view-only)

**Shared components affected:** tenant-auth split panel, form errors.

**Backend risk:** Low (must not touch auth services)  
**Visual risk:** Medium

**Focused tests**

- Registration route / CSRF / closed-registration tests

**Acceptance criteria**

- [ ] Tenant `/login` still redirects to apex transfer
- [ ] Registration fields/validation unchanged
- [ ] No waiting-verification or forgot-password routes invented

**Recommended commit message**

```
Polish tenant registration and submitted screens to Stitch auth chrome.
```

---

## Batch 8 — Member portal

**Objective:** Member shell + module interiors for Stitch 14–22 and 24; defer prayer (23) until product adds route.

**Stitch screens involved (canonical pairs)**

| Screen | Desktop | Mobile | Route |
|--------|---------|--------|-------|
| Dashboard | `4207a5a6…` | `b315a9d1…` | `/member` |
| Profile | `a323f678…` | `55e21b65…` | `/member/profile` |
| Announcements | `63a9e613…` | `d7074e7c…` | `/member/announcements` |
| Events | `9a526853…` | `a4dc4a49…` | `/member/events` |
| Ministries | `05f9bdca…` | `53924d7e…` | `/member/ministries` |
| Resources | `d1690ab7…` | `d3232a4f…` | `/member/resources` |
| Forms | `745a1972…` | `0f801e19…` | `/member/forms` |
| Submit request | `2cfd58a5…` | `196260ba…` | `/member/requests/new` |
| Request status | `530cb58f…` | `6c5f8b31…` | `/member/requests` |
| Giving info | `3e723670…` | `236d4bf2…` | `/member/giving` |

**Split into sub-batches if needed:** 8a shell+dashboard+profile; 8b announcements/events/ministries; 8c forms/resources/requests/giving.

**V5 files likely involved**

- `views/blessboard/v5/partials/member-shell-*.ejs`
- `views/blessboard/v5/member/*`
- `views/blessboard/v5/announcements/member-*.ejs`
- `views/blessboard/v5/participation/member-*.ejs`
- `views/blessboard/v5/forms-requests/member-*.ejs`
- `public/blessboard/v5/member-portal.css`, `member-portal.js`

**Shared components affected:** member shell, bottom tabs, cards, empty states.

**Backend risk:** Low  
**Visual risk:** High (many screens)

**Focused tests**

- Member portal route/auth gate tests
- Forms/requests/participation member tests

**Acceptance criteria**

- [ ] No prayer CTA unless route exists
- [ ] Events remain list (not calendar)
- [ ] Giving remains info-only
- [ ] Authorization gates unchanged

**Recommended commit message**

```
Bring member portal modules closer to Stitch 14–22 and 24 chrome.
```

---

## Batch 9 — Branch administration

**Objective:** Branch shell + ops modules with Stitch pairs; content-admin PLACEHOLDER surfaces; defer schema-missing screens.

**In scope (Stitch-backed, V5 routes exist)**

| Module | Desktop | Mobile | Route |
|--------|---------|--------|-------|
| Dashboard | `001d1a02…` | `615f1f4e…` | `/branch-admin` |
| Verification | `87fe9bb7…` | `d352ed07…` | `/branch-admin/registrations` |
| Members | `3dae337c…` | `e90963b0…` | `/branch-admin/members` |
| Member profile | `5e5985a0…` | `b3fbd9e2…` | `/branch-admin/members/:id` |
| Announcements | `65941542…` | `daa41602…` | `/branch-admin/announcements` |
| Attendance | `d351ae0e…` / `12e5e7d8…` | mobiles | `/branch-admin/attendance` |
| Giving | `858c66cf…` / `cf849cdb…` | mobiles | `/branch-admin/giving` |
| Requests | `126bfebf…` / `22fe4b70…` | mobiles | `/branch-admin/requests` |
| Content PLACEHOLDER | `58c96b4c…`, `ad136a0e…`, `3f316066…` (+ mobiles) | content-admin | `/branch-admin/content*` |

**Out of scope / MISSING:** departments, duty roster, monthly reports 40–43.

**V5 files likely involved**

- `views/blessboard/v5/partials/branch-admin-shell-*.ejs`
- `views/blessboard/v5/branch-admin/*`
- `views/blessboard/v5/content-admin/*`
- `views/blessboard/v5/announcements/admin-*.ejs`, `attendance/admin-*.ejs`, `giving/admin-*.ejs`, `forms-requests/admin-*.ejs`
- `public/blessboard/v5/branch-admin.css`, `branch-admin.js`

**Shared components affected:** branch shell, tables, admin forms, content-admin entities.

**Backend risk:** Low–Medium (content-admin is shared with HQ; avoid behavior changes)  
**Visual risk:** High

**Focused tests**

- Branch registration/members tests
- Announcements / attendance / giving / forms-requests admin tests

**Acceptance criteria**

- [ ] No fabricated dashboard metrics
- [ ] No departments/roster/reports routes invented
- [ ] Prefer Stitch 25-* over obsolete 04-* dashboard
- [ ] Content-admin remains functional; visual lift only

**Recommended commit message**

```
Align branch-admin shell and ops modules with Stitch 25–39 and 44–45.
```

---

## Batch 10 — HQ administration

**Objective:** HQ shell + registry/reports/audit chrome using live aggregates only; defer Stitch-only workflows without V5 backend.

**In scope**

| Screen | Desktop | Mobile | Route |
|--------|---------|--------|-------|
| Dashboard | `538c8f4f…` | `c67eda76…` | `/hq` |
| Branch registry | `1a1aaecd…` | `2f154dfc…` | `/hq/branches` |
| Reports / analytics PLACEHOLDER | `f6b63697…`, `2a577dc1…` | mobiles | `/hq/reports` |
| Audit PLACEHOLDER | `80d249f8…`, `bce1e8ec…` | mobiles | `/hq/audit` |

**Out of scope / MISSING:** monthly review 54–55, roles 59, templates 60, broadcast 61.

**V5 files likely involved**

- `views/blessboard/v5/partials/hq-shell-*.ejs`, `branch-selector.ejs`
- `views/blessboard/v5/hq/*`
- `public/blessboard/v5/hq-admin.css`, `hq-admin.js`

**Shared components affected:** HQ shell, branch selector, report tables.

**Backend risk:** Low  
**Visual risk:** High (Stitch charts vs real aggregates)

**Focused tests**

- HQ reports/audit/members gate tests

**Acceptance criteria**

- [ ] No fake % trends / broadcast widgets
- [ ] No new monthly-report or role-management routes
- [ ] Shared HQ mounts of branch modules stay authorization-safe

**Recommended commit message**

```
Improve HQ shell and reports/audit presentation without inventing metrics.
```

---

## Batch 11 — Platform administration

**Objective:** Platform shell + orgs/plans/settings/deployments presentation; no create-org UI or ticket/health invention unless product explicitly unlocks Batch 11b.

**In scope**

| Screen | Desktop | Mobile | Route |
|--------|---------|--------|-------|
| Dashboard | `36c4708b…` | `513dd5cc…` | `/admin` |
| Organizations | `18da9665…` | `db6b741d…` | `/admin/organizations` |
| Org detail | `10f1dceb…` | `6633fa49…` | `/admin/organizations/:organizationKey` |
| Plans | `4d0f59ac…` | `b5953809…` | `/admin/plans` |
| Settings | `30e38567…` | `efb0fd24…` | `/admin/settings` |
| Deployments | `74cbe4a0…` | `9f400420…` | `/admin/deployments` |

**Out of scope / MISSING:** create-org UI `d992150d…` / `0da4f454…` until product + UI route approved.

**V5 files likely involved**

- `views/blessboard/v5/partials/platform-admin-shell-*.ejs`
- `views/blessboard/v5/platform-admin/*`
- `public/blessboard/v5/platform-admin.css`
- `src/platform/http/platformAdminRoutes.js` (view locals only)

**Shared components affected:** platform shell, org tables, plan cards.

**Backend risk:** Low–Medium (apex-only; do not touch platform_admin gates)  
**Visual risk:** High (dark Stitch ops vs light shell)

**Focused tests**

- Platform admin route gate tests (401/403)
- Plans/entitlement assignment tests if presentation-adjacent

**Acceptance criteria**

- [ ] No fabricated MRR/health/tickets
- [ ] Settings remain read-only DNS patterns unless product expands
- [ ] Create-org not invented in this batch

**Recommended commit message**

```
Bring platform-admin shell and catalogue screens closer to Stitch 62–68.
```

---

## Batch 12 — Shared media picker/upload

**Objective:** Visual/a11y polish for media library + picker dialog (STITCH_MISSING — use Shared UI States + existing V5 patterns; optionally request Stitch frames later).

**Stitch screens involved**

- No dedicated media-picker Stitch pair found in MCP inventory.
- Reference: Shared UI States Board `b61a1ea8176648408211b681e942e0a6`.

**V5 files likely involved**

- `views/blessboard/v5/content-admin/media-upload.ejs`
- `public/blessboard/v5/media-picker.js`, `media-picker.css`
- `src/blessboard/http/contentAdminRoutes.js` (presentation only)
- `src/blessboard/media/*` (no behavior change)

**Shared components affected:** media dialog, upload progress, empty media library.

**Backend risk:** Medium (file upload surface — do not change storage/auth rules)  
**Visual risk:** Medium

**Focused tests**

- `npm test -- tests/blessboard-media.test.js`
- a11y structure tests for dialogs

**Acceptance criteria**

- [x] Picker remains dialog-accessible (focus trap, Escape, labels)
- [x] Upload validation/authorization unchanged
- [x] No public media URL leakage beyond existing rules

**Status:** Done — Batch 22 (`BATCH_22_SHARED_MEDIA.md`), 2026-07-18.

**Recommended commit message**

```
Polish shared media picker and upload UI for admin content flows.
```

---

## Batch 13 — Responsive and accessibility audit

**Objective:** Viewport + a11y pass across implemented shells; fix confirmed defects only (no redesign).

**Stitch screens involved:** representative canonical pairs from Batches 2–11 (sample, not full regenerate).

**V5 files likely involved**

- Shell CSS/JS: `apex.css`, `tenant-public.css`, `member-portal.css`, `branch-admin.css`, `hq-admin.css`, `platform-admin.css`
- `public/blessboard/v5/shell-nav.js`
- `tests/blessboard-v5-a11y-structure.test.js`
- Prior notes: `docs/ui/V5_RESPONSIVE_ACCESSIBILITY_AUDIT.md`

**Shared components affected:** drawers, skip links, focus rings, tables, bottom tabs.

**Backend risk:** None  
**Visual risk:** Medium

**Focused tests**

- `npm test -- tests/blessboard-v5-a11y-structure.test.js`
- Shell nav / drawer interaction tests if present

**Acceptance criteria**

- [ ] Viewport matrix (1440→360) no critical overflow on sampled shells
- [ ] Drawers: Escape, focus restore, `aria-modal` when open
- [ ] Touch targets ≥ 44px on primary nav controls
- [ ] `prefers-reduced-motion` honored on shell transitions

**Recommended commit message**

```
Harden V5 shell responsive behavior and accessibility structure.
```

---

## Batch 14 — Final Stitch parity audit

**Objective:** Re-classify master map statuses after Batches 1–13; claim **MATCHED** only with live browser ↔ Stitch screenshot comparison; update this backlog with remaining gaps.

**Stitch screens involved:** all canonical pairs in `STITCH_SCREEN_MAP.md`.

**V5 files likely involved**

- Docs only: `docs/gui/STITCH_SCREEN_MAP.md`, this backlog, optional `docs/ui/V5_FINAL_STITCH_PARITY.md` refresh
- Tiny confirmed visual defect fixes only

**Shared components affected:** none by default.

**Backend risk:** None  
**Visual risk:** Low (audit) / Medium if tiny fixes included

**Focused tests**

- Smoke tests for surfaces touched by tiny fixes
- `git diff --check`

**Acceptance criteria**

- [ ] Status counts refreshed (MATCHED/PARTIAL/PLACEHOLDER/MISSING/STITCH_MISSING)
- [ ] No MATCHED without side-by-side evidence
- [ ] Explicit list of remaining intentional differences
- [ ] Blocking product questions recorded (below)

**Recommended commit message**

```
Refresh Stitch screen map statuses after V5 GUI parity audit.
```

---

## Highest-risk GUI gaps (cross-batch)

1. **Apex marketing routes missing** (`/features`, `/pricing`, `/directory`, `/for-churches`, `/register-church`) — Stitch ready, V5 routes absent.  
2. **Platform/HQ Stitch analytics chrome** — high visual risk of inventing metrics/tickets.  
3. **Content-admin vs Stitch website/ministries/events editors** — PLACEHOLDER functional gap.  
4. **Auth deferred screens** (waiting-verification, forgot-password) — Stitch exists; product/backend undecided.  
5. **Leader portal + departments + duty roster + monthly reports** — Stitch exists; no V5 schema/role.

## Recommended first implementation batch

**Batch 1 (Shared visual design system)** — lowest backend risk, unblocks consistent chrome for every later batch. If design tokens are already considered “good enough,” start with **Batch 2** (apex home/login) as the highest user-visible PARTIAL surface with existing routes.

## Questions that genuinely block implementation

1. Should Batch **2b** add apex marketing routes (`/features`, `/pricing`, `/for-churches`, `/register-church`, `/directory`), or remain blocked until product/ops is ready?  
2. Are **waiting-verification** and **forgot-password** in V5 scope, or permanently deferred?  
3. Is **member prayer** (`/member/prayer-request`) planned for V5, or should Stitch 23 stay MISSING indefinitely?  
4. Will **departments / duty roster / monthly branch reports / HQ broadcast & roles** ever get V5 schema, or should Stitch 31/33/40–43/54–55/59–61 be marked permanently out of scope?  
5. Should **platform create-org** become a UI on `/admin/organizations/new`, or remain CLI-only?  
6. Is the **leader portal** (46–50) ever coming to V5, or discard as design-only?

---

*Backlog aligned to permanent screen map; no application code changed in this documentation pass.*
