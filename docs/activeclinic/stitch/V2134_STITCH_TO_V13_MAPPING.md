# V2134 Stitch to V13 mapping

Origin at this audit: `5ae57d1f3195ea60269134dba478055f7055aa9c` on `V13`. The G325 coverage commit `c947d26cb57e1456c843ba45e06130db074f8c16` is an ancestor. No application file was edited.

None of the 34 frame ids are referenced by an ActiveClinic view. EXISTS_AND_MATCHES is therefore 0. A new route is not required for any concept. NEW_APPLICATION_SCREENS_REQUIRED=0.

| Concept | Class | Existing route and view | Difference that matters |
| --- | --- | --- | --- |
| 01 | EXISTS_NEEDS_VISUAL_UPDATE | Testing email OTP screens and `v13-ac-email-otp.spec.js`. Production send stays fail-closed | The desktop body is email OTP. The mobile frame is the same content inside booking-filters chrome. Resend must not start live mail |
| 02 | EXISTS_NEEDS_VISUAL_UPDATE | Forgot-password views already say delivery is unavailable | The “email being sent” state must not appear unless delivery is actually configured |
| 03 | EXISTS_NEEDS_VISUAL_UPDATE | `auth/reset-password.ejs` and `auth/reset-password-success.ejs` | Visual rules and success state. No new reset route |
| 04 | EXISTS_NEEDS_VISUAL_UPDATE | Patient portal activation. Staff create the chart | The body correctly refuses a second record. Adding email as a match key is a product decision, not part of a visual pass |
| 05 | EXISTS_NEEDS_FUNCTIONAL_UPDATE | Duplicate and no-match responses in `activeClinicPatientPortalRoutes.js` | The design shows a masked chart before activate or recover. The public product currently does not preview a chart. Do not add that preview without approval |
| 06 | EXISTS_NEEDS_VISUAL_UPDATE | Portal home after activation | Success copy only. The mobile frame still contains booking-filters chrome |
| 07 | EXISTS_NEEDS_VISUAL_UPDATE | Laboratory queue views. Statuses are pending collection, collected, received, processing, resulted, verified | Do not add an In Progress or analysis status to match the design tabs |
| 08 | EXISTS_NEEDS_VISUAL_UPDATE | `diagnostics-enter-laboratory-result-content.ejs`. QA enters haemoglobin and white cells | The design shows four blood-count components. Adding red cells and platelets is a product decision |
| 09 | EXISTS_NEEDS_VISUAL_UPDATE | Second-person laboratory verification | The design matches the existing rule that the originator cannot verify. Visual only |
| 10 | EXISTS_NEEDS_VISUAL_UPDATE | Laboratory request detail and its print region | Keep clinic and patient identity on the printed region |
| 11 | EXISTS_NEEDS_VISUAL_UPDATE | Radiology queue. Open queue is pending, in progress, and completed. A pending request is not in progress | Do not rename those tabs to match the design |
| 12 | EXISTS_NEEDS_VISUAL_UPDATE | `diagnostics-enter-radiology-report-content.ejs` | Technique, findings, and impression already exist. The critical-finding switch is not an approved control |
| 13 | EXISTS_NEEDS_VISUAL_UPDATE | Verified radiology detail and print | A second user still verifies. The author cannot verify alone |
| 14 | DESIGN_ONLY | Print actions already live on the encounter, vitals, laboratory, and radiology views | Do not add a print-center route |
| 15 | EXISTS_NEEDS_VISUAL_UPDATE | Same print actions. Unauthorized sessions are already refused | Show the denied state on the existing action. The mobile frame is inside booking-filters chrome |
| 16 | EXISTS_NEEDS_VISUAL_UPDATE | `website-cms-sections.ejs` and `website-cms-section-settings.ejs` | Draft save already exists. Do not publish from the unsaved editor |
| 17 | EXISTS_NEEDS_VISUAL_UPDATE | Same section settings and the existing media-field upload | Keep the type and size checks. Draft stays off the public page until publish |
| 18 | EXISTS_NEEDS_VISUAL_UPDATE | Draft preview and `/website/publish` | Side-by-side is visual. Publish remains an explicit POST |
| 19 | EXISTS_NEEDS_VISUAL_UPDATE | `vital-signs-entry-content.ejs` | Correction already appends a row and keeps the original |
| 20 | EXISTS_NEEDS_VISUAL_UPDATE | The same vitals log | The audit table is a visual arrangement of the stored original, correction, staff, and reason |
| 21 | EXISTS_NEEDS_VISUAL_UPDATE | Access and role views | The denied state matches current role checks |
| 22 | EXISTS_NEEDS_VISUAL_UPDATE | Facility screens | Assignment already scopes staff to the signed-in clinic |
| 23 | DESIGN_ONLY | Community pages render only when the community flag is on | The QR frame promises member-rate pharmacy and priority walk-in. That copy conflicts with the no-fixed-discount and walk-in-exclusion rules |
| 24 | EXISTS_NEEDS_VISUAL_UPDATE | Patient search and chart isolation | The wrong-clinic denial matches current isolation. Do not reveal unmasked notes across clinics |
| 25 | DESIGN_ONLY | `/app/clinical/referrals` stores referral text. It is not a community discount | The frame also says discounts apply and a walk-in surcharge is waived. Do not implement that copy |
| 26 | DESIGN_ONLY | Community overview is behind the community flag | The network-pool sentence matches the no-fixed-personal-discount rule. Do not turn the flag on for this design |
| 27 | DESIGN_ONLY | Contribution math exists as a preview. `financialPostingEnabled()` returns false | The frame itself says not activated and posting disabled. Leave it that way |
| 28 | DESIGN_ONLY | Consent copy exists as a draft notice | The frame says consent actions are disabled until legal sign-off |
| 29 | DESIGN_ONLY | Settlement preview refuses posting | The frame says live ledger posting is locked |
| 30 | EXISTS_NEEDS_VISUAL_UPDATE | `patient-clinical-history-content.ejs` | Timeline filters are visual. The encounter binding stays the signed-in clinic |
| 31 | EXISTS_NEEDS_VISUAL_UPDATE | `/app/clinical/follow-up` and `/app/clinical/referrals` | Follow-up text already reloads on the encounter. The tracker must not create a second follow-up record |
| 32 | DESIGN_ONLY | Shared empty, error, and loading patterns already exist in the app shell | This is a reference board, not a route |

## Counts

EXISTING_MATCHED=0.  
VISUAL_UPDATES_REQUIRED=23 (01, 02, 03, 04, 06, 07, 08, 09, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 24, 30, 31).  
FUNCTIONAL_UPDATES_REQUIRED=1 (05), and it stays unapproved.  
DESIGN_ONLY=8 (14, 23, 25, 26, 27, 28, 29, 32).

## Policy that the designs must not override

Staff create the patient chart. An unmatched portal registration creates no patient. Real email delivery stays fail-closed. Public booking stays disabled. SMS stays unauthorized. Community financial posting stays disabled. Agreements that are still draft stay inactive. Production OTP stays off.

Community copy, when it is eventually allowed, keeps network-wide eligibility, excludes the original walk-in clinic, allows an eligible introduction at another affiliated clinic, and shows a clinic contribution without promising a fixed patient discount. Concepts 23 and 25 do not meet that last rule. Concepts 26, 27, 28, and 29 are closer, and 27 through 29 already say they are not activated.
