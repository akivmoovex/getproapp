# V2.04 Registration + Website Editor Bug Audit

**Mode:** Diagnosis + BB-REG-WEB-01 / AC post-reg editor routing fixes applied.  
**Date:** 2026-10-01  
**Scope:** BB-REG-WEB-01 · PLATFORM-PASSWORD-UX-01 · AC-WEB-EDITOR-01

---

## BUG 1 — BB-REG-WEB-01

### BUG_ID
`BB-REG-WEB-01`

### ROOT_CAUSE
Post-registration does **not** redirect to the canonical BlessBoard Website Studio/editor. After successful provision + session establish, `apexMarketingRoutes` always redirects to the **registration success page** via `buildRegistrationSuccessRedirect` → `/register-church/success?ref=…&ready=1`.

The success panel may expose a secondary **“Build your website”** CTA when `resolveBlessBoardRegistrationSuccessWebsite` resolves (`buildPublicWebsiteEditPath` → `/c/:org/:branch?website_edit=1&website_mode=draft`). That path **is** the canonical public edit mode.

However (pre-fix):

1. There is **no automatic redirect** into edit mode after provision.
2. The primary footer CTA was **“Continue to dashboard”** → `/hq` (`BLESSBOARD_COPY.dashboardPath`), a **legacy HQ destination**, not the editor.
3. If success-website resolution fails (missing/invalid `ref`, session org mismatch), `websiteEditPath` is null and the Build CTA disappears — users only get `/hq` / sign-in.

So the user “does not reliably arrive in the actual editor” because post-registration used a **success intermediate + dashboard continue**, not the canonical editor route. The editor URL itself was correct when shown; the **primary destination after registration was stale**.

### FIX STATUS (2026-10-02 update — BB-POST-REG-DASHBOARD-01)
**CLOSED for post-registration landing on HQ.**

- Successful POST `/register-church` → shared session established → **303 `/hq`** (no success/editor detour).
- Success page **retained** for receipt deep-links (`/register-church/success?ref=…&ready=1`).
- Primary CTA on success receipt remains **Edit your website** → canonical `buildPublicWebsiteEditPath`.
- Focused suite: `tests/v2-04-bb-post-registration-dashboard.test.js` (A–E).
- Prior BB-REG-WEB-01 Edit CTA coverage: `tests/blessboard-bb-reg-web-01-editor-route.test.js`.

### FIX STATUS (2026-10-01)
**CLOSED for post-registration Edit CTA routing (preferred V2.04 behavior at the time).**

- Success page **retained** (`/register-church/success?ref=…&ready=1`); no auto-redirect into the editor.
- Primary CTA is **Edit your website** → canonical `buildPublicWebsiteEditPath` (`/c/:organizationKey/:branchKey?website_edit=1&website_mode=draft`).
- Org/branch keys resolved dynamically from provisioned application reference (`resolveBlessBoardRegistrationSuccessWebsite`); `branchKey` returned on the resolver result.
- Dashboard `/hq` preserved as **secondary** (`data-bb-dashboard-secondary="1"`).
- Cross-tenant / not-ready paths still withhold the edit CTA.
- Focused suite: `tests/blessboard-bb-reg-web-01-editor-route.test.js` (4/4).

### CONFIDENCE
**HIGH** (redirect + success presentation traced end-to-end; focused tests green).

### SHARED_OR_PRODUCT
**PRODUCT (BlessBoard)** registration funnel / success UX. Shared helpers (`buildRegistrationSuccessRedirect`, `buildPublicWebsiteEditPath`) are used correctly for *URL construction*; BB previously chose the wrong *post-success primary destination* (now fixed).

### SOURCE_PATHS
- `src/blessboard/http/apexMarketingRoutes.js` — POST `/register-church` → session → `buildRegistrationSuccessRedirect`; GET `/register-church/success`
- `src/platform/registration/registrationSuccessPresentation.js` — `showWebsiteEditPrimary`, `websiteBuildLabel: "Edit your website"`, `dashboardPath = "/hq"` secondary
- `src/blessboard/services/resolveRegistrationSuccessWebsite.js` — `editPath` via `buildPublicWebsiteEditPath` + `branchKey`
- `src/platform/website/publicWebsiteUrl.js` — `EDITOR_NAV_QUERY` (`website_edit=1`, `website_mode=draft`), `buildPublicWebsiteEditPath`
- `views/blessboard/v5/apex/register-church-success-panel.ejs` — primary Edit CTA before Continue to dashboard
- Contrast: `src/blessboard/http/websiteChangeSubmissionBranchRoutes.js` — `/branch-admin/website` **does** 303 to editor (canonical nav pattern BB already knows)

