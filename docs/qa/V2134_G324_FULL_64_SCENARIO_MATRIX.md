# V2134 G324 full 64-scenario matrix

ORIGINAL_DOCX_READ=YES.

The mission path `~/Downloads/ActiveClinic_V2.13.4_Christine_64_Scenario_Regression_Report.docx` was not on disk. The attached original document was read in full. It is the ActiveClinic regression report prepared by Christine Manjombi for `https://activeclinic.pronline.org`, system version V2.13.4. The raw document was not committed.

Written test date: **28/11/2025**. That date is earlier than this review and is flagged for owner confirmation. It was not changed. The document also ends with an editorial note asking the sender to verify the count and the date. The detailed status column itself is 48 PASS and 16 FAIL.

Patient names, the recorded patient number, and the laboratory, radiology, and specimen identifiers are omitted from this file.

RT-30 through RT-33 have no separate Actual Result cell. Their historical actual text is the comment in that table, plus the matching defect-register sentence where the same document states one.

Historical FAIL values are unchanged. A local PASS below is a new disposable execution. It is not a rewrite of the historical result. Hosted execution is NOT_PERFORMED for every row.

## Counts from this reading

| Bucket | IDs |
| --- | --- |
| Historical PASS | 48 |
| Historical FAIL | 16 |
| Current local PASS | 50 |
| Current local FAIL | 0 |
| Current NOT_RUN | RT-11, RT-17, RT-18, RT-19, RT-20, RT-21, RT-22, RT-23, RT-24, RT-50 |
| Policy disabled | RT-03, RT-08 |
| Provider blocked | RT-07 |
| Approved workflow differs from the tester expectation | RT-31 |

## RT-01 through RT-13

### RT-01
Module: Public access. Description: Open the ActiveClinic public website. Expected: the website opens. Historical actual: it opened. Historical: PASS. Policy: public marketing remains available. Source: ActiveClinic public shell. Test: `tests/e2e/v13/v13-ac-platform-qa.spec.js` G324, `page.goto("/")`. Type: browser. Local: PASS. Hosted: NOT_PERFORMED. Open: none. Tester action: open the public origin on the approved SHA and record the HTTP status.

### RT-02
Module: Public access. Description: Open a public clinic website. Expected: visitors can view published clinic information. Historical actual: published clinic information was accessible. Historical: PASS. Policy: published content is public; drafts stay private. Source: clinic public website routes. Test: AC-WEB-08 and AC-FU-WEB-02 load the clinic public URL. Type: browser. Local: PASS. Hosted: NOT_PERFORMED. Open: none. Tester action: open one published clinic page on the hosted SHA.

### RT-03
Module: Appointments. Description: Open public appointment booking. Expected by the tester: visitors can book where booking is available. Historical actual: the page displayed “Clinic doesn’t have booking yet.” Historical: FAIL. Bug: BUG-03. Policy: public booking stays disabled. Source: booking page used by AC-PUB-01. Test: AC-PUB-01. Type: browser. Local: restriction verified. This is not a fix and not a PASS of the tester’s booking journey. Hosted: NOT_PERFORMED. Open: BLOCKED_BY_POLICY. Tester action: confirm booking stays unavailable. Do not enable it.

### RT-04
Module: Authentication. Description: Sign in with correct credentials. Expected: the assigned workspace opens. Historical actual: sign-in succeeded. Historical: PASS. Policy: staff password sign-in remains enabled. Source: staff login route. Test: “AC administrator login reaches the clinic workspace”. Type: browser. Local: PASS. Hosted: NOT_PERFORMED. Open: none. Tester action: sign in with the issued hosted QA account.

### RT-05
Module: Authentication. Description: Sign out. Expected: the user is logged out. Historical actual: sign-out succeeded. Historical: PASS. Policy: logout remains required. Source: `/logout`. Test: G165 ends at `/logout` and a later `/app/patients` returns to login. Type: browser. Local: PASS. Hosted: NOT_PERFORMED. Open: none. Tester action: sign out and confirm a protected page returns to login.

