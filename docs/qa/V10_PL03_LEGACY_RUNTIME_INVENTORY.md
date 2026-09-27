# V10 PL03 — Legacy Runtime Inventory

| Field | Value |
|-------|--------|
| **Doc ID** | `PL03_LEGACY_RUNTIME_INVENTORY` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisites** | PL01 audit PASS · PL02 `V10_CANONICAL_TARGET_PLAN_PASS` |
| **Mode** | **READ ONLY** — no code/DB changes |
| **Verdict** | **`PL03_LEGACY_RUNTIME_INVENTORY_COMPLETE`** |

---

## Legend

| Class | Meaning |
|-------|---------|
| **ACTIVE_CANONICAL** | Live path that is (or should remain) the SoT |
| **ACTIVE_LEGACY** | Live path kept for old dual-write / aliases / shims — replace or remove pre-live |
| **ZERO_CONSUMER** | No runtime require/route/template/script consumer found |
| **TEST_ONLY** | Referenced only by tests (or characterization asserts) |
| **ROLLBACK_ONLY** | Exists for rollback / one-shot migration — not request path |
| **UNKNOWN** | Insufficient proof |

Search cover: `require`/`import`, routes, EJS templates, client JS, tests, bootstrap, deployment config, migration/ops scripts. Docs prose alone does not count as a consumer.

---

## A. Publish bridges

| Item | Consumers (summary) | Class |
|------|---------------------|-------|
| `publicationOrchestrator` | BB/AC bootstrap `registerPublicationGovernance`; platform indexes; PC10 tests. HTTP often uses `lifecycleOrchestrator` same registry | **ACTIVE_CANONICAL** |
| `blessboardPublicationGovernanceAdapter` / AC adapter | Registered at bootstrap; lifecycle publish/unpublish | **ACTIVE_CANONICAL** |
| `churchWebsitePublishService` | **Many direct** callers: editor routes, `websiteDraftPublishService`, `websiteChangeSubmissionService`, restore/republish, provision/demo/repair, platform admin unpublish; also via governance adapter | **ACTIVE_CANONICAL** impl + **ACTIVE_LEGACY** bypass hops |
| Direct publish bypass (not via orchestrator/lifecycle registry) | Editor publish, draft-publish TX, submission approve, restore-republish, demo/provision | **ACTIVE_LEGACY** |
| `websiteChangeSubmissionService` | HQ/branch submission admin routes + overview/workflow services; approve → direct `publishChurchWebsite` | **ACTIVE_CANONICAL** (product workflow) |
| `v7CompatibleWebsitePublish` | `publicationService` publish gate; lifecycle tests | **ACTIVE_CANONICAL** (until D3 single-shape) |
| AC `publicationService` / `submissionService` | AC website routes (direct) | **ACTIVE_CANONICAL** |

---

## B. CMS bridges

| Item | Consumers | Class |
|------|-----------|-------|
| `blessboardClassicCmsAdapter` | `contentAdminRoutes` (folder notice/redirect) + PC11 tests | **ACTIVE_CANONICAL** |
| `activeClinicCmsAdapter` | `activeClinicWebsiteCmsRoutes` + PC11 tests | **ACTIVE_CANONICAL** |
| Classic CMS routes/services | Live BB/AC admin mounts | **ACTIVE_CANONICAL** (product UX — not removable as “compat”) |

---

## C. Dual-write logic

| Item | Consumers | Class |
|------|-----------|-------|
| `blessboardBridge.syncDraftToEngine` | `websiteInlineDraftService`, `websiteStructuredDraftService`, `blessboardBackfillService` | **ACTIVE_LEGACY** |
| `blessboardBridge.publishFromLegacy` / `unpublishFromLegacy` / `ensureEngineContent` / restore | `churchWebsitePublishService`, `churchWebsiteAdminRoutes`, `websitePublicationVersionService`, backfill | **ACTIVE_CANONICAL** today (dual-writer); target **REPLACE** per PL02 D1 |
| `blessboardBackfillService` | `db/scripts/blessboard-website-engine-backfill.js`, `migration/v5ToV7/postImport.js`, contract tests | **ROLLBACK_ONLY** / ops (**ACTIVE_LEGACY** for Class-E allowlist) |
| Editor overlay dual-write comments (`blessboardWebsiteEditorRoutes`) | Engine→overlay best-effort save after engine draft | **ACTIVE_LEGACY** |
| V4 `public.session` dual-write | **None** under `src/platform/session` | **ZERO_CONSUMER** |
| `createV5Session` → `deployment_sessions` | Auth establish / transfer | **ACTIVE_CANONICAL** |

---

## D. Phone AC legacy assets

| Item | Consumers | Class |
|------|-----------|-------|
| `/platform/phone-field.*` + shells | BB/AC shells, auth, registration pages | **ACTIVE_CANONICAL** |
| `public/activeclinic/ac-phone-field.js/.css` | **No** view `script`/`link` hrefs. Existence asserted in `v10-pc02` characterization; remap script string; docs | **ZERO_CONSUMER** (+ **TEST_ONLY** existence) |
| `data-ac-phone-field` DOM hooks | Live via **platform** phone-field JS/CSS | **ACTIVE_CANONICAL** (naming — not legacy URL) |

