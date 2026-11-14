# Implementation packages

Eight packages. 23 + 18 + 12 + 9 + 9 + 6 + 4 + 3 = 84. Exact IDs are the `package` column in `FULL_84_CASE_TRACEABILITY.csv`. No package is authorized to start.

## A. Security and existing-feature release blockers

Priority P0. IDs: the five non-break-glass SEC rows, PLT-01-01 through PLT-01-03, all nine OTP rows, PAT-01-01 through PAT-01-03, APT-01-01 through APT-01-03.

Dependencies: none inside the clinical build. OTP migration and a provider are separate approvals.

Tasks: keep portal registration and appointment create. Run the live AC-05 denial without inventing a church administrator. Re-run patient activation on an authorized disposable database. Prove staff-overlap rejection there. Do not add slot capacity until D21-05 is approved. Keep OTP activation blocked. Do not add a production `1234` bypass.

Tests to add only after approval: live AC-05, disposable-database portal activation, disposable-database staff overlap. The capacity file must keep failing closed until a lock exists.

Done when: AC-05 has a live authenticated denial, portal and overlap have database evidence, and OTP is still not called production-ready.

Approvals: D21-15, D21-14, D21-05, D21-11. Migration: none in this package. Gate: G3 for AC-05, G2 for portal and appointments, G4 for OTP.

## B. Tenant, facility, and patient identity

Priority P1. IDs: TEN-01-01 through TEN-01-03 and ID-01-01 through ID-02-03.

Tasks: prove facility ownership, cross-tenant denial without disclosure, and fail-closed missing context. Leave merge unassigned until a lineage and unmerge design is approved. Do not invent an identifier for a patient with neither phone nor national ID.

Tests: tenant A/B facility denial, duplicate review with no merge, receptionist merge denial.

Done when: those denials have database evidence, and merge is still absent unless approved.

Approvals: D21-01, D21-03, D21-04. Migration: none until merge is approved.

## C. Encounters, queues, nursing, and consultation

Priority P1. IDs: VIS-01-01 through VIS-02-03, NUR-01-01 through NUR-01-03, CLN-01-01 through CLN-01-03.

Tasks: keep stored encounter states until the clinical owner adopts the proposed list. Keep duplicate-queue rejection. Add an amendment writer only after the reason and author fields are approved. Do not allow in-place edits of signed notes.

Tests: duplicate check-in, wrong-facility denial, signed-note denial, and a not-run amendment case.

Done when: the stored behavior has database evidence and the proposed states are either adopted or explicitly declined.

Approvals: D21-02. Migration: none while the three stored states remain.

## D. Laboratory, results, and pharmacy

Priority P2. Depends on C. IDs: ORD-01-01 through ORD-01-03, LAB-01-01 through LAB-01-03, RX-01-01 through RX-01-03.

Tasks: do not rename order states or add escalation until the laboratory owner approves them. Change acknowledgement so it targets the result id only as part of that approval. Leave substitution columns unused as policy.

Tests: wrong-patient attachment denial, unauthorized dispense denial, and a held critical-result case.

Done when: existing dispense and result permissions have authenticated evidence, and escalation is still unapproved if the policy is open.

Approvals: D21-06, D21-07. Migration: none before those approvals.

## E. Billing and transaction integrity

Priority P2. IDs: FIN-01-01 through FIN-01-03.

Tasks: keep reversal on the finance supervisor. Prove idempotent payment retry. Do not move payment primitives to the platform unless finance approves that split.

Tests: cashier reversal denial and a repeated payment key.

Done when: balance, receipt, denial, and single post have database evidence.

Approvals: D21-08. Migration: none.

## F. Documents, scanning, retention, and consent

Priority P3. Depends on B. IDs: DOC-01-01 through DOC-01-03 and RET-01-01 through RET-01-03. Consent has no ID and stays in this package as uncovered matrix scope.

Tasks: no scan import, quarantine, hold, or disposal until legal periods are confirmed. Do not delete on expiry. Consent withdrawal already exists and needs an acceptance case before anyone calls it covered.

Tests: none that expect deletion. A future quarantine test waits on the policy.

Done when: the legal owner has either deferred retention or approved fields, and no deleter has been added early.

Approvals: D21-09 and the consent decision. Migration: not drafted here.

## G. Operational recovery, accessibility, monitoring, and shared reuse

Priority P3. IDs: OPS-01-01 through OPS-02-03, PLT-02-01 through PLT-03-03, BBF-01-01 through BBF-02-03.

Tasks: no restore drill and no offline writer in this stage. BlessBoard invitation and media stay on shared infrastructure. A failed notification must not activate a privileged account. Accessibility and monitors are specified and have no acceptance ID.

Tests: cross-church attachment denial and a held restore case.

Done when: RPO, RTO, and hosting are written decisions, or the release stays blocked on OPS-01.

Approvals: D21-10. Migration: none.

## H. Optional and deferred

Priority P4. IDs: SEC-02-03, JUF-01-01, JUF-01-02, JUF-01-03.

Reason: break-glass and Juflona signing are optional. D21-12 and D21-13 leave both unbuilt. A demo tenant must not turn signing on for every clinic.

Tasks: none until discovery finishes.

Done when: the owner either keeps them deferred or approves a separate build. They are not required to preserve portal or appointment behavior.

Regression for every package: G1 must stay green, portal register must not issue a session, appointment staff overlap must stay in front of insert, and OTP delivery must stay inactive.