### RT-06
Module: Authentication. Description: Sign in with incorrect credentials. Expected: incorrect details are rejected. Historical actual: they were rejected. Historical: PASS. Policy: failed sign-in must not open the staff shell. Source: staff login route. Test: G324 submits a wrong password and stays on `/login` without the staff shell. Type: browser. Local: PASS. Hosted: NOT_PERFORMED. Open: none. Tester action: use a wrong password for an issued account and confirm the workspace does not open.

### RT-07
Module: Authentication. Description: Email OTP verification. Expected: the system sends an OTP to the registered email and the verification completes. Historical actual: email OTP was not received or completed. Historical: FAIL. Bug: BUG-01. Policy: live email stays off until the Resend sender, one approved recipient, and the private pepper are present. Source: OTP adapters remain delivery-inactive. Test: `tests/e2e/v13/v13-ac-email-otp.spec.js` uses the testing channel. It was not run as mailbox proof in this gate. Type: provider. Local: BLOCKED_BY_PROVIDER. Hosted: NOT_PERFORMED. Open: live mailbox. Tester action: do not treat a testing code as this row. A pass requires a received message that completes the protected action.

### RT-08
Module: Authentication. Description: Forgot password using SMS. Expected by the tester: a reset message arrives on the registered phone. Historical actual: no SMS was received. Historical: FAIL. Bug: BUG-02. Policy: SMS remains unauthorized. Source: approval register. Test: AC-AUTH-04 and AC-FU-PORTAL-05 are testing-mode recovery, not SMS. Type: policy. Local: SMS not sent. Not a PASS. Hosted: NOT_PERFORMED. Open: BLOCKED_BY_POLICY. Tester action: confirm the product does not claim an SMS was sent.

### RT-09
Module: Clinic registration. Description: Register a new clinic. Expected: valid details create the clinic. Historical actual: registration completed. Historical: PASS. Policy: registration remains available. Source: clinic registration flow. Test: AC-REG-01 and AC-FU-WEB-02. Type: browser. Local: PASS. Hosted: NOT_PERFORMED. Open: none. Tester action: register only a disposable hosted QA clinic if the owner allows it.

### RT-10
Module: Clinic registration. Description: Register with a duplicate phone number. Expected: the configured phone rule is applied. Historical actual: a phone already used by another clinic was accepted. Historical: PASS. Policy: the same phone reuses the identity when the password matches and rejects a different password. Source: registration reuse rule. Test: AC-REG-01. Type: browser. Local: PASS for that rule. A second clinic with a different password was refused. Hosted: NOT_PERFORMED. Open: none. Tester action: repeat the duplicate-phone case and record whether the hosted rule matches this one.

### RT-11
Module: Clinic registration. Description: A user associated with more than one clinic selects a workspace. Expected: the workspace prompt is shown. Historical actual: the prompt was displayed. Historical: PASS. Policy: multi-clinic selection remains a real journey. Source: not re-opened in this gate. Test: none in the authorized browser suite. Type: none. Local: NOT_RUN. Hosted: NOT_PERFORMED. Open: coverage gap, not a confirmed defect. Tester action: use an account that belongs to two clinics and record the prompt.

### RT-12
Module: Clinic registration. Description: Access the selected clinic workspace. Expected: the selected clinic opens after authentication. Historical actual: the workspace opened. Historical: PASS. Policy: a signed-in clinic admin reaches that clinic. Source: staff shell. Test: administrator login. Type: browser. Local: PASS for a single-clinic account. The multi-clinic choice in RT-11 was not repeated. Hosted: NOT_PERFORMED. Open: none for the single-clinic path. Tester action: after RT-11, open the chosen clinic.

### RT-13
Module: Authentication. Description: Open role-specific dashboards. Expected: each role sees its dashboard. Historical actual: role dashboards were accessible. Historical: PASS. Policy: department routes stay permissioned. Source: staff, reception, clinical, laboratory, and radiology routes. Test: staff login, AC-REC-02, G168, G224, and G229. Type: browser. Local: PASS for those roles. Hosted: NOT_PERFORMED. Open: none. Tester action: sign in as each issued role and open its home.

