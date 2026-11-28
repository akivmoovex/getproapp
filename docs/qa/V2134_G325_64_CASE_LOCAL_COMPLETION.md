# V2134 G325 local completion of the 64-case matrix

ORIGINAL_DOCX_READ=YES in G324. This file does not replace that reading.

Historical results stay 48 PASS and 16 FAIL. The written report date 28/11/2025 remains flagged and was not changed. Patient names and record identifiers stay out of this file. The raw DOCX was not committed.

A local PASS is a disposable execution of the approved behavior. It does not rewrite the historical result. Hosted execution is NOT_PERFORMED for every row. Disabled and provider-blocked rows are not counted as PASS.

## Counts

| Bucket | Count | IDs |
| --- | --- | --- |
| Historical PASS | 48 | unchanged |
| Historical FAIL | 16 | unchanged |
| Supported enabled features executed locally | 60 | every row except RT-03, RT-07, RT-08, and RT-31 |
| Local PASS of the approved behavior | 60 | the same 60 |
| Local NOT_RUN | 0 | the G324 gaps RT-11 and RT-17 through RT-24 and RT-50 are now executed |
| Policy disabled | 2 | RT-03, RT-08 |
| Provider blocked | 1 | RT-07 |
| Approved workflow differs from the tester expectation | 1 | RT-31 |
| Hosted retest required | 64 | every row |

60 + 2 + 1 + 1 = 64.

## Patient portal

Public creation of a new patient and portal activation of an existing staff-created patient are different actions.

Staff registration at `/app/patients/new` creates the chart. That path remains the only way a patient record is created. AC-FU-PORTAL-01, G165, and AC-REC-02 still do this.

Portal activation matches a phone to that existing chart and links one account. AC-FU-PORTAL-01 activates one chart, signs in, and reloads the same patient. A second registration does not create a second chart. AC-FU-PORTAL-05 recovers an existing account with a testing-mode token only. The page still says delivery is unavailable. That recovery is not live email and not SMS.

RT-31 remains a refusal. An unmatched public registration returns `no_patient_match` and creates no patient. The form says patients are registered by clinic staff. PAT-01 and AC-FU-PORTAL-01 verify that refusal. Identity matching was not weakened.

## Newly executed rows

RT-11. `G325 a second clinic shows the workspace prompt and a foreign clinic is refused`. The same synthetic phone and matching password register two clinics. Sign-in opens `/login/select-organization` with heading “Select Your Clinic” and both clinic buttons. A foreign organization id is refused with 401 or 403. Choosing the second clinic opens the staff shell, and the website settings placeholder is that clinic’s name.

RT-17. The same website test rejects a text file on the existing hero slot with the JPEG/PNG/WebP/GIF message, then uploads a synthetic 1×1 PNG through `input[data-gp-we-media-file='1']`. The status says the image uploaded. `platform.website_media` stores `image/png` for that filename. The 5 MB and type checks stayed in the client validator. No upload safeguard was bypassed.

RT-18. Save branding reports “Saved as a draft.” Reload keeps the hero media URL. The draft preview shows the Welcome heading. An anonymous public page does not.

RT-19. After the publish POST, the anonymous public homepage shows the Welcome heading and exactly one image with the saved hero URL. Reload still shows the heading.

RT-20. Introduction heading and body are saved and the heading reloads from the section settings URL. About `metaDescription` is saved and reloads from the page settings URL.

RT-21. A service is added with a display name, description, and a second synthetic PNG on the catalogue image field. `public_website_visible` is true and `public_bookable` is false. The media row for the service filename is `image/png`. Public booking stays off.

RT-22. Before publish, the anonymous public page does not show the service name. After publish, `/services` shows the name and the uploaded service image.

RT-23. A doctor profile is added with public name, title Clinician, specialty, qualifications, and a third synthetic PNG. It does not create a staff login. `activeclinic.staff_members.public_title` is Clinician. After publish, `/doctors` shows the name and the uploaded image.

