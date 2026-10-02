# V2.01 Shared HQ/Branch Website Management QA

**Task:** `V2_01_SHARED_HQ_BRANCH_WEBSITE_MANAGEMENT` (E1)  
**Date:** 2026-09-26  
**Branch:** `V8`  
**Environment:** `moovex-platform-v8-testing` (`blessboard.neuniversity.org` / `activeclinic.neuniversity.org`)  
**Baseline (C3 themes):** `6b2bf8820dce`  
**E1 functional commits / hosted tip SHA:** `9f2de31a8d88` (includes `92604f25` selector + `f31d2396` Change Website gate + `9f2de31a` HQ scope labeling)  
**Deployment identity:** `moovex-platform-v8-testing`  
**DB identity:** `expectedIdentityKey=moovex-platform-v7` · `environment=testing` · `mediaWriteNamespace=testing-v8` · `expectedDatabaseEnvironment=testing`  
**Production:** **untouched** (`blessboard.com` `/healthz` remained `03a89106e2fe` / `moovex-platform-production`)

**Stitch:** Website Change Management System `projects/12538817760086591589`  
- Screen 7 Desktop: `af7bebae74a7420e9fd9d982ec4cafd7` / `79c3f01367ec4c819ffc487378c04552`  
- Screen 7 Mobile: `f44b1ff17685428c8b0f5a3f22bcfae4`

**Personas (disposable):**  
- BB HQ · `hq.admin@bb-v8qa-mub23a6v6a6b.example.invalid` · org `bb-v8qa-mub23a6v6a6b`  
- BB Branch · `branch.admin@bb-v8qa-mub23a6v6a6b.example.invalid` · Campus A  
- AC admin · `clinic.admin@ac-hqa-v8mub23a6v6a6b.example.invalid` · org `ac-v8-qa-mub23a6v6a6b`

---

## FINAL VERDICT

**`V2_01_SHARED_HQ_BRANCH_WEBSITE_PASS`**

One shared Choose Website card list reuses existing WE01 editing for authorized BB HQ/branch scopes and the single AC clinic website. No separate HQ/branch editor, no fabricated AC facility websites, no new inheritance DB model, no emergency/network-wide publishing.

---

## 1. Actual supported hierarchy by product

| Product | Independent public websites | Inheritance | Notes |
| --- | --- | --- | --- |
| BlessBoard | Church-wide HQ + each active branch mini-site when `websiteMode=multi_site` | Prompt 7 settings inheritance (identity/contact/SEO and related fields) via existing branch settings resolver | QA tenant listed **4** cards: church HQ + branch `hq` + `campus-a` + `campus-b` |
| ActiveClinic | **One** public website per clinic organization | **NOT SUPPORTED** for facility→website inheritance | Operational facilities are not public websites |

Unsupported (explicitly out of scope / NOT SUPPORTED):

- AC facility mini-websites or HQ→facility public inheritance  
- Emergency broadcasts / network-wide publish  
- Three-column permanent studio  
- New inheritance database model  
- Claiming HQ publish never affects inheriting branches

---

## 2. Shared components and product adapters

**Shared**

- `websiteScopeListPageModel.js` — card presentation (name, kind label, publication, pending count, actions)  
- `renderWebsiteScopeList.js` + `website-scope-list-page.ejs` + `website-scope-list.css` — Screen 7 cards (grid → single column ≤640px)  
- `websiteScopeHttp.js` — standalone page shell  
- `websiteInheritancePresentation.js` — Screen 7 wording adapter only  
- `editorShell.js` / `editor-chrome.ejs` — selected website name, HQ publish caution, Change Website menu item, switch-safety copy  
- `buildPublicWebsiteWebsitesPath` in `publicWebsiteUrl.js`

**BB adapter**

- `blessboardAuthorizedWebsiteScopes.js` — `resolveWebsiteMode` + `resolveWebsiteScope` + pending via `getPendingChangeSummary`  
- Routes: `GET …/website/websites` in `blessboardWebsiteEditorRoutes.js`  
- Chrome: Change Website for HQ editors when `multi_site`  
- Settings EJS: “From Headquarters” / “Return to Headquarters Default” via existing reset actions

**AC adapter**

- `activeClinicAuthorizedWebsiteScopes.js` — single clinic card; hierarchy note states facilities are not websites  
- Route: `GET /clinics/:clinicKey/website/websites`  
- No Change Website menu (single authorized site)

---

## 3. Files changed (E1)

**New**

