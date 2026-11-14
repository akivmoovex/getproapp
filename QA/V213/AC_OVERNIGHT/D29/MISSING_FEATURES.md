# Missing features

These are gaps. None of them is authorized by this stage. Periods, state names, and API paths in the specification are proposals.

## Identity and consent

Merge, lineage, and unmerge have no service. Duplicate review already refuses automatic merge. Consent rows and withdrawal exist in `activeClinicPatientConsentService.js`, and that behavior has no acceptance ID. Representative, witness, and downstream disclosure rules are not approved. Allergies are a triage text field, not a review that blocks dispensing.

## Encounter and notes

Stored encounters are `open`, `completed`, and `cancelled`. The specification lists `REGISTERED`, `WAITING`, `IN_TRIAGE`, `IN_CONSULTATION`, `ACTIVE_ORDERS`, `READY_FOR_CLOSEOUT`, `COMPLETED`, and `CANCELLED`. Queue duplicate rejection exists. A stale encounter version does not have a proven conflict result. Signed notes cannot be edited in place. `consultation_note_amendments` has no writer.

## Orders, results, and pharmacy

Orders do not use the proposed `DRAFT` through `REVIEWED` chain. A department failure does not roll an order back. Critical acknowledgement updates the newest active alert and does not use the result id. Substitution columns exist without an approved rule.

## Documents and retention

Scan digest, page count, operator, quality, and quarantine are absent. Legal hold, retention expiry, and two-person disposal are absent. The specification forbids automatic deletion. Zambia periods need legal confirmation before any field is added.

## Portal and appointments, preserved

Portal registration and appointment create stay as they are. The missing work is evidence and, for appointments, a capacity rule. Do not replace either flow. A valid booking access token is not consumed when it is verified. That is a defect in the current verify path, not a reason to remove booking.

## OTP and security

The uncommitted OTP module is not production. `1234` is limited to the verified testing identity. A second memory store cannot verify the first challenge. While activation is blocked, login still receives a session. AC-05 live denial is blocked. Break-glass is deferred.

## Operations

Restore, RPO, RTO, cross-tenant restore denial, and a release block after a failed recovery are absent. Offline recovery and conflict handling are absent. Accessibility and the named monitors are absent. Juflona signing is deferred.

## Shared reuse

BlessBoard may keep using sessions, CSRF, media, and notifications. It must not receive clinical tables, clinical permissions, or clinic schemas. A notification failure must not leave a privileged account half-activated. That failure path is not proven.
