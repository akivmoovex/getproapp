# ActiveClinic Stitch Raw Inventory (Phase 1)

**Generated:** 2026-08-11T23:50:10.234Z  
**Source:** Live Stitch MCP `list_screens` (not a stale repo snapshot)  
**Scope:** Stitch-side inventory ONLY — no V7 route / EJS / parity mapping

---

## A. Safety evidence

| Field | Value |
|-------|-------|
| branch | V7 |
| HEAD SHA | `2ee3c6652134411a30d2ea8dbc18ed1229936222` |
| DEPLOYMENT_ENV | testing |
| DB identity_key | moovex-platform-v7 |
| DB environment_code | testing |
| production touched | no |
| pushed | no |
| deployed | no |
| working tree altered (this task) | inventory output files only under `docs/activeclinic/stitch/` |
| note | HEAD advanced mid-task via unrelated external commit `2ee3c665` (BlessBoard QA). Inventory task did not create that commit. |

---

## B. Project totals

### Project 1 — Public / tenant / booking / portal

| Metric | Value |
|--------|-------|
| Project ID | `17813606734422395399` |
| Project name | ActiveClinic Public Ecosystem & Booking Flow |
| Project URL | https://stitch.withgoogle.com/projects/17813606734422395399 |
| Total screens | 189 |
| Desktop | 82 |
| Mobile | 107 |
| Tablet | 0 |
| Unknown | 0 |

### Project 2 — Authenticated / internal operations

| Metric | Value |
|--------|-------|
| Project ID | `12272131183982732110` |
| Project name | ActiveClinic – Juflona Pilot |
| Project URL | https://stitch.withgoogle.com/projects/12272131183982732110 |
| Total screens | 199 |
| Desktop | 155 |
| Mobile | 44 |
| Tablet | 0 |
| Unknown | 0 |

### Combined

| Metric | Value |
|--------|-------|
| Combined total | 388 |

Note: Project 2 `get_project.screenInstances` reported 207 entries; 8 were non-screen `assets_*` placeholders and are **not** counted as screens. Inventory uses `list_screens` as the authoritative screen set.

---

## C. Screens by phase

### Project 1

| Phase | Count |
|-------|-------|
| P26 | 35 |
| P22 | 33 |
| P27 | 30 |
| P21 | 28 |
| P25 | 24 |
| P24 | 19 |
| P23 | 15 |
| SHARED_PUBLIC | 5 |

### Project 2

| Phase | Count |
|-------|-------|
| P07 | 73 |
| P05 | 29 |
| P03 | 20 |
| P02 | 18 |
| P13 | 16 |
| P01 | 14 |
| P06 | 14 |
| P04 | 12 |
| SHARED_INTERNAL | 3 |

### Combined

| Phase | Count |
|-------|-------|
| P07 | 73 |
| P26 | 35 |
| P22 | 33 |
| P27 | 30 |
| P05 | 29 |
| P21 | 28 |
| P25 | 24 |
| P03 | 20 |
| P24 | 19 |
| P02 | 18 |
| P13 | 16 |
| P23 | 15 |
| P01 | 14 |
| P06 | 14 |
| P04 | 12 |
| SHARED_PUBLIC | 5 |
| SHARED_INTERNAL | 3 |

---

## D. Screens by functional area

| Functional area | Count |
|-----------------|-------|
| BILLING | 63 |
| MY_BOOKING | 35 |
| PHARMACY | 29 |
| JUFLONA | 25 |
| PROCEDURE_BOOKING | 24 |
| CONSULTATION_BOOKING | 18 |
| PATIENTS | 18 |
| PATIENT_AUTH | 15 |
| PUBLIC_PLATFORM | 15 |
| PATIENT_PORTAL | 14 |
| APP_SHELL | 13 |
| APPOINTMENTS | 12 |
| CLINICAL | 12 |
| SERVICES | 11 |
| CASHIER | 10 |
| CLINIC_REGISTRATION | 10 |
| DIRECTORY | 10 |
| LABORATORY | 9 |
| RECEPTION | 8 |
| DOCTORS | 7 |
| STAFF | 7 |
| PRICING | 5 |
| RBAC | 5 |
| DASHBOARD | 4 |
| RADIOLOGY | 4 |
| SETTINGS | 4 |
| DIAGNOSTICS | 1 |

---

## E. Screens by kind / state

### screen_kind

| Kind | Count |
|------|-------|
| PRIMARY_SCREEN | 312 |
| STATE_VARIANT | 32 |
| SUCCESS_STATE | 20 |
| ERROR_STATE | 9 |
| OTHER | 5 |
| EMPTY_STATE | 3 |
| LOADING_STATE | 3 |
| CONFIRMATION_STATE | 2 |
| DRAWER | 2 |

### state

| State | Count |
|-------|-------|
| DEFAULT | 289 |
| OTHER | 35 |
| SUCCESS | 20 |
| RESCHEDULED | 8 |
| ERROR | 7 |
| CANCELLED | 6 |
| CONFIRMED | 4 |
| EMPTY | 3 |
| LOADING | 3 |
| PENDING | 3 |
| UNAVAILABLE | 3 |
| DISABLED | 2 |
| NOT_FOUND | 2 |
| VALIDATION_ERROR | 2 |
| POPULATED | 1 |

---

## F. Duplicate candidates

**Count (screens flagged):** 16  
**Groups:** 8

Duplicates were **flagged, not removed**. Canonical selection is deferred.

### dup_006 (2)

- `c54b0a846c054044aa0ca05194e320ef` — Dashboard - Desktop (DESKTOP) [`12272131183982732110`]
- `390032bf54ca44ee851673a4800f9af3` — P01 – Dashboard – Desktop (DESKTOP) [`12272131183982732110`]

### dup_008 (2)

- `d19b0d5c33ae42e08ca767a11b12e591` — Dashboard - Mobile (MOBILE) [`12272131183982732110`]
- `8be466d48814446ab8bb087baacc6ec9` — P01 – Dashboard – Mobile (MOBILE) [`12272131183982732110`]

### dup_007 (2)

- `8bf5c500e0d14014944618029212b2c9` — Login - Desktop (DESKTOP) [`12272131183982732110`]
- `ca8a34cf1ecb4fefa2ed31fb9873ae45` — P01 – Login – Desktop (DESKTOP) [`12272131183982732110`]

### dup_004 (2)

- `6e3cbe4963c3428196b10d3bb27421d5` — Login - Mobile (MOBILE) [`12272131183982732110`]
- `026f619c35b04a5c8dde16eca9f7cf35` — P01 – Login – Mobile (MOBILE) [`12272131183982732110`]

### dup_005 (2)

- `87c5a80e0fcb40179c0d1ce7ea906762` — Navigation Drawer - Mobile (MOBILE) [`12272131183982732110`]
- `9f55cec7eb884dbebc2e01c6fb0fe58e` — P01 – Navigation Drawer – Mobile (MOBILE) [`12272131183982732110`]

### dup_001 (2)

- `2c612094416e468ea4063dc162667609` — P21 - ActiveClinic Public - Clinic Directory - Desktop (DESKTOP) [`17813606734422395399`]
- `dac958cf9559485aa0aac7803360cf40` — P21 - ActiveClinic Public - Clinic Directory - Desktop (DESKTOP) [`17813606734422395399`]

### dup_003 (2)

- `22391e15f8c34fc5b23927b4e7644120` — P21 - ActiveClinic Public - Home - Desktop (DESKTOP) [`17813606734422395399`]
- `f96b485558c64fc38193c5d3231633ec` — P21 - ActiveClinic Public - Home - Desktop (DESKTOP) [`17813606734422395399`]

### dup_002 (2)

- `2ccf327230b640c3b3340e5bca2bb162` — P21 - ActiveClinic Public - Home - Mobile (MOBILE) [`17813606734422395399`]
- `6dadae69ad0d4e4e9441e1a68b3f6282` — P21 - ActiveClinic Public - Home - Mobile (MOBILE) [`17813606734422395399`]

---

## G. Cross-project overlap candidates

**Count (screens flagged):** 23

Overlaps were **flagged, not merged**. Themes are strict (login, password set/recovery, account security, phone verification, nav drawer, top-level/patient dashboard, shared system states). Module dashboards (pharmacy/lab/billing/etc.) are excluded.

### top_level_or_patient_dashboard||DESKTOP

