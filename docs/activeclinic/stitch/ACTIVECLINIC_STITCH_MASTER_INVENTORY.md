# ActiveClinic Stitch — Master Inventory (Phases 1–7)

**Audited:** 2026-08-04
**Stitch project:** ActiveClinic – Juflona Pilot
**Project ID:** `projects/12272131183982732110`
**Source:** Stitch MCP `list_screens` + `get_project` (live)
**Authority:** Stitch package prefixes `P01`–`P07` — not repository AC-V6-S01…S07 wave names.

## Safety note

- Repository branch required: `V6`
- Production touched: **no**
- Deployed: **no** · Pushed: **no**
- Unrelated WIP preserved (patient UI files already in working tree at start)

## Actual Stitch phase structure

| Phase | Exact Stitch label | Module | Screens | Desktop | Mobile | Tablet |
|------:|--------------------|--------|--------:|--------:|-------:|-------:|
| 1 | `P01` | Authentication / Application shell | 7 | 4 | 3 | 0 |
| 2 | `P02` | Patients | 18 | 11 | 7 | 0 |
| 3 | `P03` | Appointments / Reception / Queues | 20 | 17 | 3 | 0 |
| 4 | `P04` | Triage / Consultation / Clinical notes | 12 | 10 | 2 | 0 |
| 5 | `P05` | Pharmacy / Medication / Stock | 29 | 23 | 6 | 0 |
| 6 | `P06` | Laboratory / Imaging / Specimens | 14 | 12 | 2 | 0 |
| 7 | `P07` | Billing / Cashier / Invoices | 73 | 60 | 13 | 0 |

### Out of Phase 1–7 (recorded, not implemented here)

| Label | Count | Notes |
|-------|------:|-------|
| Unprefixed foundation + platform states | 10 | Duplicates of P01 + Access Restricted / Shared Error / Loading / Offline |
| `P13` | 16 | Staff directory, roles, invitations, account security — **next Stitch package after P07 in this project** (no P08–P12 screens present) |
| **Project total** | 199 | All screens in connected project |

## Phase summary (implementation status at inventory creation)

| Phase | Label | Screens | Workflows (approx) | Duplicate | Superseded | Complete | Partial | Missing | Blocked |
|------:|-------|--------:|-------------------:|----------:|-----------:|---------:|--------:|--------:|--------:|
| 1 | `P01` | 7 | 4 | 0 | 0 | 0 | 7 | 0 | 0 |
| 2 | `P02` | 18 | 6 | 0 | 0 | 0 | 17 | 0 | 1 |
| 3 | `P03` | 20 | 8 | 0 | 0 | 0 | 0 | 0 | 20 |
| 4 | `P04` | 12 | 6 | 0 | 0 | 0 | 0 | 0 | 12 |
| 5 | `P05` | 29 | 8 | 0 | 0 | 0 | 0 | 0 | 29 |
| 6 | `P06` | 14 | 5 | 0 | 0 | 0 | 0 | 0 | 14 |
| 7 | `P07` | 73 | 12 | 0 | 0 | 0 | 0 | 0 | 73 |
| — | Unprefixed/platform | 10 | — | 6 | 0 | 0 | 4 | 0 | 0 |

## Exact screen names by phase

### Phase 1 — `P01` (Authentication / Application shell)

Auth, dashboard, shared shell, shared states

| Exact Stitch name | Screen ID | Form | Status | Backend | Route |
|-------------------|-----------|------|--------|---------|-------|
| P01 – Dashboard – Desktop | `390032bf54ca44ee851673a4800f9af3` | DESKTOP | PARTIAL | PARTIAL | `GET /app` |
| P01 – Dashboard – Mobile | `8be466d48814446ab8bb087baacc6ec9` | MOBILE | PARTIAL | PARTIAL | `GET /app` |
| P01 – Login – Desktop | `ca8a34cf1ecb4fefa2ed31fb9873ae45` | DESKTOP | PARTIAL | READY | `GET/POST /login` |
| P01 – Login – Mobile | `026f619c35b04a5c8dde16eca9f7cf35` | MOBILE | PARTIAL | READY | `GET/POST /login` |
| P01 – Navigation Drawer – Mobile | `9f55cec7eb884dbebc2e01c6fb0fe58e` | MOBILE | PARTIAL | READY | `(chrome) /app/*` |
| P01 – Shared Application Shell – Desktop | `01b9125044634434b60223746b815b25` | DESKTOP | PARTIAL | READY | `(chrome) /app/*` |
| P01 – Shared States – Desktop | `9b881d25874c41f9986246c61de32f41` | DESKTOP | PARTIAL | PARTIAL | `access-state / lifecycle-state / error handler` |

