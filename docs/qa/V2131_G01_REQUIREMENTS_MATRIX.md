# V2.13.1 G01 — requirements matrix

Baseline verified on this machine: branch `V13`, local HEAD `97f31f0791d0493c23b24c8eb026f77102c47dd7`, `origin/V13` the same SHA. Main is `44eafec486a18aeef2777bbcc9683e43f68ebe0d`. The only uncommitted file before this audit was `docs/qa/V2131_GAP_G08_FINAL_REPORT.md`.

## Source documents

| Document | Result |
| --- | --- |
| `Integrated_Healthcare_Management_System_Developer_Brief(1).pdf` | Not in the worktree and not found on this machine. Its requirements are `NOT_VERIFIED`. They were not invented. |
| `ActiveClinic_Blessboard_V2.13_Regression_Test_Report(1).docx` | Not on disk. The 16 bug IDs are taken from the in-repo QA reports that cite that run. |
| `QA_Bug_Report_Compilation_2026-11-16 copy.docx` | Not on disk. Browser notes are taken from `docs/qa/V2131_D26_AC_BROWSER_FIXES.md`, `docs/qa/V2131_D27_BB_BROWSER_FIXES.md`, and `docs/qa/V2131_D28_BROWSER_REGRESSION_MATRIX.md`. |

BlessBoard rows below come from those QA reports, not from the healthcare brief.

## Inventory

| Surface | ActiveClinic | BlessBoard | Shared platform |
| --- | --- | --- | --- |
| HTTP modules | 49 under `src/activeclinic/http` | 100 under `src/blessboard/http` | `src/platform` |
| Services | 113 | 184 | registration, website theme, CSRF |
| EJS screens | 349 under `views/activeclinic` | 354 under `views/blessboard` | `views/platform` |
| Migrations present | 42 in `db/migrations/activeclinic` | 130 in `db/migrations/blessboard` | 47 in `db/migrations/platform` |
| Product version | `2.13.1` via `src/platform/build/applicationBuildInfo.js` | same constant | — |

ActiveClinic route groups that exist in source: access, auth, appointments, billing, cashier, clinical, diagnostics, facilities, patients, patient portal, pharmacy, public booking, reception, rooms, settings, staff, visit summary, website CMS. BlessBoard route groups that exist: announcements, attendance, content admin, giving, HQ members, media upload, public pages, registration, website editor.

No new migration is required for the 16 QA defects. Security, appointment version checks, OTP fail-closed behavior, and tenant or facility scope were not changed by this audit.

## QA-traceable requirements

`PARTIAL` means source and a database-free assertion exist, and the original HTTP or browser acceptance has not been executed. `IMPLEMENTED` is not used, because an unrun acceptance test is not a closed requirement.

