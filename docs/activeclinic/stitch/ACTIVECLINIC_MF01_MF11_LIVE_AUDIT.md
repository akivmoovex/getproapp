# ActiveClinic MF01–MF11 live Stitch delta audit

**Verdict:** `ACTIVECLINIC_MF01_MF11_AUDIT_COMPLETE`  
**Inspected:** 2026-08-21 via live Stitch MCP `get_project` + `list_screens` + downloaded HTML (not hotlinked)  
**Stitch project:** [ActiveClinic Universal Authentication Interface](https://stitch.withgoogle.com/projects/10611909237747031838)  
**Project ID:** `10611909237747031838`  
**Does not overwrite:** `ACTIVECLINIC_EXACT_PARITY_AUDIT.md` (ORIGINAL_49) or the historical 96-screen notes in `ACTIVECLINIC_STITCH_83_SCREEN_INVENTORY.md`

---

## STAGE 0 — Safety

| Check | Value |
|-------|--------|
| Branch | `V7` |
| Local SHA | `73ce85216ab24d2318ae1751f616e53a258c724d` |
| `origin/V7` SHA | `73ce85216ab24d2318ae1751f616e53a258c724d` |
| Ahead / behind | `0` / `0` |
| Working tree (start) | clean |
| Deployment profile | `moovex-platform-testing` |
| Environment | `testing` |
| Database identity | `moovex-platform-v7` |
| Hosted SHA | `73ce85216ab2` on `activeclinic.pronline.org` and `blessboard.pronline.org` (**hosted current = YES**) |

```text
PRODUCTION TOUCHED: NO
MAIN MERGED: NO
SCHEMA CHANGED: NO
OTP IMPLEMENTED: NO
SSO IMPLEMENTED: NO
```

---

## STAGE 1 — Live inventory lock

```text
updateTime: 2026-08-21T00:22:14.887432Z
total screens: 100
original: 49   (ACW 14 + kebab-case auth 7 + MW 28)
MW: 28
MF: 51         (MF01–MF10 47 + MF11 4)
other: 0
```

Previous lock (`ACTIVECLINIC_STITCH_83_SCREEN_INVENTORY.md`): `updateTime=2026-08-21T00:11:00.219945Z`, **96** screens.

Delta vs that lock: **+4 screens, all MF11**. No ORIGINAL / MW / MF01–MF10 IDs removed or renamed.

| Family | Count | Desktop | Mobile | Other states |
| ------ | ----: | ------: | -----: | -----------: |
| ORIGINAL ACW | 14 | 7 | 7 | 0 |
| ORIGINAL auth (`active-clinic-03-*`) | 7 | 4 | 3 | 0 |
| MW01 | 4 | 2 | 2 | 0 |
| MW02 | 4 | 3 | 1 | 0 |
| MW03 | 4 | 4 | 0 | 0 |
| MW04 | 4 | 4 | 0 | 0 |
| MW05 | 4 | 3 | 1 | 0 |
| MW06 | 4 | 4 | 0 | 0 |
| MW07 | 4 | 3 | 1 | 0 |
| MF01 | 5 | 3 | 2 | 0 |
| MF02 | 4 | 3 | 1 | 0 |
| MF03 | 8 | 4 | 4 | 0 |
| MF04 | 7 | 4 | 3 | 0 |
| MF05 | 4 | 2 | 2 | 0 |
| MF06 | 4 | 2 | 2 | 0 |
| MF07 | 2 | 1 | 1 | 0 |
| MF08 | 6 | 3 | 3 | 0 |
| MF09 | 2 | 1 | 1 | 0 |
| MF10 | 5 | 4 | 1 | missing `04, 06, 08` still absent |
| MF11 | 4 | 2 | 2 | 0 |
| OTHER | 0 | 0 | 0 | 0 |
| **Total** | **100** | **63** | **37** | **0** |

### Complete live MF list

| Stitch ID | Exact Stitch name | Device | Family |
|-----------|-------------------|--------|--------|
| `9e85a3391ebd4695a045a974d73d14f9` | MF01-01 Login Desktop | Desktop | MF01 |
| `f435d25c1264415e8dfca6191466611c` | MF01-02 Login Mobile | Mobile | MF01 |
| `1690fc1ce82a4aaa8289d83659e70366` | MF01-03 Login Error Desktop | Desktop | MF01 |
| `7a24bd602d2c48d5826e9048dbe27daa` | MF01-04 Login Error Mobile | Mobile | MF01 |
| `a6dbf4e5e83e459ea95c50826ca30c34` | MF01-05 Signing In Loading | Desktop | MF01 |
| `2f202c49fda04f1e89b52efa2551ead0` | MF02-01 Clinic Selector Desktop | Desktop | MF02 |
| `c31ac73459774d6c9ea384a901a19e92` | MF02-02 Clinic Selector Mobile | Mobile | MF02 |
| `6a9ab5333ac9417c8705c5a880d11431` | MF02-03 No Clinic Access | Desktop | MF02 |
| `d955b5cbce9f48a8a3be639123a8c6f4` | MF02-04 Clinic Access Disabled | Desktop | MF02 |
| `be4c228d874c4fdeaee82c28eaed7e81` | MF03-01 Register Clinic Step 1 Desktop | Desktop | MF03 |
| `8d1074d16e6348c4a7da55df89133688` | MF03-02 Register Clinic Step 1 Mobile | Mobile | MF03 |
| `7fac8f8297c34a1b8be5355c769a9227` | MF03-03 Register Clinic Step 2 Desktop | Desktop | MF03 |
| `2cc66d42e4be422ca1c5feeea963f145` | MF03-04 Register Clinic Step 2 Mobile | Mobile | MF03 |
| `3792389fcddc4c81915f316a1504634e` | MF03-05 Registration Review Desktop | Desktop | MF03 |
| `b4033934e522483698aa86d6fd52fe99` | MF03-06 Registration Review Mobile | Mobile | MF03 |
| `49217e086a5a45329a893bc775fede6d` | MF03-07 Registration Success Desktop | Desktop | MF03 |
| `f90550e4e0924997a8cada0a034e76d7` | MF03-08 Registration Success Mobile | Mobile | MF03 |
| `5a4fbca37976482d9294d70885235fa9` | MF04-01 Forgot Password Desktop | Desktop | MF04 |
| `50e275a59f80463d996fcb29d2b6273d` | MF04-02 Forgot Password Mobile | Mobile | MF04 |
| `e7f833d56af049e3b0306d81c9761b52` | MF04-03 Verification Code Desktop | Desktop | MF04 |
| `c755d15f21144bcba48ccb5579e3dc07` | MF04-04 Verification Code Mobile | Mobile | MF04 |
| `9ab165fac045427d9679def4f38049c3` | MF04-05 Reset Password Desktop | Desktop | MF04 |
| `1e56748ce7f843e2916ab33e06692d9e` | MF04-06 Reset Password Mobile | Mobile | MF04 |
| `c2546a84104946619e416e26fd649789` | MF04-07 Password Reset Success | Desktop | MF04 |
| `46639010324140f89bf2c954950675a7` | MF05-01 Welcome to ActiveClinic Desktop | Desktop | MF05 |
| `9576cbdeac1b43faa5c10313fe633618` | MF05-02 Welcome to ActiveClinic Mobile | Mobile | MF05 |
| `e8694bbb106046d485a48040f2d6b94f` | MF05-03 Clinic Setup Checklist Desktop | Desktop | MF05 |
| `df9f49e696714d9f810e5d66b7577237` | MF05-04 Clinic Setup Checklist Mobile | Mobile | MF05 |
| `e61dfb582bc34ff585e3acb8aa60b0d3` | MF06-01 Website Welcome Desktop | Desktop | MF06 |
| `1d3629ccea8e40d0b6720a653442c98b` | MF06-02 Website Welcome Mobile | Mobile | MF06 |
| `e12e282fbf784eff998dc5bcaf23ad13` | MF06-03 Website Setup Checklist Desktop | Desktop | MF06 |
| `8522ea2d33ce4f748554f5535d004264` | MF06-04 Website Setup Checklist Mobile | Mobile | MF06 |
| `f3363068e1f94e619c83a44821045461` | MF07-01 Invite Staff Desktop | Desktop | MF07 |
| `44c7c2fe9fff497980f9ca5b903cb785` | MF07-02 Invite Staff Mobile | Mobile | MF07 |
| `b17405de3052471688b455a66de53805` | MF08-01 Patient Registration Desktop | Desktop | MF08 |
| `2cf8f6ff9e9242a3a114ff7c2d8108f3` | MF08-02 Patient Registration Mobile | Mobile | MF08 |
| `449d124d305845c69c93ced67fb4f6ea` | MF08-03 Verification Desktop | Desktop | MF08 |
| `cbaed824e43d40f980f1af298db6cd5f` | MF08-04 Verification Mobile | Mobile | MF08 |
| `7a6121f70744431a893a94130692d042` | MF08-05 Health Profile Setup Desktop | Desktop | MF08 |
| `d9a0fc3847264ce08f336e0e3bfbfd7a` | MF08-06 Health Profile Setup Mobile | Mobile | MF08 |
| `f96a31fbffa14b1781a24cfa44cb6e7d` | MF09-01 Patient Dashboard Desktop | Desktop | MF09 |
| `9c0157d10d6f439f9892f89848f5d19c` | MF09-02 Patient Dashboard Mobile | Mobile | MF09 |
| `2e77628dd3214f5bb8b2ed046be10aa8` | MF10-01 Select Service Desktop | Desktop | MF10 |
| `9ea79123a4e04082ac9e478a438fe047` | MF10-02 Select Service Mobile | Mobile | MF10 |
| `897ed261d2dd46e3b4af8570ea12ecf2` | MF10-03 Select Provider Desktop | Desktop | MF10 |
| `270bca2e285c43188fafd39b5d83f28f` | MF10-05 Select Time Desktop | Desktop | MF10 |
| `e9a21fe4a41045f0a1cd2e436a677866` | MF10-07 Review & Confirm Desktop | Desktop | MF10 |
| `6f642463ecaa46ff940168c3860a8656` | MF11-01 Medical Records Desktop | Desktop | MF11 |
| `b1a750008b72460c9098696ff8590578` | MF11-02 Medical Records Mobile | Mobile | MF11 |
| `52a261801b9149c788445e50eab8b379` | MF11-03 Lab Result Detail Desktop | Desktop | MF11 |
| `5f5c82c6ede64be892ca6757ecd0823c` | MF11-04 Lab Result Detail Mobile | Mobile | MF11 |

---

## STAGE 2 — Delta vs previous MF01–MF10 audit

Previous understanding (96-screen audit): MF01 staff login, MF02 clinic selector, MF03 register clinic, MF04 password recovery, MF05 clinic setup, MF06 website setup, MF07 staff invitation, MF08 patient registration/profile, MF09 patient dashboard, MF10 public/portal booking.

| Family | Previous understanding | Current understanding | Delta |
| ------ | ---------------------- | --------------------- | ----- |
| MF01 | Staff login / error / signing-in | Same screens, same IDs. **Now implemented** on `/login`. | `UNCHANGED` Stitch; V7 status moved to implemented |
| MF02 | Clinic selector + empty/disabled | Same IDs. **Now implemented** on `/login/select-organization` + lifecycle. | `UNCHANGED` Stitch |
| MF03 | Register-clinic wizard (8) | Same IDs, same 3-step + review + success. License still only on review, not collected. | `UNCHANGED` |
| MF04 | Forgot / OTP / reset | Same IDs. OTP still present. V7 still token-link. | `UNCHANGED` Stitch; OTP remains `FUNCTIONAL_GAP_OTP` |
| MF05 | Welcome + clinic setup checklist | Same IDs. Checklist: clinic details, departments, staff, services, website, publish. | `UNCHANGED` |
| MF06 | Website welcome + CMS checklist | Same IDs. Still ClinicEditor chrome + Theme tab + staging URL. | `UNCHANGED` |
| MF07 | Invite staff modal | Same IDs. Copy now says “invitation link” but CTA remains “Send Invitation”. | `UNCHANGED` (copy nuance only) |
| MF08 | Patient register + OTP + health profile | Same IDs. ClinicBuilder brand, Google/Apple, MFA, insurance/DOB/sex. | `UNCHANGED` |
| MF09 | Patient dashboard with EHR widgets | Same IDs. Telehealth, labs, meds, messages, billing still in composition. | `UNCHANGED` |
| MF10 | Booking wizard, incomplete pair set | Same 5 IDs. Still missing mobile `04, 06, 08`. Copay/insurance still on review. | `UNCHANGED` |
| MF11 | **Did not exist** | Patient medical-records list + lab-result detail (HealLink brand). | `SCREEN_ADDED` + `FUNCTIONAL_SCOPE_CHANGED` (new family) |

```text
added: MF11-01, MF11-02, MF11-03, MF11-04
removed: none
renamed: none
redesigned: none detected (MF01–MF10 IDs and titles identical)
workflow changed: none in MF01–MF10; MF11 is a new patient EHR drill-down
```

Checked the public ecosystem project `17813606734422395399` (189 screens): **P27 Juflona Patient** remains the booking/profile/data-boundaries portal. It has **no** Medical Records / Lab Result screens. MF11 is unique to project `10611909237747031838`.

---

## STAGE 3 — MF11 deep analysis

MF11 is **not** inferred from the prefix. Live HTML:

### MF11-01 — Medical Records Desktop

| Field | Evidence |
|-------|----------|
| Stitch ID | `6f642463ecaa46ff940168c3860a8656` |
| Name | MF11-01 Medical Records Desktop |
| Device | Desktop |
| Primary actor | **Patient** (nav: Dashboard, Health Records, Lab Results, Appointments, Messages, Settings, Help) |
| Entry point | Patient portal “Health Records” |
| Navigation context | Logged-in patient portal shell (HealLink Portal) |
| Domain object | Patient clinical document / result |
| Workflow step | List / filter / paginate records |
| Visible actions | Export All, Upload Record, search, filters (All / Lab Results / Clinical Notes / Imaging / Immunizations), open row, Previous/Next |
| Required data | Record name, provider/clinic, date, status, type; fake counts (142 records) |
| Implied backend | Patient-accessible clinical archive, document upload, PDF export, lab/imaging/immunization/notes stores |

### MF11-02 — Medical Records Mobile

| Field | Evidence |
|-------|----------|
| Stitch ID | `b1a750008b72460c9098696ff8590578` |
| Name | MF11-02 Medical Records Mobile |
| Device | Mobile |
| Actor / entry | Same patient portal; bottom nav Home / Records / Labs / Chat |
| Visible actions | Filters All / Lab Results / Imaging / **Prescriptions** / **Visit Summaries** (not the same filter set as desktop) |
| Implied backend | Same archive, plus prescriptions |

**Inconsistency:** desktop filters Clinical Notes + Immunizations; mobile filters Prescriptions + Visit Summaries. Design exploration, not a spec.

### MF11-03 — Lab Result Detail Desktop

| Field | Evidence |
|-------|----------|
| Stitch ID | `52a261801b9149c788445e50eab8b379` |
| Name | MF11-03 Lab Result Detail Desktop |
| Device | Desktop |
| Actor | Patient |
| Entry | Drill-down from Health Records / Lab Results |
| Domain object | Lab panel result (Comprehensive Metabolic Panel) |
| Workflow step | View resulted panel |
| Visible actions | Share with Provider, Download PDF |
| Required data | Collected datetime, ordering clinician, in/out of range counts, trend chart, markers with reference ranges, clinician interpretation note |
| Implied backend | Released lab results, reference ranges, trending, PDF, share-to-provider |

### MF11-04 — Lab Result Detail Mobile

| Field | Evidence |
|-------|----------|
| Stitch ID | `5f5c82c6ede64be892ca6757ecd0823c` |
| Name | MF11-04 Lab Result Detail Mobile |
| Device | Mobile |
| Same workflow | Back, share, download PDF |
| Data inconsistency | Desktop Glucose **High 112**; mobile Glucose **In Range 92**. Same panel, different dummy values. |

### MF11 family classification

```text
NEW_MODULE
+ DESIGN_EXPLORATION   (HealLink Portal branding; filter/value mismatches)
+ CLINICAL_EHR_EXPANSION
```

Not:

- `EXISTING_MODULE_NEW_UI` — V7 patient portal is bookings/profile only (`views/activeclinic/patient/dashboard.ejs`). Staff lab lives at `/app/diagnostics/laboratory` for `activeclinic.lab.result`, a different actor.
- `EXISTING_ROUTE_NEW_STATE` — no patient `/records` or `/labs` route.
- `RESPONSIVE_VARIANT` as the family (only the mobile pair members are).
- `DUPLICATE` of P27 — P27 dashboard is appointments/bookings and includes **Patient Data Boundaries** (“does not expose charts, lab results, or pharmacy”).

**Product conflict:** Implementing MF11 would reverse the P27 / V7 data-boundaries contract.

**Do not implement MF11** unless product explicitly approves a patient-facing clinical results portal (schema, release workflow, RBAC, PDF, sharing). That is not visual parity.

---

## STAGE 4 — Screen-by-screen classification (MF01–MF11)

Exactly one primary class. `UNCLEAR = 0`.

| Stitch ID | Name | Family | Classification | Reason |
| --------- | ---- | ------ | -------------- | ------ |
| `9e85a339…` | MF01-01 Login Desktop | MF01 | `ALREADY_IMPLEMENTED_CURRENT_UI` | Phase A restyle of `/login`. |
| `f435d25c…` | MF01-02 Login Mobile | MF01 | `RESPONSIVE_VARIANT` | Same route. |
| `1690fc1c…` | MF01-03 Login Error Desktop | MF01 | `ALREADY_IMPLEMENTED_CURRENT_UI` | `/login` error state. |
| `7a24bd60…` | MF01-04 Login Error Mobile | MF01 | `RESPONSIVE_VARIANT` | Same route. |
| `a6dbf4e5…` | MF01-05 Signing In Loading | MF01 | `ALREADY_IMPLEMENTED_CURRENT_UI` | Overlay, not a standalone page. |
| `2f202c49…` | MF02-01 Clinic Selector Desktop | MF02 | `ALREADY_IMPLEMENTED_CURRENT_UI` | `/login/select-organization`. |
| `c31ac734…` | MF02-02 Clinic Selector Mobile | MF02 | `RESPONSIVE_VARIANT` | Same route. |
| `6a9ab533…` | MF02-03 No Clinic Access | MF02 | `ALREADY_IMPLEMENTED_CURRENT_UI` | Dedicated empty-membership state. |
| `d955b5cb…` | MF02-04 Clinic Access Disabled | MF02 | `ALREADY_IMPLEMENTED_CURRENT_UI` | Lifecycle / ineligible membership. |
| `be4c228d…` | MF03-01 Register Step 1 Desktop | MF03 | `EXISTING_FUNCTION_DIFFERENT_UI` | `/register-clinic` clinic step. |
| `8d1074d1…` | MF03-02 Register Step 1 Mobile | MF03 | `RESPONSIVE_VARIANT` | |
| `7fac8f82…` | MF03-03 Register Step 2 Desktop | MF03 | `EXISTING_FUNCTION_DIFFERENT_UI` | Administrator step. |
| `2cc66d42…` | MF03-04 Register Step 2 Mobile | MF03 | `RESPONSIVE_VARIANT` | |
| `3792389f…` | MF03-05 Review Desktop | MF03 | `EXISTING_FUNCTION_DIFFERENT_UI` | Review; extra License ID / CMO role. |
| `b4033934…` | MF03-06 Review Mobile | MF03 | `RESPONSIVE_VARIANT` | |
| `49217e08…` | MF03-07 Success Desktop | MF03 | `EXISTING_FUNCTION_DIFFERENT_UI` | `/register-clinic/success`. |
| `f90550e4…` | MF03-08 Success Mobile | MF03 | `RESPONSIVE_VARIANT` | |
| `5a4fbca3…` | MF04-01 Forgot Desktop | MF04 | `ALREADY_IMPLEMENTED_CURRENT_UI` | `/forgot-password` (link, not code). |
| `50e275a5…` | MF04-02 Forgot Mobile | MF04 | `RESPONSIVE_VARIANT` | |
| `e7f833d5…` | MF04-03 Verification Code Desktop | MF04 | `UNSUPPORTED_CONCEPT` | 6-digit OTP. |
| `c755d15f…` | MF04-04 Verification Code Mobile | MF04 | `RESPONSIVE_VARIANT` | Device of unsupported OTP. |
| `9ab165fa…` | MF04-05 Reset Desktop | MF04 | `ALREADY_IMPLEMENTED_CURRENT_UI` | `/reset-password/:token`. |
| `1e56748c…` | MF04-06 Reset Mobile | MF04 | `RESPONSIVE_VARIANT` | |
| `c2546a84…` | MF04-07 Reset Success | MF04 | `ALREADY_IMPLEMENTED_CURRENT_UI` | `/reset-password/success`. |
| `46639010…` | MF05-01 Welcome Desktop | MF05 | `EXISTING_ROUTE_NEW_STATE` | First-run interstitial; V7 goes to `/app` or `/app/onboarding`. |
| `9576cbde…` | MF05-02 Welcome Mobile | MF05 | `RESPONSIVE_VARIANT` | |
| `e8694bbb…` | MF05-03 Setup Checklist Desktop | MF05 | `EXISTING_FUNCTION_DIFFERENT_UI` | `/app/onboarding`. |
| `df9f49e6…` | MF05-04 Setup Checklist Mobile | MF05 | `RESPONSIVE_VARIANT` | |
| `e61dfb58…` | MF06-01 Website Welcome Desktop | MF06 | `EXISTING_FUNCTION_DIFFERENT_UI` | `/app/settings/website` unpublished hub. |
| `1d3629cc…` | MF06-02 Website Welcome Mobile | MF06 | `RESPONSIVE_VARIANT` | |
| `e12e282f…` | MF06-03 Website Checklist Desktop | MF06 | `EXISTING_FUNCTION_DIFFERENT_UI` | CMS hub tasks; Theme is extra. |
| `8522ea2d…` | MF06-04 Website Checklist Mobile | MF06 | `RESPONSIVE_VARIANT` | |
| `f3363068…` | MF07-01 Invite Staff Desktop | MF07 | `EXISTING_FUNCTION_DIFFERENT_UI` | `/app/staff` + invite. |
| `44c7c2fe…` | MF07-02 Invite Staff Mobile | MF07 | `RESPONSIVE_VARIANT` | |
| `b17405de…` | MF08-01 Patient Registration Desktop | MF08 | `EXISTING_FUNCTION_DIFFERENT_UI` | `/clinics/:clinicKey/patient/register` + unsupported SSO. |
| `2cf8f6ff…` | MF08-02 Patient Registration Mobile | MF08 | `RESPONSIVE_VARIANT` | |
| `449d124d…` | MF08-03 Verification Desktop | MF08 | `UNSUPPORTED_CONCEPT` | Patient MFA/OTP. |
| `cbaed824…` | MF08-04 Verification Mobile | MF08 | `RESPONSIVE_VARIANT` | |
| `7a6121f7…` | MF08-05 Health Profile Desktop | MF08 | `EXISTING_FUNCTION_DIFFERENT_UI` | Partial overlap with portal profile; insurance/DOB/sex extra. |
| `d9a0fc38…` | MF08-06 Health Profile Mobile | MF08 | `RESPONSIVE_VARIANT` | |
| `f96a31fb…` | MF09-01 Patient Dashboard Desktop | MF09 | `EXISTING_FUNCTION_DIFFERENT_UI` | Portal dashboard exists; EHR widgets extra. |
| `9c0157d1…` | MF09-02 Patient Dashboard Mobile | MF09 | `RESPONSIVE_VARIANT` | |
| `2e77628d…` | MF10-01 Select Service Desktop | MF10 | `EXISTING_FUNCTION_DIFFERENT_UI` | `/clinics/:clinicKey/book`. |
| `9ea79123…` | MF10-02 Select Service Mobile | MF10 | `RESPONSIVE_VARIANT` | |
| `897ed261…` | MF10-03 Select Provider Desktop | MF10 | `EXISTING_FUNCTION_DIFFERENT_UI` | `/book/doctor`. |
| `270bca2e…` | MF10-05 Select Time Desktop | MF10 | `EXISTING_FUNCTION_DIFFERENT_UI` | `/book/slot`. |
| `e9a21fe4…` | MF10-07 Review & Confirm Desktop | MF10 | `EXISTING_FUNCTION_DIFFERENT_UI` | `/book/review`; copay/insurance extra. |
| `6f642463…` | MF11-01 Medical Records Desktop | MF11 | `NEW_FUNCTIONALITY` | No patient records route. |
| `b1a75000…` | MF11-02 Medical Records Mobile | MF11 | `RESPONSIVE_VARIANT` | Plus filter mismatch. |
| `52a26180…` | MF11-03 Lab Result Detail Desktop | MF11 | `NEW_FUNCTIONALITY` | No patient lab-detail route. |
| `5f5c82c6…` | MF11-04 Lab Result Detail Mobile | MF11 | `RESPONSIVE_VARIANT` | Dummy values disagree with desktop. |

Classification totals (51 MF screens):

```text
ALREADY_IMPLEMENTED_CURRENT_UI: 9
ALREADY_IMPLEMENTED_OLDER_UI: 0
EXISTING_FUNCTION_DIFFERENT_UI: 15
EXISTING_ROUTE_NEW_STATE: 1
RESPONSIVE_VARIANT: 22
VISUAL_VARIANT: 0
NEW_FUNCTIONALITY: 2
UNSUPPORTED_CONCEPT: 2
DUPLICATE_STITCH_SCREEN: 0
DO_NOT_IMPLEMENT: 0   (OTP/SSO/EHR are UNSUPPORTED or extra widgets on EXISTING screens)
UNCLEAR: 0
```

---

## STAGE 5 — Map to current V7

| Family / screens | Route | Controller | Service | Template | JS / CSS | Data model | RBAC | Match |
| ---------------- | ----- | ---------- | ------- | -------- | -------- | ---------- | ---- | ----- |
| MF01 | `GET/POST /login` | `activeClinicAuthRoutes.js` | `authenticateActiveClinicIdentity.js` | `auth/login.ejs` + `partials/auth-mf-*` | `ac-auth.js` / `ac-auth.css` | platform identity | public | `FUNCTION_COMPLETE` (visual variances accepted) |
| MF02 | `GET /login/select-organization` | same | `activeClinicLoginEligibility.js` | `auth/select-organization.ejs`, `lifecycle-state.ejs` | same | org membership | session | `FUNCTION_COMPLETE` |
| MF03 | `GET/POST /register-clinic`, `/register-clinic/success` | `activeClinicPublicRoutes.js` | `submitClinicRegistrationService.js` | `public/register-clinic*.ejs` | `ac-public.js` / `acw-platform.css` | `clinic_registration_applications` | public | `PARTIAL_FUNCTION` |
| MF04 forgot/reset | `/forgot-password`, `/reset-password/:token` | `activeClinicLifecycleRoutes.js` | password recovery service | `auth/forgot-password*.ejs`, `reset-password*.ejs` | `ac-auth.*` | identity action tokens | public | `FUNCTION_COMPLETE` minus OTP |
| MF04 OTP | **none** | — | — | — | — | — | — | `NO_MATCH` |
| MF05 welcome | **none dedicated** | — | — | — | — | — | — | `VISUAL_ONLY` |
| MF05 checklist | `GET /app/onboarding` | `activeClinicAppRoutes.js` | `activeClinicOnboardingAdapter.js` | `app/onboarding-content.ejs` | app shell | `organization_onboarding_progress` + live HCO facts | `activeclinic.access` | `PARTIAL_FUNCTION` |
| MF06 | `GET /app/settings/website` + CMS | `activeClinicSettingsRoutes.js`, `activeClinicWebsiteCmsRoutes.js` | `clinicWebsiteCmsService.js` | `settings-website-content.ejs` | `website-cms.*` | `website_instances` | `website.view` / `website.edit` | `PARTIAL_FUNCTION` |
| MF07 | `GET /app/staff/invite`, `POST /app/staff/invite`, `/activate/:token` | `activeClinicStaffRoutes.js`, `activeClinicStaffAdminRoutes.js` | `activeClinicStaffInvitationService.js` | `staff-invite-content.ejs`, `staff-form-content.ejs` | staff UI | `staff_invitations` | `activeclinic.staff.invite` | `PARTIAL_FUNCTION` |
| MF08 register | `/clinics/:clinicKey/patient/register` | `activeClinicPatientPortalRoutes.js` | portal registration service | patient register views | patient portal CSS | `patients` + `platform_identity_id` | patient public | `PARTIAL_FUNCTION` |
| MF08 OTP | **none** (phone verify exists, SMS disabled) | — | — | — | — | — | — | `NO_MATCH` |
| MF08 profile | `/clinics/:clinicKey/patient/profile` | same | — | `patient/profile.ejs` | — | patient demographics | patient session | `PARTIAL_FUNCTION` |
| MF09 | `GET /clinics/:clinicKey/patient` | same | portal booking list | `patient/dashboard.ejs` | — | `public_booking_requests` | patient session | `PARTIAL_FUNCTION` |
| MF10 | `/clinics/:clinicKey/book*` | `activeClinicPublicBookingRoutes.js` | `activeClinicPublicBookingService.js` | booking wizard views | booking JS | `public_booking_requests` | public | `PARTIAL_FUNCTION` |
| MF11 | **none** | — | staff lab is `/app/diagnostics/laboratory` (wrong actor) | — | — | no patient-released results API | would need new patient clinical perms | `NO_MATCH` |

---

## STAGE 6 — Protect MF01 / MF02 / MF04

Do not overwrite Phase A. Preserve: email or phone identifier, password, organization selection, token-link recovery, generic errors, **NO OTP**, **NO SSO**.

| Screen | vs implemented V7 |
|--------|-------------------|
| MF01-01…05 | `CURRENT_IMPLEMENTATION_STILL_VALID` — Stitch still “Phone or Email”; V7 label remains “Email address or phone number”. No Google/Apple on staff login. |
| MF02-01…04 | `CURRENT_IMPLEMENTATION_STILL_VALID` — Stitch still shows fake notifications/help; V7 omits those. |
| MF04-01/02 | `MINOR_STITCH_DELTA` — Stitch copy still “verification code” / “Send Code”; V7 copy is reset **link** + `/forgot-password/check`. |
| MF04-03/04 | `STITCH_REGRESSION/ALTERNATE` — OTP still in Stitch; keep `FUNCTIONAL_GAP_OTP`. |
| MF04-05/06/07 | `CURRENT_IMPLEMENTATION_STILL_VALID` — Stitch 8-char complexity list vs V7 10-char policy remains accepted variance. |

If new Stitch screens conflict with this architecture, classify the conflict (already done for OTP). Do not implement a second auth system.

---

## STAGE 7 — MF03 registration reassessment

```text
current screen count: 8
current steps (Stitch): Step 1 clinic → Step 2 administrator → Review → Success
desktop/mobile: 4 / 4
```

Live HTML fields:

| Stitch field | Where shown | Classification |
| ------------ | ----------- | -------------- |
| Clinic name | Step 1 | `CURRENT_V7` |
| Clinic type (General Practice / Dental / Specialist Center / Physiotherapy) | Step 1 | `PRODUCT_DECISION` — V7 uses facility types (`hospital`, `clinic`, `health_centre`, …), not specialty |
| Country | Step 1 | `CURRENT_V7` (`countryCode`) |
| City | Step 1 | `CURRENT_V7` |
| Address/Location | Step 1 | `CURRENT_V7` (`address`) |
| Province | **not on Stitch step 1** | `CURRENT_V7` extra — keep collecting |
| Notes | **not on Stitch** | `CURRENT_V7` extra — keep |
| Admin full name | Step 2 | `CURRENT_V7` |
| Phone | Step 2 | `CURRENT_V7` |
| Email | Step 2 | `CURRENT_V7` |
| Password + confirm | Step 2 | `CURRENT_V7` (policy: keep 10 chars, omit Stitch 8/complexity UI) |
| License ID | Review only, not collected | `NOT_SUPPORTED` — `healthcare_organizations.license_number` exists for org settings, not this wizard |
| Clinic contact number on review | Review dummy | `NOT_SUPPORTED` as a separate registration field (admin phone already collected) |
| Role “Chief Medical Officer” | Review dummy | `NOT_SUPPORTED` — founder is clinic admin |
| Terms checkbox | Review | `CURRENT_V7` |
| Success: unpublished website, sign in | Success | `CURRENT_V7` (plus review-required path Stitch does not show) |
| Maps pin on address | Step 1 icon | `VISUAL_ONLY` |
| Help Center / Security footer | chrome | `VISUAL_ONLY` / omit fake Help Center |

```text
MF03_READY_FOR_VISUAL_IMPLEMENTATION = YES
```

Reason: the wizard already works on existing routes and schema. Visual restyle does not need a migration if License ID, specialty taxonomy, and password-policy theatre are omitted. Keep V7 immediate-provision success copy (“No Platform Admin approval is required for a normal registration”) rather than inventing an approval gate.

---

## STAGE 8 — MF05 + MF06 onboarding

**Prior understanding still accurate:** MF05 = first-run clinic checklist; MF06 = website/CMS checklist.

V7 equivalents:

- `/app/onboarding` — one checklist from live clinic facts: clinic profile, primary facility, administrator, departments, public hours, additional staff, website.
- `/app/settings/website` — ongoing CMS hub (pages, sections, builder, media, nav, branding, SEO, catalogue, publish). **No theme picker.**

Overlap: both Stitch families include services, website customize, and Preview & Publish. MF05 “Customize clinic website” is the same capability as MF06.

**Decision:**

```text
WEBSITE_AS_SUBSECTION_OF_CLINIC_ONBOARDING
```

Why:

- V7 already has **one** operational onboarding engine. Website is a recommended step, not a blocker.
- A second MF06 “onboarding” would compete with `/app/onboarding` and with the CMS hub.
- After first run, website work belongs in Website Management (MW already implemented), not a parallel checklist product.
- Implement MF05 as a visual of `/app/onboarding`. Treat MF06 welcome/checklist as **CMS empty/unpublished states** of `/app/settings/website`, not a second wizard. Omit Theme. Do not add `clinics.activeclinic.org` / `myclinic.cliniceditor.com` staging URLs.

Reject `ONE_MASTER_ONBOARDING` that would swallow CMS. Reject `CLINIC_AND_WEBSITE_SEPARATE` as two first-run products.

---

## STAGE 9 — MF07 staff invite

| Topic | V7 |
|-------|-----|
| Invite landing | `GET /app/staff/invite` → form at `/app/staff/new?invite=1` |
| Create | `POST /app/staff/invite` |
| Share-link | **Yes** — `buildActivationUrl`; copy: automated email/SMS is not configured |
| Email | Template `STAFF_INVITATION` exists in `activeClinicEmailDelivery.js` / Resend adapter, **gated** (production + adapter). Typical testing: link only |
| Roles | `role_keys[]` — real catalogue, not Stitch’s Doctor/Nurse/Admin/Receptionist-only list |
| Facilities | `facility_ids[]` / `primary_facility_id` |
| Department | Stitch department dropdown; V7 assigns facility + role, departments are a separate setup |
| Expiry | 72h (`identity_action_tokens`) |
| Acceptance | `GET/POST /activate/:token` |

Stitch CTA “Send Invitation” while body text says “invitation link” = honest-link UI is possible without faking email.

```text
MF07_PARTIAL_FUNCTION
```

Visual restyle of staff list + invite modal is valid. Do not fake sent email. Later email is an ops enablement of existing infrastructure, not a schema change.

---

## STAGE 10 — MF08 patient registration

Live HTML is **public patient account registration** (ClinicBuilder), then **MFA**, then **health-profile onboarding**. It is **not** staff `/app/patients/new`.

| Stitch piece | V7 map |
|--------------|--------|
| Create account (name, email, mobile, password) | `/clinics/:clinicKey/patient/register` |
| Google / Apple | **unsupported** — same policy as staff SSO |
| 6-digit MFA + IT support | **unsupported** — `/patient/verify-phone` exists but SMS/OTP delivery is disabled; screen copy is HIPAA MFA theatre |
| DOB, biological sex | staff registration has `date_of_birth` / `sex_at_registration`; **portal profile does not** |
| Insurance provider + member ID | staff identifier type `insurance_member_number` only; no portal insurance plan |
| ClinicBuilder brand | design exploration — keep ActiveClinic |

Do not merge staff patient-create and portal self-register.

Portal subset to restyle later: register + profile (name/phone/email/address). Omit OTP, SSO, insurance wizard, sex/DOB unless product expands portal demographics (no migration in visual phase).

---

## STAGE 11 — MF09 patient dashboard

Live widgets vs V7:

| Element | Class |
|---------|-------|
| Welcome + next appointment | `CURRENT_V7_DATA` (upcoming bookings; not “telehealth specialist” card) |
| Book Appointment | `CURRENT_V7_BUT_DIFFERENT_ROUTE` (`/book` or portal bookings) |
| Reschedule | `CURRENT_V7_BUT_DIFFERENT_ROUTE` (my-booking / request flow) |
| Join Call / Telehealth | `NEW_PRODUCT_FUNCTION` / `EXTERNAL_INTEGRATION` |
| Message Doctor | `NEW_PRODUCT_FUNCTION` |
| Recent Lab Results | `CLINICAL_EHR_EXPANSION` (leads into MF11) |
| Active Medications / Request Refill | `CLINICAL_EHR_EXPANSION` |
| Billing nav | `NEW_PRODUCT_FUNCTION` |
| Search records / notifications bell | `PLACEHOLDER` |
| Medical Records nav | `CLINICAL_EHR_EXPANSION` (MF11) |

**Implement now:** bookings dashboard chrome only (pending / upcoming / past + book/profile/link-guest).  
**Do not:** labs, meds, messages, billing, telehealth, fake notifications.

Authoritative patient portal design remains P27 + `patient/data-boundaries.ejs`.

---

## STAGE 12 — MF10 booking

Stitch steps: Services → Provider → Time → Confirm (4). V7 consultation wizard: type → doctor → slot → **patient details** → review/submit (5). Procedure wizard is separate.

| Stitch | V7 | Gap type |
|--------|-----|----------|
| Select service | `/book` | `VISUAL_RESTYLE_ONLY` (Stitch uses generic GP/specialist/lab/wellness/vaccine cards vs clinic catalogue) |
| Select provider | `/book/doctor` | `VISUAL_RESTYLE_ONLY` |
| Select time | `/book/slot` | `VISUAL_RESTYLE_ONLY` + existing honesty: slots unpublished until configured |
| Review + copay $45 + insurance | `/book/review` | `GENUINE_FUNCTION_GAP` for copay/insurance — **omit** |
| Missing MF10-04/06/08 mobile | V7 already responsive | `MISSING_EXISTING_STATE` in **Stitch**, not in V7 |
| Logged-in portal chrome | Public + optional portal session | Do not create a second engine |

```text
VISUAL_RESTYLE_ONLY for the existing request wizard
GENUINE_FUNCTION_GAP only for copay / insurance / telehealth (defer)
```

---

## STAGE 13 — Design-only / do-not-implement features

| Feature | Screens | Classification | Recommendation |
| ------- | ------- | -------------- | -------------- |
| OTP / verification code | MF04-03/04 | `OMIT` | Keep token email |
| Patient MFA | MF08-03/04 | `OMIT` | |
| Google SSO | MF08-01 | `OMIT` | |
| Apple SSO | MF08-01 | `OMIT` | |
| Staff notifications/help chrome | MF02-01 | `OMIT` | Fake |
| ClinicBuilder / HealLink brand | MF08, MF11 | `OMIT` | Keep ActiveClinic |
| Theme tab | MF06-03 | `OMIT` | Existing `FUNCTIONAL_GAP_THEME` |
| Staging URLs (`cliniceditor.com`, `clinics.activeclinic.org/your-clinic`) | MF06 | `OMIT` | Use real clinic public URL |
| License ID at registration | MF03-05 | `PRODUCT_DECISION` | Defer; not on collect step |
| Specialty clinic types | MF03-01 | `PRODUCT_DECISION` | Keep facility types |
| Maps | MF03-01 | `OMIT` | |
| Invite email send | MF07 | `DEFER` | Infra exists, gated; honest link now |
| Department on invite | MF07 | `DEFER` | V7 uses facility + role |
| Insurance / DOB / sex portal wizard | MF08-05 | `DEFER` / `PRODUCT_DECISION` | |
| Telehealth Join Call | MF09 | `OMIT` | |
| Secure messaging | MF09, MF11 nav | `OMIT` | |
| Billing / copay | MF09, MF10-07 | `OMIT` | |
| Medication refill | MF09 | `OMIT` | |
| Patient medical records / labs / imaging / immunizations | MF11, MF09 | `OMIT` | Conflicts with P27 data-boundaries |
| Upload Record / Export All / Share PDF | MF11 | `OMIT` | |
| Lab trend charts | MF11-03 | `OMIT` | |
| Help Center / IT Support | several | `OMIT` | |
| HIPAA theatre copy as a feature | MF05, MF08 | `OMIT` | Don’t invent compliance product |

---

## STAGE 14 — Data model impact

| Family | Existing schema sufficient | Possible schema gap | Migration recommended now |
| ------ | -------------------------: | ------------------- | ------------------------: |
| MF01 | YES | none | NO |
| MF02 | YES | none | NO |
| MF03 | YES for current wizard | license / specialty taxonomy | NO |
| MF04 | YES without OTP | OTP challenge table if ever approved | NO |
| MF05 | YES | none | NO |
| MF06 | YES | none | NO |
| MF07 | YES | none (email is ops) | NO |
| MF08 | YES for register/profile basics | portal insurance/clinical profile | NO |
| MF09 | YES for bookings; NO for EHR widgets | labs/meds/messages/billing/telehealth | NO |
| MF10 | YES for request flow | payments/copay | NO |
| MF11 | NO for patient-released results | clinical result release, documents, ranges | NO |

Default: **Migration recommended now = NO** for every family.

---

## STAGE 15 — RBAC

| Family | Actor | Existing keys |
|--------|-------|----------------|
| MF01, MF04 | unauthenticated staff-to-be | public auth |
| MF02 | authenticated identity with memberships | session + org select |
| MF03 | public clinic founder | public; becomes org admin |
| MF05 | staff with `activeclinic.access` | manage steps need org/facility/staff/website perms already defined |
| MF06 | `website.view` / `website.edit` / publish | existing |
| MF07 | `activeclinic.staff.invite` (+ assign role/facility) | existing |
| MF08–MF10 | patient portal identity / public booker | existing portal + public booking |
| MF11 | would be patient clinical-results reader | **no such permission**. Staff `activeclinic.lab.result` must not be reused for portal |

No new permission keys for visual phases. Patient EHR would be a new domain later.

---

## STAGE 16 — Priorities

### P0 — fix before further visual work

**None.** No security/workflow blocker. Phase A auth remains valid. Do not “fix” OTP to match Stitch.

### P1 — visual alignment of existing working flows

1. **MF03** register-clinic chrome (highest isolated value).
2. **MF05-03/04** onboarding checklist restyle (not a second system).
3. **MF07** staff invite chrome with honest link copy.
4. **MF10** booking step chrome on `/book*` (omit copay).
5. **MF08-01/02** patient register chrome (no SSO).
6. **MF09** bookings-only dashboard chrome.

### P2 — useful partial-product enhancements

- MF05-01/02 welcome interstitial (optional gate).
- MF06 unpublished-website hub as CMS empty state (not a second onboarding).
- MF02 leftover fake chrome already omitted — no work.
- Enable staff-invite email later via existing Resend gate (ops, not Stitch).
- MF08 profile fields already on portal (name/phone/email/address) visual only.

### P3 — deferred

OTP, SSO, Theme, License ID, specialty taxonomy, telehealth, messaging, billing/copay, medications, **entire MF11**, HealLink/ClinicBuilder brands, maps, fake notifications.

---

## STAGE 17 — Implementation phases (new sequence)

Phase A (MF01/MF02/MF04) is **done**. Do not reopen.

### Phase B — MF03 clinic registration chrome

```text
PHASE: B
MF screens: MF03-01–08
existing routes: /register-clinic, /register-clinic/success
goal: restyle the working wizard to MF chrome without schema change
functional work: none beyond keeping V7 fields/policies
visual work: public register templates + acw/register CSS; desktop+mobile
schema changes: none
RBAC: none
risk: low (do not add license, do not change clinicType enum, do not weaken password)
expected test suites: clinic registration / ACW09 / terms acceptance
```

### Phase C — MF05 onboarding continuity (website as subsection)

```text
PHASE: C
MF screens: MF05-03/04 required; MF05-01/02 optional interstitial
existing routes: /app/onboarding
goal: one master clinic checklist visually closer to MF05; website remains a step linking to CMS
functional work: map Stitch labels onto existing step keys; do not add “services”/“publish” as new required gates unless they already exist
visual work: onboarding-content.ejs
schema: none
RBAC: none
risk: low if we do not invent a second checklist store
tests: v7-unified-onboarding / activeclinic onboarding
```

### Phase D — MF06 as CMS unpublished state (not a second onboarding)

```text
PHASE: D
MF screens: MF06-01–04
existing routes: /app/settings/website
goal: unpublished hub + setup tiles that deep-link to existing CMS (pages, branding, catalogue, publish)
functional work: none; omit Theme and fake staging host
visual work: settings-website-content.ejs
schema: none
RBAC: none
risk: medium if treated as a new wizard — must remain the existing hub
tests: website hub / CMS
```

### Phase E — MF07 staff invite chrome

```text
PHASE: E
MF screens: MF07-01/02
existing routes: /app/staff, /app/staff/invite, /app/staff/new?invite=1
goal: restyle list + invite dialog; CTA = create + copy link
functional work: none; do not claim email sent
visual work: staff invite templates
schema: none
RBAC: none
tests: staff invite / share-link
```

### Phase F — Patient + booking chrome (MF08 minus OTP, MF09 bookings, MF10)

```text
PHASE: F
MF screens: MF08-01/02/05/06 (omit 03/04), MF09-01/02 bookings-only, MF10-01/02/03/05/07
existing routes: /clinics/:clinicKey/patient*, /clinics/:clinicKey/book*
goal: shared patient-portal chrome without EHR; booking wizard restyle without second engine
functional work: none
visual work: one portal shell + one booking wizard shell
schema: none
RBAC: none
risk: medium if EHR/copay widgets are copied in — forbid that
tests: patient portal, public booking, phase5a procedure booking, data-boundaries
```

### Phase G — deferred product expansion (not scheduled)

MF04 OTP, MF08 MFA/SSO, MF09 EHR widgets, **all of MF11**, payments, telehealth, Theme, license registry.

---

## STAGE 18 — Token-saving strategy

| Phase | Cursor cost | Shared components |
|-------|-------------|-------------------|
| B MF03 | `MEDIUM` | One public wizard shell (steps, footer, buttons) covering 8 screens |
| C MF05 | `LOW` | One onboarding checklist component; welcome is optional extra |
| D MF06 | `LOW`–`MEDIUM` | Reuse Clinic Editor / MW chrome already in repo; checklist tiles only |
| E MF07 | `LOW` | One staff page + one modal |
| F patient/booking | `HIGH` if done as many screens; `MEDIUM` if one portal card system + one booking stepper | **Do not** implement screen-by-screen |

Reuse, do not duplicate:

- existing MF auth shell (already built) — do not rebuild for MF03
- one wizard stepper for MF03 and later MF10
- one checklist row component for MF05 and MF06
- one patient portal nav/card system for MF08/MF09 (bookings only)
- one mobile form field system (`ac-phone-field` already exists)

---

## Recommended NEXT prompt

See operator report section N in the conversation that published this file. Highest-priority implementation phase is **Phase B — MF03 clinic registration chrome**.

---

## Safety for this documentation pass

```text
PRODUCTION TOUCHED: NO
MAIN MERGED: NO
SCHEMA CHANGED: NO
OTP IMPLEMENTED: NO
SSO IMPLEMENTED: NO
```
