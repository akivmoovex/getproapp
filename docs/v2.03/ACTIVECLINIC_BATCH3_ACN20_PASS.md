# ActiveClinic V2.03 Batch 3 — ACN20 Collision-Safe Pass

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_BATCH3_ACN20_PASS` |
| **Date** | 2026-09-26 |
| **Branch** | `V10` |
| **Precondition** | ACN17/19 + portal leaves on V10 |
| **Stitch project** | `3741389873539108242` |
| **Verdict** | `V2_03_BATCH3_ACN20_PASS` |
| **Classification** | **B** — additional view of existing ACN16 `pending_referral` data |

---

## Collision analysis (before code)

| Surface | Finding |
|---------|---------|
| **ACN20 Stitch** | Referral CRM: Draft/Sent/Accepted/Completed, New Outbound Referral, destination facilities, HL7 Direct, pre-auth, REF packets, PDF, transmission audit |
| **ACN16** | Facility follow-up worklist; `pending_referral` is one `clinical_follow_up_items.item_type`; statuses `open`…`completed`/`cancelled` |
| **Referral routes** | No staff `/app/clinical/referrals` existed; consultation `referral_text` + follow-up create on encounter complete; public procedure referral is booking-only |
| **RBAC** | Same as follow-up: `activeclinic.encounter.view` (list) + `activeclinic.consultation.record` (status) + dept `clinical` |
| **B2-06** | Encounter workspace untouched |

**Decision:** Prefer **B**. Full Stitch CRM would be **C** and a second workflow → **not built**. ACN16 behavior unchanged (same list/status services; default follow-up view untouched).

**Documented conflict (omitted, not invented):** Draft→Sent→Accepted machine, outbound referral entity, destination directory, HL7, pre-auth, REF numbers, PDF/print packet, transmission timeline.

---

## Ownership (reused)

| Piece | Path |
|-------|------|
| Route | `GET /app/clinical/referrals` |
| Status mutations | Existing `POST /app/clinical/follow-up/:itemId/status` (+ safe `return_to=/app/clinical/referrals`) |
| Loader | `loadActiveClinicReferralWorklistScreen` → `listClinicalFollowUpItems({ itemType: 'pending_referral' })` |
| View | `clinical-referrals-content.ejs` |
| Nav | No new sidebar key; highlights existing Follow-up (`clinical_follow_up`) |

**Cache bump:** `SHELL_ASSET_VERSION` → `v2-03-b3-acn20-01`.

---

## Stitch references

| Code | Desktop | Mobile |
|------|---------|--------|
| ACN20 | `9afe2826b316421e81d56d98364e1fbf` | `43fabf392a204db68bd229e2acc51926` |

---

## Tests

- `tests/activeclinic-batch3-acn20.test.js` — markers, ACN16/B2-06 untouched markers, render, tenant isolation, cashier deny, status return_to
- `tests/activeclinic-batch1a-clinical.test.js` — ACN16 regression
- `tests/activeclinic-batch3-acn17-acn19.test.js` — clinical leaf regression (asset stamp may advance)

---

## Production / deploy

**Not pushed. Not deployed.**