- `public/platform/website-scope-list.css`
- `src/platform/website/websiteScopeListPageModel.js`
- `src/platform/website/renderWebsiteScopeList.js`
- `src/platform/website/websiteScopeHttp.js`
- `src/platform/website/websiteInheritancePresentation.js`
- `src/blessboard/website/blessboardAuthorizedWebsiteScopes.js`
- `src/activeclinic/website/activeClinicAuthorizedWebsiteScopes.js`
- `views/platform/website/website-scope-list-page.ejs`
- `tests/v2-01-shared-hq-branch-website.test.js`
- `docs/qa/V2_01_SHARED_HQ_BRANCH_WEBSITE_QA.md` (this file)

**Modified**

- `src/platform/website/publicWebsiteUrl.js`
- `src/platform/website-engine/editorShell.js`
- `src/platform/website/renderWebsiteManagementPage.js`
- `src/blessboard/http/blessboardWebsiteEditorRoutes.js`
- `src/blessboard/http/attachWebsiteAdminChrome.js`
- `src/blessboard/services/branchWebsiteSettingsEditorView.js`
- `src/activeclinic/http/activeClinicWebsiteRoutes.js`
- `src/activeclinic/http/attachActiveClinicWebsiteChrome.js`
- `views/platform/website-engine/editor-chrome.ejs`
- `views/blessboard/v5/hq/branch-website-settings.ejs`
- `views/blessboard/v5/partials/tenant-public-shell-start.ejs`
- `public/platform/website-inline-edit.css`

Unrelated working-tree docs/references left uncommitted.

---

## 4. Inheritance and publication behavior

**BlessBoard**

- Branch settings continue to use `resolveBranchWebsiteSettings` sources (`CHURCH_DEFAULT`, `BRANCH_OVERRIDE`, hide/reset).  
- UI labels: **From Headquarters**, **Return to Headquarters Default** (existing reset removes override — does not permanently copy HQ text into the branch draft).  
- Hosted Campus A settings: return-default actions present (6 matches); current overrides meant “From Headquarters” badge count was 0 on that pass.  
- HQ publish confirm body (church scope): warns that branches inheriting live HQ content may show updates; branch overrides unchanged.  
- Pending counts come from instance-scoped `getPendingChangeSummary` (engine instances may still be shared depending on existing BB engine resolution — documented limitation if HQ/branch share one instance).  
- Switching websites: local unsaved edits still guarded by existing lifecycle dirty controller; saved drafts are not treated as unsaved.

**ActiveClinic**

- No HQ/facility inheritance controls shown.  
- Single clinic card + editor parity only.

---

## 5. Automated and hosted results

### Automated

`node --test tests/v2-01-shared-hq-branch-website.test.js` → **5/5 pass**

### Hosted (SHA `9f2de31a8d88`)

| Check | Result |
| --- | --- |
| BB authorized websites list (HQ session) | **PASS** — 4 cards, HQ + branches, Edit + View Live, no studio |
| BB HQ editor site name + Change Website | **PASS** |
| BB Campus A / Campus B edit via WE01 | **PASS** — site names `Campus A` / `Campus B` |
| BB branch admin Campus A websites + edit | **PASS**; Campus B denied (**403**) |
| BB anon `/website/websites` | **PASS** — denied |
| BB branch settings inheritance wording | **PASS** — Return to Headquarters Default present |
| AC websites list | **PASS** — exactly 1 clinic card; no facility cards |
| AC editor site name; no Change Website | **PASS** |
| AC anon + wrong clinic | **PASS** — denied / 404 |
| Desktop + ~390px card stack | **PASS** — hosted browser on Choose Website |
| Production untouched | **PASS** — `03a89106e2fe` / `moovex-platform-production` |

---

## 6. Unsupported capabilities (do not claim parity)

- AC facility public websites / HQ→facility inheritance — **NOT SUPPORTED**  
- Permanent three-column HQ/branch studio — **NOT SUPPORTED** (cards only)  
- Emergency broadcasts / network-wide publishing — **NOT SUPPORTED**  
- Guaranteed pending-count isolation when BB HQ and a branch share one engine instance — **LIMITATION** (existing engine resolution)  
- Branch-named “Headquarters” (`branch:hq`) on the disposable QA tenant is real tenant data, not a fabricated facility site

---

## 7. Hosted SHA and DB identity

| Surface | Value |
| --- | --- |
| Hosted tip | `9f2de31a8d88` |
| Deployment | `moovex-platform-v8-testing` |
| Environment | `testing` |
| DB identity key | `moovex-platform-v7` |
| Media namespace | `testing-v8` |
| Production | untouched (`03a89106e2fe`) |
