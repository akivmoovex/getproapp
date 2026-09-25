# V2.01 Release Notes Center QA

**Task:** `V2_01_RELEASE_NOTES_INTERNAL_QA` (follow-on)  
**Prior tasks:** `V2_01_RELEASE_NOTES_CENTER`, `V2_01_RELEASE_NOTES_HOSTED_DEPLOY_AND_QA`  
**Date:** 2026-09-25  
**Branch:** `V8`  
**Deployment:** `moovex-platform-v8-testing` (neuniversity.org)  
**Database:** `moovex-platform-v7` / `testing`  
**Products:** BlessBoard, ActiveClinic, Shared GetPro Platform  
**Priority:** P1  

**Production:** untouched  

---

## Verdict

**`V2_01_RELEASE_NOTES_CENTER_QA_BLOCKED`**

Public routes, unauthorized denial, sanitization, version URLs, BB/AC regression, and production isolation are **verified**.

**Authorized internal unlock could not be completed in this agent session:** `RELEASE_NOTES_INTERNAL_TOKEN` is not available to the verifier (not in local `.env` / shell env). The token value was never printed, logged, or written into this report. Per security rules, the agent will not invent a token or bypass the gate.

Operator stated the variable is configured on Hostinger. To close this PASS gate, re-run verification with the secret injected **only** into the verification process environment (not committed, not pasted into docs).

---

## 1. Hosted deployment and SHA

| Item | Value |
|------|-------|
| Live hub `/healthz` gitSha | `cfd941c3f8f6` |
| BB V8 `/healthz` | `cfd941c3f8f6` · `moovex-platform-v8-testing` · `testing` |
| AC V8 `/healthz` | `cfd941c3f8f6` · `moovex-platform-v8-testing` · `testing` |
| Feature-bearing app commit (prior) | `1c01649891c1` (ancestor; conflict-guard + RNC) |
| Current tip includes docs commit | `cfd941c3` (docs-only after `1c016498`) |
| Production BB/AC | `03a89106e2fe` · `moovex-platform-production` · **untouched** |

Note: Operator brief cited `1c01649891c1`; live hosts have advanced to docs tip `cfd941c3f8f6` while remaining on the same V8 testing deployment. Release Notes routes still respond **200**.

---

## 2. Public route verification

| Path | HTTP | Result |
|------|------|--------|
| `/release-notes` | **200** | Overview; public audience |
| `/release-notes/1.0` … `/2.01` | **200** | All six versions |
| `/release-notes/2.01/qa` | **200** | Checklist without Evidence column |
| `/release-notes/2.01/share` | **200** | Sanitized summary |
| `/release-notes/2.01/bugs` | **200** | (prior hosted matrix) |
| `/release-notes/2.01/print` | **200** | (prior hosted matrix) |

**Shareable public URL:** https://neuniversity.org/release-notes  

Public HTML scan: no `RELEASE_NOTES_INTERNAL_TOKEN` name, no `postgres://` / `SESSION_SECRET` patterns, no internal `docs/qa/V2_01_*` evidence paths on public QA view, `data-audience="public"`.

---

## 3. Internal access verification

| Check | Result |
|-------|--------|
| Token present in verifier environment | **No** |
| Authorized internal unlock (correct credential) | **NOT EXECUTED** — credential unavailable to agent |
| Token printed / logged / committed / embedded in docs | **No** |
| Token-bearing URLs recorded in this report | **No** |

### Required operator handoff (no value in git)

For a one-shot re-verify only:

1. Export `RELEASE_NOTES_INTERNAL_TOKEN` into the **local verification shell** (same value as Hostinger; do not commit).
2. Prefer header auth: `X-Release-Notes-Internal-Token` (avoid query strings in shared links).
3. Confirm `/release-notes/2.01/qa` shows Evidence column + source paths **only** with the correct credential.
4. Unset the shell variable after the run.

---

## 4. Unauthorized access verification

| Check | Result |
|-------|--------|
| No token → public view (no Evidence column, no docs/qa source paths) | **PASS** |
| Wrong query `internal_token` → still public (locked) | **PASS** |
| Wrong header `X-Release-Notes-Internal-Token` → still public (locked) | **PASS** |
| Share panel remains sanitized under wrong/missing token | **PASS** |

---

## 5. Regression

| Check | Result |
|-------|--------|
| `npm run test:v8:hosted-smoke` BB+AC | **PASS** (`gitSha=cfd941c3f8f6`) |
| Production healthz | Unchanged (`03a89106e2fe`, production) |

---

## 6. Remaining security gaps

| Gap | Severity | Notes |
|-----|----------|-------|
| Authorized internal QA not closed in this session | **Blocks PASS** | Verifier lacks Hostinger token value |
| Query-param token (`?internal_token=`) | Medium | Can leak via browser history, Referer, and access logs if used in shared links. Prefer header-only usage now; recommend later migration to authenticated role-based QA access (session/RBAC) without long-lived shared secrets in URLs |
| Stitch Release Notes UI | Low | Still DOCUMENTATION PENDING |

---

## 7. Explicit non-actions

| Action | Done? |
|--------|-------|
| Print / log / commit token | **No** |
| Invent / bypass token | **No** |
| Production modify | **No** |
| Redeploy for this task | **No** (not required) |

---

## Verdict (restated)

**`V2_01_RELEASE_NOTES_CENTER_QA_BLOCKED`** — public + unauthorized gates PASS on hosted V8; authorized internal unlock **not verified** because the configured Hostinger token is not available to this verification environment.