**Public:**
- `1bb70f70b2d442bda9ec2bcfe6c9cd08` — P27 - Juflona Patient - Dashboard - Desktop
- `d499e36b667047e1998d38d66be6bbe2` — P27 - Juflona Patient - Dashboard Multiple Bookings - Desktop

**Internal:**
- `c54b0a846c054044aa0ca05194e320ef` — Dashboard - Desktop

### top_level_or_patient_dashboard||MOBILE

**Public:**
- `e4c2703d85764c2cbf2f91ab890d27e3` — P27 - Juflona Patient - Dashboard - Mobile
- `0ec2c722bd80493ea69102f61b9b36e3` — P27 - Juflona Patient - Dashboard Empty - Mobile

**Internal:**
- `d19b0d5c33ae42e08ca767a11b12e591` — Dashboard - Mobile

### patient_staff_login||DESKTOP

**Public:**
- `4bc683c012fc465681d21655ac3d1d01` — P27 - Juflona Patient - Login - Desktop

**Internal:**
- `8bf5c500e0d14014944618029212b2c9` — Login - Desktop
- `ca8a34cf1ecb4fefa2ed31fb9873ae45` — P01 – Login – Desktop

### patient_staff_login||MOBILE

**Public:**
- `7c24084776e64719be06423d42263e61` — P27 - Juflona Patient - Login - Mobile
- `795b6f3cce584467bdc369bd89f67419` — P27 - Juflona Patient - Login States - Mobile

**Internal:**
- `6e3cbe4963c3428196b10d3bb27421d5` — Login - Mobile
- `026f619c35b04a5c8dde16eca9f7cf35` — P01 – Login – Mobile

### account_security_sessions||DESKTOP

**Public:**
- `bb852d4218b9470981d9944eff62b1b4` — P27 - Juflona Patient - Account Security - Desktop

**Internal:**
- `c50a51a04a084f0badd48da9827aa11f` — P13 – Account Security – Desktop
- `e132749f634c4fff818acf3f8e21c361` — P13 – Active Sessions – Desktop

### phone_verification||MOBILE

**Public:**
- `fc27f3a94086412bbb546e19248ffc5d` — P27 - Juflona Patient - Verify Phone - Mobile

**Internal:**
- `1db2777e1f444a0a90ca3174a4700ac2` — P13 – Phone Verification

### password_recovery_or_set||MOBILE

**Public:**
- `9ff0dd371e8e49d38b82288c77699671` — P27 - Juflona Patient - Forgot Password - Mobile
- `cc39b8bf074e408682da114b26ed8897` — P27 - Juflona Patient - Password Updated - Mobile
- `3e22604b90844b499b98bed2dba8f81c` — P27 - Juflona Patient - Recovery Verification - Mobile
- `fb2dab64c9ed41f483ae83d4a7f20fe3` — P27 - Juflona Patient - Set New Password - Mobile

**Internal:**
- `4abbdd1d655045e697922c3b209c9e15` — P13 – Set Initial Password

---

## H. Screens missing IDs or URLs

| Issue | Count |
|-------|-------|
| Missing screen_id | 0 |
| Missing screen_url (null — API does not expose direct per-screen links) | 388 |

Direct per-screen Stitch URLs were **not invented**. Preserve `project_url` + `screen_id` for later lookup.

_All screens have screen IDs from Stitch MCP._

---

## I. Screens that could not be confidently classified

**Count (UNCLASSIFIED_* / UNKNOWN functional_area):** 0

_None with UNCLASSIFIED phase or UNKNOWN functional_area._

Shared chrome without Pxx prefixes is tagged `SHARED_PUBLIC` (5) or `SHARED_INTERNAL` (3) rather than forced into a phase.

---

## J. Data quality notes

1. Live source: Stitch MCP `list_screens` for both project IDs on 2026-08-11.
2. Original Stitch titles preserved exactly in `screen_title`.
3. `normalized_title` is lowercase, punctuation-normalized, meaning-preserving.
4. `device_type` taken from Stitch `deviceType` field (DESKTOP/MOBILE); no inference beyond API evidence.
5. `dimensions` from Stitch `width` × `height` when present.
6. `screen_url` is always `null` — Stitch list API does not return a stable public per-screen deep link.
7. Phase tags use explicit `Pxx` title prefixes when present; unprefixed internal chrome mapped to P01 / SHARED_* conservatively.
8. State / screen_kind / functional_area are title-evidence heuristics for inventory triage — not implementation claims.
9. Duplicate and cross-project overlap flags are candidates only; no canonical choice made.
10. No V7 routes, EJS views, parity scores, or implementation status included.
11. Project 1 `get_project` MCP call returned an invalid-argument error during this run; project metadata taken from `list_projects` + `list_screens` (titles/IDs confirmed). Project 2 `get_project` succeeded.

---

## Screen index (compact)

### Project 1 (189)