## RT-14 through RT-29

### RT-14
Module: Website. Description: Edit existing website text. Expected: existing text can be edited. Historical actual: edits were accepted. Historical: PASS. Policy: existing sections remain editable. Source: website section settings. Test: AC-WEB-08. Type: browser. Local: PASS. Hosted: NOT_PERFORMED. Open: none. Tester action: edit an existing section and save.

### RT-15
Module: Website. Description: Save edited text as a draft. Expected: the draft is saved without publishing. Historical actual: the draft was saved. Historical: PASS. Policy: drafts stay off the public page. Source: website draft mode. Test: AC-WEB-08. Type: browser. Local: PASS. Hosted: NOT_PERFORMED. Open: none. Tester action: confirm the public page does not show the draft.

### RT-16
Module: Website. Description: Publish edited website text. Expected: the public website shows the change. Historical actual: the change was published. Historical: PASS. Policy: publish is an explicit action. Source: website publish route. Test: AC-WEB-08. Type: browser. Local: PASS. Hosted: NOT_PERFORMED. Open: none. Tester action: publish and reload the public page.

### RT-17
Module: Website. Description: Upload images into existing sections. Expected: upload and update succeed. Historical actual: images uploaded. Historical: PASS. Policy: media upload remains a supported existing-section action. Source: website media upload form. Test: no authorized file-upload execution. Type: none. Local: NOT_RUN. Hosted: NOT_PERFORMED. Open: coverage gap. Tester action: upload one small authorized image into an existing section.

### RT-18
Module: Website. Description: Save uploaded images as drafts. Expected: the upload is saved as a draft. Historical actual: the draft was saved. Historical: PASS. Policy: unpublished media stays off the live page. Source: website draft. Test: none for a file upload. Type: none. Local: NOT_RUN. Hosted: NOT_PERFORMED. Open: coverage gap. Tester action: save the upload without publishing and confirm the live page is unchanged.

### RT-19
Module: Website. Description: Publish uploaded images. Expected: the public website shows the image. Historical actual: the image was published. Historical: PASS. Policy: publish makes the saved image public. Source: website publish. Test: AC-FU-WEB-02 publishes an image reference, not a file upload. Type: browser for the reference only. Local: NOT_RUN for file upload. Hosted: NOT_PERFORMED. Open: coverage gap. Tester action: publish the uploaded image and reload.

### RT-20
Module: Website. Description: Edit About and Welcome sections. Expected: existing text and images in those sections update. Historical actual: they updated. Historical: PASS. Policy: those sections remain editable. Source: website sections. Test: none named for About or Welcome. Type: none. Local: NOT_RUN. Hosted: NOT_PERFORMED. Open: coverage gap. Tester action: edit both sections, save, and reopen them.

### RT-21
Module: Website. Description: Add a service listing with name, description, and image. Expected: the service is added. Historical actual: it was added. Historical: PASS. Policy: catalogue services remain separate from clinical orders. Source: website service catalogue. Test: not in the authorized v13 suite. Type: none. Local: NOT_RUN. Hosted: NOT_PERFORMED. Open: coverage gap. Tester action: add one disposable service listing.

### RT-22
Module: Website. Description: Publish a service listing. Expected: the public website shows it. Historical actual: it was published. Historical: PASS. Policy: unpublished services stay private. Source: website publish. Test: none in this suite. Type: none. Local: NOT_RUN. Hosted: NOT_PERFORMED. Open: coverage gap. Tester action: publish the RT-21 service and open the public page.

### RT-23
Module: Website. Description: Add doctor name, qualifications, specialisation, and image. Expected: the doctor listing is added. Historical actual: it was added. Historical: PASS. Policy: public doctor profiles stay in the website catalogue. Source: website doctor catalogue. Test: none in this suite. Type: none. Local: NOT_RUN. Hosted: NOT_PERFORMED. Open: coverage gap. Tester action: add one disposable doctor profile.

