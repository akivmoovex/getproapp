# V10 PC05 — Platform Phone + Email Ownership

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_PC05_PLATFORM_PHONE_EMAIL_OWNERSHIP` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisites** | PC01–PC04 PASS |
| **Verdicts** | **`PLATFORM_PHONE_INFRA_PASS`** · **`PLATFORM_EMAIL_TRANSPORT_PASS`** |
| **Deploy / production** | **NOT TOUCHED** |

---

## 1. Goal

Generic cross-product identity/communication infrastructure must be platform-owned.

- **Phone UI assets** previously owned under ActiveClinic paths, consumed by BB/platform.
- **Email transport/delivery gates** previously hosted in `activeClinicEmailDelivery.js`, with platform admin settings resolving status via product registration (PC03) — and historically via direct AC require.

Preserve Zambia formats, E.164 normalization (`phoneNumberService` already platform), cookie/journey behavior, and product email templates/branding.

---

## 2. Phone — old / new ownership

| Asset | Before | After |
|-------|--------|-------|
| Partial | `views/activeclinic/partials/phone-field.ejs` (SoT) | **`views/platform/partials/phone-field.ejs`** (SoT) |
| JS | `public/activeclinic/ac-phone-field.js` | **`public/platform/phone-field.js`** |
| CSS | `public/activeclinic/ac-phone-field.css` | **`public/platform/phone-field.css`** |
| BB include | → platform → AC | → **platform** |
| AC include | local SoT | **shim** → platform |

### Compatibility shims

| Path | Role |
|------|------|
| `views/activeclinic/partials/phone-field.ejs` | Include shim → platform partial |
| `views/blessboard/v5/partials/phone-field.ejs` | Include → platform (unchanged pattern) |
| `public/activeclinic/ac-phone-field.js` | Full-content shim (header: SoT is platform); legacy URL still works |
| `public/activeclinic/ac-phone-field.css` | Full-content shim for legacy URL |

### View consumers retargeted to `/platform/phone-field.*`

BB shells/pages: apex/hq/branch/member/platform-admin shells, register, login, forgot-password.  
AC layouts: `public-shell`, `auth-shell`, `app-shell`, `patient-shell`.

DOM hooks (`data-ac-phone-field`, `.ac-phone-field`) **retained** for existing CSS/tests.

Normalization remains `src/platform/services/phoneNumberService.js` (unchanged).

---

## 3. Email — old / new ownership

| Concern | Before | After |
|---------|--------|-------|
| Production gates / status | `activeClinicEmailDelivery.js` | **`src/platform/email/outboundEmailTransport.js`** |
| Resend HTTPS adapter | `activeClinicEmailResendAdapter.js` | **`src/platform/email/resendEmailAdapter.js`** |
| AC templates / subjects / CTA / recipient semantics | AC messages + `sendActiveClinicEmail` | **Still AC** (`activeClinicEmailMessages`, `sendActiveClinicEmail`) |
| AC Resend path | local file | **re-export shim** → platform |
| Platform admin outbound status | registry → AC `resolveOutboundEmailStatus` | registry → AC wrapper that calls **platform** transport with AC sender env keys |

### Product-specific retained in ActiveClinic

- `TEMPLATE` / `buildActiveClinicEmailMessage`
- `ACTIVECLINIC_EMAIL_FROM*` sender preference (platform also accepts generic `EMAIL_*`)
- Invite / review delivery hint copy
- Domain call sites: password recovery, staff invite, registration review/approval

### Platform → AC email dependency

```text
src/platform/** — zero requires of activeClinicEmailDelivery / Resend adapter
```

`getPlatformAdminSettingsView` continues to use `resolveOutboundEmailStatusSafe` from `productRuntimeRegistry` (PC03).

---

## 4. Consumers searched

### Phone partial / assets

- All `views/**` includes of `phone-field`
- BB/AC shells linking `ac-phone-field.{js,css}`
- Tests: characterization, zambia validation, BB/AC phone parity, shared phone identity, BB registration phone, V5 frontend assets, AC phase 8–10 / pass7 mobile / a11y

### Email delivery

- `approveClinicRegistrationService`, `clinicRegistrationReviewService`, `activeClinicPasswordRecoveryService`, `activeClinicStaffInvitationService`
- `registerActiveClinicPlatformContracts` (outbound status resolver)
- `getPlatformAdminSettingsView` (via registry only)
- Tests: `activeclinic-transactional-email`, `activeclinic-mf07-staff-invite`

---

## 5. Tests

| Suite | Result |
|-------|--------|
| `tests/v10-pc02-platform-consolidation-characterization.test.js` | PASS (phone ownership assertions updated) |
| `tests/v2-zambia-phone-validation.test.js` | PASS |
| `tests/v7-shared-phone-identity.test.js` | PASS |
| `tests/v7-bb-ac-phone-parity.test.js` | PASS |
| `tests/v8-shared-verification.test.js` | PASS |
| `tests/activeclinic-transactional-email.test.js` | PASS |
| `tests/activeclinic-mf07-staff-invite.test.js` | PASS |
| `tests/v7-shared-registration-country-selection.test.js` | PASS |
| `tests/activeclinic-registration-terms.test.js` | PASS |
| `tests/blessboard-v5-frontend-assets.test.js` | 1 pre-existing fail (`content-admin/page.ejs` media-picker locals regex — unrelated to phone URL retarget; apex phone URL assert updated & passes) |

### Pre-existing (not caused by PC05)

- `blessboard-platform-account-recovery` — catalogue / `user_roles` freeze
- `blessboard-registration-phone` uniqueness suite — unrelated DB/fixture issue (normalizeRegistrationPhone subsuite **PASS**)

Core PC05 block (characterization + ZM phone + shared phone + parity + verification + transactional email + V5 assets): **83/84** with the single fail documented above as pre-existing media-picker assertion.

---

## 6. Behavior changes

**None intended.**

- Zambia default / formats / `phoneNumberService` unchanged
- Legacy `/activeclinic/ac-phone-field.*` URLs still serve shim content
- AC email adapter ids (`activeclinic_email_*`) preserved for tests
- Templates, subjects, branding remain product-owned

---

## 7. Verdict

```text
PLATFORM_PHONE_INFRA_PASS
PLATFORM_EMAIL_TRANSPORT_PASS
```