---

## E. Email re-exports

| Item | Consumers | Class |
|------|-----------|-------|
| `activeClinicEmailDelivery` → platform transport | AC bootstrap, invite, recovery, registration approve/review | **ACTIVE_CANONICAL** (product facade — **keep**) |
| Platform → AC email require | None | **ZERO_CONSUMER** (good) |

---

## F. Registration aliases

| Item | Consumers | Class |
|------|-----------|-------|
| Platform signed draft cookie + product adapters | Apex/public registration routes | **ACTIVE_CANONICAL** |
| `statusCompatibility` → `toCanonicalLifecycle` | `lifecycle.js` ← orchestrator, unified queue, tenant health | **ACTIVE_LEGACY** (legacy status maps) |
| Unused helpers on statusCompatibility module | No other `src/` callers | **ZERO_CONSUMER** (subset) |

---

## G. Media / org / env aliases

| Item | Consumers | Class |
|------|-----------|-------|
| BB `media_assets` stack | Operational church media | **ACTIVE_CANONICAL** (product) |
| Platform `website_media` | Website engine | **ACTIVE_CANONICAL** |
| BB `organizationKey` re-export | ~14 BB services/routes + several tests | **ACTIVE_LEGACY** |
| Platform `organizationKey` | allocateUnique, slug preview, platform admin, AC approve | **ACTIVE_CANONICAL** |
| `organizationKeyCompat` | pathPublic + vanity routes + URL tests | **ACTIVE_CANONICAL** (vanity/demo product) |
| `deploymentEnv` (platform) | AC routes, `applicationBuildInfo` | **ACTIVE_CANONICAL** |
| `blessBoardEnv` mode re-exports | `orgDataEnvironment`, pilot/seed services, seed script | **ACTIVE_LEGACY** |
| `blessboard-org-v5` alias | Profile alias + many hardcoded fallbacks | **ACTIVE_LEGACY** |

---

## H. Old website / server / RBAC stubs

| Item | Consumers | Class |
|------|-----------|-------|
| `legacyCompatibilityPermissions` | `staffAccessService` (empty result) + many RBAC tests | **ACTIVE_LEGACY** + **TEST_ONLY** |
| `server.legacy.js` | `server.js` when unprofiled; nodemon watch; isolation tests | **ACTIVE_LEGACY** |
| One-shot V4/V5/V7 migrators | CLI/migration trees | **ROLLBACK_ONLY** |

---

## PL02 decisions locked by inventory evidence

| ID | Decision | Evidence |
|----|----------|----------|
| **D1** | **Engine dual-write is ACTIVE_LEGACY** on draft sync; publish still hard-calls `publishFromLegacy`. Target: single writer (PL06) after orchestrator routing (PL05) | `syncDraftToEngine` only in inline/structured/backfill |
| **D2** | **Keep** `organizationKeyCompat` (ACTIVE_CANONICAL vanity/path-public) | Mounted routes |
| **D3** | `v7CompatibleWebsitePublish` remains ACTIVE_CANONICAL on AC/engine publish — defer removal until single-shape DB decision | `publicationService` |
| **D4** | Dual media stores remain ACTIVE_CANONICAL | No “alias” — product split |
| **D5** | Fresh DB later (PL09/PL10); do not rely on backfill at launch | Backfill = ROLLBACK_ONLY |

```text
V10_CANONICAL_DECISIONS_LOCKED (PL03 inventory-backed)
```

---

## Exact candidates safe for PL04–PL06

### PL04 — thin shim removal / import rewrite (no dual-write surgery)

| # | Candidate | Proof class | Safe action | Gate before delete |
|---|-----------|-------------|-------------|--------------------|
| **P4-1** | Delete `public/activeclinic/ac-phone-field.js/.css` | **ZERO_CONSUMER** | Delete assets; update `v10-pc02` existence asserts; fix remap script string | Confirm shells still load `/platform/phone-field.*` |
| **P4-2** | Rewrite BB `require(…/blessboard/services/organizationKey)` → platform SoT; keep thin re-export **or** delete re-export after graph empty | **ACTIVE_LEGACY** | Import rewrite + tests | `v10-pc18`, platform-01 registration |
| **P4-3** | Remove `legacyCompatibilityPermissions` usage from `staffAccessService`; delete stub or leave empty file deleted | **ACTIVE_LEGACY** | Code+test update | RBAC foundation / V2.02 legacy-removal suites |
| **P4-4** | Rewrite remaining `getDeploymentEnvMode` via `church/blessBoardEnv` → `platform/config/deploymentEnv` (keep church for domains) | **ACTIVE_LEGACY** | Import rewrite | `v10-pc19`, deployment-env tests |
| **P4-5** | Replace hardcoded `blessboard-org-v5` fallbacks with `blessboard-org-staging` (alias table may remain one release) | **ACTIVE_LEGACY** | String/profile cleanup | `deployment-profiles`, production-env-gate |
| **P4-6** | Document-only / optional: assert foundation profiles never load `server.legacy.js` (delete file only if unprofiled GetPro retired) | **ACTIVE_LEGACY** | Prefer **defer delete** unless product confirms GetPro unprofiled dead | Startup tests |