### RT-24
Module: Website. Description: Edit clinic location, hours, and contact details. Expected: those details can be updated. Historical actual: updates were accepted. Historical: PASS. Policy: contact details remain editable by the clinic. Source: website clinic details. Test: none in this suite. Type: none. Local: NOT_RUN. Hosted: NOT_PERFORMED. Open: coverage gap. Tester action: change one contact field, save, and reload.

### RT-25
Module: Website. Description: Change the website theme. Expected: the selected theme is applied. Historical actual: it was applied. Historical: PASS. Policy: BlessBoard themes stay unavailable on ActiveClinic. Source: theme catalogue. Test: AC-WEB-09. Type: browser. Local: PASS. Hosted: NOT_PERFORMED. Open: none. Tester action: select an ActiveClinic theme and preview it.

### RT-26
Module: Website. Description: Save the theme as a draft. Expected: the draft is saved. Historical actual: the draft was saved. Historical: PASS. Policy: theme preview is draft until publish. Source: theme API returns `published: false`. Test: AC-WEB-09. Type: browser. Local: PASS. Hosted: NOT_PERFORMED. Open: none. Tester action: confirm the live page does not change before publish.

### RT-27
Module: Website. Description: Publish the theme. Expected: the public website shows it. Historical actual: it was published. Historical: PASS. Policy: publish is explicit. Source: website publish. Test: AC-WEB-09. Type: browser. Local: PASS. Hosted: NOT_PERFORMED. Open: none. Tester action: publish and reload the public clinic page.

### RT-28
Module: Website. Description: Add a new text section and then edit it. Expected: the new section can be edited after it is added. Historical actual: the section could be added, but its content could not be edited. Historical: FAIL. Bug: BUG-07. Policy: a new text section uses the same settings form as an existing section. Source: website section settings. Test: AC-FU-WEB-02 creates a text section, saves a heading and body, rejects an unsafe button URL, keeps it private, then publishes and reloads. Type: browser. Local: PASS. Hosted: NOT_PERFORMED. Open: hosted retest. Tester action: add a new text section, edit it, save, preview, publish, and reload.

### RT-29
Module: Website. Description: Add a new image section, upload an image, and save. Expected: the new section can be saved, previewed, and published. Historical actual: an image could be uploaded, but the new section could not be saved or previewed. Historical: FAIL. Bug: BUG-08. Policy: an authorized image reference is valid section content. Source: section image fields. Test: AC-FU-WEB-02 saves a new image section, keeps it off the live page, publishes it, and reloads. Type: browser. Local: PASS for save, preview, and publish. A binary file upload was not repeated. Hosted: NOT_PERFORMED. Open: hosted retest, including one real upload if the tester still uses the upload control. Tester action: add the section, save, confirm the draft is private, publish, and reload.

## RT-30 through RT-44

### RT-30
Module: Patient portal. Description: Existing patient portal sign-in. Expected: a registered patient signs in with valid credentials. Historical actual: existing patients could not access the portal. Defect register: “Invalid credentials.” Historical: FAIL. Bug: BUG-04. Policy: sign-in follows a completed activation. Source: `activeClinicPatientPortalRoutes.js`. Test: AC-FU-PORTAL-01 signs in after activation and opens the profile. Type: browser and PostgreSQL. Local: PASS. Hosted: NOT_PERFORMED. Open: hosted retest. Tester action: activate one hosted chart, then sign in with that password.

### RT-31
Module: Patient portal. Description: New patient portal registration. Expected by the tester: a new patient can register and create a portal account. Historical actual: registration was unsuccessful. Defect register: “No matching patient record found.” Historical: FAIL. Bug: BUG-05. Policy: the portal does not create a patient. Clinic staff create the chart. The form says so. Source: `no_patient_match` in `activeClinicPatientPortalRoutes.js`. Test: AC-FU-PORTAL-01 and PAT-01. Type: browser. Local: the refusal is verified. This is not a PASS of self-registration and not an open defect. Hosted: NOT_PERFORMED. Open: owner confirmation of the chart-first rule. Tester action: try a phone with no chart. Expect the no-matching-record message and no new chart. Do not enable unmatched self-registration under this approval.

