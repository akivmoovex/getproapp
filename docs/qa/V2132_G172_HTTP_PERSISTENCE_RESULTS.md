# G172 HTTP persistence results

Database identity before both writing runs: `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432`.

| Run | Churches | Clinics | Executed | Passed | Failed |
| --- | --- | --- | --- | --- | --- |
| 1 | 76 | 863 | 35 | 32 | 3 |
| 2 | 76 | 880 | 35 | 32 | 3 |

Failures, both runs, unchanged:

- D14C production activation blocked, challenge row required
- D16 second worker cannot verify without the challenge table
- D25 simultaneous slot booking unexecuted

Same-staff overlap and the two-client booking passed in both runs. D16 ActiveClinic auth passed. No assertion was converted to a skip. No migration ran. Port 5432 was not used.

The new browser journey also read `consultation_notes`, `clinical_orders`, and `pharmacy_prescriptions` on this database. That read-back is browser evidence, not part of the 35 HTTP tests.
