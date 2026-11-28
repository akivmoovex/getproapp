# V2134 responsive gap analysis

The 32 concepts were checked as 34 retrieved frames. None is device type TABLET. No downloaded HTML file contains an `@media` rule. Some desktop files contain Tailwind `sm:` or `md:` utilities. Those utilities were not rendered at a phone width, so they are not treated as a verified mobile design.

A separate mobile frame is missing for 25 concepts: 03, 05, 07, 08, 09, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 22, 24, 25, 26, 27, 29, 30, 31, and 32.

A separate desktop frame is missing for 5 concepts: 02, 06, 15, 23, and 28.

MOBILE_GAPS=25.  
DESKTOP_GAPS=5.

## Mobile frames that were retrieved

| Concept | ID | Usable as the mobile design |
| --- | --- | --- |
| 01 | `0f9d790e8dcc49dbb06a76164fc45272` | No. The email-code block is inside a booking-filters page that still offers “Show 12 Results” |
| 02 | `c32cd66ea79b4801a093a0f9f4934a30` | No. Same booking-filters shell |
| 04 | `0bff8e7bd490430b9fd908ffe22db6dc` | No. Same booking-filters shell |
| 06 | `0058cd4288d94daabd5f5566221d1fc0` | No. Same booking-filters shell |
| 15 | `62840d1bd1514b38afdea5830f03506a` | No. The access-denied print state is inside the same shell |
| 23 | `9fb5b314d6f84e4c8153ca815cb3559f` | No. The member pass is inside the same shell, and the benefit copy conflicts with policy |
| 28 | `c2dca9deebf9454db7fc49ac61f0bdf4` | No. Consent is inside the same shell. The banner correctly says it is not activated |

These seven frames exist, but they are not clean mobile compositions. Later visual work should reuse the application’s existing responsive shell instead of copying the booking-filters chrome.

## Priority surfaces

| Surface | What exists now | Gap |
| --- | --- | --- |
| Email OTP | Desktop 01 is a dedicated frame. Mobile 01 and 02 are not | Keep the current testing pages responsive. Do not adopt the booking shell. Do not enable live send |
| Patient activation | Desktop 04 is a dedicated frame. Mobile 04 and 06 are not. 05 has no mobile frame | The current portal forms already reflow. A later visual pass can follow them. Do not add a public chart preview |
| Patient portal | Success and match frames are incomplete | Portal home, profile, and refusal pages stay on their current routes |
| Reception | 24 is desktop only | Patient search already reflows. The wrong-clinic denial can be shown in that layout |
| Member QR | 23 is a contaminated mobile frame and has no desktop frame | Do not build it while the benefit copy conflicts with policy |
| Member consent | 28 is a contaminated mobile frame and has no desktop frame | The retrieved banner says consent is not activated. Leave it unimplemented |
| Print and document access | 14 is desktop only. 15 is a contaminated mobile frame | Print stays on the clinical page that already identifies the patient and clinic. The denied state can use the current page, not a new route |

Tablet behavior is the existing application stylesheet. No Stitch tablet frame was retrieved, so no tablet-specific design is claimed.