### RT-32
Module: Patient portal. Description: Existing patient portal registration. Expected: an existing patient can activate a portal account. Historical actual: activation did not complete. Defect register: the phone was reported as already used, and portal access still failed. Historical: FAIL. Bug: BUG-06. Policy: the first match activates one account. A second registration must not create a second chart. Source: portal phone match. Test: AC-FU-PORTAL-01. Type: browser and PostgreSQL. Local: PASS. One patient row remains. Hosted: NOT_PERFORMED. Open: hosted retest. Tester action: activate a staff-created chart, then repeat registration and confirm it does not create another chart.

### RT-33
Module: Patient portal. Description: Access the portal after registration. Expected: a registered portal account can be opened. Historical actual: not separately stated. Comment: portal access was not functioning. Historical: FAIL. Bug: covered by the portal defects, with no separate bug id. Policy: activation leads to sign-in and the profile. Source: portal login and profile. Test: AC-FU-PORTAL-01. Type: browser. Local: PASS. Hosted: NOT_PERFORMED. Open: hosted retest. Tester action: after RT-32, open the portal home and the profile.

### RT-34
Module: Reception. Description: Search by a recorded patient number. Expected: the correct chart is retrieved. Historical actual: the correct chart was retrieved. Historical: PASS. Policy: search stays inside the signed-in clinic. Source: `/app/patients`. Test: G165 `patient_number` query. Type: browser. Local: PASS. Hosted: NOT_PERFORMED. Open: none. Tester action: search a hosted QA patient number. Do not record the number in git.

### RT-35
Module: Reception. Description: Search by patient name. Expected: the matching chart is retrieved. Historical actual: the chart was found. Historical: PASS. Policy: name search requires at least two characters. Source: patients list `q`. Test: G165 `q` query. Type: browser. Local: PASS. Hosted: NOT_PERFORMED. Open: none. Tester action: search the QA patient’s family name.

### RT-36
Module: Reception. Description: Search by phone number. Expected: the chart for that phone is retrieved. Historical actual: the chart was found. Historical: PASS. Policy: phone search matches the stored number. Source: patients list `phone`. Test: G165 `phone` query and the second G165 find-phone flow. Type: browser. Local: PASS. Hosted: NOT_PERFORMED. Open: none. Tester action: search the QA patient’s phone.

### RT-37
Module: Reception. Description: Open a patient record. Expected: the full chart opens. Historical actual: the chart opened. Historical: PASS. Policy: another clinic cannot open it. Source: `/app/patients/:number`. Test: G165 opens the chart and reloads it. Type: browser. Local: PASS. Hosted: NOT_PERFORMED. Open: none. Tester action: open the chart from the search result.

### RT-38
Module: Reception. Description: Register a new patient. Expected: reception can register a patient. Historical actual: registration succeeded. Historical: PASS. Policy: staff registration creates the chart. The portal does not. Source: `/app/patients/new`. Test: G165, AC-REC-02, and AC-FU-PORTAL-01. Type: browser. Local: PASS. Hosted: NOT_PERFORMED. Open: none. Tester action: register one disposable hosted patient.

### RT-39
Module: Reception. Description: Start a walk-in encounter. Expected: reception can start a walk-in. Historical actual: the walk-in started. Historical: PASS. Policy: the walk-in stays in that clinic. Source: reception walk-in route. Test: AC-REC-02. Type: browser. Local: PASS. Hosted: NOT_PERFORMED. Open: none. Tester action: start a walk-in for the QA patient.

### RT-40
Module: Reception. Description: Attach the requested service to the walk-in. Expected: the service is attached. Historical actual: it was attached. Historical: PASS. Policy: the walk-in uses a clinic service point. Source: reception walk-in form. Test: AC-REC-02 selects a service point and shows it on the queue. Type: browser. Local: PASS. Hosted: NOT_PERFORMED. Open: none. Tester action: attach one service point and confirm it on the queue.

### RT-41
Module: Reception. Description: Add a new patient to the waiting queue. Expected: the new patient appears on the queue. Historical actual: the patient was queued. Historical: PASS. Policy: queue membership follows the walk-in. Source: reception queue. Test: AC-FU-REC-03. Type: browser. Local: PASS. Hosted: NOT_PERFORMED. Open: none. Tester action: queue the new QA patient and reload the queue.

