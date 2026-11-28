# V2134 live ActiveClinic Stitch completeness audit

FINAL=V2134_STITCH_COMPLETENESS

STITCH_LIVE_ACCESS=YES. This audit called `list_screens` and `get_project` on the three canonical ActiveClinic projects. It did not create, edit, or delete screens. It did not change application source, `main`, or a deployment.

`list_screens` and `get_screen` do not return a per-screen modification time. Project `createTime` and `updateTime` below come from `get_project`. Dates are not inferred for individual screens.

## Current counts

| Project | ID | Unique screens | Desktop | Mobile | Canvas instances | Project created | Project updated |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| ActiveClinic Public Ecosystem & Booking Flow | `17813606734422395399` | 232 | 113 | 119 | 233 | 2026-08-03T21:26:34Z | 2026-11-28T06:51:55Z |
| ActiveClinic – Juflona Pilot | `12272131183982732110` | 199 | 155 | 44 | 207 | 2026-08-03T16:28:32Z | 2026-08-11T21:07:47Z |
| ActiveClinic Universal Authentication Interface | `10611909237747031838` | 108 | 71 | 37 | 113 | 2026-08-20T01:56:21Z | 2026-08-26T16:36:35Z |

CURRENT_STITCH_SCREENS=539 unique screens (232 + 199 + 108). Canvas instances are 233, 207, and 113. The extra instances have no source screen id in `get_project`, so they are not additional titled screens. One internal source and one authentication source are placed on the canvas more than once; those repeats are the same screen id, not new designs.

August baselines checked, not used as the live inventory:

- Public `_p21_p27_live_inventory.json` audited 2026-08-04, 189 screens. Raw inventory generated 2026-08-11 also has 189. Live list has the same 189 plus 43. None of the August ids are absent.
- Internal raw inventory 2026-08-11 has 199 ids. Live list matches exactly. Project `updateTime` is still 2026-08-11.
- Authentication inventory fetched 2026-08-26 has 108 ids. Live list matches exactly. Project `updateTime` is still 2026-08-26.

## Required V2.13.4 set

REQUIRED_UNIQUE_SCREENS=34. Thirty-two are the numbered AC-V2134 concepts present in the public project. Two implemented workflows have no titled screen in any of the three projects: the chart-first unmatched-patient refusal, and laboratory reference rules.

FULLY_DESIGNED=2. AC-V2134-01 email OTP verification and AC-V2134-04 existing-patient activation have both a desktop and a mobile screen. The multi-clinic selector is also both viewports, in the authentication project (`active-clinic-03-desktop-multi-clinic-selector` and `active-clinic-03-mobile-multi-clinic-selector`); it is outside the numbered 32 and is not added to this 2.

PARTIALLY_DESIGNED=30. The other numbered AC-V2134 concepts have one viewport.

MISSING_SCREENS=2. Chart-first no-match refusal, and laboratory reference rules.

IMPLEMENTED_WITHOUT_STITCH=2. Those same two workflows exist in the application and have no Stitch title.

OUTDATED_DESIGNS=4 under-construction screens whose titles describe a site that is not open, while the testing hosts serve ActiveClinic 2.13.4. Booking and SMS screens are not counted here; they are deferred by policy.

DESKTOP_MISSING=5 numbered concepts that are mobile only: 02 OTP recovery states, 06 activation success, 15 printing failure and access, 23 member benefits and QR, 28 member consent.

MOBILE_MISSING=25 numbered concepts that are desktop only.

OVERALL_COMPLETENESS=PARTIAL. Every numbered AC-V2134 concept has at least one screen. Both-viewport coverage of that set is 2/32. None of the new AC-V2134 screen ids are referenced by an ActiveClinic EJS view.

NEXT_DESIGN_PRIORITY=A chart-first no-match screen that creates no patient, then mobile companions for laboratory result entry, radiology reporting, and vitals correction audit.

## Attention workflows

| Workflow | Classification | Design evidence | Implementation evidence |
| --- | --- | --- | --- |
| Existing-patient activation | PARTIALLY_DESIGNED | 04 desktop `461d36630150479e84366a216edaab8e` and mobile `0bff8e7bd490430b9fd908ffe22db6dc`. Success is mobile only `0058cd4288d94daabd5f5566221d1fc0`. Identity review is desktop only `6d1d5f4014834f8ca917e8f657b8e6d8`. | Portal activation routes exist. These new ids are not cited by a view. |
| Chart-first unmatched refusal | IMPLEMENTED_WITHOUT_STITCH | No title in the three projects says no matching patient or refuses chart creation. | `no_patient_match` in `activeClinicPatientPortalRoutes.js`. The form tells the visitor that staff create the chart. |
| Email OTP verification | PARTIALLY_DESIGNED | 01 desktop `3ce05c3cefea4fd693a15409466c0bce` and mobile `0f9d790e8dcc49dbb06a76164fc45272`. | Testing-channel OTP screens exist. Production send stays off. |
| OTP recovery and reset | PARTIALLY_DESIGNED | 02 recovery states mobile only `c32cd66ea79b4801a093a0f9f4934a30`. 03 reset completion desktop only `734553f8fe6a41bfb73da4b92ab25102`. | Forgot-password and reset views exist. They do not cite these ids. |
| Production OTP delivery | DEFERRED_BY_POLICY | The verification screens above must not be read as approval to send live mail. | `deliveryActivated` remains false. |
| Laboratory result entry | PARTIALLY_DESIGNED | 08 desktop `616cdeae98794d18ba7d6eaeb91e3442`, 07 received worklist `a11dff812f0c428798af8e9d50df8343`, 09 verification `6b54ddc8d19845a0a783bf9626a58199`, 10 verified detail `fd48eea974404b13bbf0a1249590f65f`. Older internal desktop `59ee5d74ff1f47eca3c6fb09413b7c09`. | `diagnostics-enter-laboratory-result-content.ejs` and the laboratory queue views. No mobile result-entry screen. |
| Radiology reporting | PARTIALLY_DESIGNED | 11 desktop `7ad02bdb6192429b93d4be7043a33427`, 12 `2d24b30606ee4a82bfb8ee71ab355459`, 13 `d9b0346c1acd414b9dbb3d8425012d42`. Older internal `41a0f1b3e1974e7ca26599bf8a37fc5f`. | `diagnostics-enter-radiology-report-content.ejs`. No mobile report editor. |
| Vitals correction and audit | PARTIALLY_DESIGNED | 19 desktop `f75e77ccbd5c43dfa117bc01294a04cc`, 20 desktop `56780a28f4cf4529b926ef0a63ee42b7`. Older vital-entry desktop `dede5e72277d413497e1f870f6b4a0e1`. | `vital-signs-entry-content.ejs` records a correction and keeps the original. No mobile audit screen. |
| Clinical document printing | PARTIALLY_DESIGNED | 14 print center desktop `1e7560320953441d9d8e0e7500a3a06c`. 15 failure and access mobile `62840d1bd1514b38afdea5830f03506a`. | Print actions are regions inside the encounter, vitals, laboratory, and radiology views, not a print-center page. |
| Website section editing | PARTIALLY_DESIGNED | 16 text editor `4d200465b37d4361a2abf1ff0834b2dc`, 17 image editor `b3bb570cc061466c9bb711a31f2f594d`, 18 draft comparison `0ed58379267a4086afeab0862d0774bd`, all desktop. Authentication project has MW03 section screens, also desktop. | `website-cms-sections.ejs` and `website-cms-section-settings.ejs`. No mobile CMS screen. |
| Community membership and QR | PARTIALLY_DESIGNED | 26 overview desktop `91ff0b85b7334688bf751f5c5b63703b`, 23 QR mobile `9fb5b314d6f84e4c8153ca815cb3559f`, 28 consent mobile `c2dca9deebf9454db7fc49ac61f0bdf4`. | Community routes render their own HTML and stay behind `GETPRO_AC_COMMUNITY_BENEFITS_ENABLED`. They do not cite these ids. |
| Referral attribution | PARTIALLY_DESIGNED | 25 desktop `36a1eee0f6ec42a78fc8873f64526432`. 31 follow-up tracker desktop `5b34fe771d5448319eec2793fc04b078`. Older clinical referral views are separate from community attribution. | `/app/clinical/referrals` stores referral text. Community attribution is preview code, not a posted payment. |
| Clinic contribution preview | PARTIALLY_DESIGNED | 27 desktop `4f0bfadf52fb42eb8ded39ba64361f55`. 29 settlement preview desktop `d62a219246464c63844baaa1aed70153`. | Model B preview exists in code. `financialPostingEnabled()` returns false. |
| Financial posting | DEFERRED_BY_POLICY | Do not turn 27 or 29 into a posting screen. | Posting stays disabled. |
| Public booking | DEFERRED_BY_POLICY | P24, P25, and P26 booking screens remain in the public project, including desktop and mobile pairs and several state screens. | The product keeps public booking disabled. Do not enable it from these designs. |
| SMS recovery or notification | DEFERRED_BY_POLICY | `bb250d93ee27449793869522211fb17c` and `9a4b08f02d2b4cc990eab7b16b4202aa` are SMS state screens. | SMS is not authorized. |
| Laboratory reference rules | IMPLEMENTED_WITHOUT_STITCH | No title contains reference rules. | `laboratory-reference-rules-content.ejs`. |
| Multi-clinic workspace selection | DESIGNED_AND_IMPLEMENTED | Authentication project desktop and mobile selectors named above. | `/login/select-organization` is implemented. The views do not cite those screen ids. |

Chart-first registration stays the product rule. A future design for the unmatched case must refuse the phone and must not show a control that creates a patient.

## Screens added since the August inventories

All 43 are in project `17813606734422395399`. The internal and authentication projects added none.

| ID | Device | Title |
| --- | --- | --- |
| `60dba51e41a745d499abeff016f78984` | DESKTOP | AC-UNDER-CONSTRUCTION-DESKTOP - Authorized Admin Logged In |
| `25cbf7363e1547568a6514f9d5ccec3f` | DESKTOP | AC-UNDER-CONSTRUCTION-DESKTOP - Public & Admin Unauthenticated |
| `4e85bdb8103e4b2f83f194ff149e55ff` | MOBILE | AC-UNDER-CONSTRUCTION-MOBILE - Authorized Admin Logged In |
| `817a33a0bfa340bbb88bbce8db56f2f0` | MOBILE | AC-UNDER-CONSTRUCTION-MOBILE - Public & Admin Unauthenticated |
| `3ce05c3cefea4fd693a15409466c0bce` | DESKTOP | AC-V2134-01 — Email OTP verification - Desktop |
| `0f9d790e8dcc49dbb06a76164fc45272` | MOBILE | AC-V2134-01 — Email OTP verification - Mobile |
| `c32cd66ea79b4801a093a0f9f4934a30` | MOBILE | AC-V2134-02 — OTP recovery states - Mobile |
| `734553f8fe6a41bfb73da4b92ab25102` | DESKTOP | AC-V2134-03 — Protected password reset completion - Desktop |
| `461d36630150479e84366a216edaab8e` | DESKTOP | AC-V2134-04 — Existing patient activation - Desktop |
| `0bff8e7bd490430b9fd908ffe22db6dc` | MOBILE | AC-V2134-04 — Existing patient activation - Mobile |
| `6d1d5f4014834f8ca917e8f657b8e6d8` | DESKTOP | AC-V2134-05 — Patient identity match review - Desktop |
| `0058cd4288d94daabd5f5566221d1fc0` | MOBILE | AC-V2134-06 — Patient activation success - Mobile |
| `a11dff812f0c428798af8e9d50df8343` | DESKTOP | AC-V2134-07 — Received specimen worklist - Desktop |
| `616cdeae98794d18ba7d6eaeb91e3442` | DESKTOP | AC-V2134-08 — Laboratory result entry - Desktop |
| `6b54ddc8d19845a0a783bf9626a58199` | DESKTOP | AC-V2134-09 — Result verification - Desktop |
| `fd48eea974404b13bbf0a1249590f65f` | DESKTOP | AC-V2134-10 — Verified result detail - Desktop |
| `7ad02bdb6192429b93d4be7043a33427` | DESKTOP | AC-V2134-11 — Radiology processing worklist - Desktop |
| `2d24b30606ee4a82bfb8ee71ab355459` | DESKTOP | AC-V2134-12 — Radiology report editor - Desktop |
| `d9b0346c1acd414b9dbb3d8425012d42` | DESKTOP | AC-V2134-13 — Verified radiology report - Desktop |
| `1e7560320953441d9d8e0e7500a3a06c` | DESKTOP | AC-V2134-14 — Clinical document print center - Desktop |
| `62840d1bd1514b38afdea5830f03506a` | MOBILE | AC-V2134-15 — Printing failure and access states - Mobile |
| `4d200465b37d4361a2abf1ff0834b2dc` | DESKTOP | AC-V2134-16 — New text-section editor - Desktop |
| `b3bb570cc061466c9bb711a31f2f594d` | DESKTOP | AC-V2134-17 — New image-section editor - Desktop |
| `0ed58379267a4086afeab0862d0774bd` | DESKTOP | AC-V2134-18 — Draft versus published comparison - Desktop |
| `f75e77ccbd5c43dfa117bc01294a04cc` | DESKTOP | AC-V2134-19 — Edit saved vital signs - Desktop |
| `56780a28f4cf4529b926ef0a63ee42b7` | DESKTOP | AC-V2134-20 — Vitals correction audit - Desktop |
| `557e7009d2b44d7f82472726de450747` | DESKTOP | AC-V2134-21 — Staff permissions - Desktop |
| `398f4d17e58445ed9fd75676f06b0a82` | DESKTOP | AC-V2134-22 — Facility and department assignment - Desktop |
| `9fb5b314d6f84e4c8153ca815cb3559f` | MOBILE | AC-V2134-23 — Member benefits and QR - Mobile |
| `ea1943e1d2bd4501b57ae3e326a7c9ff` | DESKTOP | AC-V2134-24 — Clinic reception member lookup - Desktop |
| `36a1eee0f6ec42a78fc8873f64526432` | DESKTOP | AC-V2134-25 — Referral attribution - Desktop |
| `91ff0b85b7334688bf751f5c5b63703b` | DESKTOP | AC-V2134-26 — Community benefits overview - Desktop |
| `4f0bfadf52fb42eb8ded39ba64361f55` | DESKTOP | AC-V2134-27 — Clinic contribution preview - Desktop |
| `c2dca9deebf9454db7fc49ac61f0bdf4` | MOBILE | AC-V2134-28 — Member consent - Mobile |
| `d62a219246464c63844baaa1aed70153` | DESKTOP | AC-V2134-29 — Agreement and settlement preview - Desktop |
| `70fb868b14d9402eb47d00aa375f2eee` | DESKTOP | AC-V2134-30 — Patient clinical timeline - Desktop |
| `5b34fe771d5448319eec2793fc04b078` | DESKTOP | AC-V2134-31 — Follow-up and referral tracker - Desktop |
| `f3c8269694324643a3b57086e38b829b` | DESKTOP | AC-V2134-32 — Shared application state library - Desktop |
| `1fbd196cf3aa41af8aeb302b3373fb83` | DESKTOP | ACW – Contact ActiveClinic (Desktop) |
| `6874e0e4c245456e8bc20b8fd306a975` | MOBILE | ACW – Contact ActiveClinic (Mobile) |
| `fe83c63d624940f2a6ac54f141df88e8` | MOBILE | ACW – Contact ActiveClinic (Mobile) |
| `d274926ab7124698952c7f09a6754be6` | MOBILE | ACW – Contact ActiveClinic (Mobile) |
| `4c6a8e45e4a5497f9de3304b8dee75a8` | DESKTOP | P21 - ActiveClinic Public - Contact - Desktop |

