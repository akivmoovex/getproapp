# Phase 7 — Demo church website audit (continued)

**Date:** 2026-07-29  
**Surface:** `/c/:organizationKey` V5 path-public  
**Prior verdict:** `CLOSE` (density P0)  
**Current verdict:** `CLOSE` (exact Stitch reference alignment — see `PHASE7_EXACT_STITCH_REFERENCE_MAP.md`)

Exact screen IDs, artboard normalization, and mobile MISSING coverage:  
[`docs/phase7/PHASE7_EXACT_STITCH_REFERENCE_MAP.md`](./PHASE7_EXACT_STITCH_REFERENCE_MAP.md)

Older `church-flow/01-public-website` PNG comparisons are **WRONG_REFERENCE** and removed from the visual suite.

---

## 1. Final verdict: `CLOSE`

| Gate | Status |
|------|--------|
| 8 pages × desktop/mobile captured | Pass (16) |
| Exact desktop Stitch IDs | **8/8 CONFIRMED** |
| Exact mobile Stitch IDs | **1/8 CONFIRMED** (Home); **7 MISSING** |
| Mobile drawer open capture | Pass (44px touch retained) |
| Giving-method / leadership intro / footer social editors | Implemented |
| Branding colours | **PLATFORM_CONTROLLED / PRODUCT_BLOCKED** |
| Pixel `MATCHED` vs exact Phase 7 Stitch | Not claimed (mobile refs missing + MEDIA_BLOCKED) |

---

## 2. Exact-reference comparison (replaces church-flow matrix)

Baselines: `tests/__screenshots__/phase7-public/`  
References: `design-reference/stitch-screens/phase7-exact/*/viewport-*.png`  
Report: `tests/__screenshots__/phase7-public/stitch-comparison-report.json`  
Viewports: desktop **1280×900** (2560@2x), mobile **390×844**

Former auto `CODE_DEFECT` (6) vs church-flow PNGs → reclassified **WRONG_REFERENCE**.  
Exact-map manual classes: content / media / product / `STITCH_REFERENCE_BLOCKED` for missing mobiles.  
**No `CONFIRMED_CODE_DEFECT`** pending full mobile artboards.

---

## 3. Screenshot baseline counts

| Item | Count |
|------|------:|
| Public page viewport captures | 16 |
| Mobile drawer open | 1 |
| Exact Phase 7 HTML-rendered refs | 9 (8 desktop + home mobile) |
| Comparison rows in report | 17 |

---

## 4. Giving-method editor status: **IMPLEMENTED**

- Draft kind `giving_method` (validation → overlay → apply → publish)
- Fields: name, description, account details, instructions, external URL, button label, optional QR image, visibility, sort order
- UI pencils + add control on `giving.ejs`
- Migration `049_giving_method_editor_fields.sql` for extended columns
- Migration `050_…` expands `wsd_kind_check`
- Drag-and-drop ordering: **PRODUCT_ENHANCEMENT** (move-up/down retained)

---

## 5. Leadership-introduction editor status: **IMPLEMENTED**

- Inline allowlist: `leadership` / `hero` / `heading` + `bodyText`
- Wired through `page-hero` with `editPageKey` / `editSectionKey`
- Eyebrow remains template constant (“Our Heart for Service”) — not CMS-backed → **PRODUCT_DECISION** not to invent an eyebrow editor

---

## 6. Footer-social editor status: **IMPLEMENTED**

- Draft kind `social_link` → `contact_channels`
- Add / edit / hide / reorder / https URL validation
- Empty-href placeholders no longer render (no icon-only chips)
- Socials loaded for footer on all public pages

---

## 7. Branding-colour product disposition: **PLATFORM-CONTROLLED / PRODUCT-BLOCKED**

| Question | Answer |
|----------|--------|
| Church-controlled today? | **No** — no per-church colour columns in `church_settings` |
| Plan-gated? | **No** dedicated entitlement found |
| Platform-controlled? | **Yes** — tokens in `design-tokens.css` (`--bb-color-primary: #6c5ce7`, GetPro orange accent) |
| Product-blocked for Phase 7? | **Yes** — do not implement church colour editors yet; HQ content admin marks org branding unavailable |

---

## 8. Files changed (this stage)

**Editors / data**

- `db/migrations/blessboard/049_giving_method_editor_fields.sql`
- `db/migrations/blessboard/050_website_structured_draft_kinds_giving_social.sql`
- `src/blessboard/repositories/publicContentRepository.js`
- `src/blessboard/services/publicContentAdminService.js`
- `src/blessboard/services/websiteStructuredDraftValidation.js`
- `src/blessboard/services/websiteStructuredDraftService.js`
- `src/blessboard/services/websiteDraftApplyService.js`
- `src/blessboard/services/websiteInlineEditableFields.js`
- `src/blessboard/http/loadTenantPublicPageModel.js`
- `public/blessboard/v5/website-structured-edit.js` (`?v=5`)
- `views/blessboard/v5/public/giving.ejs`
- `views/blessboard/v5/public/leadership.ejs`
- `views/blessboard/v5/partials/tenant-public-shell-end.ejs`

