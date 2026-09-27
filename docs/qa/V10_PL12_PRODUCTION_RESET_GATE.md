# V10 PL12 — Production Reset Gate (READ/VERIFY ONLY)

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_PRODUCTION_RESET_GATE` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` (`21ba521c`) |
| **Mode** | **READ/VERIFY ONLY** — **no production reset, migrate, deploy, or write** |
| **Prerequisite** | PL11 `V10_FRESH_QA_V203_PASS_WITH_P2_GAPS` · P0/P1 **0** |
| **Verdict** | **`V10_PRODUCTION_RESET_BLOCKED`** |

---

## Executive verdict

Chain evidence (PL07–PL11) is sufficient on the **testing** side, but production cannot be authorized for wipe/rebuild yet: **real-looking non-disposable tenants**, **hosted app SHA far behind V10/V2.03 ceiling**, and **no production-specific reset/rebuild runbook**. Reset was **not** performed.

```text
V10_PRODUCTION_RESET_BLOCKED
```

---

## Prerequisite chain (satisfied)

| Gate | Marker | Status |
|------|--------|--------|
| PL09 empty bootstrap | `V10_FRESH_DB_BOOTSTRAP_PASS` | **PASS** |
| PL09 QA reset auth | `QA_RESET_AUTHORIZED: YES` | **PASS** |
| PL10 QA reset | `V10_QA_CANONICAL_RESET_PASS` | **PASS** |
| PL11 V2.03 regression | `V10_FRESH_QA_V203_PASS_WITH_P2_GAPS` | **PASS** (P0/P1 **0**) |

---

## Confirmations

| Required confirmation | Result | Evidence |
|-----------------------|--------|----------|
| Production still pre-live (program intent) | **PARTIAL / UNCERTAIN** | Apex serves `environment=production`; program docs call estate pre-launch, but live tenants look like real pilot churches/clinics |
| No real user data must be preserved | **NOT CONFIRMED** | See inventory below — **BLOCK driver** |
| Canonical migrations passed empty bootstrap | **YES** | PL09 · 205 migrations · ceiling 043/118/042 |
| QA reset passed | **YES** | PL10 |
| Full V2.03 QA passed | **YES** (with P2 gaps only) | PL11 |
| Production app version/config compatibility understood | **YES — incompatible today** | Live `gitSha=03a89106e2fe` vs local V10 `21ba521c`; DB ledger behind ceiling |
| Production DB identity known | **YES** | `moovex-platform-v7` / `production` · instance `f07b8580-ff60-4a88-9748-680db53d7179` |
| Rollback/rebuild procedure documented | **INCOMPLETE** | PL01/PL02 prefer new empty DB; **no** PL13 production confirm-gated script/runbook (QA script **refuses** production) |

---

## Testing vs production configuration

| Dimension | Testing | Production |
|-----------|---------|------------|
| `DEPLOYMENT_ENV` | `testing` | `production` |
| `PLATFORM_DEPLOYMENT_CODE` | `moovex-platform-testing` | `moovex-platform-production` |
| `DATABASE_IDENTITY_EXPECTED` | `moovex-platform-v7` | `moovex-platform-v7` |
| `DATABASE_IDENTITY_ENV` | `testing` | `production` |
| Live identity `environment_code` | `testing` | `production` |
| `database_instance_id` | `c9189f08-…` (post-PL10) | `f07b8580-…` |
| Supabase project | **distinct** (`connectionIdentityHash` differs) | **distinct** |
| Migration ceiling (ledger) | platform/**043** · blessboard/**118** · activeclinic/**042** · seeds **9** | platform/**035** · blessboard/**107** · activeclinic/**035** · seeds **8** |
| Org counts | 2 (controlled PL10) | **28** orgs · **21** churches · **7** HCOs |
| Hosted apex `/healthz` | (testing hosts) | `blessboard.com` / `activeclinic.org` → `gitSha=03a89106e2fe` · `moovex-platform-production` |

**Same host pattern, different projects** — testing wipe did not touch production (verified by distinct instance ids + project refs).

---

## Production data inventory (keys/flags only — no PII)

READ-ONLY counts:

| Entity | Count |
|--------|------:|
| organizations | 28 |
| churches | 21 |
| healthcare orgs | 7 |
| blessboard users | 25 |
| AC staff | 13 |
| members | 0 |
| patients | **1** (within 90d) |

Representative org keys include disposable/demo names **and** named churches/clinics with `test_cleanup_eligible=false` / `data_environment=production`, e.g.:

- `kingdom-embassy-center-zambia`, `new-apostolic-church-kafue`, `deliverance-church-kafue`, …
- `juflona-clinic`, `mocaadri-medical-centre`, `dem-kafue-medical-clinic`, …

→ **Cannot assert “no real user data must be preserved.”**

---

## Production-specific hazards for fresh bootstrap

1. **App/schema mismatch (unsafe):** Live production apps are on SHA `03a89106e2fe` while canonical V10/V2.03 ceiling is `platform/043` · `blessboard/118` · `activeclinic/042`. Empty-schema remigrate **without** coordinated Hostinger deploy of matching V10 would recreate the “schema ahead of app” failure class (`V2_03_V10_POST_DEPLOY_GATE`).
2. **Non-disposable-looking estate:** Named churches/clinics + staff/users + 1 patient; most rows `test_cleanup_eligible=false`.
3. **No production reset tool:** `db/scripts/v10-qa-canonical-reset.js` hard-refuses `DEPLOYMENT_ENV=production` / production identity — intentional. PL13 needs a **separate** confirm-gated procedure (prefer new empty DB identity per PL01).
4. **Ledger lag:** Production not at V2.03 ceiling; wipe+remigrate is the only clean path, but only after (1)–(3) cleared.
5. **Apex SEO/DNS/object storage:** Media/CDN scrub and domain cutover are ops-coupled (PL01 UNCERTAIN) — not proven for a cold start.

---

## What would be required to unblock (PL13 still manual)

1. Explicit operator attestation that **all** current production application tenants/users/patient rows are disposable (or migrate them off).
2. Written **production** rebuild runbook: backup → new empty DB **or** gated wipe → migrate to ceiling → re-seed identity `moovex-platform-v7`/`production` → controlled bootstrap → **deploy matching V10 SHA** to Hostinger before DNS cutover.
3. Hosted production `/healthz` SHA aligned to the build that owns the V2.03 ceiling.
4. Deliberate manual PL13 execution only after this gate flips to AUTHORIZED.

---

## Explicit non-actions (this pass)

- **No** production DROP/TRUNCATE/migrate/reset
- **No** production deploy / force-push
- **No** rewriting applied migration history
- **No** PL13 execution

---

## Required marker

```text
V10_PRODUCTION_RESET_BLOCKED

PL11: PASS_WITH_P2_GAPS (P0/P1=0)
Prod identity: moovex-platform-v7 / production (distinct from testing)
Blockers:
  1) real-looking non-disposable tenants/users/patient not attested disposable
  2) hosted app SHA 03a89106e2fe incompatible with V2.03 canonical ceiling
  3) production reset/rebuild runbook + confirm-gated tooling absent
Reset performed: NO
```
