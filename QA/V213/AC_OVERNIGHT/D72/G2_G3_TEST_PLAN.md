# G2 and G3 test plan

These were not run.

| Check | Later assertion | Hold |
|---|---|---|
| Patient persistence | One stored patient in clinic A is invisible to clinic B | `V13_FIXTURE_HOLD` |
| Portal activation | One identity, then `link_conflict` for a second owner | Same hold. The booking token stays reusable |
| Reset replay | A consumed token cannot set the password again | Needs the token row |
| Facility denial | A department create for another organization’s facility returns not found | Needs both facilities |
| AC-05 | Lower-privilege session receives HTTP 403. A redirect to `/login` fails | Browser flag and the two identities, which are not persisted |
| Browser journeys | The seven spec steps | `hold()` throws until the flags and `E2E_DATABASE_URL` are already set |

Do not add merge, a capacity lock, or an OTP bypass in that run.
