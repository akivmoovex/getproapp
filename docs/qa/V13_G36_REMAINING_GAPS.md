# V13 G36 — remaining feature gaps

Statuses are unchanged from G35. A row can continue only when the next action does not need a new policy or a database write.

| ID | Product | Missing behavior | Migration | Policy | Next safe action | Continue now |
| --- | --- | --- | --- | --- | --- | --- |
| AC-06 | ActiveClinic | Longitudinal record is basic only | No | Product scope | Leave the existing encounters | Yes |
| AC-11 | ActiveClinic | No diagnosis code catalogue | No | Clinical catalogue | Do not invent codes | No |
| AC-12 | ActiveClinic | Manual prescription does not join the queue | No | Form says manual entry only | Do not add a picker until approved | No |
| AC-13 | ActiveClinic | No approved reference ranges | No | Clinical ranges | Keep caller-supplied flags | No |
| AC-14 | ActiveClinic | Dispense exists; queue handoff is AC-12 | No | Same as AC-12 | Use existing dispense service | Yes |
| AC-17 | ActiveClinic | No binary clinical files | No | Storage decision | Keep text documents | No |
| AC-18 | ActiveClinic | Import tables unused | 043 | Import authorization | Do not apply 043 in this phase | No |
| AC-19 | ActiveClinic | Holds unapplied; paper destruction refused | 043 | Legal approval | Keep `deleted: false` | No |
| AC-25 | ActiveClinic | Export job not run | No | None for a later isolated run | Leave `runDataJobExport` unrun | No |
| AC-26 | ActiveClinic | Offline is 503 and does not write | No | Recovery demonstration | Do not claim restore | No |
| AC-27 | ActiveClinic | No accessibility audit | No | None yet | Do not claim a pass | No |
| AC-28 | ActiveClinic | No monitoring run | No | Operations | Do not add a monitor without a contract | No |
| AC-29 | ActiveClinic | No national or insurance adapter | No | Explicit approval | Stay deferred | No |
| AC-30 | ActiveClinic | No performance test | No | None yet | Do not claim scale | No |
| BB-06 | BlessBoard | Public-page fixture rows absent | No | Fixture write authorization | Do not insert rows now | No |
| BB-11 | BlessBoard | Uploads disabled by default | No | Deployment flag | Do not set the flag | No |
| BB-13 | BlessBoard | Prayer is only a request category | No | New module would be unapproved | Leave the category | Yes |
| BB-16 | BlessBoard | Reports not executed | No | None for a later isolated run | Leave them unrun | No |

Membership, sermons, events, and announcements stay implemented and unverified. Their HTTP and browser tests are planned in `V13_G36_ISOLATED_TEST_READINESS.md` and were not started.
