# V2.13.2 G149 — hosted browser QA checklist

Every row starts `NOT_RUN`. A row becomes PASS only after a person runs it in a browser on the deployed SHA recorded in that row. Local Playwright results are not hosted results. Leave passwords, API keys, and OTP codes out of the evidence.

Shared rules: use a synthetic person with a unique last name and an unused Zambia mobile number. Choose a run password and do not write it down here. Sign-in identities must already exist on the testing host. This checklist does not create them.

Deployed SHA for this package: blank until the operator verifies `/healthz`.

## ActiveClinic

### AC-HQ-ABOUT — About version and commit

- Role: anonymous
- Preconditions: `https://activeclinic.pronline.org/about` and `/healthz` respond
- Steps: Open About. Read the version. Open `/healthz` and read `gitSha` and `branch`.
- Expected: version `2.13.2`. `gitSha` matches the authorized deploy SHA. Record `branch` as shown. Do not change it to V13 by hand.
- Negative: a different version or a SHA that was not the authorized deploy is a fail.
- Evidence: About text and the health JSON fields `gitSha`, `branch`, `branchSource`, `deploymentCode`.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### AC-HQ-REG — Staff-created patient

- Role: clinic admin or receptionist
- Preconditions: staff session in one clinic
- Steps: Open `/app/patients/new`. Choose "None of these". Enter a new identity. Review. Create patient.
- Expected: one `AC-` patient number. The portal is not activated by this step.
- Negative: a second chart for the same new number.
- Evidence: the patient number, with no password in the shot.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### AC-HQ-PORTAL-01 — Existing patient activates the portal

- Role: the patient, after AC-HQ-REG
- Preconditions: the staff-created chart and its phone
- Steps: Sign out. Open `/clinics/<clinic-key>/patient/register`. Enter the same name and phone, plus a test email and the run password. Submit. Sign in at `/clinics/<clinic-key>/patient/login`. Open the profile.
- Expected: one chart, login succeeds, the profile shows the same patient number.
- Negative: a second patient row.
- Evidence: patient number on the profile.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### AC-HQ-PORTAL-02 — Unknown public registration

- Role: anonymous
- Preconditions: a name and phone that staff have not registered
- Steps: Open `/clinics/<clinic-key>/patient/register` and submit the unknown person.
- Expected: no matching record, and the page says a new patient record is not created.
- Negative: a new chart appearing in staff search.
- Evidence: the rejection text.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### AC-HQ-LOGIN — Patient login

- Role: the activated patient from AC-HQ-PORTAL-01
- Preconditions: activation completed
- Steps: Open the patient login. Sign in with the email. Sign out. Sign in again.
- Expected: the same welcome and patient number.
- Negative: a login that opens a different clinic's chart.
- Evidence: the profile patient number.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### AC-HQ-REC — Reception registration

- Role: receptionist
- Preconditions: receptionist session
- Steps: Repeat the staff create path in `/app/patients/new` with a second synthetic person.
- Expected: a new `AC-` number in this clinic.
- Negative: the number is visible in another clinic.
- Evidence: the number and the clinic name.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### AC-HQ-WALKIN — Walk-in service selection

- Role: receptionist
- Preconditions: a patient number in this clinic
- Steps: Open `/app/reception/walk-in`. Enter the number. Choose a service point belonging to this clinic. Submit.
- Expected: the queue URL opens and shows that number.
- Negative: another clinic's service point is offered.
- Evidence: the queue URL and the selected service point.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### AC-HQ-QUEUE-NEW — New patient on the queue

- Role: receptionist
- Preconditions: a patient created in this session
- Steps: Walk that new number in.
- Expected: the queue body contains that number.
- Negative: the queue of another clinic contains it.
- Evidence: the queue page.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### AC-HQ-QUEUE-EXISTING — Existing patient, no second chart

- Role: receptionist
- Preconditions: a patient number that already belongs to this clinic
- Steps: Walk in with that number only. Search the chart list before and after.
- Expected: the existing patient is recognized. The chart count does not rise. An already-active service point says so and still does not create a chart.
- Negative: a second `AC-` number.
- Evidence: the before and after search.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### AC-HQ-HANDOFF — Reception to clinician

