# BlessBoard V5 — Logging and sensitive-data exposure audit

**Date:** 2026-07-19  
**Constraint:** Audit + clear exposure fixes only. Do not disable operational logging or hide failures.  
**Companions:** [`V5_SESSION_COOKIE_AUDIT.md`](./V5_SESSION_COOKIE_AUDIT.md) · [`V5_ENVIRONMENT_VARIABLE_REFERENCE.md`](../deployment/V5_ENVIRONMENT_VARIABLE_REFERENCE.md) · [`V5_CSRF_ACTION_AUDIT.md`](./V5_CSRF_ACTION_AUDIT.md)

---

## 1. Verdict

| Question | Answer |
|----------|--------|
| Secrets (`DATABASE_URL`, passwords, `SESSION_SECRET`, raw tokens) appear in V5 console logs? | **No** (after this pass) |
| Access logs redact transfer query params? | **Yes** (`tr` / `code` / `transfer` → `REDACTED`) |
| Request IDs available for correlation? | **Yes** (`X-Request-Id` + morgan `req_id=`) |
| User-facing errors generic? | **Yes** |
| Clear exposure defects fixed this pass? | **Yes** (see §4) |

---

## 2. Surfaces reviewed

| Surface | Primary files | What is logged |
|---------|---------------|----------------|
| Request / access | `v5FoundationServer.js` (morgan), `tenantLoginHelpers.redactAuthTransferQuery` | Method, redacted URL, status, timing, **requestId** — not cookies/headers/bodies |
| Authentication | `authenticateBlessBoardUser.js`, login limiter in `v5FoundationServer.js` | **No** console logs on success/failure; throttle key = `sha256(email\|ip)` (not logged); HTML 429 only |
| Session / transfer | `createV5Session`, `authTransferService`, `revokeV5Session` | **No** console logging; DB stores hashes; redirects use raw tokens in Location (not logged by morgan; subsequent GETs redacted) |
| Database startup | `pool.js`, `blessBoardOrgDbGate`, `v5EnvValidation.summarizeV5DatabaseEnv` | Presence flags + redacted host fingerprint; pool errors → **code only** |
| Tenant-routing diagnostics | `loadBlessBoardTenantRouting`, catalogue / host-comparison loggers | Hostname, result types, **keys** (not UUIDs), path (no query), optional `requestId` |
| Upload errors | `mediaUploadService`, `supabaseStorage`, content admin JSON | Client gets `upload_failed`; Error messages use status **without** API body |
| Error middleware | `v5SafeLogging.createV5ErrorHandler` | Structured `{ event, requestId, method, path, status, code }` — no cookies/Authorization/body; production omits message text |
| Audit events | `auditEventService.sanitizeAuditMetadata`, `recordBlessBoardAudit` | Allowlisted metadata only; DB failures return `reason: "db_error"` |

---

## 3. Exclusion checklist

| Item | In V5 logs / audit storage? |
|------|------------------------------|
| `DATABASE_URL` value | No (yes/no + fingerprint only) |
| Passwords / password hashes | No |
| `SESSION_SECRET` | No |
| Raw session tokens | Access log redacts query; services do not log |
| Session-token hashes | DB only; not console-logged |
| Raw transfer tokens | Redacted in access logs |
| CSRF secrets / signed values | Not logged |
| Cookies / Authorization headers | Not logged |
| Full uploaded file / storage paths | Not returned; Supabase Error no longer embeds API body |
| Private form submissions / answers | Audit stores `field_keys` only |
| Bank / card / donor PII | Forbidden metadata keys |
| Member email/phone beyond need | Forbidden in audit metadata; auth does not log email |
| DB error payloads / SQL params | Audit returns `db_error`; pool logs `code=` only |
| Login throttle plaintext email+IP | Key is hashed; handler does not log the key |

---

## 4. Gaps found and fixes

| Gap | Risk | Fix |
|-----|------|-----|
| No request ID on V5 app | Hard to correlate incidents | `assignV5RequestId` + morgan `req_id=` + `X-Request-Id` |
| No terminal Express error handler | Unhandled errors → default stack dump | `createV5ErrorHandler` — generic client text + safe JSON log |
| Supabase Error embedded API body (200 chars) | Latent path/key leak if Error logged | Status-only messages |
| Audit `reason` returned raw `err.message` | SQL detail if callers log `reason` | Always `db_error` |
| Catalogue / host-comparison logs included UUIDs | Unnecessary tenancy mapping in console | Keys / codes only; IDs remain on `req` |
| Pool `err.message` logged verbatim | Possible verbose driver text | `formatSafePoolErrorMessage` → `code=` |

---

## 5. Operational logging retained

- Morgan access lines (with transfer redaction + request id)
- Shadow / authoritative routing decision JSON (keys, outcomes, reasons)
- Catalogue lookup **error** diagnostics (keys + resultType)
- Host-comparison diagnostics (keys + deployment codes)
- Registration / review structured events (church/branch ids + outcome codes — no form PII)
- Startup DB presence / fingerprint / foundation banners
- Safe error event lines with requestId + code

---

## 6. Tests

| Suite | Command |
|-------|---------|
| Sensitive-data exclusions | `node --test tests/v5-logging-sensitive-data.test.js` |
| Auth | `npm run test:blessboard:auth` |
| Sessions | `npm run test:platform:sessions` |
| Routing diagnostics | `npm run test:blessboard:tenant-routing` |
| Catalogue / comparison (related) | `node --test tests/blessboard-catalogue-http-context.test.js tests/platform-host-comparison.test.js` |
