# G193 requirements matrix

The original v1.2 PDF was unavailable. The rows below are the requirements written in the G193–G210 prompt. They are not a reconstruction of 190 unnamed specification cases.

| ID | Rule | Implementation |
| --- | --- | --- |
| BR-01 | A documented introduction qualifies repeat visits at that clinic | `recordIntroduction` plus `decideEligibility` reason `introduced_repeat` |
| BR-02 | A walk-in or staff registration does not create referral eligibility | `recordWalkIn` is `CLINIC_DIRECT`; staff registration writes no acquisition |
| BR-03 | A later introduction can qualify clinic B and leaves clinic A unchanged | Separate acquisition rows |
| BR-04 | One membership and one pass; eligibility is per clinic | `requestEnrollment` returns the existing row |
| BR-05 | Disclose the actual patient saving | `previewInvoice` disclosure |
| BR-06 | 10% is not an approved commercial meaning | Agreements are created `INACTIVE`; no activation API |
| BR-07 | A QR scan is not introduction, entitlement, or a chart merge | `presentPass` writes no introduction, link, chart, or ledger row |
| LIFETIME | No one-time coupon consumption | Repeat decisions stay `ELIGIBLE` while the inputs remain valid |
| PRIVACY | Clinic B cannot read clinic A's chart | `readChart` returns `cross_clinic_chart` |
| SC-A–SC-G | Attribution scenarios in the prompt | `tests/v13/unit/g195-community-benefits.test.js` |
| MEM | Pending consent, one membership, suspension keeps history | Membership service |
| QR | Opaque token, hash at rest, expiry, rotation, revocation | Pass service |
| RCV | Reception check-in behind the flag | `routes.js` and `pages.js` |
| LINK | Confirmed clinic-scoped link, no phone-only merge | `linkMember` |
| ELIG | `ELIGIBLE`, `MEMBER_ONLY`, `NOT_ELIGIBLE`, `REVIEW_REQUIRED` | `decideEligibility` |
| AGR | Models A, B, and C in integer ngwee | `money.js` |
| INV | Preview only; live posting stays off | `previewInvoice`, `commitLedger` |
| FIN | Idempotent plans and refused commits | `planLedger`, `planRefund`, `commitLedger` |

Rows that need a new PostgreSQL table or an approved active agreement are marked blocked in `G209_COVERAGE_MATRIX.json`.
