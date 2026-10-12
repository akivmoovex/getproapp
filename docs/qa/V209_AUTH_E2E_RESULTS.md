# V2.09 Browser Authentication E2E

Environment: V9, local PostgreSQL `getpro_v209_unified_e2e_test`,
`moovex-platform-v7/testing`, Chromium host-resolver mapping to `127.0.0.1`.

| Scenario | Result | Evidence |
|---|---|---|
| ActiveClinic admin login | PASS | Redirected to `/app`; dashboard rendered |
| BlessBoard HQ login | PASS | Redirected to `/hq`; church context rendered |
| Patient fixture creation | PASS | Created through `registerActiveClinicPatient` service |
| Patient portal registration | PASS | POST returned 303 to clinic patient login |
| Patient portal login | PASS | POST returned 303 to clinic patient portal |
| AC/BB browser registration | NOT_RUN | Requires separate fresh-identity workflows |
| Branch/platform auth | BLOCKED | Not executed in this run |

Root cause of the original patient 400: the fixture contained a clinic but no
staff-created patient record. The portal registration flow intentionally matches
an existing patient and then creates the portal identity; it does not create the
clinical patient record.

No production access, database reset, migration, or product-runtime change occurred.
