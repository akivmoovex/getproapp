# V13 G21 — BlessBoard integration

No BlessBoard source file was changed in G01–G18 or in this phase. The approved workflows below were read in the current tree. Production SMS and email stay off.

| Workflow | Evidence | Status |
| --- | --- | --- |
| Church registration and duplicate phone | `platformChurchRegistrationService.js`, BB-REG-07 tests | IMPLEMENTED, HTTP not run |
| Member fields, address, next of kin, branch | `blessBoardStaffAddMemberFormService.js` | IMPLEMENTED, HTTP not run |
| Member CSRF and `members.create` | `hqMembersAdminRoutes.js` | IMPLEMENTED, HTTP not run |
| Portal stays not activated until the separate flow | `membershipPortalLifecycle.js` | IMPLEMENTED, HTTP not run |
| Cross-product theme rejected | `invalid_theme` in `websiteThemeService.js` | IMPLEMENTED, browser not run |
| Add sermon and add event | Public sermon and event templates plus draft normalizers | IMPLEMENTED, browser not run |
| Public announcements and pin order | `audience_key = 'public'` and `is_pinned DESC` | IMPLEMENTED, HTTP not run |
| Uploads | `areMediaUploadsEnabled` is false when the flag is unset | PARTIAL |
| Public pages for the regression fixture | Rows were never inserted | PARTIAL |
| OTP | Expired and already-used codes are rejected. The test provider refuses production | IMPLEMENTED, HTTP not run |

Prayer remains a member-request category. Attendance, giving, broadcasts, and branch administration were not widened.

No source defect with a clear existing contract was found to repair. Gated browser and HTTP files were not executed.