- Role: receptionist, then clinician in the same clinic
- Preconditions: a queued patient
- Steps: Leave the queue entry. Sign in as the clinician. Open `/app/clinical`.
- Expected: the practitioner worklist is visible to the clinician.
- Negative: the receptionist session is not treated as the clinician session.
- Evidence: the worklist heading after the clinician sign-in.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### AC-HQ-CLIN — Clinical worklist

- Role: clinician
- Preconditions: clinician session
- Steps: Open `/app/clinical`.
- Expected: a Start encounter link is visible. Do not start one in this row.
- Negative: the page redirects to login.
- Evidence: the start-encounter link.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### AC-HQ-VITALS — Initial vitals

- Role: clinician
- Preconditions: an encounter for a synthetic patient
- Steps: Open the encounter vitals page. Record heart rate `72` bpm. Reload.
- Expected: `72 bpm` remains.
- Negative: an anonymous post is denied or sent to login, and `72 bpm` remains.
- Evidence: the saved value. Do not include another clinic's patient.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### AC-HQ-VITALS-CORR — Append-only correction

- Role: same clinician
- Preconditions: AC-HQ-VITALS stored 72 bpm
- Steps: Submit the correction form with `80` and reason `entry error`. Reload.
- Expected: both `72 bpm` and `80 bpm` show. The original is marked superseded.
- Negative: the original row disappears.
- Evidence: both values and the superseded mark.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### AC-HQ-VITALS-STALE — Stale correction denial

- Role: same clinician
- Preconditions: the original 72 bpm row is already superseded
- Steps: Submit another correction against that same original row.
- Expected: the retry is rejected. The stored values stay 72 and 80.
- Negative: a third stored value from the stale row.
- Evidence: the rejection and the unchanged list.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### AC-HQ-WRONG-CLINIC — Wrong-clinic denial

- Role: staff of a second clinic
- Preconditions: the encounter URL from the first clinic
- Steps: Sign in to the other clinic and open that encounter or its vitals URL.
- Expected: not found or no permission. The other clinic does not show 72 or 80.
- Negative: the values are readable.
- Evidence: the denial text.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### AC-HQ-WEB-EDIT — Edit an existing section

- Role: clinic admin
- Preconditions: a saved website section
- Steps: Open `/app/settings/website/sections`. Change the heading. Save.
- Expected: the draft holds the new heading.
- Negative: a `javascript:` link is saved.
- Evidence: the saved heading and the rejected link message.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### AC-HQ-WEB-DRAFT — Draft stays private

- Role: anonymous, after AC-HQ-WEB-EDIT
- Preconditions: the section is not published
- Steps: Open the public clinic page.
- Expected: the new heading is absent.
- Negative: the draft heading is public.
- Evidence: the public page.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### AC-HQ-WEB-PUBLISH — Publish text

- Role: clinic admin
- Preconditions: a completed draft
- Steps: Open `/app/settings/website/publish`. Publish. Reload the public page.
- Expected: the heading and body are public after publish and survive reload.
- Negative: the text appears before publish.
- Evidence: before and after public pages.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### AC-HQ-WEB-IMAGE — HTTPS image reference

- Role: clinic admin
- Preconditions: an `https://` image URL. Do not upload a file.
- Steps: Put the URL and alt text on the section. Publish. Reload.
- Expected: the public image `src` is that URL.
- Negative: a file upload becomes a stored production binary.
- Evidence: the image URL. Confirm the media-upload flag stays off.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### AC-HQ-THEME — Theme publish

- Role: clinic admin
- Preconditions: website theme settings
- Steps: Preview a clinic theme. Publish it. Reload the public page.
- Expected: the clinic theme is public. Church themes are absent.
- Negative: a church theme can be selected.
- Evidence: the public theme and the theme list.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### AC-HQ-OVERLAP — Same-staff appointment overlap

