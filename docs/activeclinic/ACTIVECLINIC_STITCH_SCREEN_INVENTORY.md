# ActiveClinic — Stitch Screen Inventory (AC-V6-11)

**Authoritative inventory.** Supporting matrices reference this file by screen ID / exact Stitch name.

| Field | Value |
|---|---|
| Stitch project | ActiveClinic – Juflona Pilot |
| Project ID | `projects/12272131183982732110` |
| Audited | 2026-08-03 (AC-V6-11) |
| Source | Stitch MCP `list_screens` |
| Total screens | 114 |
| Desktop | 88 |
| Mobile | 26 |
| Tablet | 0 |
| Local image assets | Screenshots via Stitch download URLs only (not vendored in repo) |

## Discovery notes

- No Stitch screens found for: Facilities, Staff, Roles/Access, Organization settings, Account activation, Forgot/Reset password, Facility/Organization selectors.
- Unprefixed Login / Dashboard / Shell / Navigation Drawer appear to duplicate the **P01** series — treat **P01** titles as canonical; keep unprefixed as `DUPLICATE` reference.
- Clinical modules P02–P07 have Stitch designs but **no** ActiveClinic schema/services — readiness `NOT_STARTED`.
- Do not delete any Stitch screens; exclusion is implementation-scope only.

## Backend readiness legend

`READY` · `PARTIAL` · `NOT_STARTED` · `PRODUCT_DECISION` · `SECURITY_REVIEW` · `DUPLICATE` · `OBSOLETE_CANDIDATE` · `VISUAL_ONLY`

`READY` is reserved for screens where route, service, authorization, schema, and action behavior all exist. None of the Stitch screens currently qualify for full `READY` (visual parity pending even where auth/shell backends exist).

## Master table

