# V2134 G324 coverage gaps

No new product defect was confirmed in the transcribed failures that already have local evidence. The gaps below are missing executions, policy blocks, or an owner decision. They are not marked PASS.

## Not executed locally

| ID | What is missing |
| --- | --- |
| RT-11 | The multi-clinic workspace prompt was not opened. |
| RT-17 | File upload into an existing website section was not executed. |
| RT-18 | Saving that upload as a draft was not executed. |
| RT-19 | Publishing a file upload was not executed. An image reference publish is a different action. |
| RT-20 | About and Welcome were not edited as named sections. |
| RT-21 | A website service listing was not created in the authorized suite. |
| RT-22 | A service listing was not published. |
| RT-23 | A website doctor profile was not created. |
| RT-24 | Clinic location, hours, and contact details were not edited. |
| RT-50 | A follow-up instruction was not saved in its own field. The treatment-plan assertion is RT-48. |

Older catalogue tests outside `npm run test:v13:contract` were not run and are not evidence for this gate.

## Partial executions that are still local passes

RT-29 saved, previewed, and published a new image section with an image reference. The historical upload control was not clicked again.  
RT-43 recorded the four observation types. The automated pulse was 72 bpm.  
RT-52 ordered CBC. The historical request was labelled FBC.  
RT-54 and RT-55 recorded collection and receipt. The long condition sentences were not retyped.  
RT-56 saved haemoglobin and white cells. Red cells and platelets were not separate components.  
RT-62 did not assert a separate critical-finding control.

## Policy and provider

RT-03 stays a disabled public-booking journey. The local test proves the restriction.  
RT-08 stays an unauthorized SMS journey. Testing-mode password recovery is not SMS.  
RT-07 stays blocked until a real mailbox message completes OTP. The email OTP browser file was not treated as delivery proof.  
Community Benefits financial posting stays disabled. It is not one of the 64 rows.

## Owner decision

RT-31 expected a new patient to create an account from the portal. The approved workflow refuses a phone with no staff-created chart and creates no patient. Local tests verify that refusal. The historical FAIL is not reclassified as a fixed defect and not reclassified as a passing self-registration.

## Added coverage in this gate

One new browser test, G324, opens the public home and rejects a wrong staff password.  
G165 now searches the directory by name and phone as well as patient number.  
AC-REC-03 now records temperature, blood pressure, and oxygen saturation before the existing heart-rate correction.  
G229 now checks Open queue while the request is still pending.  
AC-FU-WEB-02 now waits for the publish response before opening the public page. The earlier failure was that navigation, not a section that could not be saved.
