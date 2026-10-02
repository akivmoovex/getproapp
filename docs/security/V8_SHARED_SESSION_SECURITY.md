# V8 Shared Session & Logout Security

**Status:** Active  
**Branch:** `V8`  
**Module:** `src/platform/session/sharedSessionSecurity.js`

## Goals

1. Secure BlessBoard and ActiveClinic browser sessions with one shared stack.
2. Keep V7 (pronline.org) and V8 (neuniversity.org) testing sessions isolated while sharing PostgreSQL.
3. Prevent Back/cache restoration of authenticated pages after logout.

## Cookie & secret isolation

| Concern | V7 testing | V8 testing |
|---------|------------|------------|
| Deployment code | `moovex-platform-testing` | `moovex-platform-v8-testing` |
| Session cookie | `moovex_platform_testing_sid` | `moovex_platform_v8_testing_sid` |
| CSRF cookie | `moovex_platform_testing_csrf` | `moovex_platform_v8_testing_csrf` |
| Signing secret | `SESSION_SECRET` | `SESSION_SECRET_V8` (falls back to `SESSION_SECRET`) |

Cookies are always **host-only** (no `Domain=`), **HttpOnly** (session), **SameSite=Lax**, and **Secure** when `NODE_ENV=production`.

Session token storage remains `platform.deployment_sessions` (SHA-256 hash). V8 does **not** delete or rewrite V7 rows.

## Shared helpers

- `issueAuthenticatedSessionCookie` — after auth, issues a new cookie and revokes any prior cookie for **this deployment only** (session fixation defense).
- `logoutAuthenticatedBrowserSession` — deployment-scoped revoke + host-only clear + logout cache headers.
- `createAuthenticatedResponseNoStoreMiddleware` — once `req.v5Session.authenticated`, sets private/no-store.
- `resolveSessionSigningSecret` — V8 prefers `SESSION_SECRET_V8` for CSRF HMAC.

## Logout / revoke scope

All browser logout paths call the shared terminator. SQL always includes `AND deployment_code = $n`. A V8 logout cannot invalidate a concurrent V7 session for the same user.

Password reset and staff recovery revoke sessions with the same deployment filter.

## Cache policy

- Authenticated shells, `/api/*`, account/invite/verify/reset, patient/billing paths: `Cache-Control: private, no-store` (+ Vary: Cookie).
- Logout responses also set `Clear-Site-Data: "cache"` (origin-scoped; pronline vs neuniversity stay isolated).
- Public marketing / static assets keep existing safe caching (`express.static` maxAge on public files).

## Tests

`tests/v8-shared-session-security.test.js` covers cookie/secret isolation, concurrent cookies, login regeneration, V8-only revoke, expiry/direct URL gates, and Back-after-logout simulation.
