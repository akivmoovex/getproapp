# ActiveClinic V7 — Phase 13 domain integrity

Patients, scheduling, pharmacy, and finance data-safety audit of Phase 4/5 implementations. **Appearance was out of scope.**

No push. No deploy. Production untouched. **No migrations.**

## Verdict

Confirmed weaknesses were fixed in product code (locks/transactions), then covered by domain-rule tests.

| Area | Result |
|---|---|
| Patients | Already sound (tenant identity, unique numbers, print-card scope, contact normalization) |
| Appointments | Impossible transitions blocked; `requested` is not an internal appointment status |
| Pharmacy | Stock still append-only; substitution and PO receive now consistent |
| Billing | Invoice remaining is the single AR source of truth; refunds no longer double-count |
| Concurrency | Document numbers, charges, payments, and public booking status updates locked |
| Audit | Sensitive mutations remain attributable (staff id + event type) |

## Issues by severity

### P1 — REAL_PRODUCT_BUG (fixed)

| Issue | Evidence | Fix |
|---|---|---|
| Credit note could exceed remaining invoice balance | `createCreditNote` used `FOR SHARE` and did not compare amount to paid + posted credits | Lock invoice `FOR UPDATE`; reject `credit_exceeds_balance` |
| Revenue `netCollectionsMinor` counted refund payment rows then subtracted refunds | Refunds insert a second **positive** payment (`refund_payment_id`) | Exclude refund payment ids from collections SUM |
| Payment allocation could exceed remaining invoice balance | `recordPayment` checked allocation vs payment amount only | Lock invoice; reject `insufficient_balance` |
| Purchase orders never received | Schema had `quantity_received` / `partially_received`; only `submitPurchaseOrder` existed; walk-in `receiveStock` did not update the PO | `receivePurchaseOrder` + movements + status; POST `/receive` |
| Expired batches could be received as `available` | `receiveStock` accepted past `expiryDate`; dispense later rejected | Reject `expired_batch` on receive (walk-in and PO) |

### P2 (fixed)

| Issue | Fix |
|---|---|
| Substitution could overwrite an already substituted/dispensed/cancelled item | Reject `invalid_transition` |
| Credit/arrangement document numbers raced on `SELECT max + 1` | `pg_advisory_xact_lock` (unique constraint already prevented silent dupes) |
| Invoice/payment/receipt numbers used unlocked `COUNT(*)+1` | Same advisory lock |
| Concurrent invoice create could grab the same pending charges | `SELECT … FOR UPDATE` on pending charges |
| Public booking cancel/reschedule last-write-win | `UPDATE … WHERE status IN (…) RETURNING` |
| Cashier double-submit had no server idempotency key | Hidden `idempotency_key`; duplicate returns existing receipt |

### Verified OK (no product change)

| Check | Evidence |
|---|---|
| Patient numbers unique / immutable / concurrent-safe | `generateActiveClinicPatientNumber` + HCO sequence; `tests/activeclinic-patient-foundation.test.js` |
| Print-card tenant scope | Loader wraps profile (404 if not visible); `tests/activeclinic-phase4-patient-print-card.test.js` |
| Contact normalization | Patient service + foundation phone tests |
| Appointment transitions scheduled → checked-in / cancelled / rescheduled | Map in `appendAppointmentStatusEvent`; optimistic `version` |
| Stock never silently overwritten | Trigger `stock_movements_update_quantity` is the only quantity writer; adjust/transfer insert movements under `FOR UPDATE` |
| Adjustments logged / transfers balanced | Ops service + existing Phase 4 pharmacy tests |
| AR balance derived | `total - allocations - posted credits` — not a stored second ledger |
| Refunds cannot exceed original payment | `REFUND_EXCEEDS_PAYMENT` + payment `FOR UPDATE` |
| Arrangement / override review | `UPDATE … WHERE status = 'pending' RETURNING` |

## Appointments: `requested`

Internal `appointments.status` allows `scheduled`, `confirmed`, `checked_in`, `in_progress`, `completed`, `cancelled`, `no_show`, `rescheduled` — **not** `requested`.

Public “request” is `public_booking_requests.status = submitted_pending_confirmation`. That table is not an appointment. Transition `toStatus: requested` on an internal appointment is `invalid_status_transition`.

## Audit events (attributable)

| Mutation | Event |
|---|---|
| Credit note | `activeclinic.billing.credit_note_created` |
| Payment | `activeclinic.billing.payment_recorded` |
| Refund | `activeclinic.billing.payment_refund` |
| Stock adjust | `activeclinic.stock_adjusted` |
| PO receive | `activeclinic.purchase_order_received` |
| Substitution | `activeclinic.prescription_item_substituted` |
| Appointment status | `activeclinic.appointment.status_change` |

`recordAuditEventSafe` still runs after COMMIT on several paths (best-effort; mutation is not rolled back if audit insert fails).

## Tests

`tests/activeclinic-phase13-domain.test.js` — **6 pass / 0 fail**.

Also re-run: Phase 4 billing ops, Phase 4 pharmacy ops, appointment foundation, pharmacy foundation (expired-dispense fixture updated), public booking, patient portal — all pass.

## Remaining risk

- Staff **confirm public booking → internal appointment** is still a product gap (`/app/booking-requests` links patients; it does not create `appointments` rows). Not silent corruption.
- Walk-in `receiveStock` remains valid for non-PO deliveries; it does not attach to a PO.
- Refunds still write a positive payment row plus a `refunds` row. Reports now exclude the refund payment; other ad-hoc `SUM(payments)` queries could still overstate collections.
- Credit/allocation caps are application-enforced (row lock), not a CHECK constraint.
- Client `data-ac-loading` is not a lock; cashier now has a per-form idempotency key. Other finance POSTs still rely on row locks / pending predicates.
- No service-worker / browser offline mutation queue.

## Files

- `src/activeclinic/services/activeClinicBillingOpsService.js`
- `src/activeclinic/services/activeClinicBillingService.js`
- `src/activeclinic/services/activeClinicPharmacyOpsService.js`
- `src/activeclinic/services/activeClinicPharmacyService.js`
- `src/activeclinic/services/activeClinicAppointmentService.js`
- `src/activeclinic/services/activeClinicPublicBookingLookupService.js`
- `src/activeclinic/services/activeClinicPatientPortalBookingService.js`
- `src/activeclinic/http/activeClinicCashierRoutes.js`
- `src/activeclinic/http/activeClinicPharmacyRoutes.js`
- `views/activeclinic/app/cashier-payment-content.ejs`
- `views/activeclinic/app/pharmacy-purchase-order-detail-content.ejs`
- `tests/activeclinic-phase13-domain.test.js`
- `tests/activeclinic-pharmacy-foundation.test.js`

## Next

**PHASE 14 — RBAC matrix revalidation.**
