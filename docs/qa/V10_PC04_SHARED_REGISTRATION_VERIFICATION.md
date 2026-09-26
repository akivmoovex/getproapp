# V10 PC04 — Shared Registration Draft + Verification Infra

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_PC04_SHARED_REGISTRATION_VERIFICATION` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisites** | PC01–PC03 PASS |
| **Verdicts** | **`SHARED_REGISTRATION_DRAFT_PASS`** · **`SHARED_VERIFICATION_INFRA_PASS`** |
| **Deploy / production** | **NOT TOUCHED** |

---

## 1. Goal

Eliminate low-risk BB/AC infrastructure clones for registration draft cookies and shared verification wrappers without merging church/clinic provisioning semantics.

Preserve: cookie names/behavior, registration journeys, verification subjects, security rules, error behavior.

---

## 2. Duplicate LOC removed

| Surface | Before (product LOC) | After (product thin adapters) | Shared owner added | Product clone removed |
|---------|----------------------|-------------------------------|--------------------|------------------------|
| Registration drafts | 97 + 97 = **194** | 14 + 14 = **28** | `signedRegistrationDraftCookie.js` **121** | **~166 LOC** |
| Verification wrappers | 75 + 75 = **150** | 25 + 25 = **50** | `createProductVerificationAdapter.js` **102** | **~100 LOC** |
| **Total** | **344** | **78** | **223** | **~266 LOC** of duplicated product mechanism |

Net: products no longer own HMAC cookie crypto or verification dispatch boilerplate; only product config keys remain.

---

## 3. New shared owners

### Registration drafts

```text
src/platform/registration/signedRegistrationDraftCookie.js
  createSignedRegistrationDraftCookie({ cookieName, maxAgeMs? })
```

Complements existing `registrationDraftLifecycle.js` (continuity / sanitize / `gpRegNav`).

Re-exported from `src/platform/registration/index.js` as `createSignedRegistrationDraftCookie`.

### Verification

```text
src/platform/verification/createProductVerificationAdapter.js
  createProductVerificationAdapter({ productKey, subjectKind, purpose? })
```

Delegates to existing `sharedVerificationService.js` (OTP engine unchanged).

---

## 4. Adapter boundaries

| Product file | Config only | Preserved exports |
|--------------|-------------|-------------------|
| `src/blessboard/services/churchRegistrationDraft.js` | `cookieName: "bb_reg_draft"` | `COOKIE_NAME`, `read/write/clearRegistrationDraft` |
| `src/activeclinic/services/clinicRegistrationDraft.js` | `cookieName: "ac_reg_draft"` | same |
| `src/blessboard/services/blessBoardSharedVerification.js` | `productKey: blessboard`, `subjectKind: blessboard_user` | branded start/complete/status + `RESULT`/`CHANNEL` |
| `src/activeclinic/services/activeClinicSharedVerification.js` | `productKey: activeclinic`, `subjectKind: platform_identity` | branded start/complete/status + `RESULT`/`CHANNEL` |

**Not merged:** church vs clinic registration provisioning, review policy, or plan/entitlement semantics.

---

## 5. Tests

| Suite | Result |
|-------|--------|
| `tests/v10-pc02-platform-consolidation-characterization.test.js` | PASS (draft cookies + verification export contracts) |
| `tests/v8-shared-verification.test.js` | PASS |
| `tests/v7-unified-registration-engine.test.js` | PASS |
| `tests/v7-shared-registration-country-selection.test.js` | PASS |
| `tests/v7-bugs-09-registration-lifecycle.test.js` | PASS |
| `tests/activeclinic-registration-terms.test.js` | PASS |
| `tests/v7-shared-phone-identity.test.js` | PASS |
| **Core PC04 block** | **79/79** (+ 19/19 extras) |

### Pre-existing failures (not caused by PC04)

Confirmed by re-running with **HEAD** product draft implementations (pre-extraction):

- `tests/activeclinic-mf03-registration.test.js` — template chrome assertions (password copy / terms markup); fails with old draft file too
- `tests/blessboard-instant-free-registration.test.js` — phone validation / provisioning expectations; fails with old draft file too

These do not exercise the extracted HMAC factory differently from HEAD.

---

## 6. Behavior changes

**None intended.**

- Cookie names remain `bb_reg_draft` / `ac_reg_draft`
- HMAC + httpOnly + SameSite=Lax + 1h max-age unchanged
- Passwords still stripped via shared sanitize
- Verification subjects remain `blessboard_user` vs `platform_identity`
- Cross-cookie-name HMAC readability (same signing secret) unchanged — already locked by PC02 characterization

---

## 7. Verdict

```text
SHARED_REGISTRATION_DRAFT_PASS
SHARED_VERIFICATION_INFRA_PASS
```