- `4443fa4c1eea429fb6ee67a97efb8f92` | P21 | DESKTOP | P21 - ActiveClinic Public - About - Desktop
- `2447429876f24ac287f903795c4d4d04` | P21 | MOBILE | P21 - ActiveClinic Public - About - Mobile
- `2c612094416e468ea4063dc162667609` | P21 | DESKTOP | P21 - ActiveClinic Public - Clinic Directory - Desktop
- `dac958cf9559485aa0aac7803360cf40` | P21 | DESKTOP | P21 - ActiveClinic Public - Clinic Directory - Desktop
- `2c495fc46a3648c5b878e207d9f12661` | P21 | DESKTOP | P21 - ActiveClinic Public - Clinic Directory - Empty - Desktop
- `08791796ff3046df8c2c479ee2641814` | P21 | MOBILE | P21 - ActiveClinic Public - Clinic Directory - Empty - Mobile
- `cdc46325b27b4813bf5a19eb8e85dd9f` | P21 | DESKTOP | P21 - ActiveClinic Public - Clinic Directory - Error - Desktop
- `82299e09519c4098b07429d9ae97bdac` | P21 | MOBILE | P21 - ActiveClinic Public - Clinic Directory - Error - Mobile
- `3cf8b9cbce0a4866aace37f72c319e5f` | P21 | DESKTOP | P21 - ActiveClinic Public - Clinic Directory - Loading - Desktop
- `4889fc1798d2425f85ba19dd68c29734` | P21 | MOBILE | P21 - ActiveClinic Public - Clinic Directory - Loading - Mobile
- `85f99ea3326f46a2bd0415ba1cf2d8d2` | P21 | MOBILE | P21 - ActiveClinic Public - Clinic Directory - Mobile
- `a45f68ec92f8495d8f5cd1aa42831e88` | P21 | DESKTOP | P21 - ActiveClinic Public - Clinic Onboarding - Desktop
- `18f6b1a32e464e8c93f977f918e05500` | P21 | MOBILE | P21 - ActiveClinic Public - Clinic Onboarding - Mobile
- `fa556d169e1a44b38a65770869bf2c09` | P21 | DESKTOP | P21 - ActiveClinic Public - Clinic Onboarding Review - Desktop
- `254bcedf197b4b0794c9df173f8a6857` | P21 | MOBILE | P21 - ActiveClinic Public - Clinic Onboarding Review - Mobile
- `3410067aec51400d95936b34efd85e46` | P21 | DESKTOP | P21 - ActiveClinic Public - Clinic Onboarding Server Error - Desktop
- `8c33ca1f083c494fa4b2143e3a3e45d3` | P21 | MOBILE | P21 - ActiveClinic Public - Clinic Onboarding Server Error - Mobile
- `f9f8853209fb42ebb1ef71cdb97145ba` | P21 | DESKTOP | P21 - ActiveClinic Public - Clinic Onboarding Success - Desktop
- `7f422dccacea4a5c93932db627522000` | P21 | MOBILE | P21 - ActiveClinic Public - Clinic Onboarding Success - Mobile
- `341517f50f3f4fce85e4715f41e12b3c` | P21 | DESKTOP | P21 - ActiveClinic Public - Clinic Onboarding Validation Error - Desktop
- `9a4d8a72068e4fec88cb7eadab0a4dd4` | P21 | MOBILE | P21 - ActiveClinic Public - Clinic Onboarding Validation Error - Mobile
- `50d278a0dc7c4618b20e70e4fdfd6076` | P21 | MOBILE | P21 - ActiveClinic Public - Clinic Search States - Mobile
- `22391e15f8c34fc5b23927b4e7644120` | P21 | DESKTOP | P21 - ActiveClinic Public - Home - Desktop
- `f96b485558c64fc38193c5d3231633ec` | P21 | DESKTOP | P21 - ActiveClinic Public - Home - Desktop
- `2ccf327230b640c3b3340e5bca2bb162` | P21 | MOBILE | P21 - ActiveClinic Public - Home - Mobile
- `6dadae69ad0d4e4e9441e1a68b3f6282` | P21 | MOBILE | P21 - ActiveClinic Public - Home - Mobile
- `ac6b69a1ef614134af6d674c62891632` | P21 | DESKTOP | P21 - ActiveClinic Public - Solutions - Desktop
- `990884d1aa844bb2a789f41b23b7704e` | P21 | MOBILE | P21 - ActiveClinic Public - Solutions - Mobile
- `5b3a0cccbc224b388752747847c0749a` | P22 | DESKTOP | P22 - Demo Clinic - Booking Entry - Desktop
- `f18d2b7bea004db492c5f0cc45d0743e` | P22 | MOBILE | P22 - Demo Clinic - Booking Entry - Mobile
- `3b5370de88bf4bb8adaf679dae11b035` | P22 | DESKTOP | P22 - Demo Clinic - Doctors - Desktop
- `911e3c7f4fdd4016bedea8641aad2c6f` | P22 | MOBILE | P22 - Demo Clinic - Doctors - Mobile
- `0d9f0a8244804859b12ffd7dee972754` | P22 | DESKTOP | P22 - Demo Clinic - Home - Desktop
- `2ac5e52f18bc40b187603880f1175f89` | P22 | MOBILE | P22 - Demo Clinic - Home - Mobile
- `38b42384631a423abd13f4f1d23ebd43` | P22 | DESKTOP | P22 - Demo Clinic - Pricing - Desktop
- `e6360fb33fba477bb2ad47f81234fae3` | P22 | MOBILE | P22 - Demo Clinic - Pricing - Mobile
- `61bcf76807744d898c859ed1078236b5` | P22 | DESKTOP | P22 - Demo Clinic - Services - Desktop
- `a0d5997b31c44203ba94de0708ca5737` | P22 | MOBILE | P22 - Demo Clinic - Services - Mobile
- `016440abad32484486a24c43d46a44f8` | P22 | DESKTOP | P22 - Juflona Clinic - Booking Entry - Desktop
- `bdc67d336bc64447bd0c02474b34c144` | P22 | MOBILE | P22 - Juflona Clinic - Booking Entry - Mobile
- `ea3abfe05bcc4e6a96eeba72dfea5d38` | P22 | DESKTOP | P22 - Juflona Clinic - Closed or Unavailable - Desktop
- `4df57c6409904d9aadd5841987aa315f` | P22 | MOBILE | P22 - Juflona Clinic - Closed or Unavailable - Mobile
- `32766a7879be4e539bd1ca8e352ef1d0` | P22 | DESKTOP | P22 - Juflona Clinic - Location - Desktop
- `4fb9866c196540199d4de109ba807726` | P22 | MOBILE | P22 - Juflona Clinic - Location - Mobile
- `0d8b62deaeb843a99f02f844a5d00ebd` | P22 | DESKTOP | P22 - Juflona Clinic - Not Found - Desktop
- `e4668b043467417295bdb7c41836a344` | P22 | MOBILE | P22 - Juflona Clinic - Not Found - Mobile
- `7780a4d599b441a6be7695ff72b84107` | P22 | DESKTOP | P22 - Juflona Clinic - Pricing - Desktop
- `775340af70d540bea3af6d7ed277402a` | P22 | MOBILE | P22 - Juflona Clinic - Pricing - Mobile
- `38abfa8767f4492ca11895b4f360effe` | P22 | DESKTOP | P22 - Juflona Public - About - Desktop
- `4aa46e7ddb424bc690e16a246de28c6b` | P22 | MOBILE | P22 - Juflona Public - About - Mobile
- `a1a662f6a5c342df8783414bff11a866` | P22 | DESKTOP | P22 - Juflona Public - Contact - Desktop
- `a1ceb17fd59a429a980d0b20ea42e83b` | P22 | MOBILE | P22 - Juflona Public - Contact - Mobile
- `c3586685e9f342f681f177d1036c18fc` | P22 | MOBILE | P22 - Juflona Public - Contact Success - Mobile
- `85d2b873d38f4196a9b17eb35e2bc4da` | P22 | DESKTOP | P22 - Juflona Public - Home - Desktop
- `6eb5bda4ca694e54b34693e3f86e986b` | P22 | MOBILE | P22 - Juflona Public - Home - Mobile
- `5adb49b9a1a940a581eeaca83524c7f1` | P22 | DESKTOP | P22 - Juflona Public - Patient Information - Desktop
- `62f5da19ec9047898ba0957faf21b408` | P22 | MOBILE | P22 - Juflona Public - Patient Information - Mobile
- `ab5711022ce84342b2e9ecfae818d78e` | P22 | DESKTOP | P22 - Juflona Public - Privacy - Desktop
- `45a9c24fcbfe4bbdb739452308397b95` | P22 | MOBILE | P22 - Juflona Public - Privacy - Mobile
- `2a7f744da5a44fc68c1f1bfeafba67ff` | P22 | DESKTOP | P22 - Juflona Public - Terms - Desktop
- `a789772602dc4e2bac342970ca833751` | P22 | MOBILE | P22 - Juflona Public - Terms - Mobile
- `47005f4888bc4e099a990fd65a6b8962` | P23 | DESKTOP | P23 - Juflona Public - Consultation Service Detail - Desktop
- `e6205fec780046f5bb006c669276a5c5` | P23 | MOBILE | P23 - Juflona Public - Consultation Service Detail - Mobile
- `75e6b6a7fbba46018ee8aab976f72d23` | P23 | DESKTOP | P23 - Juflona Public - Doctor Profile - Desktop
- `64cf5e42e55c4f9fbcebaf59a6940f5b` | P23 | MOBILE | P23 - Juflona Public - Doctor Profile - Mobile
- `dba48eeff55343cc95f1876c76388ce6` | P23 | DESKTOP | P23 - Juflona Public - Doctors - Desktop
- `dae36b9307f149d9ad4989a16eec975d` | P23 | MOBILE | P23 - Juflona Public - Doctors - Mobile
- `8a5894d5bc294a90ae7c8a83ec159230` | P23 | MOBILE | P23 - Juflona Public - Doctors States - Mobile
- `cf33b64cfa39421893a4413422a4e13a` | P23 | DESKTOP | P23 - Juflona Public - Informational Service Detail - Desktop
- `9f712f5799384727bb06b415618dd186` | P23 | MOBILE | P23 - Juflona Public - Informational Service Detail - Mobile
- `b887c39d2de947fda062d568b641f229` | P23 | DESKTOP | P23 - Juflona Public - Procedure Service Detail - Desktop
- `e54a6661157f441d93c94efad91a8858` | P23 | MOBILE | P23 - Juflona Public - Procedure Service Detail - Mobile
- `a59b166b17ff4c1b8514102aedaeef57` | P23 | DESKTOP | P23 - Juflona Public - Public Price Patterns - Desktop
- `c158c997d0db4d6bb2b228164441ab37` | P23 | MOBILE | P23 - Juflona Public - Service States - Mobile
- `3b7d3c9f3808441a8965c43b86c4ba44` | P23 | DESKTOP | P23 - Juflona Public - Services - Desktop
- `e0b4b500de47418cb4df06df8a65428b` | P23 | MOBILE | P23 - Juflona Public - Services - Mobile
- `e879dd50e2d64f6b93aa807efbdd1775` | P24 | DESKTOP | P24 - Juflona Booking - Appointment Entry - Desktop
- `e4e98986370640f2864a9aa2279ad878` | P24 | MOBILE | P24 - Juflona Booking - Appointment Entry - Mobile
- `d548137f807b40daaaaeff7fe2bcd0fa` | P24 | MOBILE | P24 - Juflona Booking - Availability States - Mobile
- `688a0eee8f014c7a8c999762b22be06d` | P24 | DESKTOP | P24 - Juflona Booking - Choose Doctor - Desktop
- `f9d67dd3a8c2457884c7e32bcbbf47e5` | P24 | MOBILE | P24 - Juflona Booking - Choose Doctor - Mobile
- `32812bec1d384d2ab5c9821f6865e85a` | P24 | DESKTOP | P24 - Juflona Booking - Choose Slot - Desktop
- `ece91cba8cff4381a9ef2e8ac97cb988` | P24 | MOBILE | P24 - Juflona Booking - Choose Slot - Mobile
- `a4096a26352040fd9d56be53a393fe4b` | P24 | DESKTOP | P24 - Juflona Booking - Consultation Type - Desktop
- `82cc9c49d881406592c6d877240731fd` | P24 | MOBILE | P24 - Juflona Booking - Consultation Type - Mobile
- `4dc9024e5d6f4267bf6b5a8c6c80aa08` | P24 | MOBILE | P24 - Juflona Booking - Form States - Mobile
- `c8dc05d3e0744fcf9f0030ccbe63a172` | P24 | MOBILE | P24 - Juflona Booking - Mobile Navigation and Summary Pattern - Mobile
- `e49351b2224449d2b86756b198e5ffb6` | P24 | DESKTOP | P24 - Juflona Booking - Patient Details - Desktop
- `b1e95d2173934e969b8d2b85346b82bd` | P24 | MOBILE | P24 - Juflona Booking - Patient Details - Mobile
- `14b98caed9cc4b4889d77763373a0e28` | P24 | DESKTOP | P24 - Juflona Booking - Progress Patterns - Desktop
- `12e5d96e8ac647f49d0cf66457da4b17` | P24 | DESKTOP | P24 - Juflona Booking - Request Submitted - Desktop
- `8f72ff10f79d421fade5a7ac6e6d875f` | P24 | MOBILE | P24 - Juflona Booking - Request Submitted - Mobile
- `1167937cacc4424f852368d5179a7e7c` | P24 | DESKTOP | P24 - Juflona Booking - Review - Desktop
- `5263923b759a4bc288c23c8ffe5c85b0` | P24 | MOBILE | P24 - Juflona Booking - Review - Mobile
- `bb250d93ee27449793869522211fb17c` | P24 | MOBILE | P24 - Juflona Booking - SMS Notification States - Mobile
- `6b916729502c43f08ef4ed61bf959159` | P25 | DESKTOP | P25 - Juflona Booking - Choose Procedure - Desktop
- `9526a27d8e5a4c8eb5a9bee842bee41b` | P25 | MOBILE | P25 - Juflona Booking - Choose Procedure - Mobile
- `bb4906f130374a72a21596d427c2af9d` | P25 | MOBILE | P25 - Juflona Booking - Preparation States - Mobile
- `2f99501abec942138637abb0934ed767` | P25 | DESKTOP | P25 - Juflona Booking - Procedure Confirmation Rules - Desktop
- `2d5d9db651e046eabb65fdbc89b676e2` | P25 | MOBILE | P25 - Juflona Booking - Procedure Form States - Mobile
- `ea6f77fad9444fa3b3f04cf5178f9c72` | P25 | DESKTOP | P25 - Juflona Booking - Procedure Information - Desktop
- `d033da337b5740f29b4681042ab4a99c` | P25 | MOBILE | P25 - Juflona Booking - Procedure Information - Mobile
- `ffc4c24bcadd4b919bdb573d7d06681c` | P25 | MOBILE | P25 - Juflona Booking - Procedure Mobile Summary Pattern - Mobile
- `2a64a22146ed4b2ca704d01d9cb18383` | P25 | DESKTOP | P25 - Juflona Booking - Procedure Patient Details - Desktop
- `d2c8f78719484d7ca4d443f844f83929` | P25 | MOBILE | P25 - Juflona Booking - Procedure Patient Details - Mobile
- `82a454047e064592b763896f815aa721` | P25 | DESKTOP | P25 - Juflona Booking - Procedure Progress Patterns - Desktop
- `e04f78111c6a43eb851a0db24cc2f001` | P25 | DESKTOP | P25 - Juflona Booking - Procedure Review - Desktop
- `6da5390fcac44722a37ae34f2ae82a11` | P25 | MOBILE | P25 - Juflona Booking - Procedure Review - Mobile
- `8c52142a20484c39928c8f3355174384` | P25 | DESKTOP | P25 - Juflona Booking - Procedure Slot - Desktop
- `3f05000a252b4732952b7dcbd70a9c06` | P25 | MOBILE | P25 - Juflona Booking - Procedure Slot - Mobile
- `9a4b08f02d2b4cc990eab7b16b4202aa` | P25 | MOBILE | P25 - Juflona Booking - Procedure SMS States - Mobile
- `1e23d5e9dfa649aab7746c966b255a5f` | P25 | DESKTOP | P25 - Juflona Booking - Procedure Submitted - Desktop
- `df69f70fb79c467b9aa9a7750520a241` | P25 | MOBILE | P25 - Juflona Booking - Procedure Submitted - Mobile
- `042c455322b94242b289e4c5cee37fe8` | P25 | MOBILE | P25 - Juflona Booking - Procedure Unavailable - Mobile
- `ef1d0961e88e43549af5361a5fb9320c` | P25 | MOBILE | P25 - Juflona Booking - Referral and Upload States - Mobile
- `72428671e0fa4317bad44d3ccf367ea8` | P25 | MOBILE | P25 - Juflona Booking - Referral Clarification - Mobile
- `7377b7ca51e049048c10e34af2950bac` | P25 | DESKTOP | P25 - Juflona Booking - Referral Requirements - Desktop
- `28dd3dae170e43f88902aa3a1f26cdfe` | P25 | MOBILE | P25 - Juflona Booking - Referral Requirements - Mobile
- `95f3a0fc88f7490fbd7d46e649e6b61e` | P25 | MOBILE | P25 - Juflona Booking - Resource Availability States - Mobile
- `e1a9a3b347b74171848d5639eaf48694` | P26 | DESKTOP | P26 - Juflona Booking - Booking Activity Pattern - Desktop
- `ca7cdd02f84f4a13abb5b324f3fb453f` | P26 | MOBILE | P26 - Juflona Booking - Booking Changed During Request - Mobile
- `df011954ab5248cfb5126f49d6187258` | P26 | DESKTOP | P26 - Juflona Booking - Booking Detail Cancelled - Desktop
- `48a852ead3284e44b9700df8a8875167` | P26 | MOBILE | P26 - Juflona Booking - Booking Detail Cancelled - Mobile
- `a0d78f650671453594236ad0ad1f727f` | P26 | DESKTOP | P26 - Juflona Booking - Booking Detail Completed - Desktop
- `bbe2c7c3fdf442b397ee457e287b1674` | P26 | MOBILE | P26 - Juflona Booking - Booking Detail Completed - Mobile
- `36db01f8f7d741a8ad3b91536834ab10` | P26 | DESKTOP | P26 - Juflona Booking - Booking Detail Confirmed - Desktop
- `5511e7ced0094007b300f58665fc9ccd` | P26 | MOBILE | P26 - Juflona Booking - Booking Detail Confirmed - Mobile
- `0a244c1b24f140368509e4f6f014a9fe` | P26 | DESKTOP | P26 - Juflona Booking - Booking Detail No-show - Desktop
- `e712f1d474024445899b4014f1d5c977` | P26 | MOBILE | P26 - Juflona Booking - Booking Detail No-show - Mobile
- `3b311f353e1745c0b020b400af92b0f5` | P26 | DESKTOP | P26 - Juflona Booking - Booking Detail Pending - Desktop
- `df7614f5b31347d4b3dff81928e5eadc` | P26 | MOBILE | P26 - Juflona Booking - Booking Detail Pending - Mobile
- `8e3e9337e8404c38b4f3e1dacdc7ba9c` | P26 | DESKTOP | P26 - Juflona Booking - Booking Detail Rescheduled - Desktop
- `189043d6d06d4819b06ea42e22e10035` | P26 | MOBILE | P26 - Juflona Booking - Booking Detail Rescheduled - Mobile
- `b18ffbdac9a644f8bea30734fc9368df` | P26 | DESKTOP | P26 - Juflona Booking - Booking Status Patterns - Desktop
- `766528bda7e548ac93d381129023802f` | P26 | DESKTOP | P26 - Juflona Booking - Cancellation Request - Desktop
- `81d1f26454324356b25cfec1db745491` | P26 | MOBILE | P26 - Juflona Booking - Cancellation Request - Mobile
- `4685ca7800dd477faa561270dfe01cba` | P26 | DESKTOP | P26 - Juflona Booking - Cancellation Review - Desktop
- `3be2c468e5e24ae592feb7c8b264b098` | P26 | MOBILE | P26 - Juflona Booking - Cancellation Review - Mobile
- `f510ec7d017e426e86e801932011d346` | P26 | DESKTOP | P26 - Juflona Booking - Cancellation Submitted - Desktop
- `f30239e9267242c0af4dfbaf44bb2d20` | P26 | MOBILE | P26 - Juflona Booking - Cancellation Submitted - Mobile
- `7b7546940db743839e4c4b11ae366dda` | P26 | MOBILE | P26 - Juflona Booking - Change Request States - Mobile
- `e4fa5d144ebb46cea06c4ef3a3af3e7b` | P26 | MOBILE | P26 - Juflona Booking - Lookup Error States - Mobile
- `ab96f1f72f444e9e943a1e6b2d539b46` | P26 | MOBILE | P26 - Juflona Booking - Lookup Progress - Mobile
- `8f9a5650ff3d4f7482de4f82bcee597b` | P26 | MOBILE | P26 - Juflona Booking - Mobile Booking Summary Pattern - Mobile
- `a8ad8c9b489149d592cd9ca53a525e14` | P26 | DESKTOP | P26 - Juflona Booking - My Booking - Desktop
- `a2b5c7ddfddc4c80a1ddb035748da72f` | P26 | MOBILE | P26 - Juflona Booking - My Booking - Mobile
- `4e84a1501ffa454b91221a4f32cfaabb` | P26 | MOBILE | P26 - Juflona Booking - Pending Preference Change - Mobile
- `e50e9dfeaf1a405bbf3f3c334ebbe039` | P26 | DESKTOP | P26 - Juflona Booking - Privacy and Lookup Rules - Desktop
- `97540ef2e0244f97a2974c50835276c3` | P26 | DESKTOP | P26 - Juflona Booking - Reschedule Request - Desktop
- `c016257b490d42ccb49bdb01e4228c2f` | P26 | MOBILE | P26 - Juflona Booking - Reschedule Request - Mobile
- `d968e9e9008d4987a5c4cdba86ab9a95` | P26 | DESKTOP | P26 - Juflona Booking - Reschedule Review - Desktop
- `15321bc4c76f4c08b61e59972aa7d44f` | P26 | MOBILE | P26 - Juflona Booking - Reschedule Review - Mobile
- `ba51a076b8ed49e0b4761f3068b56e41` | P26 | DESKTOP | P26 - Juflona Booking - Reschedule Submitted - Desktop
- `684f5190840549698bd9237caedeccb3` | P26 | MOBILE | P26 - Juflona Booking - Reschedule Submitted - Mobile
- `bb852d4218b9470981d9944eff62b1b4` | P27 | DESKTOP | P27 - Juflona Patient - Account Security - Desktop
- `e506a5ea31c54b0abd9d7bba96c83ed8` | P27 | DESKTOP | P27 - Juflona Patient - Booking Detail - Desktop
- `b3521756764f4a978c9244a2f5c3ae9e` | P27 | MOBILE | P27 - Juflona Patient - Booking Filters - Mobile
- `1bb70f70b2d442bda9ec2bcfe6c9cd08` | P27 | DESKTOP | P27 - Juflona Patient - Dashboard - Desktop
- `e4c2703d85764c2cbf2f91ab890d27e3` | P27 | MOBILE | P27 - Juflona Patient - Dashboard - Mobile
- `0ec2c722bd80493ea69102f61b9b36e3` | P27 | MOBILE | P27 - Juflona Patient - Dashboard Empty - Mobile
- `d499e36b667047e1998d38d66be6bbe2` | P27 | DESKTOP | P27 - Juflona Patient - Dashboard Multiple Bookings - Desktop
- `215624995dc145f7ad5f6adb14fd4ae6` | P27 | DESKTOP | P27 - Juflona Patient - Forgot Password - Desktop
- `9ff0dd371e8e49d38b82288c77699671` | P27 | MOBILE | P27 - Juflona Patient - Forgot Password - Mobile
- `1d86eebeee5645c784e68b3b6315d06b` | P27 | MOBILE | P27 - Juflona Patient - Link Guest Booking - Mobile
- `4bc683c012fc465681d21655ac3d1d01` | P27 | DESKTOP | P27 - Juflona Patient - Login - Desktop
- `7c24084776e64719be06423d42263e61` | P27 | MOBILE | P27 - Juflona Patient - Login - Mobile
- `795b6f3cce584467bdc369bd89f67419` | P27 | MOBILE | P27 - Juflona Patient - Login States - Mobile
- `e5078ea281eb4f29a284cf461b1c9b85` | P27 | MOBILE | P27 - Juflona Patient - Mobile Navigation Pattern - Mobile
- `b86ad20f46574f5cba98f3aa4909b597` | P27 | MOBILE | P27 - Juflona Patient - My Bookings - Mobile
- `1938bff7a7d54fa5a7d856457864d84d` | P27 | MOBILE | P27 - Juflona Patient - Notifications - Mobile
- `cc39b8bf074e408682da114b26ed8897` | P27 | MOBILE | P27 - Juflona Patient - Password Updated - Mobile
- `8405633077d0486f9622badff41899c9` | P27 | DESKTOP | P27 - Juflona Patient - Patient Data Boundaries - Desktop
- `5eceb58beaad489ba03f6750dee3896d` | P27 | DESKTOP | P27 - Juflona Patient - Portal Component Patterns - Desktop
- `210ee3ac1bbe43588ed84d2e663c6604` | P27 | MOBILE | P27 - Juflona Patient - Portal Offline State - Mobile
- `34350dec0e124a538024436ec728e2be` | P27 | DESKTOP | P27 - Juflona Patient - Profile - Desktop
- `3e22604b90844b499b98bed2dba8f81c` | P27 | MOBILE | P27 - Juflona Patient - Recovery Verification - Mobile
- `cc7711d9ca2947bba30e8bdde0c473de` | P27 | DESKTOP | P27 - Juflona Patient - Register - Desktop
- `588d1139d7b548c5856e9e34ce736bf9` | P27 | MOBILE | P27 - Juflona Patient - Register - Mobile
- `bc0fd174f14d4a3a8e78a57aad1564ee` | P27 | MOBILE | P27 - Juflona Patient - Registration States - Mobile
- `e1b3f826511f408e85c401d3a455f26d` | P27 | DESKTOP | P27 - Juflona Patient - Set New Password - Desktop
- `fb2dab64c9ed41f483ae83d4a7f20fe3` | P27 | MOBILE | P27 - Juflona Patient - Set New Password - Mobile
- `aebd18aad45b40ad90ebe164b87b282e` | P27 | MOBILE | P27 - Juflona Patient - Verification Success - Mobile
- `4cb2cd96dd3846dcbcd3504e45b90f47` | P27 | DESKTOP | P27 - Juflona Patient - Verify Phone - Desktop
- `fc27f3a94086412bbb546e19248ffc5d` | P27 | MOBILE | P27 - Juflona Patient - Verify Phone - Mobile
- `dbe4c18b488e4d12ba3ce57af8e49d9f` | SHARED_PUBLIC | MOBILE | ActiveClinic Public - Design System
- `5265ab7118c74f8b885de211483ef48c` | SHARED_PUBLIC | MOBILE | ActiveClinic Public - Header
- `e0ebb2af00e944e0b90a6400ea6093ba` | SHARED_PUBLIC | MOBILE | ActiveClinic Public - Mobile Navigation
- `83fe90078bb349efad00ea1138d795d2` | SHARED_PUBLIC | MOBILE | ActiveClinic Tenant Template - Configuration Reference
- `f8ab02fa6a8143debebc923644f62961` | SHARED_PUBLIC | MOBILE | ActiveClinic Tenant Template - Footer