**Not PL04-safe:** `blessboardBridge`, `churchWebsitePublishService`, CMS adapters, `organizationKeyCompat`, email facades, registration draft adapters, dual media.

### PL05 — publication path canonicalization

| # | Candidate | Proof class | Safe action | Gate |
|---|-----------|-------------|-------------|------|
| **P5-1** | Route editor publish / draft-publish / submission-approve / restore-republish through lifecycle/`publicationOrchestrator` + governance adapter (stop direct `publishChurchWebsite` for HTTP) | **ACTIVE_LEGACY** bypass | Wire hops; keep service as impl | PC10B BB baselines, `blessboard-p0-publish-auth`, church publish suite |
| **P5-2** | AC website publish/unpublish enter shared orchestrator registry (adapter already exists) where not already | Mixed | Align AC HTTP with registry | PC10B AC workflow baseline |
| **P5-3** | Keep `churchWebsitePublishService` / AC `publicationService` as **impl** behind adapters | **ACTIVE_CANONICAL** | Do **not** delete | — |

**Not PL05-safe alone:** removing `syncDraftToEngine` / `publishFromLegacy` (PL06).

### PL06 — single-writer / dual-write removal

| # | Candidate | Proof class | Safe action | Gate |
|---|-----------|-------------|-------------|------|
| **P6-1** | Remove best-effort `syncDraftToEngine` from inline + structured draft services | **ACTIVE_LEGACY** | Delete calls; editor writes **one** store per D1 | Draft/live integrity, inline editor parity, engine contract |
| **P6-2** | Collapse publish path to single writer (engine **or** classic — PL02 bias engine-primary): stop `publishFromLegacy` dual hard-write **or** make engine the only SoT | **ACTIVE_CANONICAL** dual today | Product-confirmed single path | Publish bridge tests, church publish, PC10B |
| **P6-3** | Drop editor overlay dual-write compatibility blocks once single SoT | **ACTIVE_LEGACY** | Remove best-effort second write | Editor smoke |
| **P6-4** | Demote/remove `blessboardBackfillService` from request Class-E concern; keep script under `db/scripts` as **ROLLBACK_ONLY** or delete after PL10 empty DB | **ROLLBACK_ONLY** | No HTTP dependency | Engine contract tests updated |

**Prerequisite:** PL05 green publish auth. **Do not** remove dual-write until canonical path tests listed above pass.

**Rollback-only removable after canonical tests:** backfill service from runtime; V4/V5/V7 migrator trees stay in repo as HISTORICAL_ONLY (not PL04–06 delete focus).

---

## Explicit non-candidates (do not treat as PL04–PL06 deletes)

- Product CMS routes / catalogues / BB vs AC storage shapes  
- Operational `media_assets` vs `website_media`  
- Class-E composition mounts (existence)  
- `organizationKeyCompat` vanity redirects (D2 keep)  
- Registration draft cookie adapters (product names)  
- `activeClinicEmailDelivery` product facade  
- Applied migrations / ledger rewrite  

---

## Counts

```text
ZERO_CONSUMER (runtime):     ac-phone-field URL assets; V4 public.session dual-write; unused statusCompatibility helpers
ACTIVE_LEGACY (PL04–06):     orgKey BB re-export; deploymentEnv church re-export; blessboard-org-v5; legacyCompatibilityPermissions;
                             publish bypass hops; syncDraftToEngine; overlay dual-write; server.legacy (conditional)
ACTIVE_CANONICAL (keep):     platform phone/orgKey/deploymentEnv; orchestrator+adapters; CMS adapters; change submissions;
                             publicationService; organizationKeyCompat; media dual stores; session deployment_sessions
ROLLBACK_ONLY:               blessboardBackfillService; V4/V5/V7 one-shot migrators
```

---

## Required marker

```text
PL03_LEGACY_RUNTIME_INVENTORY_COMPLETE

PL04_SAFE:
  P4-1 ac-phone-field assets (ZERO_CONSUMER)
  P4-2 organizationKey import rewrite → platform
  P4-3 legacyCompatibilityPermissions stub retirement
  P4-4 deploymentEnv import rewrite (mode helpers)
  P4-5 blessboard-org-v5 → staging string cleanup
  P4-6 server.legacy.js only if unprofiled GetPro retired (else defer)

PL05_SAFE:
  P5-1 BB HTTP publish/restore/submit-approve → orchestrator/lifecycle + adapter
  P5-2 AC publish HTTP → shared registry where missing
  P5-3 keep publish service impls (no delete)

PL06_SAFE (after PL05 + canonical tests):
  P6-1 remove syncDraftToEngine from draft services
  P6-2 single-writer publish (stop dual publishFromLegacy hard path)
  P6-3 remove overlay dual-write compatibility
  P6-4 backfill service → ROLLBACK_ONLY / non-runtime
```