| ID | Exact Stitch name | Form factor | Module | Screen type | Role | Route candidate | Backend readiness | Priority | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `9f3abb837fc3413aa128949afce0d8c4` | Application Shell - Desktop | DESKTOP | Authentication / Shell | shell | any authenticated / public auth | `(chrome) /app/*` | DUPLICATE | W1 | 2560×2048; Foundation |
| `c54b0a846c054044aa0ca05194e320ef` | Dashboard - Desktop | DESKTOP | Authentication / Shell | dashboard | any authenticated / public auth | `GET /app` | DUPLICATE | W1 | pair: MOBILE:d19b0d5c; 2560×2056; Foundation |
| `d19b0d5c33ae42e08ca767a11b12e591` | Dashboard - Mobile | MOBILE | Authentication / Shell | dashboard | any authenticated / public auth | `GET /app` | DUPLICATE | W1 | pair: DESKTOP:c54b0a84; 780×1768; Foundation |
| `8bf5c500e0d14014944618029212b2c9` | Login - Desktop | DESKTOP | Authentication / Shell | workflow | any authenticated / public auth | `GET /login` | DUPLICATE | W1 | pair: MOBILE:6e3cbe49; 2560×2048; Foundation |
| `6e3cbe4963c3428196b10d3bb27421d5` | Login - Mobile | MOBILE | Authentication / Shell | workflow | any authenticated / public auth | `GET /login` | DUPLICATE | W1 | pair: DESKTOP:8bf5c500; 780×1768; Foundation |
| `87c5a80e0fcb40179c0d1ce7ea906762` | Navigation Drawer - Mobile | MOBILE | Authentication / Shell | drawer | any authenticated / public auth | `(chrome) /app/*` | DUPLICATE | W1 | 1420×1768; Foundation |
| `390032bf54ca44ee851673a4800f9af3` | P01 – Dashboard – Desktop | DESKTOP | Authentication / Shell | dashboard | any authenticated / public auth | `GET /app` | PARTIAL | W1 · S02 | pair: MOBILE:8be466d4; 2560×2176; Foundation |
| `8be466d48814446ab8bb087baacc6ec9` | P01 – Dashboard – Mobile | MOBILE | Authentication / Shell | dashboard | any authenticated / public auth | `GET /app` | PARTIAL | W1 · S02 | pair: DESKTOP:390032bf; 780×2052; Foundation |
| `ca8a34cf1ecb4fefa2ed31fb9873ae45` | P01 – Login – Desktop | DESKTOP | Authentication / Shell | workflow | any authenticated / public auth | `GET /login` | PARTIAL | W1 · S01 | pair: MOBILE:026f619c; 2560×2048; Foundation |
| `026f619c35b04a5c8dde16eca9f7cf35` | P01 – Login – Mobile | MOBILE | Authentication / Shell | workflow | any authenticated / public auth | `GET /login` | PARTIAL | W1 · S01 | pair: DESKTOP:ca8a34cf; 780×1768; Foundation |
| `9f55cec7eb884dbebc2e01c6fb0fe58e` | P01 – Navigation Drawer – Mobile | MOBILE | Authentication / Shell | drawer | any authenticated / public auth | `(chrome) /app/*` | PARTIAL | W1 · S02 | 780×1768; Foundation |
| `01b9125044634434b60223746b815b25` | P01 – Shared Application Shell – Desktop | DESKTOP | Authentication / Shell | shell | any authenticated / public auth | `(chrome) /app/*` | PARTIAL | W1 · S02 | 2560×2048; Foundation |
| `9b881d25874c41f9986246c61de32f41` | P01 – Shared States – Desktop | DESKTOP | Authentication / Shell | state pack | any authenticated / public auth | `TBD (future)` | PARTIAL | W1 | 2560×2048; Foundation |
| `91e41fecc2b64496893b52317b7ab985` | P02 – Duplicate Patient Warning | DESKTOP | Patients | modal | reception / registration | `/app/patients… (future)` | NOT_STARTED | W2-W3 | 2560×2048; Clinical administration |
| `0c3315d05469499d9b645bc7978001bf` | P02 – Edit Patient Details – Desktop | DESKTOP | Patients | edit | reception / registration | `/app/patients… (future)` | NOT_STARTED | W2-W3 | pair: MOBILE:4c6a5fe1; 2560×2048; Clinical administration |
| `4c6a5fe1c21c46709679f3707b8bf4dc` | P02 – Edit Patient Details – Mobile | MOBILE | Patients | edit | reception / registration | `/app/patients… (future)` | NOT_STARTED | W2-W3 | pair: DESKTOP:0c3315d0; 780×2496; Clinical administration |
| `5a6728d97b674200823562bb015e10ed` | P02 – Patient List – Desktop | DESKTOP | Patients | list | reception / registration | `/app/patients… (future)` | NOT_STARTED | W2-W3 | pair: MOBILE:58bd5e04; 2560×2048; Clinical administration |
| `58bd5e04f71340ff8d067721eb5562d4` | P02 – Patient List – Mobile | MOBILE | Patients | list | reception / registration | `/app/patients… (future)` | NOT_STARTED | W2-W3 | pair: DESKTOP:5a6728d9; 780×1768; Clinical administration |
| `1a15f0bf4e564c4993ca33aa2d578a58` | P02 – Patient Profile Overview – Desktop | DESKTOP | Patients | detail | reception / registration | `/app/patients… (future)` | NOT_STARTED | W2-W3 | pair: MOBILE:99eb441b; 2560×2208; Clinical administration |
| `99eb441b48a24fa19855e76669c0da86` | P02 – Patient Profile Overview – Mobile | MOBILE | Patients | detail | reception / registration | `/app/patients… (future)` | NOT_STARTED | W2-W3 | pair: DESKTOP:1a15f0bf; 780×2072; Clinical administration |
| `cd688e761cca43a1af299769014cb5f0` | P02 – Patient Registration Success – Desktop | DESKTOP | Patients | workflow | reception / registration | `/app/patients… (future)` | NOT_STARTED | W2-W3 | pair: MOBILE:b9615559; 2560×2048; Clinical administration |
| `b9615559155d41d591dbb91e18c6a090` | P02 – Patient Registration Success – Mobile | MOBILE | Patients | workflow | reception / registration | `/app/patients… (future)` | NOT_STARTED | W2-W3 | pair: DESKTOP:cd688e76; 780×1794; Clinical administration |
| `f98b2e6f2a4a4953a4d811af7b3737a2` | P02 – Patient Shared States – Desktop | DESKTOP | Patients | state pack | reception / registration | `/app/patients… (future)` | NOT_STARTED | W2-W3 | 2560×2048; Clinical administration |
| `3c113fe684604dfcaeb8f6b2c071a6ca` | P02 – Print Patient Card Preview | DESKTOP | Patients | print view | reception / registration | `/app/patients… (future)` | NOT_STARTED | W2-W3 | 2560×2048; Clinical administration |
| `e1ef5e5d8a1840bcbf1f4dc859f7b812` | P02 – Register Patient Contact – Desktop | DESKTOP | Patients | create | reception / registration | `/app/patients… (future)` | NOT_STARTED | W2-W3 | pair: MOBILE:44fb7852; 2560×2048; Clinical administration |
| `44fb7852e24f4f7f9f6b355a195fd250` | P02 – Register Patient Contact – Mobile | MOBILE | Patients | create | reception / registration | `/app/patients… (future)` | NOT_STARTED | W2-W3 | pair: DESKTOP:e1ef5e5d; 780×2158; Clinical administration |
| `026d2e6c69cd4181a282213ba1bb55da` | P02 – Register Patient Emergency and Medical – Desktop | DESKTOP | Patients | create | reception / registration | `/app/patients… (future)` | NOT_STARTED | W2-W3 | pair: MOBILE:7a495a47; 2560×3136; Clinical administration |
| `7a495a471fed49b098de3c1605eda76e` | P02 – Register Patient Emergency and Medical – Mobile | MOBILE | Patients | create | reception / registration | `/app/patients… (future)` | NOT_STARTED | W2-W3 | pair: DESKTOP:026d2e6c; 780×1768; Clinical administration |
| `40d2005b64864f35ac8df831ddae7084` | P02 – Register Patient Identity – Desktop | DESKTOP | Patients | create | reception / registration | `/app/patients… (future)` | NOT_STARTED | W2-W3 | 2560×2048; Clinical administration |
| `8ef4b4d96f1f4224994d0c627bb7550e` | P02 – Register Patient Review – Desktop | DESKTOP | Patients | create | reception / registration | `/app/patients… (future)` | NOT_STARTED | W2-W3 | pair: MOBILE:a6d496f3; 2560×2098; Clinical administration |
| `a6d496f38f8e4d5cb8eb4d91667c6db7` | P02 – Register Patient Review – Mobile | MOBILE | Patients | create | reception / registration | `/app/patients… (future)` | NOT_STARTED | W2-W3 | pair: DESKTOP:8ef4b4d9; 780×2332; Clinical administration |
| `0fca19f233af43c49966e7eb62bccb02` | P03 – Appointment Calendar – Desktop | DESKTOP | Appointments / Reception / Queues | list | reception / scheduling | `/app/appointments…|/app/reception… (future)` | NOT_STARTED | W2-W3 | 2560×2048; Clinical administration |
| `327422c1b36747039e4026a17c5a2f33` | P03 – Appointment Confirmation – Desktop | DESKTOP | Appointments / Reception / Queues | modal | reception / scheduling | `/app/appointments…|/app/reception… (future)` | NOT_STARTED | W2-W3 | 2560×2048; Clinical administration |
| `284e9f8cd6804b0eb0f50574e2f571d6` | P03 – Appointment List – Desktop | DESKTOP | Appointments / Reception / Queues | list | reception / scheduling | `/app/appointments…|/app/reception… (future)` | NOT_STARTED | W2-W3 | pair: MOBILE:480ecaba; 2560×2048; Clinical administration |
| `480ecaba5258423e8711b1fdd2f39e1b` | P03 – Appointment List – Mobile | MOBILE | Appointments / Reception / Queues | list | reception / scheduling | `/app/appointments…|/app/reception… (future)` | NOT_STARTED | W2-W3 | pair: DESKTOP:284e9f8c; 780×1768; Clinical administration |
| `089aa8f266664446a8b38cb69d1fda48` | P03 – Appointment Shared States – Desktop | DESKTOP | Appointments / Reception / Queues | state pack | reception / scheduling | `/app/appointments…|/app/reception… (future)` | NOT_STARTED | W2-W3 | 2560×2048; Clinical administration |
| `a99c6ac04cf24f2c8ca349715c1829dc` | P03 – Book Appointment – Desktop | DESKTOP | Appointments / Reception / Queues | create | reception / scheduling | `/app/appointments…|/app/reception… (future)` | NOT_STARTED | W2-W3 | 2560×2048; Clinical administration |
| `b27eafc25bad4006868f3932d08bfed5` | P03 – Cancel Appointment – Desktop | DESKTOP | Appointments / Reception / Queues | workflow | reception / scheduling | `/app/appointments…|/app/reception… (future)` | NOT_STARTED | W2-W3 | 2560×2048; Clinical administration |
| `305d90143b0e4381b112bf6eb113f1c2` | P03 – Create Walk-In Visit – Desktop | DESKTOP | Appointments / Reception / Queues | create | reception / scheduling | `/app/appointments…|/app/reception… (future)` | NOT_STARTED | W2-W3 | 2560×2176; Clinical administration |
| `fd009ceba70f40b2ae1755b94220c64b` | P03 – Doctor Schedule – Desktop | DESKTOP | Appointments / Reception / Queues | workflow | reception / scheduling | `/app/appointments…|/app/reception… (future)` | NOT_STARTED | W2-W3 | 2560×2048; Clinical administration |
| `7d37e069c7644e7cb4c9b72349a0ccf7` | P03 – Missed Appointments – Desktop | DESKTOP | Appointments / Reception / Queues | workflow | reception / scheduling | `/app/appointments…|/app/reception… (future)` | NOT_STARTED | W2-W3 | 2560×2048; Clinical administration |
| `8dca6dbd36b840928e73d6674bbcb3ea` | P03 – Patient Called – Desktop | DESKTOP | Appointments / Reception / Queues | workflow | reception / scheduling | `/app/appointments…|/app/reception… (future)` | NOT_STARTED | W2-W3 | 2560×2048; Clinical administration |
| `9284064428f443b1a3a1504054827d91` | P03 – Patient Check-In – Desktop | DESKTOP | Appointments / Reception / Queues | workflow | reception / scheduling | `/app/appointments…|/app/reception… (future)` | NOT_STARTED | W2-W3 | 2560×2048; Clinical administration |
| `f7841548662446cfa8d70d0772d3fa9f` | P03 – Patient Did Not Respond — Desktop | DESKTOP | Appointments / Reception / Queues | workflow | reception / scheduling | `/app/appointments…|/app/reception… (future)` | NOT_STARTED | W2-W3 | 2560×2048; Clinical administration |
| `1fa99f4a358c47ffb858addae7095fe8` | P03 – Queue Assignment – Desktop | DESKTOP | Appointments / Reception / Queues | list | reception / scheduling | `/app/appointments…|/app/reception… (future)` | NOT_STARTED | W2-W3 | 2560×2048; Clinical administration |
| `bf9b846da6174bf995793b09e869cd30` | P03 – Queue Stale Data Warning – Desktop | DESKTOP | Appointments / Reception / Queues | modal | reception / scheduling | `/app/appointments…|/app/reception… (future)` | NOT_STARTED | W2-W3 | 2560×2048; Clinical administration |
| `8b7173ba4ff94eb2a7d7e548b5f7253d` | P03 – Reception Queue – Desktop | DESKTOP | Appointments / Reception / Queues | list | reception / scheduling | `/app/appointments…|/app/reception… (future)` | NOT_STARTED | W2-W3 | pair: MOBILE:73499b0d; 2560×2048; Clinical administration |
| `73499b0dfef446c99a908b1cc56252a5` | P03 – Reception Queue – Mobile | MOBILE | Appointments / Reception / Queues | list | reception / scheduling | `/app/appointments…|/app/reception… (future)` | NOT_STARTED | W2-W3 | pair: DESKTOP:8b7173ba; 780×1768; Clinical administration |
| `da39a3945ace4fac85cb12bd86f0cdc2` | P03 – Reschedule Appointment – Desktop | DESKTOP | Appointments / Reception / Queues | edit | reception / scheduling | `/app/appointments…|/app/reception… (future)` | NOT_STARTED | W2-W3 | pair: MOBILE:9429b14e; 2560×2048; Clinical administration |
| `9429b14e9ea243ad93aec4a486db93e9` | P03 – Reschedule Appointment – Mobile | MOBILE | Appointments / Reception / Queues | edit | reception / scheduling | `/app/appointments…|/app/reception… (future)` | NOT_STARTED | W2-W3 | pair: DESKTOP:da39a394; 780×1768; Clinical administration |
| `e807a1354fdd418391496e69e5ac5f3e` | P03 – Transfer Patient to Department – Desktop | DESKTOP | Appointments / Reception / Queues | workflow | reception / scheduling | `/app/appointments…|/app/reception… (future)` | NOT_STARTED | W2-W3 | 2560×2048; Clinical administration |
| `99757cfd7d3747d490f00ac342faa519` | P04 – Clinical Escalation Alert | DESKTOP | Triage / Consultation / Clinical notes | modal | clinician / nurse | `/app/clinical…|/app/triage… (future)` | NOT_STARTED | W4 | 2560×2048; Clinical administration |
| `b8d47f05a83c4959ac2d3d6ca83c7dfb` | P04 – Clinical Queue – Desktop | DESKTOP | Triage / Consultation / Clinical notes | list | clinician / nurse | `/app/clinical…|/app/triage… (future)` | NOT_STARTED | W4 | pair: MOBILE:16897ac7; 2560×2048; Clinical administration |
| `16897ac752a94750bf00225db66ff768` | P04 – Clinical Queue – Mobile | MOBILE | Triage / Consultation / Clinical notes | list | clinician / nurse | `/app/clinical…|/app/triage… (future)` | NOT_STARTED | W4 | pair: DESKTOP:b8d47f05; 780×1768; Clinical administration |
| `5e4dbc7265ad4e17b060b1f641996db3` | P04 – Consultation Workspace – Desktop | DESKTOP | Triage / Consultation / Clinical notes | workflow | clinician / nurse | `/app/clinical…|/app/triage… (future)` | NOT_STARTED | W4 | pair: MOBILE:15c6c639; 2560×2048; Clinical administration |
| `15c6c639c2b04bbda97b54f127c500f8` | P04 – Consultation Workspace – Mobile | MOBILE | Triage / Consultation / Clinical notes | workflow | clinician / nurse | `/app/clinical…|/app/triage… (future)` | NOT_STARTED | W4 | pair: DESKTOP:5e4dbc72; 780×1768; Clinical administration |
| `969bbfbdf9634dbc8af598ec2277e92f` | P04 – Create Laboratory Request | DESKTOP | Triage / Consultation / Clinical notes | create | clinician / nurse | `/app/clinical…|/app/triage… (future)` | NOT_STARTED | W4 | 2560×2536; Clinical administration |
| `ee9bf2322b924cd79e86619a4635f702` | P04 – Create Prescription | DESKTOP | Triage / Consultation / Clinical notes | create | clinician / nurse | `/app/clinical…|/app/triage… (future)` | NOT_STARTED | W4 | 2560×2048; Clinical administration |
| `bc4ffd8f0e8c44f48f38cc15a069656a` | P04 – Create Radiology Request | DESKTOP | Triage / Consultation / Clinical notes | create | clinician / nurse | `/app/clinical…|/app/triage… (future)` | NOT_STARTED | W4 | 2560×2048; Clinical administration |
| `33a522e2f4eb45c9bdbede9ba34e0bee` | P04 – Diagnosis Entry | DESKTOP | Triage / Consultation / Clinical notes | workflow | clinician / nurse | `/app/clinical…|/app/triage… (future)` | NOT_STARTED | W4 | 2560×2048; Clinical administration |
| `7959616d1673403ba3bf6ff71d18a77b` | P04 – Nursing Intake – Desktop | DESKTOP | Triage / Consultation / Clinical notes | workflow | clinician / nurse | `/app/clinical…|/app/triage… (future)` | NOT_STARTED | W4 | 2560×2048; Clinical administration |
| `3c8f7b43b7984718acf661e381c1e6f7` | P04 – Triage Assessment – Desktop | DESKTOP | Triage / Consultation / Clinical notes | workflow | clinician / nurse | `/app/clinical…|/app/triage… (future)` | NOT_STARTED | W4 | 2560×2146; Clinical administration |
| `dede5e72277d413497e1f870f6b4a0e1` | P04 – Vital Signs Entry – Desktop | DESKTOP | Triage / Consultation / Clinical notes | workflow | clinician / nurse | `/app/clinical…|/app/triage… (future)` | NOT_STARTED | W4 | 2560×2048; Clinical administration |
| `83495a7aea6547ce873af695fcb5f604` | P05 – Add Medicine | DESKTOP | Pharmacy / Medication / Stock | create | pharmacist / pharmacy admin | `/app/pharmacy… (future)` | NOT_STARTED | W6 | 2560×2538; Medication |
| `e4d4e37c175a458d9004e1240395ba63` | P05 – Dispense Prescription – Desktop | DESKTOP | Pharmacy / Medication / Stock | workflow | pharmacist / pharmacy admin | `/app/pharmacy… (future)` | NOT_STARTED | W6 | pair: MOBILE:ace4f115; 2560×2176; Medication |
| `ace4f11562b24515866b40c5594a18e6` | P05 – Dispense Prescription – Mobile | MOBILE | Pharmacy / Medication / Stock | workflow | pharmacist / pharmacy admin | `/app/pharmacy… (future)` | NOT_STARTED | W6 | pair: DESKTOP:e4d4e37c; 780×2170; Medication |
| `eeaf00f13f6f4e238da3aef30a556a57` | P05 – Dispensing Completed – Desktop | DESKTOP | Pharmacy / Medication / Stock | workflow | pharmacist / pharmacy admin | `/app/pharmacy… (future)` | NOT_STARTED | W6 | 2560×2176; Medication |
| `00a95c467df2414fb8c6dea108170b04` | P05 – Dispensing Confirmation | DESKTOP | Pharmacy / Medication / Stock | modal | pharmacist / pharmacy admin | `/app/pharmacy… (future)` | NOT_STARTED | W6 | 2560×2084; Medication |
| `97138791742e4338a34811a6fd7e464d` | P05 – Dispensing Review – Desktop | DESKTOP | Pharmacy / Medication / Stock | workflow | pharmacist / pharmacy admin | `/app/pharmacy… (future)` | NOT_STARTED | W6 | 2560×2244; Medication |
| `fcba0b2ed1334eacad9647e597f66959` | P05 – Expiry Alerts – Desktop | DESKTOP | Pharmacy / Medication / Stock | modal | pharmacist / pharmacy admin | `/app/pharmacy… (future)` | NOT_STARTED | W6 | 2560×2048; Medication |
| `553dd601642d41abb89cf4c7127c221a` | P05 – Low Stock Alerts – Desktop | DESKTOP | Pharmacy / Medication / Stock | modal | pharmacist / pharmacy admin | `/app/pharmacy… (future)` | NOT_STARTED | W6 | 2560×2048; Medication |
| `6c0795f36aef4fe3b634dc350d230672` | P05 – Medicine Batch Detail | DESKTOP | Pharmacy / Medication / Stock | detail | pharmacist / pharmacy admin | `/app/pharmacy… (future)` | NOT_STARTED | W6 | 2560×2048; Medication |
| `b5e534cf921d460c9774c2772ab688e9` | P05 – Medicine Catalogue – Desktop | DESKTOP | Pharmacy / Medication / Stock | workflow | pharmacist / pharmacy admin | `/app/pharmacy… (future)` | NOT_STARTED | W6 | 2560×2048; Medication |
| `20a62e6f34ef422b8262750b0fe9788a` | P05 – Medicine Detail – Desktop | DESKTOP | Pharmacy / Medication / Stock | detail | pharmacist / pharmacy admin | `/app/pharmacy… (future)` | NOT_STARTED | W6 | 2560×2176; Medication |
| `1f079e7d3f9c464c8754fa09a09f2626` | P05 – Medicine Inventory – Desktop | DESKTOP | Pharmacy / Medication / Stock | workflow | pharmacist / pharmacy admin | `/app/pharmacy… (future)` | NOT_STARTED | W6 | pair: MOBILE:a0cb61de; 2560×2048; Medication |
| `a0cb61de9f0f4eaa8d732d4cf143f090` | P05 – Medicine Inventory – Mobile | MOBILE | Pharmacy / Medication / Stock | workflow | pharmacist / pharmacy admin | `/app/pharmacy… (future)` | NOT_STARTED | W6 | pair: DESKTOP:1f079e7d; 780×1768; Medication |
| `e237cd030fb241deb15ed8eb0f4f895e` | P05 – Medicine Substitution – Desktop | DESKTOP | Pharmacy / Medication / Stock | workflow | pharmacist / pharmacy admin | `/app/pharmacy… (future)` | NOT_STARTED | W6 | 2560×2048; Medication |
| `c7c3ea1931f74acb845208dd09d0d63d` | P05 – Partial Dispensing – Desktop | DESKTOP | Pharmacy / Medication / Stock | workflow | pharmacist / pharmacy admin | `/app/pharmacy… (future)` | NOT_STARTED | W6 | 2560×2176; Medication |
| `7cffba8bdac84abda7a8d31951d1948f` | P05 – Patient Medicine Instructions – Mobile | MOBILE | Pharmacy / Medication / Stock | workflow | pharmacist / pharmacy admin | `/app/pharmacy… (future)` | NOT_STARTED | W6 | 780×2108; Medication |
| `4d83f5c845ae4d91b805a1dfd6a7268d` | P05 – Pharmacy Dashboard – Desktop | DESKTOP | Pharmacy / Medication / Stock | dashboard | pharmacist / pharmacy admin | `/app/pharmacy… (future)` | NOT_STARTED | W6 | 2560×2048; Medication |
| `0f1976955fc14d8c97f1f8c728b4e1da` | P05 – Pharmacy Purchase Orders – Desktop | DESKTOP | Pharmacy / Medication / Stock | workflow | pharmacist / pharmacy admin | `/app/pharmacy… (future)` | NOT_STARTED | W6 | 2560×2048; Medication |
| `2147643a82af4fb28a8368dcff867a75` | P05 – Pharmacy Stock Adjustment | DESKTOP | Pharmacy / Medication / Stock | workflow | pharmacist / pharmacy admin | `/app/pharmacy… (future)` | NOT_STARTED | W6 | 2560×2048; Medication |
| `ce22d1c5de5f43ad8a458f57aa217fd3` | P05 – Pharmacy Stock Transfer | DESKTOP | Pharmacy / Medication / Stock | workflow | pharmacist / pharmacy admin | `/app/pharmacy… (future)` | NOT_STARTED | W6 | 2560×2048; Medication |
| `99d29d4a8b204031b068e2b94dfeb95b` | P05 – Prescription Clinical Review – Desktop | DESKTOP | Pharmacy / Medication / Stock | workflow | pharmacist / pharmacy admin | `/app/pharmacy… (future)` | NOT_STARTED | W6 | pair: MOBILE:279be7b9; 2560×2048; Medication |
| `279be7b923664e449bd2001528e7c5ec` | P05 – Prescription Clinical Review – Mobile | MOBILE | Pharmacy / Medication / Stock | workflow | pharmacist / pharmacy admin | `/app/pharmacy… (future)` | NOT_STARTED | W6 | pair: DESKTOP:99d29d4a; 780×1768; Medication |
| `2da2d7b7cd734161a9f8257c2256c6f3` | P05 – Prescription Detail – Desktop | DESKTOP | Pharmacy / Medication / Stock | detail | pharmacist / pharmacy admin | `/app/pharmacy… (future)` | NOT_STARTED | W6 | pair: MOBILE:4f369d10; 2560×2048; Medication |
| `4f369d10d5654e68bf5a5c45d8ef7d78` | P05 – Prescription Detail – Mobile | MOBILE | Pharmacy / Medication / Stock | detail | pharmacist / pharmacy admin | `/app/pharmacy… (future)` | NOT_STARTED | W6 | pair: DESKTOP:2da2d7b7; 780×1884; Medication |
| `5472760fda8148cf8611564236ae2247` | P05 – Prescription Queue – Desktop | DESKTOP | Pharmacy / Medication / Stock | list | pharmacist / pharmacy admin | `/app/pharmacy… (future)` | NOT_STARTED | W6 | pair: MOBILE:322c2b62; 2560×2048; Medication |
| `322c2b620c8e4b248fa5620881555d8b` | P05 – Prescription Queue – Mobile | MOBILE | Pharmacy / Medication / Stock | list | pharmacist / pharmacy admin | `/app/pharmacy… (future)` | NOT_STARTED | W6 | pair: DESKTOP:5472760f; 780×1768; Medication |
| `b62126b07af7488094221932b9046193` | P05 – Print Medicine Labels | DESKTOP | Pharmacy / Medication / Stock | print view | pharmacist / pharmacy admin | `/app/pharmacy… (future)` | NOT_STARTED | W6 | 2560×2048; Medication |
| `a61dbccce82b43788dc347e25843ae07` | P05 – Receive Pharmacy Stock – Desktop | DESKTOP | Pharmacy / Medication / Stock | workflow | pharmacist / pharmacy admin | `/app/pharmacy… (future)` | NOT_STARTED | W6 | 2560×2048; Medication |
| `a7649e64ba1e4eee8ca0bcb6a54594bd` | P05 – Select Medicine Batch | DESKTOP | Pharmacy / Medication / Stock | workflow | pharmacist / pharmacy admin | `/app/pharmacy… (future)` | NOT_STARTED | W6 | 2560×2048; Medication |
| `f53854e6c18e45a094a0bab86e011e5b` | P06 – Critical Result Alert | DESKTOP | Laboratory / Imaging / Specimens | modal | lab / radiology tech | `/app/lab…|/app/imaging… (future)` | NOT_STARTED | W5 | 2560×2176; Diagnostics |
| `59ee5d74ff1f47eca3c6fb09413b7c09` | P06 – Enter Laboratory Result – Desktop | DESKTOP | Laboratory / Imaging / Specimens | create | lab / radiology tech | `/app/lab…|/app/imaging… (future)` | NOT_STARTED | W5 | 2560×2048; Diagnostics |
| `41a0f1b3e1974e7ca26599bf8a37fc5f` | P06 – Enter Radiology Report – Desktop | DESKTOP | Laboratory / Imaging / Specimens | create | lab / radiology tech | `/app/lab…|/app/imaging… (future)` | NOT_STARTED | W5 | 3072×2194; Diagnostics |
| `5b7b36f6af3b4735a81cca8cea77ee99` | P06 – Laboratory Dashboard – Desktop | DESKTOP | Laboratory / Imaging / Specimens | dashboard | lab / radiology tech | `/app/lab…|/app/imaging… (future)` | NOT_STARTED | W5 | pair: MOBILE:d53f9752; 2678×2048; Diagnostics |
| `d53f9752db564b18b35fd761ecd73dd8` | P06 – Laboratory Dashboard – Mobile | MOBILE | Laboratory / Imaging / Specimens | dashboard | lab / radiology tech | `/app/lab…|/app/imaging… (future)` | NOT_STARTED | W5 | pair: DESKTOP:5b7b36f6; 780×2662; Diagnostics |
| `51c3b93fec6e40aebc327a4998fb29ea` | P06 – Laboratory Request Detail – Desktop | DESKTOP | Laboratory / Imaging / Specimens | detail | lab / radiology tech | `/app/lab…|/app/imaging… (future)` | NOT_STARTED | W5 | 2560×2176; Diagnostics |
| `f8b17233f1f7457ea5fe5179207aa0d1` | P06 – Laboratory Request Queue – Desktop | DESKTOP | Laboratory / Imaging / Specimens | list | lab / radiology tech | `/app/lab…|/app/imaging… (future)` | NOT_STARTED | W5 | 2622×2048; Diagnostics |
| `cd5ff44012dd4f0f88fc7ed60848fd37` | P06 – Laboratory Worklist – Desktop | DESKTOP | Laboratory / Imaging / Specimens | list | lab / radiology tech | `/app/lab…|/app/imaging… (future)` | NOT_STARTED | W5 | 2560×2048; Diagnostics |
| `65286a85cc674df097dedf0890378a29` | P06 – Radiology Dashboard – Desktop | DESKTOP | Laboratory / Imaging / Specimens | dashboard | lab / radiology tech | `/app/lab…|/app/imaging… (future)` | NOT_STARTED | W5 | pair: MOBILE:070284f5; 2560×2048; Diagnostics |
| `070284f5583d43598111b2f6c35d0425` | P06 – Radiology Dashboard – Mobile | MOBILE | Laboratory / Imaging / Specimens | dashboard | lab / radiology tech | `/app/lab…|/app/imaging… (future)` | NOT_STARTED | W5 | pair: DESKTOP:65286a85; 780×2502; Diagnostics |
| `1fa6c921703145af96e47f7344b6cb62` | P06 – Radiology Request Queue – Desktop | DESKTOP | Laboratory / Imaging / Specimens | list | lab / radiology tech | `/app/lab…|/app/imaging… (future)` | NOT_STARTED | W5 | 2560×2048; Diagnostics |
| `73c50eef2b10459793f12689cce27bb6` | P06 – Specimen Collection – Desktop | DESKTOP | Laboratory / Imaging / Specimens | workflow | lab / radiology tech | `/app/lab…|/app/imaging… (future)` | NOT_STARTED | W5 | 2560×2414; Diagnostics |
| `5018c7fabf324fcebfbac85d7048f19a` | P06 – Specimen Receipt – Desktop | DESKTOP | Laboratory / Imaging / Specimens | workflow | lab / radiology tech | `/app/lab…|/app/imaging… (future)` | NOT_STARTED | W5 | 2560×2468; Diagnostics |
| `b62c8afb0c59477d8bcfeaac7210987a` | P06 – Specimen Rejected | DESKTOP | Laboratory / Imaging / Specimens | workflow | lab / radiology tech | `/app/lab…|/app/imaging… (future)` | NOT_STARTED | W5 | 2560×2048; Diagnostics |
| `ece0b9d1d9384f5d8c1e3b944f122e47` | P07 – Billing Dashboard – Desktop | DESKTOP | Billing / Cashier / Invoices | dashboard | cashier / billing | `/app/billing… (future)` | NOT_STARTED | W7 | 2560×2048; Finance |
| `792d5cbb6f234332a088399e4ccdd545` | P07 – Cashier Dashboard – Desktop | DESKTOP | Billing / Cashier / Invoices | dashboard | cashier / billing | `/app/billing… (future)` | NOT_STARTED | W7 | 2560×2048; Finance |
| `a84263ac97b8484698dc36d00b498ffa` | P07 – Patient Billing Account – Desktop | DESKTOP | Billing / Cashier / Invoices | detail | cashier / billing | `/app/billing… (future)` | NOT_STARTED | W7 | 2560×2048; Finance |
| `9f422c33e30c450e9502126ba4012585` | P07 – Patient Invoice – Desktop | DESKTOP | Billing / Cashier / Invoices | detail | cashier / billing | `/app/billing… (future)` | NOT_STARTED | W7 | 2560×2048; Finance |
| `8731b06bbfa747e98e05372c9aafb3e9` | Access Restricted | DESKTOP | Platform states | restricted state | any (denied) | `access-state` / middleware | PARTIAL | **S08** | Functional 403; VISUAL_BLOCKED vs Stitch |
| `72357dec37864a5a926a1d2b5c551b16` | Shared Error State | DESKTOP | Platform states | error state | tbd | `createActiveClinicErrorHandler` | PARTIAL | **S08** | Safe HTML errors; VISUAL_BLOCKED |
| `8a3f15c0be9c47efb192f206df104d5c` | Shared Loading State | DESKTOP | Platform states | loading state | tbd | `ac-auth.js` form busy | PARTIAL | **S08** | Submit `aria-busy` only; no SSR skeletons |
| `4d31c82537634b5f981c359662d224b3` | Shared Offline State | DESKTOP | Platform states | offline state | tbd | — | NOT_STARTED | **S08 deferred** | No browser offline support |

