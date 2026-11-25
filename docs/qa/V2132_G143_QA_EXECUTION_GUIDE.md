# V2.13.2 G143 — QA execution guide

Candidate branch `V13`. Product version `2.13.2` on both About pages. This guide is for the verified local behavior. It does not authorize a hosted deploy, a live email, or a new migration.

Use a new synthetic person for every run: a unique last name, a Zambia mobile number that has not been used, and a password chosen for that run. Do not write the password into this file, a ticket, or a screenshot. Hosted accounts are not created by this guide. On the disposable local database, the gitignored runners supply the staff identities.

Four paths stay separate:

| Path | Who starts it | What it may do |
| --- | --- | --- |
| Portal activation | Staff already created the patient | Link that one chart and set a password |
| Public self-registration | Unknown visitor | Must not insert a patient |
| Password recovery | Existing account | Stays blocked for production OTP |
| Patient login | Activated portal account | Reads the same patient number |

## ActiveClinic scenarios

### AC-FU-PORTAL-01 — Existing staff-created patient activates the portal

- Preconditions: clinic staff can open `/app/patients/new`. Public booking is off.
- Role: organisation admin creates the chart. The patient then uses the public clinic register page.
- Test data: unique last name, date of birth, sex, unused national phone. Email on a reserved test domain such as `example.invalid`.
- Steps: Open `/app/patients/new`. Choose "None of these". Enter the identity. Review, then Create patient. Copy the `AC-` patient number. Sign out. Open `/clinics/<clinic-key>/patient/register`. Enter the same first name, last name, and phone, plus the email and the run password. Submit. Sign in at `/clinics/<clinic-key>/patient/login` with the email. Open the profile.
- Expected: one chart, a login page after activation, welcome text with the first name, and the same patient number on the profile.
- Negative: register again with an unknown name and phone. The page says no matching patient record was found and that a new record is not created. The chart count stays 1.
- Evidence: patient number, profile text, and the unknown-registration message. Do not capture the password.
- Status: `VERIFIED_LOCAL_E2E` in Playwright `AC-FU-PORTAL-01` on the disposable database.
- Blocker: none for this local path. Hosted identities were not provisioned here.

### AC-FU-PORTAL-02 — Unknown public registration

- Preconditions: no staff chart for the person.
- Role: anonymous visitor.
- Test data: a name and phone that staff have not registered.
- Steps: Open `/clinics/<clinic-key>/patient/register` and submit the unknown person.
- Expected: the copy says no matching patient record was found and that the form does not create a patient. Patients are registered by clinic staff.
- Negative: do not treat a rejected form as a successful registration.
- Evidence: the rejection text and a staff search that does not show a new chart.
- Status: `POLICY_MISMATCH`. The November 23 report expected a public match. The approved policy does not create a patient.
- Blocker: product decision. Do not change the policy in a test run.

### AC-FU-PORTAL-03 — Public booking

- Preconditions: a published clinic page.
- Role: anonymous visitor.
- Test data: none beyond the clinic public URL.
- Steps: Open the clinic booking URL.
- Expected: booking stays unavailable. No coupon field is offered.
- Negative: a 200 page that still contains a booking form is a failure.
- Evidence: the disabled booking response. Automated id `AC-PUB-01`.
- Status: `BLOCKED_BY_POLICY`.
- Blocker: public booking stays disabled.

### AC-FU-PORTAL-04 — Patient OTP recovery

- Preconditions: an activated portal account.
- Role: patient.
- Test data: the account email. Do not request a live message.
- Steps: Open the patient forgot-password page.
- Expected: delivery is unavailable. No code appears in the page. Production OTP stays off because `platform.otp_challenges` is absent.
- Negative: a displayed code, a sent email, or a completed reset is a failure.
- Evidence: the unavailable-delivery copy. HTTP D14C and D16 platform OTP remain failed.
- Status: `BLOCKED_BY_MIGRATION`.
- Blocker: do not create migration `048`.

### AC-FU-WEB-01 — Edit an existing website section

- Preconditions: a clinic website with a saved section. Staff can open website settings.
- Role: clinic admin.
- Test data: a new heading on an existing section.
- Steps: Open `/app/settings/website/sections`. Open the section settings. Change the heading. Save. Preview the draft. Confirm the live page does not change until publish.
- Expected: the draft holds the edit. The public page changes only after an explicit publish.
- Negative: `javascript:` and protocol-relative links are rejected.
- Evidence: draft heading and the unchanged public page before publish. Automated companion `AC-WEB-08`.
- Status: `VERIFIED_LOCAL_E2E`.
- Blocker: none for text edits. Binary upload stays off.

