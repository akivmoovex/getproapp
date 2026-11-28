# V2134 G324 hosted retest runbook

HOSTED_DEPLOYMENT=NOT_PERFORMED.

This is the acceptance script for a later deployment. It does not authorize that deployment. Hostinger was not changed. Workers were not restarted. Hosted migrations were not run. No hosted backup was taken.

## What is deployed now

Read-only checks during this review:

| Surface | Result |
| --- | --- |
| BlessBoard `/healthz` | 200, ok, gitSha `8aa6fda62294`, branch `V11`, branchSource `GETPRO_GIT_BRANCH`, environment testing, deployment `moovex-platform-testing`, schemaCompatible true |
| ActiveClinic `/healthz` | the same SHA, branch, and schema flag |
| BlessBoard About | version 2.13.4 |
| ActiveClinic About | version 2.13.4 |

`8aa6fda62294` is the G323 parent. It does not contain the G324 browser additions. `schemaCompatible: true` is an observation, not permission to migrate.

The panel value `GETPRO_GIT_BRANCH=V11` does not match git branch `V13`. Source health prefers the panel value. The correction is to set that panel value to `V13` only inside a separate owner approval that also names the SHA. This review did not change it.

## SHA pin

Deploy only the `V13` commit that contains this runbook, after `git rev-parse origin/V13` equals that commit. Do not deploy `8aa6fda6229413975e4e35360e72b1d0db8ae1fe` as the G324 candidate.

## Backup and rollback

Before that future deploy, the operator takes a hosted database backup and records its location. This review did not take one.

Rollback is a redeploy of `8aa6fda6229413975e4e35360e72b1d0db8ae1fe`, which is the SHA on the host now. Leave the panel value unchanged unless the same approval changed it. Do not apply `048_otp_challenges.sql`. It is absent. Platform migrations through `047` and ActiveClinic migrations through `044` are the expected source set. Do not run a hosted migration as part of this document.

## Accounts

Use the hosted QA identities already issued for the testing environment. Do not copy disposable local passwords into the hosted run. Do not create a second chart for a real patient. Do not post a payment. Do not send SMS. Do not send a live OTP email.

Record `/healthz` gitSha and branch at the start and at the end. Store screenshots outside git. Do not commit patient names, phone numbers, or request identifiers.

## Manual script

For every row, record PASS, FAIL, BLOCKED_BY_POLICY, or BLOCKED_BY_PROVIDER against the approved expectation. Do not edit the historical 48/16 tally.

