# BlessBoard functionality

The BlessBoard HTTP regressions passed, including theme publish and the disabled media upload. Two browser runs each passed 19 of 23. Member login on the apex, the staff invitation, and member OTP recovery remain open. Production media upload stays off.

Product version 2.13.1. The healthcare brief is not a BlessBoard specification. Statuses match the G35 register. G65–G82 did not enable media uploads and did not insert public-page rows.

Shared fields: tenant scope is the church organisation; branch scope is the selected branch. Implementation status stays the G35 class. G88 HTTP passed BB-01 through BB-05, BB-24, and the disabled-upload assertion for BB-ANN-02. Public sermon, event, and announcement pages still render the unpublished-website setup page. `BLESSBOARD_MEDIA_UPLOADS_ENABLED` stays unset.

### BB-01 Church registration

FEATURE_ID BB-01. MODULE registration. PURPOSE create a church tenant. ROLES registering administrator. UI church registration. WORKFLOW submit the church and administrator. INPUTS church identity and phone. VALIDATION duplicate phone follows the existing reuse and conflict rules. SERVICES registration identity resolver. TABLES organisations and churches. PERMISSIONS public registration then admin. AUDIT registration. DEPENDENCIES platform identity. ERRORS `reject_identity_conflict` and `password_verified_reuse` stay as implemented. SECURITY no credential is logged. TESTS registration contracts. STATUS `IMPLEMENTED_UNVERIFIED`. ACCEPTANCE a mismatched password on a duplicate phone is denied. NEXT isolated AC-REG and BB-REG HTTP, which are `NOT_RUN`.

### BB-02 HQ and branches

PURPOSE administer the church and its branches. ROLES HQ admin. UI `/hq` navigation. WORKFLOW open HQ, then a branch. INPUTS branch key. VALIDATION branch scope checks. SERVICES church admin services. TABLES churches and branches. PERMISSIONS HQ gate. AUDIT admin changes. DEPENDENCIES BB-01. ERRORS apex hosts are rejected by `rejectApex`. SECURITY a branch admin does not gain HQ. TESTS branch contracts. STATUS `IMPLEMENTED_UNVERIFIED`. ACCEPTANCE branch data stays on that church. NEXT isolated HTTP.

### BB-03 Member registration

PURPOSE add a member. ROLES HQ staff with create permission. UI `/hq/members/new`. WORKFLOW enter the required fields and post one CSRF token. INPUTS name, phone, address line 1, marital status, next of kin, relationship, kin phone. Email is optional. VALIDATION missing required values are rejected and entered values are kept. SERVICES member form parser and `resolveBlessBoardFormPhone`. TABLES members. PERMISSIONS HQ create. AUDIT create. DEPENDENCIES BB-02. ERRORS phone required through the kin resolver. SECURITY portal is not activated by create. TESTS member contracts. STATUS `IMPLEMENTED_UNVERIFIED`. ACCEPTANCE the member exists and the portal stays not activated. NEXT isolated BB-MEM-01.

### BB-04 Directory and lifecycle

PURPOSE find and update members. ROLES HQ staff. UI `/hq/members` and `/hq/members/:id`. WORKFLOW search, open, and edit. INPUTS member id and edited fields. VALIDATION duplicate review stays in the existing match route. SERVICES member admin. TABLES members. PERMISSIONS HQ gate. AUDIT edit. DEPENDENCIES BB-03. ERRORS unknown id is not found. SECURITY another church’s member is not listed. TESTS directory contracts. STATUS `IMPLEMENTED_UNVERIFIED`. ACCEPTANCE the directory is church-scoped. NEXT isolated HTTP.

### BB-05 Portal activation

PURPOSE let a member set a portal password later. ROLES HQ for invitation; member for accept. UI invitation and `/invite/accept`. WORKFLOW create does not activate. A separate invitation does. INPUTS invitation token. VALIDATION existing accept flow. SERVICES invitation service. TABLES invitations and portal users. PERMISSIONS invitation permission. AUDIT activation. DEPENDENCIES BB-03. ERRORS a missing token does not activate. SECURITY activation is separate from create. TESTS invitation contracts. STATUS `IMPLEMENTED_UNVERIFIED`. ACCEPTANCE a new member is not signed in automatically. NEXT isolated BB-06 member activation HTTP, which is `NOT_RUN`.

