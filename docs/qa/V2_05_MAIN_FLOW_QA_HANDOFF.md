# V2.05 Main Flow — QA Handoff

**Branch:** `V5`  
**Scope:** Main Flow only (registration → Admin Console → Website → edit → draft → nudge → Change Manager → publish → live)  
**Products:** ActiveClinic (AC) + BlessBoard (BB)  
**Status:** Implementation Tasks 1–9 complete; this document is documentation-only handoff for manual QA.

| Marker | Value |
|--------|--------|
| FINAL | `V205_MAIN_FLOW_QA_HANDOFF_CREATED` |
| Related FINALs | `V205_POST_AUTH_DASHBOARD_DONE`, `V205_ADMIN_SHELL_DONE`, `V205_WEBSITE_ADMIN_DONE`, `V205_WEBSITE_EDITING_DONE`, `V205_PUBLISH_NUDGE_DONE`, `V205_UNIFIED_PUBLISH_DONE`, `V205_MAIN_FLOW_INTEGRATION_DONE`, `V205_MAIN_FLOW_STITCH_PARITY_DONE`, `V205_MAIN_FLOW_RBAC_DONE` |
| Stitch registry | `docs/design/V2_05_STITCH_SCREEN_IMPLEMENTATION_REGISTRY.md` |

---

## 1. Implemented flow

Canonical end-to-end path (AC and BB share the same lifecycle vocabulary; product readiness rules stay product-specific):

```
Register
  → Admin Console Dashboard
  → Website (Admin Console module #2)
  → Live Preview / Edit Website
  → Edit text | image | section | YouTube
  → Save Draft (never auto-publish)
  → 5-change Publish Nudge (Change Manager count ≥ 5)
  → Preview (draft; does not publish)
  → Change Manager (unpublished draft vs live)
  → Publish Readiness → Confirm Publish
  → Live Website
```

**Unified publish engine:** one `publicationOrchestrator` behind `PublishWorkflow` facade. No second publishing engine.  
**Unified editor engine:** one WE01 inline editor (`/platform/website-inline-edit.js`).  
**Auth model:** existing session + RBAC; `website.edit` ≠ `website.publish`.

Post-auth landings:

| Product | Register / login landing |
|---------|--------------------------|
| ActiveClinic | `/app` |
| BlessBoard | `/hq` |

---

## 2. Screens (Stitch logical IDs)

| Logical ID | Product | Form factors | Route | Implementation |
|------------|---------|--------------|-------|----------------|
| **AC-ADM-01** | AC | Desktop 1440 / Mobile 390 | `/app` | Admin Console dashboard |
| **BB-ADM-01** | BB | Desktop 1440 / Mobile 390 | `/hq` | HQ Admin Console dashboard |
| **AC-WEB-ADM-01** | AC | 1440 / 390 | `/app/settings/website` | Website Management Hub |
| **BB-WEB-ADM-01** | BB | 1440 / 390 | `/hq/website` | Website Management Hub |
| **AC-WEB-THM-01** | AC | 1440 / 390 | `/app/settings/website/themes` | Themes & Live Preview |
| **BB-WEB-THM-01** | BB | 1440 / 390 | `/hq/website/themes` | Themes & Live Preview |

**Canonical Admin Console nav order (1–10):**  
Dashboard → Website → Content → People → Operations → Locations → Media → Reports → Access → Settings  
(Website is second when the actor is permitted.)

**Themes workflow:** Select Clarity / Editorial / Community → Live Preview (1440 / 768 / 390) → Apply to draft → Change Manager → Publish. Presentation-only; content data is not duplicated.

**Note:** Stitch ADM-01 canvases may show SOC2/HIPAA/quorum chrome. Canonical product purpose is operational KPIs, pending actions, location/branch status, activity, and website status — do not fail QA for missing Stitch drift concepts.

---

## 3. Routes

### ActiveClinic

| Step | Route / pattern |
|------|-----------------|
| Register success / login | → `/app` |
| Dashboard | `GET /app` |
| Website hub | `GET /app/settings/website` |
| Themes | `GET /app/settings/website/themes` |
| Publish readiness | `GET /app/settings/website/publish` |
| Draft editor | `/clinics/:clinicKey?website_edit=1&website_mode=draft` (and page paths) |
| Draft preview | `/clinics/:clinicKey?website_mode=draft` |
| Change Manager | `/clinics/:clinicKey/website/unpublished-changes` |
| Confirm publish (POST) | `/clinics/:clinicKey/website/publish` |
| Media | `/app/settings/website/media` |
| Live public | `/clinics/:clinicKey` (when published) |

