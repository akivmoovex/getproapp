# Platform Multi-Step Form State — Design (Minimum Fix)

| Field | Value |
|-------|--------|
| **Doc ID** | `PLATFORM_MULTI_STEP_FORM_STATE_DESIGN` |
| **Status** | **IMPLEMENTED** (see `docs/qa/V2_04_PLATFORM_MULTI_STEP_FORM_STATE_IMPL.md`) |
| **Inputs** | `docs/qa/V2_04_REGISTRATION_STATE_AUDIT.md` (+ existing `src/platform/registration/*` draft stack) |
| **Goal** | One reusable, server-controlled multi-step form draft/state mechanism for BlessBoard + ActiveClinic registration and future platform forms |
| **Constraint** | Prefer adapting existing draft infrastructure; no competing second store |
| **Date** | 2026-10-01 |
| **Finish** | **`PLATFORM_MULTI_STEP_FORM_STATE_IMPLEMENTED`** |

---

## 0. Problem statement (from audit)

Existing shared pieces already provide:

- HMAC-signed httpOnly draft cookies (`bb_reg_draft` / `ac_reg_draft`)
- Separate encrypted password vault cookies (`bb_reg_pwd` / `ac_reg_pwd`)
- Continuity query flag `gpRegNav=1`
- Product-thin adapters + product validation in BB/AC routes

**Defect:** `resolveRegistrationDraftForGet` **clears** a valid draft on any GET lacking `gpRegNav=1`. Refresh / back / mid-step GET without that flag wipes Step 1. Merge `{...draft, ...body}` can also blank prior fields when later steps omit or empty-post them.

**Non-goals for this design:** express-session / v5Session as draft store; inventing a second cookie/DB system alongside the current one; moving BB/AC validation into platform.

---

## 1. Design principles

| # | Principle | Design choice |
|---|-----------|---------------|
| 1 | Survive next / back / refresh / validation | Valid in-window draft **always hydrates** on wizard GETs; clear only on explicit fresh-start |
| 2 | Do not erase populated fields | Server merge with **non-empty overlay** + step allowlists |
| 3 | Server-controlled | Draft payload written only by server after CSRF-validated POST; client cannot invent signed contents |
| 4 | Do not trust client for protected fields | Protected keys ignored from body; server copies from prior draft only |
| 5 | Product validation stays in adapters | Platform stores opaque `fields` map; BB/AC validate before accept |
| 6 | No BB/AC imports in platform | Product codes + cookie names injected via config |
| 7 | URL/UI compatibility | Keep `/register-church`, `/register-clinic`, `?step=`; keep `gpRegNav` as **compat alias**, not sole continuity gate |
| 8 | Cross-draft isolation | Per-product cookie names; optional `draftNonce`; no draft id in URL |
| 9 | Tamper protection | Existing HMAC (draft) + AES-GCM vault; reject bad signatures as null |
| 10 | Expiry / cleanup | Keep ~1h max-age; mark `status=completed` then clear; periodic natural expiry |
| 11 | Success completion | On successful registration/provision start success path: mark completed + clear draft (+ vault) |
| 12 | Failed provisioning retry | On provision failure: **retain** draft + vault until expiry; do not clear |
| 13 | Secrets | Passwords **never** in reusable draft fields; vault only, as today |

**Storage decision (minimum):** remain **cookie-backed** (adapt current stack). **No DB migration** for V1. Optional later server-side draft (see §10) if cookie size or multi-device resume becomes required.

---

## 2. Files to reuse (unchanged responsibility, may be called by new API)

| File | Role |
|------|------|
| `src/platform/registration/signedRegistrationDraftCookie.js` | HMAC read/write/clear factory — **reuse as storage backend** |
| `src/platform/registration/registrationPasswordVault.js` | Encrypted secret vault — **reuse; do not put secrets in draft** |
| `src/platform/registration/registrationReturnContext.js` | Allowed paths/steps; return links — keep |
| `src/platform/registration/registrationRenderLocals.js` | `registrationStepHref` — keep; still append continuity markers |
| `src/blessboard/services/churchRegistrationDraft.js` | Thin `bb_reg_draft` adapter — keep |
| `src/activeclinic/services/clinicRegistrationDraft.js` | Thin `ac_reg_draft` adapter — keep |
| Product validators (`platformChurchRegistrationValidation.js`, AC clinic validators) | Stay product-owned |

