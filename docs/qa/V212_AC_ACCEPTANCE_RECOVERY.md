# V2.12 ActiveClinic Acceptance Recovery

Status: `PARTIAL / BLOCKED`

## Recovered scenarios

### AC-02 Appointment persistence — PASS

Read-only SQL verified the appointment created by the browser run:

- appointment: `00817a14-0188-453d-9c6b-684b22d778de`
- patient: `db10b499-28fe-45b2-98ab-bf2cc3692729`
- organization: `ff842bf1-6373-4470-a625-3374e9896a6f`
- healthcare organization: `bc286fc4-7814-4537-a796-d2f914ad8ab3`
- facility: `fa98ac47-c674-4b45-b301-59ae54d21f7a`
- status: `confirmed`
- scheduled: `2026-10-31 09:00–09:30 Africa/Lusaka`

No unintended duplicate was observed in the latest appointment records.

### AC-03 Logout invalidation — PASS

The supported visible logout form posts to `/logout`. Reusing the pre-logout cookie after submitting that form returned `303 /login`, proving protected-session rejection.

## Remaining blockers

- AC-01: staff-created patient portal-linking and patient-login browser association was not completed; first blocker is the missing captured linking-token/account-association workflow.
- AC-04: both-direction patient, appointment, and facility cross-tenant API requests were not captured in this recovery run.
- AC-05: Super Admin versus clinic-admin Test Database Management authorization was not executed.

No product defect was confirmed. No product files, database reset, or commits were changed.