## Duplicates and incompatible designs

Three public screens share the title `ACW – Contact ActiveClinic (Mobile)`: `6874e0e4c245456e8bc20b8fd306a975`, `d274926ab7124698952c7f09a6754be6`, and `fe83c63d624940f2a6ac54f141df88e8`. A fourth contact desktop is `1fbd196cf3aa41af8aeb302b3373fb83`, and the older P21 contact desktop is `4c6a8e45e4a5497f9de3304b8dee75a8`.

Under-construction screens, classified DESIGN_OUTDATED against the running 2.13.4 testing site:

- `25cbf7363e1547568a6514f9d5ccec3f` desktop, public and admin unauthenticated.
- `60dba51e41a745d499abeff016f78984` desktop, authorized admin.
- `817a33a0bfa340bbb88bbce8db56f2f0` mobile, public and admin unauthenticated.
- `4e85bdb8103e4b2f83f194ff149e55ff` mobile, authorized admin.

SMS and full public-booking flows are incompatible with current policy if they are implemented as enabled features. Their screens stay in Stitch. The product must keep booking disabled and must not send SMS.

Screen HTML was not downloaded, so this audit does not claim that a title’s pixels match the view. Policy conflicts above come from the titles and from the approved product rules.

## State coverage

Public directory screens include loading, empty, error, validation, and success for desktop and mobile. Those are older P21 screens, not AC-V2134 screens.

The numbered V2134 set does not have a loading, empty, validation, error, permission, and success variant for each workflow. It has one shared state library, desktop `f3c8269694324643a3b57086e38b829b`; OTP recovery states on mobile; printing failure and access on mobile; and activation success on mobile. Permission content is the desktop staff-permissions screen `557e7009d2b44d7f82472726de450747` plus the older internal role matrix. The internal project has desktop shared loading `8a3f15c0be9c47efb192f206df104d5c` and shared error `72357dec37864a5a926a1d2b5c551b16`.

## Design prompts still required

These prompts are text for a later design session. This audit did not generate the screens.

1. Desktop and mobile: unmatched portal registration. Show the no-matching-patient message and no create-patient action. Staff already created charts are activated on the existing 04 screens.
2. Mobile: laboratory result entry, second-person verification, and verified result, matching 08, 09, and 10 without adding an analysis status.
3. Mobile: radiology worklist, report editor, and verified report, matching 11, 12, and 13. A pending request stays out of the in-progress list.
4. Mobile: edit a saved vital sign and show the original value, the correction, and the reason, matching 19 and 20.
5. Desktop: OTP recovery states and activation success, matching the existing mobile 02 and 06 screens. Do not show a live mailbox send.
6. Desktop: member QR and consent, matching 23 and 28. Keep contribution and settlement as previews. Do not show a posted payment.
7. Mobile: website text-section and image-section editors, including the draft-not-public state, matching 16, 17, and 18.

## Desktop and mobile matrix for the numbered set

| Concept | Desktop | Mobile |
| --- | --- | --- |
| 01 Email OTP verification | `3ce05c3cefea4fd693a15409466c0bce` | `0f9d790e8dcc49dbb06a76164fc45272` |
| 02 OTP recovery states | — | `c32cd66ea79b4801a093a0f9f4934a30` |
| 03 Protected password reset | `734553f8fe6a41bfb73da4b92ab25102` | — |
| 04 Existing patient activation | `461d36630150479e84366a216edaab8e` | `0bff8e7bd490430b9fd908ffe22db6dc` |
| 05 Patient identity match review | `6d1d5f4014834f8ca917e8f657b8e6d8` | — |
| 06 Patient activation success | — | `0058cd4288d94daabd5f5566221d1fc0` |
| 07 Received specimen worklist | `a11dff812f0c428798af8e9d50df8343` | — |
| 08 Laboratory result entry | `616cdeae98794d18ba7d6eaeb91e3442` | — |
| 09 Result verification | `6b54ddc8d19845a0a783bf9626a58199` | — |
| 10 Verified result detail | `fd48eea974404b13bbf0a1249590f65f` | — |
| 11 Radiology processing worklist | `7ad02bdb6192429b93d4be7043a33427` | — |
| 12 Radiology report editor | `2d24b30606ee4a82bfb8ee71ab355459` | — |
| 13 Verified radiology report | `d9b0346c1acd414b9dbb3d8425012d42` | — |
| 14 Clinical document print center | `1e7560320953441d9d8e0e7500a3a06c` | — |
| 15 Printing failure and access | — | `62840d1bd1514b38afdea5830f03506a` |
| 16 New text-section editor | `4d200465b37d4361a2abf1ff0834b2dc` | — |
| 17 New image-section editor | `b3bb570cc061466c9bb711a31f2f594d` | — |
| 18 Draft versus published comparison | `0ed58379267a4086afeab0862d0774bd` | — |
| 19 Edit saved vital signs | `f75e77ccbd5c43dfa117bc01294a04cc` | — |
| 20 Vitals correction audit | `56780a28f4cf4529b926ef0a63ee42b7` | — |
| 21 Staff permissions | `557e7009d2b44d7f82472726de450747` | — |
| 22 Facility and department assignment | `398f4d17e58445ed9fd75676f06b0a82` | — |
| 23 Member benefits and QR | — | `9fb5b314d6f84e4c8153ca815cb3559f` |
| 24 Clinic reception member lookup | `ea1943e1d2bd4501b57ae3e326a7c9ff` | — |
| 25 Referral attribution | `36a1eee0f6ec42a78fc8873f64526432` | — |
| 26 Community benefits overview | `91ff0b85b7334688bf751f5c5b63703b` | — |
| 27 Clinic contribution preview | `4f0bfadf52fb42eb8ded39ba64361f55` | — |
| 28 Member consent | — | `c2dca9deebf9454db7fc49ac61f0bdf4` |
| 29 Agreement and settlement preview | `d62a219246464c63844baaa1aed70153` | — |
| 30 Patient clinical timeline | `70fb868b14d9402eb47d00aa375f2eee` | — |
| 31 Follow-up and referral tracker | `5b34fe771d5448319eec2793fc04b078` | — |
| 32 Shared application state library | `f3c8269694324643a3b57086e38b829b` | — |

## Complete current screen list

Ids and titles are copied from `list_screens` on 2026-11-28. Width and height are the values returned with each screen.

### Public project 17813606734422395399

232 screens.