- Role: receptionist
- Preconditions: one clinician and two requests for the same overlapping interval
- Steps: Book the first visit. Book a second visit for the same staff member with an overlapping time.
- Expected: one visit is stored. The second is rejected as a conflict.
- Negative: two stored visits for that staff member in the overlapping interval.
- Evidence: the two outcomes. This browser check is not the two-client database proof.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### AC-HQ-SLOT — Slot capacity stays blocked

- Role: receptionist
- Preconditions: the booking screen
- Steps: Look for a room-capacity or overbooking control. Do not invent a number.
- Expected: no approved slot-capacity number is offered. The screen does not enable overbooking.
- Negative: a new capacity field that accepts a number.
- Evidence: the booking screen.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

## BlessBoard

### BB-HQ-ABOUT — About version and commit

- Role: anonymous
- Preconditions: `https://blessboard.pronline.org/about` and `/healthz`
- Steps: Read the version and the health `gitSha`, `branch`, and `deploymentCode`.
- Expected: version `2.13.2`, testing deployment code, and the authorized SHA.
- Negative: a production deployment code.
- Evidence: About text and health JSON.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### BB-HQ-REG — Church registration

- Role: anonymous
- Preconditions: the public church registration form
- Steps: Submit a new church with a unique phone.
- Expected: one church is stored.
- Negative: the form writes into an existing church.
- Evidence: the registration result. No password in the shot.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### BB-HQ-DUP — Duplicate phone denial

- Role: anonymous
- Preconditions: the phone from BB-HQ-REG
- Steps: Submit the same phone with a different password.
- Expected: the duplicate is rejected and a second church is not created.
- Negative: a second church.
- Evidence: the error text.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### BB-HQ-MEMBER — Member creation

- Role: HQ admin
- Preconditions: a church admin session
- Steps: Open `/hq/members/new`. Enter name, email, phone, address, marital status, kin, and branch. Submit the form that contains the CSRF token.
- Expected: one member. Portal activation stays pending.
- Negative: the member can sign in before an invitation.
- Evidence: the pending-activation text.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### BB-HQ-LOGIN — Member login

- Role: the invited member
- Preconditions: one invitation was issued and the run password was set
- Steps: Open the invitation link. Set the password. Sign in.
- Expected: the member shell opens for that church.
- Negative: the admin page shows the password.
- Evidence: the member shell. No password text.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### BB-HQ-ISOLATION — Church-context isolation

- Role: admin of church A and a visitor on church B
- Preconditions: a published sermon, event, or announcement on church A
- Steps: Open the public page for church A and for church B.
- Expected: only church A shows the item.
- Negative: church B shows it.
- Evidence: both public pages.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### BB-HQ-INVITE — Staff or member invitation

- Role: HQ admin
- Preconditions: the member from BB-HQ-MEMBER
- Steps: Issue one portal invitation. Open the token link once.
- Expected: the token link is shown to the admin and works once.
- Negative: the token is mailed by a production provider. Do not send mail.
- Evidence: the invitation link on the admin screen.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### BB-HQ-INVITE-REPLAY — Invitation replay denial

- Role: the same member
- Preconditions: the invitation was already used
- Steps: Open the same token link again.
- Expected: the used invitation does not create a second login.
- Negative: a second account.
- Evidence: the replay message.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### BB-HQ-WEB — Website editing

- Role: church admin
- Preconditions: website section settings
- Steps: Edit a section, preview it, and leave it unpublished.
- Expected: the draft is saved and the public page is unchanged.
- Negative: the draft is public.
- Evidence: preview and public page.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### BB-HQ-THEME — Theme publishing

- Role: church admin
- Preconditions: theme settings
- Steps: Preview a church theme and publish it.
- Expected: the church theme is public. A clinic theme is absent.
- Negative: a clinic theme can be published.
- Evidence: the public page and the theme list.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### BB-HQ-SERMON — Sermons