---

## 3. Files to modify

| File | Change |
|------|--------|
| `src/platform/registration/registrationDraftLifecycle.js` | **Replace clear-by-default GET policy** with hydrate-if-valid; explicit fresh clear; export shared merge helpers or delegate to new merge module |
| `src/platform/registration/registrationTransaction.js` | Align password-vault clear with new GET policy (clear vault only when draft intentionally cleared) |
| `src/platform/registration/signedRegistrationDraftCookie.js` | Extend payload shape: `status`, `currentStep`, `draftNonce`, `schemaVersion`, `updatedAt` (keep `formData`) |
| `src/platform/registration/registrationRenderLocals.js` | Prefer hydrate-safe step URLs; retain `gpRegNav=1` for backward compatibility |
| `src/blessboard/http/apexMarketingRoutes.js` | Use platform merge + new GET hydrate; **PRG** after successful `next-*`; retain draft on provision failure; complete/clear on success |
| `src/activeclinic/http/activeClinicPublicRoutes.js` | Same as BB |
| Registration EJS (BB/AC) | Optional: stop relying on hiddens as sole state (keep as progressive enhancement / CSRF only where needed) — **minimal** template churn |

---

## 4. Minimal new platform modules

Keep registration folder as home for V1 (callers already depend on it). Add **two** small modules + one barrel export for future non-registration forms:

| # | New module | Purpose |
|---|------------|---------|
| 1 | `src/platform/registration/multiStepDraftMerge.js` | Field merge / empty-skip / protected-key rules (product-agnostic) |
| 2 | `src/platform/forms/multiStepFormState.js` | Thin façade: `createMultiStepFormState({ cookieName, productCode, secretFieldNames })` wrapping cookie + lifecycle + merge + vault hooks — **no product imports** |

Registration routes continue to use existing `resolveRegistrationTransactionForGet` / draft adapters; façade is for future forms and a single documented API.

**`NEW_PLATFORM_MODULES=2`**

---

## 5. Draft data model (cookie payload)

Signed JSON (existing HMAC envelope unchanged):

```text
{
  schemaVersion: 1,
  status: "active" | "completed",          // completed → treat as absent on read
  draftNonce: "<opaque random>",           // set on first write; never client-supplied
  currentStep: "<string>",                 // last accepted step key (product vocabulary)
  formData: { ... },                       // non-secret fields only
  updatedAt: <epoch_ms>
}
```

| Field | Rules |
|-------|--------|
| `formData` | No password / password_confirm / tokens / CSRF secrets |
| `draftNonce` | Server-generated; included in signature; optional future binding to CSRF cookie |
| `status=completed` | Read returns null; Set-Cookie Max-Age=0 on success path |
| Max size | Soft-cap (e.g. refuse write > ~3KB payload); products keep fields lean |

**Password vault** (unchanged conceptually): separate cookie; cleared with draft on fresh-start and on success; **retained** on validation errors and provisioning failure.

---

## 6. Merge semantics

Implemented in `multiStepDraftMerge.js`:

```text
mergeDraftFields({ prior, incoming, options })
```

| Rule | Behavior |
|------|----------|
| Base | Start from `sanitize(prior)` |
| Overlay | For each key in `incoming`, apply only if **accepted** |
| Empty skip | Skip `null`, `undefined`, `""` (and whitespace-only) unless `options.allowEmptyKeys` includes that key |
| Protected keys | Listed by product adapter (`organization_key` after server mint, identity ids, etc.) — **never** taken from client; kept from `prior` or set by server |
| Secret keys | Always stripped from both prior and incoming before draft write (vault owns them) |
| Replace-all | Forbidden for step POSTs; only explicit `fresh` reset replaces entire draft |

Product adapters may supply:

- `stepFieldAllowlist[step]` — keys this step may update
- `protectedKeys`
- `secretKeys` (default password aliases)

This satisfies: “populated fields must not be erased merely because a later step does not submit them.”

---

## 7. GET hydration semantics

Replace current:

- continuity only if `gpRegNav=1`, else **clear**

With:

