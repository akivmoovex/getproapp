# ActiveClinic Stitch expansion inventory (MF + later families)

> **Superseded as the live inventory.** The live project is now **100 screens** (`updateTime` `2026-08-21T00:22:14.887432Z`) including **MF11**. Use [`ACTIVECLINIC_MF01_MF11_LIVE_AUDIT.md`](./ACTIVECLINIC_MF01_MF11_LIVE_AUDIT.md) as the current MF01–MF11 source of truth. This file is retained as the historical 96-screen / Phase A checkpoint. Do not delete it.

**Status (historical):** Phase A (MF01 + MF02 + MF04 without OTP) implemented on existing auth routes. Remaining families were audit-only at the 96-screen lock.  
**Stitch project:** [ActiveClinic Universal Authentication Interface](https://stitch.withgoogle.com/projects/10611909237747031838)  
**Project ID:** `10611909237747031838`  
**Inspected (this file):** 2026-08-21 via live MCP `get_project` + `list_screens` + downloaded HTML (not hotlinked)

This document **does not overwrite** the 49-screen parity checkpoint in `ACTIVECLINIC_EXACT_PARITY_AUDIT.md`.

| Checkpoint | Meaning |
|------------|---------|
| `ORIGINAL_49` | ACW01–ACW06 (14) + `active-clinic-03-*` auth (7) + MW01–MW07 (28). Fully reaudited. Do not reopen unless product asks. |
| `NEW_47` | Everything currently in the live project that is **not** in `ORIGINAL_49`. |

---

## Live inventory delta

| When | `updateTime` | Screen count | Notes |
|------|--------------|-------------:|-------|
| Original lock | `2026-08-20T20:01:22Z` | **49** | ACW + auth + MW |
| MW phase 2 report | `2026-08-20T23:51:40Z` | **83** | +~34 (reported as MF01–MF05 ≈30 + 4 “auth-named”) |
| **This audit** | `2026-08-21T00:11:00.219945Z` | **96** | +13 vs 83; **+47 vs original 49** |

### What the “34 new screens” actually were

The 83-screen count did **not** add four extra `active-clinic-03-*` auth screens. The original seven kebab-case auth screens are unchanged.

The extra login compositions live under **MF01** (staff login family). The earlier “AUTH_NEW ≈ 4” figure was a naming miscount of MF login titles.

Exact `NEW_47` breakdown now:

| Family | Count | Role of family |
|--------|------:|----------------|
| MF01 | 5 | Staff login / error / signing-in (redesign of original auth) |
| MF02 | 4 | Clinic workspace selector + empty/disabled access |
| MF03 | 8 | Register-clinic wizard |
| MF04 | 7 | Forgot / OTP / reset password |
| MF05 | 4 | Post-login welcome + clinic setup checklist |
| MF06 | 4 | **Added after the 83-count.** Website welcome + website setup checklist |
| MF07 | 2 | **Added after the 83-count.** Invite staff |
| MF08 | 6 | **Added after the 83-count.** Patient registration / OTP / health profile |
| MF09 | 2 | **Added after the 83-count.** Patient dashboard (EHR-flavoured) |
| MF10 | 5 | **Added after the 83-count.** Logged-in booking wizard (incomplete pair set) |
| AUTH_NEW (`active-clinic-03-*` extras) | **0** | None |
| OTHER non-MF | **0** | None |
| **Total new** | **47** | |

MF10 is incomplete in Stitch: present `01, 02, 03, 05, 07`. Missing `04, 06, 08` (likely mobile provider/time/confirm).

`ORIGINAL_49` IDs are all still present (0 missing).

---

## STAGE 0 — Safety (this audit)

| Check | Value |
|-------|--------|
| Branch | `V7` |
| Local / `origin/V7` | `76343586be337930613b0000ea190deb8199ff1c` |
| Ahead / behind | `0` / `0` |
| Working tree (start) | clean |
| Deployment | `moovex-platform-testing` |
| Environment | `testing` |
| Database identity | `moovex-platform-v7` |
| Hosted SHA | `76343586be33` (**hosted current = YES**) |
| Production / `main` / schema / functional code | **not touched** |

---

## STAGE 1 — Hosted smoke (brief)

Hosted matched `origin/V7`. Smoke only (not 96-screen QA):

| Path | Result |
|------|--------|
| `GET /` | 200 |
| `GET /clinics` | 200 |
| `GET /login` | 200 |
| `GET /clinics/activeclinic-demo` | 200 |
| `GET /app` (logged out) | 303 → `/login` |
| `GET /app/settings/website/pages` (logged out) | 303 → `/login` |

---

## `ORIGINAL_49` (preserved checkpoint)

Do not re-implement. Visual status remains the MW/ACW/auth parity audit:

```text
PIXEL_CLOSE_MATCH: 0
MINOR_ACCEPTED_VARIANCE: 46
FUNCTIONAL_GAP: 3
BLOCKED: 0
NOT_REAUDITED: 0
```

Known functional gaps already recorded: `FUNCTIONAL_GAP_GOOGLE_SSO`, `FUNCTIONAL_GAP_PUBLISH_NOTE`, plus Theme / Emergency / media-video (MW).

---

## `NEW_47` — complete list

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

---

## STAGE 3 — What “MF” is

**MF = Member / foundation flows** for the ActiveClinic **public + staff + patient identity surface**, not clinic website CMS (that remains MW) and not internal clinical ops (Juflona project `12272131183982732110`).

HTML evidence (labels, nav, CTAs):

| Family | purpose | primary user | entry point | workflow | domain object | desktop/mobile states |
|--------|---------|--------------|-------------|----------|---------------|------------------------|
| MF01 | Staff sign-in | clinic staff | `/login` | identifier + password → session | platform identity | login, error, signing-in |
| MF02 | Choose or fail workspace | clinic staff | after login | pick HCO / empty / disabled | organization membership | selector, no access, disabled |
| MF03 | Register a clinic | public clinic founder | `/register-clinic` | clinic → admin → review → success | registration application + org | 3-step + review + success |
| MF04 | Recover staff password | clinic staff | `/forgot-password` | identifier → **OTP** (Stitch) → new password | identity credentials | forgot, code, reset, success |
| MF05 | First-run clinic setup | clinic admin | after first login | welcome → checklist | onboarding steps | welcome + checklist |
| MF06 | First-run **website** setup | website editor | Website Management | unpublished site → CMS checklist | website instance | welcome + checklist (Clinic Editor chrome, including **Theme**) |
| MF07 | Invite staff | clinic admin | staff admin | invite modal (name, email, role, dept) | staff member + invitation | list + invite dialog |
| MF08 | Patient account onboarding | patient | patient portal | register → **OTP/MFA** → health profile | patient portal identity | register, verify, profile wizard |
| MF09 | Patient home | patient | portal dashboard | appointments, labs, meds, messages, billing | patient portal | dashboard |
| MF10 | Book from portal | patient | portal booking | service → provider → time → confirm | booking request | incomplete Stitch set |

MF is **not** a second website engine. MF06 sits on the same Clinic Editor chrome as MW.

Stitch also uses **ClinicBuilder** branding on MF08 (patient). That is a design-exploration inconsistency with ActiveClinic staff chrome. Do not import ClinicBuilder as a product name.

---

## STAGE 4 — Screen-by-screen classification

Exactly one primary class per screen.

| Stitch ID | Name | Classification | Why |
|-----------|------|----------------|-----|
| `9e85a339…` | MF01-01 Login Desktop | `EXISTING_FUNCTION_DIFFERENT_UI` | Same staff login as `/login` and as `active-clinic-03-desktop-login`. Newer composition. |
| `f435d25c…` | MF01-02 Login Mobile | `RESPONSIVE_VARIANT` | Mobile of MF01-01. |
| `1690fc1c…` | MF01-03 Login Error Desktop | `EXISTING_ROUTE_NEW_STATE` | Error state of `/login`. Also duplicates `active-clinic-03-*-validation-error`. |
| `7a24bd60…` | MF01-04 Login Error Mobile | `RESPONSIVE_VARIANT` | Mobile of MF01-03. |
| `a6dbf4e5…` | MF01-05 Signing In Loading | `VISUAL_VARIANT` | Same signing-in overlay already on login submit (`active-clinic-03-loading-signing-in`). |
| `2f202c49…` | MF02-01 Clinic Selector Desktop | `EXISTING_FUNCTION_DIFFERENT_UI` | `/login/select-organization`. |
| `c31ac734…` | MF02-02 Clinic Selector Mobile | `RESPONSIVE_VARIANT` | Mobile of MF02-01. |
| `6a9ab533…` | MF02-03 No Clinic Access | `EXISTING_ROUTE_NEW_STATE` | Empty membership. V7 org-select currently shows expired-selection copy, not this dedicated state. |
| `d955b5cb…` | MF02-04 Clinic Access Disabled | `EXISTING_ROUTE_NEW_STATE` | Disabled/suspended workspace. V7 has lifecycle-state pages, not this exact copy. |
| `be4c228d…` | MF03-01 Register Step 1 Desktop | `EXISTING_FUNCTION_DIFFERENT_UI` | `/register-clinic` clinic step. |
| `8d1074d1…` | MF03-02 Register Step 1 Mobile | `RESPONSIVE_VARIANT` | |
| `7fac8f82…` | MF03-03 Register Step 2 Desktop | `EXISTING_FUNCTION_DIFFERENT_UI` | `/register-clinic` administrator step. |
| `2cc66d42…` | MF03-04 Register Step 2 Mobile | `RESPONSIVE_VARIANT` | |
| `3792389f…` | MF03-05 Review Desktop | `EXISTING_FUNCTION_DIFFERENT_UI` | `/register-clinic` review. Extra Stitch fields (license ID). |
| `b4033934…` | MF03-06 Review Mobile | `RESPONSIVE_VARIANT` | |
| `49217e08…` | MF03-07 Success Desktop | `EXISTING_FUNCTION_DIFFERENT_UI` | `/register-clinic/success`. |
| `f90550e4…` | MF03-08 Success Mobile | `RESPONSIVE_VARIANT` | |
| `5a4fbca3…` | MF04-01 Forgot Password Desktop | `EXISTING_FUNCTION_DIFFERENT_UI` | `/forgot-password`. |
| `50e275a5…` | MF04-02 Forgot Password Mobile | `RESPONSIVE_VARIANT` | |
| `e7f833d5…` | MF04-03 Verification Code Desktop | `UNSUPPORTED_CONCEPT` | 6-digit OTP. V7 emails a **one-time link**, not OTP. SMS OTP is not a product. |
| `c755d15f…` | MF04-04 Verification Code Mobile | `RESPONSIVE_VARIANT` | Device variant of unsupported OTP. |
| `9ab165fa…` | MF04-05 Reset Password Desktop | `EXISTING_FUNCTION_DIFFERENT_UI` | `/reset-password/:token`. |
| `1e56748c…` | MF04-06 Reset Password Mobile | `RESPONSIVE_VARIANT` | |
| `c2546a84…` | MF04-07 Reset Success | `EXISTING_FUNCTION_DIFFERENT_UI` | `/reset-password/success`. |
| `46639010…` | MF05-01 Welcome Desktop | `EXISTING_ROUTE_NEW_STATE` | First-run interstitial before `/app/onboarding`. |
| `9576cbde…` | MF05-02 Welcome Mobile | `RESPONSIVE_VARIANT` | |
| `e8694bbb…` | MF05-03 Setup Checklist Desktop | `EXISTING_FUNCTION_DIFFERENT_UI` | `/app/onboarding`. |
| `df9f49e6…` | MF05-04 Setup Checklist Mobile | `RESPONSIVE_VARIANT` | |
| `e61dfb58…` | MF06-01 Website Welcome Desktop | `EXISTING_FUNCTION_DIFFERENT_UI` | Unpublished website hub `/app/settings/website`. |
| `1d3629cc…` | MF06-02 Website Welcome Mobile | `RESPONSIVE_VARIANT` | |
| `e12e282f…` | MF06-03 Website Setup Checklist Desktop | `EXISTING_FUNCTION_DIFFERENT_UI` | Same hub + CMS tasks. Stitch still shows **Theme**. |
| `8522ea2d…` | MF06-04 Website Setup Checklist Mobile | `RESPONSIVE_VARIANT` | |
| `f3363068…` | MF07-01 Invite Staff Desktop | `EXISTING_FUNCTION_DIFFERENT_UI` | `/app/staff` + invite. Stitch implies sent email. |
| `44c7c2fe…` | MF07-02 Invite Staff Mobile | `RESPONSIVE_VARIANT` | |
| `b17405de…` | MF08-01 Patient Registration Desktop | `EXISTING_FUNCTION_DIFFERENT_UI` | `/clinics/:clinicKey/patient/register`. Adds Google/Apple (unsupported). |
| `2cf8f6ff…` | MF08-02 Patient Registration Mobile | `RESPONSIVE_VARIANT` | |
| `449d124d…` | MF08-03 Verification Desktop | `UNSUPPORTED_CONCEPT` | Patient MFA/OTP + “IT support”. SMS MFA is not shipped. |
| `cbaed824…` | MF08-04 Verification Mobile | `RESPONSIVE_VARIANT` | |
| `7a6121f7…` | MF08-05 Health Profile Setup Desktop | `EXISTING_FUNCTION_DIFFERENT_UI` | Partial overlap with patient profile; wizard + insurance is extra. |
| `d9a0fc38…` | MF08-06 Health Profile Setup Mobile | `RESPONSIVE_VARIANT` | |
| `f96a31fb…` | MF09-01 Patient Dashboard Desktop | `EXISTING_FUNCTION_DIFFERENT_UI` | `/clinics/:clinicKey/patient` exists. Labs, meds, telehealth, messages, billing are extra product. |
| `9c0157d1…` | MF09-02 Patient Dashboard Mobile | `RESPONSIVE_VARIANT` | |
| `2e77628d…` | MF10-01 Select Service Desktop | `EXISTING_FUNCTION_DIFFERENT_UI` | Public booking `/book` service step, restyled as portal. |
| `9ea79123…` | MF10-02 Select Service Mobile | `RESPONSIVE_VARIANT` | |
| `897ed261…` | MF10-03 Select Provider Desktop | `EXISTING_FUNCTION_DIFFERENT_UI` | `/book/doctor`. |
| `270bca2e…` | MF10-05 Select Time Desktop | `EXISTING_FUNCTION_DIFFERENT_UI` | `/book/slot`. |
| `e9a21fe4…` | MF10-07 Review & Confirm Desktop | `EXISTING_FUNCTION_DIFFERENT_UI` | `/book/review`. Copay/insurance/telehealth extras. |

Classification totals (`NEW_47`):

```text
NEW_FUNCTIONALITY: 0
EXISTING_FUNCTION_DIFFERENT_UI: 20
EXISTING_ROUTE_NEW_STATE: 4
VISUAL_VARIANT: 1
RESPONSIVE_VARIANT: 20
DUPLICATE_STITCH_SCREEN: 0  (primary class; MF01 still duplicates ORIGINAL auth compositions)
UNSUPPORTED_CONCEPT: 2
UNCLEAR: 0
```

Zero `NEW_FUNCTIONALITY` as **primary screen class** because every MF family maps to an existing V7 journey. Genuine *module* gaps (OTP, SSO, telehealth, labs, messaging, billing) are called out under match level and P2 — they are not missing routes for these compositions.

---

## STAGE 5 — V7 map

| Stitch ID | Current V7 equivalent | Match level |
|-----------|----------------------|-------------|
| MF01-01/02 | `GET/POST /login` · `activeClinicAuthRoutes.js` · `renderActiveClinicAuth.js` · `views/activeclinic/auth/login.ejs` · platform identity · public | `PARTIAL_FUNCTION` |
| MF01-03/04 | same `/login` error | `PARTIAL_FUNCTION` |
| MF01-05 | login submit overlay `partials/auth-signing-in.ejs` | `VISUAL_ONLY_MATCH` |
| MF02-01/02 | `GET /login/select-organization` · `auth/select-organization.ejs` | `PARTIAL_FUNCTION` |
| MF02-03 | org-select empty list (expired copy) | `PARTIAL_FUNCTION` |
| MF02-04 | `auth/lifecycle-state.ejs` (suspend/lock) | `PARTIAL_FUNCTION` |
| MF03-01–08 | `GET/POST /register-clinic` · review · `/register-clinic/success` · `submitClinicRegistrationService.js` · `views/activeclinic/public/register-clinic*.ejs` · `clinic_registration_applications` | `PARTIAL_FUNCTION` |
| MF04-01/02 | `GET/POST /forgot-password` · `activeClinicPasswordRecoveryService.js` | `PARTIAL_FUNCTION` |
| MF04-03/04 | **NONE** (OTP) | `NO_MATCH` |
| MF04-05–07 | `/reset-password/:token` · `/reset-password/success` | `PARTIAL_FUNCTION` |
| MF05-01/02 | **NONE** as dedicated welcome; first destination is `/app` or `/app/onboarding` | `VISUAL_ONLY_MATCH` |
| MF05-03/04 | `GET /app/onboarding` · `evaluateOrganizationOnboarding` · `onboarding-content.ejs` · `activeclinic.access` | `PARTIAL_FUNCTION` |
| MF06-* | `GET /app/settings/website` hub · CMS pages · `website.view` / `website.edit` | `PARTIAL_FUNCTION` |
| MF07-* | `/app/staff` · `POST /app/staff/invite` · `staff-invite-content.ejs` · staff + invitations. Email delivery **not** configured | `PARTIAL_FUNCTION` |
| MF08-01/02 | `/clinics/:clinicKey/patient/register` · `activeClinicPatientPortalRegistrationService.js` | `PARTIAL_FUNCTION` |
| MF08-03/04 | **NONE** (MFA/OTP). Patient phone verify exists for other flows but is not this MFA screen | `NO_MATCH` |
| MF08-05/06 | `/clinics/:clinicKey/patient` profile (`patient/profile.ejs`) | `PARTIAL_FUNCTION` |
| MF09-* | `/clinics/:clinicKey/patient` · `patient/dashboard.ejs` (pending/upcoming bookings only) | `PARTIAL_FUNCTION` |
| MF10-* | `/clinics/:clinicKey/book` wizard (`activeClinicPublicBookingRoutes.js`) | `PARTIAL_FUNCTION` |

```text
EXACT_FUNCTION: 0
PARTIAL_FUNCTION: 43
VISUAL_ONLY_MATCH: 2
NO_MATCH: 2
```

RBAC already in play (do not invent new keys unless a later product decision requires them):

- Staff login / selector / recovery: unauthenticated + session
- Onboarding: `activeclinic.access` + can-manage onboarding
- Website hub: `website.view` / `website.edit` / `website.publish`
- Staff invite: staff-admin permissions already used by `/app/staff/invite`
- Patient: patient portal session, clinic-scoped
- Booking: public clinic booking (not a new RBAC domain)

---

## STAGE 6 — True functional gaps

| Screen / family | Missing work class | Notes |
|-----------------|--------------------|-------|
| MF01 visual refresh | `UI_ONLY` | Do not add a second login system. |
| MF02-03 dedicated empty membership | `UI_ONLY` + maybe `WORKFLOW` | Reuse org-select/lifecycle. No new table. |
| MF02-04 disabled workspace copy | `UI_ONLY` | Map to existing suspend/lock. |
| MF03 license ID | `CONTENT_MODEL` | Not in current registration payload. **Do not add** unless product requires a license registry. |
| MF04 OTP | `EXTERNAL_INTEGRATION` + `WORKFLOW` | **Do not implement.** Keep emailed reset token. |
| MF05 welcome interstitial | `UI_ONLY` | Optional gate before onboarding. |
| MF05/MF06 checklist chrome | `UI_ONLY` | Steps already exist. |
| MF06 Theme | already `FUNCTIONAL_GAP_THEME` | Omit. |
| MF07 “Send Invitation” email | `EXTERNAL_INTEGRATION` | V7 currently: create invite + **share link manually**. |
| MF08 Google/Apple | `EXTERNAL_INTEGRATION` | Same policy as `FUNCTIONAL_GAP_GOOGLE_SSO`. Do not stub. |
| MF08 OTP/MFA | `EXTERNAL_INTEGRATION` | Do not stub. |
| MF08 insurance / sex / DOB wizard | `CONTENT_MODEL` | Some patient fields exist (`insurance_member_number`). Full clinical profile is out of current portal scope. |
| MF09 labs, meds, messages, billing, telehealth | `MULTIPLE` (service + database + RBAC + integrations) | This is a **patient EHR portal**, not the current booking portal. |
| MF10 copay / insurance / Join Call | `MULTIPLE` | Public booking is request-not-confirmed. Do not add payments/telehealth for screenshot parity. |

### Database (conceptual only — no migrations)

| Screen | Required entity | Existing table | Schema sufficient | Potential migration |
|--------|-----------------|----------------|-------------------|---------------------|
| MF01–MF02 | identity + membership | platform identity, org membership | YES | none |
| MF03 | clinic registration | `activeclinic.clinic_registration_applications` | YES for current wizard | license ID only if product requires it |
| MF04 OTP | OTP challenges | none for staff login OTP | YES without OTP | would need challenge table **if** OTP were approved (not recommended) |
| MF05 | onboarding progress | platform onboarding store | YES | none |
| MF06 | website instance | `platform.website_instances` + content | YES | none |
| MF07 | staff invite | staff + invitations | YES | none for link-share; email is ops not schema |
| MF08/09 EHR | labs, meds, threads, invoices, telehealth sessions | **no patient-portal clinical modules** | NO for Stitch dashboard | large new domains — **product decision**, not this expansion |
| MF10 | booking request | existing booking requests | YES for request flow | payments/copay would be new |

---

## STAGE 7 — Auth screen audit

**Additional `active-clinic-03-*` screens: 0.**

The four “new auth-named” screens from the 83-count are **MF01** login compositions, not a second auth architecture.

| Topic | Stitch | V7 | Recommendation |
|-------|--------|----|----------------|
| Email/phone login | MF01-01/02 | `/login` phone-or-email | Keep one login. Optionally restyle to MF01. |
| Login error | MF01-03/04 | `/login` error | State of same route. |
| Signing-in | MF01-05 | overlay | Keep overlay; do not add a standalone `/signing-in` page. |
| Clinic selector | MF02-01/02 | `/login/select-organization` | Same transfer-cookie flow. |
| Google SSO | MF01 does **not** show Google (MF08 patient does) | already `FUNCTIONAL_GAP_GOOGLE_SSO` | **Do not add buttons.** |
| OTP | MF04-03/04, MF08-03/04 | token email / limited patient verify | **Do not add SMS OTP.** |
| Recovery | MF04-01/05/07 | `/forgot-password`, `/reset-password/:token` | Keep token links. Copy can say “check your email”, not “enter code”. |
| Registration | MF03 clinic, MF08 patient | `/register-clinic`, patient register | Already separate products. |
| Architecture change required? | No | Existing identity/session/CSRF/org-select remains canonical | MF01 is a **visual alternative** to the original seven auth screens, not a replacement identity system. |

**Do not implement two staff logins.** If MF01 is approved, it **replaces the visual language** of `active-clinic-03-*` on the same routes.

---

## STAGE 8 — Implement vs skip

| Item | Recommendation | Reason |
|------|----------------|--------|
| MF01 login/error/loading | `REUSE_EXISTING` then optional `IMPLEMENT` visual | Same `/login`. Stitch-internal duplicate of ORIGINAL auth. |
| MF02 selector | `IMPLEMENT_AS_STATE` | Existing org-select. |
| MF02-03 / MF02-04 | `IMPLEMENT_AS_STATE` | Dedicated copy on existing lifecycle/org-select. |
| MF03 | `IMPLEMENT` visual on existing register wizard | Already 2 steps + review + success. |
| MF04 forgot/reset/success | `REUSE_EXISTING` / visual | |
| MF04 OTP | `DO_NOT_IMPLEMENT_DUPLICATE` / skip | Not duplicate UI — **unsupported auth factor**. |
| MF05 welcome | `PRODUCT_DECISION_REQUIRED` | Nice first-run; not required for setup. |
| MF05 checklist | `IMPLEMENT` visual of `/app/onboarding` | |
| MF06 | `IMPLEMENT_AS_STATE` of website hub | Do not add Theme. |
| MF07 | `IMPLEMENT` visual of staff invite | Keep honest “share link” until email exists. |
| MF08 register | `IMPLEMENT` visual of patient register | No Google/Apple. |
| MF08 OTP | `DO_NOT_IMPLEMENT` | |
| MF08 health profile wizard | `PRODUCT_DECISION_REQUIRED` | vs existing profile page. |
| MF09 EHR widgets | `DO_NOT_IMPLEMENT` as fake data | Keep bookings dashboard. |
| MF10 booking | `IMPLEMENT` visual of `/book` | Do not add copay/telehealth. Incomplete Stitch mobile set. |
| ClinicBuilder brand | `DO_NOT_IMPLEMENT` | Keep ActiveClinic naming. |

**Not all 96 Stitch screens become 96 routes.** Expected production destinations remain the existing V7 routes, plus optional first-run welcome **state**.

---

## STAGE 9 — Actors

| Family | Intended actor | Current V7 role |
|--------|----------------|-----------------|
| MF01, MF04 | clinic staff (any) | unauthenticated → staff session |
| MF02 | staff with ≥1 membership | same |
| MF03 | public clinic founder | public; becomes organization admin |
| MF05 | clinic admin / manager | `activeclinic.access` + onboarding manage |
| MF06 | website editor / org admin | `website.*` |
| MF07 | clinic admin | staff-admin invite permission |
| MF08–MF10 | patient | patient portal identity; booking also public visitor |

No new permission keys required for a visual-alignment phase. EHR (MF09 extras) would need entirely new patient clinical permissions later.

---

## STAGE 10 — Navigation impact

| Family | public | patient | staff | CMS | platform admin |
|--------|--------|---------|-------|-----|----------------|
| MF01–MF04 | Login / Register clinic / Forgot already exist | none | none new | none | none |
| MF05 | none | none | optional Home “setup” (already `/app/onboarding`) | none | none |
| MF06 | none | none | none | hub already in CMS | none |
| MF07 | none | none | Staff already in ops shell | none | none |
| MF08–MF10 | Book Appointment already on tenant sites | dashboard/book already | none | none | none |

Stitch-only destinations to **omit**: Theme, Google/Apple, Join Call, Message Doctor, Lab Results, Billing, Request Refill, Security Compliance (unless mapped to `/privacy`), Help Center, IT Support.

---

## STAGE 11 — Data model by family

| Family | Existing tables sufficient | New entity needed | Migration likely |
|--------|---------------------------:|-------------------|-----------------:|
| MF01 | YES | no | NO |
| MF02 | YES | no | NO |
| MF03 | YES | license ID only if required | NO unless license becomes a real field |
| MF04 | YES without OTP | OTP challenge if approved | NO (do not add OTP) |
| MF05 | YES | no | NO |
| MF06 | YES | no | NO |
| MF07 | YES | no | NO |
| MF08 | YES for register/profile basics | insurance/clinical profile extras | maybe later, not for visual phase |
| MF09 | NO for labs/meds/messages/billing/telehealth | several clinical/billing domains | YES **if** product expands portal (not recommended now) |
| MF10 | YES for booking requests | payments/telehealth | NO for current booking |

---

## STAGE 12 — External dependencies

| Implied by Stitch | Screens | Kind |
|-------------------|---------|------|
| Google identity | MF08-01 (Apple too) | `VISUAL_PLACEHOLDER` — do not implement |
| SMS / OTP | MF04-03, MF08-03 | `VISUAL_PLACEHOLDER` / `REQUIRED_FOR_SCREEN` only if OTP were approved |
| Email | MF04 forgot, MF07 invite | `REQUIRED_FOR_SCREEN` for Stitch copy; V7 forgot is email-token; invite is **manual link** today |
| Maps | MF03 address | `OPTIONAL_ENHANCEMENT` |
| Payments / copay | MF10-07, MF09 billing | `VISUAL_PLACEHOLDER` |
| Telehealth | MF09 Join Call | `VISUAL_PLACEHOLDER` |
| Insurance eligibility | MF08-05, MF10-07 | `VISUAL_PLACEHOLDER` |
| Video | MF09 | `VISUAL_PLACEHOLDER` |
| Analytics | none explicit | — |
| File storage | already website media | reuse |

---

## STAGE 13 — Priority

### P0 — Required for coherent product flow

**None.** Login, register-clinic, forgot-password, onboarding, website CMS, staff invite, patient portal, and public booking already work. Absence of MF chrome does not break journeys.

The only P0 *decision* is: **one staff login visual** (keep `active-clinic-03` / current `/login`, or restyle to MF01). Do not ship both.

### P1 — Important (visual alignment of existing journeys)

- MF03 register-clinic wizard chrome (already multi-step)
- MF04 forgot/reset **without OTP**
- MF05-03 / MF06 website+clinic checklists as restyles of onboarding + website hub
- MF07 staff invite chrome (honest delivery copy)
- MF10 booking steps restyle onto `/book`
- MF02 empty/disabled membership copy

### P2 — Optional / skip

- MF05 welcome interstitial
- MF04 / MF08 OTP
- Google/Apple
- MF09 labs, medications, messages, billing, telehealth
- MF10 copay / insurance / Join Call
- License ID as a registration field
- Theme tab
- Completing missing MF10 mobile screens in Stitch before pixel work

---

## STAGE 14 — Implementation phases (token-efficient)

Do **not** run one prompt per screen. Four visual phases cover all implementable MF work. OTP/SSO/EHR stay out.

### Phase A — Staff identity chrome (MF01 + MF02 + MF04 minus OTP)

```text
screens: MF01-01–05, MF02-01–04, MF04-01/02/05/06/07
routes: existing /login, /login/select-organization, /forgot-password, /reset-password/:token
data changes: none
RBAC changes: none
tests: auth + lifecycle + recovery suites
risk: low if no second auth system; high if Google/OTP sneaks in
```

### Phase B — Clinic registration chrome (MF03)

```text
screens: MF03-01–08
routes: existing /register-clinic (+ review/success)
data changes: none (omit license ID)
RBAC: none
tests: registration / ACW09
risk: low
```

### Phase C — Setup checklists (MF05 + MF06)

```text
screens: MF05-01–04 (welcome optional), MF06-01–04
routes: /app/onboarding, /app/settings/website
data changes: none
RBAC: none
tests: onboarding + website hub
risk: low; omit Theme
```

### Phase D — Staff invite + patient/booking chrome (MF07 + MF08 + MF09 bookings + MF10)

```text
screens: MF07-01/02, MF08-01/02/05/06 (no OTP), MF09 bookings-only, MF10-01/02/03/05/07
routes: /app/staff*, /clinics/:key/patient*, /clinics/:key/book*
data changes: none
RBAC: none
tests: staff invite, patient portal, public booking
risk: medium if EHR widgets or payments are faked — forbid that
```

Out of scope forever unless product reopens: OTP, Google/Apple, telehealth, patient labs/meds/messages/billing, Theme.

---

## Product decisions (only real blockers)

1. **Staff login visual:** **Resolved in Phase A.** `/login` uses MF01 chrome. ORIGINAL `active-clinic-03-*` screens remain historical Stitch inventory, not a second login.
2. **Password recovery:** keep emailed token (recommended) vs build OTP (rejected unless SMS/email OTP product exists).
3. **Patient portal scope:** booking portal (current) vs EHR dashboard (MF09). Default: booking portal.
4. **Invite delivery:** stay manual-link (honest) vs send email.
5. **First-run welcome (MF05-01):** skip vs interstitial once.

Minor UI (card radius, copy “Sign In” vs “Login”) is not a blocker.

---

## Phase A implementation (MF01 / MF02 / MF04)

Implemented on existing routes. No second identity system. No OTP.

| Stitch ID | Exact name | Device | V7 route/state | Status | Variance |
|-----------|------------|--------|----------------|--------|----------|
| `9e85a3391ebd4695a045a974d73d14f9` | MF01-01 Login Desktop | Desktop | `GET/POST /login` | `MINOR_ACCEPTED_VARIANCE` | Phone country picker; identifier label is the V7 contract “Email address or phone number”. |
| `f435d25c1264415e8dfca6191466611c` | MF01-02 Login Mobile | Mobile | same | `MINOR_ACCEPTED_VARIANCE` | Same responsive view. |
| `1690fc1ce82a4aaa8289d83659e70366` | MF01-03 Login Error Desktop | Desktop | `/login` 401/403 CSRF | `MINOR_ACCEPTED_VARIANCE` | Generic credentials copy (no account enumeration). Stitch “Email Address” label not used. |
| `7a24bd602d2c48d5826e9048dbe27daa` | MF01-04 Login Error Mobile | Mobile | same | `MINOR_ACCEPTED_VARIANCE` | |
| `a6dbf4e5e83e459ea95c50826ca30c34` | MF01-05 Signing In Loading | Desktop | overlay on submit | `MINOR_ACCEPTED_VARIANCE` | Overlay, not a standalone page. |
| `2f202c49fda04f1e89b52efa2551ead0` | MF02-01 Clinic Selector Desktop | Desktop | `GET /login/select-organization` | `MINOR_ACCEPTED_VARIANCE` | Real clinic cards only. No fake notifications/help. |
| `c31ac73459774d6c9ea384a901a19e92` | MF02-02 Clinic Selector Mobile | Mobile | same | `MINOR_ACCEPTED_VARIANCE` | Search remains on small screens. |
| `6a9ab5333ac9417c8705c5a880d11431` | MF02-03 No Clinic Access | Desktop | `ACCESS_UNAVAILABLE` / no staff membership | `MINOR_ACCEPTED_VARIANCE` | Actions: register clinic, contact, return to login. |
| `d955b5cbce9f48a8a3be639123a8c6f4` | MF02-04 Clinic Access Disabled | Desktop | suspended/ineligible membership | `MINOR_ACCEPTED_VARIANCE` | Distinct from wrong password and from no membership. |
| `5a4fbca37976482d9294d70885235fa9` | MF04-01 Forgot Password Desktop | Desktop | `GET/POST /forgot-password` | `MINOR_ACCEPTED_VARIANCE` | Copy is reset **link**, not code. |
| `50e275a59f80463d996fcb29d2b6273d` | MF04-02 Forgot Password Mobile | Mobile | same | `MINOR_ACCEPTED_VARIANCE` | |
| `e7f833d56af049e3b0306d81c9761b52` | MF04-03 Verification Code Desktop | Desktop | **not implemented** | `FUNCTIONAL_GAP_OTP` | `UNSUPPORTED_CONCEPT — DO NOT IMPLEMENT` |
| `c755d15f21144bcba48ccb5579e3dc07` | MF04-04 Verification Code Mobile | Mobile | **not implemented** | `FUNCTIONAL_GAP_OTP` | `UNSUPPORTED_CONCEPT — DO NOT IMPLEMENT` |
| `9ab165fac045427d9679def4f38049c3` | MF04-05 Reset Password Desktop | Desktop | `GET/POST /reset-password/:token` | `MINOR_ACCEPTED_VARIANCE` | Policy remains 10 characters, not Stitch’s 12/complexity list. |
| `1e56748ce7f843e2916ab33e06692d9e` | MF04-06 Reset Password Mobile | Mobile | same | `MINOR_ACCEPTED_VARIANCE` | |
| `c2546a84104946619e416e26fd649789` | MF04-07 Password Reset Success | Desktop | `/reset-password/success` | `MINOR_ACCEPTED_VARIANCE` | Neutral check page is `/forgot-password/check` (not OTP). |

Neutral confirmation after forgot-password remains `/forgot-password/check` (account-enumeration resistant). It is the functional substitute for MF04-03, not a code entry screen.

ORIGINAL `active-clinic-03-*` screens are unchanged in the 49-screen checkpoint. They are no longer the live visual source for `/login`.

```text
screens compared: 16 (MF01+MF02+MF04)
PIXEL_CLOSE_MATCH: 0
MINOR_ACCEPTED_VARIANCE: 14
FUNCTIONAL_GAP: 2 (FUNCTIONAL_GAP_OTP)
```

---

## Safety for this documentation pass

```text
PRODUCTION TOUCHED: NO
MAIN MERGED: NO
SCHEMA CHANGED: NO
OTP IMPLEMENTED: NO
```