## Counts by package

| Package | Count | Module |
|---|---:|---|
| P01 | 13 | Authentication / Shell |
| P02 | 18 | Patients |
| P03 | 20 | Appointments / Reception / Queues |
| P04 | 12 | Triage / Consultation / Clinical notes |
| P05 | 29 | Pharmacy / Medication / Stock |
| P06 | 14 | Laboratory / Imaging / Specimens |
| P07 | 4 | Billing / Cashier / Invoices |
| PLATFORM | 4 | Platform states |

## Counts by readiness

- **DUPLICATE**: 6
- **NOT_STARTED**: 98
- **PARTIAL**: 10

## Related docs

- [Route matrix](ACTIVECLINIC_STITCH_ROUTE_MATRIX.md)
- [Permission matrix](ACTIVECLINIC_STITCH_PERMISSION_MATRIX.md)
- [Data contracts](ACTIVECLINIC_STITCH_DATA_CONTRACTS.md)
- [Implementation waves](ACTIVECLINIC_STITCH_IMPLEMENTATION_WAVES.md)
- [Screen map (status tracker)](ACTIVECLINIC_STITCH_SCREEN_MAP.md)


## AC-V6-S01 note

Login P01 desktop/mobile implemented with shared auth shell (`docs/activeclinic/stitch/AC_V6_S01_AUTHENTICATION_PARITY.md`). Status remains **PARTIAL** (intentional deviations; lifecycle screens VISUAL_BLOCKED / STITCH_GAP).


