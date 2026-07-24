# PHASE2_077 — Church website preview & publish parity audit

**Date:** 2026-07-24  
**Scope:** BlessBoard V5 church mini-website preview + publish experience only  
**Stitch project (SoT):** `projects/17124191473876947591` (GetPro Church Platform / Sacred Modernity)  
**Constraint:** Audit only — **no runtime code changed** in this pass.

## Executive finding

The public page **templates** are already Stitch-shaped (`views/blessboard/v5/public/*.ejs` + `tenant-public-shell-*` + `tenant-public.css`). They look sparse when:

1. **Admin preview does not use those templates** — `content-admin/preview.ejs` is a structural CMS dump (title + raw sections + plain lists), so operators judge “preview” as unfinished even when published pages would look richer.
2. **Testing demo content is intentionally smoke-minimal** — `demoMinimumDatasetSpec.js` seeds one generic `demo_body` section per page, one entity each, **no hero `mediaUrl`**, no mission/vision/values keys, no portraits/covers.
3. **HQ website dashboard / publish UI is utilitarian** — status panels and confirm checkboxes, not Stitch website-editor / confirm chrome.
4. **Missing CMS fields collapse Stitch sections** — no media → mesh/initials fallback; no typed about sections → no mission/vision/values grid; empty published lists → intentional empty states that feel “blank” vs Stitch populated screens.

Published vs authenticated preview can also diverge because public routes load **published-only** content (`loadTenantPublicPageModel` / `publicContentReadService`), while admin preview includes **drafts**.

---

## Shared stack (all public pages)

| Layer | Location |
|-------|----------|
| Routes | `src/blessboard/http/tenantPublicRoutes.js`, `pathPublicRoutes.js`, `tenantPublicPaths.js` |
| Model | `src/blessboard/http/loadTenantPublicPageModel.js` |
| Render | `src/blessboard/http/renderTenantPublicPage.js` → `views/blessboard/v5/public/page.ejs` |
| Shell | `views/blessboard/v5/partials/tenant-public-shell-start.ejs`, `tenant-public-shell-end.ejs`, `powered-by-getpro` |
| CSS / JS | `public/blessboard/v5/tenant-public.css`, `tenant-public.js` |
| Content | Published `pages` + `page_sections`; entity tables via `publicContentReadService` |
| Design tokens | Sacred Modernity (Hanken Grotesk, violet `#6C5CE7`) — not Stitch export Inter/indigo |

**Desktop / mobile:** One responsive template per page with device-specific classes (e.g. hero CTA eyebrow splits). Canonical Stitch pairs listed per screen below.

---

## Screen-by-screen audit

### 1. Website dashboard

| Field | Value |
|-------|--------|
| Exact Stitch screen name | **No dedicated “website dashboard / publish” Stitch screen.** Closest admin SoT: `34-branch-website-editor-desktop` / `34-branch-website-editor-mobile` (content overview, not publish readiness). HQ dashboard Stitch (`51-hq-dashboard-*`) is unrelated. |
| Stitch ID | Desktop editor: `3f3160664d91423d80cb4ba81e2af6c4`; Mobile editor: `f2bb5e794f074a1aa3d248a2fe54ddeb` |
| Existing route | `GET /hq/website` (`churchWebsiteAdminRoutes.js`) |
| Existing view | `views/blessboard/v5/hq/website.ejs` |
| Existing partials | `hq-shell-start` / `hq-shell-end` |
| Existing CSS | `public/blessboard/v5/hq-admin.css` |
| Existing content source | `evaluatePublishReadiness` / church settings / onboarding `preview_acknowledged` |
| Missing sections | Stitch-style page cards, live mini-previews, branding modules, visual publish timeline |
| Missing imagery | N/A (status UI) |
| Missing typography | Sacred Modernity not applied; HQ form chrome only |
| Missing spacing/layout | Panel stack vs Stitch multi-column editor dashboard |
| Missing mobile behavior | HQ shell responsive, but no Stitch website-editor mobile composition |
| Empty-state problem | Readiness gap list only — no populated “site looks ready” visual |
| Publish-state mismatch | Dashboard shows status text; does not render public chrome |
| Preview/published mismatch | “Open authenticated preview” → `/hq/content/preview/home` (sparse admin preview), not public shell |

