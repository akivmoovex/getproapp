# V4 source compatibility audit (V4 → V5 migrator)

**Date:** 2026-07-19 (updated task 67)  
**Mode:** Code + fixture + mapping-doc audit; task 67 hardened selected defects (no hosted DB)  
**Sources inspected:**

| Area | Path |
|------|------|
| PG extractor | `src/migration/v4ToV5/extractPg.js` |
| Fixture extractor | `src/migration/v4ToV5/extract.js` + `fixtures/*.json` |
| Entity groups | `src/migration/v4ToV5/groups.js` |
| Transform / mappers | `src/migration/v4ToV5/transform.js`, `mappers/*` |
| Fingerprint / env | `src/migration/v4ToV5/config.js`, `safety.js` |
| Loader | `src/migration/v4ToV5/loadPg.js` |
| Design inventory | `docs/database/V4_TO_V5_DATA_MAPPING.md` |
| Local fixtures / seed | `fixtures/*`, `rehearsalSeed.js` |
| Tests | `tests/migration-mapping.test.js`, `tests/migration-tooling.test.js` |

**Classification legend**

| Class | Meaning |
|-------|---------|
| **SUPPORTED** | Extract + transform + load path exists; eligible rows migrate (quarantine on fail-closed rules) |
| **PARTIAL** | Some fields/rows migrate; important related V4 data dropped, deferred, or warned |
| **SKIPPED** | Group/entity intentionally empty or extract returns `skipped` (by design) |
| **UNSUPPORTED** | No extractor/mapper/load in current tooling; listed in plan `unsupportedSourceEntities` |
| **REQUIRES MANUAL MAPPING** | Product/ops decision required before a safe automatic map |

---

## 1. Verdict (compatibility readiness)

| Question | Answer |
|----------|--------|
| Is the implemented migrator compatible with a **subset** of V4 `public.church_*`? | **YES** — catalogue + staff + members + limited CMS/ops |
| Does it cover the full V4 church estate (~129 tables)? | **NO** — narrow allowlist of tables/entities |
| Was hosted V4 schema introspected for this audit? | **NO** — local fixtures + SQL assumptions only |
| Safe to claim “all V4 content migrates”? | **NO** |
| Task 67 hardenings applied? | **YES** — see §9 status |

---

## 2. Source adapters & schema assumptions

### 2.1 Adapters

| Adapter | Role | Notes |
|---------|------|-------|
| `createPgExtractor` | Hosted/local V4 Postgres **SELECT-only** | Per-transaction `default_transaction_read_only=on`; missing table → `source_table_missing` skip; **optional columns probed** and nulled when absent |
| `createFixtureExtractor` | Unit/mapping tests | JSON under `src/migration/v4ToV5/fixtures/` |
| `rehearsalSeed` | Local dual-DB rehearsal | Builds minimal V4-shaped tables + sample/demo rows |

### 2.2 Assumed V4 tables (implemented extract SQL)

Unchanged core entity → table map (see `ENTITY_SQL` in `extractPg.js`). Optional columns no longer fail the whole query when absent.

### 2.3 Explicitly not extracted (reported in plan)

`UNSUPPORTED_SOURCE_ENTITIES` in `groups.js`: tenants, registrations, leaders, sermons, resources, forms, requests, public_pages, sessions — plus media group `skipReason: media_blob_copy_deferred`.

---

## 3. Source fingerprint logic

| Check | Implementation | Effect |
|-------|----------------|--------|
| Fingerprint | SHA-256 of `host\|port\|dbname` | Same source/target → refuse |
| `DATABASE_URL` fallback | Refused | Prevents ambiguous attach |
| **`GETPRO_DATABASE_URL`** | **Refused** (`GETPRO_DATABASE_URL_forbidden`) | Aligns with dry-run checklist |
| Hosted cloud regex | Blocked unless `allowHosted` (tests only) | CLI never sets allowHosted |
| Target identity | `DATABASE_IDENTITY_EXPECTED` match | Gate before group work |
| Source RO | Pool + `SET LOCAL` + write probe | Source stays read-only |

---

## 4. Entity classification (requested checklist)