## AC-V6-S02 note

Shell + dashboard foundation parity shipped (`docs/activeclinic/stitch/AC_V6_S02_DASHBOARD_SHELL_PARITY.md`). Status remains **PARTIAL** (clinical Stitch KPIs/nav deferred; real infrastructure data only).

## AC-V6-S03 note

Facilities management functional UI shipped (`docs/activeclinic/stitch/AC_V6_S03_FACILITIES_PARITY.md`). Remains **STITCH_GAP / VISUAL_BLOCKED** — no facility screens in Stitch inventory; list/detail/create/edit/archive/set-primary use shell design system with real tenant-scoped services.

## AC-V6-S04 note

Staff directory + detail functional UI shipped (`docs/activeclinic/stitch/AC_V6_S04_STAFF_DIRECTORY_DETAIL_PARITY.md`). Remains **STITCH_GAP / VISUAL_BLOCKED** — facility-scoped staff visibility, separate staff/account statuses, lifecycle actions via existing admin routes; create/invite form and access editors deferred.

## AC-V6-S05 note

Staff create/invite/edit functional UI shipped (`docs/activeclinic/stitch/AC_V6_S05_STAFF_CREATE_INVITE_EDIT_PARITY.md`). Remains **STITCH_GAP / VISUAL_BLOCKED** — shell forms, invitation confirmation with copy/share, facility assignment sync; roles/access editor deferred.

### AC-V6-S06 update

Roles and access management functional UI shipped (`docs/activeclinic/stitch/AC_V6_S06_ROLES_ACCESS_PARITY.md`). Remains **STITCH_GAP / VISUAL_BLOCKED** — overview, staff access detail, assign/edit/revoke with grantability guards; custom/clinical roles out of scope.

### AC-V6-S07 update

Organization settings functional UI shipped (`docs/activeclinic/stitch/AC_V6_S07_ORGANIZATION_SETTINGS_PARITY.md`). Remains **STITCH_GAP / VISUAL_BLOCKED** — overview, HCO profile/edit, facilities/access/account links; no branding/billing/clinical settings.