### 2. Page editor

| Field | Value |
|-------|--------|
| Exact Stitch screen name | `34-branch-website-editor-desktop` / `34-branch-website-editor-mobile` |
| Stitch ID | `3f3160664d91423d80cb4ba81e2af6c4` / `f2bb5e794f074a1aa3d248a2fe54ddeb` |
| Existing route | `GET/POST /hq/content/pages/:pageKey`, `/hq/content/b/:branchKey/...`, `/branch-admin/content/...` |
| Existing view | `views/blessboard/v5/content-admin/page.ejs` (+ `section.ejs`, `entities.ejs`, `entity-fields.ejs`, `media-upload.ejs`) |
| Existing partials | HQ or branch-admin shells; media picker locals |
| Existing CSS | `hq-admin.css` / `branch-admin.css` (`data-bb-stitch-page-editor="34-branch-website-editor"` marker present) |
| Existing content source | Admin page bundle (`getAdminPageBundle`); drafts editable |
| Missing sections | WYSIWYG / canvas preview pane beside form (Stitch shows rich preview) |
| Missing imagery | Media picker exists; demo seed never attaches hero/portrait URLs |
| Missing typography | Admin form chrome ≠ public Sacred Modernity |
| Missing spacing/layout | Form + table vs Stitch dual-pane editor |
| Missing mobile behavior | Admin usable on small screens; not Stitch editor mobile layout |
| Empty-state problem | New churches get draft shells via foundation repair — little body content |
| Publish-state mismatch | Page can be `published` while site `website_status` still `draft` (and vice versa for optional entities) |
| Preview/published mismatch | Preview link uses sparse `preview.ejs`, not `public/*.ejs` |

### 3. Home page preview / published

| Field | Value |
|-------|--------|
| Exact Stitch screen name | `01-public-home-desktop-v2 (Refined)` / `01-public-home-mobile-v2 (Refined)` |
| Stitch ID | `ead45db5be774baa9454412262096ffc` / `89177588fbf8405dbebd5747c38e19ce` |
| Existing route | Public: `/` (tenant) or path-public home; Preview: `GET /hq/content/preview/home` (and branch-admin equivalent) |
| Existing view | Published: `public/home.ejs` via `page.ejs`; Preview: `content-admin/preview.ejs` |
| Existing partials | Published: tenant-public shell; Preview: minimal header + badge only |
| Existing CSS | Published: `tenant-public.css`; Preview: tenant-public + admin CSS, but markup is not Stitch home |
| Existing content source | Published `page_sections` (hero by type/key; `service_times` metadata entries); no live ministry/event teasers yet (documented remaining gap) |
| Missing sections (vs populated Stitch) | Service-times block when entries empty; explore/teaser cards from live lists; fabricated member counts / prayer / newsletter (intentionally omitted) |
| Missing imagery | Hero `mediaUrl` usually unset → `.bb-tp-hero__fallback` mesh; demo seed has no media |
| Missing typography | Published close when content rich; preview uses unstyled section stack |
| Missing spacing/layout | Preview: flat stack; Published: close when hero+sections present |
| Missing mobile behavior | Published has desktop/mobile CTA/eyebrow splits; preview has none |
| Empty-state problem | Weak demo copy (“Welcome — [Demo]”) reads as unfinished product, not as Stitch hero |
| Publish-state mismatch | Unpublished site → setup/unavailable model, not Stitch empty home |
| Preview/published mismatch | **Largest gap:** admin preview ≠ `home.ejs` composition |

### 4. About preview / published

