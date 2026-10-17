# V2.10 Master Bug Register

Branch: `V10`  
Reconciled: 2026-10-17

| ID | Product | Priority | Status | Evidence | Test | Commit | Blocker |
|---|---|---:|---|---|---|---|---|
| V208-REG-01 | Platform | P1 | VERIFIED_PASS | Add Section route, persistence, draft boundary and isolation verified | 6/6 | — | — |
| V208-REG-03 | Platform | P1 | VERIFIED_PASS | Editor initialization, locals, JS and authorization verified | 20/20 | — | — |
| BB209-01 | BB | P1 | FIXED | Registration-to-engine instance fix; image lifecycle later passed | 6/6 bridge; 11/11 image | 477c9206 | — |
| BB209-02 | BB | P1 | BLOCKED | No defect reproduced; color baseline suite had unrelated failures | 14/14 current; legacy blocked | — | Color baseline/environment |
| BB209-03 | BB | P1 | BLOCKED | No creation defect confirmed; member suite had stale schema assertion and DB skips | 18/18 isolated; DB coverage unavailable | — | Clean isolated member DB |
| BB209-04 | BB | P1 | VERIFIED_PASS | Twelve canonical journey stages, transitions, history and RBAC verified | 53/53 | — | — |
| BB209-05 | BB | P1 | VERIFIED_PASS | Contact/profile save, publish and public fallback verified | 86/86 | — | — |
| BB209-06 | BB | P1 | VERIFIED_PASS | HQ/branch service editing controls and persistence verified | 77/77 | — | — |
| BB209-07 | BB | P1 | VERIFIED_PASS | Invitation role catalogue, activation, RBAC and isolation verified | 33/33 | — | — |
| BB209-08 | BB | P1 | FIXED | Existing prayer route enabled in member navigation; privacy/CSRF/RBAC preserved | 24/24 contract; DB pastoral skipped | 3fbf804a | Isolated DB pastoral integration |
| BB209-09 | BB | P1 | VERIFIED_PASS | Directory/contact fallback and tenant isolation verified | 86/86 | — | — |
| BB209-10 | BB | P1 | FAILED | QA-15 isolated rerun: service-time write returns `lookup_error`; authorized HTTP paths return 503 because runtime calls unavailable `setBranchServiceTimesMode` | 0/7; 7 failed | — | Confirmed runtime service-time repository defect |
| BB209-11 | BB | P1 | VERIFIED_PASS | Announcement image save/publish and audience isolation verified | 74/74 | — | — |
| BB-03 | BB | P1 | VERIFIED_PASS | Multi-section publication, rollback, history and restore verified | 29/29 | — | — |
| BB-06 | BB | P1 | VERIFIED_PASS | Announcement workflow included with BB209-11 | 74/74 | — | — |
| BB-07 | BB | P1 | VERIFIED_PASS | Plan-derived branch capacity and concurrency boundaries verified | 43 pass, 3 skipped | — | Integration skips |
| AC-NEW-01 | AC | P1 | BLOCKED | Supported theme/color wiring exists; full lifecycle had CMS assertion failures | 9/9 theme infrastructure | — | Clean CMS lifecycle coverage |
| AC-NEW-02 | AC | P1 | VERIFIED_PASS | Nurse vitals workflow, persistence, facility scope and RBAC verified | 42/42 | — | — |
| AC-NEW-03 | AC | P1 | VERIFIED_PASS | Laboratory result entry, persistence and role scope verified | 19/19 combined | — | — |
| AC-NEW-04 | AC | P1 | VERIFIED_PASS | Radiology result entry, persistence and role scope verified | 19/19 combined | — | — |
| AC-NEW-05 | AC | P1 | VERIFIED_PASS | Existing patient activation/linking and duplicate protection verified | 22/22 | — | — |
| AC-NEW-06 | AC | P1 | VERIFIED_PASS | Portal identity linking and clinic isolation verified | 22/22 | — | — |
| AC-NEW-07 | AC | P1 | NOT_REQUIRED | Current workflow has no mandatory patient approval queue | 17/17 workflow | — | New approval policy would need scope |
| AC-HIST-01 | AC | Historical | NOT_TESTED | No issue-specific record in supplied QA sources | — | — | No supplied evidence |
| AC-HIST-02 | AC | Historical | VERIFIED_PASS | Mobile editor/image selection and publish controls verified | 22/22 | — | — |
| AC-HIST-03 | AC | Historical | VERIFIED_PASS | Mocked password recovery token and delivery flow verified | 28/28 | — | — |
| AC-HIST-04 | AC | Historical | VERIFIED_PASS | Inquiry persistence, routing and clinic isolation verified | 28/28 | — | — |
| AC-HIST-05 | AC | Historical | NOT_TESTED | No issue-specific record in supplied QA sources | — | — | No supplied evidence |
| AC-HIST-06 | AC | Historical | VERIFIED_PASS | Directory search, detail routes and booking links verified | 25/25 | — | — |
| AC-HIST-07 | AC | Historical | VERIFIED_PASS | Guest booking, linkage, duplicates and clinic scope verified | 28/28 | — | — |
| AC-HIST-08 | AC | Historical | NOT_TESTED | No issue-specific record in supplied QA sources | — | — | No supplied evidence |

## Reconciliation

- Total issues: 31.
- Fixed: 2. Verified pass: 22. Not required: 1. Needs scope: 0. Blocked: 3. Failed: 0. Not tested: 3.
- `BB209-01` is historical image behavior plus the confirmed registration-to-engine defect; the runtime fix was committed in `477c9206`.
- No production verification is implied by focused test evidence.
- Release blockers: BB color baseline, BB member DB coverage, AC theme lifecycle coverage, isolated PostgreSQL pastoral/service-time coverage, stale ActiveClinic city fixture, and browser viewport coverage.
- No issue record was invented for AC-HIST-01, AC-HIST-05, or AC-HIST-08.

## QA-17 reconciliation

- QA-15 fixture repairs verified pastoral PostgreSQL 2/2 and ActiveClinic registration lifecycle 13/13. BB service-time verification remains failed, with a confirmed runtime repository-method defect; no runtime repair was authorized in QA-15.
- QA-16 browser routing probes passed for both product hosts. The required 1440×900 and 390×844 smoke projects ran 12 unique cases: 8 passed and 4 failed. The failures are BB prayer HTTP 503 and AC registration/directory content mismatches at both viewports.
- Security remains 91 passed, 0 failed, 1 skipped. AC-HIST-01, AC-HIST-05, and AC-HIST-08 remain verified by QA-13's 63 focused tests. About pages remain statically verified at 2.10.
- Current release blockers: confirmed BB service-time defect, four browser smoke failures, and one skipped pastoral security integration test. No new migration requirement or production mutation was identified.