| ID | Device | Size | Title |
| --- | --- | --- | --- |
| `60dba51e41a745d499abeff016f78984` | DESKTOP | 2560×2812 | AC-UNDER-CONSTRUCTION-DESKTOP - Authorized Admin Logged In |
| `25cbf7363e1547568a6514f9d5ccec3f` | DESKTOP | 2560×2292 | AC-UNDER-CONSTRUCTION-DESKTOP - Public & Admin Unauthenticated |
| `4e85bdb8103e4b2f83f194ff149e55ff` | MOBILE | 780×2488 | AC-UNDER-CONSTRUCTION-MOBILE - Authorized Admin Logged In |
| `817a33a0bfa340bbb88bbce8db56f2f0` | MOBILE | 780×2912 | AC-UNDER-CONSTRUCTION-MOBILE - Public & Admin Unauthenticated |
| `3ce05c3cefea4fd693a15409466c0bce` | DESKTOP | 2560×2048 | AC-V2134-01 — Email OTP verification - Desktop |
| `0f9d790e8dcc49dbb06a76164fc45272` | MOBILE | 780×1768 | AC-V2134-01 — Email OTP verification - Mobile |
| `c32cd66ea79b4801a093a0f9f4934a30` | MOBILE | 780×1768 | AC-V2134-02 — OTP recovery states - Mobile |
| `734553f8fe6a41bfb73da4b92ab25102` | DESKTOP | 2560×2048 | AC-V2134-03 — Protected password reset completion - Desktop |
| `461d36630150479e84366a216edaab8e` | DESKTOP | 2560×2048 | AC-V2134-04 — Existing patient activation - Desktop |
| `0bff8e7bd490430b9fd908ffe22db6dc` | MOBILE | 780×1768 | AC-V2134-04 — Existing patient activation - Mobile |
| `6d1d5f4014834f8ca917e8f657b8e6d8` | DESKTOP | 2560×2048 | AC-V2134-05 — Patient identity match review - Desktop |
| `0058cd4288d94daabd5f5566221d1fc0` | MOBILE | 780×1768 | AC-V2134-06 — Patient activation success - Mobile |
| `a11dff812f0c428798af8e9d50df8343` | DESKTOP | 2560×2770 | AC-V2134-07 — Received specimen worklist - Desktop |
| `616cdeae98794d18ba7d6eaeb91e3442` | DESKTOP | 2560×2106 | AC-V2134-08 — Laboratory result entry - Desktop |
| `6b54ddc8d19845a0a783bf9626a58199` | DESKTOP | 2560×2434 | AC-V2134-09 — Result verification - Desktop |
| `fd48eea974404b13bbf0a1249590f65f` | DESKTOP | 2560×2442 | AC-V2134-10 — Verified result detail - Desktop |
| `7ad02bdb6192429b93d4be7043a33427` | DESKTOP | 2560×2048 | AC-V2134-11 — Radiology processing worklist - Desktop |
| `2d24b30606ee4a82bfb8ee71ab355459` | DESKTOP | 2560×2510 | AC-V2134-12 — Radiology report editor - Desktop |
| `d9b0346c1acd414b9dbb3d8425012d42` | DESKTOP | 2560×2530 | AC-V2134-13 — Verified radiology report - Desktop |
| `1e7560320953441d9d8e0e7500a3a06c` | DESKTOP | 2560×2450 | AC-V2134-14 — Clinical document print center - Desktop |
| `62840d1bd1514b38afdea5830f03506a` | MOBILE | 780×1768 | AC-V2134-15 — Printing failure and access states - Mobile |
| `4d200465b37d4361a2abf1ff0834b2dc` | DESKTOP | 2560×2234 | AC-V2134-16 — New text-section editor - Desktop |
| `b3bb570cc061466c9bb711a31f2f594d` | DESKTOP | 2560×2324 | AC-V2134-17 — New image-section editor - Desktop |
| `0ed58379267a4086afeab0862d0774bd` | DESKTOP | 2560×2650 | AC-V2134-18 — Draft versus published comparison - Desktop |
| `f75e77ccbd5c43dfa117bc01294a04cc` | DESKTOP | 2560×2048 | AC-V2134-19 — Edit saved vital signs - Desktop |
| `56780a28f4cf4529b926ef0a63ee42b7` | DESKTOP | 2560×2106 | AC-V2134-20 — Vitals correction audit - Desktop |
| `557e7009d2b44d7f82472726de450747` | DESKTOP | 2560×2234 | AC-V2134-21 — Staff permissions - Desktop |
| `398f4d17e58445ed9fd75676f06b0a82` | DESKTOP | 2560×2082 | AC-V2134-22 — Facility and department assignment - Desktop |
| `9fb5b314d6f84e4c8153ca815cb3559f` | MOBILE | 780×1768 | AC-V2134-23 — Member benefits and QR - Mobile |
| `ea1943e1d2bd4501b57ae3e326a7c9ff` | DESKTOP | 2560×2048 | AC-V2134-24 — Clinic reception member lookup - Desktop |
| `36a1eee0f6ec42a78fc8873f64526432` | DESKTOP | 2560×2048 | AC-V2134-25 — Referral attribution - Desktop |
| `91ff0b85b7334688bf751f5c5b63703b` | DESKTOP | 2560×3754 | AC-V2134-26 — Community benefits overview - Desktop |
| `4f0bfadf52fb42eb8ded39ba64361f55` | DESKTOP | 2560×2048 | AC-V2134-27 — Clinic contribution preview - Desktop |
| `c2dca9deebf9454db7fc49ac61f0bdf4` | MOBILE | 780×1768 | AC-V2134-28 — Member consent - Mobile |
| `d62a219246464c63844baaa1aed70153` | DESKTOP | 2560×2274 | AC-V2134-29 — Agreement and settlement preview - Desktop |
| `70fb868b14d9402eb47d00aa375f2eee` | DESKTOP | 2560×4362 | AC-V2134-30 — Patient clinical timeline - Desktop |
| `5b34fe771d5448319eec2793fc04b078` | DESKTOP | 2560×3418 | AC-V2134-31 — Follow-up and referral tracker - Desktop |
| `f3c8269694324643a3b57086e38b829b` | DESKTOP | 2560×2962 | AC-V2134-32 — Shared application state library - Desktop |
| `dbe4c18b488e4d12ba3ce57af8e49d9f` | MOBILE | 780×2702 | ActiveClinic Public - Design System |
| `5265ab7118c74f8b885de211483ef48c` | MOBILE | 780×1768 | ActiveClinic Public - Header |
| `e0ebb2af00e944e0b90a6400ea6093ba` | MOBILE | 780×1768 | ActiveClinic Public - Mobile Navigation |
| `83fe90078bb349efad00ea1138d795d2` | MOBILE | 780×5104 | ActiveClinic Tenant Template - Configuration Reference |
| `f8ab02fa6a8143debebc923644f62961` | MOBILE | 780×2828 | ActiveClinic Tenant Template - Footer |
| `1fbd196cf3aa41af8aeb302b3373fb83` | DESKTOP | 2560×4300 | ACW – Contact ActiveClinic (Desktop) |
| `6874e0e4c245456e8bc20b8fd306a975` | MOBILE | 780×5570 | ACW – Contact ActiveClinic (Mobile) |
| `d274926ab7124698952c7f09a6754be6` | MOBILE | 780×5730 | ACW – Contact ActiveClinic (Mobile) |
| `fe83c63d624940f2a6ac54f141df88e8` | MOBILE | 780×5802 | ACW – Contact ActiveClinic (Mobile) |
| `4443fa4c1eea429fb6ee67a97efb8f92` | DESKTOP | 2560×3036 | P21 - ActiveClinic Public - About - Desktop |
| `2447429876f24ac287f903795c4d4d04` | MOBILE | 780×4854 | P21 - ActiveClinic Public - About - Mobile |
| `2c612094416e468ea4063dc162667609` | DESKTOP | 2560×2292 | P21 - ActiveClinic Public - Clinic Directory - Desktop |
| `dac958cf9559485aa0aac7803360cf40` | DESKTOP | 2560×2150 | P21 - ActiveClinic Public - Clinic Directory - Desktop |
| `2c495fc46a3648c5b878e207d9f12661` | DESKTOP | 2560×2048 | P21 - ActiveClinic Public - Clinic Directory - Empty - Desktop |
| `08791796ff3046df8c2c479ee2641814` | MOBILE | 780×1768 | P21 - ActiveClinic Public - Clinic Directory - Empty - Mobile |
| `cdc46325b27b4813bf5a19eb8e85dd9f` | DESKTOP | 2560×2048 | P21 - ActiveClinic Public - Clinic Directory - Error - Desktop |
| `82299e09519c4098b07429d9ae97bdac` | MOBILE | 780×1768 | P21 - ActiveClinic Public - Clinic Directory - Error - Mobile |
| `3cf8b9cbce0a4866aace37f72c319e5f` | DESKTOP | 2560×2048 | P21 - ActiveClinic Public - Clinic Directory - Loading - Desktop |
| `4889fc1798d2425f85ba19dd68c29734` | MOBILE | 780×1768 | P21 - ActiveClinic Public - Clinic Directory - Loading - Mobile |
| `85f99ea3326f46a2bd0415ba1cf2d8d2` | MOBILE | 780×2710 | P21 - ActiveClinic Public - Clinic Directory - Mobile |
| `a45f68ec92f8495d8f5cd1aa42831e88` | DESKTOP | 2560×2372 | P21 - ActiveClinic Public - Clinic Onboarding - Desktop |
| `18f6b1a32e464e8c93f977f918e05500` | MOBILE | 780×1768 | P21 - ActiveClinic Public - Clinic Onboarding - Mobile |
| `fa556d169e1a44b38a65770869bf2c09` | DESKTOP | 2560×2048 | P21 - ActiveClinic Public - Clinic Onboarding Review - Desktop |
| `254bcedf197b4b0794c9df173f8a6857` | MOBILE | 780×1768 | P21 - ActiveClinic Public - Clinic Onboarding Review - Mobile |
| `3410067aec51400d95936b34efd85e46` | DESKTOP | 2560×2048 | P21 - ActiveClinic Public - Clinic Onboarding Server Error - Desktop |
| `8c33ca1f083c494fa4b2143e3a3e45d3` | MOBILE | 780×1768 | P21 - ActiveClinic Public - Clinic Onboarding Server Error - Mobile |
| `f9f8853209fb42ebb1ef71cdb97145ba` | DESKTOP | 2560×2048 | P21 - ActiveClinic Public - Clinic Onboarding Success - Desktop |
| `7f422dccacea4a5c93932db627522000` | MOBILE | 780×1768 | P21 - ActiveClinic Public - Clinic Onboarding Success - Mobile |
| `341517f50f3f4fce85e4715f41e12b3c` | DESKTOP | 2560×2326 | P21 - ActiveClinic Public - Clinic Onboarding Validation Error - Desktop |
| `9a4d8a72068e4fec88cb7eadab0a4dd4` | MOBILE | 780×1768 | P21 - ActiveClinic Public - Clinic Onboarding Validation Error - Mobile |
| `50d278a0dc7c4618b20e70e4fdfd6076` | MOBILE | 780×2684 | P21 - ActiveClinic Public - Clinic Search States - Mobile |
| `4c6a8e45e4a5497f9de3304b8dee75a8` | DESKTOP | 2560×4300 | P21 - ActiveClinic Public - Contact - Desktop |
| `22391e15f8c34fc5b23927b4e7644120` | DESKTOP | 2560×2844 | P21 - ActiveClinic Public - Home - Desktop |
| `f96b485558c64fc38193c5d3231633ec` | DESKTOP | 2560×2990 | P21 - ActiveClinic Public - Home - Desktop |
| `2ccf327230b640c3b3340e5bca2bb162` | MOBILE | 780×2596 | P21 - ActiveClinic Public - Home - Mobile |
| `6dadae69ad0d4e4e9441e1a68b3f6282` | MOBILE | 780×2604 | P21 - ActiveClinic Public - Home - Mobile |
| `ac6b69a1ef614134af6d674c62891632` | DESKTOP | 2560×3024 | P21 - ActiveClinic Public - Solutions - Desktop |
| `990884d1aa844bb2a789f41b23b7704e` | MOBILE | 780×3694 | P21 - ActiveClinic Public - Solutions - Mobile |
| `5b3a0cccbc224b388752747847c0749a` | DESKTOP | 2560×2048 | P22 - Demo Clinic - Booking Entry - Desktop |
| `f18d2b7bea004db492c5f0cc45d0743e` | MOBILE | 780×2094 | P22 - Demo Clinic - Booking Entry - Mobile |
| `3b5370de88bf4bb8adaf679dae11b035` | DESKTOP | 2560×2048 | P22 - Demo Clinic - Doctors - Desktop |
| `911e3c7f4fdd4016bedea8641aad2c6f` | MOBILE | 780×2272 | P22 - Demo Clinic - Doctors - Mobile |
| `0d9f0a8244804859b12ffd7dee972754` | DESKTOP | 2560×2048 | P22 - Demo Clinic - Home - Desktop |
| `2ac5e52f18bc40b187603880f1175f89` | MOBILE | 780×1976 | P22 - Demo Clinic - Home - Mobile |
| `38b42384631a423abd13f4f1d23ebd43` | DESKTOP | 2560×2048 | P22 - Demo Clinic - Pricing - Desktop |
| `e6360fb33fba477bb2ad47f81234fae3` | MOBILE | 780×2330 | P22 - Demo Clinic - Pricing - Mobile |
| `61bcf76807744d898c859ed1078236b5` | DESKTOP | 2560×2174 | P22 - Demo Clinic - Services - Desktop |
| `a0d5997b31c44203ba94de0708ca5737` | MOBILE | 780×2768 | P22 - Demo Clinic - Services - Mobile |
| `016440abad32484486a24c43d46a44f8` | DESKTOP | 2560×2048 | P22 - Juflona Clinic - Booking Entry - Desktop |
| `bdc67d336bc64447bd0c02474b34c144` | MOBILE | 780×1768 | P22 - Juflona Clinic - Booking Entry - Mobile |
| `ea3abfe05bcc4e6a96eeba72dfea5d38` | DESKTOP | 2560×2048 | P22 - Juflona Clinic - Closed or Unavailable - Desktop |
| `4df57c6409904d9aadd5841987aa315f` | MOBILE | 780×1768 | P22 - Juflona Clinic - Closed or Unavailable - Mobile |
| `32766a7879be4e539bd1ca8e352ef1d0` | DESKTOP | 2560×2048 | P22 - Juflona Clinic - Location - Desktop |
| `4fb9866c196540199d4de109ba807726` | MOBILE | 780×1768 | P22 - Juflona Clinic - Location - Mobile |
| `0d8b62deaeb843a99f02f844a5d00ebd` | DESKTOP | 2560×2048 | P22 - Juflona Clinic - Not Found - Desktop |
| `e4668b043467417295bdb7c41836a344` | MOBILE | 780×1768 | P22 - Juflona Clinic - Not Found - Mobile |
| `7780a4d599b441a6be7695ff72b84107` | DESKTOP | 2560×2048 | P22 - Juflona Clinic - Pricing - Desktop |
| `775340af70d540bea3af6d7ed277402a` | MOBILE | 780×1876 | P22 - Juflona Clinic - Pricing - Mobile |
| `38abfa8767f4492ca11895b4f360effe` | DESKTOP | 2560×3888 | P22 - Juflona Public - About - Desktop |
| `4aa46e7ddb424bc690e16a246de28c6b` | MOBILE | 780×3606 | P22 - Juflona Public - About - Mobile |
| `a1a662f6a5c342df8783414bff11a866` | DESKTOP | 2560×2510 | P22 - Juflona Public - Contact - Desktop |
| `a1ceb17fd59a429a980d0b20ea42e83b` | MOBILE | 780×3304 | P22 - Juflona Public - Contact - Mobile |
| `c3586685e9f342f681f177d1036c18fc` | MOBILE | 780×1768 | P22 - Juflona Public - Contact Success - Mobile |
| `85d2b873d38f4196a9b17eb35e2bc4da` | DESKTOP | 2560×2048 | P22 - Juflona Public - Home - Desktop |
| `6eb5bda4ca694e54b34693e3f86e986b` | MOBILE | 780×3034 | P22 - Juflona Public - Home - Mobile |
| `5adb49b9a1a940a581eeaca83524c7f1` | DESKTOP | 2560×2716 | P22 - Juflona Public - Patient Information - Desktop |
| `62f5da19ec9047898ba0957faf21b408` | MOBILE | 780×2490 | P22 - Juflona Public - Patient Information - Mobile |
| `ab5711022ce84342b2e9ecfae818d78e` | DESKTOP | 2560×2720 | P22 - Juflona Public - Privacy - Desktop |
| `45a9c24fcbfe4bbdb739452308397b95` | MOBILE | 780×1768 | P22 - Juflona Public - Privacy - Mobile |
| `2a7f744da5a44fc68c1f1bfeafba67ff` | DESKTOP | 2560×4266 | P22 - Juflona Public - Terms - Desktop |
| `a789772602dc4e2bac342970ca833751` | MOBILE | 780×1768 | P22 - Juflona Public - Terms - Mobile |
| `47005f4888bc4e099a990fd65a6b8962` | DESKTOP | 2560×2048 | P23 - Juflona Public - Consultation Service Detail - Desktop |
| `e6205fec780046f5bb006c669276a5c5` | MOBILE | 780×1844 | P23 - Juflona Public - Consultation Service Detail - Mobile |
| `75e6b6a7fbba46018ee8aab976f72d23` | DESKTOP | 2560×2358 | P23 - Juflona Public - Doctor Profile - Desktop |
| `64cf5e42e55c4f9fbcebaf59a6940f5b` | MOBILE | 780×2774 | P23 - Juflona Public - Doctor Profile - Mobile |
| `dba48eeff55343cc95f1876c76388ce6` | DESKTOP | 2560×3292 | P23 - Juflona Public - Doctors - Desktop |
| `dae36b9307f149d9ad4989a16eec975d` | MOBILE | 780×2406 | P23 - Juflona Public - Doctors - Mobile |
| `8a5894d5bc294a90ae7c8a83ec159230` | MOBILE | 780×3762 | P23 - Juflona Public - Doctors States - Mobile |
| `cf33b64cfa39421893a4413422a4e13a` | DESKTOP | 2560×2282 | P23 - Juflona Public - Informational Service Detail - Desktop |
| `9f712f5799384727bb06b415618dd186` | MOBILE | 780×2314 | P23 - Juflona Public - Informational Service Detail - Mobile |
| `b887c39d2de947fda062d568b641f229` | DESKTOP | 2560×2048 | P23 - Juflona Public - Procedure Service Detail - Desktop |
| `e54a6661157f441d93c94efad91a8858` | MOBILE | 780×3126 | P23 - Juflona Public - Procedure Service Detail - Mobile |
| `a59b166b17ff4c1b8514102aedaeef57` | DESKTOP | 2560×2048 | P23 - Juflona Public - Public Price Patterns - Desktop |
| `c158c997d0db4d6bb2b228164441ab37` | MOBILE | 780×2692 | P23 - Juflona Public - Service States - Mobile |
| `3b7d3c9f3808441a8965c43b86c4ba44` | DESKTOP | 2560×2088 | P23 - Juflona Public - Services - Desktop |
| `e0b4b500de47418cb4df06df8a65428b` | MOBILE | 780×2214 | P23 - Juflona Public - Services - Mobile |
| `e879dd50e2d64f6b93aa807efbdd1775` | DESKTOP | 2560×2048 | P24 - Juflona Booking - Appointment Entry - Desktop |
| `e4e98986370640f2864a9aa2279ad878` | MOBILE | 780×2116 | P24 - Juflona Booking - Appointment Entry - Mobile |
| `d548137f807b40daaaaeff7fe2bcd0fa` | MOBILE | 780×4424 | P24 - Juflona Booking - Availability States - Mobile |
| `688a0eee8f014c7a8c999762b22be06d` | DESKTOP | 2560×2048 | P24 - Juflona Booking - Choose Doctor - Desktop |
| `f9d67dd3a8c2457884c7e32bcbbf47e5` | MOBILE | 780×1768 | P24 - Juflona Booking - Choose Doctor - Mobile |
| `32812bec1d384d2ab5c9821f6865e85a` | DESKTOP | 2560×2476 | P24 - Juflona Booking - Choose Slot - Desktop |
| `ece91cba8cff4381a9ef2e8ac97cb988` | MOBILE | 780×1768 | P24 - Juflona Booking - Choose Slot - Mobile |
| `a4096a26352040fd9d56be53a393fe4b` | DESKTOP | 2560×2048 | P24 - Juflona Booking - Consultation Type - Desktop |
| `82cc9c49d881406592c6d877240731fd` | MOBILE | 780×1848 | P24 - Juflona Booking - Consultation Type - Mobile |
| `4dc9024e5d6f4267bf6b5a8c6c80aa08` | MOBILE | 780×2932 | P24 - Juflona Booking - Form States - Mobile |
| `c8dc05d3e0744fcf9f0030ccbe63a172` | MOBILE | 780×1768 | P24 - Juflona Booking - Mobile Navigation and Summary Pattern - Mobile |
| `e49351b2224449d2b86756b198e5ffb6` | DESKTOP | 2560×2048 | P24 - Juflona Booking - Patient Details - Desktop |
| `b1e95d2173934e969b8d2b85346b82bd` | MOBILE | 780×1768 | P24 - Juflona Booking - Patient Details - Mobile |
| `14b98caed9cc4b4889d77763373a0e28` | DESKTOP | 2560×2048 | P24 - Juflona Booking - Progress Patterns - Desktop |
| `12e5d96e8ac647f49d0cf66457da4b17` | DESKTOP | 2560×2048 | P24 - Juflona Booking - Request Submitted - Desktop |
| `8f72ff10f79d421fade5a7ac6e6d875f` | MOBILE | 780×1926 | P24 - Juflona Booking - Request Submitted - Mobile |
| `1167937cacc4424f852368d5179a7e7c` | DESKTOP | 2560×2120 | P24 - Juflona Booking - Review - Desktop |
| `5263923b759a4bc288c23c8ffe5c85b0` | MOBILE | 780×2050 | P24 - Juflona Booking - Review - Mobile |
| `bb250d93ee27449793869522211fb17c` | MOBILE | 780×2172 | P24 - Juflona Booking - SMS Notification States - Mobile |
| `6b916729502c43f08ef4ed61bf959159` | DESKTOP | 2560×2198 | P25 - Juflona Booking - Choose Procedure - Desktop |
| `9526a27d8e5a4c8eb5a9bee842bee41b` | MOBILE | 780×2012 | P25 - Juflona Booking - Choose Procedure - Mobile |
| `bb4906f130374a72a21596d427c2af9d` | MOBILE | 780×2096 | P25 - Juflona Booking - Preparation States - Mobile |
| `2f99501abec942138637abb0934ed767` | DESKTOP | 2560×2250 | P25 - Juflona Booking - Procedure Confirmation Rules - Desktop |
| `2d5d9db651e046eabb65fdbc89b676e2` | MOBILE | 780×2218 | P25 - Juflona Booking - Procedure Form States - Mobile |
| `ea6f77fad9444fa3b3f04cf5178f9c72` | DESKTOP | 2560×2048 | P25 - Juflona Booking - Procedure Information - Desktop |
| `d033da337b5740f29b4681042ab4a99c` | MOBILE | 780×2056 | P25 - Juflona Booking - Procedure Information - Mobile |
| `ffc4c24bcadd4b919bdb573d7d06681c` | MOBILE | 780×2218 | P25 - Juflona Booking - Procedure Mobile Summary Pattern - Mobile |
| `2a64a22146ed4b2ca704d01d9cb18383` | DESKTOP | 2560×2662 | P25 - Juflona Booking - Procedure Patient Details - Desktop |
| `d2c8f78719484d7ca4d443f844f83929` | MOBILE | 780×2058 | P25 - Juflona Booking - Procedure Patient Details - Mobile |
| `82a454047e064592b763896f815aa721` | DESKTOP | 2560×2048 | P25 - Juflona Booking - Procedure Progress Patterns - Desktop |
| `e04f78111c6a43eb851a0db24cc2f001` | DESKTOP | 2560×2048 | P25 - Juflona Booking - Procedure Review - Desktop |
| `6da5390fcac44722a37ae34f2ae82a11` | MOBILE | 780×2276 | P25 - Juflona Booking - Procedure Review - Mobile |
| `8c52142a20484c39928c8f3355174384` | DESKTOP | 2560×2048 | P25 - Juflona Booking - Procedure Slot - Desktop |
| `3f05000a252b4732952b7dcbd70a9c06` | MOBILE | 780×2100 | P25 - Juflona Booking - Procedure Slot - Mobile |
| `9a4b08f02d2b4cc990eab7b16b4202aa` | MOBILE | 780×1804 | P25 - Juflona Booking - Procedure SMS States - Mobile |
| `1e23d5e9dfa649aab7746c966b255a5f` | DESKTOP | 2560×2048 | P25 - Juflona Booking - Procedure Submitted - Desktop |
| `df69f70fb79c467b9aa9a7750520a241` | MOBILE | 780×1988 | P25 - Juflona Booking - Procedure Submitted - Mobile |
| `042c455322b94242b289e4c5cee37fe8` | MOBILE | 780×1768 | P25 - Juflona Booking - Procedure Unavailable - Mobile |
| `ef1d0961e88e43549af5361a5fb9320c` | MOBILE | 780×2292 | P25 - Juflona Booking - Referral and Upload States - Mobile |
| `72428671e0fa4317bad44d3ccf367ea8` | MOBILE | 780×1768 | P25 - Juflona Booking - Referral Clarification - Mobile |
| `7377b7ca51e049048c10e34af2950bac` | DESKTOP | 2560×2048 | P25 - Juflona Booking - Referral Requirements - Desktop |
| `28dd3dae170e43f88902aa3a1f26cdfe` | MOBILE | 780×2024 | P25 - Juflona Booking - Referral Requirements - Mobile |
| `95f3a0fc88f7490fbd7d46e649e6b61e` | MOBILE | 780×3324 | P25 - Juflona Booking - Resource Availability States - Mobile |
| `e1a9a3b347b74171848d5639eaf48694` | DESKTOP | 2560×2048 | P26 - Juflona Booking - Booking Activity Pattern - Desktop |
| `ca7cdd02f84f4a13abb5b324f3fb453f` | MOBILE | 780×1768 | P26 - Juflona Booking - Booking Changed During Request - Mobile |
| `df011954ab5248cfb5126f49d6187258` | DESKTOP | 2560×2048 | P26 - Juflona Booking - Booking Detail Cancelled - Desktop |
| `48a852ead3284e44b9700df8a8875167` | MOBILE | 780×1774 | P26 - Juflona Booking - Booking Detail Cancelled - Mobile |
| `a0d78f650671453594236ad0ad1f727f` | DESKTOP | 2560×2048 | P26 - Juflona Booking - Booking Detail Completed - Desktop |
| `bbe2c7c3fdf442b397ee457e287b1674` | MOBILE | 780×1814 | P26 - Juflona Booking - Booking Detail Completed - Mobile |
| `36db01f8f7d741a8ad3b91536834ab10` | DESKTOP | 2560×2186 | P26 - Juflona Booking - Booking Detail Confirmed - Desktop |
| `5511e7ced0094007b300f58665fc9ccd` | MOBILE | 780×1768 | P26 - Juflona Booking - Booking Detail Confirmed - Mobile |
| `0a244c1b24f140368509e4f6f014a9fe` | DESKTOP | 2560×2048 | P26 - Juflona Booking - Booking Detail No-show - Desktop |
| `e712f1d474024445899b4014f1d5c977` | MOBILE | 780×1768 | P26 - Juflona Booking - Booking Detail No-show - Mobile |
| `3b311f353e1745c0b020b400af92b0f5` | DESKTOP | 2560×2048 | P26 - Juflona Booking - Booking Detail Pending - Desktop |
| `df7614f5b31347d4b3dff81928e5eadc` | MOBILE | 780×2460 | P26 - Juflona Booking - Booking Detail Pending - Mobile |
| `8e3e9337e8404c38b4f3e1dacdc7ba9c` | DESKTOP | 2560×2156 | P26 - Juflona Booking - Booking Detail Rescheduled - Desktop |
| `189043d6d06d4819b06ea42e22e10035` | MOBILE | 780×1768 | P26 - Juflona Booking - Booking Detail Rescheduled - Mobile |
| `b18ffbdac9a644f8bea30734fc9368df` | DESKTOP | 2560×2132 | P26 - Juflona Booking - Booking Status Patterns - Desktop |
| `766528bda7e548ac93d381129023802f` | DESKTOP | 2560×2142 | P26 - Juflona Booking - Cancellation Request - Desktop |
| `81d1f26454324356b25cfec1db745491` | MOBILE | 780×1838 | P26 - Juflona Booking - Cancellation Request - Mobile |
| `4685ca7800dd477faa561270dfe01cba` | DESKTOP | 2560×2048 | P26 - Juflona Booking - Cancellation Review - Desktop |
| `3be2c468e5e24ae592feb7c8b264b098` | MOBILE | 780×1768 | P26 - Juflona Booking - Cancellation Review - Mobile |
| `f510ec7d017e426e86e801932011d346` | DESKTOP | 2560×2196 | P26 - Juflona Booking - Cancellation Submitted - Desktop |
| `f30239e9267242c0af4dfbaf44bb2d20` | MOBILE | 780×2218 | P26 - Juflona Booking - Cancellation Submitted - Mobile |
| `7b7546940db743839e4c4b11ae366dda` | MOBILE | 780×2548 | P26 - Juflona Booking - Change Request States - Mobile |
| `e4fa5d144ebb46cea06c4ef3a3af3e7b` | MOBILE | 780×4492 | P26 - Juflona Booking - Lookup Error States - Mobile |
| `ab96f1f72f444e9e943a1e6b2d539b46` | MOBILE | 780×1768 | P26 - Juflona Booking - Lookup Progress - Mobile |
| `8f9a5650ff3d4f7482de4f82bcee597b` | MOBILE | 780×1768 | P26 - Juflona Booking - Mobile Booking Summary Pattern - Mobile |
| `a8ad8c9b489149d592cd9ca53a525e14` | DESKTOP | 2560×2048 | P26 - Juflona Booking - My Booking - Desktop |
| `a2b5c7ddfddc4c80a1ddb035748da72f` | MOBILE | 780×2050 | P26 - Juflona Booking - My Booking - Mobile |
| `4e84a1501ffa454b91221a4f32cfaabb` | MOBILE | 780×1868 | P26 - Juflona Booking - Pending Preference Change - Mobile |
| `e50e9dfeaf1a405bbf3f3c334ebbe039` | DESKTOP | 2560×2178 | P26 - Juflona Booking - Privacy and Lookup Rules - Desktop |
| `97540ef2e0244f97a2974c50835276c3` | DESKTOP | 2560×2872 | P26 - Juflona Booking - Reschedule Request - Desktop |
| `c016257b490d42ccb49bdb01e4228c2f` | MOBILE | 780×1868 | P26 - Juflona Booking - Reschedule Request - Mobile |
| `d968e9e9008d4987a5c4cdba86ab9a95` | DESKTOP | 2560×2048 | P26 - Juflona Booking - Reschedule Review - Desktop |
| `15321bc4c76f4c08b61e59972aa7d44f` | MOBILE | 780×1768 | P26 - Juflona Booking - Reschedule Review - Mobile |
| `ba51a076b8ed49e0b4761f3068b56e41` | DESKTOP | 2560×2048 | P26 - Juflona Booking - Reschedule Submitted - Desktop |
| `684f5190840549698bd9237caedeccb3` | MOBILE | 780×2098 | P26 - Juflona Booking - Reschedule Submitted - Mobile |
| `bb852d4218b9470981d9944eff62b1b4` | DESKTOP | 2560×2626 | P27 - Juflona Patient - Account Security - Desktop |
| `e506a5ea31c54b0abd9d7bba96c83ed8` | DESKTOP | 2560×2370 | P27 - Juflona Patient - Booking Detail - Desktop |
| `b3521756764f4a978c9244a2f5c3ae9e` | MOBILE | 780×1768 | P27 - Juflona Patient - Booking Filters - Mobile |
| `1bb70f70b2d442bda9ec2bcfe6c9cd08` | DESKTOP | 2560×2048 | P27 - Juflona Patient - Dashboard - Desktop |
| `e4c2703d85764c2cbf2f91ab890d27e3` | MOBILE | 780×1784 | P27 - Juflona Patient - Dashboard - Mobile |
| `0ec2c722bd80493ea69102f61b9b36e3` | MOBILE | 780×1768 | P27 - Juflona Patient - Dashboard Empty - Mobile |
| `d499e36b667047e1998d38d66be6bbe2` | DESKTOP | 2560×2048 | P27 - Juflona Patient - Dashboard Multiple Bookings - Desktop |
| `215624995dc145f7ad5f6adb14fd4ae6` | DESKTOP | 2560×2048 | P27 - Juflona Patient - Forgot Password - Desktop |
| `9ff0dd371e8e49d38b82288c77699671` | MOBILE | 780×1768 | P27 - Juflona Patient - Forgot Password - Mobile |
| `1d86eebeee5645c784e68b3b6315d06b` | MOBILE | 780×1768 | P27 - Juflona Patient - Link Guest Booking - Mobile |
| `4bc683c012fc465681d21655ac3d1d01` | DESKTOP | 2560×2048 | P27 - Juflona Patient - Login - Desktop |
| `7c24084776e64719be06423d42263e61` | MOBILE | 780×1920 | P27 - Juflona Patient - Login - Mobile |
| `795b6f3cce584467bdc369bd89f67419` | MOBILE | 780×2804 | P27 - Juflona Patient - Login States - Mobile |
| `e5078ea281eb4f29a284cf461b1c9b85` | MOBILE | 780×1896 | P27 - Juflona Patient - Mobile Navigation Pattern - Mobile |
| `b86ad20f46574f5cba98f3aa4909b597` | MOBILE | 780×2274 | P27 - Juflona Patient - My Bookings - Mobile |
| `1938bff7a7d54fa5a7d856457864d84d` | MOBILE | 780×1980 | P27 - Juflona Patient - Notifications - Mobile |
| `cc39b8bf074e408682da114b26ed8897` | MOBILE | 780×1768 | P27 - Juflona Patient - Password Updated - Mobile |
| `8405633077d0486f9622badff41899c9` | DESKTOP | 2560×2048 | P27 - Juflona Patient - Patient Data Boundaries - Desktop |
| `5eceb58beaad489ba03f6750dee3896d` | DESKTOP | 2560×3534 | P27 - Juflona Patient - Portal Component Patterns - Desktop |
| `210ee3ac1bbe43588ed84d2e663c6604` | MOBILE | 780×1768 | P27 - Juflona Patient - Portal Offline State - Mobile |
| `34350dec0e124a538024436ec728e2be` | DESKTOP | 2560×2048 | P27 - Juflona Patient - Profile - Desktop |
| `3e22604b90844b499b98bed2dba8f81c` | MOBILE | 780×1768 | P27 - Juflona Patient - Recovery Verification - Mobile |
| `cc7711d9ca2947bba30e8bdde0c473de` | DESKTOP | 2560×2580 | P27 - Juflona Patient - Register - Desktop |
| `588d1139d7b548c5856e9e34ce736bf9` | MOBILE | 780×2036 | P27 - Juflona Patient - Register - Mobile |
| `bc0fd174f14d4a3a8e78a57aad1564ee` | MOBILE | 780×7280 | P27 - Juflona Patient - Registration States - Mobile |
| `e1b3f826511f408e85c401d3a455f26d` | DESKTOP | 2560×2048 | P27 - Juflona Patient - Set New Password - Desktop |
| `fb2dab64c9ed41f483ae83d4a7f20fe3` | MOBILE | 780×1768 | P27 - Juflona Patient - Set New Password - Mobile |
| `aebd18aad45b40ad90ebe164b87b282e` | MOBILE | 780×1768 | P27 - Juflona Patient - Verification Success - Mobile |
| `4cb2cd96dd3846dcbcd3504e45b90f47` | DESKTOP | 2560×2048 | P27 - Juflona Patient - Verify Phone - Desktop |
| `fc27f3a94086412bbb546e19248ffc5d` | MOBILE | 780×1768 | P27 - Juflona Patient - Verify Phone - Mobile |

