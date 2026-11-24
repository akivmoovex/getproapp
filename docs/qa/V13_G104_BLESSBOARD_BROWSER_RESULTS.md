# V13 G104 BlessBoard browser results

Two full runs (`g107-bb1.log`, `g107-bb2.log`) each executed 23 tests, passed 19, and failed 4.

Passed journeys include section create and edit, announcement upload with uploads left off, public announcement, event, sermon, member registration, CSRF denial, duplicate church phone, theme apply and publish, sermon and event isolation, announcement isolation, directory contact, the other church’s empty inbox, member invitation issue, activation, and replay denial.

The section editor now targets `input[name=media_url]`. A javascript URL is rejected and a later GET shows the original heading. Duplicate titles use the first visible match. The review page submits “Create member”. Registration uses a unique church name, checks consent, and accepts the `/hq` landing from instant provisioning. The duplicate phone stays on the administrator step with `#register_phone-error`.

Directory search uses `/directory?q=`. Contact for a single-site church posts to `/c/:organizationKey/contact`, which now stores the enquiry on the primary branch and redirects to `?submitted=1`. Church B’s administrator does not see Church A’s message.

Still failing, and left failing:

| Test | Blocker |
| --- | --- |
| BB-06 member login | `/member/login` is rejected on the apex. The test host is rewritten to the apex, so the member form is not rendered. |
| INV-01 accept | No pre-issued staff token. The HQ invite form offers HQ admin and branch admin only. |
| INV-01 login | The configured staff email is the church administrator, who is allowed into member creation. A limited role was not invented. |
| BB-AUTH-04 | `E2E_BB_MEMBER_OTP` is unset and the test code is not exposed. |

Media uploads stay disabled. The browser asserts the “turned off” status and does not require a stored file.
