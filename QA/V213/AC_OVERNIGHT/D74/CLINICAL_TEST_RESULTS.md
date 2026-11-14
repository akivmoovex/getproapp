# Clinical test results

| Test | Result |
|---|---|
| Signed note rewrite | `cannot_edit_signed`, no insert and no update |
| Draft note for another patient | `patient_not_found`, no update |
| Laboratory result for another patient | `PATIENT_NOT_FOUND`, no insert |
| Laboratory request already verified | `INVALID_STATUS` |
| Radiology report for another patient | `PATIENT_NOT_FOUND`, no insert |
| Verify a result for another patient | `PATIENT_NOT_FOUND`, no update |
| Dispense without the permission | `access_denied`, no connection |
| Dispense for another patient | `patient_not_found`, no dispense event |
| Dispense when already dispensed | `invalid_status` |
| New prescription | The stored prescriber is the supplied staff member |

G1 at `/tmp/d74-g1.log` finished `2026-11-15T01:29:30+0200`. It passed 381 and failed 0. These service tests use a fake database. They are not a stored clinical pass.
