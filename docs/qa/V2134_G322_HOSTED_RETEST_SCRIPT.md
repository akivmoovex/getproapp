# V2134 G322 hosted retest script

Do not deploy, change Hostinger, restart workers, or run a hosted migration from this script. The tester uses the already deployed site only after a separate deployment approval has put the G322 commit on the host.

Read-only health on 28 November 2026, before the G322 commit:

| Surface | gitSha | branch | branchSource |
| --- | --- | --- | --- |
| ActiveClinic `/healthz` | `0458ad806921` | `V11` | `GETPRO_GIT_BRANCH` |

`0458ad806921` is the G321 handoff. It does not contain the G322 patient-reset journey or the vitals PostgreSQL assertion. A hosted pass is valid only when `/healthz` shows the G322 commit. The panel branch can still say `V11` until that setting is changed under the same separate approval.

## Tester rules

- Use the clinic and patient identities already approved for hosted QA. Do not create production patients.
- Record each RT as PASS or FAIL against the deployed SHA. Do not copy the local classification into the hosted sheet.
- A disabled booking page is the expected RT-03 result.
- RT-07 stays FAIL until a real mailbox message is received and its code completes the protected action.
- RT-08 stays out of scope while SMS is unapproved. Do not treat a missing SMS as a product defect.
- Do not enable public booking, financial posting, production OTP, or production uploads to obtain a pass.

## Steps

1. Open `/healthz` and write down `gitSha` and `branch`.
2. RT-03: open the clinic booking page. Expect booking unavailable and no coupon or live confirmation.
3. RT-28: create a new text section, edit it, save, reload, preview while it is still private, publish, then read it on the public page.
4. RT-29: create a new image section with the authorized test image reference, save, reload, confirm it is absent before publish, publish, then read the image on the public page.
5. RT-30: staff creates a patient. The patient activates that same chart and signs in.
6. RT-31: a second registration with an unknown phone does not create another chart.
7. RT-32: the same name and phone on another clinic does not attach the first chart.
8. RT-33: the activated patient requests password recovery. Delivery must not be claimed. Complete only the recovery method the deployed testing build actually offers, then sign in with the new password and confirm the old password fails.
9. RT-44: record heart rate 72, correct it to 80 with a reason, reload, and confirm both values remain. The original is superseded.
10. RT-56: order FBC, receive the specimen, enter the result, verify it as a second staff member, and read it back on the encounter.
11. RT-57: the received request appears on the received filter and not on processing before a result exists. Do not expect an `analysis` status.
12. RT-58: the laboratory dashboard received count matches the persisted received request.
13. RT-59: the diagnostics workspace shows laboratory and radiology counts taken from persisted requests.
14. RT-60: radiology pending, reported, and verified filters follow the report lifecycle, and the clinician can read the verified report.
15. RT-64: print SOAP, vitals, prescription, referral, laboratory, and radiology views. Each view must show the correct patient, and another clinic must not open the record.

RT-01, RT-02, RT-04 through RT-06, RT-09 through RT-27, RT-34 through RT-43, RT-45 through RT-55, and RT-61 through RT-63 cannot be scripted until the original report rows are supplied.