### Phase 2 — `P02` (Patients)

Patient list, registration wizard, profile, edit, duplicates, print card, shared states

| Exact Stitch name | Screen ID | Form | Status | Backend | Route |
|-------------------|-----------|------|--------|---------|-------|
| P02 – Duplicate Patient Warning | `91e41fecc2b64496893b52317b7ab985` | DESKTOP | PARTIAL | READY | `POST /app/patients (duplicate gate)` |
| P02 – Edit Patient Details – Desktop | `0c3315d05469499d9b645bc7978001bf` | DESKTOP | PARTIAL | READY | `GET/POST /app/patients/:patientNumber/edit` |
| P02 – Edit Patient Details – Mobile | `4c6a5fe1c21c46709679f3707b8bf4dc` | MOBILE | PARTIAL | READY | `GET/POST /app/patients/:patientNumber/edit` |
| P02 – Patient List – Desktop | `5a6728d97b674200823562bb015e10ed` | DESKTOP | PARTIAL | READY | `GET /app/patients` |
| P02 – Patient List – Mobile | `58bd5e04f71340ff8d067721eb5562d4` | MOBILE | PARTIAL | READY | `GET /app/patients` |
| P02 – Patient Profile Overview – Desktop | `1a15f0bf4e564c4993ca33aa2d578a58` | DESKTOP | PARTIAL | READY | `GET /app/patients/:patientNumber` |
| P02 – Patient Profile Overview – Mobile | `99eb441b48a24fa19855e76669c0da86` | MOBILE | PARTIAL | READY | `GET /app/patients/:patientNumber` |
| P02 – Patient Registration Success – Desktop | `cd688e761cca43a1af299769014cb5f0` | DESKTOP | PARTIAL | READY | `GET /app/patients/:patientNumber?registered=1` |
| P02 – Patient Registration Success – Mobile | `b9615559155d41d591dbb91e18c6a090` | MOBILE | PARTIAL | READY | `GET /app/patients/:patientNumber?registered=1` |
| P02 – Patient Shared States – Desktop | `f98b2e6f2a4a4953a4d811af7b3737a2` | DESKTOP | PARTIAL | PARTIAL | `patients empty/error/restricted` |
| P02 – Print Patient Card Preview | `3c113fe684604dfcaeb8f6b2c071a6ca` | DESKTOP | PRODUCT_DECISION | BLOCKED | `—` |
| P02 – Register Patient Contact – Desktop | `e1ef5e5d8a1840bcbf1f4dc859f7b812` | DESKTOP | PARTIAL | READY | `GET/POST /app/patients/new (contact section)` |
| P02 – Register Patient Contact – Mobile | `44fb7852e24f4f7f9f6b355a195fd250` | MOBILE | PARTIAL | READY | `GET/POST /app/patients/new` |
| P02 – Register Patient Emergency and Medical – Desktop | `026d2e6c69cd4181a282213ba1bb55da` | DESKTOP | PARTIAL | PARTIAL | `GET/POST /app/patients/new + emergency-contacts` |
| P02 – Register Patient Emergency and Medical – Mobile | `7a495a471fed49b098de3c1605eda76e` | MOBILE | PARTIAL | PARTIAL | `GET/POST /app/patients/new` |
| P02 – Register Patient Identity – Desktop | `40d2005b64864f35ac8df831ddae7084` | DESKTOP | PARTIAL | READY | `GET/POST /app/patients/new` |
| P02 – Register Patient Review – Desktop | `8ef4b4d96f1f4224994d0c627bb7550e` | DESKTOP | PARTIAL | PARTIAL | `GET/POST /app/patients/new (review)` |
| P02 – Register Patient Review – Mobile | `a6d496f38f8e4d5cb8eb4d91667c6db7` | MOBILE | PARTIAL | PARTIAL | `GET/POST /app/patients/new` |