| Field | Value |
|-------|--------|
| Exact Stitch screen name | `02-public-about-desktop-v3 (Populated)` / `02-public-about-mobile-v3 (Populated)` |
| Stitch ID | `44492f6abbe849d0a8a89303ce83129b` / `3f0b8a5c30544d9495064df8d5f9e62e` |
| Existing route | `/about`; preview `/…/content/preview/about` |
| Existing view | `public/about.ejs` vs `content-admin/preview.ejs` |
| Existing partials | Tenant-public shell (published) |
| Existing CSS | `tenant-public.css` about hero / purpose / values |
| Existing content source | Sections classified by key/type/heading containing mission / vision / value / story |
| Missing sections | Mission, vision, values, story collage when demo only has `demo_body` |
| Missing imagery | Hero + story collage `mediaUrl`s |
| Missing typography | Accent title treatment needs long enough heading; demo titles are short/tagged |
| Missing spacing/layout | Purpose grid and values icons only when typed sections exist |
| Missing mobile behavior | Published about has mobile eyebrow/CTA; preview none |
| Empty-state problem | Generic body paragraph only → page feels empty vs Stitch populated |
| Publish-state mismatch | Same as home |
| Preview/published mismatch | Structural preview vs classified about layout |

### 5. Leadership preview / published

| Field | Value |
|-------|--------|
| Exact Stitch screen name | Populated: `03-public-leadership-desktop-v2 (Populated)` / `03-public-leadership-mobile-v4 (Restored)`; Empty ref: `03-public-leadership-desktop-v2 (Empty)` |
| Stitch ID | `372faa60f8df4983b627db3cb5d35f9d` / `0f4e816fd64d4592bd3677fbde3b7544`; empty `5f7b1d44bd454d45a0b72fb76d94bbd0` |
| Existing route | `/leadership`; preview `/…/preview/leadership` |
| Existing view | `public/leadership.ejs` vs sparse list in `preview.ejs` |
| Existing partials | Shell (published) |
| Existing CSS | Leadership featured + cards |
| Existing content source | Published `leaders` (branch then church-wide) |
| Missing sections | Featured pastor treatment needs ≥1 published leader with rich bio; Contact Pastor / profile (intentionally omitted — no routes) |
| Missing imagery | `imageUrl` → initials avatar; demo leader has no photo |
| Missing typography | Preview plain `<h2>` list |
| Missing spacing/layout | Preview list vs desktop card grid / mobile list |
| Missing mobile behavior | Published has device layouts; preview none |
| Empty-state problem | Empty Stitch variant exists; V5 empty is generic `.bb-tp-empty` |
| Publish-state mismatch | Optional entities not required for site publish — site can publish with empty leadership |
| Preview/published mismatch | Preview list ≠ leadership template |

### 6. Ministries preview / published

| Field | Value |
|-------|--------|
| Exact Stitch screen name | `04-public-ministries-desktop-v4 (Populated)` / `04-public-ministries-mobile-v4 (Populated)` |
| Stitch ID | `f146cdccadb34ff3bd8b0b75a0450d15` / `d2fd7ecc586541d3beb5d0d3bed98d56` |
| Existing route | `/ministries`; preview `/…/preview/ministries` |
| Existing view | `public/ministries.ejs` vs `preview.ejs` |
| Existing partials | Shell |
| Existing CSS | Ministry card grid |
| Existing content source | Published `ministries` |
| Missing sections | Multi-card density (demo seeds **one** ministry) |
| Missing imagery | `imageUrl` / mesh fallback; no demo covers |
| Missing typography / spacing / mobile | Same preview vs published pattern |
| Empty-state problem | Sparse single card or empty state vs Stitch gallery |
| Publish-state mismatch | Optional for site publish |
| Preview/published mismatch | Yes |

### 7. Events preview / published

| Field | Value |
|-------|--------|
| Exact Stitch screen name | List canon: `05-public-events-desktop-v2 (Populated)` / `05-public-events-mobile-v2 (Populated)`; Empty: `05-public-events-desktop-v2 (Empty)`. Calendar variants **obsolete** for V5 list model. |
| Stitch ID | `6f618576f0304982bd239bfe04946e72` / `f58c416cbbd545429258d963b3a15b60`; empty `6c3a2b460ac54e6a88336af9085e8c38` |
| Existing route | `/events`; preview `/…/preview/events` |
| Existing view | `public/events.ejs` (featured + upcoming list) vs `preview.ejs` |
| Existing partials | Shell |
| Existing CSS | Event date chrome |
| Existing content source | Published upcoming events (`preparePublicEvents`) |
| Missing sections | Calendar UI (by design); registration CTA only when safe URL |
| Missing imagery | Event covers when unset |
| Missing typography / spacing / mobile | Preview vs published |
| Empty-state problem | Past-only or no events → empty; demo has one future event (OK if published) |
| Publish-state mismatch | Optional |
| Preview/published mismatch | Preview lacks featured/date chrome |

