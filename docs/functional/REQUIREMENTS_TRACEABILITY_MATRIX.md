# Requirements traceability matrix

G224 maps the named 25 November findings that were present in the request. The two DOCX reports were not available, so the figure of 26 role scenarios is not claimed as executed. Laboratory result entry, filters, counters, radiology completed status, and result printing are now covered by unit, HTTP, and browser tests. Vitals, portal activation, and website text remain previously fixed. OTP, slot capacity, and public booking stay blocked or disabled. See `docs/qa/V2132_G224_NEW_QA_REPORT_RECONCILIATION.md`.

G223 maps the written Community Benefits rules after lookup and settlement preview. The v1.2 PDF was still unavailable, so PDF traceability is not claimed. Manual lookup is executed in unit and mock browser tests. Settlement preparation is a pending preview. Settlement execution and PostgreSQL persistence stay blocked. D14C, D16 platform OTP, and D25 slot capacity still fail. See `docs/qa/community-benefits/G219_REQUIREMENTS_RECONCILIATION.md`.

G218 classifies the Community Benefits acceptance rows in `docs/qa/community-benefits/G216_ACCEPTANCE_MATRIX.md`. Manual lookup and settlement remain partial. PostgreSQL persistence for the new tables is blocked. D14C, D16 platform OTP, and D25 slot capacity still fail.

G215 maps 42 Community Benefits requirements from the source. Fourteen defects from the G210 implementation were fixed. The planned 190 scenarios were not executed. D14C, D16 platform OTP, and D25 slot capacity still fail. See `docs/qa/community-benefits/G215_FINAL_COVERAGE.json`.

G210 maps the Community Benefits rules that were written in the implementation prompt. The v1.2 PDF was not in the workspace, so the planned figure of 190 was not turned into invented cases. The mapped source behavior is in `docs/qa/community-benefits/G209_COVERAGE_MATRIX.json`. Live posting and the new tables remain blocked. D14C, D16 platform OTP, and D25 slot capacity still fail.

G180 kept the original 16 regressions passing in the browser. D14C, D16 platform OTP, and D25 slot capacity still fail. Same-staff overlap passed on two concurrent clients in both HTTP runs. A synthetic catalogue prescription is now dispensed once in HTTP and in the browser, with the quantity, movement, and prescription row read back. A prescription without a catalogue id still creates no pharmacy row. Thirty-two historical QA bugs stay verified and four stay blocked. See `docs/qa/V2132_G176_FINAL_COVERAGE_AUDIT.md`.

G175 kept the original 16 regressions passing in the browser. D14C, D16 platform OTP, and D25 slot capacity still fail. Same-staff overlap passed on two concurrent clients in both HTTP runs. A clinician now saves, isolates, and signs a consultation note in the browser, and a prescription without a catalogue id does not create a pharmacy row. See `docs/qa/V2132_G167_COMPLETE_BUG_MATRIX.md`.

G165 kept the original 16 regressions passing in the browser on the disposable database. D14C, D16 platform OTP, and D25 slot capacity still fail. Same-staff overlap passed on two concurrent clients in both HTTP runs. Patient search, staff duplicate phone search, and member directory search were added to the browser proof. See `docs/qa/V2132_G152_ALL_QA_BUG_COVERAGE.md`.

G138 kept the original 16 regressions passing on the disposable database. The OTP table and D25 slot capacity remain separate blocked gates. Same-staff overlap passed on two concurrent clients. See `docs/qa/V2132_G138_QA_READINESS.md`.

The original 16 regressions are 16 VERIFIED_E2E. BB-AUTH-04 now passes in the browser through the testing delivery read, and the page does not show the code. None of those 16 are blocked. The OTP table and the slot-capacity test are separate blocked gates. See `docs/qa/V13_G119_ACCEPTANCE_MATRIX.md`.

Sources in the repository: G27 register, G35 matrix, current routes, database-free tests, and the G88 isolated runs. The healthcare brief and both office QA files are `SOURCE_UNAVAILABLE`. Their wording was not invented. Implementation counts are unchanged.

`IMPLEMENTED` below means `IMPLEMENTED_UNVERIFIED` unless [FEATURE_STATUS_AND_GAPS.md](FEATURE_STATUS_AND_GAPS.md) records a later class. G88 classes are only for the journeys named there, on `getpro_v13_e2e_g78d2301`.

## ActiveClinic — 30

