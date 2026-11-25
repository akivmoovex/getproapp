# G216 acceptance matrix

Source is `e63fc672132062080bfbeea81c46e790a4307808`. The v1.2 PDF is not in the workspace. The planned figure of 190 was not executed. Classes describe the evidence from this cycle. A blocked persistence row is not counted as a pass.

| Requirement | Class | Evidence |
| --- | --- | --- |
| Community membership | IMPLEMENTED_AND_EXECUTED | One membership per person and program. Enrollment, suspension, and revocation run in `g195`. The pass page shows the stored status. |
| Consent and verification | IMPLEMENTED_AND_EXECUTED | Enrollment stays `pending_consent`. Activation requires notice consent and a method other than `qr_scan`. The Zambia notice text is not approved. |
| QR generation | IMPLEMENTED_AND_EXECUTED | 32-byte token, stored hash, separate fallback code. Issue is covered in `g195` and the mock browser. |
| QR verification | IMPLEMENTED_AND_EXECUTED | `presentPass` checks hash, expiry, and revocation. A presentation writes no introduction and no ledger row. |
| QR revocation | IMPLEMENTED_AND_EXECUTED | Rotate revokes the previous pass. Revoked and expired codes fail in unit tests and in the browser. |
| Reception Community Check-in | IMPLEMENTED_AND_EXECUTED | Real route. Reception or clinic admin only. Flag off returns 404. Browser coverage is mock-backed. |
| Manual lookup | PARTIAL | Fallback code and an explicit local patient id are executed. There is no name or phone search-results screen. |
| Clinic patient linking | IMPLEMENTED_AND_EXECUTED | Confirmation, role, clinic, and facility are required. Phone-only and concurrent duplicates do not create a second link. |
| Clinic A walk-in exclusion | IMPLEMENTED_AND_EXECUTED | Walk-in and staff registration do not create referral eligibility at A. Covered in `g195`, `g211`, and the browser. |
| Clinic B/C introduction | IMPLEMENTED_AND_EXECUTED | A later introduction qualifies B or C and leaves A's walk-in attribution unchanged. |
| Repeat visit eligibility | IMPLEMENTED_AND_EXECUTED | An introduced visit stays `introduced_repeat` while membership, acquisition, agreement, and service stay valid. |
| Agreement models A/B/C | IMPLEMENTED_AND_EXECUTED | Integer ngwee calculations passed. Every drafted agreement stays `INACTIVE` and `unapproved`. Activation is blocked by policy. |
| Invoice benefit preview | IMPLEMENTED_AND_EXECUTED | Ineligible and unapproved quotes disclose no discount. An eligible synthetic Model A quote discloses 10000 ngwee. Nothing is posted. |
| Financial idempotency | IMPLEMENTED_AND_EXECUTED | Two parallel plans with one key leave one plan. `commitLedger` returns `posting_disabled`. |
| Settlement architecture | PARTIAL | Contribution plans, proration, and refund negation exist. No settlement batch, dispute case, or funding transfer runs. |
| Patient disclosures | IMPLEMENTED_AND_EXECUTED | The patient sees the actual saving or the sentence that no discount is applied. Platform margin is not shown. |
| Security and privacy | IMPLEMENTED_AND_EXECUTED | Pass actor checks, CSRF, wrong clinic, wrong role, cross-clinic chart denial, and token omission from audits passed. |
| Browser usability | IMPLEMENTED_MOCK_TESTED | Eight browser tests passed twice on the isolated memory-backed server, including 390, 768, and 1440 widths. |
| PostgreSQL persistence | BLOCKED_BY_SCHEMA | Reviewed SQL is unapplied. The authorized disposable check refuses to create `activeclinic.community_memberships`. |

Domain and route results above are not PostgreSQL end-to-end results. `PERSISTENCE_PASS` for the new tables is 0.