### 8. Sermons / resources preview / published

| Field | Value |
|-------|--------|
| Exact Stitch screen name | `06-public-sermons-desktop-v2 (Populated)` / `06-public-sermons-mobile-v2 (Populated)`; Empty: `06-public-sermons-desktop-v2 (Empty)`. Older “sermons-resources” titles obsolete. |
| Stitch ID | `4f4995dc4ec84354ac80ed022a767ef3` / `96b380d4e47649c1bd7f05cabe9c3a1d`; empty `0c7262cdda4547739ec0c1fa5128fb51` |
| Existing route | `/sermons`; preview `/…/preview/sermons` |
| Existing view | `public/sermons.ejs` vs `preview.ejs` |
| Existing partials | Shell |
| Existing CSS | Featured + recent list |
| Existing content source | Published `sermons`; media/resource buttons only for safe http(s) |
| Missing sections | Series/scripture badges (not in schema); embeds/iframes intentionally omitted |
| Missing imagery | Thumbs / media URLs |
| Missing typography / spacing / mobile | Preview vs published |
| Empty-state problem | Demo sermon without media looks thin |
| Publish-state mismatch | Optional |
| Preview/published mismatch | Yes |

### 9. Contact preview / published

| Field | Value |
|-------|--------|
| Exact Stitch screen name | `08-public-contact-desktop-v2 (Populated)` / `08-public-contact-mobile-v2 (Populated)` |
| Stitch ID | `ab93d842bf2e49caa838a1fd414eb35b` / `9cbad6aacb6246549913e275f228fa80` |
| Existing route | `/contact`; preview `/…/preview/contact` |
| Existing view | `public/contact.ejs` vs `preview.ejs` |
| Existing partials | Shell |
| Existing CSS | Channel cards + map when coords valid |
| Existing content source | Published `contact_channels` + branch/church settings email/phone/address/lat-lng |
| Missing sections | “Send a Message” form (intentional — no public POST); office hours / newsletter |
| Missing imagery | Map imagery only when coordinates present (OSM embed, not Stitch demo map JPG) |
| Missing typography / spacing / mobile | Preview vs published |
| Empty-state problem | Demo email channel only; address/coords often missing → no map |
| Publish-state mismatch | Contact method is a **publish readiness** gap; channels still optional richness |
| Preview/published mismatch | Preview lists channels without settings cards/map |

### 10. Giving preview / published

| Field | Value |
|-------|--------|
| Exact Stitch screen name | `07-public-giving-desktop-v2 (Populated)` / `07-public-giving-mobile-v2 (Populated)`; Empty: `07-public-giving-desktop-v2 (Empty)` |
| Stitch ID | `59c8fdedf68a43e3a5d2384b0c2212df` / `a0616f23568c464a95eda9e317e2fa9d`; empty `a08093b9ec32467bad300ef43ac800fa` |
| Existing route | `/giving`; preview `/…/preview/giving` |
| Existing view | `public/giving.ejs` vs `preview.ejs` |
| Existing partials | Shell |
| Existing CSS | Method cards + disclaimer |
| Existing content source | Published `giving_methods` (informational only — no payments) |
| Missing sections | Payment UI / fake QR (intentionally omitted) |
| Missing imagery | Method visuals only if CMS provides |
| Missing typography / spacing / mobile | Preview vs published |
| Empty-state problem | Empty state exists; demo has one bank_transfer method if seeded |
| Publish-state mismatch | Optional for site publish |
| Preview/published mismatch | Yes |

### 11. Publish confirmation