### AC-FU-WEB-02 — New text and an HTTPS image after publish

- Preconditions: staff can add a section.
- Role: clinic admin.
- Test data: a unique heading, body text, and an `https://` image URL with alt text. Do not upload a file.
- Steps: Add a text section. Save the heading and body. Confirm a script URL is rejected. Mark the section visible, save, and confirm the live page still hides it. Publish from `/app/settings/website/publish`. Reload the public page.
- Expected: heading, body, and the image `src` appear after publish and survive reload.
- Negative: the heading is absent before publish. A file upload control must not become a production upload.
- Evidence: before-publish absence, after-publish text, and the image URL. Automated id `AC-FU-WEB-02`.
- Status: `VERIFIED_LOCAL_E2E` for text and an HTTPS reference.
- Blocker: production binary media upload stays disabled.

### AC-FU-WEB-03 — Theme draft and publish

- Preconditions: clinic website settings.
- Role: clinic admin.
- Test data: one clinic theme. A church theme must not be selectable.
- Steps: Choose the clinic theme, preview it, publish it, and reload the public page.
- Expected: the selected clinic theme is public after publish. Church themes are absent.
- Negative: publishing a church theme is a failure.
- Evidence: preview, public page, and the absent church theme. Automated id `AC-WEB-09`.
- Status: `VERIFIED_LOCAL_E2E`.
- Blocker: none.

### AC-FU-REC-01 — Staff registers a patient

- Preconditions: receptionist or admin session.
- Role: reception or organisation admin.
- Test data: unique identity, as in PORTAL-01.
- Steps: `/app/patients/new`, dismiss duplicate suggestions, review, create.
- Expected: one `AC-` patient number. Creating the chart does not by itself activate the portal.
- Negative: a second submit does not create a second chart for the same new number.
- Evidence: the patient number. This create step is inside `AC-FU-PORTAL-01`.
- Status: `VERIFIED_LOCAL_E2E`.
- Blocker: none.

### AC-FU-REC-02 — Walk-in at a clinic service point

- Preconditions: a patient number in this clinic and at least one service point.
- Role: receptionist.
- Test data: the patient number from REC-01.
- Steps: Open `/app/reception/walk-in`. Enter the patient number. Choose a service point. Submit.
- Expected: the queue URL contains the visit and the same clinic. Another clinic's service point is not offered.
- Negative: a foreign clinic cannot see the visit.
- Evidence: queue URL and patient number. Automated id `AC-REC-02`.
- Status: `VERIFIED_LOCAL_E2E`.
- Blocker: none.

### AC-FU-REC-03 — New patient appears on the waiting queue

- Preconditions: receptionist session.
- Role: receptionist.
- Test data: a brand-new patient, then that patient number.
- Steps: Create the patient. Walk in with that number and a service point.
- Expected: the queue page shows that patient number.
- Negative: the queue for another clinic does not show it.
- Evidence: patient number on the queue. Automated id `AC-FU-REC-03`.
- Status: `VERIFIED_LOCAL_E2E`.
- Blocker: none.

### AC-FU-REC-04 — Existing patient by patient number

- Preconditions: a patient number that already belongs to this clinic.
- Role: receptionist.
- Test data: the existing number. Do not type a new name.
- Steps: Walk in with that number. Count charts for this organisation before and after.
- Expected: the existing patient is recognized. The chart count does not rise. If that service point already has an active entry, the page says so and still does not create a chart.
- Negative: a second `AC-` number for the same person is a failure.
- Evidence: the count before and after, plus either the queue page or the active-entry message. Automated id `AC-FU-REC-04`.
- Status: `VERIFIED_LOCAL_E2E` for recognition and no second chart.
- Blocker: none.

### AC-FU-REC-05 — Queue visible to clinical staff

- Preconditions: a clinician account for the same clinic. Receptionist access is not sufficient for this check.
- Role: clinical staff.
- Test data: none beyond the staff session.
- Steps: Sign in as clinical staff. Open `/app/clinical`.
- Expected: the practitioner worklist is visible and the browser is not sent to login.
- Negative: a receptionist opening the clinical worklist is denied. Do not weaken that denial.
- Evidence: the worklist heading. Automated id `AC-FU-REC-05`. This check does not assert one named reception ticket.
- Status: `VERIFIED_LOCAL_E2E`.
- Blocker: none.

### AC-FU-CLIN-01 — Clinician views the queue

