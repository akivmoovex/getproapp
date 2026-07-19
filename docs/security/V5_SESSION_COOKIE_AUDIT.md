# BlessBoard V5 — Session and cookie security audit

**Date:** 2026-07-19
**Constraint:** Audit + clear defect fixes only. Do not introduce `connect-pg-simple`, `public.session`, parent-domain cookies, or legacy session fallback.
**Companions:** [`V5_CSRF_ACTION_AUDIT.md`](./V5_CSRF_ACTION_AUDIT.md) · [`V5_AUTHORIZATION_MATRIX.md`](./V5_AUTHORIZATION_MATRIX.md) · `docs/database/ARCHITECTURE.md` (V5 apex auth / transfer)

---

## 1. Verdict

| Question | Answer |
|----------|--------|
| Hash-only session storage (SHA-256)? | **YES** |
| Host-only session cookie (no `Domain=.blessboard.org`)? | **YES** |
| HttpOnly + SameSite=Lax + Path=/ ? | **YES**; Secure when `NODE_ENV=production` |
| Transfer tokens single-use, ≤5m, hostname/deployment/tenant-bound? | **YES** |
| Clear security defect fixed this pass? | **YES** — return-path traversal (`/hq/../…`) rejected |
| Architecture redesigned? | **NO** |

---

## 2. Components inspected

| Area | Files |
|------|-------|
| Token + TTL | `src/platform/session/sessionToken.js` |
| Cookie helpers | `src/platform/session/v5SessionCookie.js` |
| Create / read / revoke | `createV5Session.js`, `readV5Session.js`, `revokeV5Session.js` |
| Login / logout / callback | `src/platform/http/v5FoundationServer.js` |
| Transfer service | `src/platform/services/authTransferService.js` |
| Transfer helpers | `src/blessboard/http/tenantLoginHelpers.js` |
| Logout clears | HQ / BA / member / PA route modules |
| Schema | `platform.deployment_sessions`, `platform.auth_transfers` |
| Tests | `platform-v5-sessions`, `blessboard-auth-http`, `blessboard-tenant-auth`, host-comparison |

---

## 3. Controls verified

| Control | Implementation | Status |
|---------|----------------|--------|
| Raw tokens never persisted | INSERT `session_token_hash` / `transfer_token_hash` only | **PASS** |
| SHA-256 hashes | `crypto.createHash("sha256").digest("hex")` | **PASS** |
| Token entropy | `crypto.randomBytes(32)` → base64url | **PASS** |
| Deployment-scoped sessions | Row + read require matching `deployment_code` | **PASS** |
| Expiration enforced | `expires_at` 12h absolute; read rejects past | **PASS** |
| Expired cannot reuse | Unit + read path | **PASS** |
| Logout invalidates stored session | `revokeV5Session` sets `revoked_at` + clear cookie | **PASS** |
| Cookie host-only | No `domain` option on set/clear | **PASS** |
| HttpOnly | `httpOnly: true` | **PASS** |
| Secure in production | `secure` when `NODE_ENV=production` | **PASS** |
| SameSite=Lax | Explicit | **PASS** |
| Cookie path `/` | Explicit | **PASS** |
| No shared `.blessboard.org` | Never set; HTTP asserts no `Domain=` | **PASS** |
| Transfer single-use | Consume on redeem; replay → consumed | **PASS** |
| Transfer short-lived | `TRANSFER_TTL_MS` ≤ 5 minutes | **PASS** |
| Transfer hostname-bound | Create + redeem check `requested_hostname` | **PASS** |
| Transfer deployment-bound | Hash lookup + deployment match | **PASS** |
| Transfer tenant-bound | Redeem checks org/church/(branch) vs host tenant | **PASS** |
| Failed transfers no token leak | HTML/logs omit raw `tr`/`code`; errors generic | **PASS** |
| Redirects allow-listed | `sanitizeReturnPath` / `safeTenantNextPath` | **PASS** (hardened) |
| Errors no hash/internal ID leak | Fixed messages; GUI tests | **PASS** |
| Cleanup cross-deployment | No purge job yet; reads always deployment-scoped | **N/A** (see risks) |

---

## 4. Defect fixed this pass

| Issue | Risk | Fix |
|-------|------|-----|
| `sanitizeReturnPath` accepted `/hq/../evil` (and encoded `%2e%2e`) | Same-origin open path after transfer callback | Decode → `path.posix.normalize` → reject if `..` remains or allowlist fails |

File: `src/platform/services/authTransferService.js`.

---

## 5. Test gaps closed

| Gap | Added where |
|-----|-------------|
| Path traversal / open redirect cases for `safeTenantNextPath` | `tests/blessboard-tenant-auth.test.js` |
| Token entropy + SHA-256 hex shape + 12h TTL constant | `tests/platform-v5-sessions.test.js` |
| Cookie helper flags (HttpOnly, Secure prod, SameSite, Path, no domain) | `tests/platform-v5-sessions.test.js` |

Already covered elsewhere: logout revoke, transfer single-use/hostname/deployment, no Domain= on Set-Cookie, hash-only DB rows.

---

## 6. Remaining risks / ambiguities

| Topic | Note |
|-------|------|
| No session/transfer purge job | Expired rows rely on read-time rejection; indexes exist on `expires_at`. When adding cleanup, scope by `deployment_code`. |
| DB CHECK vs app allowlist for `/member` | App allows `/member` next; `auth_transfers.return_path` CHECK is `hq\|branch-admin\|account` only — insert fail-closed. Product decision whether to add `/member` to CHECK (schema) or drop from app. |
| DB CHECK still permits `/hq/../x` syntactically | App now rejects; schema not changed this pass. |
| `defaultTenantPostLoginPath` unused on callback | Members without `return_path` default to `/branch-admin` — product follow-up, not cookie scope. |
| CSRF cookie is not HttpOnly | Intentional double-submit; separate from session cookie. |

---

## 7. Suggested commit message

```
Harden V5 transfer return-path sanitization and document session cookie controls.
```