| Entity | Class | Notes |
|--------|-------|-------|
| organizations / tenants | **PARTIAL** | Org via `church_organizations`; tenants not migrated; **sample/demo org keys quarantined** unless `V4_TO_V5_INCLUDE_SAMPLE_CONTENT=1` |
| churches | **SUPPORTED** | 1:1 with migrated orgs |
| branches | **SUPPORTED** | Orphan org → `orphan_organization` |
| users | **PARTIAL** | HQ/branch admins only; orphans quarantined; email credential clash → `user_email_credential_conflict` |
| roles | **PARTIAL** | Scoped via mapped org/church/branch UUIDs only |
| members | **SUPPORTED** | **Never** assigned to a default branch; `orphan_organization` / `orphan_branch` |
| registrations | **UNSUPPORTED** | Plan-listed |
| public content | **PARTIAL** | Ministry/event/announcement only |
| leaders | **UNSUPPORTED** | Plan-listed |
| ministries | **SUPPORTED** | Parent checks |
| events | **PARTIAL** | Registration stack unsupported (warning) |
| sermons | **UNSUPPORTED** | Plan-listed |
| announcements | **PARTIAL** | Attachments unsupported |
| attendance | **PARTIAL** | Aggregates only |
| giving summaries | **SUPPORTED** | Migration actor at load |
| resources / forms / requests | **UNSUPPORTED** | Plan-listed |
| media metadata | **SKIPPED** | `media_blob_copy_deferred` |
| domains | **PARTIAL** | Requires `host_slug`; `missing_host_slug` / `unsafe_hostname` / `orphan_organization`; load still conflicts on `hostname_taken` |

---

## 5. Transformation & quarantine rules (hardened)

| Concern | Behavior |
|---------|----------|
| Orphan parents | `requireMappedParent` — **no invented parent UUIDs** |
| Sample orgs | `sample_organization_excluded` unless includeSampleContent |
| Missing host_slug | `missing_host_slug` (no silent slug→hostname fallback) |
| Unsafe hostnames | `unsafe_hostname` (localhost, `.invalid`, IPs, malformed) |
| Org key clash | `organization_key_taken` / `organization_key_mismatch` (no silent merge) |
| User email + different hash | `user_email_credential_conflict` |
| Optional columns | Probe + `NULL AS col` |
| PII in reports | Quarantine samples keep ids/reasons only; audit metadata redacts email/phone/password |

### New / emphasized quarantine & conflict codes

`orphan_organization`, `orphan_branch`, `sample_organization_excluded`, `missing_host_slug`, `unsafe_hostname`, `user_email_credential_conflict`, `GETPRO_DATABASE_URL_forbidden`.

---

## 6. Local fixtures & tests

| Asset | Coverage |
|-------|----------|
| `fixtures/organization.json` | bad slug + **demo-church sample** |
| `fixtures/domain.json` | missing host, localhost unsafe, orphan org |
| `fixtures/member.json` | orphan branch + orphan org members |
| `test:migration:mapping` | orphans, samples, unsafe domains, GETPRO, unsupported plan list |
| `test:migration:tooling` | plan/dry-run/apply/verify/second-apply, apply-summary.json, GETPRO |

---

## 7. Blocking data assumptions (remaining)

1. Slugs must already be V5-key-shaped.  
2. One church per org.  
3. No synthetic HQ creation if HQ slug missing (still **REQUIRES MANUAL MAPPING**).  
4. Domains require explicit `host_slug` (no org-slug fallback).  
5. Legacy plan keys until Phase B.  
6. Sermons/leaders/pages/forms/requests/media still absent.  

---

## 8. Manual mapping requirements

Unchanged for HQ synthesis, unknown plan codes, website JSON rebuild, Phase B keys, partner subscriptions. Sample orgs now automatic unless opted in.

---

## 9. Recommended migration fixes — status after task 67

| # | Fix | Status |
|---|-----|--------|
| 1 | Column-tolerant extract | **DONE** |
| 2 | Explicit missing_host_slug (no silent fallback) | **DONE** |
| 3 | HQ / primary guarantee | **OPEN** (still manual) |
| 4 | Orphan pre-check | **DONE** |
| 5 | GETPRO refuse | **DONE** |
| 6 | Emit `apply-summary.json` | **DONE** |
| 7 | Explicit unsupported in plan | **DONE** |
| 8 | Plan key Phase B | **OPEN** (not ready) |
| 9 | Hosted schema inventory | **OPEN** |
| 10 | Demo org filter | **DONE** |

---

## 10. Summary rollup

### Supported
Churches, branches, members (with orphan fail-closed), ministries, giving summaries, attendance aggregates.

### Partial
Organizations (samples excluded), admin users/roles, public content slice, events/announcements, domains (host_slug only), audit.

### Unsupported / skipped
Registrations, leaders, sermons, resources, forms, requests, public pages, sessions; media metadata skipped by group.

---

## 11. Suggested commit message

```
fix(migration): harden V4→V5 transform rules from compatibility audit

Quarantine orphans and sample orgs, require safe host_slugs, tolerate
optional V4 columns, refuse GETPRO_DATABASE_URL, and report unsupported
entities plus apply-summary artifacts.
```
