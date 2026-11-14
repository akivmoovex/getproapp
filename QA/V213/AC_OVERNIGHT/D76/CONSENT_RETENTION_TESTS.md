# Consent and retention tests

| Test | Result |
|---|---|
| Stored consent types | The six current types. No representative type |
| Grant of `research_use_of_images` | `invalid_input`, no insert |
| Withdrawal for another patient | `patient_not_found`, no update, note absent |
| Withdrawal SQL | Includes the stored patient and `status = 'granted'` |
| Retention | The consent service has no `DELETE FROM` and no year count |
| Legal hold | The consent service has no `legal_hold` |

These use a fake database. A stored grant and withdrawal were not run. No record was deleted.