### EXPECTED
Successful registration/provisioning → authenticated church context → website draft exists → **primary “Edit your website”** opens canonical public editor (`/c/:org/:branch?website_edit=1&website_mode=draft`) with edit mode active and provisioned site visible. Success receipt may remain; user is **not** sent first to `/hq` for this action.

### ACTUAL (pre-fix)
303 → `/register-church/success?…`; primary continue → `/hq`; editor only if user finds secondary Build CTA and resolution succeeded.

### MINIMUM_FIX
1. ~~After successful provision + session, **303 directly** to editor~~ — **not required**; preferred V2.04 keeps success page.
2. **DONE:** Change primary CTA from `/hq` to the edit-mode URL when ready + `websiteEditPath` available.
3. Do **not** use `/hq` or `/hq/website` hub as the post-registration website destination (**DONE** for primary CTA).

### TESTS_REQUIRED
- Happy path: register → session cookie set → success CTA is public edit URL with both `website_edit=1` and `website_mode=draft`.
- Edit mode GET returns 200 with editor chrome and draft site content markers.
- Session org mismatch: no foreign edit CTA.
- Failed/incomplete provisioning stays off editor path.
- Dashboard secondary CTA still reaches `/hq`.

### REGRESSION_RISK
**MEDIUM** — changes first-run UX and analytics on success page; must preserve review/pending and session-failure paths (preserved).

---

## BUG 2 — PLATFORM-PASSWORD-UX-01

### BUG_ID
`PLATFORM-PASSWORD-UX-01`

### ROOT_CAUSE
**Shared platform password-requirements UI already exists** (partial + client JS + CSS + server policy). ActiveClinic **includes the markup** on Step 2 (administrator) but **does not initialize the live-update script on that step**.

In `views/activeclinic/public/register-clinic.ejs`:

- Administrator branch (`step === 'administrator'`) renders `platform/partials/registration-password-rules`.
- `GpRegistrationPasswordRules.init({…})` lives only inside the **`else` (clinic step)** block, which has **no `#password` field**.
- On Step 2, `window.GpRegistrationPasswordRules` is loaded (`public-shell.ejs`) but **never called**, so rule rows stay at initial `aria-checked="false"` / unmarked while typing.

BlessBoard calls `init` at page bottom whenever `#register_password` exists — that is why BB works.

Architecture classification: **B** — shared component exists; AC wiring incomplete (not a BB-only component; not two full duplicate engines).

Server/client policy is already shared: `src/platform/auth/sharedPasswordPolicy.js` via `registrationPasswordPolicy.js` (min/max length rules only).

### CONFIDENCE
**HIGH** (template control-flow bug is unambiguous).

### SHARED_OR_PRODUCT
**PLATFORM** wiring bug in ActiveClinic registration view (shared assets already platform-owned).

### SOURCE_PATHS
- `views/platform/partials/registration-password-rules.ejs`
- `public/platform/registration-password-rules.js` — `GpRegistrationPasswordRules.init`
- `public/platform/registration-ux.css` — `.is-met` / `.is-unmet`
- `src/platform/auth/sharedPasswordPolicy.js` / `src/platform/registration/registrationPasswordPolicy.js`
- `views/activeclinic/public/register-clinic.ejs` — init nested under clinic `else`
- `views/activeclinic/layouts/public-shell.ejs` — loads CSS + JS
- `views/blessboard/v5/apex/register-church.ejs` — correct init placement
- `views/blessboard/v5/partials/apex-shell-end.ejs` — script include

### EXPECTED
While typing on AC Step 2, password requirement markers update live (same behavior as BB), driven by one platform component + shared validation metadata.

### ACTUAL
Static rule list on AC Step 2; no live met/unmet updates. BB updates correctly.

### MINIMUM_FIX
1. Move `GpRegistrationPasswordRules.init(…)` (and any shared init helper) so it runs on the **administrator** step when `#password` exists — e.g. init block outside the clinic-only `else`, or duplicate a small init in the admin branch.
2. Prefer a single shared init snippet/partial used by BB + AC (behavior only; keep product tokens separate).
3. Do not invent a second product-specific password rules engine.

### TESTS_REQUIRED
- AC Step 2 HTML includes `data-gp-password-rule` items + script path.
- Focused DOM/unit or integration: after simulated input of length ≥ min, items gain `.is-met`.
- BB registration still updates rules (parity regression).
- Server reject of short password unchanged.

### REGRESSION_RISK
**LOW** — view/script placement only; no schema or auth policy change.

---

## BUG 3 — AC-WEB-EDITOR-01

### BUG_ID
`AC-WEB-EDITOR-01`

### ROOT_CAUSE
`GET /app/settings/website` is the **Website Management Hub** (H01 / MW10), not the shared Website Studio canvas.