**Tests / docs / baselines**

- `tests/blessboard-phase7-editors.test.js`
- `tests/blessboard-phase7-visual-stitch.test.js`
- `tests/blessboard-phase7-public-density-audit.test.js` (kinds / leadership allowlist)
- `tests/__screenshots__/phase7-public/*`
- `docs/phase7/PHASE7_DEMO_CHURCH_WEBSITE_AUDIT.md` (this update)

---

## 9. Exact test commands and results

```bash
NODE_ENV=test node --test \
  tests/blessboard-phase7-public-density-audit.test.js \
  tests/blessboard-v5-frontend-assets.test.js \
  tests/blessboard-v5-mobile-drawer-menu.test.js \
  tests/blessboard-phase7-editors.test.js
# → 43 pass / 0 fail

NODE_ENV=test node --test tests/blessboard-phase7-visual-stitch.test.js
# → 5 pass / 0 fail (exact Phase 7 references)
```

---

## 10. Remaining gaps (parity only — not release blockers)

| Gap | Classification |
|-----|----------------|
| Seven missing Phase 7 mobile artboards | `STITCH_REFERENCE_BLOCKED` |
| MCP full-resolution PNG exports unavailable (HTML-rendered refs used) | `STITCH_REFERENCE_BLOCKED` |
| Stitch remote photography vs same-site demo media | `MEDIA_BLOCKED` |
| Branding colour editors | `PRODUCT_BLOCKED` |
| Drag-and-drop reorder UI | `PRODUCT_ENHANCEMENT` |
| Drawer-open vs drawer-closed compare | `INTENTIONALLY_ACCEPTED` |

**Verdict remains `CLOSE`.** Pixel `MATCHED` is not claimable while mobile refs and media blocks remain.

---

## 11. Release readiness (2026-07-29)

### 1. Final code review outcome — **PASS (with one security harden)**

Reviewed migrations `049`/`050`, giving-method schema/repo, leadership intro allowlist, footer social drafts, inline/structured authz, draft-vs-published separation, tenant scoping, CSRF on editor POSTs, HTTPS URL validation, QR/media path handling, empty-state templates, and nullable new columns.

**Fix applied this pass:** `saveStructuredDraft` now returns **404** when a UUID `entityKey` (or reorder id) belongs to another church — cross-org giving/social IDs no longer soft-save under the caller’s church.

Trusted tenant context supplies `churchId` / `organizationId` from session; client org/branch IDs are not accepted as authority.

### 2. Migration verification — **PASS**

| Path | Result |
|------|--------|
| Clean migrate (all modules) | Columns `description`, `account_details`, `button_label`, `qr_image_url` nullable; length CHECKs present; `wsd_kind_check` includes `giving_method` + `social_link`; provision works |
| Upgrade from pre-049 | Re-apply `049`/`050` after stripping cols/constraint; legacy giving row preserved; new cols null; no data loss |
| Idempotency | `ADD COLUMN IF NOT EXISTS` + constraint existence guards; remigrate no-op via `schema_migrations` |
| Rollback | No destructive down migrations (intentional) |

### 3. Focused Phase 7 totals

`43 pass / 0 fail` (density + assets + drawer + editors)  
`5 pass / 0 fail` (visual exact-ref)  
Combined focused+visual: `48 pass / 0 fail`

### 4. Broader regression totals

18 relevant suites (public pages, inline/structured editors, draft/publish, CSRF audit, tenant auth, authorization, branch/HQ shells, provision orchestrator, public content schema, content admin, service times, demo seed, …):

**`231 pass / 0 fail / 0 skipped`**

Stale assertions updated to match shipping product (CSS `?v=44`, initial website **published** not draft, CSRF audit recognizes conflict/approval handlers, schema table inventory).

### 5. Smoke-test results — **PASS**

`/c/demo-10-church` (+ 7 routes): anonymous `200`, no editor JS, `tenant-public.css?v=44`, no horizontal overflow, mobile drawer **44px**, density CSS retained.

Admin path (service-level trusted context): giving method draft → public unchanged → publish → visible; leadership heading publish; HTTPS social reject; publication versions incremented; cross-org giving/social UUID → **404**.

### 6. Asset version decision

| Item | Value |
|------|-------|
| Public CSS | `tenant-public.css?v=44` |
| Public assets changed after bump? | **No** (no dirty CSS/JS vs release baseline this pass) |
| Version bump required? | **No** |
| Anonymous editor JS | Not loaded |
| Editor JS | Only when `websiteAdmin.editingMode` |

### 7. Remaining non-code blockers

`STITCH_REFERENCE_BLOCKED` · `MEDIA_BLOCKED` · `PRODUCT_BLOCKED` · `PRODUCT_ENHANCEMENT` · `INTENTIONALLY_ACCEPTED`

### 8. Deployment recommendation

**`READY_TO_DEPLOY`** for release safety.

Parity remains **`CLOSE`** (not `MATCHED`) because seven Phase 7 mobile artboards are unavailable and media/MCP export limits remain. Those are evidence/media blockers, not confirmed implementation defects.

**Deployment status:** `NOT_DEPLOYED` (do not deploy from this session).
