# Clinical design approvals

Fifteen decisions are pending. A recommended default is a planning suggestion. None is approved. No option below is authorized for implementation.

## D21-01 Clinical roles and facility permissions

- Current implementation: twelve ActiveClinic roles and permission keys in the role catalogue. Organization admin is administration without clinical or finance write by default. Facility scope is applied in appointment and clinical helpers.
- Proposed specification: Phase 0 must approve the clinical role matrix, including facility and department boundaries.
- Options: keep the twelve-role catalogue; revise keys; add facility-scoped roles.
- Recommended default: keep the current catalogue until an owner marks a row wrong.
- Security: widening a role to force AC-05 through a church administrator was already refused.
- Required approval: product owner for the role matrix.
- Dependent features: AC-05, facility denial, lab edit denial, finance reversal.

## D21-02 Encounter states and transition policies

- Current implementation: encounter `open | completed | cancelled`. Queue and triage exist. Some records use an expected version.
- Proposed specification: `REGISTERED`, `WAITING`, `IN_TRIAGE`, `IN_CONSULTATION`, `ACTIVE_ORDERS`, `READY_FOR_CLOSEOUT`, with invalid-transition rejection and concurrent-transition handling.
- Options: adopt the proposed list; keep stored states and record an approved exception; map names without changing storage.
- Recommended default: keep stored states until the owner adopts the proposed list.
- Security: a new transition must not skip authorization or lose the version check.
- Required approval: clinical owner.
- Dependent features: queue, triage, notes, orders.

## D21-03 Duplicate patient matching and merging

- Current implementation: duplicate candidates are returned. Override needs `activeclinic.patient.duplicate_override`. `activeclinic.patient.merge` is assigned to nobody. No merge or unmerge service.
- Proposed specification: authorized merge, lineage, and unmerge. Conflicting matches held.
- Options: leave merge unassigned; approve a merge workflow with unmerge; approve match-only with no merge.
- Recommended default: leave merge unassigned.
- Security: automatic merge is not present and must not be added as a side effect.
- Required approval: clinical owner and privacy owner.
- Dependent features: `ID-02-*`. Not required to preserve current registration.

## D21-04 Patient identity verification

- Current implementation: identifiers are stored. Phone normalization accepts `+260` E.164. No approved rule for a patient with neither phone nor national ID.
- Proposed specification: an identity rule for missing phone and national ID, and a verified channel before portal activation.
- Options: require one strong identifier; allow staff-attested records with a visible gap; block portal until a channel is verified.
- Recommended default: do not invent an identifier rule. Block production OTP activation separately.
- Security: a guessed identifier must not link the wrong portal.
- Required approval: clinical owner.
- Dependent features: portal activation, OTP channels.

## D21-05 Appointment capacity rules

- Current implementation: assigned-staff overlap returns `appointment_collision`. The check is skipped when no staff id is set. It is check-then-insert, not a lock. Public booking idempotency does not set slot capacity.
- Proposed specification: overlapping bookings rejected, and concurrent requests for one slot succeed only up to approved capacity.
- Options: staff overlap only; one booking per staff slot with a lock; facility capacity independent of staff.
- Recommended default: keep staff-overlap behavior and do not claim capacity until a rule and a lock are approved.
- Security: two concurrent requests can both pass the current check.
- Required approval: clinical owner.
- Dependent features: `APT-01-02`, `APT-01-03`.

## D21-06 Critical laboratory result policies

- Current implementation: a critical flag can insert an alert. Acknowledgement and escalation policy are absent.
- Proposed specification: critical results follow an approved acknowledgement and escalation path.
- Options: alert only; required acknowledgement; timed escalation.
- Recommended default: keep the alert and do not add escalation behavior before policy approval.
- Security: a critical flag must not be editable by a role that cannot release results.
- Required approval: laboratory and clinical owners.
- Dependent features: `LAB-01-03`, order handoff.

## D21-07 Pharmacy substitution rules

- Current implementation: substitution columns exist on prescription items. A written substitution policy was not found in this review.
- Proposed specification: substitution only under an approved rule, with the original and substitute recorded.
- Options: disallow substitution; allow pharmacist substitution with reason; require prescriber approval.
- Recommended default: do not treat the columns as an approved substitution policy.
- Security: substitution must keep dispense provenance and must not bypass prescriber intent silently.
- Required approval: pharmacy owner.
- Dependent features: `RX-01-03`.

## D21-08 Billing and reversal controls

