# Complete feature inventory

Sources: `ActiveClinic_Technical_Specification_V1.pdf` (proposed, 14 November 2026, 4 pages), `ActiveClinic_QA_Acceptance_Matrix_V1.pdf` (84 IDs), Stage 1 traceability, and D19–D28. HEAD `b8f6b420d25e908de64ba292866c218c32edc30c`. D22's 195 passing G1 tests stay historical. The later 233-test run did not execute G2, G3, or G4.

No feature below is fully implemented against the specification. In-process tests are not acceptance passes.

| # | Feature | Status | What exists | What the specification still requires |
|---|---|---|---|---|
| 1 | Tenants, facilities, departments, service points | PARTIAL | Facility records, departments, and reception service points | Live tenant isolation and fail-closed missing context |
| 2 | Clinical role grants and tenant isolation | PARTIAL | ActiveClinic role catalogue and permission middleware | Live cross-tenant denial and the AC-05 denial |
| 3 | Patient registration and identity matching | PARTIAL | Staff-created patients, duplicate candidates, phone match | An approved rule when phone and national ID are both absent |
| 4 | Merging, lineage, and unmerge | MISSING | `activeclinic.patient.merge` is assigned to nobody | Authorized merge, lineage, and reviewed unmerge |
| 5 | Consent, withdrawal, and representatives | PARTIAL | `patient_consents` and a withdraw path | No acceptance ID. Representative and disclosure rules are unapproved |
| 6 | Encounters, visits, and queues | PARTIAL | `open`, `completed`, `cancelled`; duplicate active queue entry | Proposed state list and stale-version conflict handling |
| 7 | Nursing, triage, and vital signs | PARTIAL | Vitals with unit and author; triage text allergies | Configurable range policy |
| 8 | Consultation notes and amendments | PARTIAL | Draft and signed. Signed edit returns `cannot_edit_signed` | Amendment writer. The table is unused |
| 9 | Laboratory orders and results | PARTIAL | Orders `draft`, `submitted`, `cancelled`; result entry | Proposed order chain and a result bound to the same patient |
| 10 | Critical-result escalation | PARTIAL | `is_critical` and an alert. Ack selects the newest alert | Approved acknowledgement and escalation policy |
| 11 | Prescriptions, allergies, and dispensing | PARTIAL | Dispense provenance columns; free-text allergies | Substitution rule and a structured allergy review |
| 12 | Billing, receipts, reversals, reconciliation | PARTIAL | Invoice, idempotent payment, finance-supervisor reversal key | Unauthorized reversal and concurrent retry were not executed |
| 13 | Document scanning, provenance, quarantine | PARTIAL | Document metadata | Digest, page quality, and quarantine |
| 14 | Retention, legal hold, and disposal | MISSING | No hold or disposal path | Legal periods are not confirmed. No automatic deletion |
| 15 | Patient portal activation | PARTIAL | Phone match or guest token, then login. Register does not issue a session | Persistence not run. V2.12 pass claim is unreproduced |
| 16 | Appointment booking and capacity | PARTIAL | Create links patient, service, and facility. Staff overlap is check-then-insert | Slot capacity and a lock |
| 17 | OTP, sessions, CSRF, authorization | PARTIAL | Shared session and CSRF. Uncommitted OTP module. Production activation blocked | Session only after OTP, durable challenges, and an approved provider |
| 18 | Break-glass | DEFERRED | No clinical break-glass path | Build only after a reason, time limit, and review are approved |
| 19 | Backups, restore, RPO/RTO | MISSING | No restore drill in the repository | Phase 0 must set RPO, RTO, host, and controller roles |
| 20 | Offline operation and reconciliation | MISSING | `/app/offline` is a static page | No offline writes until conflict rules exist |
| 21 | Accessibility and monitoring | MISSING | No clinical accessibility or queue-age monitor tied to this matrix | Keyboard use, clear errors, and the named monitors |
| 22 | Juflona two-screen signing | DEFERRED | Demo website content only | Off by default, after discovery |
| 23 | BlessBoard shared reuse | PARTIAL | Shared session, CSRF, media, and roles. BlessBoard does not query clinical tables in source | Live denial and no partial activation on notification failure |
| 24 | Privacy, audit, and deployment | PARTIAL | Selected audit events. Deployment checks exist | Purpose on clinical reads, no secrets in logs, and a controlled release |

Counts: inventoried 24, implemented 0, partial 17, missing 5, deferred 2.
