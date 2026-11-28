# V2134 implementation waves

This is a plan only. No source file was changed. Nothing was deployed.

The 64-scenario local matrix stays the regression boundary. A visual wave may not change a stored status, a permission, a chart-creation rule, or a publish rule. RT-03, RT-07, RT-08, and RT-31 stay policy or provider rows. Community posting is not one of the 64 rows and stays disabled.

## Untouched until a separate approval

Concepts 05, 14, 23, 25, 26, 27, 28, 29, and 32. Also any control that would send live email, send SMS, enable public booking, post a community ledger, create a patient from the portal, rename laboratory or radiology statuses, or add a critical-finding flag.

PRODUCT_DECISIONS=8: email as an activation match key; public masked-chart preview; four-part blood count versus the current result entry; critical-finding control; print-center route; community benefit copy; community flag for the testing UI; laboratory and radiology tab labels.

SECURITY_CONCERNS=4: do not show a chart on the public match page; do not enable OTP resend as live mail; do not show another clinic’s unmasked record; do not copy sample identifiers from the Stitch HTML into the application.

## Wave A — website visuals

Concepts 16, 17, and 18.

Safe because draft, preview, and publish already exist and are covered by AC-WEB-08, AC-FU-WEB-02, and the G325 website test. The work is presentation of the current section form. It must keep the non-image rejection, the draft off the public page, and the publish POST wait.

New interaction: none. Additional test: rerun the existing website browser test after the visual change. No new route.

## Wave B — account visuals

Concepts 01, 02, 03, 04, and 06, limited to copy and layout.

The testing OTP and reset pages can adopt the email-code and password-rule presentation. Activation copy can say that the clinic record already exists. Do not add email matching, a masked chart, or a live resend.

Covered by the ActiveClinic email OTP spec, AC-FU-PORTAL-01, and AC-FU-PORTAL-05. Additional test: those specs twice after the visual change. RT-31 must still refuse an unmatched phone.

## Wave C — clinical visuals

Concepts 07, 08, 09, 10, 11, 12, 13, 15, 19, 20, 21, 22, 24, 30, and 31.

Use the current pages. Do not add analytes, statuses, a critical-finding switch, or a print-center route. Correction audit, second-person verification, wrong-clinic denial, and print identity stay as they are.

Covered by AC-REC-03, G168, G224, G229, and the G325 follow-up assertion. Additional test: the ActiveClinic browser suite twice, plus the HTTP laboratory and radiology runners if a label that is asserted by those runners changes.

## Wave D — held

Concepts 05 and 14 need a product decision before any route or field is added.

Concepts 23 through 29 need a product decision that removes the discount and priority-walk-in lines and keeps posting off. Until that decision, the community flag stays off and these frames are not implemented.

Concept 32 can inform empty and error components later. It is not a screen to route.

## Regression classes

| Class | Concepts | Tests before the wave is called done |
| --- | --- | --- |
| Visual only | 03, 04, 06, 09, 10, 13, 15, 16, 17, 18, 19, 20, 21, 22, 24, 30, 31 | Existing browser coverage for that page |
| Visual, with a contract that must not move | 01, 02, 07, 08, 11, 12 | OTP, portal, laboratory, and radiology tests |
| New interaction, not approved | 05 | None until a decision |
| Product decision | 14, 23, 25, 26, 27, 28, 29, 32 | None in this plan |

IMPLEMENTATION_WAVES=4. Waves A, B, and C are the only ones that can start from the current approval. Wave D does not start.
