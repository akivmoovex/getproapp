# PHASE5_004 — Approval Confirmation, Processing, and Success

**Date:** 2026-07-25  
**Batch:** Phase 5 Prompt 4 of 7  
**Stitch:** Approve Church Confirmation · Church Approval Processing · Church Approved (+ Mobile variants)  
**Canonical approval POST:** unchanged

---

## Pre-implementation verification

| # | Fact | Finding |
|---|------|---------|
| 1 | Canonical approval POST | `POST /admin/registration-applications/:id/approve` in `platformAdminRoutes.js` |
| 2 | Required form fields | CSRF (`_csrf`); optional `organization_key` override. **No** administrator password fields |
| 3 | Success 303 destination | `/admin/organizations/:orgKey?notice=organization_provisioned\|network_organization_created#pa-org-invitation` |
| 4 | Invite cookie write | `setInviteOnceCookie` after successful approve (and retry / resend) — cookie `bb_pa_invite_once`, httpOnly, path `/admin`, 5-minute max-age |
| 5 | Invite cookie consume | `consumeInviteOnceCookie` on `GET /admin/organizations/:organizationKey` (clears cookie; org-key must match) |
| 6 | Org detail invitation UI | Existing `#pa-org-invitation` + copy-once input already present |
| 7 | Duplicate evidence | Advisory for match UI; backend may block only via eligibility / `duplicate_email_review` — match banner itself does not block |
| 8 | Already provisioned | `approveAndProvisionRegistrationApplication` returns `alreadyProvisioned: true` and does not reprovision |

---

## Verdict

Phase 5 confirmation + client processing + success presentation wrap the **existing** approve POST and provisioning service. No new approval POST, no new provisioner, no queue/polling/artificial delays, no automated welcome email.

---

## Canonical approval route

- **Confirm GET (new presentation):** `GET /admin/registration-applications/:id/approve`
- **Approve POST (unchanged orchestrator):** `POST /admin/registration-applications/:id/approve`
- **Service:** `approveAndProvisionRegistrationApplication` → `provisionRegisteredBlessBoardChurch`

Hub **Approve and create church** now links to the confirmation GET when approve is available.

---

## Confirmation rendering method

Full page (not a squeezed desktop modal):

`views/blessboard/v5/platform-admin/registration-application-approve-confirm.ejs`

Shows church name, plan, contact, location, proposed first branch (`branchName` or **Headquarters**), advisory duplicate banner when real matches exist, accurate effect list, Confirm + Cancel.

Cancel → review hub `GET …/:id`.

Failure redirects return to **confirmation** (`…/:id/approve?error=…`) with plain-language errors — not a fake success screen.

Already linked / ineligible GET → 303 to organization (`already_provisioned`) or review hub (`not_eligible`).

---

## Processing-state implementation

Client-only on confirmation form submit:

- Disable Confirm button / prevent double submit
- Show processing overlay (Creating church organization / Creating first branch / Preparing administrator invitation)
- Browser waits for real synchronous POST response
- No `setTimeout` completion, no polling, no job queue
- Works without JS (plain form POST)

---

## 303 destination & success presentation

Success still 303s to organization detail with notice + `#pa-org-invitation`.

Phase 5 success panel: `views/blessboard/v5/partials/pa-registration-approved-success.ejs` included on organization detail when notice ∈:

- `organization_provisioned`
- `network_organization_created`
- `already_provisioned`
- `retry_succeeded`

Shows church/org status, plan, first branch, invited admin (when pending invite known), invitation status wording **Administrator invitation prepared**, Copy Invitation (copy-once only), Open church profile, Open onboarding (`#pa-org-onboarding`), Return to registrations.

Stitch “Welcome email sent” / “Resend Welcome Email” adapted away.

---

## Invitation-cookie write/read flow

1. Approve/retry succeeds → `buildAdministratorInviteLink(rawToken)` → `setInviteOnceCookie`
2. 303 to org detail **without** token in query
3. Org GET `consumeInviteOnceCookie` → one-time `inviteOnceLink` local → clear cookie
4. Refresh → link gone; pending invite list may remain; replacement invite uses existing resend action only

---

## Already-approved behavior

- Service idempotent `alreadyProvisioned`
- POST redirects to org `?notice=already_provisioned`
- Confirm GET redirects to org when already linked
- Success panel explains provisioning was not run again; no new invitation generated

---

## Failure behavior

- Application preserved by existing service/transaction rules
- Redirect to confirmation with mapped `?error=` (csrf, not_eligible, provision_failed, …)
- No success panel
- Retry only when existing eligibility / retry flags allow (unchanged)

---

## Files changed

| File | Change |
|------|--------|
| `src/platform/http/platformAdminRoutes.js` | GET confirm; failure redirect to confirm path |
| `views/.../registration-application-approve-confirm.ejs` | **New** confirmation + processing |
| `views/.../partials/pa-registration-approved-success.ejs` | **New** success panel |
| `views/.../organization-detail.ejs` | Include success panel |
| `views/.../registration-application-detail.ejs` | Approve decision → confirm GET |
| `public/.../platform-admin.css` | Confirm / processing / success styles |
| `views/.../platform-admin-shell-start.ejs` | CSS `?v=53` |
| `tests/blessboard-registration-approval-flow-ui.test.js` | **New** Phase 5 UI tests |
| Related invitation / hub tests | Path/copy updates |
| `docs/phase5/PHASE5_004_APPROVAL_FLOW_IMPLEMENTATION.md` | This document |

**Not changed:** provisioning service internals, migrations, approve POST body contract (still CSRF + optional org key), invitation cookie semantics.

---

## Tests and results

```bash
node --test tests/blessboard-registration-approval-flow-ui.test.js
# 10 pass / 0 fail

node --test \
  tests/blessboard-registration-approval-flow-ui.test.js \
  tests/blessboard-registration-detail-overview.test.js \
  tests/blessboard-registration-approval-checklist-ui.test.js \
  tests/blessboard-registration-recommendation-ui.test.js
# 55 pass / 0 fail

node --test \
  tests/blessboard-registration-approval-invitation.test.js \
  tests/blessboard-registration-approval-provision-form.test.js \
  tests/blessboard-registration-operator-approval.test.js
# (DB-backed) 19 pass after invitation source-path updates; 0 fail when DB available
```

Coverage includes confirmation data/POST/cancel/dup/advisory/no-email/processing/mobile CSS, success panel + copy-once + refresh, already-provisioned messaging, existing approve/provision suites.

---

## Stitch wording adapted

| Stitch | Implementation |
|--------|----------------|
| Welcome email / credentials via email | Administrator invitation prepared; copy once; no automated email claim |
| Preparing welcome email (processing) | Preparing administrator invitation |
| Resend Welcome Email | Omitted from Phase 5 panel (existing “Create replacement invitation” remains in invitation section) |
| Background / multi-node theatrics | Omitted; honest “wait for server response” |
| Separate success URL | Same org-detail 303 destination + Phase 5 panel |

---

## Remaining gaps

- Request-information and reject Phase 5 confirmation screens (later prompts)
- Visual pixel polish vs Stitch screenshots (layout is functional Phase 5, not a full org-detail redesign)
- Secondary “Approve and provision” form still posts directly (power path); hub uses confirmation