### RT-42
Module: Reception. Description: Add an existing patient to the queue by patient number. Expected: the existing chart is queued and not duplicated. Historical actual: the existing patient was queued. Historical: PASS. Policy: check-in must not create a second chart. Source: reception check-in. Test: AC-FU-REC-04. Type: browser. Local: PASS. Hosted: NOT_PERFORMED. Open: none. Tester action: queue an existing number and confirm the chart count stays one.

### RT-43
Module: Triage. Description: Record temperature, blood pressure, pulse, and oxygen saturation. Expected: those values are saved and visible to the clinician. Historical actual: 37.8°C, 120/80 mmHg, pulse 82 bpm, and SpO2 98% were saved. Historical: PASS. Policy: each observation is its own row. Source: `vital-signs-entry-content.ejs`. Test: AC-REC-03 records 37.8 C, 120/80, 98 %, and 72 bpm. Type: browser. Local: PASS. The pulse value in this run is 72 bpm, not the historical 82 bpm. Hosted: NOT_PERFORMED. Open: none. Tester action: record the four observations and reopen the encounter.

### RT-44
Module: Triage. Description: Correct saved vital signs. Expected: an authorised user can correct a saved value and the change is tracked. Historical actual: no edit option was available after saving. Historical: FAIL. Bug: BUG-09. Policy: correction appends a row. The original remains. Source: `correctVitalSignObservation`. Test: AC-REC-03 and HTTP `runAcRec03`. Type: browser and PostgreSQL. Local: PASS. The original 72 bpm remains, 80 bpm corrects it, and the reason is stored. Hosted: NOT_PERFORMED. Open: hosted retest. Tester action: correct one value, confirm both values remain, and confirm an unauthorised session cannot change it.

## RT-45 through RT-64

### RT-45
Module: Clinician. Description: Record subjective history. Expected: the reported history is saved. Historical actual: the symptom text was saved. Historical: PASS. Policy: the note stays a draft until the encounter is completed. Source: consultation note. Test: G168 `#chief_complaint` and `#history_text`. Type: browser and PostgreSQL. Local: PASS. Hosted: NOT_PERFORMED. Open: none. Tester action: save subjective text and reload it.

### RT-46
Module: Clinician. Description: Record examination findings. Expected: findings are saved. Historical actual: the findings were saved. Historical: PASS. Policy: objective text is part of the same note. Source: consultation note. Test: G168 `#observations`. Type: browser and PostgreSQL. Local: PASS. Hosted: NOT_PERFORMED. Open: none. Tester action: save objective text and reload it.

### RT-47
Module: Clinician. Description: Record a diagnosis. Expected: the diagnosis is saved. Historical actual: an upper-respiratory diagnosis was saved. Historical: PASS. Policy: the clinician enters the diagnosis. The test does not choose a clinical code. Source: consultation note. Test: G168 `#diagnosis`. Type: browser and PostgreSQL. Local: PASS. Hosted: NOT_PERFORMED. Open: none. Tester action: save the diagnosis text used on the hosted chart.

### RT-48
Module: Clinician. Description: Record a treatment plan. Expected: the plan is saved. Historical actual: rest, fluids, steam inhalation, and return instructions were saved. Historical: PASS. Policy: the plan is clinician-entered text. Source: consultation note. Test: G168 `#treatment_plan`. Type: browser and PostgreSQL. Local: PASS. Hosted: NOT_PERFORMED. Open: none. Tester action: save a plan and reload it.

### RT-49
Module: Clinician. Description: Prescribe medication. Expected: the medication is saved. Historical actual: the named medicines were recorded. Historical: PASS. Policy: a manual prescription is not financial posting and does not dispense stock by itself. Source: prescription order. Test: G168 creates the order and G177 prints a stocked synthetic dispense. Type: browser and PostgreSQL. Local: PASS. Hosted: NOT_PERFORMED. Open: none. Tester action: save one prescription. Do not post a payment.

