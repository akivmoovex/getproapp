# Fixture manifest

| Plan | Owner | What it inserts | Cleanup |
|---|---|---|---|
| BlessBoard churches `v13d19-church-a` and `v13d19-church-b` | `applyBlessBoardFixtures` | Platform tenant, church, admin | `cleanupBlessBoardFixtures` deletes those church and organization rows inside a transaction |
| ActiveClinic plan keys `v13d19-clinic-a` and `v13d19-clinic-b` | `applyActiveClinicFixtures` | Calls `provisionHostedAuthQaClinic`, which mints `ac-hqa-` keys | No ActiveClinic row cleanup function. Teardown is `DROP DATABASE` of the owned name only |
| Patient Pat Ient, portal, slot `2026-12-01T09:00:00.000Z` | Plan only | Not inserted by the clinic provisioner | None |
| AC-05 `platform-admin@v13d19.example` and the lower-privilege user | `buildAc05EvidencePlan` | `persisted: false` | None |
| Billing denial role `activeclinic_receptionist` on `/app/billing` | Plan only | Not a stored session | None |

`assertApplyPermitted` throws `V13_FIXTURE_HOLD` until both write flags are `1` and the URL and testing identity pass. The password check refuses `1234` and a live secret. The plan text refuses a production host.

Foundation bootstrap is not approved. A migration is not approved. `postgres` and any name outside the disposable pattern are not drop targets.
