# V2.13.2 G121 — QA report traceability

Source: ActiveClinic bug-fix report, 23 November 2026, version 2.13.1 on https://activeclinic.pronline.org. The docx was not in this worktree. The 15 scenarios below are the ones supplied for this run. They are not the historical 16 regression IDs.

| QA_ID | QA_EXPECTED | QA_ACTUAL | PRODUCT_CONTRACT | IMPLEMENTATION_STATUS | VERIFICATION_STATUS | NEXT_ACTION |
|---|---|---|---|---|---|---|
| AC-FU-PORTAL-01 | Existing patient activates and signs in | Account absent; duplicate rejection | Staff-created patient; portal link must not insert a second patient | Existing phone/name match links one patient | Contract only | Hosted retest |
| AC-FU-PORTAL-02 | Public registration matches a new patient | Cannot match details | Unknown public identity must not create a patient | Copy explains staff registration | POLICY_MISMATCH | Product decision |
| AC-FU-PORTAL-03 | Public booking | Blocked | Public booking disabled | Disabled | DISABLED_BY_POLICY | Do not enable |
| AC-FU-PORTAL-04 | Contact recovery completes | Recovery did not complete | Production OTP excluded | Testing reset remains separate | EXCLUDED | Do not create otp_challenges |
| AC-FU-WEB-01 | Edit existing sections | PASS | Draft edit stays authorized | Unchanged | Prior browser pass | Preserve |
| AC-FU-WEB-02 | New text/images appear after publish | New content absent | Publish existing draft text; do not enable production uploads | Prior heading publish remains | Image upload not executed | Hosted retest for new text |
| AC-FU-WEB-03 | Theme draft, publish, public | PASS | Theme publish unchanged | Unchanged | Prior browser pass | Preserve |
| AC-FU-REC-01 | Register patient | PASS | Staff registration | Unchanged | Prior browser pass | Preserve |
| AC-FU-REC-02 | Walk-in plus service | PASS | Facility-scoped service | Unchanged | Prior browser pass | Preserve |
| AC-FU-REC-03 | New patient queue | PASS | Queue transition | Unchanged | Prior browser pass | Preserve |
| AC-FU-REC-04 | Existing patient by Patient ID | PASS | No duplicate patient | Unchanged | Prior browser pass | Preserve |
| AC-FU-REC-05 | Queue visible to clinical staff | PASS | Same facility | Unchanged | Prior browser pass | Preserve |
| AC-FU-CLIN-01 | Clinician views queue | PASS | Clinical role | Unchanged | Prior browser pass | Preserve |
| AC-FU-CLIN-02 | Save vitals | PASS | Immutable insert | Unchanged | Prior browser pass | Preserve |
| AC-FU-CLIN-03 | Correct saved vitals with audit | No correction option | New row; original kept | Correction route and form added | Unit/contract only | Persistence retest on G78 |

Source files: `activeClinicPatientPortalRegistrationService.js`, `activeClinicPatientPortalRoutes.js`, `activeClinicClinicalService.js`, `vital-signs-entry-content.ejs`, `activeClinicAppointmentService.js`.