Observed chrome (Clinic Editor brand, Pages/Sections/Assets, Editor/Layers/Media/History rail, Preview/Publish) comes from `views/activeclinic/partials/website-cms-nav.ejs` + `ac-app-body--mw` / dark top bar in `public/activeclinic/website-cms.css`. That chrome is **intentionally** applied on hub/CMS settings screens.

The **live editable clinic website** is only mounted on the **public clinic site** when `website_edit=1` (+ `website_mode=draft`), via:

- `src/activeclinic/http/attachActiveClinicWebsiteChrome.js` → `presentEditorShell` → `views/platform/website-engine/editor-chrome.ejs` (`gp-website-editor`, WE01)

On `/app/settings/website` there is **no** `editorShell`, **no** `gp-website-editor` host, and **no** iframe/srcdoc canvas of the clinic site. The main pane is hub metrics/tiles (`settings-website-content.ejs`). Users therefore see editor-like chrome with a **blank/dark stage** (dark sticky header `#ac-mw-editor__top` on `color-text-primary`) and **no clinic website content** — matching the screenshot without implying a total route failure.

Contributing product mismatch:

- Hub “Editor” rail / “Edit Website” should deep-link to `actions.editWebsite` = `buildPublicWebsiteEditPath` (`/clinics/:key?website_edit=1&website_mode=draft`).
- ActiveClinic registration success sets `editPath` to the **hub** (`buildPublicWebsiteSettingsPath` → `/app/settings/website`) in `resolveActiveClinicRegistrationSuccessWebsite.js`, unlike BlessBoard which uses `buildPublicWebsiteEditPath`. That steers new clinics into the hub chrome-without-canvas experience.

This is **not** primarily CSP/iframe failure on the hub route: the shared preview canvas is simply **not rendered there**. Hard-coding AC HTML into the hub would be the wrong fix; align destinations to the shared public edit path (BB pattern).

### CONFIDENCE
**HIGH** for hub-vs-editor surface mismatch on the reported route.  
**MEDIUM** that opening the true public edit URL always shows content (not re-audited live; code path exists and is the BB-aligned studio).

### SHARED_OR_PRODUCT
**ACTIVECLINIC product surface** misaligned with **shared platform Website Studio** (`platform/website-engine`). Fix scope is primarily ActiveClinic hub/nav/success destinations; do not fork a second canvas.

### SOURCE_PATHS
- `src/activeclinic/http/activeClinicSettingsRoutes.js` — `GET /app/settings/website` → hub + `cmsNav`
- `views/activeclinic/app/settings-website-content.ejs` — hub body; includes `website-cms-nav`
- `views/activeclinic/partials/website-cms-nav.ejs` — Studio-like chrome without canvas
- `public/activeclinic/website-cms.css` — `.ac-mw-editor__top` dark bar; `.ac-app-body--mw`
- `views/activeclinic/layouts/app-shell.ejs` — applies `ac-app-body--mw` when `cmsNav` present
- `src/activeclinic/http/attachActiveClinicWebsiteChrome.js` — real WE01 `editorShell` only when `website_edit`
- `views/platform/website-engine/editor-chrome.ejs` — shared canvas chrome
- `src/platform/website/publicWebsiteUrl.js` — canonical edit query
- `src/platform/website/websiteManagementPresentation.js` — `editWebsite` action = public edit path
- `src/activeclinic/services/resolveActiveClinicRegistrationSuccessWebsite.js` — **FIXED (2026-10-01):** `editPath` now uses `buildPublicWebsiteEditPath` (`/clinics/:clinicKey?website_edit=1&website_mode=draft`); hub retained as `hubPath` only (`/app/settings/website` not removed).

### EXPECTED
Users seeking to edit the clinic website land on (or are clearly taken to) the shared public edit mode with provisioned draft content visible under WE01 chrome — not a hub chrome empty stage.

### ACTUAL
`/app/settings/website` loads MW editor chrome + hub cards; no website canvas/content. Looks like a broken editor.

### FIX STATUS (post-registration CTA — 2026-10-01)
**CLOSED for registration success routing.**

- `resolveActiveClinicRegistrationSuccessWebsite` now returns canonical `editPath` via `buildPublicWebsiteEditPath`.
- Success CTA label: **Edit your website** (`ACTIVECLINIC_COPY.websiteBuildLabel`).
- Hub `/app/settings/website` **preserved** as management hub (`hubPath`); no longer used as edit CTA target.
- Focused suite: `tests/activeclinic-ac-post-reg-editor-route.test.js`.
- Remaining open (hub chrome-without-canvas UX when user navigates to hub directly) is out of this post-reg routing fix scope.