| ID | Status | Evidence | Gap |
| --- | --- | --- | --- |
| AC-01 | IMPLEMENTED_UNVERIFIED | Facility and organisation services | HTTP not run |
| AC-02 | IMPLEMENTED_UNVERIFIED | Duplicate warning. Merge stays deferred | No automatic merge |
| AC-03 | IMPLEMENTED_UNVERIFIED | `POST /app/patients` | HTTP not run |
| AC-04 | IMPLEMENTED_UNVERIFIED | Patient service | HTTP not run |
| AC-05 | IMPLEMENTED_UNVERIFIED | Kin and alerts | HTTP not run |
| AC-06 | PARTIAL | Encounters exist | Continuity is basic |
| AC-07 | IMPLEMENTED_UNVERIFIED | `startEncounter`, `closeEncounter` | HTTP not run |
| AC-08 | IMPLEMENTED_UNVERIFIED | `/app/reception` | Browser not run |
| AC-09 | IMPLEMENTED_UNVERIFIED | Triage permission and vitals | No invented threshold |
| AC-10 | IMPLEMENTED_UNVERIFIED | Signed notes cannot be overwritten | Amendments table unused |
| AC-11 | PARTIAL | Free-text diagnosis | No code catalogue |
| AC-12 | PARTIAL | Manual dose, optional unit, optional catalogue id, and an explicit not-queued notice | No picker and no queue handoff without a catalogue id |
| AC-13 | PARTIAL | Orders, queue, results, an approved-rule engine, and a non-persistent preview. G66 browser: preview is not saved | No stored thresholds. Migration 044 is applied only on the G78 disposable database |
| AC-14 | PARTIAL | Dispense, remainder, and one-request duplicate rejection | Handoff is AC-12 |
| AC-15 | IMPLEMENTED_UNVERIFIED | Minor units, reversals | No payment provider |
| AC-16 | IMPLEMENTED_UNVERIFIED | Versioned close | HTTP not run |
| AC-17 | PARTIAL | Text documents | Binary deferred |
| AC-18 | BLOCKED | Migration 043 source. Batch open now requires document-create authorization and is still unrouted | Applied only on the G78 disposable database. Deployment databases were not migrated |
| AC-19 | PARTIAL | Consent and refused disposal | Holds wait on 043 |
| AC-20 | IMPLEMENTED_UNVERIFIED | Revenue report route | Not executed |
| AC-21 | IMPLEMENTED_UNVERIFIED | Department permission keys | HTTP not run |
| AC-22 | IMPLEMENTED_UNVERIFIED | CSRF and OTP | HTTP not run |
| AC-23 | IMPLEMENTED_UNVERIFIED | Organisation predicates | Browser denials not run |
| AC-24 | IMPLEMENTED_UNVERIFIED | Booking default false | Coupons deferred |
| AC-25 | BLOCKED | `runDataJobExport` | Not executed |
| AC-26 | BLOCKED | Offline 503 | No restore |
| AC-27 | BLOCKED | No audit | Not demonstrated |
| AC-28 | BLOCKED | No monitor | Not demonstrated |
| AC-29 | DEFERRED | No adapter | External systems |
| AC-30 | BLOCKED | No load test | Not demonstrated |

ActiveClinic totals: implemented 16, partial 7, blocked 6, deferred 1.

## BlessBoard — 17

| ID | Status | Evidence | Gap |
| --- | --- | --- | --- |
| BB-01 | IMPLEMENTED_UNVERIFIED | Church registration | HTTP not run |
| BB-02 | IMPLEMENTED_UNVERIFIED | HQ and branches | HTTP not run |
| BB-03 | IMPLEMENTED_UNVERIFIED | Required member fields | HTTP not run |
| BB-04 | IMPLEMENTED_UNVERIFIED | Directory | HTTP not run |
| BB-05 | IMPLEMENTED_UNVERIFIED | Activation is separate | HTTP not run |
| BB-06 | PARTIAL | Section builder requires church id | Public-page rows absent |
| BB-07 | IMPLEMENTED_UNVERIFIED | Theme draft and publish | Browser not run |
| BB-08 | IMPLEMENTED_UNVERIFIED | Sermon `preachedAt` | Browser not run |
| BB-09 | IMPLEMENTED_UNVERIFIED | Event create button | Browser not run |
| BB-10 | IMPLEMENTED_UNVERIFIED | Public audience required | HTTP not run |
| BB-11 | PARTIAL | Reason shown on refusal | Uploads disabled |
| BB-12 | IMPLEMENTED_UNVERIFIED | Contact and join | HTTP not run |
| BB-13 | PARTIAL | Request category | Not a new module |
| BB-14 | IMPLEMENTED_UNVERIFIED | Testing OTP | Production provider closed |
| BB-15 | IMPLEMENTED_UNVERIFIED | HQ gates and audit | HTTP not run |
| BB-16 | BLOCKED | Not executed | No report result |
| BB-17 | IMPLEMENTED_UNVERIFIED | Church id on writes | HTTP not run |

BlessBoard totals: implemented 13, partial 3, blocked 1.

Detail for each id is in [ACTIVECLINIC_FUNCTIONALITY.md](ACTIVECLINIC_FUNCTIONALITY.md) and [BLESSBOARD_FUNCTIONALITY.md](BLESSBOARD_FUNCTIONALITY.md).
