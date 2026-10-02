# V2.04 Registration Wizard State Audit

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_REGISTRATION_STATE_AUDIT` |
| **VERSION** | **2.04** |
| **Mode** | **READ-ONLY** (no code changes) |
| **Symptom** | Multi-step registration: Step 1 data not reliably shown/preserved on Step 2 (re-entry forced) |
| **Log signals** | `sessionExists=false` / `draftExists=false` then later `draftExists=true` |
| **Date** | 2026-10-01 |
| **Finish** | **`REGISTRATION_STATE_AUDIT_COMPLETE`** |

---

## 0. Short answers (numbered ask list)

| # | Question | Finding |
|---|----------|---------|
| 1 | Shared registration / draft engine | **Yes (partial):** `src/platform/registration/*` — signed draft cookie factory, draft lifecycle (`gpRegNav`), password vault, transaction GET resolver, render locals / return context. Orchestrator/queue/lifecycle are **post-submit** provisioning, not wizard UI state. |
| 2 | BB church wizard | `src/blessboard/http/apexMarketingRoutes.js` (`GET/POST /register-church`) + `views/blessboard/v5/apex/register-church*.ejs` |
| 3 | AC clinic wizard | `src/activeclinic/http/activeClinicPublicRoutes.js` (`GET/POST /register-clinic`) + `views/activeclinic/public/register-clinic*.ejs` |
| 4 | Draft / session / form-state infra | **HMAC-signed httpOnly cookies** (`bb_reg_draft` / `ac_reg_draft`) + separate password vault cookies (`bb_reg_pwd` / `ac_reg_pwd`). Continuity gated by query **`gpRegNav=1`**. **No DB draft** for public org registration wizard. Platform **onboarding** `current_step_key` is a **different** post-tenant flow. |
| 5 | `wizardStep` representation | Query `?step=` on GET (`church`/`administrator`/`review` BB; `clinic`/`administrator`/`review` AC). POST uses `body.action` (`next-church` / `next-clinic` / `next-admin` / `confirm`) and/or inference. Locals: `wizardStep`. |
| 6 | Where step data is persisted | **On successful step POST:** `writeRegistrationDraft(res, …)` → Set-Cookie. Passwords **stripped** from draft; stored only in password vault cookie when moving to review. |
| 7 | How GET Step 2 reconstructs Step 1 | Only if **`gpRegNav=1`**: read cookie → sanitize → merge into form locals. **Without** `gpRegNav`: **`clearDraft`** (+ clear password vault) → `restoreDraft=false` → non-step-1 redirects to clean register URL. |
| 8 | Depends on express-session? | **No** for wizard draft. Trace `sessionExists` = **`req.v5Session.authenticated`** (logged-in product session), not draft continuity. |
| 9 | DB / cookie / token draft? | **Cookie + HMAC token payload** only for wizard. No registration-wizard DB draft table found. |
| 10 | Reset / replace / filter / destructure | `sanitizeRegistrationDraftFormData` deletes password fields. Fresh GET **clears** draft. Merge = `{...draft.formData, ...body}` (body wins). `formFromBody` / `registerFormDataFromBody` re-shape/trim. AC `next-clinic` rebuilds admin payload from validated clinic fields. |
| 11 | Hidden fields | **Yes** — admin + review templates carry prior-step fields as `type="hidden"` (BB church fields on admin/review; AC clinic fields on admin). CSRF hidden. |
| 12 | Tests | Strong unit coverage for **`gpRegNav` continuity vs fresh clear**. AC/BB link hrefs include `gpRegNav`. **Gaps:** refresh of Step 2 URL without `gpRegNav`, browser back, cookie loss, validating that Step 1 values remain visible after forward POST under cookie-block / mid-wizard GET. |

---

## 1. Component matrix

| COMPONENT | PATH | CURRENT_STATE_MECHANISM | BB_USAGE | AC_USAGE | FAILURE_MODE | SHARED_OR_PRODUCT_SPECIFIC | RECOMMENDED_FIX_LOCATION |
|-----------|------|-------------------------|----------|----------|--------------|----------------------------|--------------------------|
| Signed draft cookie factory | `src/platform/registration/signedRegistrationDraftCookie.js` | HMAC cookie JSON `{ formData, updatedAt }`; max age 1h; httpOnly; SameSite=Lax | Via `churchRegistrationDraft.js` → `bb_reg_draft` | Via `clinicRegistrationDraft.js` → `ac_reg_draft` | Cookie missing/expired/HMAC fail → `read` null; silent loss | **SHARED** (product supplies name only) | Keep; harden size/secret/docs; optional server-side draft later |
| Draft continuity policy | `src/platform/registration/registrationDraftLifecycle.js` | Fresh GET **clears** cookie unless `gpRegNav=1` | Used via transaction wrapper on register GET | Same | Refresh / bookmark / external link to `?step=administrator` **without** `gpRegNav` **wipes** Step 1 | **SHARED** | **Primary fix site:** continuity policy + wizard navigation contract (see §3) |
| Registration transaction GET | `src/platform/registration/registrationTransaction.js` | Wraps draft GET; also clears password vault on fresh | BB register GET | AC register GET | Same as lifecycle | **SHARED** | Align with continuity fix |
| Password vault | `src/platform/registration/registrationPasswordVault.js` | Separate encrypted cookies; never in draft/HTML | `bb_reg_pwd` on next-admin → review | `ac_reg_pwd` | Cleared on fresh GET; passwords never restored into form | **SHARED** | Keep; ensure continuity param preserves vault when intended |
| Render / step href helpers | `src/platform/registration/registrationRenderLocals.js`, `registrationReturnContext.js` | Builds links with `gpRegNav=1` | Review/edit/back links | Same | Any link/nav omitting param breaks restore | **SHARED** | Audit all outbound registration URLs/JS |
| Product draft adapters | `src/blessboard/services/churchRegistrationDraft.js`, `src/activeclinic/services/clinicRegistrationDraft.js` | Thin `createSignedRegistrationDraftCookie({ cookieName })` | BB | AC | Misconfigured name/secret → empty reads | **PRODUCT_SPECIFIC** wrappers | Keep thin |
| BB wizard HTTP | `src/blessboard/http/apexMarketingRoutes.js` | POST `next-church` → **write draft** → **200 render** admin (not redirect). GET restores only with `gpRegNav` | Church → admin → review | — | GET mid-wizard without continuity clears/redirects; user perceives “lost Step 1” after refresh/back | **PRODUCT_SPECIFIC** route | Prefer POST-redirect-GET with `gpRegNav` **or** restore draft on step GET without requiring nav param when cookie valid |
| AC wizard HTTP | `src/activeclinic/http/activeClinicPublicRoutes.js` | Same pattern: `next-clinic` write + 200 admin HTML | — | Clinic → admin → review | Same as BB | **PRODUCT_SPECIFIC** route | Same platform continuity contract |
| BB templates | `views/blessboard/v5/apex/register-church.ejs`, `register-church-review.ejs` | Hidden church fields on admin/review; `wizardStep` gates sections | Carries Step 1 on Step 2 POST body | — | Empty hiddens if `form` empty after failed restore | **PRODUCT_SPECIFIC** | Keep hiddens as backup; do not rely on them alone for GET resume |
| AC templates | `views/activeclinic/public/register-clinic.ejs`, `register-clinic-review.ejs` | Hidden clinic fields on admin step; edit links use `gpRegNav` | — | Same | Same | **PRODUCT_SPECIFIC** | Same |
| Trace logging | `src/blessboard/services/registrationTraceLog.js` + BB POST traces | Logs `draftExists`, `sessionExists` | BB church POST | (AC has separate logging) | Misread logs as “session lost = draft lost” | BB-focused | Document: `sessionExists` ≠ draft |
| Field sanitize / merge | lifecycle sanitize; BB `formFromBody` / `mergeChurchRegistrationForm`; AC `registerFormDataFromBody` + location apply | Strip passwords; trim; body overlays draft | Yes | Yes | Overwrite with empty body keys if client posts blank hiddens | Shared sanitize + product mappers | Reject empty overlay for known prior-step keys **or** omit empty keys on merge |
| Platform onboarding step DB | `src/platform/onboarding/repository.js` | `current_step_key` in DB | Post-provision tenant onboarding | Same family | **Not** public register wizard | **SHARED** but **out of wizard scope** | Do not conflate with register-church/clinic |
| express-session / v5Session | Product auth middleware | Login session | Trace only | — | Anonymous register always `sessionExists=false` | Auth stack | **Not** the draft store |

---

## 2. Log interpretation (`sessionExists` / `draftExists`)

### `sessionExists=false`

In BB traces this is **`Boolean(req.v5Session && req.v5Session.authenticated)`**.

- Expected for **anonymous** church registration.
- **Does not** mean the draft cookie is missing.
- **Does not** by itself explain Step 1 → Step 2 data loss.

### `draftExists=false` then later `draftExists=true`

On BB POST, after CSRF accept, code does:

1. `readRegistrationDraft` → often **`false`** on **first** Step 1 POST (no cookie yet).  
2. On `next-church` success: `writeRegistrationDraft` → next request / subsequent POST can show **`draftExists=true`**.

So that sequence is **consistent with a healthy first-step write**, not proof of a failed Step 2 restore.

### When logs *do* explain the symptom

| Situation | What happens | User-visible effect |
|-----------|--------------|---------------------|
| GET `?step=administrator` **without** `gpRegNav=1` | Lifecycle **clears** draft cookie | Redirect to Step 1 / empty form → **re-enter Step 1** |
| Refresh browser on admin URL that lacks `gpRegNav` | Same clear | Same |
| Cookie blocked / third-party / expired / HMAC fail | `draftExists=false` on later POSTs; GET cannot restore | Hidden fields may still carry data **only if** still on same POST response document; GET resume fails |
| Relying on `sessionExists` as draft health | False correlation | Wrong diagnosis |

**Verdict:** Observed `sessionExists=false` + `draftExists=false→true` **alone does not prove** the defect; the **continuity clear-on-fresh-GET** policy **does** explain forced re-entry when Step 2 is reached or reloaded via GET without `gpRegNav=1`. Confidence **HIGH** for that class of failure. Cookie/transport failures remain a possible second class (**MEDIUM** without env repro).

---

## 3. Root-cause model (platform-level)

```
Step1 POST ──write bb_reg_draft/ac_reg_draft──► Step2 HTML (200) with form + hiddens
                                                    │
                    ┌───────────────────────────────┼───────────────────────────────┐
                    ▼                               ▼                               ▼
             Continue POST                    GET ?step=2                      GET fresh
             (merge draft+body)            with gpRegNav=1                 without gpRegNav
                    OK                         restore OK                    CLEAR COOKIE
                                                                              → empty / redirect
```

**Shared draft engine exists but is opt-in continuity**, not “always restore if cookie present.” That is the architectural gap for “reliable multi-step forms.”

---

## 4. Test coverage vs needed scenarios

| Scenario | Coverage today | Gap |
|----------|----------------|-----|
| Forward navigation (POST next-*) | BB/AC focused multi-step drafts + PRG 303 | Closed for registration wizards |
| Back navigation | Hydrate-if-valid GET + `gpRegNav` compat links | Closed (refresh/back without flag restores) |
| Refresh | Platform + BB + AC focused tests without `gpRegNav` | Closed |
| Validation failure | Empty-skip merge + protected keys unit tests | Closed at platform merge layer |
| Session loss | Draft cookies independent of express session | Closed (sessionless draft path) |
| Draft resume | `v2-04-*-multi-step-*` + updated `v7-bugs-09` | Closed |

**Implementation:** `docs/qa/V2_04_PLATFORM_MULTI_STEP_FORM_STATE_IMPL.md` (design `docs/architecture/PLATFORM_MULTI_STEP_FORM_STATE_DESIGN.md`).

---

## 5. Recommended fix location (resolved)

1. **`registrationDraftLifecycle.js` / transaction GET** — **DONE:** hydrate-if-valid; clear on `?fresh=1` / completed.  
2. **Product routes** — **DONE:** PRG 303 after `next-*`; allowlisted merge; retain on provision failure.  
3. **Keep** signed cookie + password vault — **DONE** (no DB draft).  
4. **Do not** move wizard state into express-session — **honored**.  
5. **Shared multi-step form tests** — **DONE** (`tests/v2-04-platform-multi-step-form-state.test.js`, BB/AC draft suites).

---

## 6. Footer

SHARED_DRAFT_ENGINE_EXISTS=YES
BB_STATE_GAP=RESOLVED (hydrate + PRG + merge allowlists)
AC_STATE_GAP=RESOLVED (same shared mechanism)
ROOT_CAUSE_CONFIDENCE=HIGH
FINAL=REGISTRATION_STATE_AUDIT_RESOLVED_BY_PLATFORM_FORM_STATE
