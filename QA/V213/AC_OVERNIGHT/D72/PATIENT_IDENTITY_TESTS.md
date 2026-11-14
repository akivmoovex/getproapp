# Patient identity tests

| Test | Assertion |
|---|---|
| Duplicate row from another organization | `matches` is empty and the foreign patient id is absent |
| Lookup with no organization | No query. `invalid_input` |
| Phone registration with no patient | `no_patient_match` and no patient id in the result |

These use a fake database. They are not a stored-identity pass. Duplicate detection still does not merge.
