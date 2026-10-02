# V8 Shared Submission Management (PROMPT 05)

**Verdict:** `V8_SHARED_SUBMISSION_MANAGEMENT_PASS`  
**Branch:** `V8` only  
**Date:** 2026-09-21  
**Prerequisite:** Prompt 04 `V8_PUBLIC_FORMS_CODE_PASS` (`05d4eea7`)  
**Prior ancestry:** `d76b2975` submission review service + migration `040`  
**Stitch:** SH11–SH14 desktop + mobile  
**Hosts:** Code + local tests only (no deploy / no migration apply)

## Approach

Did **not** rebuild submission management. Tip already provided list/detail/review transitions, restricted internal notes, platform-admin overview, and tenant isolation. This prompt closed baseline **PARTIAL** SH13 polish and added search, status-change confirmation, Stitch D/M markers, and clearer audit UI.

Generic form review is **not** wired through membership approval.

## Flow

Administrator → Submission list (SH11) → Open record (SH12) → Review / status change (SH13) → Audit history. Platform admin → cross-tenant overview (SH14).

## Requirements checklist

| Requirement | Status |
|-------------|--------|
| Tenant-scoped list + search | **Search added** (`q` on email/answers) + status filter |
| Submission details | Present |
| Workflow-specific statuses | Present (`submitted → in_review → accepted\|rejected → closed`) |
| Authorized internal notes | Present (manage-only; view-only redacted) |
| Review + status-change confirmation | **Added** (`confirm_status_change` when status changes) |
| Reviewer + timestamp audit history | Present (`status_history_json` + reviewed_at/by) |
| Platform-admin cross-tenant only | Present (`listPlatformFormsOverview` + SH14) |
| No cross-tenant selector for tenants | Present / documented in SH14 copy |
| Field-level privacy | Notes restricted; answers for authorized tenant staff only |
| Responsive Stitch D/M | Markers + existing desktop table / mobile cards |
| Not membership approval | Explicit copy + no membership workflow hooks |

## Changes in this prompt

| Area | Change |
|------|--------|
| Repository / service | `searchQuery` on `listSubmissions` / `listFormSubmissions` |
| Routes | Pass `q`; require confirm checkbox on status change |
| Views | SH11–SH14 stitch D/M; search UI; confirm + audit markers |
| Tests | Search + template/audit assertions |

## Tests

- `tests/v8-shared-forms-e2e.test.js` + `tests/v8-shared-form-builder.test.js` — **19/19 PASS**

## Non-goals

- Applying migration `040` on hosted DB  
- Hosted verification (not claimed)  
- Membership approval pipelines
