# V2.03 QA — Hosted SHA Alignment (QA13A)

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_HOSTED_SHA_ALIGNMENT` |
| **Date** | 2026-09-27 |
| **Mode** | TESTING / pronline deploy alignment only |
| **Production** | **UNTOUCHED** |
| **Verdict** | **`V203_HOSTED_SHA_ALIGNMENT_PASS`** |

---

## Authoritative corrections (carried forward)

| Item | Status |
|------|--------|
| Coverage scopes (`all` / `platform` / blessboard / activeclinic / `critical`) | Confirmed — no blocker |
| QA10 earlier 257/17 | **SUPERSEDED_BY_LATER_GREEN_RUN** |
| QA10 authoritative | **274 PASS / 0 FAIL** |

---

## STEP 1 — Expected candidate

Source: `docs/qa/V2_03_QA_BASELINE.md` (not older handoff SHAs).

| Field | Value |
|-------|--------|
| **EXPECTED_BRANCH** | `V10` |
| **EXPECTED_FULL_SHA** | `039ad22193c97759ce9bd5ca73fe56b0e38886ab` |
| **EXPECTED_SHORT_SHA** | `039ad22193c9` |
| **EXPECTED_DB_CEILING** | platform/**043** · blessboard/**118** · activeclinic/**042** · getpro/**001** · ngo/**001** |

Local docs tip `c1a3911a` (baseline freeze doc commit) is **not** the application candidate; QA01 freeze SHA above is authoritative.

---

## STEP 2 — Hosted testing inspection (pre-align)

| Check | AC / BB pronline | Result |
|-------|------------------|--------|
| `PLATFORM_DEPLOYMENT_CODE` | `moovex-platform-testing` | PASS (testing) |
| `DEPLOYMENT_ENV` / environment | `testing` | PASS |
| DB identity (expected) | `moovex-platform-v7` / `testing` | PASS |
| Hosted app SHA | `b8c18c3ded98` | **LAG** vs expected |
| Production abort check | `blessboard.com` → `moovex-platform-production` / `03a89106e2fe` | Distinct — **not target** |

---

## STEP 3 — Lag classification

| Field | Value |
|-------|--------|
| **Class** | **`DEPLOY_NOT_TRIGGERED`** |
| Detail | Candidate never on `origin/V10`; hosted matched stale remote tip `b8c18c3ded98` |
| Secondary | **`WRONG_COMMIT`** (hosted SHA ≠ expected) until push |
| Not | DEPLOY_PENDING / WRONG_BRANCH / BUILD_FAILURE / STARTUP_FAILURE / CACHE / HOSTINGER_CONFIGURATION |

---

## STEP 4 — Resolution

| Action | Result |
|--------|--------|
| Mechanism | Normal git fast-forward: `git push origin 039ad221…:refs/heads/V10` |
| Force-push | **No** |
| Production branches (`main`, etc.) | **Not updated** |
| Unrelated trigger commit | **Not created** |
| Push result | `b8c18c3d..039ad221` → `origin/V10` |

---

## STEP 5 — Hosted worker verification

After ~60s both product hosts reported the candidate:

| Host | `gitSha` | Deployment | Environment |
|------|----------|------------|-------------|
| `activeclinic.pronline.org` | `039ad22193c9` | `moovex-platform-testing` | `testing` |
| `blessboard.pronline.org` | `039ad22193c9` | `moovex-platform-testing` | `testing` |

| Check | Result |
|-------|--------|
| AC + BB same expected candidate | **PASS** |
| Testing-only deployment | **PASS** |
| Live DB identity | `moovex-platform-v7` / `testing` |
| Live DB ceiling | platform/**043** · blessboard/**118** · activeclinic/**042** · getpro/**001** · ngo/**001** (+ seeds/009) |
| Production | Still `moovex-platform-production` / `03a89106e2fe` — **UNTOUCHED** |

---

## Required block

```text
V203_HOSTED_SHA_ALIGNMENT_PASS

EXPECTED_SHA: 039ad22193c97759ce9bd5ca73fe56b0e38886ab
HOSTED_BB_SHA: 039ad22193c9
HOSTED_AC_SHA: 039ad22193c9
DEPLOYMENT: moovex-platform-testing / testing
DB_IDENTITY: moovex-platform-v7 / testing
DB_CEILING: platform/043 · blessboard/118 · activeclinic/042 · getpro/001 · ngo/001
```
