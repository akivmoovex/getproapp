# V2.04 Platform Multi-Step Form State — Implementation QA

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_PLATFORM_MULTI_STEP_FORM_STATE_IMPL` |
| **Status** | **IMPLEMENTED** |
| **Design** | `docs/architecture/PLATFORM_MULTI_STEP_FORM_STATE_DESIGN.md` |
| **Audit input** | `docs/qa/V2_04_REGISTRATION_STATE_AUDIT.md` |
| **Date** | 2026-10-01 |

---

## What landed

| Area | Change |
|------|--------|
| Platform merge | `src/platform/registration/multiStepDraftMerge.js` — empty-skip merge, allowlists, protected/secret keys |
| Platform façade | `src/platform/forms/multiStepFormState.js` |
| Lifecycle | `resolveRegistrationDraftForGet` **hydrates** valid drafts; clear only on `?fresh=1` / restart / completed |
| Cookie payload | `schemaVersion`, `status`, `draftNonce`, `currentStep`, `formData`, `updatedAt`; passwords stripped |
| Transaction | Vault cleared only when draft intentionally cleared |
| BB | Church registration PRG after `next-*`; step allowlists; review GET skips password (vault); retain draft on provision failure |
| AC | Clinic registration same shared mechanism; review GET skips password |

**Not changed:** BB/AC product validation ownership (still separate); UI redesign; DB draft store; express-session as draft store.

---

## Focused tests

| Suite | File | Coverage |
|-------|------|----------|
| Platform | `tests/v2-04-platform-multi-step-form-state.test.js` | Merge, empty-skip, edit, refresh/back hydrate, validation merge, expiry, cross-product denial, tamper, completion, secrets, façade |
| BB | `tests/v2-04-bb-multi-step-registration-draft.test.js` | Step1→2 preserve + refresh without `gpRegNav`; review full draft; draft retained after step advance |
| AC | `tests/v2-04-ac-multi-step-registration-draft.test.js` | Step1→2 preserve + refresh; review preserves clinic + contact fields |

Legacy continuity unit expectations updated in `tests/v7-bugs-09-registration-lifecycle.test.js` (hydrate without `gpRegNav`; clear on `fresh=1`).

---

## Security / session notes

- Draft identifiers remain HMAC-signed httpOnly cookies (`bb_reg_draft` / `ac_reg_draft`); no draft id in URL.
- Cross-product cookie names deny cross-draft access.
- Passwords stay in vault cookies only; never long-lived draft `formData`.
- CSRF field + cookie validation unchanged on POSTs.
- Wizard works with `sessionExists=false` (sessionless draft path).

---

## Footer

PLATFORM_FORM_TESTS=13/13
BB_REGISTRATION_TESTS=3/3
AC_REGISTRATION_TESTS=2/2
SESSIONLESS_FLOW=PASS
CROSS_DRAFT_ISOLATION=PASS
FINAL=PLATFORM_MULTI_STEP_FORM_STATE_IMPLEMENTED
