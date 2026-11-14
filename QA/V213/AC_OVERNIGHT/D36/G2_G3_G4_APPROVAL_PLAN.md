# G2, G3, and G4 approval plan

| Gate | Status | What would count |
|---|---|---|
| G1 | 264 passed in process | Not an acceptance pass |
| G2 database | Not run | Both write flags, the local database guard, and a real row or a real denial |
| G3 browser | Not run | Browser flag and a session. `hold()` does not count |
| G4 OTP provider | Blocked | A selected provider, a migration, and a release check. No message was sent |
| AC-05 | Not run | Live authenticated 403 on `/admin/settings/test-database` by a lower-privilege user. The cashier referral is a different case |
| Portal persistence | Not run | A stored patient link. The V2.12 sentence is not evidence |
| Appointment conflict | Not run | A stored overlap rejection. Capacity is still missing |
| Restore | Not run | A disposable tenant restore with RPO and RTO still unapproved |

Open these gates only after a named approval. Do not mark a prepared file as a pass by running it against the wrong database.
