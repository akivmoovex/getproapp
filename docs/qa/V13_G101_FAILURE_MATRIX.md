# V13 G101 failure matrix

Base SHA `e1f4df5990e068214705cdbef68b327c35b5a803`. Branch `V13`. Database `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432`.

The G100 classification was rechecked against the browser traces. The 21 BlessBoard failures were not 21 independent product defects.

| Group | Failures | Cause |
| --- | --- | --- |
| Public pages | announcements, sermons, events, theme preview | Synthetic churches were unpublished, and the apex rejects tenant routes. Path URLs under `/c/{key}` render after the product publish service runs. |
| Publish confirm | AC-WEB-08, AC-WEB-09, church publish | Playwright dismisses `window.confirm`, and the page reloads before a status assertion can see “Published.” |
| Theme preview link | AC-WEB-09 | The first draft link forces `website_theme_preview=ac.default` over the saved draft. |
| Section editor | BB-01 edit | The media library renders `input[name=media_url]`, not `#media_url`. Reloading a POST response resubmits it. |
| Strict locators | BB-03, BB-04, BB-MEM-01, BB-02 public, BB-24 inbox | Titles and submit buttons appear twice. |
| Registration wizard | BB-REG-07 | The review step needs the consent checkbox, which is visually hidden. Instant registration lands on `/hq`. A repeated church name is a different error from a repeated phone. |
| Directory contact | BB-24 | The church is published but not on page 1. Search finds it. Single-site contact posted to `/c/:org/contact`, which had no POST handler. |
| CSRF rotation | section save | An empty `<img src="">` requested the current page and replaced the CSRF cookie. |
| HTTP gates | D14C, D16 platform OTP, D25 slot, D25 overlap | Missing `platform.otp_challenges`, and the appointment capacity and overlap locks are still explicit approval gates. |
| Browser blockers | BB-06 login, INV-01 accept, INV-01 login, BB-AUTH-04 | Apex member login, no pre-issued limited staff token, and no out-of-band member OTP. |

These groups were repaired or recorded as authorization blockers. They were not converted to skips.