### BlessBoard

| Step | Route / pattern |
|------|-----------------|
| Register success / login | → `/hq` |
| Dashboard | `GET /hq` |
| Website hub | `GET /hq/website` |
| Themes | `GET /hq/website/themes` |
| Publish review | `GET /hq/website/publish/review` |
| Confirm publish (POST) | `POST /hq/website/publish` |
| Branch-scoped review/confirm | `/hq/website/branches/:branchKey/publish/review` · `.../publish` |
| Change Manager | `/hq/content/draft-changes` |
| Draft editor | `/c/:orgKey?website_edit=1&website_mode=draft` (and page paths) |
| Publish success | `/hq/website/publish/success` |
| Live public | `/c/:orgKey` (when published) |

---

## 4. Shared components / patterns

| Pattern | Location / notes |
|---------|------------------|
| `PostAuthDashboard` | `src/platform/auth/postAuthDashboard.js` |
| `AdminConsoleShell` | `src/platform/admin-console/adminConsoleShell.js` + `public/platform/admin-console-shell.css` |
| `WebsiteManagementHub` | `src/platform/website/websiteManagementHub.js` |
| `ThemeSelector` + families Clarity / Editorial / Community | `src/platform/website/themeSelector.js` |
| Theme gallery UI | `views/platform/website/theme-gallery-page.ejs` + `public/platform/website-theme-gallery.js` |
| `LivePreview` / `ResponsiveViewport` | `livePreview.js`, `responsiveViewport.js`; iframe engine for 768/390 |
| WE01 editor | `public/platform/website-inline-edit.js` + `views/platform/website-engine/editor-chrome.ejs` |
| `WebsiteContentEditing` | Inline text, image, media picker, section manager, YouTube (`videoEmbedEditor`), SaveBar |
| `PublishNudge` | `publishNudge.js` + `views/platform/website-engine/publish-nudge.ejs` (threshold **5**) |
| `PublishWorkflow` | Facade over `publicationOrchestrator` (edit → draft → preview → CM → publish → live) |
| Change Manager UI | Platform website-engine change manager (draft-vs-published counts) |

**Viewport targets:** Desktop **1440**, Tablet **768**, Mobile **390**.

---

## 5. AC-specific components

| Surface | Path |
|---------|------|
| App shell | `views/activeclinic/layouts/app-shell.ejs` (`data-gp-admin-console-stitch="AC-ADM-01"`) |
| Dashboard home | `views/activeclinic/app/home-content.ejs` |
| Website hub | `views/activeclinic/app/settings-website-content.ejs` |
| Themes host | `views/activeclinic/app/settings-website-themes.ejs` |
| Editor chrome include | `views/activeclinic/partials/website-editor-chrome.ejs` |
| Website routes / chrome | `activeClinicWebsiteRoutes.js`, `attachActiveClinicWebsiteChrome.js` |
| Nav RBAC | `activeClinicNavigation.js` |

---

## 6. BB-specific components

| Surface | Path |
|---------|------|
| HQ shell | `views/blessboard/v5/partials/hq-shell-start.ejs` (`data-gp-admin-console-stitch="BB-ADM-01"`) |
| HQ dashboard | `views/blessboard/v5/hq/dashboard.ejs` |
| Website hub | `views/blessboard/v5/hq/website-management.ejs` |
| Content / page editor shell | `views/blessboard/v5/content-admin/page.ejs` |
| Editor chrome include | `views/blessboard/v5/partials/website-admin-chrome.ejs` |
| HQ website routes / chrome | `churchWebsiteAdminRoutes.js`, `attachWebsiteAdminChrome.js` |
| Editor HTTP | `blessboardWebsiteEditorRoutes.js` |
| HQ nav | `hqAdminNav.js` |

---

## 7. Automated tests (focused main-flow)

