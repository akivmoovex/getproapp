# V2134 32-screen inventory

STITCH_LIVE_ACCESS=YES.

Source project: `17813606734422395399`, ActiveClinic Public Ecosystem & Booking Flow. `list_screens` on 2026-11-28 returned 232 screens. Thirty-two AC-V2134 concepts are present as 34 frames. Concepts 01 and 04 each have a desktop frame and a mobile frame.

Generated HTML was downloaded for all 34 frames. PNG screenshots were not decoded. Per-screen modification times are not in the live screen payload. No sample patient name, national identifier, or phone number from those frames is copied here.

The HTML `<title>` is often a leftover (“Phone Verification”, “Booking Filters”, or “Clinic Onboarding Review”). Classification uses the visible body text, not that title.

| Concept | Frames | Screen ID | Device | Size | What the retrieved HTML shows |
| --- | --- | --- | --- | --- | --- |
| 01 Email OTP verification | 2 | `3ce05c3cefea4fd693a15409466c0bce` | DESKTOP | 2560×2048 | Email code entry, masked mailbox, expiry, wrong-code error, resend cooldown, verified redirect |
| 01 Email OTP verification | 2 | `0f9d790e8dcc49dbb06a76164fc45272` | MOBILE | 780×1768 | Same email-code content inside a booking-filters shell that still says “Show 12 Results” |
| 02 OTP recovery states | 1 | `c32cd66ea79b4801a093a0f9f4934a30` | MOBILE | 780×1768 | Sending, delivery unavailable, expired code, rate limit, locked code. Booking-filters shell remains |
| 03 Protected password reset | 1 | `734553f8fe6a41bfb73da4b92ab25102` | DESKTOP | 2560×2048 | New password, confirm, length and character rules, success, return to sign-in |
| 04 Existing patient activation | 2 | `461d36630150479e84366a216edaab8e` | DESKTOP | 2560×2048 | Links an existing clinic record. Phone or email, date of birth, clinic reference. Says a second record is not created |
| 04 Existing patient activation | 2 | `0bff8e7bd490430b9fd908ffe22db6dc` | MOBILE | 780×1768 | Phone, date of birth, and patient reference. Same no-second-record rule. Booking-filters shell remains |
| 05 Identity match review | 1 | `6d1d5f4014834f8ca917e8f657b8e6d8` | DESKTOP | 2560×2048 | Masked existing record, activate or recover, no new chart, contact clinic when the match is wrong |
| 06 Activation success | 1 | `0058cd4288d94daabd5f5566221d1fc0` | MOBILE | 780×1768 | Existing profile active, dashboard or sign-in. Booking-filters shell remains |
| 07 Received specimen worklist | 1 | `a11dff812f0c428798af8e9d50df8343` | DESKTOP | 2560×2770 | Received queue with tabs including In Progress, pending verification, and verified |
| 08 Laboratory result entry | 1 | `616cdeae98794d18ba7d6eaeb91e3442` | DESKTOP | 2560×2106 | Four-part blood count entry, save draft, submit for verification |
| 09 Result verification | 1 | `6b54ddc8d19845a0a783bf9626a58199` | DESKTOP | 2560×2434 | Second person verifies. The text says the originator cannot self-verify |
| 10 Verified result detail | 1 | `fd48eea974404b13bbf0a1249590f65f` | DESKTOP | 2560×2442 | Verified report with patient identity and a print-ready view |
| 11 Radiology worklist | 1 | `7ad02bdb6192429b93d4be7043a33427` | DESKTOP | 2560×2048 | Open, in progress, reported, and verified tabs |
| 12 Radiology report editor | 1 | `2d24b30606ee4a82bfb8ee71ab355459` | DESKTOP | 2560×2510 | Technique, findings, impression, draft, and a critical-finding switch |
| 13 Verified radiology report | 1 | `d9b0346c1acd414b9dbb3d8425012d42` | DESKTOP | 2560×2530 | Finalized report, patient identity, print |
| 14 Print center | 1 | `1e7560320953441d9d8e0e7500a3a06c` | DESKTOP | 2560×2450 | One encounter with categories for SOAP, vitals, and other clinical documents |
| 15 Print access states | 1 | `62840d1bd1514b38afdea5830f03506a` | MOBILE | 780×1768 | Not authorized to print, request permission, pending. Booking-filters shell remains |
| 16 Text-section editor | 1 | `4d200465b37d4361a2abf1ff0834b2dc` | DESKTOP | 2560×2234 | New text section, required title, body, draft unsaved |
| 17 Image-section editor | 1 | `b3bb570cc061466c9bb711a31f2f594d` | DESKTOP | 2560×2324 | Save draft, preview, publish, focal point |
| 18 Draft versus published | 1 | `0ed58379267a4086afeab0862d0774bd` | DESKTOP | 2560×2650 | Side-by-side review, discard draft, publish confirmation |
| 19 Edit saved vitals | 1 | `f75e77ccbd5c43dfa117bc01294a04cc` | DESKTOP | 2560×2048 | Correction of a saved vital by an authorized clinician |
| 20 Vitals correction audit | 1 | `56780a28f4cf4529b926ef0a63ee42b7` | DESKTOP | 2560×2106 | Read-only original value, revised value, staff, and reason |
| 21 Staff permissions | 1 | `557e7009d2b44d7f82472726de450747` | DESKTOP | 2560×2234 | Role list plus a permission-denied state |
| 22 Facility assignment | 1 | `398f4d17e58445ed9fd75676f06b0a82` | DESKTOP | 2560×2082 | Facility and department scope, saved confirmation |
| 23 Member QR | 1 | `9fb5b314d6f84e4c8153ca815cb3559f` | MOBILE | 780×1768 | Member pass, revoked state, rotating QR, and benefit lines that include member-rate and priority walk-in |
| 24 Reception member lookup | 1 | `ea1943e1d2bd4501b57ae3e326a7c9ff` | DESKTOP | 2560×2048 | Lookup plus a wrong-clinic access-denied state. Unmasked notes stay locked |
| 25 Referral attribution | 1 | `36a1eee0f6ec42a78fc8873f64526432` | DESKTOP | 2560×2048 | Walk-in exclusion notice, and also discount and surcharge-waiver language |
| 26 Community overview | 1 | `91ff0b85b7334688bf751f5c5b63703b` | DESKTOP | 2560×3754 | Network pool. The text says no fixed personal discounts or cash balances |
| 27 Contribution preview | 1 | `4f0bfadf52fb42eb8ded39ba64361f55` | DESKTOP | 2560×2048 | Visible banner: design only, not activated. Ledger posting and settlement disabled. Draft 10 percent clinic contribution |
| 28 Member consent | 1 | `c2dca9deebf9454db7fc49ac61f0bdf4` | MOBILE | 780×1768 | Visible banner: design only, not activated. Consent pending legal approval |
| 29 Settlement preview | 1 | `d62a219246464c63844baaa1aed70153` | DESKTOP | 2560×2274 | Visible banner: design only, not activated. Live ledger posting locked |
| 30 Clinical timeline | 1 | `70fb868b14d9402eb47d00aa375f2eee` | DESKTOP | 2560×4362 | Authorized history across visits, vitals, laboratory, radiology, prescriptions, and referrals |
| 31 Follow-up tracker | 1 | `5b34fe771d5448319eec2793fc04b078` | DESKTOP | 2560×3418 | Pending, confirmed, and cancelled follow-up and referral rows |
| 32 State library | 1 | `f3c8269694324643a3b57086e38b829b` | DESKTOP | 2560×2962 | Shared loading, empty, offline, permission, and form states. Not an application route |

No frame uses device type TABLET. Desktop HTML has some Tailwind `sm:` or `md:` utilities and no `@media` rules. That is not a verified phone layout.