### Project 2 (199)

- `8731b06bbfa747e98e05372c9aafb3e9` | P01 | DESKTOP | Access Restricted
- `9f3abb837fc3413aa128949afce0d8c4` | P01 | DESKTOP | Application Shell - Desktop
- `c54b0a846c054044aa0ca05194e320ef` | P01 | DESKTOP | Dashboard - Desktop
- `d19b0d5c33ae42e08ca767a11b12e591` | P01 | MOBILE | Dashboard - Mobile
- `8bf5c500e0d14014944618029212b2c9` | P01 | DESKTOP | Login - Desktop
- `6e3cbe4963c3428196b10d3bb27421d5` | P01 | MOBILE | Login - Mobile
- `87c5a80e0fcb40179c0d1ce7ea906762` | P01 | MOBILE | Navigation Drawer - Mobile
- `390032bf54ca44ee851673a4800f9af3` | P01 | DESKTOP | P01 – Dashboard – Desktop
- `8be466d48814446ab8bb087baacc6ec9` | P01 | MOBILE | P01 – Dashboard – Mobile
- `ca8a34cf1ecb4fefa2ed31fb9873ae45` | P01 | DESKTOP | P01 – Login – Desktop
- `026f619c35b04a5c8dde16eca9f7cf35` | P01 | MOBILE | P01 – Login – Mobile
- `9f55cec7eb884dbebc2e01c6fb0fe58e` | P01 | MOBILE | P01 – Navigation Drawer – Mobile
- `01b9125044634434b60223746b815b25` | P01 | DESKTOP | P01 – Shared Application Shell – Desktop
- `9b881d25874c41f9986246c61de32f41` | P01 | DESKTOP | P01 – Shared States – Desktop
- `91e41fecc2b64496893b52317b7ab985` | P02 | DESKTOP | P02 – Duplicate Patient Warning
- `0c3315d05469499d9b645bc7978001bf` | P02 | DESKTOP | P02 – Edit Patient Details – Desktop
- `4c6a5fe1c21c46709679f3707b8bf4dc` | P02 | MOBILE | P02 – Edit Patient Details – Mobile
- `5a6728d97b674200823562bb015e10ed` | P02 | DESKTOP | P02 – Patient List – Desktop
- `58bd5e04f71340ff8d067721eb5562d4` | P02 | MOBILE | P02 – Patient List – Mobile
- `1a15f0bf4e564c4993ca33aa2d578a58` | P02 | DESKTOP | P02 – Patient Profile Overview – Desktop
- `99eb441b48a24fa19855e76669c0da86` | P02 | MOBILE | P02 – Patient Profile Overview – Mobile
- `cd688e761cca43a1af299769014cb5f0` | P02 | DESKTOP | P02 – Patient Registration Success – Desktop
- `b9615559155d41d591dbb91e18c6a090` | P02 | MOBILE | P02 – Patient Registration Success – Mobile
- `f98b2e6f2a4a4953a4d811af7b3737a2` | P02 | DESKTOP | P02 – Patient Shared States – Desktop
- `3c113fe684604dfcaeb8f6b2c071a6ca` | P02 | DESKTOP | P02 – Print Patient Card Preview
- `e1ef5e5d8a1840bcbf1f4dc859f7b812` | P02 | DESKTOP | P02 – Register Patient Contact – Desktop
- `44fb7852e24f4f7f9f6b355a195fd250` | P02 | MOBILE | P02 – Register Patient Contact – Mobile
- `026d2e6c69cd4181a282213ba1bb55da` | P02 | DESKTOP | P02 – Register Patient Emergency and Medical – Desktop
- `7a495a471fed49b098de3c1605eda76e` | P02 | MOBILE | P02 – Register Patient Emergency and Medical – Mobile
- `40d2005b64864f35ac8df831ddae7084` | P02 | DESKTOP | P02 – Register Patient Identity – Desktop
- `8ef4b4d96f1f4224994d0c627bb7550e` | P02 | DESKTOP | P02 – Register Patient Review – Desktop
- `a6d496f38f8e4d5cb8eb4d91667c6db7` | P02 | MOBILE | P02 – Register Patient Review – Mobile
- `0fca19f233af43c49966e7eb62bccb02` | P03 | DESKTOP | P03 – Appointment Calendar – Desktop
- `327422c1b36747039e4026a17c5a2f33` | P03 | DESKTOP | P03 – Appointment Confirmation – Desktop
- `284e9f8cd6804b0eb0f50574e2f571d6` | P03 | DESKTOP | P03 – Appointment List – Desktop
- `480ecaba5258423e8711b1fdd2f39e1b` | P03 | MOBILE | P03 – Appointment List – Mobile
- `089aa8f266664446a8b38cb69d1fda48` | P03 | DESKTOP | P03 – Appointment Shared States – Desktop
- `a99c6ac04cf24f2c8ca349715c1829dc` | P03 | DESKTOP | P03 – Book Appointment – Desktop
- `b27eafc25bad4006868f3932d08bfed5` | P03 | DESKTOP | P03 – Cancel Appointment – Desktop
- `305d90143b0e4381b112bf6eb113f1c2` | P03 | DESKTOP | P03 – Create Walk-In Visit – Desktop
- `fd009ceba70f40b2ae1755b94220c64b` | P03 | DESKTOP | P03 – Doctor Schedule – Desktop
- `7d37e069c7644e7cb4c9b72349a0ccf7` | P03 | DESKTOP | P03 – Missed Appointments – Desktop
- `8dca6dbd36b840928e73d6674bbcb3ea` | P03 | DESKTOP | P03 – Patient Called – Desktop
- `9284064428f443b1a3a1504054827d91` | P03 | DESKTOP | P03 – Patient Check-In – Desktop
- `f7841548662446cfa8d70d0772d3fa9f` | P03 | DESKTOP | P03 – Patient Did Not Respond — Desktop
- `1fa99f4a358c47ffb858addae7095fe8` | P03 | DESKTOP | P03 – Queue Assignment – Desktop
- `bf9b846da6174bf995793b09e869cd30` | P03 | DESKTOP | P03 – Queue Stale Data Warning – Desktop
- `8b7173ba4ff94eb2a7d7e548b5f7253d` | P03 | DESKTOP | P03 – Reception Queue – Desktop
- `73499b0dfef446c99a908b1cc56252a5` | P03 | MOBILE | P03 – Reception Queue – Mobile
- `da39a3945ace4fac85cb12bd86f0cdc2` | P03 | DESKTOP | P03 – Reschedule Appointment – Desktop
- `9429b14e9ea243ad93aec4a486db93e9` | P03 | MOBILE | P03 – Reschedule Appointment – Mobile
- `e807a1354fdd418391496e69e5ac5f3e` | P03 | DESKTOP | P03 – Transfer Patient to Department – Desktop
- `99757cfd7d3747d490f00ac342faa519` | P04 | DESKTOP | P04 – Clinical Escalation Alert
- `b8d47f05a83c4959ac2d3d6ca83c7dfb` | P04 | DESKTOP | P04 – Clinical Queue – Desktop
- `16897ac752a94750bf00225db66ff768` | P04 | MOBILE | P04 – Clinical Queue – Mobile
- `5e4dbc7265ad4e17b060b1f641996db3` | P04 | DESKTOP | P04 – Consultation Workspace – Desktop
- `15c6c639c2b04bbda97b54f127c500f8` | P04 | MOBILE | P04 – Consultation Workspace – Mobile
- `969bbfbdf9634dbc8af598ec2277e92f` | P04 | DESKTOP | P04 – Create Laboratory Request
- `ee9bf2322b924cd79e86619a4635f702` | P04 | DESKTOP | P04 – Create Prescription
- `bc4ffd8f0e8c44f48f38cc15a069656a` | P04 | DESKTOP | P04 – Create Radiology Request
- `33a522e2f4eb45c9bdbede9ba34e0bee` | P04 | DESKTOP | P04 – Diagnosis Entry
- `7959616d1673403ba3bf6ff71d18a77b` | P04 | DESKTOP | P04 – Nursing Intake – Desktop
- `3c8f7b43b7984718acf661e381c1e6f7` | P04 | DESKTOP | P04 – Triage Assessment – Desktop
- `dede5e72277d413497e1f870f6b4a0e1` | P04 | DESKTOP | P04 – Vital Signs Entry – Desktop
- `83495a7aea6547ce873af695fcb5f604` | P05 | DESKTOP | P05 – Add Medicine
- `e4d4e37c175a458d9004e1240395ba63` | P05 | DESKTOP | P05 – Dispense Prescription – Desktop
- `ace4f11562b24515866b40c5594a18e6` | P05 | MOBILE | P05 – Dispense Prescription – Mobile
- `eeaf00f13f6f4e238da3aef30a556a57` | P05 | DESKTOP | P05 – Dispensing Completed – Desktop
- `00a95c467df2414fb8c6dea108170b04` | P05 | DESKTOP | P05 – Dispensing Confirmation
- `97138791742e4338a34811a6fd7e464d` | P05 | DESKTOP | P05 – Dispensing Review – Desktop
- `fcba0b2ed1334eacad9647e597f66959` | P05 | DESKTOP | P05 – Expiry Alerts – Desktop
- `553dd601642d41abb89cf4c7127c221a` | P05 | DESKTOP | P05 – Low Stock Alerts – Desktop
- `6c0795f36aef4fe3b634dc350d230672` | P05 | DESKTOP | P05 – Medicine Batch Detail
- `b5e534cf921d460c9774c2772ab688e9` | P05 | DESKTOP | P05 – Medicine Catalogue – Desktop
- `20a62e6f34ef422b8262750b0fe9788a` | P05 | DESKTOP | P05 – Medicine Detail – Desktop
- `1f079e7d3f9c464c8754fa09a09f2626` | P05 | DESKTOP | P05 – Medicine Inventory – Desktop
- `a0cb61de9f0f4eaa8d732d4cf143f090` | P05 | MOBILE | P05 – Medicine Inventory – Mobile
- `e237cd030fb241deb15ed8eb0f4f895e` | P05 | DESKTOP | P05 – Medicine Substitution – Desktop
- `c7c3ea1931f74acb845208dd09d0d63d` | P05 | DESKTOP | P05 – Partial Dispensing – Desktop
- `7cffba8bdac84abda7a8d31951d1948f` | P05 | MOBILE | P05 – Patient Medicine Instructions – Mobile
- `4d83f5c845ae4d91b805a1dfd6a7268d` | P05 | DESKTOP | P05 – Pharmacy Dashboard – Desktop
- `0f1976955fc14d8c97f1f8c728b4e1da` | P05 | DESKTOP | P05 – Pharmacy Purchase Orders – Desktop
- `2147643a82af4fb28a8368dcff867a75` | P05 | DESKTOP | P05 – Pharmacy Stock Adjustment
- `ce22d1c5de5f43ad8a458f57aa217fd3` | P05 | DESKTOP | P05 – Pharmacy Stock Transfer
- `99d29d4a8b204031b068e2b94dfeb95b` | P05 | DESKTOP | P05 – Prescription Clinical Review – Desktop
- `279be7b923664e449bd2001528e7c5ec` | P05 | MOBILE | P05 – Prescription Clinical Review – Mobile
- `2da2d7b7cd734161a9f8257c2256c6f3` | P05 | DESKTOP | P05 – Prescription Detail – Desktop
- `4f369d10d5654e68bf5a5c45d8ef7d78` | P05 | MOBILE | P05 – Prescription Detail – Mobile
- `5472760fda8148cf8611564236ae2247` | P05 | DESKTOP | P05 – Prescription Queue – Desktop
- `322c2b620c8e4b248fa5620881555d8b` | P05 | MOBILE | P05 – Prescription Queue – Mobile
- `b62126b07af7488094221932b9046193` | P05 | DESKTOP | P05 – Print Medicine Labels
- `a61dbccce82b43788dc347e25843ae07` | P05 | DESKTOP | P05 – Receive Pharmacy Stock – Desktop
- `a7649e64ba1e4eee8ca0bcb6a54594bd` | P05 | DESKTOP | P05 – Select Medicine Batch
- `f53854e6c18e45a094a0bab86e011e5b` | P06 | DESKTOP | P06 – Critical Result Alert
- `59ee5d74ff1f47eca3c6fb09413b7c09` | P06 | DESKTOP | P06 – Enter Laboratory Result – Desktop
- `41a0f1b3e1974e7ca26599bf8a37fc5f` | P06 | DESKTOP | P06 – Enter Radiology Report – Desktop
- `5b7b36f6af3b4735a81cca8cea77ee99` | P06 | DESKTOP | P06 – Laboratory Dashboard – Desktop
- `d53f9752db564b18b35fd761ecd73dd8` | P06 | MOBILE | P06 – Laboratory Dashboard – Mobile
- `51c3b93fec6e40aebc327a4998fb29ea` | P06 | DESKTOP | P06 – Laboratory Request Detail – Desktop
- `f8b17233f1f7457ea5fe5179207aa0d1` | P06 | DESKTOP | P06 – Laboratory Request Queue – Desktop
- `cd5ff44012dd4f0f88fc7ed60848fd37` | P06 | DESKTOP | P06 – Laboratory Worklist – Desktop
- `65286a85cc674df097dedf0890378a29` | P06 | DESKTOP | P06 – Radiology Dashboard – Desktop
- `070284f5583d43598111b2f6c35d0425` | P06 | MOBILE | P06 – Radiology Dashboard – Mobile
- `1fa6c921703145af96e47f7344b6cb62` | P06 | DESKTOP | P06 – Radiology Request Queue – Desktop
- `73c50eef2b10459793f12689cce27bb6` | P06 | DESKTOP | P06 – Specimen Collection – Desktop
- `5018c7fabf324fcebfbac85d7048f19a` | P06 | DESKTOP | P06 – Specimen Receipt – Desktop
- `b62c8afb0c59477d8bcfeaac7210987a` | P06 | DESKTOP | P06 – Specimen Rejected
- `1829edeb5d1741be9b6ae68a219ef7cc` | P07 | DESKTOP | P07 – Accounts Receivable – Desktop
- `be4481e8f31b459facf2294f73311181` | P07 | DESKTOP | P07 – Add Invoice Item
- `764d9a2a5a634150babb4daa1d6ebf13` | P07 | DESKTOP | P07 – Add Service – Desktop
- `954a9269255245dd9c6e375f8cbdd93b` | P07 | DESKTOP | P07 – Automatic Charge Review
- `f23ef64e307b44f780a19817ac04ebda` | P07 | MOBILE | P07 – Bank Transfer Payment – Mobile
- `ece0b9d1d9384f5d8c1e3b944f122e47` | P07 | DESKTOP | P07 – Billing Dashboard – Desktop
- `649bd7649ebf4c6eb787612f844a637e` | P07 | MOBILE | P07 – Billing Dashboard – Mobile
- `61922a4c2823426b8bcdc1f236c4072b` | P07 | DESKTOP | P07 – Card Payment – Desktop
- `02e8083e943d40deb9429b95a294ae30` | P07 | DESKTOP | P07 – Cash Count – Desktop
- `2d81fb326b6644bbb11cabd7a8156e6e` | P07 | DESKTOP | P07 – Cash Payment – Desktop
- `3c8ce685b0d14b74a04e1127e341f004` | P07 | MOBILE | P07 – Cash Payment – Mobile
- `d3e2ff001f694720b57371ef1a60d517` | P07 | DESKTOP | P07 – Cashier Closing – Desktop
- `792d5cbb6f234332a088399e4ccdd545` | P07 | DESKTOP | P07 – Cashier Dashboard – Desktop
- `1c02fc47e49c4c9990646d94a9876986` | P07 | DESKTOP | P07 – Cashier Shift – Desktop
- `0d8cd08aba454a2f971d6cc4389d98d2` | P07 | MOBILE | P07 – Cashier Shift – Mobile
- `1cd25ed2bb7a4504a63095a015bd823b` | P07 | DESKTOP | P07 – Cashier Shift History – Desktop
- `7dd49983c4a840b9980fb4a92d486b3c` | P07 | DESKTOP | P07 – Cashier Variance – Desktop
- `16318693e2874e79a8463d91c6ba63ad` | P07 | DESKTOP | P07 – Collections Work Queue – Desktop
- `513301ae28e1423ab7431e299cf45eee` | P07 | DESKTOP | P07 – Contact Patient for Payment – Desktop
- `08ed6ee0d02447bca5e94698080bca4f` | P07 | DESKTOP | P07 – Create Invoice – Desktop
- `b69484b43b074d6593f264d8df958d74` | P07 | DESKTOP | P07 – Create Price List – Desktop
- `92b97e715c6f4c308e61d3b39d66a1e9` | P07 | DESKTOP | P07 – Credit Note – Desktop
- `0f1fd946c97a48f99d34bd6ce8c8173c` | P07 | DESKTOP | P07 – Deposit Payment – Desktop
- `319d7fca2acb45a38432aa40a2e7cf30` | P07 | DESKTOP | P07 – Finalise Invoice
- `778eee4267984f32bcedcc38ca720fa0` | P07 | DESKTOP | P07 – Financial Correction Access Restricted
- `54163d0beee74c29990bd83b77480af5` | P07 | DESKTOP | P07 – Financial Correction History
- `a21d364d62f04c78ac8477971377eca9` | P07 | MOBILE | P07 – Financial Correction History – Mobile
- `9c0219d791da43df8a7abf41cf0809df` | P07 | DESKTOP | P07 – Insurance Payment Placeholder
- `5bde2c1a3d954ec396679abc3888abe5` | P07 | DESKTOP | P07 – Invoice Amendment
- `92af580dd9db4a3ea5734523b72287ba` | P07 | DESKTOP | P07 – Invoice Amendment Review – Desktop
- `b1a8b1855b9b4e268cd42359707d292e` | P07 | DESKTOP | P07 – Invoice Error State
- `06e7e10102184cc5a047e6d594f22fc2` | P07 | DESKTOP | P07 – Invoice History
- `c479c86234b840419e821c2c48329f4e` | P07 | DESKTOP | P07 – Invoice List – Desktop
- `40fcc3c9e03e42a68e2cadbd5c1a7685` | P07 | MOBILE | P07 – Invoice List – Mobile
- `713f3ebe920240c1a647af277278eb2f` | P07 | DESKTOP | P07 – Invoice Review – Desktop
- `2b3c2c4ef6ac4ee48a789d3a527fe9ec` | P07 | DESKTOP | P07 – Mobile Money Payment – Desktop
- `480e2d80a9f24f26b69b806d531fa913` | P07 | MOBILE | P07 – Mobile Money Payment – Mobile
- `0489fa5d1c37481ba159eeed1cd64155` | P07 | DESKTOP | P07 – NHIMA Claim Placeholder
- `c2f068812d0b45809a214d6ba8399ae5` | P07 | DESKTOP | P07 – Open Cashier Shift – Desktop
- `a84263ac97b8484698dc36d00b498ffa` | P07 | DESKTOP | P07 – Patient Billing Account – Desktop
- `c15d892b327848a6a2897ae3a08a5803` | P07 | MOBILE | P07 – Patient Billing Account – Mobile
- `3f50a00be7624b36af773c181b2c562c` | P07 | DESKTOP | P07 – Patient Collections Account – Desktop
- `9f422c33e30c450e9502126ba4012585` | P07 | DESKTOP | P07 – Patient Invoice – Desktop
- `3735516f4ecb4624ac715c6f77e7810b` | P07 | MOBILE | P07 – Patient Invoice – Mobile
- `02e1c1976d844c2cac63682e1853fa46` | P07 | DESKTOP | P07 – Payment Arrangement
- `2a0ae995f3e140da863e5aede4b2e71f` | P07 | DESKTOP | P07 – Payment Arrangement Review
- `bda1fbd1f6f441dba26719f451ee53de` | P07 | DESKTOP | P07 – Payment Completed – Desktop
- `45929cd32480420aaa5788be86e183f9` | P07 | DESKTOP | P07 – Payment History – Desktop
- `2665942082b4428dbcabf3ff3a40ec60` | P07 | DESKTOP | P07 – Payment Reversal Request
- `027b12b482934ef1a6f5dee02c888d26` | P07 | DESKTOP | P07 – Payment Reversal Review – Desktop
- `89ce6798cbca4723ae20aa61225411b2` | P07 | DESKTOP | P07 – Payment Review – Desktop
- `46cc5311173d48adb99cafe18ea331c2` | P07 | DESKTOP | P07 – Price Lists – Desktop
- `a953a043598945fdab38285c7dab7206` | P07 | DESKTOP | P07 – Price Override Approval
- `666806c4ea194d478e3baf2b7876950c` | P07 | DESKTOP | P07 – Print Patient Account Statement
- `914eee2a18f64fac81d2f0f69adc0cc8` | P07 | DESKTOP | P07 – Print Receipt
- `244dc0c45a23434bb2747468a699167b` | P07 | DESKTOP | P07 – Print Refund Receipt
- `a9654729a9a44e17832910a41f0154de` | P07 | DESKTOP | P07 – Record Payment – Desktop
- `8ca889a31c4e4ec1858c4dd4efc62731` | P07 | MOBILE | P07 – Record Payment – Mobile
- `d8f3108dfcda4ab9bf58472786d0484c` | P07 | DESKTOP | P07 – Refund Approval – Desktop
- `e52271b7be804e0ea95c825be9f977bd` | P07 | DESKTOP | P07 – Refund Completed – Desktop
- `b76f80fb0d164501b8108bea91813385` | P07 | DESKTOP | P07 – Refund Rejected
- `685fb829c50a45af995772909fb49fb7` | P07 | DESKTOP | P07 – Refund Request – Desktop
- `8461f1792a7a41209ae2abfe44db7b6a` | P07 | MOBILE | P07 – Refund Request – Mobile
- `438b1bb01f534492850ee8cb1253fcfe` | P07 | DESKTOP | P07 – Refund Review – Desktop
- `08921cb100ab462d8ec08c007f1bd895` | P07 | DESKTOP | P07 – Revenue Reports – Desktop
- `550a52476c254e258d58737fc1184bb6` | P07 | DESKTOP | P07 – Revenue Reports – Detailed
- `4ca894f70d6646eca246847cd8c39d6a` | P07 | DESKTOP | P07 – Service Catalogue – Desktop
- `1ab29b0691c04233a1c972ea99f24351` | P07 | MOBILE | P07 – Service Catalogue – Mobile
- `d5eb57a8319c4130be473f8dd23851d6` | P07 | DESKTOP | P07 – Service Detail – Desktop
- `bb0a290730a44a108be9295a76478785` | P07 | DESKTOP | P07 – Split Payment – Desktop
- `defb5bc8233046a4b9b1e86ebe740d1d` | P07 | DESKTOP | P07 – Unpaid Invoices – Desktop
- `9c5a3f10f1cb44e983af2a7c36403e3d` | P07 | MOBILE | P07 – Unpaid Invoices – Mobile
- `46a8b6c4f4b846e18ab586c3d6fae6ca` | P07 | DESKTOP | P07 – Write-Off Request Placeholder
- `c50a51a04a084f0badd48da9827aa11f` | P13 | DESKTOP | P13 – Account Security – Desktop
- `e132749f634c4fff818acf3f8e21c361` | P13 | DESKTOP | P13 – Active Sessions – Desktop
- `fc53eecc7d484fd5a131e01ef1127694` | P13 | DESKTOP | P13 – Add Staff Member – Desktop
- `f30963c89fad49ceabc2447dfd46f8f0` | P13 | DESKTOP | P13 – Invite Staff Member – Desktop
- `1db2777e1f444a0a90ca3174a4700ac2` | P13 | MOBILE | P13 – Phone Verification
- `8525edd4c31f46d6a6b5c6a233917559` | P13 | DESKTOP | P13 – Role Detail – Desktop
- `6b9cfcd190e14155ac4390d66d0cff76` | P13 | DESKTOP | P13 – Role Permission Matrix – Desktop
- `5307efdd84a4432b9f50ffc11f74728f` | P13 | DESKTOP | P13 – Roles and Access – Desktop
- `4abbdd1d655045e697922c3b209c9e15` | P13 | MOBILE | P13 – Set Initial Password
- `f0c821818ad04f5ca658defd08962564` | P13 | DESKTOP | P13 – Staff Access Dashboard – Desktop
- `23bc626a58964db894619615120d3ef2` | P13 | MOBILE | P13 – Staff Access Dashboard – Mobile
- `31600d2f5a32493b8bdd52658ab3591f` | P13 | MOBILE | P13 – Staff Account Activation
- `73fe1929482d4838b65bfd64acd406a8` | P13 | DESKTOP | P13 – Staff Directory – Desktop
- `2f150519b0a641399b4e24bf934397c1` | P13 | MOBILE | P13 – Staff Directory – Mobile
- `7f168bfd3ac64a2ca412f43990176e41` | P13 | DESKTOP | P13 – Staff Profile – Desktop
- `3d43526745534570bbe9cd22948be3c1` | P13 | DESKTOP | P13 – Suspend Staff Account
- `72357dec37864a5a926a1d2b5c551b16` | SHARED_INTERNAL | DESKTOP | Shared Error State
- `8a3f15c0be9c47efb192f206df104d5c` | SHARED_INTERNAL | DESKTOP | Shared Loading State
- `4d31c82537634b5f981c359662d224b3` | SHARED_INTERNAL | DESKTOP | Shared Offline State

---

## Integrity check

```
INVENTORY_INTEGRITY_CHECK
Project 1 discovered = 189
Project 1 inventory rows = 189
Project 2 discovered = 199
Project 2 inventory rows = 199
Combined discovered = 388
Combined inventory rows = 388
MATCH = true
```