### RT-50
Module: Clinician. Description: Record follow-up instructions. Expected: follow-up instructions are saved. Historical actual: a review after three days was saved. Historical: PASS. Policy: follow-up text must remain available to the clinician. Source: no separate follow-up field was asserted. Test: none. G168’s treatment plan is not this sentence. Type: none. Local: NOT_RUN. Hosted: NOT_PERFORMED. Open: coverage gap. Tester action: enter the follow-up instruction in the field the hosted encounter provides and reload it.

### RT-51
Module: Clinician. Description: Record referral details. Expected: a referral, or a statement that none is needed, is saved. Historical actual: a no-referral statement was saved. Historical: PASS. Policy: referral text is part of the note and can be printed. Source: consultation note. Test: G168 `#referral` and the referral print region. Type: browser and PostgreSQL. Local: PASS. Hosted: NOT_PERFORMED. Open: none. Tester action: save a referral statement and print it.

### RT-52
Module: Laboratory. Description: Create a laboratory request. Expected: the clinician can order a laboratory investigation. Historical actual: an FBC request was created. Historical: PASS. Policy: the request starts at pending collection. Source: laboratory order route. Test: G224 creates a CBC request. Type: browser and PostgreSQL. Local: PASS. The automated code is CBC, not the historical label FBC. Hosted: NOT_PERFORMED. Open: none. Tester action: create one FBC request from the encounter.

### RT-53
Module: Radiology. Description: Create a radiology request. Expected: the clinician can order imaging. Historical actual: a chest X-ray request was created. Historical: PASS. Policy: a new request is pending. Source: radiology order route. Test: G229. Type: browser and PostgreSQL. Local: PASS. Hosted: NOT_PERFORMED. Open: none. Tester action: create one chest X-ray request.

### RT-54
Module: Laboratory. Description: Collect a laboratory specimen. Expected: collection details are recorded. Historical actual: a blood specimen was collected and a specimen id was shown. Historical: PASS. Policy: collection is a stored specimen row. Source: specimen collection route. Test: G224 selects blood and records a collected specimen. Type: browser and PostgreSQL. Local: PASS. The anatomical site sentence was not re-entered. Hosted: NOT_PERFORMED. Open: none for collection itself. Tester action: record the collection details present on the hosted form.

### RT-55
Module: Laboratory. Description: Receive a laboratory specimen. Expected: receipt and condition can be recorded. Historical actual: the specimen was marked received, with condition notes. Historical: PASS. Policy: received is a stored status. Source: specimen receive route. Test: G224. Type: browser. Local: PASS. The condition-note sentence was not re-entered. Hosted: NOT_PERFORMED. Open: none. Tester action: mark the specimen received and save the condition note if the form has one.

### RT-56
Module: Laboratory. Description: Record FBC results, including haemoglobin, white cells, red cells, and platelets. Expected: results can be entered and saved. Historical actual: no result-entry action was available. The workflow stopped at Received. Historical: FAIL. Bug: BUG-10. Policy: a received request can take a result. A second person verifies it. Source: laboratory result route. Test: G224 uses Enter result, saves haemoglobin and white cells, and a second technician verifies. Type: browser and PostgreSQL. Local: PASS. Red cells and platelets were not separate automated components. Hosted: NOT_PERFORMED. Open: hosted retest. Tester action: on a received request, enter the result and confirm a different user can verify it.

### RT-57
Module: Laboratory. Description: View a received request in the processing queue. Expected: a received request is available under the appropriate processing filter. Historical actual: the In Analysis filter showed no matching orders. Historical: FAIL. Bug: BUG-11. Policy: there is no stored `analysis` status. Received and processing are different. The hub label “Lab in analysis” counts `processing` only. Source: `laboratoryQueueTabs` in `clinicalOperationsRules.js`. Test: G224 shows the request on `status=received` and not on `status=processing` before a result exists. Type: browser. Local: PASS for that contract. Hosted: NOT_PERFORMED. Open: hosted retest. Tester action: after receipt, open Received and confirm the request is there. Do not expect it under Processing until result entry has moved it.

