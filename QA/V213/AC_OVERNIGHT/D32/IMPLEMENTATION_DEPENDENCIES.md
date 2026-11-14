# Implementation dependencies

These are specifications for later work. No migration file was created and none was executed.

## Already safe to keep

- Facility queries stay organization-scoped.
- Duplicate decisions stay `ALLOW`, `WARN`, `WARN_REVIEW`, or `BLOCK`.
- Encounter status stays `open | completed | cancelled`.
- Signed notes stay immutable in place.
- Pain stays 0 through 10. No other vital range is added.

## Missing, and blocked on approval

| Gap | Needed later | Blocked by | Migration |
|---|---|---|---|
| ID-02-01 merge and lineage | A service that records source, target, actor, and reason, and does not delete the source row | D21-03 | Not drafted. A table name is not approved |
| ID-02-03 unmerge | A reviewed hold that can restore the prior link | D21-03 | Same hold |
| ID-01-03 missing phone and national ID | An identifier rule | D21-04 | None until the rule exists |
| VIS proposed states | Either an approved exception for the three stored states, or a later migration | D21-02 | Do not alter the status check now |
| VIS-02-03 stale encounter | A version compare on the encounter update | D21-02 | None until the state decision |
| CLN-01-03 amendment | A writer into the existing `consultation_note_amendments` table | D21-02 | Table already exists. No new migration |
| NUR-01-02 ranges | Nothing, until a clinician approves a range | None approved | No range columns |
| SEC-01-01 purpose | Add `purpose` to the clinical audit envelope without putting note text in the log | Separate from B and C | None |

D21-01, D21-02, D21-03, and D21-04 gate this foundation. The other 14 decisions in the D30 register also stay pending. None was approved here.

Order: keep current registration and encounters, prove the organization filter and the duplicate decision on a disposable database, and only then consider merge or a state rename.
