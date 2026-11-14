# G2 and G3 test plan

These were not run.

| Check | Later assertion | Hold |
|---|---|---|
| Encounter persistence | One open encounter in facility A is not readable as an open encounter in facility B | `V13_FIXTURE_HOLD` |
| Duplicate check-in | A second open encounter for the same patient and facility is rejected after the first row is stored | Same hold |
| Queue ownership | A status change for facility B does not update facility A’s entry | Same hold |
| Stale version | Two closes of version 1 produce one success and one `stale_version` | Same hold |
| Triage | Pain 0 and pain 10 are stored. Pain 11 is not | Same hold. No new range |
| Browser | Open the reception queue and the encounter screen only after `hold()` returns | Browser flag and a guarded `E2E_DATABASE_URL` |

Do not add an encounter status or a vital-sign threshold in that run.