### Phase 3 — `P03` (Appointments / Reception / Queues)

Appointments, reception queue, check-in, walk-in, transfers

| Exact Stitch name | Screen ID | Form | Status | Backend | Route |
|-------------------|-----------|------|--------|---------|-------|
| P03 – Appointment Calendar – Desktop | `0fca19f233af43c49966e7eb62bccb02` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P03 – Appointment Confirmation – Desktop | `327422c1b36747039e4026a17c5a2f33` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P03 – Appointment List – Desktop | `284e9f8cd6804b0eb0f50574e2f571d6` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P03 – Appointment List – Mobile | `480ecaba5258423e8711b1fdd2f39e1b` | MOBILE | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P03 – Appointment Shared States – Desktop | `089aa8f266664446a8b38cb69d1fda48` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P03 – Book Appointment – Desktop | `a99c6ac04cf24f2c8ca349715c1829dc` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P03 – Cancel Appointment – Desktop | `b27eafc25bad4006868f3932d08bfed5` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P03 – Create Walk-In Visit – Desktop | `305d90143b0e4381b112bf6eb113f1c2` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P03 – Doctor Schedule – Desktop | `fd009ceba70f40b2ae1755b94220c64b` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P03 – Missed Appointments – Desktop | `7d37e069c7644e7cb4c9b72349a0ccf7` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P03 – Patient Called – Desktop | `8dca6dbd36b840928e73d6674bbcb3ea` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P03 – Patient Check-In – Desktop | `9284064428f443b1a3a1504054827d91` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P03 – Patient Did Not Respond — Desktop | `f7841548662446cfa8d70d0772d3fa9f` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P03 – Queue Assignment – Desktop | `1fa99f4a358c47ffb858addae7095fe8` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P03 – Queue Stale Data Warning – Desktop | `bf9b846da6174bf995793b09e869cd30` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P03 – Reception Queue – Desktop | `8b7173ba4ff94eb2a7d7e548b5f7253d` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P03 – Reception Queue – Mobile | `73499b0dfef446c99a908b1cc56252a5` | MOBILE | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P03 – Reschedule Appointment – Desktop | `da39a3945ace4fac85cb12bd86f0cdc2` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P03 – Reschedule Appointment – Mobile | `9429b14e9ea243ad93aec4a486db93e9` | MOBILE | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P03 – Transfer Patient to Department – Desktop | `e807a1354fdd418391496e69e5ac5f3e` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |

### Phase 4 — `P04` (Triage / Consultation / Clinical notes)

Clinical queue, triage, vitals, consultation, orders

| Exact Stitch name | Screen ID | Form | Status | Backend | Route |
|-------------------|-----------|------|--------|---------|-------|
| P04 – Clinical Escalation Alert | `99757cfd7d3747d490f00ac342faa519` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P04 – Clinical Queue – Desktop | `b8d47f05a83c4959ac2d3d6ca83c7dfb` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P04 – Clinical Queue – Mobile | `16897ac752a94750bf00225db66ff768` | MOBILE | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P04 – Consultation Workspace – Desktop | `5e4dbc7265ad4e17b060b1f641996db3` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P04 – Consultation Workspace – Mobile | `15c6c639c2b04bbda97b54f127c500f8` | MOBILE | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P04 – Create Laboratory Request | `969bbfbdf9634dbc8af598ec2277e92f` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P04 – Create Prescription | `ee9bf2322b924cd79e86619a4635f702` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P04 – Create Radiology Request | `bc4ffd8f0e8c44f48f38cc15a069656a` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P04 – Diagnosis Entry | `33a522e2f4eb45c9bdbede9ba34e0bee` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P04 – Nursing Intake – Desktop | `7959616d1673403ba3bf6ff71d18a77b` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P04 – Triage Assessment – Desktop | `3c8f7b43b7984718acf661e381c1e6f7` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P04 – Vital Signs Entry – Desktop | `dede5e72277d413497e1f870f6b4a0e1` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |

