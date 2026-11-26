# V2134 G300 hosted QA preflight

**HOSTED_QA_DEPLOYMENT=NOT_PERFORMED** in this cycle.

| Item | Observed / required |
| --- | --- |
| AC URL | https://activeclinic.pronline.org |
| BB URL | https://blessboard.pronline.org |
| Read-only hosted SHA (2026-11-26) | `e820951d3c77` (G271 tip at probe time) |
| Intended tip after G300 push | `git rev-parse origin/V13` after push |
| Environment | `testing` / `moovex-platform-testing` |
| Identity | `moovex-platform-v7` expected |
| DB | Testing only; no production; no reset |
| Schema | Do not apply 048/Community without approval |
| OTP | Keep production blocked; no live email without approval |
| Community | posting disabled |
| Public booking | disabled |
| Backup | Required before any schema change |
| Rollback | Redeploy prior known-good SHA |
| Post-deploy | About 2.13.4; G270 acceptance guide; especially SOAP print identity + lab components |

Requires explicit owner signature before deploy/restart/env/schema changes.
