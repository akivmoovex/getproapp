# V2.04 Final Engineering Defect Closure

**Candidate status:** local clean candidate — **do not deploy until hosted retest of RB-QA-01 / RB-QA-02**.  
**Preserved packs:** Real Responsive Editor Viewport (12/12), AC Catalogue GUI shell fix (10/10).

## Defect table

| DEFECT | ROOT_CAUSE | FILES_CHANGED | TESTS | STATUS | MANUAL_RETEST_REQUIRED |
|--------|------------|---------------|-------|--------|------------------------|
| AC Website Admin blank/disturbed pages | Shared Clinic Editor chrome: `ac-mw-editor` + `ac-mw-nav` flex collision hid/pushed content | `views/activeclinic/partials/website-cms-nav.ejs`, `public/activeclinic/website-cms.css` (preserved) + blank-page tests | `v2-04-ac-website-admin-blank-page.test.js`, catalogue shell tests | FIXED (shared root) | YES — hosted `/app/settings/website/*` |
| AC historical version preview blank | `renderActiveClinicHistorical` never built Stitch `websitePresentation` | `src/platform/website/governanceVersionPreview.js` | `v2-04-final-engineering-defect-pack.test.js` | FIXED | YES — `/clinics/{key}/website/versions/{id}` |
| BB Members 503 | List queries require `member_number` / `portal_access_status`; undefined column → swallowed LOOKUP_ERROR → 503 | `memberIdentityRepository.js` (retry without V2.04 cols), `memberRegistrationService.js` (log) | contract + members schema suite | FIXED (code resilient); prefer apply BB migrations 119–120 on TESTING | YES — T-M02–T-M15 |
| BB publish `not_ready` | Readiness ignored engine `contact.details.*`; checklist cascaded global `readyOk`; service_times ignored `layout_metadata.entries` | `churchWebsitePublishService.js`, `websitePublicationValidationService.js`, publish test setup | `blessboard-church-website-publish.test.js` | FIXED | YES — full BB lifecycle |
| AC public 403 Clinic unavailable | Content publish succeeded without guaranteeing `setClinicWebsiteAvailability` / ignored failure | `activeClinicWebsiteRoutes.js` | defect-pack contract + availability suite | FIXED | YES — AC SAVE→PUBLISH→PUBLIC VERIFY |

## Regression packs run (local)

| Pack | Result |
|------|--------|
| Real Responsive Editor Viewport | PASS (13 assertions / 12 labeled scenarios + wiring) |
| AC Catalogue GUI shell | PASS |
| AC blank-page matrix | PASS |
| Final defect-pack contracts | PASS |
| BlessBoard church website publish | PASS (5/5) |

## Notes

- Members: apply BlessBoard migrations **119** / **120** on TESTING if not already applied; code now degrades gracefully if columns are missing.
- Cells remain deferred per V2.04 decision (RB-QA-01).
- True-stale / RB-QA-04 / DISABLED_COUNTRY_POST not reopened.
- No deploy in this pack.

## Candidate contents

1. Responsive iframe editor fix  
2. AC catalogue GUI fix  
3. AC blank admin route shared-shell fix + tests  
4. Historical version preview Stitch wiring  
5. BB Members 503 resilience + logging  
6. BB publish readiness alignment  
7. AC public go-live on publish  
8. Automated regression tests + this closure doc  