### Phase 5 — `P05` (Pharmacy / Medication / Stock)

Pharmacy dashboard, prescriptions, inventory, dispensing

| Exact Stitch name | Screen ID | Form | Status | Backend | Route |
|-------------------|-----------|------|--------|---------|-------|
| P05 – Add Medicine | `83495a7aea6547ce873af695fcb5f604` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P05 – Dispense Prescription – Desktop | `e4d4e37c175a458d9004e1240395ba63` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P05 – Dispense Prescription – Mobile | `ace4f11562b24515866b40c5594a18e6` | MOBILE | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P05 – Dispensing Completed – Desktop | `eeaf00f13f6f4e238da3aef30a556a57` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P05 – Dispensing Confirmation | `00a95c467df2414fb8c6dea108170b04` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P05 – Dispensing Review – Desktop | `97138791742e4338a34811a6fd7e464d` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P05 – Expiry Alerts – Desktop | `fcba0b2ed1334eacad9647e597f66959` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P05 – Low Stock Alerts – Desktop | `553dd601642d41abb89cf4c7127c221a` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P05 – Medicine Batch Detail | `6c0795f36aef4fe3b634dc350d230672` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P05 – Medicine Catalogue – Desktop | `b5e534cf921d460c9774c2772ab688e9` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P05 – Medicine Detail – Desktop | `20a62e6f34ef422b8262750b0fe9788a` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P05 – Medicine Inventory – Desktop | `1f079e7d3f9c464c8754fa09a09f2626` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P05 – Medicine Inventory – Mobile | `a0cb61de9f0f4eaa8d732d4cf143f090` | MOBILE | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P05 – Medicine Substitution – Desktop | `e237cd030fb241deb15ed8eb0f4f895e` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P05 – Partial Dispensing – Desktop | `c7c3ea1931f74acb845208dd09d0d63d` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P05 – Patient Medicine Instructions – Mobile | `7cffba8bdac84abda7a8d31951d1948f` | MOBILE | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P05 – Pharmacy Dashboard – Desktop | `4d83f5c845ae4d91b805a1dfd6a7268d` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P05 – Pharmacy Purchase Orders – Desktop | `0f1976955fc14d8c97f1f8c728b4e1da` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P05 – Pharmacy Stock Adjustment | `2147643a82af4fb28a8368dcff867a75` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P05 – Pharmacy Stock Transfer | `ce22d1c5de5f43ad8a458f57aa217fd3` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P05 – Prescription Clinical Review – Desktop | `99d29d4a8b204031b068e2b94dfeb95b` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P05 – Prescription Clinical Review – Mobile | `279be7b923664e449bd2001528e7c5ec` | MOBILE | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P05 – Prescription Detail – Desktop | `2da2d7b7cd734161a9f8257c2256c6f3` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P05 – Prescription Detail – Mobile | `4f369d10d5654e68bf5a5c45d8ef7d78` | MOBILE | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P05 – Prescription Queue – Desktop | `5472760fda8148cf8611564236ae2247` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P05 – Prescription Queue – Mobile | `322c2b620c8e4b248fa5620881555d8b` | MOBILE | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P05 – Print Medicine Labels | `b62126b07af7488094221932b9046193` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P05 – Receive Pharmacy Stock – Desktop | `a61dbccce82b43788dc347e25843ae07` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P05 – Select Medicine Batch | `a7649e64ba1e4eee8ca0bcb6a54594bd` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |

### Phase 6 — `P06` (Laboratory / Imaging / Specimens)

Lab/radiology dashboards, specimens, results

