# V2134 G326 hosted acceptance sheet

HOSTED_ACCEPTANCE_EXECUTED=NO.

Every row below is the test to run after a separate approval. The Actual and Result columns are `NOT_EXECUTED` and `NOT_RUN` because this session did not sign in, did not change data, and did not claim a hosted pass.

At the start and end of a later run, record both `/healthz` payloads. A row can be PASS only when `gitSha` is `c947d26cb57e` and the evidence was captured on that build. If the SHA differs, stop and mark the sheet invalid for this candidate.

Use issued testing accounts. Do not copy disposable local passwords into the host. Do not record patient names, phone numbers, or request identifiers in git. Store screenshots outside git and cite their ticket ids in Evidence.

Do not enable public booking, SMS, production OTP, or financial posting to make a row pass. Do not create a patient from the public portal.

Historical results stay 48 PASS and 16 FAIL. The written date 28/11/2025 stays flagged. This sheet does not rewrite them.

## Clinical workflow

Run these as one sequence on one disposable hosted chart, then record the matching rows:

1. Reception registers the patient, starts a walk-in, and queues the chart once.
2. Triage records temperature, blood pressure, pulse, and oxygen saturation, then corrects the pulse with a reason.
3. The clinician saves subjective text, examination, diagnosis, treatment, one medication, follow-up, and a referral.
4. Laboratory creates the request, collects, receives, enters a result, and a second user verifies it.
5. Radiology creates a pending request, confirms Open queue, writes the report, and a second user verifies it.
6. Each role uses the on-page print region. No payment is posted.
7. A website editor saves a draft, uploads one small synthetic image through the existing control, publishes, and an anonymous browser reloads the public page.
8. Staff activation links the existing chart. The patient signs in. A phone with no chart is refused and creates no patient.

## Sheet