RT-24. Website phone, email, and hours save as a draft and reload. Facility address and the first open hours interval save and reload. `activeclinic.facilities.address_line_1` matches the saved address. Another clinic’s request for this clinic’s section settings URL does not return the Welcome text, the service name, or the doctor name.

RT-50. G168 fills `#follow_up`, sees that value after save and after reload, and reads the same text from `activeclinic.consultation_notes.follow_up_plan_text`. This is separate from the treatment plan in RT-48.

## Matrix

| ID | Historical | Current local | Test | Evidence | Persistence | Policy | Hosted |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RT-01 | PASS | PASS | G324 public home | Public home status below 400 | Not a write | Public marketing stays available | NOT_PERFORMED |
| RT-02 | PASS | PASS | AC-WEB-08, AC-FU-WEB-02, G325 public pages | Published clinic pages load for an anonymous visitor | Published content | Drafts stay private | NOT_PERFORMED |
| RT-03 | FAIL BUG-03 | POLICY_DISABLED | AC-PUB-01 | Booking GET and POST stay 403 | Not enabled | Public booking stays disabled. Not a PASS | NOT_PERFORMED |
| RT-04 | PASS | PASS | Administrator login | Staff shell opens | Session | Password sign-in stays enabled | NOT_PERFORMED |
| RT-05 | PASS | PASS | G165 logout | Later `/app/patients` returns to login | Session cleared | Logout stays required | NOT_PERFORMED |
| RT-06 | PASS | PASS | G324 wrong password | Stays on `/login` with no staff shell | No session | Failed sign-in stays closed | NOT_PERFORMED |
| RT-07 | FAIL BUG-01 | BLOCKED_BY_PROVIDER | AC email OTP spec is testing-channel only | No mailbox message was received | Not live delivery | Live email stays off | NOT_PERFORMED |
| RT-08 | FAIL BUG-02 | POLICY_DISABLED | AC-AUTH-04 and AC-FU-PORTAL-05 | Testing recovery only. No SMS | No SMS row | SMS stays unauthorized. Not a PASS | NOT_PERFORMED |
| RT-09 | PASS | PASS | AC-REG-01, AC-FU-WEB-02, G325 | Disposable clinics are created | Organization row | Registration stays available | NOT_PERFORMED |
| RT-10 | PASS | PASS | AC-REG-01 and the G325 second clinic | Matching password reuses the identity. A different password is refused | One identity | Phone reuse rule unchanged | NOT_PERFORMED |
| RT-11 | PASS | PASS | G325 workspace prompt | Selector, both clinics, foreign id refused, second clinic opens | Two organizations, one identity | Multi-clinic selection stays required | NOT_PERFORMED |
| RT-12 | PASS | PASS | G325 chooses clinic B | Staff shell and site-name placeholder match clinic B | Selected organization | Selected clinic opens | NOT_PERFORMED |
| RT-13 | PASS | PASS | Staff login, AC-REC-02, G168, G224, G229 | Those role homes open | Role session | Department routes stay permissioned | NOT_PERFORMED |
| RT-14 | PASS | PASS | AC-WEB-08 | Existing section text is edited | Draft section | Existing sections stay editable | NOT_PERFORMED |
| RT-15 | PASS | PASS | AC-WEB-08 and G325 draft preview | Draft is saved and the public page hides it | Draft | Drafts stay unpublished | NOT_PERFORMED |
| RT-16 | PASS | PASS | AC-WEB-08 | Publish response, then the public page shows the text | Published | Publish stays explicit | NOT_PERFORMED |
| RT-17 | PASS | PASS | G325 hero file input | Text file rejected. PNG uploaded. Media row `image/png` | `platform.website_media` | Upload safeguards unchanged | NOT_PERFORMED |
| RT-18 | PASS | PASS | G325 save branding | “Saved as a draft.” Hero URL survives reload. Public page hides it | Draft media URL | Unpublished media stays private | NOT_PERFORMED |
| RT-19 | PASS | PASS | G325 publish | Anonymous homepage shows the heading and the hero image after reload | Published media | Publish makes the saved image public | NOT_PERFORMED |
| RT-20 | PASS | PASS | G325 Introduction and About | Heading and meta description reopen with the saved values | Section and page settings | Those sections stay editable | NOT_PERFORMED |
| RT-21 | PASS | PASS | G325 service form | Name, description, and PNG are stored. Booking checkbox stays clear | Service row and media row | Catalogue stays separate from booking | NOT_PERFORMED |
| RT-22 | PASS | PASS | G325 `/services` | Hidden before publish. Name and image visible after publish | `public_website_visible` true, `public_bookable` false | Public booking stays off | NOT_PERFORMED |
| RT-23 | PASS | PASS | G325 doctor form | Name, title, specialty, qualifications, and PNG. No staff login | `public_title` Clinician | Public profile only | NOT_PERFORMED |
| RT-24 | PASS | PASS | G325 website settings and facility edit | Email, hours, address, and hours interval reload | Facility address row | Contact details stay clinic-editable | NOT_PERFORMED |
| RT-25 | PASS | PASS | AC-WEB-09 | ActiveClinic theme applies. A church theme is rejected | Theme draft | BlessBoard themes stay unavailable | NOT_PERFORMED |
| RT-26 | PASS | PASS | AC-WEB-09 | Theme response is unpublished | Draft | Theme stays draft until publish | NOT_PERFORMED |
| RT-27 | PASS | PASS | AC-WEB-09 | Publish shows the theme on the public page | Published | Publish stays explicit | NOT_PERFORMED |
| RT-28 | FAIL BUG-07 | PASS | AC-FU-WEB-02 | New text section is edited, kept private, published, and reloaded | Section content | Same settings form as an existing section | NOT_PERFORMED |
| RT-29 | FAIL BUG-08 | PASS | AC-FU-WEB-02 | New image section is saved, kept private, published, and reloaded | Image reference | File upload of an existing slot is RT-17, not this row | NOT_PERFORMED |
| RT-30 | FAIL BUG-04 | PASS | AC-FU-PORTAL-01 | Activated patient signs in and opens the profile | One portal identity | Sign-in follows activation | NOT_PERFORMED |
| RT-31 | FAIL BUG-05 | PRODUCT_DECISION | AC-FU-PORTAL-01 and PAT-01 | Unmatched phone is refused and creates no patient | No new patient | Chart-first rule. Not a PASS of self-registration | NOT_PERFORMED |
| RT-32 | FAIL BUG-06 | PASS | AC-FU-PORTAL-01 | First activation works. Repeat does not create a second chart | One patient row | Duplicate account stays blocked | NOT_PERFORMED |
| RT-33 | FAIL | PASS | AC-FU-PORTAL-01 | Portal profile opens for the activated account | Same patient binding | Activation leads to the profile | NOT_PERFORMED |
| RT-34 | PASS | PASS | G165 patient number | The chart is returned | Read | Search stays inside the clinic | NOT_PERFORMED |
| RT-35 | PASS | PASS | G165 name query | The chart is returned | Read | Two-character minimum | NOT_PERFORMED |
| RT-36 | PASS | PASS | G165 phone query | The chart is returned | Read | Stored phone match | NOT_PERFORMED |
| RT-37 | PASS | PASS | G165 chart | The chart reloads | Read | Another clinic cannot open it | NOT_PERFORMED |
| RT-38 | PASS | PASS | G165, AC-REC-02, AC-FU-PORTAL-01 | Staff registration creates the chart | Patient row | Portal does not create patients | NOT_PERFORMED |
| RT-39 | PASS | PASS | AC-REC-02 | Walk-in starts in that clinic | Encounter | Walk-in stays clinic-scoped | NOT_PERFORMED |
| RT-40 | PASS | PASS | AC-REC-02 | Service point appears on the queue | Encounter | Clinic service point | NOT_PERFORMED |
| RT-41 | PASS | PASS | AC-FU-REC-03 | New patient appears on the queue | Queue | Queue follows the walk-in | NOT_PERFORMED |
| RT-42 | PASS | PASS | AC-FU-REC-04 | Existing chart is queued and not duplicated | One chart | Check-in does not create a chart | NOT_PERFORMED |
| RT-43 | PASS | PASS | AC-REC-03 | 37.8 C, 120/80, 98 percent, and 72 bpm | Observation rows | Pulse in this run is 72 bpm | NOT_PERFORMED |
| RT-44 | FAIL BUG-09 | PASS | AC-REC-03 and HTTP `runAcRec03` | 72 bpm remains, 80 bpm corrects it, reason is stored | Both observation rows | Unauthorized session cannot change it | NOT_PERFORMED |
| RT-45 | PASS | PASS | G168 chief complaint and history | Values reload | Consultation note | Draft until completion | NOT_PERFORMED |
| RT-46 | PASS | PASS | G168 observations | Value reloads | Consultation note | Same note | NOT_PERFORMED |
| RT-47 | PASS | PASS | G168 diagnosis | Value reloads | Consultation note | Clinician-entered text | NOT_PERFORMED |
| RT-48 | PASS | PASS | G168 treatment plan | Value reloads | Consultation note | Separate from follow-up | NOT_PERFORMED |
| RT-49 | PASS | PASS | G168 order and G177 dispense | Prescription is stored | Order row | Not a payment posting | NOT_PERFORMED |
| RT-50 | PASS | PASS | G168 `#follow_up` | Value after save, after reload, and in `follow_up_plan_text` | Consultation note | Follow-up stays on the encounter | NOT_PERFORMED |
| RT-51 | PASS | PASS | G168 referral | Referral text and print region | Consultation note | Print is not a financial document | NOT_PERFORMED |
| RT-52 | PASS | PASS | G224 | CBC request starts at pending collection | Laboratory request | Automated code is CBC | NOT_PERFORMED |
| RT-53 | PASS | PASS | G229 | Chest imaging request is pending | Radiology request | New request is pending | NOT_PERFORMED |
| RT-54 | PASS | PASS | G224 | Blood specimen is collected | Specimen row | Site sentence was not retyped | NOT_PERFORMED |
| RT-55 | PASS | PASS | G224 | Specimen is received | Received status | Condition sentence was not retyped | NOT_PERFORMED |
| RT-56 | FAIL BUG-10 | PASS | G224 | Haemoglobin and white cells are saved and a second technician verifies | Result row | Red cells and platelets were not separate components | NOT_PERFORMED |
| RT-57 | FAIL BUG-11 | PASS | G224 | Request is on Received and not on Processing before a result | Status filter | No stored analysis status | NOT_PERFORMED |
| RT-58 | FAIL BUG-12 | PASS | G224 and HTTP laboratory runner | Counters match the statuses they show | Dashboard counts | A received request counts as received | NOT_PERFORMED |
| RT-59 | FAIL BUG-13 | PASS | HTTP laboratory and radiology runners | Hub numbers match `GROUP BY status` | Hub counts | Hub shows four statuses only | NOT_PERFORMED |
| RT-60 | FAIL BUG-14 | PASS | G229 | Pending request is under Open queue and not under In progress | Queue membership | Open includes pending, in progress, and completed | NOT_PERFORMED |
| RT-61 | PASS | PASS | G229 | Radiology opens the request. Reception is denied the queue | Request page | Department isolation | NOT_PERFORMED |
| RT-62 | PASS | PASS | G229 | Technique, findings, and impression are entered | Report draft | A separate critical-finding control was not asserted | NOT_PERFORMED |
| RT-63 | PASS | PASS | G229 | Report is saved and a second person verifies it | Report row | Author cannot verify their own report | NOT_PERFORMED |
| RT-64 | FAIL BUG-15 | PASS | G168, G177, AC-REC-03, G224, G229 | SOAP, referral, prescription, vitals, laboratory, and radiology print regions | Print regions | Print does not create a financial document | NOT_PERFORMED |

## Partial notes that remain

RT-43 pulse is 72 bpm in automation. RT-52 uses CBC. RT-54 and RT-55 do not retype the long specimen sentences. RT-56 does not enter red cells and platelets as separate components. RT-62 does not assert a separate critical-finding control. Those rows stay local PASS with those limits. They are not new gaps.
