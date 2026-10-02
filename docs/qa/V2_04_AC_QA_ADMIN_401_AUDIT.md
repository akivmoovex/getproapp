# V2.04 AC QA Admin Login 401 — Root Cause Audit

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_AC_QA_ADMIN_401_AUDIT` |
| **Mode** | **READ-ONLY** — no code, password, user, or deploy changes |
| **Date** | 2026-10-02 |
| **Frozen hosted candidate** | `7dbe945d6c9315cbe6c6a45c7a64ee354a2fe22b` (live `/healthz` `gitSha=7dbe945d6c93`) |
| **Host** | `https://activeclinic.neuniversity.org` |
| **Deployment** | `moovex-platform-v8-testing` · `environment=testing` |
| **DB identity** | `moovex-platform-v7` / `testing` (shared with pronline V7 testing) |
| **QA credential source** | gitignored `.env.v8-qa-tenants.local` (email/phone/org key only — no secrets in this doc) |

---

## Executive finding

The hosted ActiveClinic QA admin **401 is not an auth-implementation bug**.  
`POST /login` reaches `authenticateActiveClinicIdentity`, CSRF succeeds, and the response is the generic invalid-credentials HTML page (**HTTP 401**, not 403/429).

Read-only lookup against the **same testing DB** that both neuniversity V8 and pronline V7 declare (`expectedIdentityKey=moovex-platform-v7`, `expectedDatabaseEnvironment=testing`) shows:

- Organization `ac-v8-qa-mub23a6v6a6b` → **MISSING**
- Identity for the V8 QA admin email → **0 rows**
- Identity for the V8 QA admin phone → **0 rows**
- Public clinic `/clinics/ac-v8-qa-mub23a6v6a6b` → **404**
- Sister BB disposable org `bb-v8qa-mub23a6v6a6b` → also **MISSING**

Local credential file still lists the disposable V8 tenants provisioned 2026-09-21 (`V8_QA_TENANT_PROVISIONING.md`). Those rows are **no longer present** in the shared testing database. Login therefore fails at identity resolution with **`failureCategory=account_not_found`** (mapped to HTTP 401 / generic message). Password verification, staff linkage, roles, and session issuance are never reached.

**Primary cause:** `ACCOUNT_NOT_FOUND`  
**Issue class:** `QA_ACCOUNT_DATA_ISSUE` (stale QA credential file vs wiped/absent disposable tenants)

---

## 1. Login request trace

| Field | Value |
|-------|--------|
| **REQUEST_HOST** | `activeclinic.neuniversity.org` |
| **REQUEST_ROUTE** | `POST /login` (canonical staff login; GET `/login` → 200 + CSRF) |
| **LOGIN_IDENTIFIER_TYPE** | `email` (also reproduced with `phone`) |
| **HTTP_STATUS** | **401** |
| **FAILURE_EVENT** | `authenticateActiveClinicIdentity` → `ok:false` / `INVALID_CREDENTIALS` → `renderLoginPage` with generic error (“We could not sign you in…”) |
| **FAILURE_CATEGORY** | **`account_not_found`** (inferred: identity row absent in testing DB; code path at `authenticateActiveClinicIdentity.js` when `resolveIdentityForLogin` yields no identity) |

### Status mapping (code)

| Outcome | HTTP | Notes |
|---------|------|--------|
| CSRF fail | **403** | Not observed (CSRF cookie + field present) |
| Rate limit | **429** | Not observed |
| Missing staff / ineligible org / disabled | **403** `ACCESS_UNAVAILABLE` | Not reached (requires verified identity) |
| Account not found / bad password / locked message path | **401** | Observed |

### Hosted probes (2026-10-02)

| Attempt | Host | Identifier | Status | Session cookie |
|---------|------|------------|--------|----------------|
| Email | `activeclinic.neuniversity.org` | V8 QA admin email | **401** | No (`*_sid` not set; CSRF cookie refreshed only) |
| Phone | `activeclinic.neuniversity.org` | V8 QA admin phone | **401** | No |
| Email | `activeclinic.pronline.org` | same email | **401** | No (same shared testing DB) |

### Structured logs

Hostinger process logs were **not available** from this audit workstation. Category is established from:

1. Live HTTP status **401** (not 403/429)
2. DB: zero identity / org rows for the QA identifiers
3. Auth code: missing identity → `failureCategory: "account_not_found"` → route returns 401

---

## 2. Identity lookup (testing DB)

DB target: Supabase pooler host from local `.env.testing.local` / `.env` `DATABASE_URL` (redacted). Matches hosted `/healthz` expected identity `moovex-platform-v7` / `testing`.

| Check | Result |
|-------|--------|
| **IDENTITY_FOUND** | **NO** |
| **IDENTITY_STATUS** | N/A (no row) |
| **PHONE_MATCH** | **NO** (0 rows for normalized QA phone) |
| **EMAIL_MATCH** | **NO** (0 rows for normalized QA email; 0 ILIKE `%v8mub23a6v6a6b%`) |
| **PASSWORD_HASH_PRESENT** | **NO** (no identity row; password lives on `platform.identities.password_hash`) |
| **ACCOUNT_ACTIVE** | **NO** |
| **ACCOUNT_LOCKED** | N/A |
| **ACCOUNT_SUSPENDED** | N/A |

No password hashes or secrets were printed.

---

## 3. AC staff linkage

| Check | Result |
|-------|--------|
| **STAFF_RECORD_FOUND** | **NO** |
| **STAFF_STATUS** | N/A |
| **CLINIC_ORG** | `ac-v8-qa-mub23a6v6a6b` **absent** from `platform.organizations` |
| **FACILITY_MEMBERSHIP** | **FAIL** (no staff) |
| **ROLE_KEYS** | N/A |
| **ACTIVE_MEMBERSHIP** | **FAIL** |
| Allowed QA/admin role | **Cannot evaluate** — no staff row |

