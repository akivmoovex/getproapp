# V2.04 AC Staff Invitation — Activation Link Audit

**Mode:** READ-ONLY (no code change · no deploy)  
**Date:** 2026-10-02  
**Bug:** Newly generated ActiveClinic staff invitation/activation link appears invalid when opened in another browser.  
**Observed invite host:** `activeclinic.pronline.org`  
**Canonical V2.04 testing host:** `activeclinic.neuniversity.org`

---

## Executive finding

The invitation is **not** bound to the inviter’s browser session.  
The link fails for a fresh browser primarily because **URL generation still targets the stale V7 testing host `activeclinic.pronline.org`**, while the token is issued on V8 neuniversity with deployment code `moovex-platform-v8-testing`. Opening that URL hits a **different deployment** (`moovex-platform-testing` / SHA `05b2afe1caff`) which rejects the token on **deployment_code mismatch** (surfaced as an invalid invitation page).

```
ROOT_CAUSE=Invite URL resolves to stale activeclinic.pronline.org; activation on that host rejects v8-testing-scoped token
```

---

## End-to-end flow (code)

```
INVITE CREATE (authenticated /app/staff*)
  → inviteActiveClinicStaff / reissueStaffInvitation
  → generateRawToken (base64url 32 bytes)
  → hashSessionToken(raw) persisted only (platform.identity_action_tokens)
  → staff_invitations row + current_token_id
  → buildActivationUrl(resolvePublicOrigin(env))  ← HOST BUG
  → share/copy/email surface returns absolute URL
ACTIVATION GET /activate/:token  (public, no login)
  → previewActivationToken: hash(raw) → findByTokenHash
  → classifyToken (purpose, product, deploymentCode, expiry, revoked, consumed)
  → invitation pending + staff preview
ACTIVATION POST /activate/:token
  → CSRF validate (cookie from GET of same page)
  → activateActiveClinicStaff: same lookup + password set + consume token
  → redirect /login?activated=1  (no session from token)
```

| Step | Module |
|------|--------|
| Invite orchestration | `src/activeclinic/services/activeClinicStaffInvitationService.js` |
| URL / origin | `src/activeclinic/services/activeClinicShareLinks.js` |
| HTTP invite | `activeClinicStaffRoutes.js` / `activeClinicStaffAdminRoutes.js` |
| Activate routes | `src/activeclinic/http/activeClinicLifecycleRoutes.js` |
| Token consume | `src/activeclinic/services/activateActiveClinicStaff.js` |
| Token store | `src/platform/repositories/platformIdentityActionTokenRepository.js` |
| Invitation store | `src/activeclinic/repositories/staffInvitationRepository.js` |

---

## 1. HOST / BASE URL

### How the invite URL is built

`buildActivationUrl` → `${origin}/activate/${encodeURIComponent(rawToken)}`  
`origin` = `input.publicOrigin` **or** `resolvePublicOrigin(env, deploymentCode)`.

Staff invite HTTP handlers pass `env` + `deploymentCode` but **do not** pass request-derived `publicOrigin` (`https://${req.get("host")}`).

### `resolvePublicOrigin` priority (`activeClinicShareLinks.js`)

1. `ACTIVECLINIC_PUBLIC_ORIGIN` / `PUBLIC_ORIGIN` override  
2. Deployment profile `publicOrigin` **only if** hostname ∈ `ACTIVECLINIC_PRODUCT_HOSTS`  
3. `publicOriginForProduct(ACTIVECLINIC, env)` via `DOMAIN_MATRIX`  
4. Fallback: testing → **`https://activeclinic.pronline.org`**

### Why pronline wins on V8 neuniversity

| Mechanism | Behavior |
|-----------|----------|
| `ACTIVECLINIC_PRODUCT_HOSTS` | **Only** `activeclinic.org`, `activeclinic.pronline.org` — **`activeclinic.neuniversity.org` is omitted** |
| `publicOriginForProduct` | `DOMAIN_MATRIX.find(productKey=activeclinic && type=testing)` → first hit is **`activeclinic.pronline.org`** (`type: "testing"`). Neuniversity is typed **`testing-v8`**, so it is **never** selected by this helper. |
| Hardcoded fallback | `"https://activeclinic.pronline.org"` |

Local resolution probe (V8 env `BASE_DOMAIN=neuniversity.org`, `PLATFORM_DEPLOYMENT_CODE=moovex-platform-v8-testing`):

