# V10 PL01 — Pre-Live Canonicalization Audit

| Field | Value |
|-------|--------|
| **Doc ID** | `PL01_PRELIVE_CANONICALIZATION_AUDIT` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Mode** | **READ ONLY** — no deletes, no DB modify, no data mutation |
| **Context** | V10/V2.03 **not** live to real users; QA/testing and production application data **may** be discarded before launch |
| **Sources** | PC16 closure (in-session / PC17 note), PC25 residual backlog, consolidation backlog, PC06/PC08/PC10/PC11/PC14/PC22, `PLATFORM_SCHEMA_OWNERSHIP`, deployment identity docs |
| **Verdict** | **`PL01_PRELIVE_CANONICALIZATION_AUDIT_COMPLETE`** |

---

## Scope note

This audit inventories **backward-compatibility retained to preserve old data or dual runtime paths**. It does **not** treat product domain (BB/AC nav, themes, clinical catalogues, tenant topology) as removable “compat.”

**PC16:** Read-only closure audit completed in-session (`V10_PLATFORM_CONSOLIDATION_CLOSURE_AUDIT`); no separate PC16 markdown artifact — recorded COMPLETE in PC17.

---

## Deployment / database identity (context)

| Concept | Example | Role |
|---------|---------|------|
| App deployment code | `PLATFORM_DEPLOYMENT_CODE=moovex-platform-testing` / `moovex-platform-production` | Which Hostinger app / profile |
| Database identity | `identity_key=moovex-platform-v7`, `environment_code=testing` | Which DB estate — **≠** deployment code |
| Profiles | `docs/platform/V7_DOMAIN_RESOLVED_RUNTIME.md`, Hostinger env docs | Product selection by hostname |

Reset feasibility below assumes **rebuild or wipe of application DBs** for pre-live clean estate — **not** performed in this pass.

---

## Classification legend

| Label | Meaning |
|-------|---------|
| **KEEP_CANONICAL** | Target architecture / required composition — keep for launch |
| **REMOVE_PRELIVE** | Exists only (or primarily) for old URLs/data/runtime; safe to drop after caller rewrite + data discard |
| **REPLACE_WITH_CANONICAL** | Live dual path; pre-live should collapse to one SoT before launch |
| **HISTORICAL_ONLY** | Applied history / one-shot tooling — do not rewrite; ignore for runtime |
| **UNCERTAIN** | Needs product/architecture decision before delete or collapse |

---

## 1. Publish compatibility paths

| Item | Role today | Class |
|------|------------|-------|
| `publicationOrchestrator` | Platform publish/unpublish/restore dispatch | **KEEP_CANONICAL** |
| BB/AC publication governance adapters | Product authz + semantics into orchestrator | **KEEP_CANONICAL** |
| `churchWebsitePublishService` as **impl** behind adapter | BB publish engine | **KEEP_CANONICAL** (until replaced by thinner impl) |
| Direct route calls bypassing orchestrator | Legacy HTTP hop | **REPLACE_WITH_CANONICAL** |
| AC `publicationService` / `submissionService` | Live AC website workflow | **KEEP_CANONICAL** |
| `v7CompatibleWebsitePublish` | Blocks V8-only shapes on shared V7 DB | **REMOVE_PRELIVE** if launch drops shared-V7 dual-shape constraint; else **KEEP_CANONICAL** until V7 readers gone → **UNCERTAIN** |
| BB `websiteChangeSubmissionService` | Live multi-site review | **KEEP_CANONICAL** |

---

## 2. CMS compatibility paths

| Item | Role today | Class |
|------|------------|-------|
| Platform CMS folder HTTP + ordered-list helpers | Shared mechanisms (PC11) | **KEEP_CANONICAL** |
| `blessboardClassicCmsAdapter` / `activeClinicCmsAdapter` | Product CMS boundary | **KEEP_CANONICAL** while product CMS exists |
| Classic CMS routes/services (BB content-admin, AC website CMS) | Live product UX | **KEEP_CANONICAL** as product surface **or** **REPLACE_WITH_CANONICAL** if launch chooses engine-only editor — **UNCERTAIN** (product decision) |
| Dual BB relational CMS vs AC JSON CMS | Intentional product semantics | **KEEP_CANONICAL** (not cross-product debt) |