| Field | Value |
|-------|--------|
| Exact Stitch screen name | **None found** in live Stitch project for a dedicated publish-confirmation modal/page |
| Stitch ID | — |
| Existing route | `POST /hq/website/publish` (+ `preview-ack`, `unpublish`, `repair-foundation`) |
| Existing view | Same `hq/website.ejs` with checkbox confirm + flash `notice=published` |
| Existing partials | HQ shell |
| Existing CSS | HQ admin |
| Existing content source | `publishChurchWebsite` readiness gates |
| Missing sections | Dedicated success composition / checklist celebration UI |
| Missing imagery | N/A |
| Missing typography / spacing / mobile | Utilitarian form |
| Empty-state problem | N/A |
| Publish-state mismatch | Flash “Website published” ≠ visual confirmation of public site |
| Preview/published mismatch | Ack is a boolean; does not require viewing Stitch-parity preview |

### 12. Published church mini-site (overall)

| Field | Value |
|-------|--------|
| Exact Stitch screen name | Full tenant public set (home→giving) above |
| Stitch ID | See per-page table |
| Existing route | Tenant hostname `/…` or path-public prefix when entitled |
| Existing view | `page.ejs` → page-specific includes |
| Existing partials | Shell + Powered by GetPro |
| Existing CSS | `tenant-public.css` |
| Existing content source | Published CMS only; draft invisible |
| Missing sections | Live home teasers; church-owned logo; social links; public announcements |
| Missing imagery | Depends entirely on CMS `mediaUrl` / entity images |
| Missing typography | Close when content present; Sacred Modernity vs Stitch Inter tokens |
| Missing spacing/layout | Close at layout level; content density drives “finished” feel |
| Missing mobile behavior | Drawer/nav present; remaining Playwright visual gaps at 1440/768/390/360 |
| Empty-state problem | Demo / new church content under-fills templates |
| Publish-state mismatch | Site publish ≠ every page/entity published |
| Preview/published mismatch | Admin preview path is the primary operator confusion |

### 13. Desktop / Mobile (cross-cutting)

| Field | Value |
|-------|--------|
| Exact Stitch screen name | Paired desktop/mobile screens listed above; editor: `34-branch-website-editor-*` |
| Stitch ID | Per screen |
| Existing route | Same routes; responsive CSS |
| Existing view | Shared templates |
| Existing partials | Mobile drawer in shell-start |
| Existing CSS | Media queries in `tenant-public.css` |
| Existing content source | Same |
| Missing sections | Calendar mobile/desktop (obsolete) |
| Missing imagery | Device-specific Stitch hero assets unwired as hardcoded defaults (correct — CMS-driven) |
| Missing typography | Device-specific Stitch type scale nuances |
| Missing spacing/layout | Admin preview has no responsive Stitch compositions |
| Missing mobile behavior | Admin preview / website dashboard not audited against Stitch mobile editor |
| Empty-state problem | Same content gaps on both breakpoints |
| Publish-state mismatch | N/A |
| Preview/published mismatch | Preview worse on both breakpoints |

---

## Root-cause summary (why it looks unfinished)

| Cause | Effect |
|-------|--------|
| Admin preview ≠ public templates | Operators never see Stitch parity until after publish / public URL |
| Demo seed = smoke text, not Stitch content model | Heroes without media; about without mission/vision/values; single entities; `[Demo]` titles |
| Optional CMS richness not required to publish | Published site can be legally “live” but visually empty |
| No church logo / social schema on public shell | Hardcoded BlessBoard mark; no social row vs Stitch footers |
| Intentional omissions | No fabricated stats, contact form, calendar, payment QR — Stitch populated screens include some of these |
| Website publish UI not Stitched | Feels like ops checklist, not product polish |

---

## Demo data audit

**Source of truth for testing seed:** `src/blessboard/services/demoMinimumDatasetSpec.js` (+ `demoMinimumDatasetService.js`, `scripts/rehearse-demo-v5-dataset-local.js`, `tests/blessboard-demo-v5-dataset.test.js`).  
**Foundation shells (empty drafts):** `websiteFoundationRepairService.js` — pages without rich sections.

