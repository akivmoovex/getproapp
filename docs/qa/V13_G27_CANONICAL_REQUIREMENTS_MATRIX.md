# V13 G27 — canonical requirements register

The healthcare brief PDF and both QA office documents are `SOURCE_UNAVAILABLE`. Their wording was not invented. Rows below are the named product areas, scored from the current source and the G01–G26 reports. `IMPLEMENTED_UNVERIFIED` means the code is present and a database-free test or source contract exists. It is not an end-to-end pass.

## ActiveClinic

| ID | Module | Status | Evidence | Missing or blocked |
| --- | --- | --- | --- | --- |
| AC-01 | Organisation and facilities | IMPLEMENTED_UNVERIFIED | Facility and organisation services | HTTP not run |
| AC-02 | Patient identity | IMPLEMENTED_UNVERIFIED | Duplicate warning. Merge stays `merge_deferred` | No automatic merge |
| AC-03 | Patient registration | IMPLEMENTED_UNVERIFIED | Staff registration route | HTTP not run |
| AC-04 | Demographics and contacts | IMPLEMENTED_UNVERIFIED | Patient service | HTTP not run |
| AC-05 | Next of kin and alerts | IMPLEMENTED_UNVERIFIED | Emergency contacts and clinical alerts | HTTP not run |
| AC-06 | Longitudinal record | PARTIAL | Encounters exist. Product gaps say continuity is basic only | No new longitudinal policy |
| AC-07 | Visit lifecycle | IMPLEMENTED_UNVERIFIED | `startEncounter` and `closeEncounter` | HTTP not run |
| AC-08 | Reception and queue | IMPLEMENTED_UNVERIFIED | Queue transitions and duplicate check | Browser not run |
| AC-09 | Nursing and triage | IMPLEMENTED_UNVERIFIED | Stored vital types and triage permission | No invented thresholds |
| AC-10 | Consultation | IMPLEMENTED_UNVERIFIED | Signed notes cannot be overwritten | Amendments table still forbidden |
| AC-11 | Diagnoses and plans | PARTIAL | Free-text diagnosis. Code lookup is deferred | No diagnosis catalogue |
| AC-12 | Prescriptions and referrals | PARTIAL | Dose fields required. Queue needs a catalogue item | Manual form has no catalogue picker |
| AC-13 | Laboratory | PARTIAL | Orders, queue, specimens, results | No approved reference ranges |
| AC-14 | Pharmacy dispensing | PARTIAL | Dispense permission and records exist | Handoff gap in AC-12 |
| AC-15 | Billing | IMPLEMENTED_UNVERIFIED | Minor units, invoices, receipts, reversals | No payment provider |
| AC-16 | Closeout | IMPLEMENTED_UNVERIFIED | Versioned close for one open encounter | HTTP not run |
| AC-17 | Documents | PARTIAL | Text documents and indexes | Binary upload deferred |
| AC-18 | Scanning and migration | BLOCKED | Migration 043 prepared, not applied, not routed | Bytes refused |
| AC-19 | Retention and consent | PARTIAL | Consent withdrawal exists. Holds are in 043 | No age-based deletion. Paper destruction deferred |
| AC-20 | Administration and reporting | IMPLEMENTED_UNVERIFIED | Revenue report services | Reports not executed |
| AC-21 | Roles | IMPLEMENTED_UNVERIFIED | Permission keys per department | HTTP not run |
| AC-22 | Security and audit | IMPLEMENTED_UNVERIFIED | CSRF, OTP fail-closed, audit redaction | HTTP not run |
| AC-23 | Tenant and facility isolation | IMPLEMENTED_UNVERIFIED | Organisation predicates on clinical writes | Browser denials not run |
| AC-24 | Configuration | IMPLEMENTED_UNVERIFIED | Product enablement and booking default false | — |
| AC-25 | Export | BLOCKED | `runDataJobExport` exists | Not executed |
| AC-26 | Downtime and recovery | BLOCKED | Offline route returns 503 and does not write | No restore demonstration |
| AC-27 | Accessibility | BLOCKED | Existing form labels | No accessibility audit was run |
| AC-28 | Monitoring | BLOCKED | No new monitor | Not demonstrated |
| AC-29 | Interoperability | DEFERRED | No national or insurance adapter | External systems stay deferred |
| AC-30 | Performance | BLOCKED | No load test | Not demonstrated |

Totals: 16 unverified-implemented, 7 partial, 0 missing, 1 deferred, 6 blocked.

## BlessBoard

The healthcare brief is not a BlessBoard specification.

| ID | Module | Status | Missing or blocked |
| --- | --- | --- | --- |
| BB-01 | Church registration | IMPLEMENTED_UNVERIFIED | HTTP not run |
| BB-02 | HQ and branches | IMPLEMENTED_UNVERIFIED | HTTP not run |
| BB-03 | Member registration | IMPLEMENTED_UNVERIFIED | HTTP not run |
| BB-04 | Directory and lifecycle | IMPLEMENTED_UNVERIFIED | HTTP not run |
| BB-05 | Portal activation | IMPLEMENTED_UNVERIFIED | Separate from create |
| BB-06 | Public website | PARTIAL | Fixture public pages were not inserted |
| BB-07 | Themes, drafts, publish | IMPLEMENTED_UNVERIFIED | Browser not run |
| BB-08 | Sermons | IMPLEMENTED_UNVERIFIED | Browser not run |
| BB-09 | Events | IMPLEMENTED_UNVERIFIED | Browser not run |
| BB-10 | Announcements | IMPLEMENTED_UNVERIFIED | HTTP not run |
| BB-11 | Media | PARTIAL | Uploads stay disabled |
| BB-12 | Contact and join | IMPLEMENTED_UNVERIFIED | HTTP not run |
| BB-13 | Prayer | PARTIAL | A member-request category, not a new module |
| BB-14 | OTP | IMPLEMENTED_UNVERIFIED | Production provider stays closed |
| BB-15 | Access and audit | IMPLEMENTED_UNVERIFIED | HTTP not run |
| BB-16 | Reporting and exports | BLOCKED | Not executed |
| BB-17 | Tenant and branch isolation | IMPLEMENTED_UNVERIFIED | HTTP not run |

Totals: 13 unverified-implemented, 3 partial, 0 missing, 0 deferred, 1 blocked.
