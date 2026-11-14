# Final feature status

HEAD is `b8f6b420d25e908de64ba292866c218c32edc30c` on `V13` in `/private/tmp/getpro-v13`. The index is empty.

None of the 24 areas is complete. Seventeen stay partial, five are missing, and two stay deferred. Seventeen safeguards inside the partial areas have application behavior and a passing G1 denial. A G1 denial is not stored evidence, so those areas stay partial.

| Status | Areas |
|---|---|
| Partial | 01–03, 05–13, 15–17, 23, 24 |
| Missing | 04 merge, 14 retention, 19 backup and restore, 20 offline writes, 21 accessibility and monitoring |
| Deferred | 18 break-glass, 22 Juflona signing |

Newly exercised behavior, each with a G1 test and no database pass: reset-token organization scope, duplicate-candidate filtering, encounter and queue facility checks, triage version checks, signed-note refusal, result-to-patient refusal, dispense refusal, document facility and empty-attachment refusal, and consent withdrawal for another patient.

Preserved: the six consent types, the stored encounter and queue statuses, registration sentences, the booking access token, staff-created patients without a portal, and the unapproved capacity hold.

Eighteen design decisions remain unapproved. No acceptance case is `PASS`.
