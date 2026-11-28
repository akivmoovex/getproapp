# V2134 G331 Stitch implementation matrix

STITCH_LIVE_ACCESS=YES  
STITCH_VISUAL_UPDATES_IMPLEMENTED=0  
STITCH_NEW_ROUTES=0  
PIXEL_PARITY=NOT_CLAIMED  

Live `list_screens` during this session:

| Project | ID | Screens |
| --- | --- | ---: |
| Public ecosystem and booking | `17813606734422395399` | 254 |
| Internal clinical operations | `12272131183982732110` | 199 |
| Universal authentication | `10611909237747031838` | 108 |

Total unique screens listed: 561. The earlier completeness audit recorded 539. The public project is the one that grew. Internal and authentication counts match that audit. This session did not edit Stitch.

Public-project device sizes: desktop 2560 wide (113 screens), mobile 780 wide (141 screens). The 780-wide mobile frames are the booking-filters chrome the previous audit said not to copy. No 390-wide mobile frame was in that project. Tablet 768 was not a listed width. Internal has additional widths 1420, 2678, 2622, and 3072 on one screen each.

## Numbered concepts

Existing application routes stay in place. None of these screen ids were added to an EJS view in this session.

| Concept | Desktop screen | Mobile screen | This session |
| --- | --- | --- | --- |
| 01 Email OTP verification | `3ce05c3cefea4fd693a15409466c0bce` | `0f9d790e8dcc49dbb06a76164fc45272` | Design read. View not restyled |
| 02 OTP recovery states | absent | `c32cd66ea79b4801a093a0f9f4934a30` | Design read |
| 03 Password reset completion | `734553f8fe6a41bfb73da4b92ab25102` | absent | Design read |
| 04 Existing patient activation | `461d36630150479e84366a216edaab8e` | `0bff8e7bd490430b9fd908ffe22db6dc` | Design read |
| 05 Identity match review | `6d1d5f4014834f8ca917e8f657b8e6d8` | absent | Design read |
| 06 Activation success | absent | `0058cd4288d94daabd5f5566221d1fc0` | Design read |
| 07 Received specimen worklist | `a11dff812f0c428798af8e9d50df8343` | `81c60e3533f14c68b524c0562fd7bf7c` | Design read |
| 08 Laboratory result entry | `616cdeae98794d18ba7d6eaeb91e3442` | `b7c2bda11c9d4c4eba866b46f59cfc85` | Design read |
| 09 Result verification | `6b54ddc8d19845a0a783bf9626a58199` | `4e4eda376ec04395b8ca2d715a4915bd` | Design read |
| 10 Verified result detail | `fd48eea974404b13bbf0a1249590f65f` | `0e10720b93104ffb8f97eec7ef7db682` | Design read |
| 11 Radiology processing worklist | `7ad02bdb6192429b93d4be7043a33427` | `c61e895e05f64218811bf82446b6fb4e` | Design read |
| 12 Radiology report editor | `2d24b30606ee4a82bfb8ee71ab355459` | `6010f6c20e8f427aa11f838df4d31a2a` | Design read |
| 13 Verified radiology report | `d9b0346c1acd414b9dbb3d8425012d42` | `3c1961942de548529492b5b14923c852` | Design read |
| 14 Print center | `1e7560320953441d9d8e0e7500a3a06c` | absent | Not built. Print stays inside existing documents |
| 15 Printing failure and access | absent | `62840d1bd1514b38afdea5830f03506a` | Design read |
| 16 Text-section editor | `4d200465b37d4361a2abf1ff0834b2dc` | absent | Design read. CMS behavior unchanged |
| 17 Image-section editor | `b3bb570cc061466c9bb711a31f2f594d` | `3020c12c34204408acc6eb25449be2bd` | Design read |
| 18 Draft versus published | `0ed58379267a4086afeab0862d0774bd` | `d28ddfff293c4c738e6d82bc4b540ff1` | Design read |
| 19 Edit saved vital signs | `f75e77ccbd5c43dfa117bc01294a04cc` | `d8b4282750874f5ea413f81785557f71` | Design read |
| 20 Vitals correction audit | `56780a28f4cf4529b926ef0a63ee42b7` | `6fbdc65387d24ef498f0d7275110910c` | Design read |
| 21 Staff permissions | `557e7009d2b44d7f82472726de450747` | `71b2d13fba2f4a43b97c743dac05ee8b` | Design read |
| 22 Facility and department assignment | `398f4d17e58445ed9fd75676f06b0a82` | `5c9234dfa5df428eade2ac1ac691a18e` | Design read |
| 23 Member benefits and QR | absent | `9fb5b314d6f84e4c8153ca815cb3559f` | Design only. Posting, consent, and QR redemption stay off |
| 24 Reception member lookup | `ea1943e1d2bd4501b57ae3e326a7c9ff` | `0d10656d79d04f1d845dfa839acafbab` | Design read |
| 25 Referral attribution | `36a1eee0f6ec42a78fc8873f64526432` | `516f7657839d49b2971c103aad6d7e88` | Design read |
| 26 Community benefits overview | `91ff0b85b7334688bf751f5c5b63703b` | `e27ce277f067444ab2e9102c49315775` | Design only. Financial posting stays off |
| 27 Clinic contribution preview | `4f0bfadf52fb42eb8ded39ba64361f55` | `0b4b81cc6f7b4b0981a1208db2d36098` | Design only |
| 28 Member consent | absent | `c2dca9deebf9454db7fc49ac61f0bdf4` | Design only |
| 29 Agreement and settlement preview | `d62a219246464c63844baaa1aed70153` | `d3989ec491fd4efe87fb57854b3e27e9` | Design only. Settlement stays off |
| 30 Patient clinical timeline | `70fb868b14d9402eb47d00aa375f2eee` | `07c7376fad354e6180fae0f8fa0b3e08` | Design read |
| 31 Follow-up and referral tracker | `5b34fe771d5448319eec2793fc04b078` | `872f2207b3a64790bb81990e79fe6279` | Design read |
| 32 Shared application states | `f3c8269694324643a3b57086e38b829b` | `f20ec6b846824830abf249e476357b11` | Design read |
| 33 | absent | absent | Missing design |
| 34 Laboratory reference rules | absent | `dfca3f714d4249c6841a4dfec338fb5e` | Mobile design exists. Storage stays unapproved for hosted apply |

No titled screen in the three projects is a chart-first unmatched-patient refusal. That refusal remains the existing `no_patient_match` behavior.

Waves A through D were not implemented. Community Benefits remains design-only.