- Current implementation: invoices, payments with idempotency keys, refunds, and reversals. Reversal permission is limited to the finance supervisor in the catalogue.
- Proposed specification: unauthorized reversal denied; repeated payment does not double-post. The specification also asks whether payment primitives stay in ActiveClinic.
- Options: keep billing inside ActiveClinic; move payment primitives to the platform.
- Recommended default: keep billing inside ActiveClinic.
- Security: cashier and billing officer must not gain reversal by a later role edit made only to pass a test.
- Required approval: finance owner.
- Dependent features: `FIN-01-02`, `FIN-01-03`.

## D21-09 Document retention and disposal

- Current implementation: clinical document metadata. No legal hold, retention expiry, or two-person disposal. Scan quarantine is absent.
- Proposed specification: retention categories, Zambia legal periods, legal hold, and two-person disposal. Periods need local legal confirmation.
- Options: defer retention; approve categories after legal advice; approve hold-only with no disposal.
- Recommended default: no deletion path until legal periods are confirmed.
- Security: expiry must not delete a record. Uncertain scans must not enter the chart.
- Required approval: legal and privacy owners.
- Dependent features: `RET-*`, `DOC-*`.

## D21-10 Hosting, backup, and restore

- Current implementation: no restore drill, RPO, RTO, or data-controller record in the repository.
- Proposed specification: hosting location, backup, restore, cross-tenant restore denial, and a release block when recovery fails.
- Options: document the current host without a drill; require a disposable restore drill before any release claim.
- Recommended default: no production restore claim and no cross-tenant restore path.
- Security: a restore must not load one tenant into another.
- Required approval: operations owner.
- Dependent features: `OPS-01-*`. Deferred.

## D21-11 OTP providers and production activation

- Current implementation on `origin/V13`: shared verification challenges. Login completes without OTP. No production startup gate. Pepper can fall back to `SESSION_SECRET` and then a dev string.
- Worktree, not baseline: an OTP module and session tags exist and production activation remains blocked. That code is uncommitted and was not used to change acceptance classes.
- Proposed specification: OTP before a new session, testing code `1234` only under a verified testing identity, production rejection of a fake provider, durable challenges across workers, and an approved Zambia SMS or email provider.
- Options: keep activation blocked; approve provider and migration in a later stage; limit OTP to sensitive actions rather than every login.
- Recommended default: activation stays blocked. No migration file is created.
- Security: OTP must not replace RBAC. A memory store must not be treated as replay protection across workers.
- Required approval: security owner and provider owner.
- Dependent features: `OTP-*`, staff and patient login.

## D21-12 Break-glass

- Current implementation: no ActiveClinic break-glass path. BlessBoard maintenance mode is not clinical break-glass.
- Proposed specification: if approved, reason, time limit, and review. Never a global bypass.
- Options: do not build it; build a reviewed, time-limited path.
- Recommended default: do not build it in the next implementation stage.
- Security: a bypass that skips RBAC would undermine AC-05.
- Required approval: security and clinical owners.
- Dependent features: `SEC-02-03`. Deferred.

## D21-13 Juflona two-screen signing

- Current implementation: Juflona content in the repo is demo website material. No signing flag.
- Proposed specification: tenant-gated and off by default, after the discovery items in the specification.
- Options: leave absent; add a default-off flag with no signing flow; build signing after discovery.
- Recommended default: leave absent.
- Security: a demo tenant must not enable signing for every clinic.
- Required approval: product owner.
- Dependent features: `JUF-*`. Deferred.

## D21-14 Reuse of the V2.12 portal pass

- Current implementation: portal registration code exists. `docs/qa/V212_AC_PORTAL_ACTIVATION_ACCEPTANCE.md` claims a pass. The cited output directory is not available.
- Proposed specification: matrix `PAT-01-01` needs reproducible persistence evidence.
- Options: recover the artifact and review it; re-run on an authorized disposable database.
- Recommended default: do not reuse the sentence as matrix evidence.
- Security: a recovered log still has to show tenant binding and no public-booking side effect.
- Required approval: QA owner.
- Dependent features: `PAT-01-01`.

## D21-15 What closes AC-05

- Current implementation: permission middleware exists. V2.12 records AC-05 blocked because a lower-privilege shared-platform principal could not be assigned without `invalid_input:church_hq_admin_scope`. A later cashier referral 403 is a different case and was not run in Stage 1 or D21.
- Proposed specification: live authenticated denial of an admin operation, with data unchanged.
- Options: name the lower-privilege principal and the admin route; accept the cashier referral case as a substitute.
- Recommended default: do not accept the cashier referral case as AC-05. Do not invent a church-admin role to force the test.
- Security: weakening RBAC to create the principal would be a product defect.
- Required approval: product owner.
- Dependent features: `SEC-01-02`, Priority A item 2.