| ID | Role | Expected | Actual | Result | Evidence |
| --- | --- | --- | --- | --- | --- |
| RT-01 | Public visitor | ActiveClinic public origin loads | NOT_EXECUTED | NOT_RUN | |
| RT-02 | Public visitor | One published clinic page shows published information | NOT_EXECUTED | NOT_RUN | |
| RT-03 | Public visitor | Booking stays unavailable. Do not enable it | NOT_EXECUTED | NOT_RUN | Policy: BLOCKED_BY_POLICY unless the restriction is confirmed |
| RT-04 | Clinic admin | Correct password opens the assigned workspace | NOT_EXECUTED | NOT_RUN | |
| RT-05 | Clinic admin | Sign-out returns a protected page to login | NOT_EXECUTED | NOT_RUN | |
| RT-06 | Clinic admin | Wrong password does not open the workspace | NOT_EXECUTED | NOT_RUN | |
| RT-07 | Staff with a registered email | A received mailbox message completes OTP | NOT_EXECUTED | NOT_RUN | Provider: do not send mail. BLOCKED_BY_PROVIDER until a received message exists |
| RT-08 | Staff or patient | Forgot-password does not send or promise SMS | NOT_EXECUTED | NOT_RUN | Policy: BLOCKED_BY_POLICY. Testing recovery is not SMS |
| RT-09 | Registrant | A disposable clinic registration completes only if the owner allowed it | NOT_EXECUTED | NOT_RUN | |
| RT-10 | Registrant | Same phone and a different password is refused. Matching password follows the existing identity | NOT_EXECUTED | NOT_RUN | |
| RT-11 | Multi-clinic user | Sign-in shows the clinic choice | NOT_EXECUTED | NOT_RUN | |
| RT-12 | Multi-clinic user | The chosen clinic workspace opens | NOT_EXECUTED | NOT_RUN | |
| RT-13 | Admin, reception, clinician, laboratory, radiology | Each role opens its own home and is refused the others | NOT_EXECUTED | NOT_RUN | |
| RT-14 | Website editor | Existing website text can be edited | NOT_EXECUTED | NOT_RUN | |
| RT-15 | Website editor | The edit is saved as a draft and is absent from the public page | NOT_EXECUTED | NOT_RUN | |
| RT-16 | Website editor | After publish, the public page shows the text | NOT_EXECUTED | NOT_RUN | |
| RT-17 | Website editor | A small synthetic image uploads into an existing section. A non-image is rejected | NOT_EXECUTED | NOT_RUN | |
| RT-18 | Website editor | The upload is saved as a draft and stays off the public page | NOT_EXECUTED | NOT_RUN | |
| RT-19 | Public visitor | After publish, the public page shows that image | NOT_EXECUTED | NOT_RUN | |
| RT-20 | Website editor | About and Welcome reopen with the saved content | NOT_EXECUTED | NOT_RUN | |
| RT-21 | Website editor | A service name, description, and image are stored. Public booking stays off | NOT_EXECUTED | NOT_RUN | |
| RT-22 | Public visitor | The service is hidden before publish and visible after publish | NOT_EXECUTED | NOT_RUN | |
| RT-23 | Website editor | Doctor name, qualifications, specialisation, and image are stored. No staff login is created | NOT_EXECUTED | NOT_RUN | |
| RT-24 | Website editor | Location, hours, and contact details reload after save | NOT_EXECUTED | NOT_RUN | |
| RT-25 | Website editor | An ActiveClinic theme applies. A BlessBoard theme is unavailable | NOT_EXECUTED | NOT_RUN | |
| RT-26 | Website editor | The theme remains draft before publish | NOT_EXECUTED | NOT_RUN | |
| RT-27 | Public visitor | After publish, the public page shows the theme | NOT_EXECUTED | NOT_RUN | |
| RT-28 | Website editor | A new text section can be edited, kept private, published, and reloaded | NOT_EXECUTED | NOT_RUN | |
| RT-29 | Website editor | A new image section can be saved, previewed, published, and reloaded | NOT_EXECUTED | NOT_RUN | |
| RT-30 | Patient | An activated account signs in | NOT_EXECUTED | NOT_RUN | |
| RT-31 | Public visitor | A phone with no chart is refused and no patient is created | NOT_EXECUTED | NOT_RUN | Approved chart-first refusal. Do not weaken the match |
| RT-32 | Patient | The first activation links the staff-created chart. A repeat does not create another chart | NOT_EXECUTED | NOT_RUN | |
| RT-33 | Patient | The portal profile opens for that same patient | NOT_EXECUTED | NOT_RUN | |
| RT-34 | Reception | Search by patient number returns that chart | NOT_EXECUTED | NOT_RUN | |
| RT-35 | Reception | Search by name returns that chart | NOT_EXECUTED | NOT_RUN | |
| RT-36 | Reception | Search by phone returns that chart | NOT_EXECUTED | NOT_RUN | |
| RT-37 | Reception | The chart opens and reloads | NOT_EXECUTED | NOT_RUN | |
| RT-38 | Reception | Staff registration creates one chart | NOT_EXECUTED | NOT_RUN | |
| RT-39 | Reception | A walk-in starts in that clinic | NOT_EXECUTED | NOT_RUN | |
| RT-40 | Reception | The selected service point appears on the queue | NOT_EXECUTED | NOT_RUN | |
| RT-41 | Reception | The new patient appears on the waiting queue | NOT_EXECUTED | NOT_RUN | |
| RT-42 | Reception | An existing number is queued without a second chart | NOT_EXECUTED | NOT_RUN | |
| RT-43 | Triage | Temperature, blood pressure, pulse, and oxygen saturation save and reopen | NOT_EXECUTED | NOT_RUN | |
| RT-44 | Clinician | A correction keeps the original and the new value, with a reason. Another clinic cannot change it | NOT_EXECUTED | NOT_RUN | |
| RT-45 | Clinician | Subjective history reloads | NOT_EXECUTED | NOT_RUN | |
| RT-46 | Clinician | Examination findings reload | NOT_EXECUTED | NOT_RUN | |
| RT-47 | Clinician | Diagnosis reloads | NOT_EXECUTED | NOT_RUN | |
| RT-48 | Clinician | Treatment plan reloads | NOT_EXECUTED | NOT_RUN | |
| RT-49 | Clinician | One medication is saved. No payment is posted | NOT_EXECUTED | NOT_RUN | |
| RT-50 | Clinician | Follow-up text reloads on the same encounter | NOT_EXECUTED | NOT_RUN | |
| RT-51 | Clinician | Referral text reloads and is included in the print region | NOT_EXECUTED | NOT_RUN | |
| RT-52 | Clinician | A laboratory request is created | NOT_EXECUTED | NOT_RUN | |
| RT-53 | Clinician | A radiology request is created as pending | NOT_EXECUTED | NOT_RUN | |
| RT-54 | Laboratory | Specimen collection is stored | NOT_EXECUTED | NOT_RUN | |
| RT-55 | Laboratory | Specimen receipt is stored | NOT_EXECUTED | NOT_RUN | |
| RT-56 | Laboratory, second verifier | A result is entered and verified by a different user | NOT_EXECUTED | NOT_RUN | |
| RT-57 | Laboratory | The request is under Received and not under Processing before result entry | NOT_EXECUTED | NOT_RUN | |
| RT-58 | Laboratory | Each counter matches its own status | NOT_EXECUTED | NOT_RUN | |
| RT-59 | Diagnostics | Hub counts match the laboratory and radiology queues they display | NOT_EXECUTED | NOT_RUN | |
| RT-60 | Radiology | A pending request is in All and Open queue, not in In progress | NOT_EXECUTED | NOT_RUN | |
| RT-61 | Radiology | The request opens for radiology staff. Reception cannot open the queue | NOT_EXECUTED | NOT_RUN | |
| RT-62 | Radiology | Technique, findings, and impression can be entered | NOT_EXECUTED | NOT_RUN | |
| RT-63 | Radiology, second verifier, clinician | The report is saved, verified by a second user, and visible on the encounter. The author cannot verify alone | NOT_EXECUTED | NOT_RUN | |
| RT-64 | Reception, triage, clinician, laboratory, radiology | SOAP, referral, prescription, vitals, laboratory, and radiology print regions show the record. No financial document is created | NOT_EXECUTED | NOT_RUN | |

Tested build SHA for every row: record the live `/healthz` `gitSha` when the row is executed. The SHA observed while writing this sheet was `c947d26cb57e`. That observation is not execution evidence.

## Counts to fill after execution

| Bucket | Planned | Executed |
| --- | --- | --- |
| Supported enabled | 60 | 0 |
| Policy-disabled | 2 (RT-03, RT-08) | 0 |
| Provider-blocked | 1 (RT-07) | 0 |
| Chart-first refusal | 1 (RT-31) | 0 |
| Hosted PASS claimed | 0 | 0 |