- Preconditions: the same clinical staff session.
- Role: clinician.
- Test data: patients already on the worklist, or the start-encounter entry.
- Steps: Open `/app/clinical`.
- Expected: a Start encounter link is visible, including a row action when the worklist has patients.
- Negative: do not start an encounter in this scenario. Starting is CLIN-02.
- Evidence: the start-encounter link. Automated id `AC-FU-CLIN-01`.
- Status: `VERIFIED_LOCAL_E2E`.
- Blocker: none.

### AC-FU-CLIN-02 — Initial vitals

- Preconditions: a patient and an encounter the clinician opened.
- Role: clinical staff.
- Test data: heart rate `72` and unit `bpm` on a run-owned patient.
- Steps: Start the encounter with that patient id. Open the encounter vitals page. Record heart rate 72 bpm.
- Expected: the page shows `72 bpm` after reload.
- Negative: an anonymous session posting vitals is sent to login or denied. The 72 bpm row remains.
- Evidence: the saved value and the denied anonymous post. Automated id `AC-REC-03`.
- Status: `VERIFIED_LOCAL_E2E`.
- Blocker: none.

### AC-FU-CLIN-03 — Correct vitals and keep the original

- Preconditions: CLIN-02 has stored 72 bpm.
- Role: the same clinician.
- Test data: replacement value `80` and reason `entry error`.
- Steps: Submit the correction form on the vitals page. Reload.
- Expected: both `72 bpm` and `80 bpm` are visible. The original is marked superseded. A second correction of that same original is rejected as stale.
- Negative: the original row is not edited or deleted. Another clinic does not see the values.
- Evidence: both numbers, the superseded mark, and the stale retry. Automated browser path is `AC-REC-03`; the stale retry is the HTTP vitals case.
- Status: `VERIFIED_LOCAL_E2E`.
- Blocker: none.

## BlessBoard sheet

Staff identities come from the local runner or from an account the QA lead already issued. Do not paste passwords into the result sheet.

| Check | Role | Steps | Expected | Negative | Evidence id |
| --- | --- | --- | --- | --- | --- |
| Registration | Public visitor, then a second attempt with the same phone | Submit a new church. Repeat the phone with a different password | The first church is stored. The mismatched duplicate is rejected | A second church for the same phone | `BB-REG-07` |
| Member registration | HQ admin | `/hq/members/new` with name, email, phone, address, marital status, kin, and branch. Submit the shell token | Review, then one member. Portal activation stays pending | A post without the CSRF token returns 403 | `BB-05`, `BB-MEM-01`, `BB-MEM-02` |
| Activation and login | HQ admin, then the member | Issue the portal invitation. Open the token link. Set the run password. Sign in | The member shell opens for that church | The password is not shown on the admin page | `BB-06` |
| Invitation | HQ admin | Issue one invitation and use it once | The token link works once | Replaying the used invitation does not create a second login | `BB-06` |
| Website publishing | Church admin | Edit a section, preview, then publish | The public page changes only after publish | Another church does not show the section | `BB-01` |
| Sermons | Church admin | Save a draft sermon, then publish | The draft stays private. The published sermon is on that church only | A non-HTTPS media URL is rejected | `BB-04`, `BB-WEB-09` |
| Events | Church admin | Save a draft event with an end after the start, then publish | The published event is isolated to that church | An end before the start is rejected | `BB-03`, `BB-WEB-10` |
| Announcements | Church admin | Publish an announcement | It appears on that church public page | The other church page does not show it. File upload stays refused while the media flag is unset | `BB-02`, `BB-ANN-01`, `BB-ANN-02` |
| Cross-church | Admin of church A and a visitor on church B | Open the published sermon, event, and announcement on both public sites | Only church A shows them | Church B content is unchanged | the isolation tests above |
| Recovery | Member | Open member recovery and complete the testing reset | The testing code is not shown in the page. Sign-in works after the testing reset | A production email or SMS is not sent | `BB-AUTH-04` |
| CSRF | HQ admin | Read the one token in the member form. Post the form without it | The token is present. The missing token is 403. The same token then saves | A second token minted for the post is not required | `BB-MEM-02` |
| Theme | Church admin | Preview and publish a church theme | The church theme is public | A clinic theme is absent | `BB-WEB-08` |

BlessBoard recovery in this build uses the testing path. It is not production OTP and it is not Resend delivery.

## Result rules

Record the QA id, the URL, the visible result, and the time. Hide passwords, API keys, and OTP codes. A hosted run is valid only after the deployment in `V2132_G145_HOSTED_QA_DEPLOYMENT_PLAN.md` is separately authorized. Until then, the local disposable evidence above is the verification record.
