# V2.03 QA — Hosted QA Readiness (QA13)

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_HOSTED_QA_READINESS` |
| **Date** | 2026-09-27 |
| **Scope** | TESTING / `*.pronline.org` only |
| **Production** | **UNTOUCHED** (healthz identity GET only; no writes, no deploy, no migrate) |
| **Prerequisites** | QA01–QA12 evidence present in `docs/qa/` |
| **Mode** | VERIFY + non-destructive HTTP smoke |
| **Verdict** | **`V203_HOSTED_QA_READINESS_BLOCKED`** |

---

## Required identity block

```text
HOSTED_SHA:   b8c18c3ded9892aa318ae6e029600aa34ff4941b
EXPECTED_SHA: 039ad22193c97759ce9bd5ca73fe56b0e38886ab   # QA01 candidate
DB_CEILING:   platform/043 · blessboard/118 · activeclinic/042 · getpro/001 · ngo/001
BB:           healthz PASS · root/login/register-church/directory PASS · hq auth-gate PASS · some unauth /app|/content 503
AC:           healthz PASS · root/login/register-clinic/clinics PASS · Batch auth-gates 303→login · public clinic pages 403 unavailable
```

---

## SHA comparison (QA01 candidate)

| Surface | SHA | Match QA01 `039ad221…`? |
|---------|-----|-------------------------|
| QA01 freeze candidate | `039ad22193c97759ce9bd5ca73fe56b0e38886ab` | — |
| Local `HEAD` | `c1a3911ae515…` (docs freeze after QA01; QA01 is ancestor) | n/a |
| `origin/V10` | `b8c18c3ded9892aa318ae6e029600aa34ff4941b` | **NO** (25 commits behind QA01) |
| AC pronline `/healthz` `gitSha` | `b8c18c3ded98` | **NO** |
| BB pronline `/healthz` `gitSha` | `b8c18c3ded98` | **NO** |

**HOSTED ↔ origin/V10:** aligned.  
**HOSTED ↔ QA01 candidate:** **FAIL** — hosted is ancestor of QA01; **25 commits** not deployed (`b8c18c3…` → `039ad221…`).

Per gate rules: **STOP** — do **not** certify QA01 functional readiness on the wrong SHA.  
`V203_HOSTED_QA_READINESS_PASS` is **withheld**.

---

## Deployment / DB identity (testing)

| Check | Result |
|-------|--------|
| AC deploymentCode | `moovex-platform-testing` |
| BB deploymentCode | `moovex-platform-testing` |
| Environment | `testing` |
| `expectedIdentityKey` (healthz) | `moovex-platform-v7` |
| `expectedDatabaseEnvironment` | `testing` |
| `sessionCookieName` | `moovex_platform_testing_sid` |
| `mediaWriteNamespace` | `testing` |
| `schemaCompatible` | **true** |
| Live DB identity (`db:identity:check:testing`) | `moovex-platform-v7` / `testing` · instance `c9189f08-e8ab-432c-a454-5a609ac91e32` |
| Applied migration ceiling | platform/**043** · blessboard/**118** · activeclinic/**042** · getpro/**001** · ngo/**001** (+ seeds 009) |
| Matches QA01 / disk canonical ceiling | **YES** |
| Batch3 relations present | `facility_rooms`, `clinical_documents`, `patient_visit_summary_releases` |

---

## Production (untouched)

| Check | Result |
|-------|--------|
| `blessboard.com` `/healthz` | `deploymentCode=moovex-platform-production` · `environment=production` · `gitSha=03a89106e2fe` |
| Writes / migrate / deploy to prod | **NONE** |
| Conclusion | **Production UNTOUCHED** (distinct SHA + identity from testing) |

---

## Non-destructive hosted smoke

### Health

| Host | `/healthz` |
|------|------------|
| `activeclinic.pronline.org` | **200** ok |
| `blessboard.pronline.org` | **200** ok |

### BlessBoard

| Path | Result |
|------|--------|
| `/` | **200** |
| `/login` | **200** (CSRF cookie `moovex_platform_testing_csrf`) |
| `/register-church` | **200** (`/register` alone 404 — canonical path is register-church) |
| `/directory` | **200** |
| `/about` | **200** |
| `/hq` (unauth) | **303** → `/login?next=/hq` |
| `/admin` (unauth) | **303** → login |
| `/app`, `/content`, `/hq/dashboard` (unauth) | **503** unavailable shell (not 404) |

### ActiveClinic

| Path | Result |
|------|--------|
| `/` | **200** |
| `/login` | **200** (CSRF cookie set) |
| `/register-clinic` | **200** |
| `/clinics` (directory) | **200** |
| `/book` | **302** → `/clinics` |
| `/clinics/test-qa-clinic` (+ doctors/services/my-booking) | **403** Clinic unavailable (publish/availability gate) |
| `/clinics/.../patient/login` | **404** portal not found for QA keys (no public portal fixture) |
| `/clinics/activeclinic-demo/patient/bookings` | **303** → patient login (route present) |

### Static assets

| Asset | Result |
|-------|--------|
| `/activeclinic/ac-app.css` | **200** (V2.03 shell comment present) |
| `/activeclinic/ac-app-tokens.css` | **200** |
| `/platform/gp-ops-shared.css` | **200** |
| `/church/church.css` | **200** |

### Sessions / media

| Check | Result |
|-------|--------|
| Session cookie name from healthz | `moovex_platform_testing_sid` |
| Login CSRF cookie | set on AC + BB `/login` |
| Media write namespace | `testing` |
| Destructive media upload | **not run** (non-destructive gate) |

### Website publish surface

| Check | Result |
|-------|--------|
| BB directory (public discovery) | **200** |
| AC clinic public pages for QA orgs | **403** unavailable — consistent with unpublished/not-public websites |
| Authenticated publish mutation | **not run** (would require login + write) |

### Critical Batch 1/2/3 routes (unauthenticated gate)

Expect **303 → /login** (route mounted) rather than **404/500**.

| Route | Status |
|-------|--------|
| `/app` | **303** → login |
| `/app/services` (B1) | **303** |
| `/app/patients` (B1) | **303** |
| `/app/booking-requests` (B1) | **303** |
| `/app/clinical` (B1/B2) | **303** |
| `/app/clinical/follow-up` | **303** |
| `/app/clinical/referrals` (B3 ACN20) | **303** |
| `/app/facilities` (B2) | **303** |
| `/app/rooms` (B3 ACN27) | **303** |
| `/app/settings` | **303** |
| `/app/dashboard` | **404** (no unauth mount / path not present) |
| `/app/website` | **404** |
| `/app/clinical/documents` | **404** (patient-scoped documents path differs; list mount not at this URL) |

Authenticated Batch deep QA **not executed** — blocked by SHA lag vs QA01.

---

## Stop reason

```text
V203_HOSTED_QA_READINESS_BLOCKED
REASON: HOSTED_SHA b8c18c3ded98 != EXPECTED_SHA 039ad22193c9 (QA01);
        origin/V10 matches hosted; QA01 candidate is 25 commits ahead and not deployed to moovex-platform-testing/pronline.
```

### Required to unblock → PASS

1. Deploy QA01 candidate (or successor tip that includes it) to `moovex-platform-testing` / pronline.  
2. Confirm AC+BB `/healthz.gitSha` matches `EXPECTED_SHA` (≥12-hex prefix).  
3. Re-run this smoke pack + authenticated Batch 1/2/3 staff checks.  
4. Then emit `V203_HOSTED_QA_READINESS_PASS`.

---

## Marker (current)

```text
V203_HOSTED_QA_READINESS_BLOCKED

HOSTED_SHA: b8c18c3ded9892aa318ae6e029600aa34ff4941b
EXPECTED_SHA: 039ad22193c97759ce9bd5ca73fe56b0e38886ab
DB_CEILING: platform/043 · blessboard/118 · activeclinic/042 · getpro/001 · ngo/001
BB: PASS (public/register/directory/login); auth shells mixed 303/503
AC: PASS (public/register-clinic/clinics/login/static); Batch gates 303; clinic public 403 unavailable
Production: UNTOUCHED
```