| Exact Stitch name | Screen ID | Form | Status | Backend | Route |
|-------------------|-----------|------|--------|---------|-------|
| P06 – Critical Result Alert | `f53854e6c18e45a094a0bab86e011e5b` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P06 – Enter Laboratory Result – Desktop | `59ee5d74ff1f47eca3c6fb09413b7c09` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P06 – Enter Radiology Report – Desktop | `41a0f1b3e1974e7ca26599bf8a37fc5f` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P06 – Laboratory Dashboard – Desktop | `5b7b36f6af3b4735a81cca8cea77ee99` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P06 – Laboratory Dashboard – Mobile | `d53f9752db564b18b35fd761ecd73dd8` | MOBILE | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P06 – Laboratory Request Detail – Desktop | `51c3b93fec6e40aebc327a4998fb29ea` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P06 – Laboratory Request Queue – Desktop | `f8b17233f1f7457ea5fe5179207aa0d1` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P06 – Laboratory Worklist – Desktop | `cd5ff44012dd4f0f88fc7ed60848fd37` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P06 – Radiology Dashboard – Desktop | `65286a85cc674df097dedf0890378a29` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P06 – Radiology Dashboard – Mobile | `070284f5583d43598111b2f6c35d0425` | MOBILE | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P06 – Radiology Request Queue – Desktop | `1fa6c921703145af96e47f7344b6cb62` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P06 – Specimen Collection – Desktop | `73c50eef2b10459793f12689cce27bb6` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P06 – Specimen Receipt – Desktop | `5018c7fabf324fcebfbac85d7048f19a` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P06 – Specimen Rejected | `b62c8afb0c59477d8bcfeaac7210987a` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |

### Phase 7 — `P07` (Billing / Cashier / Invoices)

Billing, cashier shifts, invoices, payments, refunds, price lists

