# V2.13 D18 release-blocker plan

No blocker below is closed. In-process tests are not substituted for the missing live evidence.

## BlessBoard

| Blocker | Ready to execute | Gap |
|---|---|---|
| BB-01 homepage sections | No | Integration scaffold only. Browser test throws `NOT_IMPLEMENTED`. Field-schema unit tests already pass and do not prove a saved section. |
| BB-02 announcements | No | Scaffold names upload, draft privacy, and public visibility. No fixture image and no public HTTP request against a saved row. |
| BB-03 events | No | Scaffold names `GET /branch/events/new` and `POST /branch/events`. Those handlers are not called. |
| BB-04 sermons | Partial | Unauthorized and cross-branch denial now runs on the real router. Create, invalid date, media URL, and publish still need a session that survives `getPgPool()`. |
| BB-05 member registration | No | Express CSRF unit coverage exists. The integration scaffold does not POST `/hq/members` or store a member. |
| BB-06 member activation | No | Service-level expiry and wrong-church checks use a query double. Password persistence and member login are not in the integration body. |
| BB-24 directory | No | Service-level enquiry test ignores a posted church id. Two-church inbox visibility is not executed. |
| INV-01 first login | No | Acceptance and password setup are not driven through `/invite/accept`, and no session is created. |

## ActiveClinic

| Blocker | Ready to execute | Gap |
|---|---|---|
| AC-05 live lower-privilege denial | No | `assignStaffRole` scope checks pass in process. There is no authenticated receptionist, cashier, or clinic-owner HTTP session. Mocked authorization must not close this blocker. |
| Patient activation persistence | No | The workflow is booking-independent in source. No staff-created patient and no portal activation row are written. |
| Appointment conflict persistence | No | Invalid ids and a missing appointment return before a saved collision. No two bookings share a slot. |
| Cross-clinic and cross-facility denial | No | OTP tenant binding is in process. Facility membership is not loaded from a database. |
| HTTP route execution | No | ActiveClinic login, patient login, and forgot-password routes are named in the scaffold and are not requested. |
| Staff and patient login journeys | No | Browser tests throw `NOT_RUN` before navigation. |

## OTP

| Requirement | Status | Approval still required |
|---|---|---|
| Distributed challenge persistence | Not ready | The store is process memory. `db/migrations/platform/048_otp_challenges.sql` must not be added or executed until a migration review approves it. A second service instance cannot verify the first instance's challenge. |
| Production provider | Not ready | Email and SMS adapters are interfaces. No commercial provider is selected. Tests must keep using fakes. |
| Atomic verification | Not ready | Attempt counts are in one process. Two workers can race. |
| Replay across workers | Not ready | Replay denial is proven only inside one service instance. |
| Production environment enforcement | Ready in process | Production signals reject `1234` and fake providers. Startup rejects test configuration. |
| Testing code 1234 | Ready in process | Accepted only for a verified testing deployment identity. |
| Production activation | Blocked | An `ACTIVE` override on a production signal stays `BLOCKED` until migration, provider, and release verification are approved. |
| BlessBoard and ActiveClinic session gating | Partial | Login and organisation-selection calls pass an OTP workflow, including `POST /app/select-organization`. The password-change refresh remains an already-authenticated refresh. Browser proof is not run. |

## Failure response for every suite

If an authorized run fails, leave the release blocker open, keep the failing test, and do not skip it. Do not point `DATABASE_URL` at a shared or hosted database. Drop only the run-owned database named for that run.
