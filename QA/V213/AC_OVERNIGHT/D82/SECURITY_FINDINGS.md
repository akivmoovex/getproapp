# Security findings

The fresh G1 run passed 399 and failed 0. That run includes the in-process denials for another organization, another facility, another patient, a signed note, a dispensed prescription, a repeated payment, and a consent withdrawal. Those assertions use fake databases. They are G1 evidence.

| Check | Result |
|---|---|
| AC-05 live HTTP 403 | `NOT_RUN`. A redirect to `/login` is not the denial |
| Patient portal row stored | `NOT_RUN` |
| Appointment conflict under two database sessions | `NOT_VERIFIED` |
| OTP delivery | Not activated. `deliveryActivated` still throws |
| Production database | Not contacted. Database URLs were unset |

No new authorization failure was produced by the executed tests. The unrun live denial is missing evidence, not a new failing assertion.