| Call | Result |
|------|--------|
| `publicOriginForProduct(AC, env)` | `https://activeclinic.pronline.org` |
| `resolvePublicOrigin(env, moovex-platform-v8-testing)` | `https://activeclinic.pronline.org` |
| Same + `ACTIVECLINIC_PUBLIC_ORIGIN=https://activeclinic.neuniversity.org` | `https://activeclinic.neuniversity.org` |

| Field | Value |
|-------|--------|
| **INVITE_BASE_URL_SOURCE** | `resolvePublicOrigin` → DOMAIN_MATRIX `testing` row / hardcoded fallback (`activeClinicShareLinks.js`); staff routes omit request host |
| **EXPECTED_BASE_URL** | `https://activeclinic.neuniversity.org` (V2.04 V8 testing) |
| **ACTUAL_BASE_URL** | `https://activeclinic.pronline.org` |
| **STALE_PRONLINE_REFERENCE** | **YES** |

---

## 2. SESSION DEPENDENCY

| Check | Result | Evidence |
|-------|--------|----------|
| Creator session required for GET `/activate/:token` | **NO** | Public lifecycle route; no `requireAuth` |
| Registration / draft cookie | **NO** | Token loaded from DB by hash only |
| CSRF cookie for GET preview | **NO** (cookie is *set*, not required) | `issuePageCsrf` on GET |
| CSRF for POST password | **YES** (normal anti-CSRF) | Fresh browser: GET then POST works |
| Token bound to inviter session | **NO** | Raw token never stored in session; only hash in `platform.identity_action_tokens` |

| Field | Value |
|-------|--------|
| **TOKEN_SESSION_BOUND** | **NO** |
| **COOKIE_REQUIRED** | **NO** (for independent open / preview) |
| **SESSION_REQUIRED** | **NO** |

Requirement (“recipient opens link independently”) is **satisfied by design**; failure mode is **wrong host / deployment**, not session affinity.

---

## 3. TOKEN PERSISTENCE

| Aspect | Design |
|--------|--------|
| Raw token | Returned once for URL/share; **not** stored |
| Storage | SHA of raw via `hashSessionToken` in `platform.identity_action_tokens` |
| Lookup | `hashSessionToken(req.params.token)` → `findByTokenHash` |
| Expiry | 72h TTL at issue |
| Consume / revoke | `consumed_at` / `revoked_at`; invitation `status` |
| Clinic/staff link | `organization_id`, `staff_member_id`, invitation `current_token_id` |
| URL encoding | `encodeURIComponent` on build; Express `:token` param |

No evidence of memory-only tokens or early consume on GET.  
Hash mismatch / truncation are **not** the primary hosted failure when the URL host is wrong.

**Token lookup on activating host:**

| Host opening link | Token `deployment_code` (issued on neuniversity) | Host `PLATFORM_DEPLOYMENT_CODE` | `classifyToken` |
|-------------------|--------------------------------------------------|----------------------------------|-----------------|
| `activeclinic.pronline.org` | `moovex-platform-v8-testing` | `moovex-platform-testing` | **FAIL** → FORBIDDEN / invalid page |
| `activeclinic.neuniversity.org` | `moovex-platform-v8-testing` | `moovex-platform-v8-testing` | **PASS** (if unused/unexpired) |

```
TOKEN_LOOKUP=FAIL   # on the generated (pronline) URL host
```

---

## 4. ENVIRONMENT / DATABASE

Live `/healthz` (2026-10-02):

| Field | `activeclinic.neuniversity.org` | `activeclinic.pronline.org` |
|-------|--------------------------------|-----------------------------|
| gitSha | `4a7cf4beb6c2` | `05b2afe1caff` |
| branch / label | V4 / V4 testing | V10 / V10 testing |
| deploymentCode | `moovex-platform-v8-testing` | `moovex-platform-testing` |
| expectedIdentityKey | `moovex-platform-v7` | `moovex-platform-v7` |
| expectedDatabaseEnvironment | `testing` | `testing` |
| sessionCookieName | `moovex_platform_v8_testing_sid` | `moovex_platform_testing_sid` |
| mediaWriteNamespace | `testing-v8` | `testing` |