| Request | Behavior |
|---------|----------|
| `?fresh=1` (or POST `action=restart`) | Clear draft + vault; redirect to first step **without** draft |
| Valid active draft cookie (HMAC OK, not expired, `status=active`) | **Restore** `formData` into locals regardless of `gpRegNav` |
| Mid-wizard `?step=` with **no** draft | Redirect to first step (unchanged safety) |
| First step with no draft | Empty defaults (unchanged) |
| `gpRegNav=1` | **Compat only** — treated as continuity; no longer required for restore |
| `status=completed` or expired | Treat as no draft; clear cookie |

Password vault: clear **only** when draft is cleared (fresh/success), not on every “bare” GET.

---

## 8. POST semantics

| Action | Platform | Product adapter |
|--------|----------|-----------------|
| CSRF fail | No draft write | Re-render with merge(prior, body) for display if desired |
| `next-*` / step advance | After **product validation OK**: `mergeDraftFields` → `writeDraft`; update `currentStep` | Validate step fields only |
| Validation fail | **Do not** clear draft; optionally merge non-empty safe fields from body into display model; keep prior draft on disk | Return step + errors |
| `confirm` / final submit | Read draft + vault; product builds provision payload from **server draft**, not raw body alone | Validate full aggregate |
| Success (registration accepted / provision OK / already provisioned success) | `status=completed` + clear draft + clear vault | Product success UI |
| Provision failure (retryable) | **Retain** draft + vault; do not mark completed | Show error; retry uses same draft |

**PRG recommendation (BB + AC):** after successful `next-*`, respond `303` to `GET ?step=<next>` (with optional `gpRegNav=1` for old clients). Refresh then GETs with hydrate-if-valid — no double POST.

Hidden fields may remain for progressive enhancement but **must not** be the source of truth.

---

## 9. Completion semantics

| Event | Draft | Vault |
|-------|-------|-------|
| Wizard abandoned / TTL | Expire naturally (Max-Age) | Same |
| Explicit restart (`fresh=1`) | Clear | Clear |
| Final success | Mark completed + clear | Clear |
| Provisioning failed | Keep `active` | Keep until TTL |
| Operator cancels application | Product may call clear | Clear |

No DB row required for V1 completion accounting; cookie status is sufficient for browser-bound flows.

---

## 10. BB adapter

| Concern | Approach |
|---------|----------|
| Cookie | Keep `churchRegistrationDraft.js` → `bb_reg_draft` |
| Routes | `apexMarketingRoutes.js`: switch GET to new hydrate; POST uses `mergeDraftFields` with BB allowlists; PRG after `next-church` / `next-admin` |
| Validation | Unchanged `validateChurchRegistration*Step` / full validate |
| Protected | e.g. server-minted `organization_key` after church step |
| Secrets | Continue `persistRegistrationPasswordFromBody` / vault |
| Provision fail | Ensure failure render paths do **not** call `clearRegistrationDraft` |
| UI | Keep steps `church` / `administrator` / `review`; URLs stable |

**BB_CHANGES** (file touch count for implementation planning): draft adapter (0–1 if signature only), routes (1), optional 1–2 templates → count **3** primary (routes + lifecycle call sites + templates/hiddens cleanup optional). For footer use discrete change units: routes, merge wiring, success/fail clear policy = **3**.

---

## 11. AC adapter

| Concern | Approach |
|---------|----------|
| Cookie | Keep `clinicRegistrationDraft.js` → `ac_reg_draft` |
| Routes | `activeClinicPublicRoutes.js`: same hydrate / merge / PRG / retain-on-fail |
| Validation | Unchanged clinic step validators + location resolve |
| UI | Steps `clinic` / `administrator` / `review` stable |

**AC_CHANGES=3** (routes, merge wiring, success/fail clear policy) — symmetric to BB.

---

## 12. Migration requirement

**`DB_MIGRATION=NO`** for the minimum design.

Optional future (out of V1): `platform.multi_step_form_drafts` table for large payloads / cross-device resume keyed by signed `draftId` — would be a **follow-on**, not required to fix refresh/back erasure.

---

## 13. Compatibility risks

