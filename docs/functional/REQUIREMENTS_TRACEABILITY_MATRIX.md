# Requirements traceability matrix

Sources in the repository: G27 register, G35 matrix, current routes, and database-free tests. The healthcare brief and both office QA files are `SOURCE_UNAVAILABLE`. Their wording was not invented. Counts are unchanged.

`IMPLEMENTED` below means `IMPLEMENTED_UNVERIFIED`.

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
| AC-13 | PARTIAL | Orders, queue, results, an approved-rule engine, and a non-persistent preview | No stored thresholds. Migration 044 is not applied |
| AC-14 | PARTIAL | Dispense, remainder, and one-request duplicate rejection | Handoff is AC-12 |
| AC-15 | IMPLEMENTED_UNVERIFIED | Minor units, reversals | No payment provider |
| AC-16 | IMPLEMENTED_UNVERIFIED | Versioned close | HTTP not run |
| AC-17 | PARTIAL | Text documents | Binary deferred |
| AC-18 | BLOCKED | Migration 043 source only. Batch open now requires document-create authorization and is still unrouted | Not applied |
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