### BB-06 Public website

PURPOSE render the church’s public pages. ROLES public visitor; editor for drafts. UI public site and website editor. WORKFLOW a section is stored only when a public page row exists. INPUTS section type `plain_text` and church id. VALIDATION `buildBlessBoardWebsiteSectionFixture` refuses a section without a church id. SERVICES website section service. TABLES `public_pages`, which are 0 in the isolated fixture record. PERMISSIONS public read; editor for drafts. AUDIT publish. DEPENDENCIES an authorized fixture write. ERRORS a missing page cannot be themed. SECURITY church id is bound on the section write. TESTS website contracts. STATUS `PARTIAL`. ACCEPTANCE a published page renders for that church only. LIMITATION rows were not inserted. NEXT do not insert them until fixture writes are authorized.

### BB-07 Themes, drafts, publish

PURPOSE choose a church theme, save a draft, and publish it. ROLES website editor. UI website theme and content editor. WORKFLOW save draft, preview, then publish. INPUTS theme key. VALIDATION a theme from another product is `invalid_theme`. Draft save does not publish. SERVICES `websiteThemeService`. TABLES theme and draft rows. PERMISSIONS website edit. AUDIT publish. DEPENDENCIES BB-06 for a live page. ERRORS CSRF mismatch is 403. SECURITY one shell token. TESTS theme contracts. STATUS `IMPLEMENTED_UNVERIFIED`. ACCEPTANCE the published theme is the one selected for this product. NEXT isolated browser, still `NOT_RUN`.

### BB-08 Sermons

PURPOSE create and publish a sermon. ROLES content editor. UI website structured content. WORKFLOW Add sermon opens a create dialog. The payload stores `preachedAt` and summary. INPUTS title, date, summary. VALIDATION `normalizeStructuredSermonPayload`. SERVICES `websiteStructuredDraftService`. TABLES structured drafts. PERMISSIONS content edit. AUDIT publish. DEPENDENCIES BB-07. ERRORS a date-only form is mapped. It is not left in an unused field. SECURITY drafts are not public until published. TESTS sermon payload unit tests. STATUS `IMPLEMENTED_UNVERIFIED`. ACCEPTANCE the public page reads `preachedAt`. NEXT isolated browser BB-WEB-09.

### BB-09 Events

PURPOSE create and publish an event. ROLES content editor. UI website structured content. WORKFLOW Add event is a button and stores `startsAt`, `endsAt`, and location. INPUTS those fields. VALIDATION `normalizeStructuredEventPayload`. SERVICES the same draft service. TABLES structured drafts. PERMISSIONS content edit. AUDIT publish. DEPENDENCIES BB-07. ERRORS ends at must follow starts at in the unit test. SECURITY unpublished events stay off the public list. TESTS event payload tests. STATUS `IMPLEMENTED_UNVERIFIED`. ACCEPTANCE the event time survives a save. NEXT isolated browser BB-WEB-10.

### BB-10 Announcements

PURPOSE publish a notice. ROLES content editor. UI `/hq/announcements`. WORKFLOW create, choose an audience, and publish. INPUTS title, body, audience, window. VALIDATION the public list requires `announcement_audiences.audience_key = 'public'`. SERVICES announcement service. TABLES announcements and audiences. PERMISSIONS announcement edit. AUDIT publish. DEPENDENCIES BB-02. ERRORS a draft is absent from the public query. SECURITY another church’s notice is excluded. TESTS announcement contracts. STATUS `IMPLEMENTED_UNVERIFIED`. ACCEPTANCE the success link includes the announcement id when the audience is public. NEXT isolated BB-ANN-01.

### BB-11 Media

