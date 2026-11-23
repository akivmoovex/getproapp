# V13 G78 synthetic fixtures

Fixtures were written only in `getpro_v13_e2e_g78d2301`. They use the existing synthetic password from `tests/v13/fixtures/v13SyntheticFixtures.js`. No production credential, patient record, payment provider, or SMS provider was used.

## ActiveClinic

| Tenant | Organization key | Patients | Encounters |
| --- | --- | --- | --- |
| Clinic A | `v13-d19-clinic-a` | 1 | 1 |
| Clinic B | `v13-d19-clinic-b` | 1 | 0 |

Each clinic has its own facility. The encounter's facility belongs to the same organisation. Zero encounters cross organisations.

Staff roles present across the two clinics: receptionist 4, nurse 6, clinician 2, laboratory technician 2, pharmacist 2, billing officer 2. The higher receptionist and nurse counts include the administrator and clinician role assignments made by the existing clinic helper.

Clinic A also has a non-public consultation service, one synthetic laboratory request with test code `G78-SYNTHETIC` and no reference range, and one medication catalogue row `G78 synthetic tablet`. `laboratory_reference_rules` has 0 rows. Public booking is enabled on 0 clinics.

## BlessBoard

| Church | Public pages | Members |
| --- | --- | --- |
| `v13d19-church-a` | 10 | 1 |
| `v13d19-church-b` | 0 | 0 |

Church A owns every public page created for it. The home page has a draft `plain_text` section. A cross-church event that reused Church A's branch was rejected. Church A also has one draft sermon, one draft event, one draft public announcement, and a BlessBoard theme draft. An ActiveClinic theme was rejected for that church.

No media file was uploaded. `BLESSBOARD_MEDIA_UPLOADS_ENABLED` was not set. The fixture process set `BLESSBOARD_OTP_PROVIDER=test` and did not select a production provider.

## Isolation checks

- Two church organisations and two clinic organisations.
- Patient ids are not shared between the clinics.
- Encounter facility organisation matches the encounter organisation.
- Public pages for Church A do not belong to another church organisation.
- Reference-rule table remains empty.
