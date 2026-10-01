# BlessBoard Feature Catalog

**Mode:** READ-ONLY catalog synthesis (no application code changes).  
**Date:** 2026-10-02  
**Product:** BlessBoard  
**Authority:** Existing Cursor-generated audits/specs first; deferred ideas are IMPLEMENTED=NO (not claimed as shipped).  
**Comparison:** Not compared to other products in this document.

## Sources
- `docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md`
- BlessBoard V2.04 Canonical Feature Specification FINAL (FR register)
- `docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md`
- `docs/qa/V2_04_FEATURE_TEST_COVERAGE_AUDIT.md`
- `docs/releases/V2_04_RELEASE_NOTES.md`
- `docs/product/V2_04_PRODUCT_DECISION_REGISTER.md`
- `docs/qa/V2_04_RECENT_BUG_FIX_AUDIT.md`

## Record schema

Each feature: FEATURE_ID · FEATURE_NAME · MODULE · PRODUCT · USER_BEHAVIOR · IMPLEMENTED · PRIMARY_ROUTE_OR_AREA · AUTOMATED_TEST · SOURCE_DOC · NOTES

**Totals:** FEATURES=84 · FULL(YES)=69 · PARTIAL=2 · NOT_IMPLEMENTED=13 · AUTOMATED_TESTED(YES)=60

## Registration / Authentication

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| BB-REG-01 | Church registration (instant free / enquiry) | Register church; Foundation/Growth provision; Network enquiry | YES | /register-church | YES | docs/releases/V2_04_RELEASE_NOTES.md | Instant free default; BB-PROVISION-01 |
| BB-REG-02 | Registration geography (country/city) | Country + city autocomplete on church registration | YES | /register-church | YES | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md |  |
| BB-REG-03 | Administrator password with live rules | Set admin password with shared live rules | YES | /register-church?step=administrator | YES | docs/qa/V2_04_RECENT_BUG_FIX_AUDIT.md | Shared GpRegistrationPasswordRules |
| BB-REG-04 | Apex / staff login | Login to BlessBoard session | YES | /login | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md |  |
| BB-REG-05 | Member first activation | Activate with Full Name + Phone + Church ID; email optional | YES | member auth M13–M19 | YES | BlessBoard V2.04 Canonical Feature Specification FINAL (FR register) | FR-03 |
| BB-REG-06 | Member returning login | Login with Church ID + password | YES | member login | YES | BlessBoard V2.04 Canonical Feature Specification FINAL (FR register) | FR-05 |
| BB-REG-07 | Member password policy | Enforce member portal password policy | YES | member auth validators | YES | BlessBoard V2.04 Canonical Feature Specification FINAL (FR register) | FR-04 |
| BB-REG-08 | Member password recovery (verified contact) | Recover via verified phone OTP | YES | forgot-password / OTP | PARTIAL | BlessBoard V2.04 Canonical Feature Specification FINAL (FR register) | FR-06; PD: phone OTP only |
| BB-REG-09 | Lost Church ID guidance (no public auto recovery) | See admin-assisted guidance only | YES | auth UX | YES | BlessBoard V2.04 Canonical Feature Specification FINAL (FR register) | FR-07 |
| BB-REG-10 | Public member registration request | Submit membership interest from public register | YES | /register | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md | Not self-create membership |

## Organization / Church Setup

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| BB-ORG-01 | Church organization provisioning | Provisioned org + HQ/branch workspace after registration | YES | provisioning | YES | docs/releases/V2_04_RELEASE_NOTES.md | BB-PROVISION-01 |
| BB-ORG-02 | HQ dashboard | HQ overview dashboard | YES | /hq | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md |  |
| BB-ORG-03 | HQ account / settings | HQ account and settings pages | YES | /hq/account · /hq/settings | PARTIAL | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md | MISSING_STITCH |
| BB-ORG-04 | Apex marketing / pricing / directory | Public apex home, features, pricing, directory | YES | / · /pricing · /directory | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md |  |
| BB-ORG-05 | Create organization GUI (Platform Admin) | GUI to create org in PA | NO | /admin/organizations/new | NO | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md | BLOCKED; CLI-only |