PURPOSE attach an image when the deployment allows it. ROLES content editor. UI announcement upload. WORKFLOW the request is refused while the switch is off, and the UI names the reason. INPUTS file. VALIDATION type and the existing 5 MiB BlessBoard limit. SERVICES `mediaUploadService` and `areMediaUploadsEnabled`. TABLES media rows only after an authorized enable. PERMISSIONS content edit plus the switch. AUDIT upload attempt reason. DEPENDENCIES `BLESSBOARD_MEDIA_UPLOADS_ENABLED`. ERRORS disabled, too large, CSRF, or unsupported type. SECURITY default is disabled. No production bucket was connected. TESTS media switch contract, including the G39 case. STATUS `PARTIAL`. ACCEPTANCE a disabled deployment does not store a file. NEXT leave the flag unset.

### BB-12 Contact and join

PURPOSE accept a public contact or join request. ROLES public visitor; HQ to read it. UI public contact form. WORKFLOW post the request. INPUTS name and message. VALIDATION existing form checks. SERVICES contact service. TABLES inquiries. PERMISSIONS public post; HQ read. AUDIT inquiry. DEPENDENCIES BB-06 for the public page. ERRORS invalid input is rejected. SECURITY the request does not create a member portal. TESTS contact contracts. STATUS `IMPLEMENTED_UNVERIFIED`. ACCEPTANCE the inquiry is stored for that church. NEXT isolated HTTP.

### BB-13 Prayer

PURPOSE record a prayer request as a member-request category. ROLES member or HQ, through the existing request path. UI the existing request form. WORKFLOW choose that category. INPUTS request text. VALIDATION existing request validation. SERVICES member request service. TABLES requests. PERMISSIONS the existing request permission. AUDIT request. DEPENDENCIES BB-03. ERRORS n/a beyond the existing form. SECURITY this is not a new module. TESTS request category contracts. STATUS `PARTIAL`. ACCEPTANCE the category can be stored. LIMITATION no separate prayer product. NEXT leave the category.

### BB-14 OTP

PURPOSE recover access with a one-time code. ROLES the account holder. UI forgot-password and OTP screens. WORKFLOW testing outbox only. INPUTS the testing code. VALIDATION replay and fail-closed stay in place. SERVICES platform OTP. TABLES OTP challenges. PERMISSIONS the account. AUDIT attempt. DEPENDENCIES the testing provider. ERRORS production send is not called. SECURITY fail-closed. TESTS OTP contracts. STATUS `IMPLEMENTED_UNVERIFIED`. ACCEPTANCE a used code is not accepted again. NEXT isolated OTP HTTP. Do not send a real SMS.

### BB-15 Access and audit

PURPOSE enforce HQ and branch permissions and record the action. ROLES HQ and branch admins. UI admin screens. WORKFLOW the gate runs before the handler. INPUTS session. VALIDATION missing CSRF is 403. SERVICES auth gates and audit. TABLES audit. PERMISSIONS route gates. AUDIT admin writes. DEPENDENCIES BB-02. ERRORS 403. SECURITY no bypass was added. TESTS access contracts. STATUS `IMPLEMENTED_UNVERIFIED`. ACCEPTANCE a branch user cannot administer another branch. NEXT isolated HTTP.

### BB-16 Reporting and exports

PURPOSE church operational reports. ROLES HQ. UI existing report entry points, if present. WORKFLOW not executed. INPUTS n/a. VALIDATION n/a. SERVICES not run. TABLES n/a. PERMISSIONS would be HQ. AUDIT n/a. DEPENDENCIES an isolated run. ERRORS n/a. SECURITY no export file was written. TESTS none executed. STATUS `BLOCKED` and `NOT_DEMONSTRATED`. ACCEPTANCE a tenant-scoped report result. NEXT leave it unrun.

### BB-17 Tenant and branch isolation

PURPOSE keep church A away from church B. ROLES all church staff. UI every HQ and public query. WORKFLOW church id is part of the write. INPUTS church and branch ids. VALIDATION section writes bind the church id. SERVICES website and member services. TABLES church-scoped tables. PERMISSIONS the route gate plus the id. AUDIT denied cross-church access. DEPENDENCIES BB-01. ERRORS not found or 403. SECURITY public content is filtered by church. TESTS isolation contracts. STATUS `IMPLEMENTED_UNVERIFIED`. ACCEPTANCE a foreign church id does not receive the section. NEXT isolated browser.

Totals: 13 `IMPLEMENTED_UNVERIFIED`, 3 `PARTIAL`, 1 `BLOCKED`.