### MINIMUM_FIX
1. Treat hub as **management only**: either remove Studio-mimic chrome from hub overview, or make “Editor” the primary auto-entry that **303/links** to `buildPublicWebsiteEditPath` (same as BB `/branch-admin/website` pattern).
2. ~~Point AC registration success `editPath` / “Build your website” to **public edit path**, not `/app/settings/website`.~~ **DONE**
3. Do **not** embed hard-coded AC HTML canvas on the hub; reuse `attachActiveClinicWebsiteChrome` + platform `editor-chrome`.
4. Optional: if hub must keep chrome, reserve a labeled empty state: “Open Editor to edit your live draft site” with the edit URL — avoid implying an in-page canvas.

### TESTS_REQUIRED
- `GET /app/settings/website` documents hub markers (`data-ac-website-hub`) and **absence** of `data-gp-website-editor` / `data-website-engine-shell`.
- `actions.editWebsite` / rail Editor href equals public edit URL with both query flags.
- `GET /clinics/:clinicKey?website_edit=1&website_mode=draft` as authorized staff → 200, `data-gp-website-editor`, clinic content present.
- Registration success Build CTA → public edit path (not hub).
- Unauthorized edit request denied without leaking draft.

### REGRESSION_RISK
**MEDIUM** — hub Stitch chrome (MW/H01) is intentional; changing nav destinations or removing chrome affects MW parity screens. Prefer destination fix over deleting all MW chrome.

---

## Cross-bug notes

| Topic | Finding |
|-------|---------|
| Canonical BB editor | Public path + `website_edit=1` & `website_mode=draft` |
| Canonical AC editor | `/clinics/:clinicKey?website_edit=1&website_mode=draft` via attach chrome |
| Hub `/app/settings/website` | Management + CMS tools; not the WE01 canvas (**preserved**) |
| AC post-reg Edit CTA | **FIXED** → `buildPublicWebsiteEditPath` (dynamic clinicKey) |
| BB post-reg Edit CTA | **FIXED** → primary CTA = `/c/:org/:branch?website_edit=1&website_mode=draft`; `/hq` secondary |
| Password platform share | Already exists; AC Step 2 missing `init` call |
| Design tokens | Keep BB/AC token CSS separate; share behavior only |

---

## BB post-registration editor route fix (2026-10-01)

| Check | Result |
|-------|--------|
| editPath | `/c/:organizationKey/:branchKey?website_edit=1&website_mode=draft` |
| Success page removed? | **No** — `/register-church/success` retained |
| Primary CTA | **Edit your website** (canonical edit path) |
| Dashboard `/hq` | Preserved as secondary |
| Dynamic org/branch | Yes — from provisioned registration reference |
| Focused tests | `tests/blessboard-bb-reg-web-01-editor-route.test.js` |

```
BB_EDIT_CTA=CANONICAL
ORG_KEY_DYNAMIC=PASS
BRANCH_CONTEXT=PASS
EDIT_MODE=PASS
SEEDED_CONTENT_VISIBLE=PASS
TENANT_ISOLATION=PASS
FOCUSED_TESTS=4/4
FINAL=BB_POST_REGISTRATION_EDITOR_FIXED
```

---

## AC post-registration editor route fix (2026-10-01)

| Check | Result |
|-------|--------|
| editPath | `/clinics/:clinicKey?website_edit=1&website_mode=draft` |
| Hub removed? | **No** — `/app/settings/website` remains |
| Dynamic clinicKey | Yes — from provisioned `organization_key` |
| Focused tests | `tests/activeclinic-ac-post-reg-editor-route.test.js` |

```
AC_POST_REG_EDIT_ROUTE=CANONICAL
CLINIC_KEY_DYNAMIC=PASS
EDIT_MODE=PASS
SEEDED_CONTENT_VISIBLE=PASS
TENANT_ISOLATION=PASS
FOCUSED_TESTS=4/4
FINAL=AC_POST_REGISTRATION_EDITOR_ROUTE_FIXED
```

---

## Footer (original diagnosis + BB fix)

BB_REG_WEB_ROOT_CAUSE=Post-register redirects to /register-church/success with primary CTA /hq; does not auto-land on canonical /c/:org/:branch?website_edit=1&website_mode=draft (CTA FIXED 2026-10-01 → Edit your website primary; /hq secondary)
PASSWORD_UX_ROOT_CAUSE=Shared GpRegistrationPasswordRules exists but AC Step 2 never calls init (script nested under clinic-step else)
AC_EDITOR_ROOT_CAUSE=/app/settings/website paints MW editor chrome without mounting WE01/public edit canvas; real editor is /clinics/:key?website_edit=1; AC success editPath wrongly targets hub (post-reg CTA FIXED)
PASSWORD_FIX_SCOPE=PLATFORM
AC_EDITOR_FIX_SCOPE=ACTIVECINIC
FINAL=V2_04_REGISTRATION_WEBSITE_BUGS_DIAGNOSED