---

## 3. Dual-write bridges

| Item | Role today | Class |
|------|------------|-------|
| `blessboardBridge` + engine projections on publish/draft sync | Classic ↔ engine dual-write | **REPLACE_WITH_CANONICAL** (single writer pre-live) |
| `blessboardBackfillService` | Ops backfill from legacy shapes | **REMOVE_PRELIVE** after one clean backfill or data reset |
| Soft-savepoint / `23514` projection residual | TX safety around dual-write | **REMOVE_PRELIVE** once dual-write removed; else **P3** |
| Session identity dual-write (`createV5Session` legacy writer) | Old session row shapes | **REPLACE_WITH_CANONICAL** / **REMOVE_PRELIVE** after session table SoT proven |

---

## 4. Phone legacy paths

| Item | Role today | Class |
|------|------------|-------|
| `/platform/phone-field.*` + platform partial | SoT (PC05) | **KEEP_CANONICAL** |
| Product thin includes → platform | Adapters | **KEEP_CANONICAL** (or collapse includes) |
| `public/activeclinic/ac-phone-field.js/.css` full-content URL shims | Old asset URLs | **REMOVE_PRELIVE** (after caller audit → `/platform/…`) |
| `data-ac-phone-field` DOM hooks | Product CSS/tests | **UNCERTAIN** / **P3** rename on-touch |

---

## 5. Auth / registration legacy paths

| Item | Role today | Class |
|------|------------|-------|
| Platform signed registration draft cookie + orchestrator | Canonical mechanism | **KEEP_CANONICAL** |
| Product draft adapters (`bb_reg_draft` / `ac_reg_draft` names) | Product cookie names | **KEEP_CANONICAL** |
| `statusCompatibility` mapping old status strings | Read old registration rows | **REMOVE_PRELIVE** if registration state discarded; else keep until rows gone |
| Product verification adapters over platform | Thin wrappers | **KEEP_CANONICAL** |
| `legacyCompatibilityPermissions.js` (empty no-op) | Prevent crash on old requires | **REMOVE_PRELIVE** |
| `server.legacy.js` / foundation-off V4 branch | Pre-foundation runtime | **REMOVE_PRELIVE** if V5 foundation always required at launch |
| Deployment code aliases (`blessboard-org-v5` → staging) | Env alias | **REMOVE_PRELIVE** after Hostinger profiles use canonical codes only |

---

## 6. Schema compatibility columns / tables / views

| Item | Role today | Class |
|------|------------|-------|
| `platform.website_media` (+ folders) | Website-engine media SoT | **KEEP_CANONICAL** |
| `blessboard.media_assets` | Operational church media (PC08 intentional dual) | **KEEP_CANONICAL** (product domain — not temporary compat) |
| Frozen legacy `user_roles` (`116_freeze_legacy_user_roles`) | Historical RBAC freeze | **HISTORICAL_ONLY** (table may remain empty/frozen) |
| V8↔V7 DB compatibility contract / expand phases | Shared-DB multi-line readers | **REMOVE_PRELIVE** or **REPLACE_WITH_CANONICAL** when single platform line owns DB — **UNCERTAIN** until cutover topology chosen |
| Registration/lifecycle status columns still accepting aliases | Via statusCompatibility | **REPLACE_WITH_CANONICAL** after data reset |

---

## 7. Obsolete migrations

| Item | Role today | Class |
|------|------------|-------|
| Applied numbered migrations (all modules) | Ledger history | **HISTORICAL_ONLY** — **never rewrite/delete/reorder** |
| V4→V5 / V5→V7 one-shot migrators & fixtures | Cutover tooling | **HISTORICAL_ONLY** (keep in repo; not request path) |
| Finder `* 2.sql` (already cleaned) | N/A | gone |

---

## 8. Misplaced migrations