| Exact Stitch name | Screen ID | Form | Status | Backend | Route |
|-------------------|-----------|------|--------|---------|-------|
| P07 – Accounts Receivable – Desktop | `1829edeb5d1741be9b6ae68a219ef7cc` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Add Invoice Item | `be4481e8f31b459facf2294f73311181` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Add Service – Desktop | `764d9a2a5a634150babb4daa1d6ebf13` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Automatic Charge Review | `954a9269255245dd9c6e375f8cbdd93b` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Bank Transfer Payment – Mobile | `f23ef64e307b44f780a19817ac04ebda` | MOBILE | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Billing Dashboard – Desktop | `ece0b9d1d9384f5d8c1e3b944f122e47` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Billing Dashboard – Mobile | `649bd7649ebf4c6eb787612f844a637e` | MOBILE | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Card Payment – Desktop | `61922a4c2823426b8bcdc1f236c4072b` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Cash Count – Desktop | `02e8083e943d40deb9429b95a294ae30` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Cash Payment – Desktop | `2d81fb326b6644bbb11cabd7a8156e6e` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Cash Payment – Mobile | `3c8ce685b0d14b74a04e1127e341f004` | MOBILE | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Cashier Closing – Desktop | `d3e2ff001f694720b57371ef1a60d517` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Cashier Dashboard – Desktop | `792d5cbb6f234332a088399e4ccdd545` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Cashier Shift History – Desktop | `1cd25ed2bb7a4504a63095a015bd823b` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Cashier Shift – Desktop | `1c02fc47e49c4c9990646d94a9876986` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Cashier Shift – Mobile | `0d8cd08aba454a2f971d6cc4389d98d2` | MOBILE | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Cashier Variance – Desktop | `7dd49983c4a840b9980fb4a92d486b3c` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Collections Work Queue – Desktop | `16318693e2874e79a8463d91c6ba63ad` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Contact Patient for Payment – Desktop | `513301ae28e1423ab7431e299cf45eee` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Create Invoice – Desktop | `08ed6ee0d02447bca5e94698080bca4f` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Create Price List – Desktop | `b69484b43b074d6593f264d8df958d74` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Credit Note – Desktop | `92b97e715c6f4c308e61d3b39d66a1e9` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Deposit Payment – Desktop | `0f1fd946c97a48f99d34bd6ce8c8173c` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Finalise Invoice | `319d7fca2acb45a38432aa40a2e7cf30` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Financial Correction Access Restricted | `778eee4267984f32bcedcc38ca720fa0` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Financial Correction History | `54163d0beee74c29990bd83b77480af5` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Financial Correction History – Mobile | `a21d364d62f04c78ac8477971377eca9` | MOBILE | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Insurance Payment Placeholder | `9c0219d791da43df8a7abf41cf0809df` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Invoice Amendment | `5bde2c1a3d954ec396679abc3888abe5` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Invoice Amendment Review – Desktop | `92af580dd9db4a3ea5734523b72287ba` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Invoice Error State | `b1a8b1855b9b4e268cd42359707d292e` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Invoice History | `06e7e10102184cc5a047e6d594f22fc2` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Invoice List – Desktop | `c479c86234b840419e821c2c48329f4e` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Invoice List – Mobile | `40fcc3c9e03e42a68e2cadbd5c1a7685` | MOBILE | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Invoice Review – Desktop | `713f3ebe920240c1a647af277278eb2f` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Mobile Money Payment – Desktop | `2b3c2c4ef6ac4ee48a789d3a527fe9ec` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Mobile Money Payment – Mobile | `480e2d80a9f24f26b69b806d531fa913` | MOBILE | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – NHIMA Claim Placeholder | `0489fa5d1c37481ba159eeed1cd64155` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Open Cashier Shift – Desktop | `c2f068812d0b45809a214d6ba8399ae5` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Patient Billing Account – Desktop | `a84263ac97b8484698dc36d00b498ffa` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Patient Billing Account – Mobile | `c15d892b327848a6a2897ae3a08a5803` | MOBILE | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Patient Collections Account – Desktop | `3f50a00be7624b36af773c181b2c562c` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Patient Invoice – Desktop | `9f422c33e30c450e9502126ba4012585` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Patient Invoice – Mobile | `3735516f4ecb4624ac715c6f77e7810b` | MOBILE | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Payment Arrangement | `02e1c1976d844c2cac63682e1853fa46` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Payment Arrangement Review | `2a0ae995f3e140da863e5aede4b2e71f` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Payment Completed – Desktop | `bda1fbd1f6f441dba26719f451ee53de` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Payment History – Desktop | `45929cd32480420aaa5788be86e183f9` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Payment Reversal Request | `2665942082b4428dbcabf3ff3a40ec60` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Payment Reversal Review – Desktop | `027b12b482934ef1a6f5dee02c888d26` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Payment Review – Desktop | `89ce6798cbca4723ae20aa61225411b2` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Price Lists – Desktop | `46cc5311173d48adb99cafe18ea331c2` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Price Override Approval | `a953a043598945fdab38285c7dab7206` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Print Patient Account Statement | `666806c4ea194d478e3baf2b7876950c` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Print Receipt | `914eee2a18f64fac81d2f0f69adc0cc8` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Print Refund Receipt | `244dc0c45a23434bb2747468a699167b` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Record Payment – Desktop | `a9654729a9a44e17832910a41f0154de` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Record Payment – Mobile | `8ca889a31c4e4ec1858c4dd4efc62731` | MOBILE | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Refund Approval – Desktop | `d8f3108dfcda4ab9bf58472786d0484c` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Refund Completed – Desktop | `e52271b7be804e0ea95c825be9f977bd` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Refund Rejected | `b76f80fb0d164501b8108bea91813385` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Refund Request – Desktop | `685fb829c50a45af995772909fb49fb7` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Refund Request – Mobile | `8461f1792a7a41209ae2abfe44db7b6a` | MOBILE | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Refund Review – Desktop | `438b1bb01f534492850ee8cb1253fcfe` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Revenue Reports – Desktop | `08921cb100ab462d8ec08c007f1bd895` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Revenue Reports – Detailed | `550a52476c254e258d58737fc1184bb6` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Service Catalogue – Desktop | `4ca894f70d6646eca246847cd8c39d6a` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Service Catalogue – Mobile | `1ab29b0691c04233a1c972ea99f24351` | MOBILE | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Service Detail – Desktop | `d5eb57a8319c4130be473f8dd23851d6` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Split Payment – Desktop | `bb0a290730a44a108be9295a76478785` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Unpaid Invoices – Desktop | `defb5bc8233046a4b9b1e86ebe740d1d` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Unpaid Invoices – Mobile | `9c5a3f10f1cb44e983af2a7c36403e3d` | MOBILE | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |
| P07 – Write-Off Request Placeholder | `46a8b6c4f4b846e18ab586c3d6fae6ca` | DESKTOP | SCHEMA_BLOCKED | BLOCKED | `/app/… (not implemented)` |

### Unprefixed / platform (not P0N-labeled)