| Risk | Mitigation |
|------|------------|
| Clients/bookmarks that relied on “open register URL clears draft” | Document; provide explicit `?fresh=1` / “Start over” control |
| Old tests asserting clear-without-`gpRegNav` | Update to new policy (`v7-bugs-09`, PC02 characterization) |
| Cookie size growth | Soft-cap; keep fields lean |
| Empty-skip hiding intentional clears | Allowlist keys that may be cleared explicitly (rare) |
| Hidden fields still posting empties | Empty-skip + protected keys prevent wipe |
| Multi-tab races | Last successful POST wins (`updatedAt`); acceptable for V1 |
| Provision retry without cookie | V1 limitation: browser must still hold cookie; documented; DB draft is Phase 2 |
| Cross-product cookie confusion | Separate cookie names retained |

---

## 14. Security model (cross-user / tampering)

- Draft contents only accepted if HMAC verifies under `SESSION_SECRET`.
- No draft identifier in query string for V1 (cookie-bound browser).
- `draftNonce` server-set; body/`draftNonce` from client ignored.
- CSRF remains required on POST (existing).
- Product A cannot read product B cookie names.
- Secrets only in vault cookie; never echoed to HTML/logs.
- Platform modules take `productCode` / `cookieName` as parameters — **zero** requires of BlessBoard/ActiveClinic packages.

---

## 15. Required automated tests

### Platform (new / updated)

| TEST_ID | Scenario | Expected |
|---------|----------|----------|
| T-FS-01 | Write draft → GET mid-step **without** `gpRegNav` | Prior fields restored; cookie not cleared |
| T-FS-02 | GET `?fresh=1` with existing draft | Draft + vault cleared; first-step empty |
| T-FS-03 | POST step2 with omitted step1 keys | Step1 values retained in draft |
| T-FS-04 | POST step2 with empty string for step1 key | Step1 retained (empty-skip) |
| T-FS-05 | POST attempts to overwrite protected key | Prior/server value kept |
| T-FS-06 | Password in body | Absent from draft cookie; present only in vault when persisted |
| T-FS-07 | Tampered cookie signature | Read null; no throw leak |
| T-FS-08 | Expired `updatedAt` | Read null |
| T-FS-09 | `status=completed` | Read null / treated absent |
| T-FS-10 | Merge allowlist: disallowed key in body | Ignored |

### BB integration

| TEST_ID | Scenario | Expected |
|---------|----------|----------|
| T-BB-01 | `next-church` → GET `?step=administrator` (no gpRegNav) | Church fields present |
| T-BB-02 | Refresh admin step URL | Same |
| T-BB-03 | Back link to church step | Fields preserved |
| T-BB-04 | Admin validation error | Church fields still present |
| T-BB-05 | Provision failure path | Draft cookie still readable afterward |
| T-BB-06 | Success path | Draft cleared / completed |

### AC integration

| TEST_ID | Scenario | Expected |
|---------|----------|----------|
| T-AC-01 | `next-clinic` → GET admin without gpRegNav | Clinic fields present |
| T-AC-02 | Refresh admin | Same |
| T-AC-03 | Validation error on admin | Clinic fields retained |
| T-AC-04 | Success clears draft | Cookie absent |
| T-AC-05 | Provision/application failure retains draft | Cookie present |

### Regression updates

- Rewrite `resolveRegistrationDraftForGet` unit expectations in `tests/v7-bugs-09-registration-lifecycle.test.js` and related PC02 characterization tests to match hydrate-if-valid + `fresh=1`.

---

## 16. Implementation order (when approved)

1. `multiStepDraftMerge.js` + unit tests T-FS-03..05,10  
2. Lifecycle GET policy + cookie payload fields + T-FS-01,02,06..09  
3. Façade `platform/forms/multiStepFormState.js`  
4. BB routes PRG + merge + retain-on-fail + T-BB-*  
5. AC routes same + T-AC-*  
6. Update legacy `gpRegNav`-clear tests  

---

## 17. Counts

| Item | Count |
|------|------:|
| New platform modules | **2** (`multiStepDraftMerge.js`, `forms/multiStepFormState.js`) |
| BB change units | **3** (routes hydrate/PRG/merge, clear-on-success vs retain-on-fail, optional template/hidden de-emphasis) |
| AC change units | **3** (symmetric) |
| DB migration | **NO** |

---

NEW_PLATFORM_MODULES=2
BB_CHANGES=3
AC_CHANGES=3
DB_MIGRATION=NO
FINAL=PLATFORM_MULTI_STEP_FORM_STATE_IMPLEMENTED
