# V10 PC18 — Organization Key Lift

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_PC18_ORGANIZATION_KEY_LIFT` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisite** | PC17 `V10_PC17_CHECKPOINT_READY` / `V10_CLEAN_CHECKPOINT_CREATED: YES` |
| **Features added** | **NONE** (ownership lift only) |
| **Deploy / production DB** | **NOT TOUCHED** |
| **Verdict** | **`PLATFORM_ORGANIZATION_KEY_LIFT_PASS`** |

---

## 1. Old dependency

| Edge | Detail |
|------|--------|
| **AC → BB** | `src/activeclinic/services/approveClinicRegistrationService.js` → `blessboard/services/organizationKey` (`resolveBaseOrganizationKey` via deprecated `slugFromClinicName`) |
| **Platform → BB** (related) | `allocateUniqueOrganizationKey.js`, `registrationSlugPreview.js`, `platformAdminRoutes.js` required the same BB module |

Allowlist debt (pre-lift):  
`activeclinic/services/approveClinicRegistrationService.js|blessboard/services/organizationKey`

---

## 2. New owner

| Path | Role |
|------|------|
| **`src/platform/organization/organizationKey.js`** | SoT — slugify / normalize / resolveBase / suffix / reserved list |
| `src/blessboard/services/organizationKey.js` | Thin re-export of platform (compatibility) |
| Kept product-local | `organizationKeyCompat.js`, `churchUrlHelper.js`, branch keys, path-public routing |

Generic semantics lifted: NFKD slugify, `ORG_KEY_RE`, reserved-token set, numeric `-02` collision suffixes, reserved-escape order (`${slug}-church`, `org-${slug}`, `c-${slug}`) for **exact historical parity**.

Church-specific URL/compat **not** platformized.

---

## 3. Consumers (after)

| Consumer | Requires |
|----------|----------|
| `platform/organization/allocateUniqueOrganizationKey.js` | `./organizationKey` |
| `platform/registration/registrationSlugPreview.js` | `../organization/organizationKey` |
| `platform/http/platformAdminRoutes.js` | `../organization/organizationKey` |
| `activeclinic/.../approveClinicRegistrationService.js` | `platform/organization/organizationKey` |
| BlessBoard services/routes/tests via `blessboard/services/organizationKey` | re-export → platform |

---

## 4. Behavior parity

Characterization: `tests/v10-pc18-organization-key-lift.test.js` (golden vectors locked pre-lift against BB).

| Check | Result |
|-------|--------|
| Platform ↔ BB re-export same function identities | **PASS** |
| Slugify / normalize / resolveBase / suffix goldens | **PASS** |
| BB platform-01 collision `-02`/`-03` allocation | **PASS** |
| AC platform-02 shared slug allocator | **PASS** |
| Pure slugify cases in miniwebsite suite | **PASS** |
| Public URL hardening / tenant path redirects | **PASS** |

Note: `publicWebsiteUrl.normalizeOrganizationKey` remains a **separate** lowercase trim helper for URL segments — not the reserved-key normalizer.

Other slug helpers (e.g. AC department `slugifyKey`) are **domain-local** and intentionally not merged.

---

## 5. Architecture counts

```text
BB → AC:     0
AC → BB:     0  (organizationKey edge removed)
AC → church: 2 allowlisted (blessBoardEnv only — unchanged debt)

platformAllowlistSize: 31 (was 32; allocateUniqueOrganizationKey removed from Class E)
crossAllowlistSize:    2  (was 3)
```

`npm run test:architecture` → **PASS**

---

## 6. Residual (not PC18 blockers)

| Item | Notes |
|------|-------|
| AC→`church/blessBoardEnv` ×2 | Separate debt; not organization-key |
| `blessboard-registration-public-miniwebsite` DB insert | Fixture fails `branch_name` NOT NULL — pre-existing schema/fixture debt; pure slug tests + platform-01 allocation still green |
| AC registration edit GET `302` vs `200` | Draft-cookie navigation; unrelated to key lift |

---

## 7. Duplicate / related implementations searched

| Location | Action |
|----------|--------|
| BB `organizationKey.js` | Lifted → platform; shim retained |
| Platform `allocateUniqueOrganizationKey` | Now uses platform SoT |
| `publicWebsiteUrl.normalizeOrganizationKey` | Left alone (different contract) |
| AC `slugifyKey` (departments) | Left alone (entity-local) |

---

## Marker

```text
PLATFORM_ORGANIZATION_KEY_LIFT_PASS

old dependency: AC(+platform) → blessboard/services/organizationKey
new owner:      src/platform/organization/organizationKey.js
BB→AC: 0
AC→BB: 0
```
