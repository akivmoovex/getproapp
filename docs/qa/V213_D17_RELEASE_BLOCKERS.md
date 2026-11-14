# V2.13 D17 release blockers

| Blocker | Status | Why it remains |
|---|---|---|
| BB-01 through BB-06 and BB-24 | PARTIAL | In-process behavior passed. Database persistence and browser journeys are `NOT_RUN`. |
| INV-01 | BLOCKED | First authenticated login was not executed. |
| AC-05 | BLOCKED | In-process scope denials passed. Live authenticated denial evidence was not obtained. |
| OTP production activation | BLOCKED | The hold still returns `BLOCKED` on a production signal, including an `ACTIVE` override. |
| OTP persistence | BLOCKED | The store is in-memory. The migration file must not be created or executed under the current hold. |
| Appointment lifecycle persistence | NOT_RUN | Conflict and status changes need the disposable database. |
| Browser journeys | NOT_RUN | Playwright provisioning was not authorized. |

`OVERALL_RELEASE_READY=NO`.
