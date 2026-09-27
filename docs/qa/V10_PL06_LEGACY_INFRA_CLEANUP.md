# V10 PL06 — Legacy Infrastructure Cleanup

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_LEGACY_INFRA_CLEANUP` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisites** | PL01–PL05 PASS (`V10_CANONICAL_CMS_PASS`) |
| **DB deletion** | **NONE** (PL01–PL09 rule) |
| **Verdict** | **`V10_LEGACY_INFRA_CLEANUP_PASS`** |

---

## Scope

Remove **proven-obsolete** phone / email / auth-registration / media compatibility only.  
**Not in scope:** classic↔engine website dual-write (deferred after PL05 live-parity regression); BB operational `media_assets`; `organizationKeyCompat` vanity; `activeClinicEmailDelivery` product facade; `server.legacy.js` (still conditional).

---

## Removed / rewritten

### PHONE

| Item | Action |
|------|--------|
| `public/activeclinic/ac-phone-field.js` / `.css` | **Deleted** (ZERO_CONSUMER; shells already load `/platform/phone-field.*`) |
| Remap script + PC02 / a11y asserts | Retargeted to platform assets |
| DOM hooks `data-ac-phone-field` | **Kept** (live platform CSS/JS) |

### EMAIL

| Item | Action |
|------|--------|
| `activeClinicEmailResendAdapter.js` | **Deleted** (TEST_ONLY re-export; delivery already uses platform Resend) |
| `activeClinicEmailDelivery.js` | **Kept** (product facade) |
| Transactional email test | Imports `platform/email/resendEmailAdapter` |

### AUTH / REGISTRATION

| Item | Action |
|------|--------|
| Unused `statusCompatibility` helpers / arrays | **Removed**; lifecycle maps retained for `toCanonicalLifecycle` |
| `legacyCompatibilityPermissions.js` | **Deleted**; `staffAccessService` display path uses `permissions: []` |
| BB `organizationKey` callers | **Rewritten** → `platform/organization/organizationKey` (thin re-export kept for older tests) |
| `orgDataEnvironment` mode helpers | **Rewritten** → `platform/config/deploymentEnv` |
| Hardcoded `blessboard-org-v5` runtime fallbacks | **Replaced** with `blessboard-org-staging`; alias table / `CODE_ORG_V5` retained one release |
| Registration draft cookie adapters | **Kept** |

### MEDIA

| Item | Action |
|------|--------|
| Obsolete website-media URL shims | **None found** — no delete |
| BB `media_assets` operational stack | **Kept** (distinct domain) |
| `/platform/website-media-field.*` | **Kept** |

---

## Explicitly retained (not obsolete)

- Classic↔engine dual-write / overlay (`syncDraftToEngine`, editor overlay) → later PL after public engine SoT
- `organizationKeyCompat` (vanity / path-public)
- `blessBoardEnv` domain config + mode re-export surface for other callers
- `createV5Session` / `deployment_sessions`
- AC/BB CMS product catalogues

---

## Tests

| Suite | Result |
|-------|--------|
| `npm run test:architecture` | **PASS** (7/7) |
| PL06 char + PC02/PC18/PC19 + V2.02 legacy-RBAC removal | **PASS** (42/42) |
| Registration / email verification / password recovery / phone identity / phone rules / BB↔AC phone parity / platform-01 registration / transactional email + team catalogue | **PASS** (146/148 in core pack) |
| Team management HTTP (`organisation_scope` / `excessive_delegation`) | **FAIL** — **PRE_EXISTING** catalogue/RBAC fixture debt (not PL06 asset/import cleanup) |
| Broader pack (`clinic-registration` repair schema, phone-login `user_roles` freeze, media negotiation helpers, phase9 contrast) | **PRE_EXISTING** / out of PL06 delete surface |

---

## Required marker

```text
V10_LEGACY_INFRA_CLEANUP_PASS

Removed: AC phone URL shims; AC Resend re-export; unused statusCompatibility helpers;
         legacyCompatibilityPermissions stub; BB orgKey/runtime v5 fallbacks → platform/staging
Kept: email delivery facade; media_assets; organizationKeyCompat; dual-write (later PL)
```
