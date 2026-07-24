# PHASE2_072 — Prompt 8 Acceptance Audit (061–071)

**Date:** 2026-07-24  
**Mode:** Quick acceptance audit (documentation; fix only clear in-scope defects)  
**Scope:** Communication + rejection implementation from Prompts **061–071**  
**Surfaces:** BlessBoard V5 Platform Admin registration application detail (`#reg-communications`, `#reg-rejection`)  
**Evidence base:** Code/routes/views/CSS spot-checks; Phase2 docs `005`/`006`/`008`/`061`; automated test run below  

---

## Final verdict

# **PASS_WITH_GAPS**

Prompt 8 communication and rejection work meets the honesty and architecture bar: append-only communications ledger, information-request + Communication Log, Rejection Workspace (form + completed state), controlled reopen, CSRF + platform_admin, honest `sending_unavailable`, approval path visually and functionally separate, no V4 changes. Remaining gaps are **documented and intentional** (real ESP, server-side reject confirmation, dedicated reopen PG suite, Stitch browser visual sign-off). **No FAIL criteria** for dishonest delivery claims, CSRF bypass, authorization holes, silent approval changes, or V4 modification.

**Clear defects fixed in this prompt:** none (none found in scope).

---

## Verification checklist (061–071)

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | Information-request route | **PASS** | `POST /admin/registration-applications/:id/request-information` — apex + platform_admin + CSRF; records communication; does not change `application_status` |
| 2 | Request form | **PASS** | `#reg-communications` compose: recipient, subject, applicant message, internal note, category, fields/docs, due date, channel; CSRF hidden field |
| 3 | Communication history | **PASS** | Loader `communications = { items, summary, unavailable }`; card list with type/channel/direction/delivery; empty + unavailable states |
| 4 | Internal / applicant message separation | **PASS** | Distinct form blocks + history card blocks (`applicant` vs `internal`); rejection form mirrors the same split |
| 5 | Honest sending-unavailable | **PASS** | Adapter stub → `sending_unavailable`; UI never labels **Sent** unless status is `sent`; notices refuse delivery confirmation |
| 6 | Follow-up `awaiting_customer` | **PASS** | Info-request route sets `followUpStatus: "awaiting_customer"` + review event `information_requested` |
| 7 | Rejection categories | **PASS** | Allowlisted `REJECTION_CATEGORIES` (9 values); form `<select>` + service/route validation |
| 8 | Internal rejection note | **PASS** | `internal_decision_note` → `rejection_reason` (max 500); labeled admin-only in UI |
| 9 | Applicant explanation | **PASS** | `applicant_explanation` → optional `rejection_notice` communication; required when notify selected |
| 10 | Reapplication allowed | **PASS** | Checkbox → `reapplication_allowed` metadata; shown in completed state |
| 11 | Notification status | **PASS** | `rejection_notification_status` (`recorded` / `sending_unavailable` / …); completed-state label honesty |
| 12 | Completed rejection state | **PASS** | Rejected by/date, category, reapplication, notification, applicant explanation, internal notes |
| 13 | Reopen flow | **PASS** | `POST …/reopen`; reason required; rejected → `submitted`; preserves reason/metadata/comms; review event `reopen`; no email; `?notice=application_reopened` |
| 14 | CSRF | **PASS** | Info-request, reject, reopen all `validateCsrf`; forms embed `_csrf`; route tests cover missing token |
| 15 | Platform Admin authorization | **PASS** | `requireApex` + `requirePlatformAdmin` on all three POSTs; unauth/non-admin covered in route tests + risk-review |
| 16 | Desktop / mobile layout | **PASS** | Dedicated CSS for communications + rejection; `@media (max-width: 720px)` stacks fields; destructive reject action isolated; reopen full-width on small screens (`platform-admin.css?v=50`) |
| 17 | Existing approval unchanged | **PASS** | Approve remains in `#reg-actions` only; reject moved to `#reg-rejection`; `approveAndProvisionRegistrationApplication` not rewritten for Prompt 8; risk-review approve path still green |
| 18 | No V4 changes | **PASS** | Working tree changes confined to V5 PA / BlessBoard / Phase2 docs / migration `039`; `src/routes/blessboardAdmin.js` and `server.legacy.js` clean |

---

## Prompt map (061–071)

| Prompt | Deliverable | Status |
|--------|-------------|--------|
| 061 | Gap audit | COMPLETE (doc) |
| 062 | Migration `039` + communications repo + rejection metadata columns | COMPLETE |
| 063 | Communication service (+ later `recordRejectionNotice`) | COMPLETE |
| 064 | Info-request POST | COMPLETE |
| 065 | Request-info form UI | COMPLETE |
| 066 | Detail communications loader | COMPLETE |
| 067 | Communication log history UI | COMPLETE |
| 068 | Rejection service upgrade | COMPLETE |
| 069 | Reject route upgrade | COMPLETE |
| 070 | Rejection Workspace UI + completed state | COMPLETE |
| 071 | Controlled reopen | COMPLETE |

---

## Completed capabilities

- Append-only `registration_application_communications` ledger + rejection metadata columns
- Request additional information (form + POST) with applicant/internal separation
- Follow-up set to `awaiting_customer` on information request
- Communication Log summary + cards (honest delivery labels)
- Rejection Workspace: category, internal notes, applicant explanation, reapplication, notify, confirmation checkbox, **Reject and record decision**
- Completed rejected panel with history-facing fields + controlled **Reopen application** form
- Reopen: status → `submitted`, history preserved, no automatic email
- Allowlisted flash notices (`information_requested`, `application_rejected`, `application_reopened`, …)
- CSRF + apex platform_admin on Prompt 8 mutations
- Approve/provision kept in separate Review actions panel