| Item | Role today | Class |
|------|------------|-------|
| AC RBAC under `blessboard/077–092,115,118` | Applied via BB migrator | **HISTORICAL_ONLY** (PC06 frozen exceptions) |
| `blessboard/093`,`095` website perms + AC grants | Applied | **HISTORICAL_ONLY** |
| `activeclinic/035_platform_contact_inquiries.sql` | Misnamed product table | **HISTORICAL_ONLY**; forward: no new `platform_*` product tables |
| Platform migrations naming a product (`018_activeclinic_…`) | Correct `platform.*` ownership | **KEEP_CANONICAL** placement |

---

## 9. Legacy media compatibility

| Item | Role today | Class |
|------|------------|-------|
| Platform `mediaService` / CDN presentation for website | Canonical website media | **KEEP_CANONICAL** |
| BB `src/blessboard/media/*` operational stack | Live pastoral/ops media | **KEEP_CANONICAL** |
| V5→V7 media copy scripts | One-shot | **HISTORICAL_ONLY** |
| Demo/CDN soft-fill paths in tests | Env-dependent | **REMOVE_PRELIVE** from launch contracts; keep for fixtures as needed |

---

## 10. Legacy product bridges

| Item | Role today | Class |
|------|------------|-------|
| Class E platform→product composition (~30) | Required mounts/admin/bridges | **KEEP_CANONICAL** (not old-data debt; PC22) |
| `blessboard/services/organizationKey.js` re-export | Import-graph shim | **REMOVE_PRELIVE** after rewrite to platform |
| `organizationKeyCompat` (demo/vanity redirects) | Old org keys + demos | **REMOVE_PRELIVE** if demo/vanity tenants discarded; else **KEEP** for vanity product feature — **UNCERTAIN** for vanity URLs |
| `deploymentEnv` platform SoT | Canonical mode gates | **KEEP_CANONICAL** |
| `blessBoardEnv` apex/domain + mode re-exports | BB host semantics | **KEEP_CANONICAL** (domains); mode re-export **REMOVE_PRELIVE** after imports → platform |

---

## 11. Deprecated routes / services

| Item | Role today | Class |
|------|------------|-------|
| Path-public `/c/:org` → 301 primary branch | Canonical URL policy | **KEEP_CANONICAL** |
| `legacyDomainRedirectServer` | blessboard.org→.com style | **REMOVE_PRELIVE** if domains finalized; else keep for SEO — **UNCERTAIN** |
| Host/env compat helpers (`v8HostingerEnvCompat`, etc.) | Transition aliases | **REMOVE_PRELIVE** after env cleanup |
| Empty `legacyCompatibilityPermissions` | Stub | **REMOVE_PRELIVE** |

---

## 12. Seed / demo dependencies

| Item | Role today | Class |
|------|------------|-------|
| `church:seed-demos`, `activeclinic:seed-demo-clinics`, QA role seeds | Testing/demo only | **KEEP_CANONICAL** as **dev/QA tooling**; **not** production runtime |
| Demo-church / Juflona / demo org keys | Disposable identities | **REMOVE_PRELIVE** from production estate (data); keep scripts for QA |
| Production cutover forbid: `church:seed-demos` on V5 prod | Standing rule | **KEEP_CANONICAL** policy |

---

## Disposable data categories (inventory only — NOT deleted)

| Category | QA/testing discard | Production discard (pre-live) | Notes |
|----------|--------------------|-------------------------------|-------|
| Tenants / orgs | Yes | Yes (context) | Includes demo-church, demo clinics |
| Users / staff | Yes | Yes | Re-seed QA personas after reset |
| Patients / members | Yes | Yes | Clinical PHI — wipe before launch if non-real |
| Appointments / encounters | Yes | Yes | |
| Clinical records / docs / pharmacy / diagnostics / billing | Yes | Yes | |
| Website drafts / published content | Yes | Yes | Enables dual-write retirement |
| Versions / restore history | Yes | Yes | |
| Media metadata + files | Yes | Yes | Website + operational; CDN/object store scrub separate |
| RBAC assignments | Yes | Yes | Re-seed catalogues/roles as needed |
| Audit / history / lifecycle audit | Yes | Yes | |
| Registration state / draft cookies | Yes | Yes | Enables statusCompatibility removal |
| Demo / test / QA fixture data | Yes | Must not ship | |

**Not disposable without product decision:** platform deployment catalogue rows, migration ledger (`schema_migrations` / equivalent), database identity row, permission/role **catalogue** definitions (structure — assignments yes).