| File | Coverage |
|------|----------|
| `tests/v2-05-main-flow-batch1-post-auth-dashboard.test.js` | Register → `/app` / `/hq`; role-scoped nav; tenant isolation |
| `tests/v2-05-main-flow-batch2-admin-console-shell.test.js` | Shell markers; Dashboard then Website; RBAC hide |
| `tests/v2-05-main-flow-batch3-website-management.test.js` | Hub modules; themes; Live Preview 1440/768/390 |
| `tests/v2-05-main-flow-batch4-website-content-editing.test.js` | Text/image/section/YouTube; draft-first |
| `tests/v2-05-main-flow-batch5-publish-nudge.test.js` | ≥5 Change Manager nudge; dismiss; no force-publish |
| `tests/v2-05-main-flow-batch6-unified-publish-workflow.test.js` | Unified orchestrator; edit≠publish; preview≠publish |
| `tests/v2-05-main-flow-task7-integration.test.js` | E2E chain AC+BB; viewport markers |
| `tests/v2-05-main-flow-task8-stitch-parity.test.js` | Six-screen Stitch parity markers |
| `tests/v2-05-main-flow-task9-rbac.test.js` | Role grants; hub publish gating; tenant/branch returnTo |

**Run (focused):**

```bash
node --test tests/v2-05-main-flow-batch*.test.js tests/v2-05-main-flow-task*.test.js
```

Supporting regressions (optional): PC10 / PL04 / V8 lifecycle / BB publish auth suites used during Task 6.

---

## 8. Known gaps

1. **AC-ADM-01 / BB-ADM-01** — Registry `IMPLEMENTED_PARTIAL`: dashboards do not reproduce Stitch SOC2/HIPAA/quorum visual concepts; canonical ops dashboard is intentional.
2. **Facility / location admin** — AC facility admin is facility-scoped and is **not** treated as an org website publisher via the engine role map; org website publish remains org-admin / `website.publish` holders.
3. **BB branch admin** — Engine role map grants edit/submit; **publish** still requires `website.publish` (catalogue may grant separately). Confirm with the active permission catalogue in the QA environment.
4. **Publish Nudge** — Non-blocking; session dismiss allowed; does not force publish.
5. **Theme live preview** — Gallery viewport toggles (1440/768/390) + Preview links; full public `@media` fidelity for tablet/mobile uses the WE01 iframe path in the editor (`website_frame=1`).
6. **No production deploy** as part of V2.05 main-flow tasks — QA against the agreed V5 environment only.

---

## 9. Manual QA scenarios

Use two browsers or clear sessions between products. Prefer Desktop **1440** and Mobile **390** windows (and editor viewport controls where present).

### A. Registration → Dashboard

| ID | Product | Steps | Expect |
|----|---------|-------|--------|
| M-AC-01 | AC | Complete clinic registration | Lands on **`/app`** Admin Console Dashboard (AC-ADM-01). Nav shows **Dashboard** first; **Website** second when permitted. |
| M-BB-01 | BB | Complete church registration | Lands on **`/hq`** HQ Dashboard (BB-ADM-01). Dashboard first; Website second when permitted. |
| M-AC-02 | AC | Login as org admin | Same `/app` landing; website status / console links visible when entitled. |
| M-BB-02 | BB | Login as HQ admin | Same `/hq` landing. |

### B. Website hub → edit → publish (happy path)

| ID | Product | Steps | Expect |
|----|---------|-------|--------|
| M-AC-10 | AC | `/app` → Website → `/app/settings/website` | AC-WEB-ADM-01 hub: status strip, modules (Edit, Themes, Preview, Change Manager, Publish when allowed). |
| M-BB-10 | BB | `/hq` → Website → `/hq/website` | BB-WEB-ADM-01 hub with same module pattern. |
| M-AC-11 | AC | Edit Website → change content → Save Draft | Draft saved; live site unchanged. |
| M-BB-11 | BB | Edit Website → change content → Save Draft | Same draft-first behavior. |
| M-AC-12 | AC | Preview draft → Change Manager → Publish readiness → Confirm | Live clinic site updates; draft counter resets / unpublished cleared. |
| M-BB-12 | BB | Preview → `/hq/content/draft-changes` → Publish review → Confirm | Live church site updates; success path available. |

### C. Content editing (both products)

