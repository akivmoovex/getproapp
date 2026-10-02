# V10 PL02 — Canonical Target Architecture Plan

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_CANONICAL_TARGET_PLAN` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisite** | PL01 `PL01_PRELIVE_CANONICALIZATION_AUDIT_COMPLETE` |
| **Mode** | **DOCUMENT / PLAN FIRST** — no DB changes, no implementation |
| **Execution rule** | `.cursor/rules/v10-pl01-pl14-execution.mdc` (PL01–PL09: no QA/prod DB deletion) |
| **Verdict** | **`V10_CANONICAL_TARGET_PLAN_PASS`** |

---

## 1. Target architecture (post legacy-compat removal)

```text
                    ┌─────────────┐
                    │  Platform   │  mechanisms
                    └──────┬──────┘
               ┌───────────┴───────────┐
               ▼                       ▼
        ┌────────────┐          ┌──────────────┐
        │ BlessBoard │          │ ActiveClinic │
        │  (church)  │          │  (clinical)  │
        └────────────┘          └──────────────┘

BB → Platform ← AC
BB ↛ AC
AC ↛ BB
AC ↛ church
```

| Owner | Owns |
|-------|------|
| **Platform** | Mechanisms: auth/session, registration draft engine, verification, phone field, email transport, RBAC **engine**, tenant-scope primitives, website media + folders, website engine store, editor HTTP kit, publication orchestrator, CMS **helpers**, audit/history primitives, jobs, validation |
| **BlessBoard** | Church semantics: HQ/branch topology, Sacred Modernity / nav / themes, pastoral catalogues, BB permissions catalogue rows, BB workflows, BB website section/templates, path-public vanity, operational church media |
| **ActiveClinic** | Clinical semantics: clinic/facility, patients, encounters, pharmacy, diagnostics, billing, AC nav/themes, AC permissions catalogue rows, AC website catalogues/JSON CMS content model, booking/portal product flows |

**Hard rule:** Do **not** merge church and clinical domains because data can be reset.

**Composition exception (allowed forever):** Platform Class-E mounts may `require` product packages for bootstrap/admin/bridge registration. That is composition, not BB↔AC coupling. Shrink only when a file’s product require becomes unused after a mechanism lift — not as a count program.

---

## 2. Canonical mechanism ownership

| Mechanism | Canonical owner | Product retains |
|-----------|-----------------|-----------------|
| **Auth / session** | Platform session store, cookie/fingerprint, identity principal | Product login chrome, post-login redirects, product role binding |
| **Registration** | Platform draft cookie + orchestrator + slug allocation (`organizationKey`) | Product steps, copy, provision adapters, cookie **names** |
| **Verification** | Platform challenge/OTP transport adapters | Product messaging copy, when to challenge |
| **Phone** | Platform `phone-field` assets + `phoneNumberService` | Product normalizer wrappers if needed; **no** legacy `/activeclinic/ac-phone-field.*` |
| **Email** | Platform outbound transport | Product message templates / triggers |
| **RBAC engine** | Platform assignment resolution / guards | Product **permission & role catalogues**, grant matrices |
| **Tenant scope** | Platform org/identity keys, deployment identity ≠ app code | BB HQ/branch; AC clinic/facility topology |
| **Media (website)** | Platform `website_media` + folders + CDN presentation | Product pickers UX, placement rules |
| **Media (operational BB)** | BlessBoard `media_assets` stack | Church ops attachments (not website-engine SoT) |
| **Website engine** | Platform engine tables + draft/live representation | Product section catalogues / field schemas |
| **Editor** | Platform shared editor HTTP kit / chrome helpers | Product routes, URLs, chrome, field ops |
| **Publication** | Platform `publicationOrchestrator` + soft-savepoint TX helpers | Product governance adapters (who may publish), BB/AC submit workflows |
| **CMS mechanisms** | Platform folder HTTP, ordered-list draft helpers | Product CMS routes, catalogues, storage shape (BB relational vs AC JSON) |
| **Audit / history** | Platform version/audit primitives where shared | Product audit semantics / surfaces |
| **Jobs** | Platform job runner / shared switches | Product job handlers |
| **Validation** | Platform shared validators | Product domain validation |

---

## 3. Products retain (not “compat debt”)

- Catalogues (sections, roles, clinical/pastoral entities)
- Permission / role **definitions** and product grant sets
- Navigation and shell composition
- Themes / design systems (Sacred Modernity vs AC tokens)
- Domain models and workflows (church ≠ clinical)
- Product URLs and public site policies (e.g. BB primary-branch 301)

---

## 4. Canonical database / migration ownership

Migrator order (unchanged): **`platform` → `blessboard` → `activeclinic` → `getpro` → `ngo`**.

| Folder / schema | Owns |
|-----------------|------|
| `db/migrations/platform/` → `platform.*` | Identity, orgs, sessions, verification, website engine/media/folders, shared jobs, deployment catalogues, shared forms |
| `db/migrations/blessboard/` → `blessboard.*` | Church domain, BB RBAC catalogue grants, operational media, BB website relational content |
| `db/migrations/activeclinic/` → `activeclinic.*` | Clinical domain; **new** AC RBAC grants (may DML shared `blessboard.roles`/`permissions`) |

**Forward rules (PC06):**

- No rename/delete/reorder of **applied** migrations
- No new product tables named `platform_*`
- Historical misplaced files stay (**HISTORICAL_ONLY**); new work follows folders above
- Cold-start launch DBs: migrate forward from empty — do not rewrite history

---

## 5. Compatibility that becomes unnecessary (data disposable)

Because QA/testing and pre-live production **application data** may be discarded, these PL01 items need not be preserved for old rows:

| Path | Why unnecessary at canonical target |
|------|-------------------------------------|
| Registration `statusCompatibility` old status aliases | No historical registration rows to map |
| `blessboardBackfillService` / one-shot V4/V5/V7 media migrators at runtime | No estate to backfill; tooling stays **HISTORICAL_ONLY** in repo |
| Session dual-write to legacy shapes | Fresh sessions on canonical tables only |
| `v7CompatibleWebsitePublish` dual-shape gate | Launch on single platform line / representation (decision confirmed in PL03) |
| AC `ac-phone-field.*` URL shims | Callers use `/platform/phone-field.*` only |
| `organizationKey` BB re-export | All imports → `platform/organization/organizationKey` |
| Empty `legacyCompatibilityPermissions` | No old require crash surface |
| `server.legacy.js` / foundation-off V4 branch | Foundation always on |
| Env aliases (`blessboard-org-v5`, Hostinger compat) | Profiles use canonical deployment codes |
| Demo/vanity `organizationKeyCompat` redirects **if** vanity not a launch product feature | Demo tenants discarded |
| Classic↔engine **dual-write** bridge | Single writer: engine **or** classic — not both (decision PL03; impl PL05–PL06) |

**Still required after data discard (not “old data” debt):**

- Class-E composition mounts
- Product CMS adapters + product catalogues
- Operational `media_assets` vs `website_media` dual **stores** (different product purposes — PC08)
- Publication orchestrator + governance adapters
- Path-public primary-branch redirect policy

---

## 6. Product decisions locked for later PLs (inputs to PL03)

PL02 assumes these will be **explicitly decided** in PL03 (decision record) before PL04+ code:

| ID | Decision | Canonical bias |
|----|----------|----------------|
| **D1** | BB website writer | Prefer **engine-primary** single writer; classic CMS reads may remain product UX until parity, but **no dual-write** |
| **D2** | Vanity / org-key redirects | Keep only if launch product requires vanity; else remove with demos |
| **D3** | V7/V8 DB dual-shape contract | Prefer **single** launch representation; drop `v7CompatibleWebsitePublish` once true |
| **D4** | Dual media | **Keep** operational BB media + website media (semantics, not compat) |
| **D5** | Launch DB topology | Prefer **new empty DB + forward migrate** over in-place wipe of dirty history |

---

## 7. Ordered implementation plan — PL04–PL09

*No implementation in PL02. PL01–PL09 must not delete QA/prod DBs.*

| Step | PL | Goal | Exit criteria (summary) |
|------|-----|------|-------------------------|
| 1 | **PL03** | Decision record for D1–D5 + freeze REMOVE vs KEEP lists | `V10_CANONICAL_DECISIONS_LOCKED` |
| 2 | **PL04** | Remove thin shims that need **no** data migration: phone URL shims, orgKey re-export rewrite, empty legacy RBAC stub, env/legacy server aliases; update tests | Callers on platform SoT; architecture scan still green; **no DB wipe** |
| 3 | **PL05** | Publication path canonicalization: all BB/AC publish/unpublish/restore enter via `publicationOrchestrator` + governance adapters; remove bypass routes | Publish auth + baselines green |
| 4 | **PL06** | Single-writer website path per D1: remove `blessboardBridge` dual-write / projection dual path; editor writes one store; soft-savepoint debt retires with dual-write | No classic↔engine dual-write on draft/publish; BB/AC editor smoke green |
| 5 | **PL07** | Registration/session canonicalization: drop statusCompat aliases for new writes; session single shape; verification/phone/email already platform — finish leftover adapters | Reg/login smoke green; no legacy status writes |
| 6 | **PL08** | CMS mechanism hygiene: keep platform helpers; product CMS remains product-owned; retire only proven-dead classic exports **not** required by D1 UX | CMS helpers + product routes green; no church/clinical merge |
| 7 | **PL09** | Fresh-DB bootstrap **design + dry-run scripts** (migrate-from-empty, identity seed, deployment code checks) — **still no QA/prod deletion** | Explicit **`V10_FRESH_DB_BOOTSTRAP_PASS`** + docs for PL10 |

**After PL09 only (out of PL04–PL09 code scope, for sequencing clarity):**

- **PL10** — Testing/QA reset **only if** `V10_FRESH_DB_BOOTSTRAP_PASS` and `QA_RESET_AUTHORIZED: YES`
- **PL11+** — Validation / prod gates per execution rule (PL12 read-only; PL13 manual)

---

## 8. Non-goals of the canonical target

- Shared BB/AC themes, navigation, or clinical↔church domain models
- Bulk Class-E count reduction
- Rewriting applied migration history
- Deleting operational `media_assets` because website media exists
- Implementing PL04–PL09 in this document

---

## 9. Traceability

| Source | Use |
|--------|-----|
| PL01 audit | REMOVE / REPLACE / KEEP inventory |
| PC25 residual backlog | P2/P3 residual mapped into PL04–PL08 |
| PC06 / `PLATFORM_SCHEMA_OWNERSHIP` | Migration ownership |
| PC08 / PC10 / PC11 | Media / publish / CMS SoT |
| PC18–PC19 | Cross-product zero already achieved — preserve |

---

## Required marker

```text
V10_CANONICAL_TARGET_PLAN_PASS
```
