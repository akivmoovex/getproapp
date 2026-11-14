# Operational test plan

These were not run.

| Check | Later assertion | Hold |
|---|---|---|
| Consent | One granted row can be withdrawn once. A second withdrawal does not insert another event | `V13_FIXTURE_HOLD` |
| Representative | Do not add a record until D29-16 names the fields | Unapproved |
| Allergy | Do not block a dispense until D29-17 names a review with no dose rule | Unapproved |
| Restore | Do not run a restore. `restoreTenant.js` is absent | No RPO or RTO |
| Offline | The 503 page must still contain no insert | No offline writer |
| Outbox | Do not create a table until an event list is approved | No schema |
| Juflona | Signing stays unset. Do not activate it | Unapproved |
| Browser | No accessibility or monitoring walkthrough until a screen list exists | Browser flag |

No deletion, restore, or offline write belongs in that run.
