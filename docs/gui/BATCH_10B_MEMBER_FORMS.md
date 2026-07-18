# Batch 10B — Member Forms & Documents

**Date:** 2026-07-18
**Scope:** Member `/member/forms` list, detail, and submission views only. **Requests not started.**
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 32), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_10A_MEMBER_RESOURCES.md`](./BATCH_10A_MEMBER_RESOURCES.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop Forms & Documents | `20-member-forms-documents-desktop` | `745a1972c0ba4ec893f64cc3457c0c95` |
| Mobile Forms & Documents | `20-member-forms-documents-mobile` | `0f801e19ed3d4332bee877001bdc1a13` |

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/forms-requests/member-forms.ejs` | Stitch chrome, filters, search, cards, history, empty states |
| `views/blessboard/v5/forms-requests/member-form-detail.ejs` | Stitch marker + field-count chip (fields/CSRF unchanged) |
| `views/blessboard/v5/forms-requests/member-submission.ejs` | Real status/date chips only |
| `src/blessboard/http/formsRequestsMemberRoutes.js` | Present forms/submissions; filter/search |
| `public/blessboard/v5/member-portal.css` | Forms grid / toolbar (`?v=16`) |
| `views/blessboard/v5/partials/member-shell-start.ejs` | CSS cache bump only |
| `tests/blessboard-forms-requests.test.js` | Visibility, filter/search, CSRF, privacy, anti-fabrication |
| `tests/blessboard-v5-a11y-structure.test.js` | Forms structure assertions |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 32 note (Batch 10B) |
| `docs/gui/BATCH_10B_MEMBER_FORMS.md` | This document |

**Unchanged:** `listForms` / `getForm` / `submitForm` / `listFormSubmissions` / `getFormSubmission`, allowlisted field types, CSRF on POST, answer validation, ownership privacy.

## 3. Form states (real V5 only)

| UI state | Source | Label |
|----------|--------|-------|
| Available online form | Published form via `listForms(forMember: true)` | Online form |
| Field count | Allowlisted `schema.fields` length | `N fields` when &gt; 0 |
| Submitted | `form_submissions.status = 'submitted'` | Submitted |
| Closed | `form_submissions.status = 'archived'` | Closed |
| Submitted date | `submitted_at` | Formatted when present |

No pending / Approved / Processing labels — those are not in the form_submissions schema.

## 4. Filters / search

| Filter | Behavior |
|--------|----------|
| `all` | Available forms + submission history |
| `available` | Forms section only |
| `history` | Submission history only |
| `q` | Substring on form title/description and submission form title/status label |

## 5. Preserved behavior

| Action | Route | Notes |
|--------|-------|-------|
| List | `GET /member/forms` | Published branch-scoped forms + own submissions |
| Open form | `GET /member/forms/:id` | Allowlisted field types only |
| Submit | `POST /member/forms/:id/submit` | CSRF + schema validation; 303 to submission |
| View submission | `GET /member/forms/submissions/:id` | Owner only |

## 6. Unsupported Stitch elements omitted

- Category pills (Membership / Ministry / Events / Financial) — no category column
- Download PDF / printable PDF actions — forms have no media attachment
- Contact Admin / custom form-builder CTA
- Signatures, payments, file-upload fields
- Fabricated Approved / Processing history statuses

## 7. Empty states

| State | Marker |
|-------|--------|
| No forms and no submissions | `data-bb-forms-empty="catalog"` |
| No published forms | `data-bb-forms-empty="available"` |
| Filter/search yields no forms | `data-bb-forms-empty="no-results"` |
| No submissions yet | `data-bb-forms-empty="history"` |
| History filter/search miss | `data-bb-forms-empty="history-no-results"` |

## 8. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:forms-requests` | **10/10 pass** (visibility, validation, CSRF, ownership, filters) |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:blessboard:a11y-structure` | **39/39 pass** |
| `npx stylelint public/blessboard/v5/member-portal.css` | **0 errors** (hex token warnings only) |
| `git diff --check` | **clean** |

## 9. Suggested commit message

```
Polish member forms library with real submission history and search.
```
