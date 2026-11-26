# V2132 G266 independent QA audit

**FINAL=V2132_G266_INDEPENDENT_QA**  
Tip versions remain BlessBoard/ActiveClinic **2.13.4** (prompt 2.13.2 not downgraded).  
Start SHA: `8ca60bd2cbff796ac78579002e570e484dd92f57` (origin/V13 after G260).

## G261 — Evidence read

Reviewed `V2132_G260_FINAL_QA_HANDOFF.md`, `V2132_G242_SOURCE_COVERAGE_MATRIX.json`, `V2132_G243_BUG_RECONCILIATION.md`, `V2132_G258_COVERAGE_MATRIX.json`, and the live G224/G229 Playwright + HTTP runners. Report titles alone were not accepted as PASS.

## G262 — November 25 clinical reproduction (source + executed tests)

| Flow | Independent finding | Evidence class |
| --- | --- | --- |
| Laboratory result entry | Journey present; same-actor verify denied; second tech verifies; clinician read-back | Browser + HTTP + PG |
| Laboratory analysis / processing filter | Received stays out of processing until result; result from `received` allowed by contract | Unit + HTTP + browser |
| Diagnostic counters | Dashboard `data-ac-lab-count` / `data-ac-rad-count` asserted with queue request numbers | HTTP + browser |
| Radiology filters / counters | Reported excluded from open; reported/verified counters covered | Unit + HTTP + browser |
| Clinical printing | **Defect found**: result components persisted but omitted from detail/print (fixed this cycle) | Was weak; now HTTP + browser + unit |
| Vitals correction | AC-REC-03 records HR, corrects, stranger denied | Browser |
| Patient portal | Activation / wrong-clinic denial / staff-created activation | Browser + HTTP |
| Website publication | Draft private until publish; theme/section isolation | Browser |

November 25 DOCX reports remain unavailable locally; hosted V2.13.1 failures are not claimed fixed on hosted without separate retest.

## G263 — Browser assertion audit

| Test | Meaningful UI | Role | Record identity | Reload/persist |
| --- | --- | --- | --- | --- |
| G224 lab | Collect → receive → enter result → verify | Reception denied; lab tech enter/verify split | Patient id + request number + PG | PG + clinician read-back |
| G229 radiology | Order → report → verify | Reception denied; rad staff split | Patient id + request number + PG | PG + clinician read-back |
| Print (pre-fix) | Button visible only | — | — | Insufficient |
| Print (post-fix) | Print region content + `window.print` stub | Same authorized actor | Request + summary/findings + FBC components | PG component rows |
| Website / portal / vitals | Form mutations + publish | Staff/patient roles | Clinic isolation | Public/private read-back |

## G264 — Non-browser audit

Tenant/facility denial, invalid component JSON, wrong-patient attach, same-actor verify 403, stale/invalid status paths, and D25 overlap concurrency remain covered. D25 slot capacity remains UNAPPROVED expected fail. No unauthorized mutation accepted as PASS.

## G265 — OTP and Community Benefits

| Gate | Status |
| --- | --- |
| Login before OTP completion | Rejected — `verifyChallenge` does not complete session; `completeProtectedAction` owns completion |
| Fake production OTP | Production activation stays blocked; providers keep `deliveryActivated=false` |
| Unauthorized Resend delivery | Key unset / domain NOT_OBSERVED; QA allowlist fail-closed; no live send |
| Cross-clinic QR/referral fraud | Covered by Community hardening unit + disposable PG |
| Unauthorized settlement / financial model | `posting_disabled`; agreement activation unapproved |
| Absent schema honesty | Migration 048 not applied to shared/prod; disposable OTP/Community tables only where previously authorized |

## G266 — Actionable defect

**G266-01 (P1, fixed):** Laboratory result components were written to `laboratory_result_components` but not loaded or rendered on the request detail / print-ready region, so FBC component values could not be verified in the UI or print view.

Repair: load components in `loadActiveClinicLaboratoryRequestDetailScreen`, render them under `data-ac-print-region="laboratory-result"`, strengthen HTTP + Playwright + unit coverage.

## Dual suite outcomes (this cycle)

| Suite | Run 1 | Run 2 |
| --- | --- | --- |
| Safe contract+unit+quality | 561/0/0 | 561/0/0 |
| HTTP g79 | 41/40/1 (D25 slot) | 41/40/1 |
| AC Playwright | 32 | 32 |
| BB Playwright | 23 | 23 |
| Community mock browser | 9 | 9 |
| Disposable OTP/Community PG | 3 pass | 3 pass |

## Verdict

`QA_GO_NO_GO=NO-GO` — live Resend mailbox OTP, D25 slot policy, hosted retest, and Community financial posting remain closed. Local clinical/OTP/Community disposable evidence remains strong after the print/component fix.

## Next action

Operator Resend verification + sending-only QA key/allowlist; separate hosted QA deploy authorization for current `origin/V13` tip; do not claim live mailbox OTP or financial posting.