| ID | Product | Status | Source | Data | Tests | Missing acceptance |
| --- | --- | --- | --- | --- | --- | --- |
| AC-REG-01 | ActiveClinic | PARTIAL | `src/platform/registration/resolveRegistrationContactIdentity.js`, `src/activeclinic/registration/activeClinicRegistrationAdapter.js` | `platform.identities`, clinic applications | `tests/v13/unit/d13-auth-registration.test.js` | HTTP phone occupancy |
| AC-AUTH-04 | ActiveClinic | PARTIAL | `src/activeclinic/services/activeClinicPasswordRecoveryService.js` | recovery token metadata | safe recovery assertion in `tests/v13/unit/d26-d27-browser-fixes.test.js` | Reset link HTTP |
| AC-WEB-08 | ActiveClinic | PARTIAL | `src/activeclinic/http/activeClinicWebsiteCmsRoutes.js`, `src/activeclinic/website/clinicWebsiteCmsService.js` | `platform.website_content` | `tests/v13/unit/d15-website-sections-themes.test.js` | Section create, edit, publish HTTP |
| AC-WEB-09 | ActiveClinic | PARTIAL | `src/activeclinic/http/activeClinicWebsiteCmsRoutes.js`, `src/platform/website/websiteThemeService.js`, `public/platform/website-theme-gallery.js` | `site.theme_id` draft | `tests/v13/unit/d26-d27-browser-fixes.test.js` | Apply-to-draft in the browser |
| AC-REC-02 | ActiveClinic | PARTIAL | `src/activeclinic/services/loadActiveClinicReceptionScreens.js`, `views/activeclinic/app/reception-walk-in-content.ejs` | `activeclinic.service_points` | `tests/v13/unit/d17-reception-booking.test.js`, D26 unit | Walk-in check-in HTTP |
| AC-REC-03 | ActiveClinic | PARTIAL | `src/activeclinic/http/activeClinicClinicalRoutes.js`, `src/activeclinic/services/activeClinicClinicalService.js`, `views/activeclinic/app/clinical-queue-content.ejs` | `activeclinic.encounters`, vitals tables | `tests/v13/unit/d17-reception-booking.test.js`, D26 unit | Nurse vitals HTTP |
| AC-PUB-01 | ActiveClinic | PARTIAL | `src/activeclinic/http/activeClinicPublicBookingRoutes.js` | `healthcare_organizations.public_booking_enabled` default false | `tests/v13/unit/d17-reception-booking.test.js` | Disabled-page HTTP |
| BB-REG-07 | BlessBoard | PARTIAL | `src/blessboard/services/normalizeRegistrationPhone.js`, `src/blessboard/services/platformChurchRegistrationService.js` | member phone uniqueness | `tests/v13/unit/d13-auth-registration.test.js` | Duplicate church phone HTTP |
| BB-AUTH-04 | BlessBoard | PARTIAL | `src/blessboard/services/otp/otpProviders/index.js`, `views/blessboard/v5/member-auth/recovery-verify.ejs` | OTP rows, test provider | `tests/v13/unit/d13-auth-registration.test.js` | OTP recovery HTTP |
| BB-MEM-01 | BlessBoard | PARTIAL | `src/blessboard/services/blessBoardStaffAddMemberFormService.js`, `views/blessboard/v5/hq/member-add.ejs`, `views/blessboard/v5/hq/member-review.ejs` | `blessboard.members` | `tests/v13/unit/d14-member-registration.test.js` | Add-member HTTP |
| BB-MEM-02 | BlessBoard | PARTIAL | `src/blessboard/http/hqMembersAdminRoutes.js` | none beyond the member draft | `tests/v13/unit/d14-member-registration.test.js` | Missing-token 403 HTTP |
| BB-WEB-08 | BlessBoard | PARTIAL | `src/platform/website/websiteThemeService.js`, `tests/v13/fixtures/v13SyntheticFixtures.js` | theme draft exists; `blessboard.public_pages` and `website_structured_drafts` for the fixture are empty | `tests/v13/unit/d15-website-sections-themes.test.js`, `tests/v13/unit/d25a-fixture-remediation.test.js` | Theme HTTP; fixture page still unwritten |
| BB-WEB-09 | BlessBoard | PARTIAL | `public/blessboard/v5/website-structured-edit.js`, `src/blessboard/services/websiteStructuredDraftService.js`, `views/blessboard/v5/public/sermons.ejs` | `blessboard.website_structured_drafts`, `blessboard.sermons` | `tests/v13/unit/d16-content-management.test.js`, D26 unit | Add-sermon browser |
| BB-WEB-10 | BlessBoard | PARTIAL | `views/blessboard/v5/public/events.ejs`, `websiteStructuredDraftService.js` | `blessboard.events` | `tests/v13/unit/d16-content-management.test.js`, D26 unit | Add-event browser |
| BB-ANN-01 | BlessBoard | PARTIAL | `src/blessboard/services/announcementsService.js`, `src/blessboard/repositories/announcementsRepository.js` | `blessboard.announcements`, `announcement_audiences` | `tests/v13/unit/d16-content-management.test.js` | Public page HTTP |
| BB-ANN-02 | BlessBoard | PARTIAL | `views/blessboard/v5/announcements/admin-form.ejs`, `src/blessboard/http/blessBoardMediaUploadHttp.js` | `blessboard.media_assets` | D16 and D26 unit | Upload still fail-closed until `BLESSBOARD_MEDIA_UPLOADS_ENABLED` |

Enabled public booking and coupons are `DEFERRED` in `docs/activeclinic/ACTIVECLINIC_PRODUCT_GAPS.md` and `docs/qa/V2131_D28_BROWSER_REGRESSION_MATRIX.md`. They are not part of the seven ActiveClinic rows above.

## Explicitly deferred clinical scope

`docs/activeclinic/ACTIVECLINIC_PRODUCT_GAPS.md` already records these as blocked or deferred. This audit does not reopen them: clinical decision support, drug-interaction checking, auto-triage, care plans, cross-facility encounter transfer, structured diagnosis code lookup, and advanced analytics.

## Shared platform

Reusable pieces already in use: `src/platform/http/v5Csrf.js`, `src/platform/registration/resolveRegistrationContactIdentity.js`, `src/platform/website/websiteThemeService.js`, and `src/platform/build/applicationBuildInfo.js`.

Open shared gaps: BlessBoard public-page fixture rows were never inserted; media uploads stay off unless the deployment flag is set; HTTP and browser suites are still `NOT_RUN`.