---

## 4. Password / auth failure classification

| Candidate cause | Verdict |
|-----------------|---------|
| **ACCOUNT_NOT_FOUND** | **YES — primary** |
| BAD_PASSWORD | Not evaluated (identity missing) |
| INACTIVE_IDENTITY | No |
| SUSPENDED_STAFF | No |
| MISSING_STAFF_LINK | Would be **403**, not reached |
| MISSING_ROLE | Would be **403**, not reached |
| WRONG_TENANT | Org missing entirely (not wrong binding) |
| WRONG_HOST | No — host/deployment correct (`moovex-platform-v8-testing`) |
| RATE_LIMIT | No (not 429) |
| CSRF | No (not 403 session-expired) |
| SESSION_CREATION | Not reached |
| OTHER | Secondary: local `.env.v8-qa-tenants.local` is **stale** relative to DB |

**Exact primary cause:** `ACCOUNT_NOT_FOUND`

---

## 5. Environment / host check

| Check | Result |
|-------|--------|
| Credentials intended for | `activeclinic.neuniversity.org` · `moovex-platform-v8-testing` · testing DB `moovex-platform-v7` |
| Live `/healthz` | `deploymentCode=moovex-platform-v8-testing`, `gitSha=7dbe945d6c93`, `expectedIdentityKey=moovex-platform-v7`, `expectedDatabaseEnvironment=testing` |
| Same identity on pronline | **NO** (401; org/identity absent — shared testing DB) |
| Same identity on production | **Not provisioned there by design** (`.example.invalid` disposable V8 QA); no copy performed |
| Older testing deployment | Pronline `moovex-platform-testing` shares this DB; identity still absent |

**Conclusion:** Host/deployment wiring is correct. The disposable V8 QA tenant data is missing from the shared testing DB while the local credential file still references it.

Supporting public evidence: `GET /clinics/ac-v8-qa-mub23a6v6a6b` → **404** on neuniversity (was **200** at original provision time per `V8_QA_TENANT_PROVISIONING.md`).

---

## 6. Compare with working AC login path

Working residual tenants still present in testing DB (examples):

| Attribute | V8 QA admin (`ac-v8-qa-mub23a6v6a6b`) | Working comparator (`activeclinic-demo`) |
|-----------|----------------------------------------|------------------------------------------|
| Org present | **NO** | **YES** (`active`) |
| Public clinic route | **404** | **200** |
| Identity present | **NO** | **YES** (`active`) |
| Password hash present | **NO** | **YES** |
| Locked / suspended | N/A | **false** / **false** |
| Staff linkage | **NO** | **YES** (`active` staff rows) |
| Roles / facility | N/A | Staff present; facility tables exist (`staff_facility_assignments`) |
| Tenant resolution | Org key unknown | Resolves under ActiveClinic product host |

Also present (not exercised for password): `pl10-qa-activeclinic` (1 active staff), `julflona-clinic` (public **200**).

Difference is binary: **QA disposable tenant was removed/never present now**; demo/long-lived fixtures remain.

---

## 7. Classification

| Class | Selected? |
|-------|-----------|
| **QA_ACCOUNT_DATA_ISSUE** | **YES (primary)** |
| AUTH_IMPLEMENTATION_BUG | No — 401 mapping and credential check behave as designed |
| TENANT_LINKAGE_BUG | No — no identity to link |
| DEPLOYMENT_DATA_MISMATCH | Related symptom (stale local env file vs DB), not wrong live host |
| UNKNOWN | No |

### Required admin action (not performed)

1. Re-provision disposable V8 QA tenants against the **testing** DB using the supported path, e.g. `db/scripts/v8-disposable-qa-tenant-provision.js` with explicit `--confirm` (dry-run first), **or** an approved equivalent fixture script.
2. Refresh gitignored `.env.v8-qa-tenants.local` with the newly issued AC admin email/phone/password/org key.
3. Confirm `GET /clinics/<new-or-restored-org-key>` **200** and `POST /login` → session + `/app` (or post-login path) on `activeclinic.neuniversity.org`.
4. Do **not** copy credentials from production/pronline-only sources; do **not** reset unrelated demo passwords.

### Code fix

**None required** for this 401. Auth correctly rejects unknown identifiers with 401.

---

## Evidence index

| Source | Finding |
|--------|---------|
| Live `GET /healthz` (neuniversity AC) | SHA `7dbe945d6c93`, deploy `moovex-platform-v8-testing`, DB expect `moovex-platform-v7`/`testing` |
| Live `POST /login` | 401 · no session cookie · CSRF OK |
| SQL against testing `DATABASE_URL` | Org + identity absent; demo staff still active with password hashes |
| `authenticateActiveClinicIdentity.js` | Missing identity → `account_not_found` → 401 |
| `V8_QA_TENANT_PROVISIONING.md` | Historical provision of `ac-v8-qa-mub23a6v6a6b` (2026-09-21) now stale vs DB |

---

## Return markers

```
ROOT_CAUSE=V8 QA admin identity/org absent from shared testing DB (stale .env.v8-qa-tenants.local); login 401=account_not_found
IDENTITY_FOUND=NO
STAFF_RECORD_FOUND=NO
ACCOUNT_ACTIVE=NO
ROLE_ASSIGNMENT=FAIL
FACILITY_MEMBERSHIP=FAIL
PASSWORD_AUTH=UNKNOWN
ISSUE_CLASS=QA_ACCOUNT_DATA_ISSUE
CODE_FIX_REQUIRED=NO
QA_DATA_ACTION_REQUIRED=YES
FINAL=V2_04_AC_QA_ADMIN_401_AUDIT_COMPLETE
```