| Field | Classification | Notes |
|-------|----------------|-------|
| Church name | **PRESENT** / **PRESENT_BUT_WEAK** | Org/church display name from provisioning; demo page titles use “[Demo] Testing Congregation” |
| Hero title | **PRESENT_BUT_WEAK** | Home page title / first section heading; not a dedicated `hero` section with Stitch-length headline |
| Hero subtitle | **PRESENT_BUT_WEAK** | Single `demo_body` paragraph, not hero lead |
| Hero image | **MISSING** | No `mediaUrl` in demo seed |
| About summary | **PRESENT_BUT_WEAK** | Generic about `demo_body` |
| Mission | **MISSING** | No section key/type/heading containing “mission” |
| Vision | **MISSING** | Same |
| Values | **MISSING** | Same |
| Leadership profiles | **PRESENT_BUT_WEAK** | One leader: name/role/bio; no photo; `[Demo]` tagged |
| Ministries | **PRESENT_BUT_WEAK** | One ministry; summary only; no image |
| Upcoming events | **PRESENT_BUT_WEAK** | One future midweek event |
| Sermons/resources | **PRESENT_BUT_WEAK** | One sermon; no media/resource URLs |
| Service times | **MISSING** / **DERIVABLE** | Canonical empty `service_times` section may exist via foundation; demo seed does not populate `layout_metadata.entries` |
| Contact details | **PRESENT_BUT_WEAK** | One email channel `demo.contact@example.test` |
| Address | **MISSING** | Not in demo minimum dataset |
| Giving details | **PRESENT_BUT_WEAK** | One instructional bank_transfer method |
| Announcements | **PRESENT_BUT_WEAK** | Member-audience demo announcement — **not** shown on public mini-site |
| Logo | **MISSING** / schema **BLOCKED** for product field | Shell uses platform BlessBoard mark; onboarding notes no dedicated V5 logo field (`has_logo` false) |
| Footer links | **DERIVABLE** | Quick links from `navItems` / defaults — present in shell, not seeded as CMS |
| Social links | **MISSING** | No public social fields wired in shell |

**Safe to seed in testing:** All **SAFE_TO_SEED_IN_TESTING** when marked `[Demo]` / `bb_demo` / fictional URLs (`example.test`), using existing media allowlist or **local static demo assets** under `public/church/images/…` (already in repo for V4/Stitch, currently unwired as defaults).  
**Blocked by storage:** Real uploaded portraits/covers need working media storage (local FS OK in testing; Supabase credentials for hosted). Seeding **https** demo image URLs or repo-static paths avoids storage if allowlisted by `safeExternalUrl` / public static serving.

---

## Recommended fix plan (max 6 batches)

### Batch 1 — Demo content seed

**Goal:** Make testing org fill Stitch-shaped sections/entities without fake production claims.

**Files**
- `src/blessboard/services/demoMinimumDatasetSpec.js`
- `src/blessboard/services/demoMinimumDatasetService.js`
- `scripts/rehearse-demo-v5-dataset-local.js` (verify/report)
- Optional static demo media under `public/church/images/tenant-public/` (reuse existing assets; do not invent stock people as “real”)

**Tests**
- `tests/blessboard-demo-v5-dataset.test.js` — assert hero section + media, mission/vision/values keys, service_times entries, ≥2 leaders/ministries where useful, cleanup markers

### Batch 2 — Public-page data loader

**Goal:** Surface seeded/CMS fields consistently; optional home teasers from published lists.

**Files**
- `src/blessboard/http/loadTenantPublicPageModel.js`
- `src/blessboard/services/publicContentReadService.js` (if projection needed)
- `src/blessboard/services/homeServiceTimesService.js` (ensure demo/admin entries round-trip)

**Tests**
- `tests/blessboard-public-pages.test.js` — section classification, branch→church fallback, published-only filter, teaser limits

### Batch 3 — Shared public shell parity

**Goal:** Logo lockup path (when field exists or testing override), footer socials if modeled, preview banner that still uses public shell.

**Files**
- `views/blessboard/v5/partials/tenant-public-shell-start.ejs`
- `views/blessboard/v5/partials/tenant-public-shell-end.ejs`
- `public/blessboard/v5/tenant-public.css` (+ `?v=` bump in shell)
- Possibly settings locals in loader

