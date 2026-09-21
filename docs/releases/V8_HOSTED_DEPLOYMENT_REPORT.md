# V8 Hosted Deployment and Read-Only Verification (PROMPT 25)

**Verdict:** `V8_HOSTED_DEPLOYMENT_PASS`  
**Branch:** `V8` only  
**Recorded:** 2026-09-21  
**Approved application SHA (deployed):** `bee21fed8e877d5dcd8c21144b68d54564cfd22c`  
**Migration report baseline:** `bee21fed` ([`V8_TESTING_MIGRATION_EXECUTION.md`](./V8_TESTING_MIGRATION_EXECUTION.md))  
**This documentation commit:** recorded after verification (advances `origin/V8` beyond the deployed app SHA — see §1)

### Explicit non-actions

| Action | Performed? |
|--------|------------|
| Hosted write QA / create tenants | **No** |
| Notifications | **No** |
| Production deploy / env / media / migration changes | **No** |
| V7 deploy or restart | **No** |
| Authenticated session screen rendering | **Not claimed** (no authorized hosted login) |

---

## 1. SHA accounting (important)

| Role | SHA | Notes |
|------|-----|-------|
| **Approved / deployed application** | `bee21fed8e877d5dcd8c21144b68d54564cfd22c` | Hosted `/healthz` `gitSha=bee21fed8e87` on all three V8 hosts |
| **Later report commit on `origin/V8`** | (this file’s commit) | Docs-only; **do not** treat as a deployment mismatch |

Hostinger’s existing V8 mechanism is a **git-linked Node app on branch `V8`**. After `origin/V8` reached `bee21fed`, all three V8 hosts already served that SHA. No additional hPanel pull/restart was required in this prompt, and no unrelated env/DB/media changes were made.

There is **no in-repo Hostinger CLI deploy script**; operator panel actions remain the fallback if hosts lag tip.

---

## 2. Source and environment (Step 1)

| Check | Result |
|-------|--------|
| `git fetch origin V8` | OK |
| Current branch | `V8` |
| Working tree | Clean before report commit |
| Approved `origin/V8` HEAD at verify start | `bee21fed8e877d5dcd8c21144b68d54564cfd22c` |
| V8 deployment profile | `moovex-platform-v8-testing` (live `/healthz` + DB row `active`) |
| Database identity | `moovex-platform-v7` / `testing` |
| Migration tips | platform **042** · BlessBoard **112** |

**STOP conditions:** none.

---

## 3. V7 baseline (before) — Step 2

| Host | HTTP `/` | `/healthz` | gitSha | deploymentCode | schemaCompatible |
|------|----------|------------|--------|----------------|------------------|
| `https://blessboard.pronline.org` | 200 | ok | `03a89106e2fe` | `moovex-platform-testing` | **true** |
| `https://activeclinic.pronline.org` | 200 | ok | `03a89106e2fe` | `moovex-platform-testing` | **true** |

V7 not deployed or restarted.

---

## 4. V8 deployment (Step 3)

| Item | Result |
|------|--------|
| Target | **Only** `moovex-platform-v8-testing` |
| Mechanism | Existing Hostinger git-linked app on branch `V8` (already at approved tip) |
| Manual hPanel restart | **Not required** (SHA already matched) |
| Env / DB / media / migrations modified | **No** |

---

## 5. Hosted read-only verification (Step 4)

### 5.1 Health / identity (all three hosts)

| Host | `/` | `/healthz` | gitSha | deploymentCode | platformLine | expectedIdentityKey | schemaCompatible | environment |
|------|-----|------------|--------|----------------|--------------|---------------------|------------------|-------------|
| `https://neuniversity.org` | 200 | 200 ok | `bee21fed8e87` | `moovex-platform-v8-testing` | v8 | `moovex-platform-v7` | **true** | testing |
| `https://blessboard.neuniversity.org` | 200 | 200 ok | `bee21fed8e87` | `moovex-platform-v8-testing` | v8 | `moovex-platform-v7` | **true** | testing |
| `https://activeclinic.neuniversity.org` | 200 | 200 ok | `bee21fed8e87` | `moovex-platform-v8-testing` | v8 | `moovex-platform-v7` | **true** | testing |

`npm run test:v8:hosted-smoke` → **PASS** for BlessBoard + ActiveClinic (`gitSha=bee21fed8e87`).

### 5.2 Public surfaces

| Route | Status | Notes |
|-------|--------|-------|
| Apex `/` | 200 | Title **Moovex Platform V8 QA**; BlessBoard + ActiveClinic links; V2.0 branding present |
| BB `/` | 200 | Home · BlessBoard |
| BB `/login` | 200 | Sign in · BlessBoard |
| BB `/about` | 200 | Loads |
| AC `/` | 200 | ActiveClinic |
| AC `/login` | 200 | Sign in · ActiveClinic |
| AC `/clinics` | 200 | Find a Clinic |
| AC `/directory` | 404 | Path not used; catalogue is `/clinics` |
| BB `/announcements` on product hub | 503 | Body: *This page is not yet available in BlessBoard V5.* — expected **tenant-surface** gating on product host without church tenant context (not Hostinger edge 503) |
| BB `/register` on product hub | **timeout** | No response within 25–30s on product host without tenant church hostname — **not claimed PASS**; verify on a church tenant host during write QA |

No unexpected unauthenticated redirects on public home/login/clinics. No Hostinger edge-only 503 on healthz/home.

### 5.3 BB18-M route (`GET /branch-admin/members`)

| Check | Result |
|-------|--------|
| Status | **401** |
| Body | `Sign-in is required.` |
| Header | `x-bb-auth-reason: no_session_cookie` |
| Authenticated render | **Not tested** (no authorized session) |

Expected unauthenticated access gate confirmed.

### 5.4 Public media

| URL | Status | Type | Bytes |
|-----|--------|------|------:|
| `https://blessboard.neuniversity.org/media/testing/platform/blessboard/brand/blessboard-small-church-logo.png` | 200 | image/png | 79208 |

---

## 6. V7 regression (after) — Step 5

| Host | gitSha (unchanged) | schemaCompatible | `/` | Media sample |
|------|--------------------|------------------|-----|--------------|
| BlessBoard pronline | `03a89106e2fe` | true | 200 | PNG 200 (same brand asset path) |
| ActiveClinic pronline | `03a89106e2fe` | true | 200 | — |

V7 SHAs **unchanged** from baseline. V7 remains operational.

---

## 7. Migration / DB tips (unchanged by deploy)

| Item | Value |
|------|-------|
| DB identity | `moovex-platform-v7` / `testing` |
| platform tip | **042** `042_shared_tenant_announcements.sql` |
| blessboard tip | **112** `112_announcement_public_audience_v8.sql` |
| Migrations applied in this prompt | **None** |

---

## 8. Observations / non-blockers for deployment PASS

1. **BB `/register` hang on product hub** — investigate during hosted write QA on a **church tenant hostname**; does not contradict healthz/SHA/identity deployment success.
2. **BB `/announcements` 503 on product hub** — foundation unavailable message for non-tenant surface; use tenant hosts for BB21–BB22 public checks.
3. **Authenticated 84-screen visual QA** — deferred (requires login sessions).

---

## 9. Blockers

**None for deployment PASS.**

---

## 10. Return code

```
V8_HOSTED_DEPLOYMENT_PASS
```

Approved application SHA **`bee21fed`** is live on all three V8 hosts as `moovex-platform-v8-testing` against shared DB **`moovex-platform-v7` / testing**, with **`schemaCompatible=true`**. V7 control SHAs unchanged. No write QA, production changes, or V7 restarts were performed.