### RT-58
Module: Laboratory. Description: Laboratory dashboard counters. Expected: counters reflect existing requests and their statuses. Historical actual: Pending Collection, Processing, and Verified were zero despite an existing request. Historical: FAIL. Bug: BUG-12. Policy: each counter counts its own status. A received request increments Received. Source: laboratory dashboard `data-ac-lab-count`. Test: G224 and HTTP `runG224Laboratory`. Type: browser and PostgreSQL. Local: PASS. Hosted: NOT_PERFORMED. Open: hosted retest. Tester action: compare each visible counter with the queue for that status.

### RT-59
Module: Diagnostics. Description: Diagnostics workspace counters. Expected: laboratory and radiology counters reflect existing requests. Historical actual: Lab pending collection, Lab in analysis, Radiology pending, and Radiology in progress were zero despite existing requests. Historical: FAIL. Bug: BUG-13. Policy: the hub shows those four statuses only. The numbers must equal the stored counts. Source: `diagnostics-hub-content.ejs`. Test: HTTP `runG224Laboratory` and `runG229Radiology` compare the hub numbers with `GROUP BY status`. Type: HTTP and PostgreSQL. Local: PASS. Hosted: NOT_PERFORMED. Open: hosted retest. Tester action: create one pending lab request and one pending radiology request, then read the four hub numbers.

### RT-60
Module: Radiology. Description: View radiology requests in Open Queue and In Progress. Expected: requests appear in the queue that matches their status. Historical actual: the request was visible only under All. Historical: FAIL. Bug: BUG-14. Policy: Open queue includes pending, in progress, and completed. A pending request is not yet in progress. Source: `radiologyQueueTabs`. Test: G229 shows a pending request under Pending and Open queue, and not under In progress. Type: browser. Local: PASS. Hosted: NOT_PERFORMED. Open: hosted retest. Tester action: with a new request, open All, Open queue, and In progress. Record which one lists it.

### RT-61
Module: Radiology. Description: Open a radiology request. Expected: request details are visible. Historical actual: the request opened, including the indication and the ordering clinician. Historical: PASS. Policy: another department without access cannot open the queue. Source: radiology request page. Test: G229. Reception is denied the queue before the authorised role opens the request. Type: browser. Local: PASS. Hosted: NOT_PERFORMED. Open: none. Tester action: open the request as radiology staff.

### RT-62
Module: Radiology. Description: Open the reporting form. Expected: technique, findings, impression, and report entry are available. Historical actual: the form opened with those fields. Historical: PASS. Policy: the report is entered by radiology staff. Source: radiology report form. Test: G229 fills technique, findings, and impression. Type: browser. Local: PASS. A separate critical-finding control was not asserted. Hosted: NOT_PERFORMED. Open: none. Tester action: open the report form and confirm the fields.

### RT-63
Module: Radiology. Description: Save a radiology report. Expected: the report is saved and visible to the clinician. Historical actual: a normal chest report was saved and was visible to the clinician. Historical: PASS. Policy: the author cannot verify their own report. Source: radiology report verification. Test: G229. Type: browser and PostgreSQL. Local: PASS. Hosted: NOT_PERFORMED. Open: none. Tester action: save the report, verify it as a second user, and reopen the encounter as the clinician.

### RT-64
Module: System-wide. Description: Print clinical documents. Expected: SOAP notes, laboratory requests and results, radiology reports, prescriptions, vital signs, and referrals can be printed. Historical actual: no print option was available in Reception, Triage, Clinician, Laboratory, or Radiology. Historical: FAIL. Bug: BUG-15. Policy: print uses the on-page clinical region. It does not create a financial document. Source: print regions in the clinical, vitals, laboratory, and radiology views. Test: G168 SOAP and referral, G177 prescription, AC-REC-03 vitals, G224 laboratory, and G229 radiology. Type: browser. Local: PASS. Hosted: NOT_PERFORMED. Open: hosted retest. Tester action: use each print control and confirm the patient and clinic identity on the page. Do not need a physical printer; record that the print action is present and the region contains the record.
