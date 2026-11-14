# G2 and G3 test plan

These were not run.

| Check | Later assertion | Hold |
|---|---|---|
| Signed note | A stored signed note cannot be updated, and a second note is not inserted | `V13_FIXTURE_HOLD` |
| Laboratory patient | A result row’s patient id equals the request’s patient id | Same hold |
| Verify retry | A second verify of a verified result returns `ALREADY_VERIFIED` | Same hold |
| Dispense retry | A second dispense of a dispensed prescription returns `invalid_status` | Same hold |
| Prescriber | The prescriber id is unchanged after the status update | Same hold |
| Browser | Open the consultation, laboratory, and pharmacy screens only after `hold()` returns | Browser flag and a guarded `E2E_DATABASE_URL` |

Do not add an allergy rule, a substitution, or an escalation threshold in that run.
