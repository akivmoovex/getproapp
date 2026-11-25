# G151 complete functionality inventory

Classification comes from routes, services, and the executed v13 tests. Specification headings that have no handler are not listed as implemented.

Statuses: `IMPLEMENTED` has a handler and a passing v13 proof. `DISABLED_BY_POLICY` has a handler that refuses the action. `BLOCKED` has a test that fails because a migration or approval is absent. `PARTIAL` has a route whose success path was not driven in this browser suite.

| PRODUCT | MODULE | FEATURE_ID | FEATURE_NAME | USER_ROLE | ENTRY_ROUTE | IMPLEMENTATION_STATUS | BROWSER | HTTP | PERSISTENCE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AC | auth | AC-LOGIN | Staff and admin login | staff | `/login` | IMPLEMENTED | PASS | PASS | session |
| AC | auth | AC-ROLE | Staff cannot open clinic administration | clinician | `/app` | IMPLEMENTED | PASS | PASS | none |
| AC | patients | AC-PAT-CREATE | Staff creates a patient | admin | `/app/patients/new` | IMPLEMENTED | PASS | PASS | SQL count |
| AC | patients | AC-PAT-SEARCH | Search by patient number and reload | admin | `/app/patients` | IMPLEMENTED | PASS | read-back | reload |
| AC | patients | AC-PAT-DUP | Phone search opens the existing chart | admin | `/app/patients/new` | IMPLEMENTED | PASS | n/a | SQL count stays 1 |
| AC | portal | AC-PORTAL | Staff-created patient activates and signs in | patient | `/clinics/:key/patient/register` | IMPLEMENTED | PASS | PASS | SQL count |
| AC | portal | AC-PORTAL-DENY | Unknown public registration inserts nothing | public | patient register | DISABLED_BY_POLICY | PASS | PASS | SQL count |
| AC | portal | AC-WRONG-CLINIC | Other clinic cannot activate the chart | public | other clinic register | IMPLEMENTED | PASS | PASS | SQL count |
| AC | reception | AC-WALKIN | Walk-in stays on the clinic service point | reception | reception queue | IMPLEMENTED | PASS | PASS | queue row |
| AC | reception | AC-QUEUE | New patient appears on the queue | reception | `/app/reception` | IMPLEMENTED | PASS | PASS | queue |
| AC | reception | AC-QUEUE-EXISTING | Existing number does not create a second chart | reception | reception | IMPLEMENTED | PASS | PASS | chart count |
| AC | clinical | AC-VITALS | Heart rate and append-only correction | clinician | encounter vitals | IMPLEMENTED | PASS | PASS | reload 72 and 80 |
| AC | clinical | AC-WORKLIST | Practitioner worklist and start encounter | clinician | `/app/clinical` | IMPLEMENTED | PASS | n/a | encounter URL |
| AC | clinical | AC-SIGN | Sign a consultation note | clinician | encounter consultation sign | PARTIAL | not driven | older service tests | not this cycle |
| AC | pharmacy | AC-DISPENSE | Dispense a stocked prescription | pharmacy | `/app/pharmacy/.../dispense` | PARTIAL | denial only | denial PASS | no stocked dispense |
| AC | lab | AC-LAB | Laboratory queue | lab | lab queue | DISABLED_BY_POLICY for receptionist | PASS denial | PASS denial | no mutation |
| AC | website | AC-WEB | Draft, publish, isolate a section | admin | website editor | IMPLEMENTED | PASS | PASS | public reload |
| AC | website | AC-THEME | Theme publish and cross-product denial | admin | website theme | IMPLEMENTED | PASS | PASS | published theme |
| AC | website | AC-IMAGE | HTTPS image reference | admin | website | IMPLEMENTED | PASS | PASS | reference only |
| AC | website | AC-UPLOAD | Binary media upload | admin | media | DISABLED_BY_POLICY | not enabled | not enabled | not enabled |
| AC | booking | AC-BOOK | Public appointment booking | public | public book | DISABLED_BY_POLICY | PASS | PASS | no booking row |
| AC | appointments | AC-OVERLAP | Same-staff overlap | staff | appointment create | IMPLEMENTED | n/a | PASS two-client | one row |
| AC | appointments | AC-SLOT | Slot capacity | staff | appointment create | BLOCKED | n/a | FAIL | no capacity integer |
| AC | security | AC-05 | Lower-privilege test-database denial | staff | `/admin/settings/test-database` | IMPLEMENTED | PASS | n/a | GET only, no POST |
| BB | members | BB-MEM | Create, search, profile reload, logout | church admin | `/hq/members` | IMPLEMENTED | PASS | PASS | reload |
| BB | members | BB-ACTIVATE | Member portal activation and login | member | member login | IMPLEMENTED | PASS | PASS | session |
| BB | auth | BB-RECOVERY | Recovery hides the testing code | member | recovery | IMPLEMENTED | PASS | PASS | testing outbox |
| BB | auth | BB-CSRF | Missing CSRF is rejected | church admin | member form | IMPLEMENTED | PASS | PASS | no row |
| BB | invite | BB-INVITE | Single-use invite and role limit | staff | invitation | IMPLEMENTED | PASS | PASS | replay denied |
| BB | content | BB-SERMON | Draft private, publish, other church hidden | church admin | sermons | IMPLEMENTED | PASS | PASS | public read |
| BB | content | BB-EVENT | Draft private, publish, other church hidden | church admin | events | IMPLEMENTED | PASS | PASS | public read |
| BB | content | BB-ANN | Public audience, publish, isolation | church admin | announcements | IMPLEMENTED | PASS | PASS | public read |
| BB | website | BB-THEME | Theme publish and clinic theme rejected | church admin | website | IMPLEMENTED | PASS | PASS | published |
| BB | website | BB-MEDIA | Media upload | church admin | announcement attach | DISABLED_BY_POLICY | PASS disabled | PASS | file id empty |
| BB | registration | BB-REG | Duplicate phone keeps one church | public | `/register-church` | IMPLEMENTED | PASS | PASS | one row |
| shared | otp | D14C | BlessBoard OTP challenge row | member | OTP | BLOCKED | gate stays blocked | FAIL | table absent |
| shared | otp | D16 | Platform OTP challenge row | worker | OTP | BLOCKED | n/a | FAIL | table absent |
| shared | email | RESEND | Resend transport | platform | email adapter | IMPLEMENTED mock | n/a | mock PASS | no live send |

Consultation signing and a stocked dispense stay partial. Their routes exist. This cycle did not invent a note-signing fixture or a stock batch. Receptionist denials for lab, pharmacy, billing, documents, and the worklist passed in the browser.