**Tests**
- `tests/blessboard-public-pages.test.js` / tenant-routing shell regressions
- `npm run test:blessboard:tenant-routing`

### Batch 4 — Home / about / leadership parity

**Goal:** Close remaining visual gaps when content present; empty-state copy closer to Stitch empty variants.

**Files**
- `views/blessboard/v5/public/home.ejs`
- `views/blessboard/v5/public/about.ejs`
- `views/blessboard/v5/public/leadership.ejs`
- `public/blessboard/v5/tenant-public.css`

**Tests**
- `tests/blessboard-public-pages.test.js` — hero media class, about purpose grid presence, featured leader

### Batch 5 — Ministries / events / sermons / contact / giving parity

**Goal:** Card density, featured rows, map/contact hierarchy, giving empty/populated.

**Files**
- `views/blessboard/v5/public/ministries.ejs`
- `views/blessboard/v5/public/events.ejs`
- `views/blessboard/v5/public/sermons.ejs`
- `views/blessboard/v5/public/contact.ejs`
- `views/blessboard/v5/public/giving.ejs`
- `public/blessboard/v5/tenant-public.css`

**Tests**
- `tests/blessboard-public-pages.test.js` — ordering, safe URLs, empty states, map when coords

### Batch 6 — Preview / publish QA and responsive fixes

**Goal:** Make authenticated preview render the **same** public templates (draft-aware model); polish HQ website publish confirmation; responsive QA.

**Files**
- `views/blessboard/v5/content-admin/preview.ejs` → switch to `renderTenantPublicPage` + draft-capable loader path
- `src/blessboard/http/contentAdminRoutes.js` (preview handler)
- `src/blessboard/http/loadTenantPublicPageModel.js` (preview mode: include drafts)
- `views/blessboard/v5/hq/website.ejs` (+ optional CSS)
- `docs/ui/V5_PUBLIC_STITCH_IMPLEMENTATION.md` / screen map updates

**Tests**
- New or extended: preview HTML contains `data-bb-stitch-home` / shell markers; draft section visible in preview only; published route excludes draft
- Playwright or manual checklist at 1440 / 768 / 390 / 360 against Stitch IDs above
- Publish readiness tests for `churchWebsitePublishService` unchanged behavior

---

## Stitch screen ID quick reference (canonical)

| Surface | Desktop ID | Mobile ID |
|---------|------------|-----------|
| Home refined | `ead45db5be774baa9454412262096ffc` | `89177588fbf8405dbebd5747c38e19ce` |
| About populated | `44492f6abbe849d0a8a89303ce83129b` | `3f0b8a5c30544d9495064df8d5f9e62e` |
| Leadership populated | `372faa60f8df4983b627db3cb5d35f9d` | `0f4e816fd64d4592bd3677fbde3b7544` |
| Ministries populated | `f146cdccadb34ff3bd8b0b75a0450d15` | `d2fd7ecc586541d3beb5d0d3bed98d56` |
| Events populated | `6f618576f0304982bd239bfe04946e72` | `f58c416cbbd545429258d963b3a15b60` |
| Sermons populated | `4f4995dc4ec84354ac80ed022a767ef3` | `96b380d4e47649c1bd7f05cabe9c3a1d` |
| Contact populated | `ab93d842bf2e49caa838a1fd414eb35b` | `9cbad6aacb6246549913e275f228fa80` |
| Giving populated | `59c8fdedf68a43e3a5d2384b0c2212df` | `a0616f23568c464a95eda9e317e2fa9d` |
| Website editor | `3f3160664d91423d80cb4ba81e2af6c4` | `f2bb5e794f074a1aa3d248a2fe54ddeb` |

---

## Confirmation

- **Created:** `docs/phase2/PHASE2_077_CHURCH_WEBSITE_PREVIEW_PUBLISH_AUDIT.md` only  
- **Runtime code:** unchanged  
- **Sources:** live Stitch MCP `list_screens`, V5 public/admin views & routes, `demoMinimumDatasetSpec.js`, prior `docs/ui/V5_PUBLIC_STITCH_IMPLEMENTATION.md` / `V5_STITCH_SCREEN_MAP.md`