### Internal project 12272131183982732110

199 screens.

| ID | Device | Size | Title |
| --- | --- | --- | --- |
| `8731b06bbfa747e98e05372c9aafb3e9` | DESKTOP | 2560×2048 | Access Restricted |
| `9f3abb837fc3413aa128949afce0d8c4` | DESKTOP | 2560×2048 | Application Shell - Desktop |
| `c54b0a846c054044aa0ca05194e320ef` | DESKTOP | 2560×2056 | Dashboard - Desktop |
| `d19b0d5c33ae42e08ca767a11b12e591` | MOBILE | 780×1768 | Dashboard - Mobile |
| `8bf5c500e0d14014944618029212b2c9` | DESKTOP | 2560×2048 | Login - Desktop |
| `6e3cbe4963c3428196b10d3bb27421d5` | MOBILE | 780×1768 | Login - Mobile |
| `87c5a80e0fcb40179c0d1ce7ea906762` | MOBILE | 1420×1768 | Navigation Drawer - Mobile |
| `390032bf54ca44ee851673a4800f9af3` | DESKTOP | 2560×2176 | P01 – Dashboard – Desktop |
| `8be466d48814446ab8bb087baacc6ec9` | MOBILE | 780×2052 | P01 – Dashboard – Mobile |
| `ca8a34cf1ecb4fefa2ed31fb9873ae45` | DESKTOP | 2560×2048 | P01 – Login – Desktop |
| `026f619c35b04a5c8dde16eca9f7cf35` | MOBILE | 780×1768 | P01 – Login – Mobile |
| `9f55cec7eb884dbebc2e01c6fb0fe58e` | MOBILE | 780×1768 | P01 – Navigation Drawer – Mobile |
| `01b9125044634434b60223746b815b25` | DESKTOP | 2560×2048 | P01 – Shared Application Shell – Desktop |
| `9b881d25874c41f9986246c61de32f41` | DESKTOP | 2560×2048 | P01 – Shared States – Desktop |
| `91e41fecc2b64496893b52317b7ab985` | DESKTOP | 2560×2048 | P02 – Duplicate Patient Warning |
| `0c3315d05469499d9b645bc7978001bf` | DESKTOP | 2560×2048 | P02 – Edit Patient Details – Desktop |
| `4c6a5fe1c21c46709679f3707b8bf4dc` | MOBILE | 780×2496 | P02 – Edit Patient Details – Mobile |
| `5a6728d97b674200823562bb015e10ed` | DESKTOP | 2560×2048 | P02 – Patient List – Desktop |
| `58bd5e04f71340ff8d067721eb5562d4` | MOBILE | 780×1768 | P02 – Patient List – Mobile |
| `1a15f0bf4e564c4993ca33aa2d578a58` | DESKTOP | 2560×2208 | P02 – Patient Profile Overview – Desktop |
| `99eb441b48a24fa19855e76669c0da86` | MOBILE | 780×2072 | P02 – Patient Profile Overview – Mobile |
| `cd688e761cca43a1af299769014cb5f0` | DESKTOP | 2560×2048 | P02 – Patient Registration Success – Desktop |
| `b9615559155d41d591dbb91e18c6a090` | MOBILE | 780×1794 | P02 – Patient Registration Success – Mobile |
| `f98b2e6f2a4a4953a4d811af7b3737a2` | DESKTOP | 2560×2048 | P02 – Patient Shared States – Desktop |
| `3c113fe684604dfcaeb8f6b2c071a6ca` | DESKTOP | 2560×2048 | P02 – Print Patient Card Preview |
| `e1ef5e5d8a1840bcbf1f4dc859f7b812` | DESKTOP | 2560×2048 | P02 – Register Patient Contact – Desktop |
| `44fb7852e24f4f7f9f6b355a195fd250` | MOBILE | 780×2158 | P02 – Register Patient Contact – Mobile |
| `026d2e6c69cd4181a282213ba1bb55da` | DESKTOP | 2560×3136 | P02 – Register Patient Emergency and Medical – Desktop |
| `7a495a471fed49b098de3c1605eda76e` | MOBILE | 780×1768 | P02 – Register Patient Emergency and Medical – Mobile |
| `40d2005b64864f35ac8df831ddae7084` | DESKTOP | 2560×2048 | P02 – Register Patient Identity – Desktop |
| `8ef4b4d96f1f4224994d0c627bb7550e` | DESKTOP | 2560×2098 | P02 – Register Patient Review – Desktop |
| `a6d496f38f8e4d5cb8eb4d91667c6db7` | MOBILE | 780×2332 | P02 – Register Patient Review – Mobile |
| `0fca19f233af43c49966e7eb62bccb02` | DESKTOP | 2560×2048 | P03 – Appointment Calendar – Desktop |
| `327422c1b36747039e4026a17c5a2f33` | DESKTOP | 2560×2048 | P03 – Appointment Confirmation – Desktop |
| `284e9f8cd6804b0eb0f50574e2f571d6` | DESKTOP | 2560×2048 | P03 – Appointment List – Desktop |
| `480ecaba5258423e8711b1fdd2f39e1b` | MOBILE | 780×1768 | P03 – Appointment List – Mobile |
| `089aa8f266664446a8b38cb69d1fda48` | DESKTOP | 2560×2048 | P03 – Appointment Shared States – Desktop |
| `a99c6ac04cf24f2c8ca349715c1829dc` | DESKTOP | 2560×2048 | P03 – Book Appointment – Desktop |
| `b27eafc25bad4006868f3932d08bfed5` | DESKTOP | 2560×2048 | P03 – Cancel Appointment – Desktop |
| `305d90143b0e4381b112bf6eb113f1c2` | DESKTOP | 2560×2176 | P03 – Create Walk-In Visit – Desktop |
| `fd009ceba70f40b2ae1755b94220c64b` | DESKTOP | 2560×2048 | P03 – Doctor Schedule – Desktop |
| `7d37e069c7644e7cb4c9b72349a0ccf7` | DESKTOP | 2560×2048 | P03 – Missed Appointments – Desktop |
| `8dca6dbd36b840928e73d6674bbcb3ea` | DESKTOP | 2560×2048 | P03 – Patient Called – Desktop |
| `9284064428f443b1a3a1504054827d91` | DESKTOP | 2560×2048 | P03 – Patient Check-In – Desktop |
| `f7841548662446cfa8d70d0772d3fa9f` | DESKTOP | 2560×2048 | P03 – Patient Did Not Respond — Desktop |
| `1fa99f4a358c47ffb858addae7095fe8` | DESKTOP | 2560×2048 | P03 – Queue Assignment – Desktop |
| `bf9b846da6174bf995793b09e869cd30` | DESKTOP | 2560×2048 | P03 – Queue Stale Data Warning – Desktop |
| `8b7173ba4ff94eb2a7d7e548b5f7253d` | DESKTOP | 2560×2048 | P03 – Reception Queue – Desktop |
| `73499b0dfef446c99a908b1cc56252a5` | MOBILE | 780×1768 | P03 – Reception Queue – Mobile |
| `da39a3945ace4fac85cb12bd86f0cdc2` | DESKTOP | 2560×2048 | P03 – Reschedule Appointment – Desktop |
| `9429b14e9ea243ad93aec4a486db93e9` | MOBILE | 780×1768 | P03 – Reschedule Appointment – Mobile |
| `e807a1354fdd418391496e69e5ac5f3e` | DESKTOP | 2560×2048 | P03 – Transfer Patient to Department – Desktop |
| `99757cfd7d3747d490f00ac342faa519` | DESKTOP | 2560×2048 | P04 – Clinical Escalation Alert |
| `b8d47f05a83c4959ac2d3d6ca83c7dfb` | DESKTOP | 2560×2048 | P04 – Clinical Queue – Desktop |
| `16897ac752a94750bf00225db66ff768` | MOBILE | 780×1768 | P04 – Clinical Queue – Mobile |
| `5e4dbc7265ad4e17b060b1f641996db3` | DESKTOP | 2560×2048 | P04 – Consultation Workspace – Desktop |
| `15c6c639c2b04bbda97b54f127c500f8` | MOBILE | 780×1768 | P04 – Consultation Workspace – Mobile |
| `969bbfbdf9634dbc8af598ec2277e92f` | DESKTOP | 2560×2536 | P04 – Create Laboratory Request |
| `ee9bf2322b924cd79e86619a4635f702` | DESKTOP | 2560×2048 | P04 – Create Prescription |
| `bc4ffd8f0e8c44f48f38cc15a069656a` | DESKTOP | 2560×2048 | P04 – Create Radiology Request |
| `33a522e2f4eb45c9bdbede9ba34e0bee` | DESKTOP | 2560×2048 | P04 – Diagnosis Entry |
| `7959616d1673403ba3bf6ff71d18a77b` | DESKTOP | 2560×2048 | P04 – Nursing Intake – Desktop |
| `3c8f7b43b7984718acf661e381c1e6f7` | DESKTOP | 2560×2146 | P04 – Triage Assessment – Desktop |
| `dede5e72277d413497e1f870f6b4a0e1` | DESKTOP | 2560×2048 | P04 – Vital Signs Entry – Desktop |
| `83495a7aea6547ce873af695fcb5f604` | DESKTOP | 2560×2538 | P05 – Add Medicine |
| `e4d4e37c175a458d9004e1240395ba63` | DESKTOP | 2560×2176 | P05 – Dispense Prescription – Desktop |
| `ace4f11562b24515866b40c5594a18e6` | MOBILE | 780×2170 | P05 – Dispense Prescription – Mobile |
| `eeaf00f13f6f4e238da3aef30a556a57` | DESKTOP | 2560×2176 | P05 – Dispensing Completed – Desktop |
| `00a95c467df2414fb8c6dea108170b04` | DESKTOP | 2560×2084 | P05 – Dispensing Confirmation |
| `97138791742e4338a34811a6fd7e464d` | DESKTOP | 2560×2244 | P05 – Dispensing Review – Desktop |
| `fcba0b2ed1334eacad9647e597f66959` | DESKTOP | 2560×2048 | P05 – Expiry Alerts – Desktop |
| `553dd601642d41abb89cf4c7127c221a` | DESKTOP | 2560×2048 | P05 – Low Stock Alerts – Desktop |
| `6c0795f36aef4fe3b634dc350d230672` | DESKTOP | 2560×2048 | P05 – Medicine Batch Detail |
| `b5e534cf921d460c9774c2772ab688e9` | DESKTOP | 2560×2048 | P05 – Medicine Catalogue – Desktop |
| `20a62e6f34ef422b8262750b0fe9788a` | DESKTOP | 2560×2176 | P05 – Medicine Detail – Desktop |
| `1f079e7d3f9c464c8754fa09a09f2626` | DESKTOP | 2560×2048 | P05 – Medicine Inventory – Desktop |
| `a0cb61de9f0f4eaa8d732d4cf143f090` | MOBILE | 780×1768 | P05 – Medicine Inventory – Mobile |
| `e237cd030fb241deb15ed8eb0f4f895e` | DESKTOP | 2560×2048 | P05 – Medicine Substitution – Desktop |
| `c7c3ea1931f74acb845208dd09d0d63d` | DESKTOP | 2560×2176 | P05 – Partial Dispensing – Desktop |
| `7cffba8bdac84abda7a8d31951d1948f` | MOBILE | 780×2108 | P05 – Patient Medicine Instructions – Mobile |
| `4d83f5c845ae4d91b805a1dfd6a7268d` | DESKTOP | 2560×2048 | P05 – Pharmacy Dashboard – Desktop |
| `0f1976955fc14d8c97f1f8c728b4e1da` | DESKTOP | 2560×2048 | P05 – Pharmacy Purchase Orders – Desktop |
| `2147643a82af4fb28a8368dcff867a75` | DESKTOP | 2560×2048 | P05 – Pharmacy Stock Adjustment |
| `ce22d1c5de5f43ad8a458f57aa217fd3` | DESKTOP | 2560×2048 | P05 – Pharmacy Stock Transfer |
| `99d29d4a8b204031b068e2b94dfeb95b` | DESKTOP | 2560×2048 | P05 – Prescription Clinical Review – Desktop |
| `279be7b923664e449bd2001528e7c5ec` | MOBILE | 780×1768 | P05 – Prescription Clinical Review – Mobile |
| `2da2d7b7cd734161a9f8257c2256c6f3` | DESKTOP | 2560×2048 | P05 – Prescription Detail – Desktop |
| `4f369d10d5654e68bf5a5c45d8ef7d78` | MOBILE | 780×1884 | P05 – Prescription Detail – Mobile |
| `5472760fda8148cf8611564236ae2247` | DESKTOP | 2560×2048 | P05 – Prescription Queue – Desktop |
| `322c2b620c8e4b248fa5620881555d8b` | MOBILE | 780×1768 | P05 – Prescription Queue – Mobile |
| `b62126b07af7488094221932b9046193` | DESKTOP | 2560×2048 | P05 – Print Medicine Labels |
| `a61dbccce82b43788dc347e25843ae07` | DESKTOP | 2560×2048 | P05 – Receive Pharmacy Stock – Desktop |
| `a7649e64ba1e4eee8ca0bcb6a54594bd` | DESKTOP | 2560×2048 | P05 – Select Medicine Batch |
| `f53854e6c18e45a094a0bab86e011e5b` | DESKTOP | 2560×2176 | P06 – Critical Result Alert |
| `59ee5d74ff1f47eca3c6fb09413b7c09` | DESKTOP | 2560×2048 | P06 – Enter Laboratory Result – Desktop |
| `41a0f1b3e1974e7ca26599bf8a37fc5f` | DESKTOP | 3072×2194 | P06 – Enter Radiology Report – Desktop |
| `5b7b36f6af3b4735a81cca8cea77ee99` | DESKTOP | 2678×2048 | P06 – Laboratory Dashboard – Desktop |
| `d53f9752db564b18b35fd761ecd73dd8` | MOBILE | 780×2662 | P06 – Laboratory Dashboard – Mobile |
| `51c3b93fec6e40aebc327a4998fb29ea` | DESKTOP | 2560×2176 | P06 – Laboratory Request Detail – Desktop |
| `f8b17233f1f7457ea5fe5179207aa0d1` | DESKTOP | 2622×2048 | P06 – Laboratory Request Queue – Desktop |
| `cd5ff44012dd4f0f88fc7ed60848fd37` | DESKTOP | 2560×2048 | P06 – Laboratory Worklist – Desktop |
| `65286a85cc674df097dedf0890378a29` | DESKTOP | 2560×2048 | P06 – Radiology Dashboard – Desktop |
| `070284f5583d43598111b2f6c35d0425` | MOBILE | 780×2502 | P06 – Radiology Dashboard – Mobile |
| `1fa6c921703145af96e47f7344b6cb62` | DESKTOP | 2560×2048 | P06 – Radiology Request Queue – Desktop |
| `73c50eef2b10459793f12689cce27bb6` | DESKTOP | 2560×2414 | P06 – Specimen Collection – Desktop |
| `5018c7fabf324fcebfbac85d7048f19a` | DESKTOP | 2560×2468 | P06 – Specimen Receipt – Desktop |
| `b62c8afb0c59477d8bcfeaac7210987a` | DESKTOP | 2560×2048 | P06 – Specimen Rejected |
| `1829edeb5d1741be9b6ae68a219ef7cc` | DESKTOP | 2560×2392 | P07 – Accounts Receivable – Desktop |
| `be4481e8f31b459facf2294f73311181` | DESKTOP | 2560×2048 | P07 – Add Invoice Item |
| `764d9a2a5a634150babb4daa1d6ebf13` | DESKTOP | 2560×2048 | P07 – Add Service – Desktop |
| `954a9269255245dd9c6e375f8cbdd93b` | DESKTOP | 2560×2048 | P07 – Automatic Charge Review |
| `f23ef64e307b44f780a19817ac04ebda` | MOBILE | 780×2074 | P07 – Bank Transfer Payment – Mobile |
| `ece0b9d1d9384f5d8c1e3b944f122e47` | DESKTOP | 2560×2048 | P07 – Billing Dashboard – Desktop |
| `649bd7649ebf4c6eb787612f844a637e` | MOBILE | 780×1982 | P07 – Billing Dashboard – Mobile |
| `61922a4c2823426b8bcdc1f236c4072b` | DESKTOP | 2560×2048 | P07 – Card Payment – Desktop |
| `02e8083e943d40deb9429b95a294ae30` | DESKTOP | 2560×2048 | P07 – Cash Count – Desktop |
| `2d81fb326b6644bbb11cabd7a8156e6e` | DESKTOP | 2560×2048 | P07 – Cash Payment – Desktop |
| `3c8ce685b0d14b74a04e1127e341f004` | MOBILE | 780×1768 | P07 – Cash Payment – Mobile |
| `d3e2ff001f694720b57371ef1a60d517` | DESKTOP | 2560×2048 | P07 – Cashier Closing – Desktop |
| `792d5cbb6f234332a088399e4ccdd545` | DESKTOP | 2560×2048 | P07 – Cashier Dashboard – Desktop |
| `1cd25ed2bb7a4504a63095a015bd823b` | DESKTOP | 2560×2048 | P07 – Cashier Shift History – Desktop |
| `1c02fc47e49c4c9990646d94a9876986` | DESKTOP | 2560×2048 | P07 – Cashier Shift – Desktop |
| `0d8cd08aba454a2f971d6cc4389d98d2` | MOBILE | 780×1768 | P07 – Cashier Shift – Mobile |
| `7dd49983c4a840b9980fb4a92d486b3c` | DESKTOP | 2560×2048 | P07 – Cashier Variance – Desktop |
| `16318693e2874e79a8463d91c6ba63ad` | DESKTOP | 2560×2048 | P07 – Collections Work Queue – Desktop |
| `513301ae28e1423ab7431e299cf45eee` | DESKTOP | 2560×2258 | P07 – Contact Patient for Payment – Desktop |
| `08ed6ee0d02447bca5e94698080bca4f` | DESKTOP | 2560×2048 | P07 – Create Invoice – Desktop |
| `b69484b43b074d6593f264d8df958d74` | DESKTOP | 2560×2048 | P07 – Create Price List – Desktop |
| `92b97e715c6f4c308e61d3b39d66a1e9` | DESKTOP | 2560×2666 | P07 – Credit Note – Desktop |
| `0f1fd946c97a48f99d34bd6ce8c8173c` | DESKTOP | 2560×2048 | P07 – Deposit Payment – Desktop |
| `319d7fca2acb45a38432aa40a2e7cf30` | DESKTOP | 2560×2048 | P07 – Finalise Invoice |
| `778eee4267984f32bcedcc38ca720fa0` | DESKTOP | 2560×2048 | P07 – Financial Correction Access Restricted |
| `54163d0beee74c29990bd83b77480af5` | DESKTOP | 2560×2048 | P07 – Financial Correction History |
| `a21d364d62f04c78ac8477971377eca9` | MOBILE | 780×3162 | P07 – Financial Correction History – Mobile |
| `9c0219d791da43df8a7abf41cf0809df` | DESKTOP | 2560×2048 | P07 – Insurance Payment Placeholder |
| `5bde2c1a3d954ec396679abc3888abe5` | DESKTOP | 2560×2048 | P07 – Invoice Amendment |
| `92af580dd9db4a3ea5734523b72287ba` | DESKTOP | 2560×2048 | P07 – Invoice Amendment Review – Desktop |
| `b1a8b1855b9b4e268cd42359707d292e` | DESKTOP | 2560×2176 | P07 – Invoice Error State |
| `06e7e10102184cc5a047e6d594f22fc2` | DESKTOP | 2560×2048 | P07 – Invoice History |
| `c479c86234b840419e821c2c48329f4e` | DESKTOP | 2560×2048 | P07 – Invoice List – Desktop |
| `40fcc3c9e03e42a68e2cadbd5c1a7685` | MOBILE | 780×1768 | P07 – Invoice List – Mobile |
| `713f3ebe920240c1a647af277278eb2f` | DESKTOP | 2560×2048 | P07 – Invoice Review – Desktop |
| `2b3c2c4ef6ac4ee48a789d3a527fe9ec` | DESKTOP | 2560×2048 | P07 – Mobile Money Payment – Desktop |
| `480e2d80a9f24f26b69b806d531fa913` | MOBILE | 780×1768 | P07 – Mobile Money Payment – Mobile |
| `0489fa5d1c37481ba159eeed1cd64155` | DESKTOP | 2560×2048 | P07 – NHIMA Claim Placeholder |
| `c2f068812d0b45809a214d6ba8399ae5` | DESKTOP | 2560×2048 | P07 – Open Cashier Shift – Desktop |
| `a84263ac97b8484698dc36d00b498ffa` | DESKTOP | 2560×2048 | P07 – Patient Billing Account – Desktop |
| `c15d892b327848a6a2897ae3a08a5803` | MOBILE | 780×1908 | P07 – Patient Billing Account – Mobile |
| `3f50a00be7624b36af773c181b2c562c` | DESKTOP | 2560×2048 | P07 – Patient Collections Account – Desktop |
| `9f422c33e30c450e9502126ba4012585` | DESKTOP | 2560×2048 | P07 – Patient Invoice – Desktop |
| `3735516f4ecb4624ac715c6f77e7810b` | MOBILE | 780×1768 | P07 – Patient Invoice – Mobile |
| `02e1c1976d844c2cac63682e1853fa46` | DESKTOP | 2560×2048 | P07 – Payment Arrangement |
| `2a0ae995f3e140da863e5aede4b2e71f` | DESKTOP | 2560×2048 | P07 – Payment Arrangement Review |
| `bda1fbd1f6f441dba26719f451ee53de` | DESKTOP | 2560×2048 | P07 – Payment Completed – Desktop |
| `45929cd32480420aaa5788be86e183f9` | DESKTOP | 2560×2048 | P07 – Payment History – Desktop |
| `2665942082b4428dbcabf3ff3a40ec60` | DESKTOP | 2560×3174 | P07 – Payment Reversal Request |
| `027b12b482934ef1a6f5dee02c888d26` | DESKTOP | 2560×2048 | P07 – Payment Reversal Review – Desktop |
| `89ce6798cbca4723ae20aa61225411b2` | DESKTOP | 2560×2048 | P07 – Payment Review – Desktop |
| `46cc5311173d48adb99cafe18ea331c2` | DESKTOP | 2560×2048 | P07 – Price Lists – Desktop |
| `a953a043598945fdab38285c7dab7206` | DESKTOP | 2560×2176 | P07 – Price Override Approval |
| `666806c4ea194d478e3baf2b7876950c` | DESKTOP | 2560×2664 | P07 – Print Patient Account Statement |
| `914eee2a18f64fac81d2f0f69adc0cc8` | DESKTOP | 2560×2048 | P07 – Print Receipt |
| `244dc0c45a23434bb2747468a699167b` | DESKTOP | 2560×2196 | P07 – Print Refund Receipt |
| `a9654729a9a44e17832910a41f0154de` | DESKTOP | 2560×2176 | P07 – Record Payment – Desktop |
| `8ca889a31c4e4ec1858c4dd4efc62731` | MOBILE | 780×1956 | P07 – Record Payment – Mobile |
| `d8f3108dfcda4ab9bf58472786d0484c` | DESKTOP | 2560×2228 | P07 – Refund Approval – Desktop |
| `e52271b7be804e0ea95c825be9f977bd` | DESKTOP | 2560×2048 | P07 – Refund Completed – Desktop |
| `b76f80fb0d164501b8108bea91813385` | DESKTOP | 2560×2176 | P07 – Refund Rejected |
| `685fb829c50a45af995772909fb49fb7` | DESKTOP | 2560×2278 | P07 – Refund Request – Desktop |
| `8461f1792a7a41209ae2abfe44db7b6a` | MOBILE | 780×1980 | P07 – Refund Request – Mobile |
| `438b1bb01f534492850ee8cb1253fcfe` | DESKTOP | 2560×2048 | P07 – Refund Review – Desktop |
| `08921cb100ab462d8ec08c007f1bd895` | DESKTOP | 2560×2176 | P07 – Revenue Reports – Desktop |
| `550a52476c254e258d58737fc1184bb6` | DESKTOP | 2560×2048 | P07 – Revenue Reports – Detailed |
| `4ca894f70d6646eca246847cd8c39d6a` | DESKTOP | 2560×2048 | P07 – Service Catalogue – Desktop |
| `1ab29b0691c04233a1c972ea99f24351` | MOBILE | 780×1856 | P07 – Service Catalogue – Mobile |
| `d5eb57a8319c4130be473f8dd23851d6` | DESKTOP | 2560×2048 | P07 – Service Detail – Desktop |
| `bb0a290730a44a108be9295a76478785` | DESKTOP | 2560×2048 | P07 – Split Payment – Desktop |
| `defb5bc8233046a4b9b1e86ebe740d1d` | DESKTOP | 2560×2048 | P07 – Unpaid Invoices – Desktop |
| `9c5a3f10f1cb44e983af2a7c36403e3d` | MOBILE | 780×2568 | P07 – Unpaid Invoices – Mobile |
| `46a8b6c4f4b846e18ab586c3d6fae6ca` | DESKTOP | 2560×2048 | P07 – Write-Off Request Placeholder |
| `c50a51a04a084f0badd48da9827aa11f` | DESKTOP | 2560×2048 | P13 – Account Security – Desktop |
| `e132749f634c4fff818acf3f8e21c361` | DESKTOP | 2560×2048 | P13 – Active Sessions – Desktop |
| `fc53eecc7d484fd5a131e01ef1127694` | DESKTOP | 2560×2048 | P13 – Add Staff Member – Desktop |
| `f30963c89fad49ceabc2447dfd46f8f0` | DESKTOP | 2560×2196 | P13 – Invite Staff Member – Desktop |
| `1db2777e1f444a0a90ca3174a4700ac2` | MOBILE | 780×1768 | P13 – Phone Verification |
| `8525edd4c31f46d6a6b5c6a233917559` | DESKTOP | 2560×2048 | P13 – Role Detail – Desktop |
| `6b9cfcd190e14155ac4390d66d0cff76` | DESKTOP | 2560×2048 | P13 – Role Permission Matrix – Desktop |
| `5307efdd84a4432b9f50ffc11f74728f` | DESKTOP | 2560×2048 | P13 – Roles and Access – Desktop |
| `4abbdd1d655045e697922c3b209c9e15` | MOBILE | 780×1768 | P13 – Set Initial Password |
| `f0c821818ad04f5ca658defd08962564` | DESKTOP | 2560×2048 | P13 – Staff Access Dashboard – Desktop |
| `23bc626a58964db894619615120d3ef2` | MOBILE | 780×1768 | P13 – Staff Access Dashboard – Mobile |
| `31600d2f5a32493b8bdd52658ab3591f` | MOBILE | 780×1768 | P13 – Staff Account Activation |
| `73fe1929482d4838b65bfd64acd406a8` | DESKTOP | 2560×2048 | P13 – Staff Directory – Desktop |
| `2f150519b0a641399b4e24bf934397c1` | MOBILE | 780×1768 | P13 – Staff Directory – Mobile |
| `7f168bfd3ac64a2ca412f43990176e41` | DESKTOP | 2560×2176 | P13 – Staff Profile – Desktop |
| `3d43526745534570bbe9cd22948be3c1` | DESKTOP | 2560×2048 | P13 – Suspend Staff Account |
| `72357dec37864a5a926a1d2b5c551b16` | DESKTOP | 2560×2048 | Shared Error State |
| `8a3f15c0be9c47efb192f206df104d5c` | DESKTOP | 2560×2048 | Shared Loading State |
| `4d31c82537634b5f981c359662d224b3` | DESKTOP | 2560×2048 | Shared Offline State |

