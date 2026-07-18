# Batch 18D — HQ Forms & Resources oversight

**Date:** 2026-07-18  
**Scope:** HQ Admin `/hq/forms` (+ `/hq/forms/b/:branchKey`) and `/hq/resources` (+ `/hq/resources/b/:branchKey`) **oversight presentation only**. **Requests follow in Batch 18E.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_15C_BRANCH_FORMS.md`](./BATCH_15C_BRANCH_FORMS.md), [`BATCH_18C_HQ_GIVING_REPORTS.md`](./BATCH_18C_HQ_GIVING_REPORTS.md)

## 1. Canonical Stitch screen IDs

No dedicated HQ forms/resources Stitch pairs. Canonical pairs reused from member portal chrome (same IDs as member list screens):

### Forms

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop | `20-member-forms-documents-desktop` | `745a1972c0ba4ec893f64cc3457c0c95` |
| Mobile | `20-member-forms-documents-mobile` | `0f801e19ed3d4332bee877001bdc1a13` |

HQ marker: `data-bb-stitch-forms="20-member-forms-documents"` (+ `data-bb-hq-forms="1"`).  
Branch admin continues to use Shared UI States: `data-bb-stitch-forms="shared-ui-states"` (`b61a1ea8176648408211b681e942e0a6`).

### Resources

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop | `19-member-resources-study-desktop` | `d1690ab7193d43e38ba9ba97c29d914c` |
| Mobile | `19-member-resources-study-mobile` | `d3232a4f5e0f4d2da610740ca3a8f6b1` |

Marker: `data-bb-stitch-resources="19-member-resources-study"` (+ `data-bb-hq-resources="1"` on HQ).

Stitch member chrome includes builder / certificates / progress; V5 HQ shows **existing church-scoped form and resource rows only**.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/forms-requests/admin-forms.ejs` | HQ oversight chrome: branch panel, summary cards, search/status filters, empty/no-results, privacy copy, unavailable rows |
| `views/blessboard/v5/forms-requests/admin-resources.ejs` | Same pattern for resources; private-file wording; desktop table + mobile cards |
| `src/blessboard/http/formsRequestsAdminRoutes.js` | Pass `statusFilter` + in-memory `q` for forms/resources lists (existing `listForms` / `listResources`) |
| `public/blessboard/v5/hq-admin.css` | HQ forms/resources branch tables/cards, summary, resources cards (`?v=39`) |
| `public/blessboard/v5/branch-admin.css` | Shared summary + resources card responsive styles (`?v=32`) |
| `views/blessboard/v5/partials/hq-shell-start.ejs` | CSS cache bump |
| `views/blessboard/v5/partials/branch-admin-shell-start.ejs` | CSS cache bump |
| `tests/blessboard-forms-requests.test.js` | Cross-branch visibility, search/filter, privacy, download auth, HQ role gate |
| `tests/blessboard-v5-a11y-structure.test.js` | HQ forms/resources structure + CSS versions |
| `docs/gui/STITCH_SCREEN_MAP.md` | HQ Forms / Resources Batch 18D rows |
| `docs/gui/BATCH_18D_HQ_FORMS_RESOURCES.md` | This document |

**Unchanged:** form detail / submission review routes, resource publish/create services, member download routes, requests admin UI, authz/CSRF, church UUID scoping SQL.

## 3. Oversight actions preserved

| Action | Surface | Notes |
|--------|---------|-------|
| Church-wide list | `/hq/forms`, `/hq/resources` | Existing church-scoped list when `branchId` is null |
| Branch open | `/hq/forms/b/:key`, `/hq/resources/b/:key` | Branch panel table/cards |
| Create draft | POST `basePath` | Central/church-wide create when HQ; branch create when scoped |
| Publish resource | POST `…/:id/publish` | Existing draft → published |
| Review form | Link to `basePath/:id` | Detail holds schema + submissions |
| Filter | `q`, `status` | Status via service; `q` in-memory on loaded rows |
| Status chips | Same query params | All / draft / published / archived |

## 4. Privacy safeguards

- Forms **list** does not render submission answers, emails, or member ids — copy points reviewers to form detail
- Resources list shows **“Private file”** when `mediaAssetId` is set — does not expose asset UUID or public CDN URLs
- Church UUID omitted from HTML (existing pattern)
- Anonymous `/member/resources/:id/file` remains unauthorized; downloads stay on authenticated member file routes
- HQ branch-admin role still blocked from `/hq/forms` and `/hq/resources`

## 5. Omitted / unavailable features

| Kind | Treatment |
|------|-----------|
| Advanced form builder | `data-bb-forms-unavailable-row="builder"` |
| Signatures / payments | `…="signatures"` |
| Conditional logic / automation | `…="logic"` |
| Bulk export / answer dumps on list | `…="export"` |
| Course progress / certificates | `data-bb-resources-unavailable-row="progress"` |
| Category taxonomies | `…="categories"` |
| Public CDN for private files | `…="cdn"` |
| Requests oversight | **Batch 18E** |

## 6. Responsive status

| Viewport | Behavior |
|----------|----------|
| `≥900px` | Branch directory + forms/resources tables; cards hidden |
| `<900px` | Branch cards; forms/resources cards; filter actions stacked |

## 7. Verification

| Command | Result |
|---------|--------|
| `node --test tests/blessboard-forms-requests.test.js` | **10/10 pass** |
| `node --test tests/blessboard-v5-a11y-structure.test.js` | **70/70 pass** |
| `npx stylelint public/blessboard/v5/hq-admin.css public/blessboard/v5/branch-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 8. Suggested commit message

```
feat(gui): HQ forms and resources oversight (Batch 18D)

Match /hq/forms and /hq/resources to Stitch forms/resources chrome with
branch panels, status filters, and privacy-safe lists. No builder,
payments, or Requests changes.
```