| Exact Stitch name | Screen ID | Form | Status | Notes |
|-------------------|-----------|------|--------|-------|
| Access Restricted | `8731b06bbfa747e98e05372c9aafb3e9` | DESKTOP | PARTIAL | Platform state |
| Application Shell - Desktop | `9f3abb837fc3413aa128949afce0d8c4` | DESKTOP | DUPLICATE | Duplicate of `P01 – Shared Application Shell – Desktop` |
| Dashboard - Desktop | `c54b0a846c054044aa0ca05194e320ef` | DESKTOP | DUPLICATE | Duplicate of `P01 – Dashboard – Desktop` |
| Dashboard - Mobile | `d19b0d5c33ae42e08ca767a11b12e591` | MOBILE | DUPLICATE | Duplicate of `P01 – Dashboard – Mobile` |
| Login - Desktop | `8bf5c500e0d14014944618029212b2c9` | DESKTOP | DUPLICATE | Duplicate of `P01 – Login – Desktop` |
| Login - Mobile | `6e3cbe4963c3428196b10d3bb27421d5` | MOBILE | DUPLICATE | Duplicate of `P01 – Login – Mobile` |
| Navigation Drawer - Mobile | `87c5a80e0fcb40179c0d1ce7ea906762` | MOBILE | DUPLICATE | Duplicate of `P01 – Navigation Drawer – Mobile` |
| Shared Error State | `72357dec37864a5a926a1d2b5c551b16` | DESKTOP | PARTIAL | Platform state |
| Shared Loading State | `8a3f15c0be9c47efb192f206df104d5c` | DESKTOP | PARTIAL | Platform state |
| Shared Offline State | `4d31c82537634b5f981c359662d224b3` | DESKTOP | PARTIAL | Platform state |

## Canonical vs duplicate

- **Canonical auth/shell:** `P01 – *` titles.
- **SUPERSEDED/DUPLICATE:** unprefixed Login / Dashboard / Application Shell / Navigation Drawer.
- No other superseded pairs identified without visual approval evidence; keep all P02–P07 designs canonical until product marks otherwise.

## Related docs

- [ACTIVECLINIC_STITCH_PHASE_01.md](./ACTIVECLINIC_STITCH_PHASE_01.md)
- [ACTIVECLINIC_STITCH_PHASE_02.md](./ACTIVECLINIC_STITCH_PHASE_02.md)
- [ACTIVECLINIC_STITCH_PHASE_03.md](./ACTIVECLINIC_STITCH_PHASE_03.md)
- [ACTIVECLINIC_STITCH_PHASE_04.md](./ACTIVECLINIC_STITCH_PHASE_04.md)
- [ACTIVECLINIC_STITCH_PHASE_05.md](./ACTIVECLINIC_STITCH_PHASE_05.md)
- [ACTIVECLINIC_STITCH_PHASE_06.md](./ACTIVECLINIC_STITCH_PHASE_06.md)
- [ACTIVECLINIC_STITCH_PHASE_07.md](./ACTIVECLINIC_STITCH_PHASE_07.md)
- [ACTIVECLINIC_STITCH_ROUTE_MATRIX.md](./ACTIVECLINIC_STITCH_ROUTE_MATRIX.md)
- [ACTIVECLINIC_STITCH_PERMISSION_MATRIX.md](./ACTIVECLINIC_STITCH_PERMISSION_MATRIX.md)
- [ACTIVECLINIC_STITCH_DATA_CONTRACTS.md](./ACTIVECLINIC_STITCH_DATA_CONTRACTS.md)
- [ACTIVECLINIC_STITCH_COMPONENT_MAP.md](./ACTIVECLINIC_STITCH_COMPONENT_MAP.md)
- [ACTIVECLINIC_STITCH_RESPONSIVE_MATRIX.md](./ACTIVECLINIC_STITCH_RESPONSIVE_MATRIX.md)
- [ACTIVECLINIC_STITCH_IMPLEMENTATION_LEDGER.md](./ACTIVECLINIC_STITCH_IMPLEMENTATION_LEDGER.md)
- [ACTIVECLINIC_STITCH_PRODUCT_GAPS.md](./ACTIVECLINIC_STITCH_PRODUCT_GAPS.md)