---

## Rollup lists

### REMOVABLE_COMPATIBILITY (pre-live candidates)

- AC phone URL shims (`ac-phone-field.*`)
- `organizationKey` re-export (after import rewrite)
- Empty `legacyCompatibilityPermissions`
- Registration `statusCompatibility` (after registration data discard)
- `blessboardBackfillService` / one-shot media migrators (ops only)
- `server.legacy.js` / foundation-off path (if foundation mandatory)
- Env/deployment aliases (`blessboard-org-v5`, Hostinger compat aliases)
- Demo/vanity org redirects **if** vanity product not launching
- Dual-write bridge **as a system** — see REPLACE (collapse, don’t leave half)

### CANONICAL_REQUIRED

- `publicationOrchestrator` + product governance adapters
- Platform phone-field / registration draft / verification / `deploymentEnv`
- Platform CMS helpers; product CMS adapters while product CMS ships
- `website_media` SoT; operational `media_assets` as BB product media
- Class E composition mounts (bootstrap/admin/bridge)
- Path-public primary-branch redirect policy
- Migration ledger + forward ownership rules (PC06)
- App deployment code ≠ database identity model

### SCHEMA_CANDIDATES (pre-live attention — not rewritten here)

- Drop/ignore frozen legacy RBAC tables only after zero readers (**HISTORICAL_ONLY** until proven)
- Stop accepting legacy registration status aliases post-reset
- V7/V8 dual-shape compatibility tables/columns if single-line DB at launch (**UNCERTAIN**)
- No cosmetic relocation of misplaced applied migrations

### MIGRATION_CANDIDATES

- **Do not** delete/reorder applied files
- Forward-only: new AC RBAC under `activeclinic/`; no new `platform_*` product tables
- V4/V5/V7 migrator trees → archive/docs (**HISTORICAL_ONLY**), not runtime
- Optional: document “cold start” migrate-from-empty for launch DBs

### UNCERTAIN

- Engine-only vs classic+engine for BB at launch (dual-write retirement gate)
- Keep vanity/org-key redirects as a product feature vs purge with demos
- `v7CompatibleWebsitePublish` / V8 DB compat contract lifetime
- Domain redirect servers (SEO) vs drop
- Production Hostinger wipe vs new empty database identity (ops choice)
- Whether operational media and website media stay dual forever (PC08 says yes for product reasons)

---

## Reset feasibility

| Estate | Feasible? | Condition |
|--------|-----------|-----------|
| **QA / testing** | **YES** | Explicit wipe/reprovision; re-run migrations; re-seed QA personas/demos; update Hostinger `moovex-platform-testing` + `moovex-platform-v7` identity expectations |
| **Production** | **YES** (pre-live only) | Context allows discard; prefer **new empty DB + migrate forward** over in-place destructive cleanup; never rewrite migration history; confirm no real end users |

This pass: **no reset performed**.

---

## Explicit non-actions

- No data deleted
- No DB modified
- No application code changed
- No production deploy

---

## Required markers

```text
PL01_PRELIVE_CANONICALIZATION_AUDIT_COMPLETE

REMOVABLE_COMPATIBILITY: YES (phone URL shims; orgKey re-export; empty legacy RBAC stub; statusCompat after data discard; legacy server/env aliases; backfill/one-shot migrators; dual-write after single-writer decision)
CANONICAL_REQUIRED: YES (orchestrator+adapters; platform phone/reg/verify/deploymentEnv; website_media; Class E mounts; product CMS while shipping; media_assets operational; migration ledger)
SCHEMA_CANDIDATES: YES (legacy status aliases; frozen user_roles readers; V7/V8 dual-shape — decision-gated; NO applied-migration rewrite)
MIGRATION_CANDIDATES: YES (forward ownership only; archive one-shot V4/V5/V7 tools; cold-start empty DB path) — HISTORICAL applied files IMMUTABLE
UNCERTAIN: YES (engine-only vs dual-write; vanity redirects; V7 compat publish; SEO domain redirects; prod wipe topology; dual media permanence)

QA_RESET_FEASIBLE: YES
PRODUCTION_RESET_FEASIBLE: YES
```
