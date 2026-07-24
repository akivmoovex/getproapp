# PHASE2_056 — Security Audit (Stitch Prompts 1–7)

**Date:** 2026-07-24  
**Mode:** Audit + **minimal fixes only** for confirmed Prompt 1–7 security defects  
**Scope:** Platform Admin registration surfaces (`/admin/registration-applications*`) + public email verification (`/register/email-verification*`)  
**Out of scope:** Approval / rejection / provisioning redesign; new features; unrelated PA modules  

### Verdict legend

| Verdict | Meaning |
|---------|---------|
| **PASS** | Controls present; no fix required for this bar |
| **FIXED** | Defect confirmed and patched in this prompt |
| **RISK** | Residual / inherent risk; no code change required now |
| **FAIL** | Open defect (none remaining after this prompt) |

---

## Executive summary

| Category | Verdict |
|----------|---------|
| CSRF | **PASS** |
| Permission bypass / IDOR | **PASS** |
| Token exposure | **FIXED** (access-log path redaction) |
| Email enumeration | **PASS** |
| Unsafe redirects | **PASS** |
| Unescaped applicant data | **PASS** |
| Raw storage paths | **PASS** |
| Sensitive duplicate data | **PASS** |
| Missing reason validation | **PASS** |
| Client-controlled verification / checklist / recommendation | **FIXED** (public `?outcome=verified` spoof) + **PASS** (admin loaders) |
| Cross-application phone / duplicate writes | **PASS** |
| Rate-limit gaps | **PASS** |
| Raw database errors | **PASS** |

**Open FAIL after fixes:** none.

---

## Fixes shipped in this prompt

### 1. Token exposure in access logs — **FIXED**

**Defect:** `GET /register/email-verification/:token` put the plaintext token in the request URL. Morgan logged `:url-redacted`, but `redactAuthTransferQuery` only redacted transfer query params (`tr` / `code` / `transfer`), not email-verify path tokens.

**Fix:** Extend `redactAuthTransferQuery` in `src/blessboard/http/tenantLoginHelpers.js` to rewrite:

`/register/email-verification/<token>` → `/register/email-verification/REDACTED`

(without redacting `/register/email-verification/result`).

**Tests:** `tests/v5-logging-sensitive-data.test.js`, `tests/blessboard-tenant-auth.test.js`, `tests/blessboard-phase2-056-security.test.js`.

### 2. Spoofable public verification success UI — **FIXED**

**Defect:** `GET /register/email-verification/result?outcome=verified` rendered the success page from an allowlisted query alone. Anyone could open that URL and see a “verified” message without consuming a token. (Did **not** change DB ownership used by admin facts.)

**Fix:** Successful consume sets a short-lived **httpOnly signed flash cookie** (`bb_email_verify_flash`). The result page only shows `verified` when that flash validates; bare `?outcome=verified` now renders `invalid`. `rate_limited` remains allowlisted from query / limiter handler.

**Files:** `src/blessboard/http/apexMarketingRoutes.js`  
**Tests:** public email-verify route suite + `tests/blessboard-phase2-056-security.test.js`.

---

## Category findings

### CSRF — **PASS**

All Phase2 registration admin POSTs (phone attempt, email resend, duplicate decision, follow-up, contact, approve/reject legacy, etc.) call `validateCsrf` before mutation. Forms embed `_csrf`. Public email verify is GET-only.

### Permission bypass — **PASS**

Admin routes use `requireApex` + `requirePlatformAdmin` (`platform_admin` + active user). Public verify is apex-only and unauthenticated by design.

### Token exposure — **FIXED** (+ residual **RISK**)

| Control | Status |
|---------|--------|
| DB stores hash only | PASS |
| Admin UI never shows plaintext token | PASS |
| Redirect drops token from Location | PASS |
| Access logs redact path token | **FIXED** |
| Browser history / emailed link still contain token | **RISK** (inherent to magic links) |

### Email enumeration — **PASS**

Consume collapses failures to a single safe `invalid` outcome. Public responses are only `verified` | `invalid` | `rate_limited`. Admin resend errors are allowlisted codes under platform-admin auth.

### Unsafe redirects — **PASS**

Duplicate `return_to` allowlisted to compare vs list. Flash `notice`/`error` are codes mapped in EJS, not open redirect targets. Public verify redirects to a fixed relative result path.

### Unescaped applicant data — **PASS**

Applicant/church/contact fields use `<%= %>` escaping. `<%-` reserved for trusted partials (`include`, status chips).

### Raw storage paths — **PASS**

No document upload paths; documents section is an honest empty-state.

### Sensitive duplicate data — **PASS**

Platform-user matches withhold email/phone. Compare shows authorized registration/org fields only for platform-admin review. Evidence snapshots store signals/reasons, not raw mailbox contents.

### Missing reason validation — **PASS**

Server enforces reason (≥3 chars) for `impersonation_concern`, `confirmed_duplicate`, and strong/confirmed overrides including `different_church`.

### Client-controlled verification / checklist / recommendation — **FIXED** / **PASS**

| Surface | Verdict |
|---------|---------|
| Admin detail facts / recommendation / checklist | **PASS** — derived server-side; query/body forgeries ignored |
| Public result `?outcome=verified` | **FIXED** — requires signed flash |

### Cross-application phone / duplicate writes — **PASS**

Phone attempts use route `applicationId` only. Duplicate match get/write scoped by `(matchId, applicationId)`. Wrong match → `not_found` / no write.

### Rate-limit gaps — **PASS**

Public consume + result: IP+host limiter (default 30 / 15 min). Admin resend: auth + CSRF + 60s service cooldown. No public resend endpoint.

**RISK:** GET one-click consume can be hit by mail scanners (product pattern; not a missing limiter).

### Raw database errors — **PASS**

Mutations map to safe redirect error codes. Loaders return unavailable/empty payloads. Public consume never returns exception text. Server logs truncate messages and omit tokens.

---

## Focused security tests run

```text
node --test \
  tests/blessboard-phase2-056-security.test.js \
  tests/blessboard-registration-email-verification-public-route.test.js \
  tests/v5-logging-sensitive-data.test.js
```

**Result:** **35/35 pass** (focused suites above). Coverage includes:

- Access-log token redaction  
- Spoofed `?outcome=verified` rejected without flash  
- Signed flash accepts verified  
- Client-forged verification payloads ignored by facts builders  
- Cross-application match decision → `not_found` / no write  
- Duplicate decision POST without CSRF → `?error=csrf` / no write  
- Consume redirect Location never echoes plaintext token  

---

## Residual risks (no code change in 056)

1. Magic-link tokens remain in email clients and browser history until expiry/consume.  
2. GET consume may be invalidated by automated link scanners — consider POST confirmation later.  
3. Align reverse-proxy / CDN access logs with the same path redaction pattern outside the Node process.

---

## Related documents

- `PHASE2_055_FUNCTIONAL_AUDIT.md` — functional completeness  
- `PHASE2_007_PERMISSION_AUDIT.md` — permission baseline  
- `PHASE2_033_EMAIL_VERIFICATION_ARCHITECTURE_AUDIT.md` — token design  
- `PHASE2_005_ROUTE_MAP.md` — routes  

---

## Conclusion

Prompt 1–7 security bar: **PASS after two minimal fixes** (access-log token redaction; anti-spoof verification result flash). No remaining FAIL items in the audited categories. Scope was not broadened into approval/rejection/provisioning redesign.