| ID | Action | Expect |
|----|--------|--------|
| M-ED-01 | **Text edit** (inline / structured) | Pencil → edit → Save Draft; no publish. |
| M-ED-02 | **Image edit** (replace / upload / library) | Uses shared media field; draft only. |
| M-ED-03 | **Section** add / reorder / remove | Shared section actions; draft only; schema not invented per product. |
| M-ED-04 | **YouTube embed** | Valid YouTube URL accepted; no raw iframe paste; no autoplay requirement. |
| M-ED-05 | Save status | SaveBar shows draft save status; auto-publish off. |

### D. Themes & live preview

| ID | Steps | Expect |
|----|-------|--------|
| M-TH-01 | Open Themes (AC `/app/settings/website/themes` or BB `/hq/website/themes`) | AC-WEB-THM-01 / BB-WEB-THM-01; Clarity, Editorial, Community. |
| M-TH-02 | **Apply to draft** a non-live theme | Draft theme changes; live theme unchanged until publish. |
| M-TH-03 | Viewport **Desktop 1440 / Tablet 768 / Mobile 390** | Controls present and selectable; Preview opens draft appropriately. |
| M-TH-04 | Publish after theme draft | Live presentation updates without content wipe. |

### E. Publish nudge (≥5)

| ID | Steps | Expect |
|----|-------|--------|
| M-PN-01 | Make **5+ meaningful** saved draft changes (Change Manager count) | Publish Nudge appears (hub and/or editor). |
| M-PN-02 | Keystrokes alone / unsaved typing | Count does **not** increment. |
| M-PN-03 | Dismiss nudge for session | Hidden for session; does not publish. |
| M-PN-04 | Actor without `website.publish` | Nudge may show review/preview; **Publish** CTA unavailable / not forced. |

### F. Publish entry points

| ID | Entry | Expect |
|----|-------|--------|
| M-PU-01 | **Admin Console** Publish / review tile | Opens readiness review (GET); confirm is separate POST. |
| M-PU-02 | **Website editor** Publish (when permitted) | Same orchestrator; success / Open Live; counter reset. |
| M-PU-03 | Preview button | Never publishes. |
| M-PU-04 | Unpublish / history / restore-as-new | Still available where product supports (preserved capabilities). |

### G. Isolation & RBAC

| ID | Scenario | Expect |
|----|----------|--------|
| M-RB-01 | AC clinic A session → clinic B website admin URL | Denied / no owner context (403 or equivalent isolation). |
| M-RB-02 | BB forged / cross-org returnTo or instance | Rejected (`tenant_mismatch` / allow-list). |
| M-RB-03 | BB **branch** publish paths | Confirm branch-scoped review/confirm URLs when branch context applies. |
| M-RB-04 | AC **facility / location** admin | Facility scope enforced; not treated as org website publisher by default. |
| M-RB-05 | **Editor without publish** | Can edit + save draft; no Publish button/module; direct publish POST → **403**. |
| M-RB-06 | **Publisher** (publish without edit, if role present) | Publish allowed; edit controls absent or denied. |
| M-RB-07 | **Restricted staff** (no website perms) | Dashboard may load; Website nav hidden; website URLs denied. |
| M-RB-08 | HQ admin / org admin | Full website edit + publish when catalogue grants both. |

### H. Responsive smoke

| ID | Viewport | Surfaces |
|----|----------|----------|
| M-VP-01 | **1440** | Dashboard, Website hub, Themes, Editor toolbar |
| M-VP-02 | **390** | Same surfaces; mobile nav/drawer usable; touch targets for viewport + Publish/Save |

---

## 10. QA sign-off checklist

- [ ] M-AC-01 / M-BB-01 registration landings  
- [ ] M-AC-10–12 / M-BB-10–12 hub → edit → publish → live  
- [ ] M-ED-01–05 content editing  
- [ ] M-TH-01–04 themes + viewports  
- [ ] M-PN-01–04 five-change nudge  
- [ ] M-PU-01–04 publish entries  
- [ ] M-RB-01–08 isolation + permissions  
- [ ] M-VP-01–02 1440 / 390  
- [ ] Focused automated suite green on V5  

---

## 11. Out of scope for this handoff

- Broad product audits beyond main-flow screens listed above  
- Deploy / production cutover  
- Implementing Stitch ADM-01 compliance/quorum visual drift  
- Non-website Admin Console modules (patients, attendance, etc.) except as nav/RBAC context  

---

FINAL=V205_MAIN_FLOW_QA_HANDOFF_CREATED
