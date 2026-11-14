# Clinical workflow test plan

These cases are specified for a future disposable database. None was executed. No new integration file was added, because the V13 suite expects 13 gated integration files.

| Case | Expected result | Blocked by |
|---|---|---|
| Encounter status outside `open`, `completed`, `cancelled` | Rejected | D21-02 if a new state is required |
| Open encounter list for another organization | Empty | None. The predicate is already in the service |
| Pain level `11` | `invalid_input` and no row | None |
| Signed note update | `cannot_edit_signed` and the body unchanged | Amendment writer remains unapproved |
| Laboratory result on a cancelled request | No result row | None |
| Critical acknowledgement for another organization’s result | No alert changes | A result-to-alert column is still absent, so two alerts for one patient still acknowledge the newest |
| Dispense with an empty item list | `invalid_input` before stock movement | Live dispense stays prohibited |
| Repeated payment key in the same tenant | `duplicate_submission` and one payment | Live posting stays prohibited |
| Same key in another tenant | Not this tenant’s duplicate | None once the disposable database exists |
| Document event for another organization’s document id | No event row | None |
| Consent with a forged organization | `forged_tenant` before insert | Representative identity remains D29-16 |
| Offline route | 503 and no insert | Offline writes remain unapproved |
| Restore | Not run | `restoreTenant.js` is absent and D21-10 is pending |

OTP cases stay on the in-memory double. Production `1234`, a provider send, and `platform.otp_challenges` stay blocked. Replay, wrong purpose, and a second memory store that cannot see the first challenge are already covered in process and are not production evidence.