---

## Remaining gaps (intentional / out of scope)

| Gap | Severity | Notes |
|-----|----------|-------|
| Real outbound ESP | **Intentional** | Safe stub; `sending_unavailable` when notify attempted |
| Server-enforced `confirm_reject` | **Low** | HTML `required` only; route keeps legacy `rejection_reason` POST compat for risk-review |
| Dedicated reopen PostgreSQL integration suite | **Low** | Unit tests assert preserve-history; reject has PG coverage; reopen PG optional follow-on |
| Applicant inbound reply capture | **Out of scope** | Ledger type exists; no applicant portal write path |
| Document storage / uploads | **Out of scope** | Prompt 8 does not add document productization |
| Stitch browser visual sign-off | **Manual** | CSS responsive rules present; desktop/mobile Stitch pixel parity not automated here |
| Rich-text rejection templates | **Out of scope** | Plain textareas only |

---

## Test counts

**Acceptance run (2026-07-24, local Node + foundation Postgres for PG + risk-review):**

| Suite group | Files | Result |
|-------------|-------|--------|
| Communications storage / service / loader | 3 | included |
| Information-request route + form | 2 | included |
| Communications history UI | 1 | included |
| Rejection service (unit + PG) | 2 | included |
| Reject route | 1 | included |
| Rejection workspace UI | 1 | included |
| Reopen service + route | 2 | included |
| Risk-review regression (auth/CSRF/approve path) | 1 | included |

```
# tests 110
# suites 19
# pass 110
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

**Command (reproducible):**

```bash
node --test \
  tests/blessboard-registration-application-communication-service.test.js \
  tests/blessboard-registration-application-communications-storage.test.js \
  tests/blessboard-registration-detail-communications-load.test.js \
  tests/blessboard-registration-information-request-route.test.js \
  tests/blessboard-registration-information-request-form.test.js \
  tests/blessboard-registration-communications-history-ui.test.js \
  tests/blessboard-registration-rejection-service.test.js \
  tests/blessboard-registration-rejection-service-pg.test.js \
  tests/blessboard-registration-reject-route.test.js \
  tests/blessboard-registration-rejection-workspace-ui.test.js \
  tests/blessboard-registration-reopen-service.test.js \
  tests/blessboard-registration-reopen-route.test.js \
  tests/blessboard-registration-risk-review.test.js
```

---

## Manual E2E cases

Run on apex with an active platform_admin session against a non-provisioned application.

1. **Information request** — Open detail → Communication → submit request with applicant + internal text → expect `?notice=information_requested#reg-communications`, follow-up `awaiting_customer`, new log card; delivery not claimed as Sent.
2. **Communication log** — Confirm summary counts update; applicant vs internal blocks distinct; unavailable/empty states if forced.
3. **Reject (eligible)** — Rejection workspace → category + internal note + optional applicant explanation / reapplication / notify → confirm checkbox → **Reject and record decision** → `?notice=application_rejected#reg-rejection`; Approve panel still separate / not shown as eligible.
4. **Completed rejection** — Reload rejected app → completed panel fields populated; notification honest if notify was checked without ESP.
5. **Reopen** — Completed panel → reason → **Reopen application** → `?notice=application_reopened`; status `submitted`; prior rejection reason/metadata/comms still present; reject form available again.
6. **CSRF / auth** — Submit reject/reopen/info-request without token → error flash; non-admin session denied.
7. **Mobile** — ≤720px: communication + rejection fields stack; reject danger button isolated; reopen button full width.
8. **Approval regression** — Eligible Foundation/Growth app: Approve and provision still works from `#reg-actions` after Prompt 8 UI (no reject controls mixed into approve form).
9. **Stitch spot-check (optional)** — Compare `#reg-communications` / `#reg-rejection` desktop + mobile to Stitch 16/17; note visual deltas only.

---

## Architecture / safety confirmation

| Guardrail | Result |
|-----------|--------|
| Express + EJS + `platform-admin.css` (no React/Tailwind for PA) | **PASS** |
| Forms do not submit administrator ID or application status | **PASS** |
| Delivery/status never trusted from client body | **PASS** |
| Rejection history not deleted on reopen | **PASS** |
| No automatic email on reopen | **PASS** |
| V4 / `blessboardAdmin.js` / `server.legacy.js` untouched | **PASS** |

---

## Printed summary

### Verdict

**PASS_WITH_GAPS**

### Completed capabilities

- Info-request route + form + `awaiting_customer`
- Communication history with honest delivery
- Rejection categories / internal note / applicant explanation / reapplication / notification status
- Completed rejection state + controlled reopen
- CSRF + platform_admin; approval unchanged; no V4

### Remaining gaps

- Real ESP; HTML-only reject confirm; no dedicated reopen PG suite; no applicant reply portal; Stitch visual E2E manual

### Tests

**110 pass / 0 fail / 0 skip** (Prompt 8 suites + reject PG + risk-review regression)

### Manual E2E

Nine cases above (info-request → log → reject → completed → reopen → CSRF/auth → mobile → approve regression → optional Stitch)