- Role: church admin
- Preconditions: sermon editor
- Steps: Save a draft sermon. Confirm the public page hides it. Publish it.
- Expected: the draft stays private. The published sermon is on that church only. A non-HTTPS media URL is rejected.
- Negative: the draft is public, or the sermon appears on another church.
- Evidence: draft page, public page, and the rejected URL.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### BB-HQ-EVENT — Events

- Role: church admin
- Preconditions: event editor
- Steps: Save an event whose end is after its start. Publish it. Try an end before the start.
- Expected: the valid event publishes for that church. The reversed time is rejected.
- Negative: the reversed event is stored.
- Evidence: both results.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### BB-HQ-ANN — Announcements

- Role: church admin
- Preconditions: announcement editor
- Steps: Publish an announcement. Open that church's public page and another church's page.
- Expected: only the owning church shows it.
- Negative: the other church shows it.
- Evidence: both public pages.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### BB-HQ-MEDIA — Media stays disabled

- Role: church admin
- Preconditions: announcement attachment control
- Steps: Attempt a file upload.
- Expected: the upload is refused while `BLESSBOARD_MEDIA_UPLOADS_ENABLED` is unset.
- Negative: a stored production file.
- Evidence: the refusal.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### BB-HQ-CSRF — CSRF denial

- Role: HQ admin
- Preconditions: the member form is open
- Steps: Confirm one CSRF token is in the form. Submit a copy of the form with the token removed.
- Expected: the missing token returns 403. The token from the page then saves.
- Negative: the token-less post saves.
- Evidence: the 403 and the later success. Do not capture the token value in a shared ticket.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

### BB-HQ-ROLE — Unauthorized role denial

- Role: a member, or a staff user without the HQ admin role
- Preconditions: a member session
- Steps: Open `/hq/members/new`.
- Expected: the member is denied.
- Negative: the member can create another member.
- Evidence: the denial.
- Actual: NOT_RUN
- Result: NOT_RUN
- Tester: 
- Date: 
- Deployed SHA: 

## OTP and Resend

### OTP-HQ-DISABLED — Production OTP stays off

- Role: patient and member
- Preconditions: forgot-password pages
- Steps: Open the patient and member recovery pages. Do not request a live message.
- Expected: production delivery stays unavailable. No code is shown.
- Negative: a code on screen or a sent email.
- Evidence: the unavailable copy.
- Actual: NOT_RUN
- Result: BLOCKED
- Tester: 
- Date: 
- Deployed SHA: 

### OTP-HQ-D14C — Challenge persistence

- Role: not a browser action
- Preconditions: `platform.otp_challenges` is not in this candidate
- Steps: Do not apply a migration. Record the health payload. It does not list that table.
- Expected: D14C stays blocked.
- Negative: creating the table during QA.
- Evidence: the release note and the absence of migration `048`.
- Actual: NOT_RUN on the host
- Result: BLOCKED
- Tester: 
- Date: 
- Deployed SHA: 

### OTP-HQ-D16 — Platform OTP

- Role: not a browser action
- Preconditions: same missing table
- Steps: Do not verify a code across workers.
- Expected: D16 platform OTP stays blocked.
- Negative: a successful distributed verify.
- Evidence: the same missing-table note.
- Actual: NOT_RUN on the host
- Result: BLOCKED
- Tester: 
- Date: 
- Deployed SHA: 

### OTP-HQ-RESEND — Domain verification status

- Role: operator
- Preconditions: Resend dashboard, not this git tree
- Steps: Read `pronline.org` and `notify.pronline.org` separately. Do not send mail.
- Expected: status stays unverified until Resend shows the exact domain. The two names are not substitutes. Proposed QA senders are `qa-blessboard@pronline.org` and `qa-activeclinic@pronline.org`.
- Negative: adding `pronline.org` to `GETPRO_RESEND_VERIFIED_DOMAINS` from a DNS screenshot.
- Evidence: the Resend domain screen, with secrets cropped out.
- Actual: DOMAIN_VERIFICATION_NOT_OBSERVED
- Result: BLOCKED
- Tester: 
- Date: 
- Deployed SHA: 

Hosted rows executed by this session: 0.