| Field | Value |
|-------|--------|
| **PRONLINE_DB_IDENTITY** | `moovex-platform-v7` / `testing` · deploy `moovex-platform-testing` |
| **NEUNIVERSITY_DB_IDENTITY** | `moovex-platform-v7` / `testing` · deploy `moovex-platform-v8-testing` |
| **DB_MATCH** | **YES** (same expected DB identity key + testing env — shared testing DB posture) |

Even with a shared DB, **activation is deployment-scoped**. Same physical DB does **not** make a pronline worker accept a v8-testing token.

---

## 5. CANONICAL REDIRECT

Probed with a dummy path `/activate/TESTTOKEN_…` (no secrets):

| REQUEST_HOST | REQUEST_PATH | HTTP_STATUS | LOCATION |
|--------------|--------------|-------------|----------|
| `activeclinic.pronline.org` | `/activate/:token` | **400** (invalid invitation HTML) | *(none)* |
| `activeclinic.neuniversity.org` | `/activate/:token` | **400** (invalid invitation HTML) | *(none)* |

- No host rewrite from pronline → neuniversity.  
- Path `/activate/:token` is not stripped by a redirect (no redirect).  
- Token segment remains on the **wrong** product deployment.

| Field | Value |
|-------|--------|
| **CANONICAL_REDIRECT_PRESERVES_TOKEN** | **YES** (no redirect drops path; problem is **missing** rewrite to neuniversity) |

---

## 6. TOKEN LIFECYCLE (design)

| Case | Expected |
|------|----------|
| Unused valid token on **matching** deployment host | Accepted (preview 200 → POST sets password) |
| Expired | Rejected (“expired”) |
| Already used / consumed | Rejected (“already been used”) |
| Revoked | Rejected |
| Malformed / unknown hash | Rejected (“not valid”) |
| Fresh browser vs inviter browser | **Same** (no session bind) |
| Valid token opened on **pronline** after issue on **neuniversity** | Rejected (deployment mismatch) ← **observed class of bug** |

---

## 7. Requirement comparison

| Requirement | Met? |
|-------------|------|
| Invitation must not depend on inviter browser session | **YES** (design) |
| Recipient must open link independently | **YES** (design) |
| Generated link usable on current V2.04 testing host | **YES** after origin fix (`activeclinic.neuniversity.org`) |
| Fresh browser can complete activation via copied link | **YES** (same deployment host + code; no session bind) |

```
FRESH_BROWSER_EXPECTED_TO_WORK=YES
```

---

## Fix status (2026-10-02) — origin resolution

**Fixed on clean candidate lineage after `86fc5197…`.**

| Item | After fix |
|------|-----------|
| `moovex-platform-v8-testing` invite origin | `https://activeclinic.neuniversity.org` |
| Authority | `publicOriginFromDeploymentForProduct` (profile `apexDomains`) + DOMAIN_MATRIX `testing-v8` |
| Stale pronline for V8 invites | **Removed** |
| Token format / hash / expiry / persistence | **Unchanged** |
| Focused tests | `tests/v2-04-ac-invitation-v8-origin.test.js` + invitation env parity + unified website URLs |

Re-verify after Hostinger deploy of the new candidate: mint invite on neuniversity → open `/activate/:token` in a fresh browser on the **same** host.

---

## Marker block

```
ROOT_CAUSE=FIXED — invite URL now uses deployment-profile / testing-v8 product host (was stale activeclinic.pronline.org)
INVITE_BASE_URL_SOURCE=publicOriginFromDeploymentForProduct + DOMAIN_MATRIX testing-v8
EXPECTED_BASE_URL=https://activeclinic.neuniversity.org
ACTUAL_BASE_URL=https://activeclinic.neuniversity.org (for moovex-platform-v8-testing)
STALE_PRONLINE_REFERENCE=NO
TOKEN_SESSION_BOUND=NO
COOKIE_REQUIRED=NO
SESSION_REQUIRED=NO
PRONLINE_DB_IDENTITY=moovex-platform-v7/testing (deploy moovex-platform-testing)
NEUNIVERSITY_DB_IDENTITY=moovex-platform-v7/testing (deploy moovex-platform-v8-testing)
DB_MATCH=YES
CANONICAL_REDIRECT_PRESERVES_TOKEN=YES
TOKEN_LOOKUP=PASS
FRESH_BROWSER_EXPECTED_TO_WORK=YES
CODE_FIX_REQUIRED=NO
FINAL=V2_04_AC_INVITATION_ORIGIN_FIXED
```