### Authentication and CMS project 10611909237747031838

108 screens.

| ID | Device | Size | Title |
| --- | --- | --- | --- |
| `2bfbc9c71ad64bfca245d9e1a26f837d` | DESKTOP | 2560×2048 | active-clinic-03-desktop-login |
| `df566a9cd85e4583b019363ca2104b00` | DESKTOP | 2560×2048 | active-clinic-03-desktop-multi-clinic-selector |
| `f300be014a6148329910762c0b2970c8` | DESKTOP | 2560×2048 | active-clinic-03-desktop-validation-error |
| `5adaedd9e29e48cc82b47dc3ac913383` | DESKTOP | 2560×2048 | active-clinic-03-loading-signing-in |
| `edb81abfe548470db687f343186ff786` | MOBILE | 780×1768 | active-clinic-03-mobile-login |
| `ef782bd739854150b5b30ea4525c50c6` | MOBILE | 780×1768 | active-clinic-03-mobile-multi-clinic-selector |
| `236850040de8488c9627970faad74b62` | MOBILE | 780×1768 | active-clinic-03-mobile-validation-error |
| `cd19a117442440848c68b099de31e571` | DESKTOP | 2560×4168 | ACW01-01 ActiveClinic Home Desktop |
| `d2771c7c7e804754a697d7550e3911ea` | MOBILE | 780×7088 | ACW01-02 ActiveClinic Home Mobile |
| `06e890aeec9344d4b4384389d7658659` | DESKTOP | 2560×4062 | ACW02-01 Clinic Directory Desktop |
| `00089a7dfc6848b0aedbe2acbd4b3f6f` | MOBILE | 780×3724 | ACW02-02 Clinic Directory Mobile |
| `59af2deab69440c29a0be0d626734817` | DESKTOP | 2560×3794 | ACW03-01 For Clinics Desktop |
| `1def30eaafa84ca4a95dc902c57876c3` | MOBILE | 780×3880 | ACW03-02 For Clinics Mobile |
| `6dae23abf6d04b1b8bfa05fe491fdb7d` | DESKTOP | 2560×2406 | ACW03-03 Platform Features Desktop |
| `e75ff649e21641ef85de97a26afab1c7` | MOBILE | 780×1768 | ACW03-04 Platform Features Mobile |
| `d5710c9dd0174e49870845a511bca4ed` | DESKTOP | 2560×4794 | ACW04-01 Clinic Website Feature Desktop |
| `2e1ef6377ace4b4ea16737d785071c7f` | MOBILE | 780×5050 | ACW04-02 Clinic Website Feature Mobile |
| `db1c779c25614552b0a426a3ea7965ba` | DESKTOP | 2560×3980 | ACW05-01 For Patients Desktop |
| `f22cca3648c2453bad5a1edbae142158` | MOBILE | 780×4344 | ACW05-02 For Patients Mobile |
| `d6f4fe333ad245af89dbc517afeb8e06` | DESKTOP | 2560×6232 | ACW06-01 About ActiveClinic Desktop |
| `1899e7e6bbbc4a65ba083dcbe0d8fa0d` | MOBILE | 780×4966 | ACW06-02 About ActiveClinic Mobile |
| `9e85a3391ebd4695a045a974d73d14f9` | DESKTOP | 2560×2048 | MF01-01 Login Desktop |
| `f435d25c1264415e8dfca6191466611c` | MOBILE | 780×1768 | MF01-02 Login Mobile |
| `1690fc1ce82a4aaa8289d83659e70366` | DESKTOP | 2560×2048 | MF01-03 Login Error Desktop |
| `7a24bd602d2c48d5826e9048dbe27daa` | MOBILE | 780×1768 | MF01-04 Login Error Mobile |
| `a6dbf4e5e83e459ea95c50826ca30c34` | DESKTOP | 2560×2048 | MF01-05 Signing In Loading |
| `2f202c49fda04f1e89b52efa2551ead0` | DESKTOP | 2560×2048 | MF02-01 Clinic Selector Desktop |
| `c31ac73459774d6c9ea384a901a19e92` | MOBILE | 780×1810 | MF02-02 Clinic Selector Mobile |
| `6a9ab5333ac9417c8705c5a880d11431` | DESKTOP | 2560×2048 | MF02-03 No Clinic Access |
| `d955b5cbce9f48a8a3be639123a8c6f4` | DESKTOP | 2560×2048 | MF02-04 Clinic Access Disabled |
| `be4c228d874c4fdeaee82c28eaed7e81` | DESKTOP | 2560×2048 | MF03-01 Register Clinic Step 1 Desktop |
| `8d1074d16e6348c4a7da55df89133688` | MOBILE | 780×1768 | MF03-02 Register Clinic Step 1 Mobile |
| `7fac8f8297c34a1b8be5355c769a9227` | DESKTOP | 2560×2134 | MF03-03 Register Clinic Step 2 Desktop |
| `2cc66d42e4be422ca1c5feeea963f145` | MOBILE | 780×1768 | MF03-04 Register Clinic Step 2 Mobile |
| `3792389fcddc4c81915f316a1504634e` | DESKTOP | 2560×2048 | MF03-05 Registration Review Desktop |
| `b4033934e522483698aa86d6fd52fe99` | MOBILE | 780×2674 | MF03-06 Registration Review Mobile |
| `49217e086a5a45329a893bc775fede6d` | DESKTOP | 2560×2048 | MF03-07 Registration Success Desktop |
| `f90550e4e0924997a8cada0a034e76d7` | MOBILE | 780×1768 | MF03-08 Registration Success Mobile |
| `5a4fbca37976482d9294d70885235fa9` | DESKTOP | 2560×2048 | MF04-01 Forgot Password Desktop |
| `50e275a59f80463d996fcb29d2b6273d` | MOBILE | 780×1768 | MF04-02 Forgot Password Mobile |
| `e7f833d56af049e3b0306d81c9761b52` | DESKTOP | 2560×2048 | MF04-03 Verification Code Desktop |
| `c755d15f21144bcba48ccb5579e3dc07` | MOBILE | 780×1768 | MF04-04 Verification Code Mobile |
| `9ab165fac045427d9679def4f38049c3` | DESKTOP | 2560×2048 | MF04-05 Reset Password Desktop |
| `1e56748ce7f843e2916ab33e06692d9e` | MOBILE | 780×1768 | MF04-06 Reset Password Mobile |
| `c2546a84104946619e416e26fd649789` | DESKTOP | 2560×2048 | MF04-07 Password Reset Success |
| `46639010324140f89bf2c954950675a7` | DESKTOP | 2560×2048 | MF05-01 Welcome to ActiveClinic Desktop |
| `9576cbdeac1b43faa5c10313fe633618` | MOBILE | 780×1768 | MF05-02 Welcome to ActiveClinic Mobile |
| `e8694bbb106046d485a48040f2d6b94f` | DESKTOP | 2560×2854 | MF05-03 Clinic Setup Checklist Desktop |
| `df9f49e696714d9f810e5d66b7577237` | MOBILE | 780×1828 | MF05-04 Clinic Setup Checklist Mobile |
| `e61dfb582bc34ff585e3acb8aa60b0d3` | DESKTOP | 2560×2048 | MF06-01 Website Welcome Desktop |
| `1d3629ccea8e40d0b6720a653442c98b` | MOBILE | 780×1768 | MF06-02 Website Welcome Mobile |
| `e12e282fbf784eff998dc5bcaf23ad13` | DESKTOP | 2560×2300 | MF06-03 Website Setup Checklist Desktop |
| `8522ea2d33ce4f748554f5535d004264` | MOBILE | 780×1872 | MF06-04 Website Setup Checklist Mobile |
| `f3363068e1f94e619c83a44821045461` | DESKTOP | 2560×2048 | MF07-01 Invite Staff Desktop |
| `44c7c2fe9fff497980f9ca5b903cb785` | MOBILE | 780×1768 | MF07-02 Invite Staff Mobile |
| `b17405de3052471688b455a66de53805` | DESKTOP | 2560×2048 | MF08-01 Patient Registration Desktop |
| `2cf8f6ff9e9242a3a114ff7c2d8108f3` | MOBILE | 780×1768 | MF08-02 Patient Registration Mobile |
| `449d124d305845c69c93ced67fb4f6ea` | DESKTOP | 2560×2048 | MF08-03 Verification Desktop |
| `cbaed824e43d40f980f1af298db6cd5f` | MOBILE | 780×1768 | MF08-04 Verification Mobile |
| `7a6121f70744431a893a94130692d042` | DESKTOP | 2560×2398 | MF08-05 Health Profile Setup Desktop |
| `d9a0fc3847264ce08f336e0e3bfbfd7a` | MOBILE | 780×2018 | MF08-06 Health Profile Setup Mobile |
| `f96a31fbffa14b1781a24cfa44cb6e7d` | DESKTOP | 2560×2048 | MF09-01 Patient Dashboard Desktop |
| `9c0157d10d6f439f9892f89848f5d19c` | MOBILE | 780×2376 | MF09-02 Patient Dashboard Mobile |
| `2e77628dd3214f5bb8b2ed046be10aa8` | DESKTOP | 2560×2444 | MF10-01 Select Service Desktop |
| `9ea79123a4e04082ac9e478a438fe047` | MOBILE | 780×1768 | MF10-02 Select Service Mobile |
| `897ed261d2dd46e3b4af8570ea12ecf2` | DESKTOP | 2560×2498 | MF10-03 Select Provider Desktop |
| `270bca2e285c43188fafd39b5d83f28f` | DESKTOP | 2560×2394 | MF10-05 Select Time Desktop |
| `e9a21fe4a41045f0a1cd2e436a677866` | DESKTOP | 2560×2096 | MF10-07 Review & Confirm Desktop |
| `6f642463ecaa46ff940168c3860a8656` | DESKTOP | 2560×2048 | MF11-01 Medical Records Desktop |
| `b1a750008b72460c9098696ff8590578` | MOBILE | 780×1768 | MF11-02 Medical Records Mobile |
| `52a261801b9149c788445e50eab8b379` | DESKTOP | 2560×2048 | MF11-03 Lab Result Detail Desktop |
| `5f5c82c6ede64be892ca6757ecd0823c` | MOBILE | 780×2636 | MF11-04 Lab Result Detail Mobile |
| `97a428ff4b4d45abbe6d03b192f04ffb` | DESKTOP | 2560×5396 | MW01-01 Clinic Website Home |
| `b6287290e9264712a5b89da04c12a325` | MOBILE | 780×2990 | MW01-02 Clinic Website Mobile Home |
| `effdec3344324c33aa7e3d8eb8f60002` | DESKTOP | 2560×2048 | MW01-03 Website Editor Home |
| `23774b8a4baf4924bc659f4ad86708e0` | MOBILE | 780×2360 | MW01-04 Website Editor Mobile |
| `32e4cba9812c43f5ae9a808222ca6dbb` | DESKTOP | 2560×2120 | MW02-01 Inline Text Editing |
| `70cbbaefaa7f4e2ca2aafb583c33d84f` | DESKTOP | 2560×2048 | MW02-02 Inline Image Editing |
| `aa63525e14b342709f3636906ab2afb3` | DESKTOP | 2560×2552 | MW02-03 Inline Section Editing |
| `ead1eaa3d72c4eea884010b4ef6b5a18` | MOBILE | 780×1768 | MW02-04 Mobile Inline Editing |
| `f19c2a311e9b4f0d878e3ec51dae2769` | DESKTOP | 2560×2048 | MW03-01 Manage Sections |
| `6f3db361015d4c51b2323bd441b6e181` | DESKTOP | 2560×2048 | MW03-02 Add Section |
| `2552e98a7d8d4b4695bbc4f5f629b9c0` | DESKTOP | 2560×3076 | MW03-03 Reorder Sections |
| `27d259868bd846c091c61d27744a2c42` | DESKTOP | 2560×2154 | MW03-04 Section Settings |
| `a2aaa656090347548594e79d9c7b401d` | DESKTOP | 2560×2048 | MW04-01 Pages Manager |
| `36f2e7a043d344b98b391e464f451bb8` | DESKTOP | 2560×2098 | MW04-02 Add New Page |
| `943371c07cd34875a6ea02dc7c03d3bf` | DESKTOP | 2560×2048 | MW04-03 Edit Page Settings |
| `e7e2a1ab35a34e16a9e279a6f36c0d6f` | DESKTOP | 2560×2048 | MW04-04 Navigation Manager |
| `df0401b47e454504b0d24ed27abf1c92` | DESKTOP | 2560×2048 | MW05-01 Page Builder |
| `64bc636a34404cff81e28e61acf688e7` | DESKTOP | 2560×2048 | MW05-02 Add Content Block |
| `e15bf9d40eae4bbfbcb4bb8a25a067d8` | DESKTOP | 2560×2048 | MW05-03 Block Settings |
| `44fca098452342a89255f9c9cd3cc9c9` | MOBILE | 780×1768 | MW05-04 Mobile Page Builder |
| `6032ae29163940f2847099b69e21c001` | DESKTOP | 2560×2048 | MW06-01 Media Library |
| `1328c4524fda4a7a9de1c409633be399` | DESKTOP | 2560×2048 | MW06-02 Upload Media |
| `fe0d81b72c5d483a85cd1011462af9c0` | DESKTOP | 2560×2048 | MW06-03 Select Media |
| `451748f8ee4b48ecb16c29137adb043d` | DESKTOP | 2560×2048 | MW06-04 Media Details |
| `48a4b01abbf14eaca2265e7ab4b05e1e` | DESKTOP | 2560×2048 | MW07-01 Site Status & Publishing |
| `22fc73d39ad846a3aa6db72f13862def` | DESKTOP | 2560×2048 | MW07-02 Version History |
| `c2c22334084c4944af49d436e0872a88` | DESKTOP | 2560×2048 | MW07-03 Publishing Confirmation |
| `f0cc5328778e4bd987429652f16cdb35` | MOBILE | 780×1768 | MW07-04 Mobile Publishing |
| `4a087865770e408db4e46164da6b7a7c` | DESKTOP | 2560×2048 | MW08-01 Website Settings |
| `deb94f19f94b4c64a7e92dd0548088b2` | DESKTOP | 2560×2048 | MW08-02 Branding Settings |
| `61cea0d6fd684bf8a487ec728a4c49cc` | DESKTOP | 2560×2048 | MW08-03 Header and Footer Settings |
| `111d1da05ef84d33b72aefff93b0d9eb` | DESKTOP | 2560×2048 | MW08-04 SEO and Social Settings |
| `029ffe860acf43ddbf437bbfdeaaa056` | DESKTOP | 2560×2048 | MW09-01 Content Library |
| `5ea4cb86dacc4fe9a33cb1539acb64c8` | DESKTOP | 2560×2048 | MW09-02 Add Content Item |
| `ebedb04bff81477da2f0aca599a33daf` | DESKTOP | 2560×2048 | MW09-03 Edit Content Item |
| `f819d5b03b964fb6be90059a672c90f9` | DESKTOP | 2560×2048 | MW10-01 Website Management Hub |

