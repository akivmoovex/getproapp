# V2134 G331 QA tester handoff

Date: 28 November 2026.  
Product: ActiveClinic and BlessBoard 2.13.4.  
Release decision: NO-GO.

## Where to test

| Item | Value |
| --- | --- |
| Application commit that was tested | `e1cafcea90871da89547c0937208297416cb7b53` |
| ActiveClinic | `https://activeclinic.pronline.org` |
| BlessBoard | `https://blessboard.pronline.org` |
| Environment | `testing` |
| Deployment | `moovex-platform-testing` |
| Branch label on `/healthz` | `V11`, from the panel variable. The checkout is `V13` |

Read `/healthz` on both hosts before starting. Require `ok=true`, `environment=testing`, and `deploymentCode=moovex-platform-testing`. Record `gitSha`. If it is not `e1cafcea9087` or a later documentation commit that still contains that patch, say so in the bug report. If `environment` or `deploymentCode` is production, stop.

## Accounts

Hosted staff and patient passwords are not in this repository. Do not invent them and do not use a production account.

Local disposable fixtures live only on `127.0.0.1:55432`, database `getpro_v13_e2e_g78d2301`. Their emails are in `tests/v13/fixtures/v13SyntheticFixtures.js`. The password is in that fixture module and must stay out of tickets and git. Those accounts do not exist on the hosted testing database.

Hosted signed-in testing needs an account the owner has already approved for the testing project. This handoff does not create one.

## Can be tested now, without writing data

- ActiveClinic public home and a published clinic page such as `/clinics/julflona-clinic`.
- Public booking. Open `/clinics/julflona-clinic/book` and `/clinics/activeclinic-demo/book`. Expect HTTP 403, the heading Booking not available, and the sentence “Online booking is not currently offered.” There should be no Continue button. Do not submit a booking.
- An unknown clinic book URL. Expect 404 and no wizard.
- BlessBoard public home.

## Disabled on purpose

| Workflow | What you should see |
| --- | --- |
| New public booking | The 403 page above. A clinic setting must not open it |
| SMS recovery | No SMS is sent. Do not treat a testing reset as SMS |
| Live email OTP | No mailbox message is expected. A synthetic local test is not a hosted pass |
| Community Benefits money movement | No settlement, contribution posting, or promised discount |
| Public self-registration of an unmatched patient | The site refuses and does not create a chart. Staff create the chart |

## Needs backup or owner approval before you do it on the host

Any sign-in that changes a password, any OTP request, any patient or clinic edit, any clinical write, any website publish, any payment, and any migration. There is still no recorded hosted backup. Do not restore a database yourself.

## Expected local automation, already run against the isolated database

Contract 687/687 twice. HTTP 41/41 twice. OTP security 15/15 twice. ActiveClinic email OTP browser 9/9 twice. BlessBoard member OTP browser 10/10 twice. ActiveClinic platform browser 36/36 twice. BlessBoard platform browser 23/23 twice.

## Known holds

- Public booking is closed by policy. The old wizard on the two clinic URLs was the defect. It is closed on the SHA above.
- Live email OTP is blocked. No message was received.
- SMS is deferred.
- RT-31 unmatched registration stays a refusal.
- Stitch screens were inventoried and not restyled. Do not file a visual mismatch against AC-V2134 as a functional failure unless the existing workflow itself is wrong.
- Hosted acceptance of RT-04 through RT-64 was not run.
- Automatic deployment is still active. A push to `origin/V13` can change the SHA under you. Re-read `/healthz` if results suddenly change.

## How to report a bug

Include the `/healthz` `gitSha` from both hosts, the full URL, the role you used, what you expected, what happened, and whether you submitted a form. Do not paste passwords, OTP codes, session cookies, or patient identifiers into a public ticket. If a booking page shows a wizard or accepts a submission, stop and mark it P0.
