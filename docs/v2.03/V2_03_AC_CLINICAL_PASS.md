# V2.03 AC Clinical Pass — ACN14–ACN16

**Verdict:** `V2_03_AC_CLINICAL_PASS`

**Stitch project:** `projects/12134201997833374170`  
**Branch:** V10  
**Scope:** Practitioner Worklist, Clinical Encounter, Follow-up Worklist

| Screen | Stitch IDs | Route |
|--------|------------|-------|
| ACN14 Practitioner Worklist | `ae083a2bfe324046b4d9a0648c516bbd` / `f792e472b455437eb354e25d336fd869` | `GET /app/clinical` |
| ACN15 Clinical Encounter | `3ea33c0c474342bbbbb307014209bfec` / `ec4486cb5e944705bede9c3100c47e9d` | `GET/POST /app/clinical/encounter/:id` (+ `/complete`) |
| ACN16 Follow-up Worklist | `0c83bbfc71b94c2f958931693345d1db` / `362b305120114a5cac2ac38622a148f8` | `GET /app/clinical/follow-up` |

## Delivered

- **ACN14** — today's patients, waiting, current, upcoming, follow-up, incomplete draft encounters on existing clinical + appointment + queue engines.
- **ACN15** — chief complaint, observations, history, diagnosis, treatment plan, medication (documented text only), follow-up, referral; **Save Draft** + **Complete Encounter**; optimistic versioning + beforeunload draft guard.
- **ACN16** — AC-owned `clinical_follow_up_items` (+ events): due review, missed appointments, pending referrals, incomplete notes, outstanding actions with owner/status/due date.
- **No** AI diagnosis, ICD automation, prescribing engine, CHW, lab integration UI, or pharmacy management on these surfaces.
- **Clinical data remains in `activeclinic.*`** — not moved to platform tables.
- **Platform reuse** — RBAC, audit, status history, filters, responsive shell components.
- **Reception / cashier / finance** — no `encounter.view`; HTTP 403 on clinical routes; negative authorization tests assert no clinical note leakage.

## Tests

- `tests/activeclinic-batch1a-clinical.test.js`
- Stitch markers updated in `tests/activeclinic-clinical-ui-parity.test.js`
- Nav forbidden keys include `clinical_follow_up` for non-clinical roles

## Gaps (non-blocking)

1. Stitch offline/SQLite auto-save chrome is represented by server draft versioning + unload guard, not a local SQLite client.
2. Existing P04 order/prescription routes remain in the codebase for later domains but are not promoted on the ACN15 workspace chrome.