| ID | Do this | Approved expected result | Evidence |
| --- | --- | --- | --- |
| RT-01 | Open the public ActiveClinic origin. | The page loads. | Status and heading. |
| RT-02 | Open one published clinic page. | Published clinic information is visible. | Page URL and heading. |
| RT-03 | Open that clinic’s booking page. | Booking stays unavailable. Do not enable it. | The unavailable message. |
| RT-04 | Sign in with the issued staff account. | The clinic workspace opens. | Workspace heading. |
| RT-05 | Sign out, then open a staff page. | The login page returns. | Login URL. |
| RT-06 | Sign in with the right account and a wrong password. | The workspace does not open. | Login page remains. |
| RT-07 | Do not start a live OTP send. | No mailbox delivery is claimed. | BLOCKED_BY_PROVIDER until a received message completes the action. |
| RT-08 | Open forgot-password. | No SMS is promised or sent. | The on-page delivery statement. |
| RT-09 | Register a disposable clinic only if the owner has allowed a hosted registration. | The clinic is created. | Registration result. |
| RT-10 | Repeat registration with the same phone and a different password, then with the matching password. | The different password is refused. The matching password follows the existing identity. | Both results. |
| RT-11 | Sign in with an account that belongs to two clinics. | A workspace choice is shown. | The choice. |
| RT-12 | Choose one clinic. | That clinic’s workspace opens. | Workspace heading. |
| RT-13 | Open the home for each issued role. | Each role sees its own work area and is refused the others. | One page per role. |
| RT-14 | Edit existing website text. | The new text is saved. | Reopened form. |
| RT-15 | Leave it unpublished. | The public page does not show it. | Public page. |
| RT-16 | Publish it. | The public page shows it after reload. | Public page. |
| RT-17 | Upload one small image into an existing section. | The upload is accepted. | Media library. |
| RT-18 | Save that image as a draft. | The live page does not show it. | Public page. |
| RT-19 | Publish the image. | The public page shows it. | Public image. |
| RT-20 | Edit About and Welcome. | Both reopen with the saved content. | Both forms. |
| RT-21 | Add a service name, description, and image. | The service is stored. | Catalogue row. |
| RT-22 | Publish the service. | The public page lists it. | Public page. |
| RT-23 | Add a doctor profile and image. | The profile is stored. | Catalogue row. |
| RT-24 | Edit location, hours, and one contact field. | The saved values reopen. | Form reload. |
| RT-25 | Select an ActiveClinic theme. | BlessBoard themes are absent. The draft preview uses the selected theme. | Theme page and draft URL. |
| RT-26 | Do not publish yet. | The live page keeps the previous theme. | Live page. |
| RT-27 | Publish the theme. | The live page shows it. | Live page. |
| RT-28 | Add a new text section, edit its heading and body, save, preview, publish, and reload. | The draft is private. The published page shows the edited text. | Draft URL and live URL. |
| RT-29 | Add a new image section, save an image, preview, publish, and reload. | The draft is private. The published page shows the image. | Draft URL and live URL. |
| RT-30 | Sign in to the portal with the activated QA patient. | The portal home opens. | Portal URL. |
| RT-31 | Register on the portal with a phone that has no chart. | The no-matching-record message appears and no chart is created. | Message. Do not change the rule. |
| RT-32 | Activate a staff-created chart, then submit the same phone again. | The first activation works. The second attempt does not create a chart. | One chart. |
| RT-33 | Open the portal profile. | The same patient number is shown. | Profile. |
| RT-34 | Search the issued patient number. | That chart is listed. | Result row. |
| RT-35 | Search the patient name. | That chart is listed. | Result row. |
| RT-36 | Search the patient phone. | That chart is listed. | Result row. |
| RT-37 | Open the chart. | The chart page shows the same number after reload. | Chart URL. |
| RT-38 | Register a disposable patient. | A new patient number is issued. | Chart. |
| RT-39 | Start a walk-in. | The queue item is created. | Queue URL. |
| RT-40 | Attach a service point. | The queue shows that service point. | Queue page. |
| RT-41 | Queue the new patient. | The patient is on the waiting list. | Queue page. |
| RT-42 | Queue an existing number. | The same chart is used. | Chart count. |
| RT-43 | Record temperature, blood pressure, pulse, and oxygen saturation. | All four reopen on the encounter. | Vitals page. |
| RT-44 | Correct the pulse and record a reason. | The original and the correction both remain. Another clinic cannot post a change. | Vitals page. |
| RT-45 | Save subjective history. | The text reloads. | Encounter. |
| RT-46 | Save examination findings. | The text reloads. | Encounter. |
| RT-47 | Save a diagnosis. | The text reloads. | Encounter. |
| RT-48 | Save a treatment plan. | The text reloads. | Encounter. |
| RT-49 | Save one medication. | The prescription is stored. No payment is posted. | Encounter. |
| RT-50 | Save a follow-up instruction in the field the encounter provides. | The instruction reloads. | Encounter. |
| RT-51 | Save a referral statement. | The statement reloads and the print region contains it. | Encounter. |
| RT-52 | Order an FBC from the encounter. | A laboratory request is created. | Request page. |
| RT-53 | Order a chest X-ray. | A radiology request is created in pending. | Request page. |
| RT-54 | Collect the specimen. | The specimen is stored as collected. | Specimen page. |
| RT-55 | Receive the specimen. | The request becomes received. | Request status. |
| RT-56 | Enter the result as one user and verify as a second user. | The result is saved and then verified. The clinician can read it. | Result and encounter. |
| RT-57 | Open the Received queue, then Processing. | The received request is in Received. It is not in Processing before result entry. | Both queues. |
| RT-58 | Read the laboratory counters. | Received is not zero while the request is received. Other statuses count only their own rows. | Dashboard. |
| RT-59 | Read the diagnostics hub. | Pending collection, processing, radiology pending, and radiology in progress match the queues. | Hub. |
| RT-60 | Open radiology All, Open queue, and In progress. | A pending request appears in All and Open queue, not in In progress. | Three queues. |
| RT-61 | Open the radiology request. | Indication and ordering details are visible to radiology staff. | Request page. |
| RT-62 | Open the report form. | Technique, findings, and impression can be entered. | Form. |
| RT-63 | Save the report, verify as a second user, and reopen the encounter. | The clinician sees the findings. The author cannot verify alone. | Encounter. |
| RT-64 | Use the print action for the SOAP note, referral, prescription, vitals, laboratory result, and radiology report. | Each region contains the clinical record and identity. | Each print view. |

A hosted PASS is valid only for the SHA recorded from `/healthz` after the approved deploy. The current host is not that SHA.
