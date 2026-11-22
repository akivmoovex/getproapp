# V13 G46 — exact gap inventory

The filename `docs/qa/V13_G45_FINAL_HANDOFF.md` is not in the repository. The handoff on disk is `docs/qa/V13_G45_DEVELOPMENT_HANDOFF.md`. The healthcare brief and both office files remain `SOURCE_UNAVAILABLE`.

The 17 partial or blocked rows are below. AC-29 stays deferred and is class F. It is not one of the 17.

| ID | Product | Class | Missing behavior | Safe to implement now |
| --- | --- | --- | --- | --- |
| AC-06 | ActiveClinic | C | Longitudinal view is the existing encounter list | No new continuity policy |
| AC-11 | ActiveClinic | C | No diagnosis code catalogue | No |
| AC-12 | ActiveClinic | C | Manual form does not join the pharmacy queue | No. The form forbids a catalogue picker |
| AC-13 | ActiveClinic | C | No approved reference ranges or critical thresholds | Independent lab flow already exists |
| AC-14 | ActiveClinic | C | Queue handoff is AC-12. Remainder check already exists | No new dose rule |
| AC-17 | ActiveClinic | C | No binary clinical files | No |
| AC-18 | ActiveClinic | B | Import tables are not applied and no route calls them | Permission gate only. Not operational |
| AC-19 | ActiveClinic | C | Holds wait on 043. Paper destruction stays refused | No |
| AC-25 | ActiveClinic | E | `runDataJobExport` was not executed | No |
| AC-26 | ActiveClinic | E | Offline is 503. Restore was not demonstrated | No |
| AC-27 | ActiveClinic | E | No accessibility audit | No |
| AC-28 | ActiveClinic | C | No approved monitor contract | No |
| AC-30 | ActiveClinic | E | No performance test | No |
| BB-06 | BlessBoard | E | Public-page rows were not inserted | No fixture write |
| BB-11 | BlessBoard | C | Uploads stay disabled until the flag is approved | No |
| BB-13 | BlessBoard | F | Prayer is a request category, not a new module | No |
| BB-16 | BlessBoard | E | Reports were not executed | No |

Classes C, D, E, and F were not bypassed. Class B received a permission check and stayed unrouted. No row moved to implemented.

```
PARTIAL_OR_BLOCKED=17
IMPLEMENT_NOW=0
MIGRATION_PENDING_TOUCHED=AC-18
COUNTS_CHANGED=NO
```