## Branches

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| BB-BR-01 | Branch admin dashboard | Operate branch workspace | YES | /branch-admin | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md |  |
| BB-BR-02 | HQ branch registry | List branches; Foundation max 1 | YES | /hq/branches | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md |  |
| BB-BR-03 | Multi-branch HQ (Growth) | Manage unlimited branches on Growth | YES | /hq/* · /b/:branchKey | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md |  |
| BB-BR-04 | Official branch transfer (admin) | Admin-controlled official branch transfer; history preserved | PARTIAL | member domain | PARTIAL | BlessBoard V2.04 Canonical Feature Specification FINAL (FR register) | BR-08 FOUNDATION |
| BB-BR-05 | Cross-church membership transfer UX | Complete cross-church transfer product UX | NO | — | NO | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md | DEFERRED non-goal |

## Website / Website Editor

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| BB-WEB-01 | Website Management Hub (HQ) | HQ website status, tiles, Edit/Preview/Publish | YES | /hq/website | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md |  |
| BB-WEB-02 | Canonical visual website editor | Inline edit on shared WE01 after engine cutover | YES | public church edit path | YES | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md | BB-WEBSITE-ENGINE |
| BB-WEB-03 | Branch website / content admin | Edit website content from branch admin | YES | /branch-admin/website · content | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md |  |
| BB-WEB-04 | Draft / preview / publish / unpublish | Lifecycle on platform engines | YES | website lifecycle | YES | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md |  |
| BB-WEB-05 | Public church website pages | Public home/about/leadership/ministries/events/sermons/giving/contact | YES | tenant public routes | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md |  |
| BB-WEB-06 | Post-registration Edit Website CTA | Success CTA opens canonical editor (not HQ only) | YES | /register-church/success | YES | docs/qa/V2_04_RECENT_BUG_FIX_AUDIT.md | BB-REG-WEB-01 |
| BB-WEB-07 | Initial unpublished changes = 0 | Fresh provision unpublished count 0 | YES | engine seed baseline | YES | docs/qa/V2_04_RECENT_BUG_FIX_AUDIT.md | AC-INITIAL-DIRTY shared baseline |

## Members

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| BB-MEM-01 | Authorized membership creation | Staff create membership; no self-create | YES | members admin M01–M05 | YES | BlessBoard V2.04 Canonical Feature Specification FINAL (FR register) | FR-01 |
| BB-MEM-02 | Church ID management | Unique per church_id; member cannot edit | YES | manageChurchId M08 | YES | BlessBoard V2.04 Canonical Feature Specification FINAL (FR register) | FR-02; PD-V204-BB-01 |
| BB-MEM-03 | Members directory / search | Search by Church ID/name/phone in scope | YES | M01 directory | PARTIAL | docs/qa/V2_04_FEATURE_TEST_COVERAGE_AUDIT.md | FR-20; search assertions weak |
| BB-MEM-04 | Membership vs portal access statuses | Separate membership status from portal access | YES | domain + admin profile | YES | BlessBoard V2.04 Canonical Feature Specification FINAL (FR register) | FR-10 / BR-05 |
| BB-MEM-05 | Block / unblock portal access | Block/unblock without deleting membership/history | YES | setPortalAccessStatus M10 | YES | BlessBoard V2.04 Canonical Feature Specification FINAL (FR register) | FR-10 |
| BB-MEM-06 | Branch verification queue | Review registration requests | YES | /branch-admin/registrations | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md |  |
| BB-MEM-07 | HQ members oversight (Growth) | Cross-branch members oversight | YES | /hq/members | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md |  |
| BB-MEM-08 | Duplicate warn; never auto-merge | Warn likely duplicates; no auto-merge | YES | creation flow | YES | docs/qa/V2_04_FEATURE_TEST_COVERAGE_AUDIT.md | BB-NO-AUTOMERGE |
| BB-MEM-09 | CSV bulk import UI | Bulk import members via CSV UI | NO | — | NO | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md | DR-48 DEFERRED |
| BB-MEM-10 | Sophisticated member merge workflow | Full duplicate merge workflow | NO | — | NO | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md | DR-15 DEFERRED |

## Leadership

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| BB-LEAD-01 | Public leadership page | Public leadership listings | YES | /leadership | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md |  |
| BB-LEAD-02 | Leader portal (dedicated role) | Dedicated leader portal experience | NO | — | NO | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md | NOT_IN_SCOPE V5 |
| BB-LEAD-03 | Dual member + admin experience | Leader/admin also uses Member Portal | YES | member shell + BA/HQ | PARTIAL | BlessBoard V2.04 Canonical Feature Specification FINAL (FR register) | FR-12; dual-path tests weak |

## Ministries / Departments

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| BB-MIN-01 | Public ministries | Browse public ministries | YES | /ministries | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md |  |
| BB-MIN-02 | Branch ministries admin | Manage ministry content entities | YES | /branch-admin/content/ministries | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md |  |
| BB-MIN-03 | Member ministries participation | Member views ministries participation | YES | /member/ministries | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md |  |
| BB-MIN-04 | Department join requests | Submit/review ministry-department join requests | YES | join request + R01–R04 | YES | BlessBoard V2.04 Canonical Feature Specification FINAL (FR register) | FR-15/16 |
| BB-MIN-05 | Departments admin schema product | Full departments admin product | NO | — | NO | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md | MISSING_BACKEND |

## Events

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| BB-EVT-01 | Public events list | Browse public events | YES | /events | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md |  |
| BB-EVT-02 | Branch events admin | Manage event content | YES | /branch-admin/content/events | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md |  |
| BB-EVT-03 | Member events | Member views events | YES | /member/events | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md |  |

## Sermons

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| BB-SERM-01 | Public sermons | Browse public sermons | YES | /sermons | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md | No series schema |
| BB-SERM-02 | Branch sermons admin | Manage sermon content | YES | /branch-admin/content/sermons | PARTIAL | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md | MISSING_STITCH |

## Announcements

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| BB-ANN-01 | Branch announcements admin | Create/edit announcements; preview | YES | /branch-admin/announcements* | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md |  |
| BB-ANN-02 | Member announcements | Member reads announcements | YES | /member/announcements | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md |  |
| BB-ANN-03 | HQ announcements / broadcast | HQ announcements (no schedule/SMS) | YES | /hq/announcements | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md | Scheduled broadcast DEFERRED |

## Giving

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| BB-GIVE-01 | Public giving info | View giving instructions (no payments) | YES | /giving | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md |  |
| BB-GIVE-02 | Member giving info | Member instructional giving page | YES | /member/giving | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md |  |
| BB-GIVE-03 | Branch giving summaries | Manual giving aggregates | YES | /branch-admin/giving* | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md |  |
| BB-GIVE-04 | HQ advanced giving report (Growth) | Advanced giving report gated by advanced_reports | YES | /hq/reports/giving | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md | FG-Q12 |
| BB-GIVE-05 | Online payments / banking settings | Collect online payments / banking QR settings | NO | — | NO | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md | NOT_IN_SCOPE / no payments |

## Attendance

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| BB-ATT-01 | Manual attendance recording | Authorized scoped manual attendance | YES | attendance A01–A07 | YES | BlessBoard V2.04 Canonical Feature Specification FINAL (FR register) | FR-13 |
| BB-ATT-02 | QR attendance (time-limited) | Event QR check-in; duplicate prevention | YES | QR check-in | YES | BlessBoard V2.04 Canonical Feature Specification FINAL (FR register) | FR-14 |
| BB-ATT-03 | Attendance correction audit | Correct attendance with reason; audit trail | YES | A12–A14 | YES | BlessBoard V2.04 Canonical Feature Specification FINAL (FR register) | FR-19 |
| BB-ATT-04 | Branch attendance aggregates | View attendance aggregates | YES | /branch-admin/attendance* | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md |  |
| BB-ATT-05 | HQ advanced attendance report | Advanced attendance report (Growth) | YES | /hq/reports/attendance | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md |  |
| BB-ATT-06 | Staff-scans-member-QR mode | Staff scans member QR attendance mode | NO | — | NO | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md | DR-35 DEFERRED |
| BB-ATT-07 | Offline attendance | Offline attendance capture product | NO | — | NO | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md | DEFERRED |

## Requests / Approvals

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| BB-REQ-01 | Member requests submit/status | Submit requests; track status | YES | /member/requests* | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md | FR-15 |
| BB-REQ-02 | Branch requests queue | Review/approve/reject scoped requests | YES | /branch-admin/requests* | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md | FR-16 |
| BB-REQ-03 | No self-approve | Requester cannot self-approve | YES | requestApproval | YES | docs/qa/V2_04_FEATURE_TEST_COVERAGE_AUDIT.md | AC-22 |
| BB-REQ-04 | Member forms & resources | Access forms and resources | YES | /member/forms · /resources | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md |  |
| BB-REQ-05 | Dedicated prayer-request route | Dedicated /member/prayer-request | NO | — | NO | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md | Use requests category=prayer; MISSING_BACKEND |
| BB-REQ-06 | Full Visitor journey | Complete visitor journey product | NO | — | NO | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md | DR-50 DEFERRED |

## Roles / RBAC

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| BB-RBAC-01 | Multiple admins via permissions | Permission-based multi-admin coexistence | YES | members.* catalogue | PARTIAL | BlessBoard V2.04 Canonical Feature Specification FINAL (FR register) | FR-11; multi-admin scenario weak |
| BB-RBAC-02 | HQ roles page (fixed roles) | View/manage fixed HQ roles | YES | /hq/roles | PARTIAL | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md | Templates MISSING |
| BB-RBAC-03 | Member privacy (no other-member data) | Ordinary member cannot see other members' private data | YES | portal scoping | PARTIAL | docs/qa/V2_04_FEATURE_TEST_COVERAGE_AUDIT.md | AC-23 weak tests |
| BB-RBAC-04 | Ordinary member document upload disabled | Member cannot upload documents | YES | portal restriction | NO | docs/qa/V2_04_FEATURE_TEST_COVERAGE_AUDIT.md | FR-18 UNTESTED |

## Member Portal

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| BB-PORTAL-01 | Member homepage | Church-specific member environment | YES | /member | YES | BlessBoard V2.04 Canonical Feature Specification FINAL (FR register) | FR-08 |
| BB-PORTAL-02 | Member profile edits | Edit permitted fields; Church ID/branch protected | YES | /member/profile | YES | BlessBoard V2.04 Canonical Feature Specification FINAL (FR register) | FR-09 |
| BB-PORTAL-03 | Phone verification for recovery contact | New recovery phone must be verified | PARTIAL | phone verify flows | PARTIAL | docs/qa/V2_04_FEATURE_TEST_COVERAGE_AUDIT.md | AC-11 partial |
| BB-PORTAL-04 | Select Church tenant bind | Directory → Select Church binds multi-membership session | YES | directory / select church | YES | docs/product/V2_04_PRODUCT_DECISION_REGISTER.md | PD-V204-BB-02 |

## Reporting / Admin

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| BB-RPT-01 | HQ basic reports hub | Basic reports hub | YES | /hq/reports | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md |  |
| BB-RPT-02 | HQ audit trail | View audit trail | YES | /hq/audit | YES | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md |  |
| BB-RPT-03 | Sensitive change audit (membership/attendance/approvals) | Auditable sensitive changes | YES | audit timelines | YES | BlessBoard V2.04 Canonical Feature Specification FINAL (FR register) | FR-19 |
| BB-RPT-04 | Branch basic reports UI | Branch monthly/basic reports UI | NO | — | NO | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md | MISSING_BACKEND |
| BB-RPT-05 | Scheduled reports / broadcasts | Scheduled report/broadcast product | NO | — | NO | docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md | DEFERRED |

## Footer

PRODUCT=BlessBoard
FEATURE_COUNT=84
FULL=69
PARTIAL=2
NOT_IMPLEMENTED=13
AUTOMATED_TESTED=60
