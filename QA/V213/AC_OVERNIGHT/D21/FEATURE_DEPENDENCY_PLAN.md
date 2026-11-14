# Feature dependency plan

Planning order only. Nothing in this list is authorized for implementation. Current appointments, portal registration, pharmacy, billing, and signed consultation notes stay in place.

Baseline: `origin/V13` `b8f6b420d25e908de64ba292866c218c32edc30c`. Stage 1 classes are unchanged.

## Priority A — release blockers

Order is the dependency order. Later items do not start as product work while an earlier approval is open.

1. Isolated database and browser readiness. G2 and G3 stay held. No suite is enabled to create a database or launch Playwright.
2. AC-05 authenticated lower-privilege denial (`SEC-01-02`, `BLOCKED_SECURITY`). Needs an approved principal definition, then a live 403 with unchanged data. The prepared receptionist billing request is not that proof until it is run. The cashier referral assertion is a different case.
3. Patient portal activation persistence (`PAT-01-01`, `EVIDENCE_MISSING`). Code exists. The V2.12 pass artifact is missing. A later authorized database run must cover wrong patient, wrong tenant, expiry, and replay without turning on public booking.
4. Appointment concurrency and capacity (`APT-01-02` partial staff overlap, `APT-01-03` missing). Capacity needs an approved rule before code. Staff-overlap rejection stays.
5. OTP distributed persistence, migration, and provider approval. Production activation stays held. The uncommitted foundation is not a release control and is not on the source baseline.

## Priority B — clinical foundation

Depends on Priority A decisions where a row is a release gate. Design can be written. Implementation stays unauthorized.

1. Tenant, facility, and department boundaries (`TEN-*`, `VIS-01-02`).
2. Patient identity and duplicate matching (`ID-01-*`). Merge stays unassigned until Priority D approval.
3. Encounter lifecycle (`VIS-02-*`). Stored states are `open | completed | cancelled` until an owner chooses otherwise.
4. Queue management (`VIS-01-*`). Duplicate active entry already exists in code and was not executed.
5. Nursing and triage (`NUR-*`, `VIS-02-01`).
6. Consultation notes (`CLN-*`). Signed notes cannot be edited in place. Amendment workflow is missing.
7. Clinical audit (`SEC-01-01`). Selected writes record events. The proposed read envelope is not proven.

## Priority C — clinical operations

Depends on encounter and order identity from Priority B.

1. Laboratory orders and results (`ORD-*`, `LAB-*`). Department-failure rollback and critical-result policy are open.
2. Prescriptions and dispensing (`RX-*`). Catalogue and dispense provenance exist. Substitution policy is open.
3. Billing and reconciliation (`FIN-*`). Idempotent payment exists. Unauthorized reversal was not executed.
4. Document scanning and provenance (`DOC-*`). Metadata exists. Scan quarantine does not.
5. Retention and legal hold (`RET-*`). No implementation. Periods need legal confirmation.

## Priority D — deferred

Do not pull these into A–C.

- Offline writes (`OPS-02-*`). `/app/offline` is a static page.
- Patient record merging (`ID-02-*`). Permission exists and is assigned to nobody.
- Break-glass (`SEC-02-03`).
- Juflona two-screen signing (`JUF-*`). Demo content only.
- Restore, cross-tenant restore denial, and other unapproved Phase 4 operations (`OPS-01-*`).

Shared-platform and BlessBoard rows (`PLT-*`, `BBF-*`) stay in the 84-case set. They are not ActiveClinic clinical features and are not scheduled as clinical implementation.
