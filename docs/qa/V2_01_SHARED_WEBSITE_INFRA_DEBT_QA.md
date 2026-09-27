# V2.01 Shared Website / Media Infrastructure Debt QA

**Task:** `V2_01_SHARED_WEBSITE_INFRA_DEBT`  
**Date:** 2026-09-26  
**Branch:** `V8`  
**Environment:** `moovex-platform-v8-testing` only  
**Production:** **untouched** (`blessboard.com` `03a89106e2fe` / `moovex-platform-production`)  
**Mode:** Reconcile + verify — **no WE01 rebuild**, **no speculative migration apply**, **no Hostinger mutations**

**Inputs:**
- `docs/qa/V2_01_MASTER_BACKLOG_AUDIT.md`
- `docs/qa/V2_01_SHARED_EDITOR_P2_GAP_CLOSURE_QA.md`
- `docs/qa/V2_01_PLATFORM_INFRA_BACKLOG_REPORT.md`

---

## Verdict

**Workstream outcome: no confirmed open shared website/media infrastructure defects requiring a code fix on tip `a901751a2c3a`.**

| Outcome class | Count |
| --- | ---: |
| **FIXED_VERIFIED** (prior V2.01 waves; re-checked) | 9 |
| **NO_CHANGE_REQUIRED** (investigated; healthy / already applied) | 3 |
| **DEFERRED** (POST-V1 / design / high-risk — plan only) | 3 |
| **BLOCKED** | 0 |
| **Implemented this task** | **0** (nothing safe and confirmed remained) |

Automated website infra regression: **42 pass / 0 fail / 3 skip**. Hosted tip matches local. Production unchanged.

---

## 1. Environment

| Surface | Value |
| --- | --- |
| Local / `origin/V8` | `a901751a2c3a…` |
| Hosted BB/AC | `gitSha=a901751a2c3a` · `moovex-platform-v8-testing` · media ns `testing-v8` · `schemaCompatible=true` |
| Testing DB ledger | `db:status:testing` — **0 pending**; BB **113** **applied** (2026-09-21) |
| Production | `03a89106e2fe` · `moovex-platform-production` · **read-only** |

---

## 2. Reconciliation against completed WE01 waves

Older “NOT IMPLEMENTED” / residual notes are **superseded** by later PASS reports. Do not reopen as open infra bugs.

| Capability | Older claim | Later evidence | Disposition now |
| --- | --- | --- | --- |
| IMAGE `{ mediaId, src, alt }` BB inline-field | A1 residual `invalid_url` | `V2_01_SHARED_IMAGE_PAYLOAD_PASS` (`6656d7e2`) | **FIXED_VERIFIED** |
| Desktop/mobile placement + crop UI | Architecture audit NOT IMPLEMENTED | Placement + Universal Image Editor + P2 **48/48** | **FIXED_VERIFIED** |
| Section add/reorder/hide | Gaps | `V2_01_SHARED_SECTION_MANAGEMENT_PASS` | **FIXED_VERIFIED** |
| Theme infra / gallery / first packs | NOT IMPLEMENTED | C1–C3 PASS | **FIXED_VERIFIED** |
| HQ/branch website cards | Studio missing | E1 cards PASS (studio intentionally out) | **FIXED_VERIFIED** |
| Draft → preview → publish | — | Final QA **66/66** | **FIXED_VERIFIED** |
| Field history / unpublished / reminders | — | Change Manager PASS suite | **FIXED_VERIFIED** |
| Final QA “NOT TESTED” crop/restore/structured | Verification gap | P2 gap closure **CLOSED** | **FIXED_VERIFIED** |
| V2-BB-18 / V2-BB-20 content keys | Historical OPEN wording | Bug register FIXED + regression tests | **FIXED_VERIFIED** |
| Media CDN `testing-v8` + read `testing/` | Prior soft-fill bugs | Infra report + runtime media **200** samples | **FIXED_VERIFIED** (delivery) |

**Out of scope for this debt task (not website/media infra defects):** SP-T2–T7 visual polish, HOST-* NPROC, V8-001/002/003 product/policy, Stitch visual PARTIALs.

---

## 3. Investigation targets (confirmed-gap scan)

| Target | Method | Finding |
| --- | --- | --- |
| Canonical content / projection paths | Code + Final/P2 QA | Live WE01 path uses `platform.website_content` + product bridges; parallel BB structured drafts still exist by design for collections — **not a reproduced publish breaker** |
| Media upload / CDN persistence | Infra report + prior UIE/P2 | Durable root `/home/u549637099/moovex-media`; V8 writes `testing-v8/`; objects **200** |
| Draft / preview / publish consistency | Final + P2 + local suites | Green; draft ≠ live preserved |
| Shared renderer / image placement | Placement + UIE tests | Green |
| Duplicate legacy editing routes | BB inline + HQ content APIs | Dual entry points remain (public WE01 + HQ content APIs) but share validators after B1 — **no confirmed broken route** this pass |
| Shared content / history contracts | Field-history + unpublished tests | Green (3 DB-gated skips unchanged) |
| Testing migration ledger (BB 113) | `npm run db:status:testing` | **113 applied**; **0 pending** |

No small, independent, confirmed product defect was found that is safe and still OPEN on this tip.

---

## 4. Per-backlog-ID dispositions

| ID | Disposition | Files / evidence | Tests | Hosted SHA | Production |
| --- | --- | --- | --- | --- | --- |
| **IMAGE-PAYLOAD / B1** (A1 `invalid_url`) | **FIXED_VERIFIED** | `editableFieldSchema.js`, `contentAdminRoutes.js`, `websiteInlineDraftService.js` | `v2-01-shared-image-payload-contract` PASS | Tip includes fix; current `a901751a2c3a` | Untouched |
| **IMAGE-PLACEMENT / UIE** | **FIXED_VERIFIED** | Placement + crop shared stack | placement + UIE suites PASS | same | Untouched |
| **SECTIONS** | **FIXED_VERIFIED** | Section services + BB freeform | section-management PASS | same | Untouched |
| **THEMES C1–C3** | **FIXED_VERIFIED** | Theme registry/gallery | prior C1–C3 QA | same | Untouched |
| **HQ/BRANCH E1** | **FIXED_VERIFIED** | Scope list cards | prior E1 + Final QA | same | Untouched |
| **PUBLISH / CHANGE MANAGER** | **FIXED_VERIFIED** | Shared publish + CM UI | unpublished + field-history PASS | same | Untouched |
| **P2 residuals** (crop/restore/structured click-through) | **FIXED_VERIFIED** | P2 harness evidence | P2 **48/48**; local infra suites green | prior `580e760e` line ⊂ tip | Untouched |
| **V2-BB-18 / V2-BB-20** | **FIXED_VERIFIED** | Content-key allowlist / office hours | `v2-bb-contact-hours-edit` lineage | historical hosted PASS | Untouched |
| **DB-LEDGER-113** (sermon `image_url`) | **NO_CHANGE_REQUIRED** | `113_sermon_thumbnail_image_url.sql` | Ledger **applied** 2026-09-21; **0 pending** | N/A (DB) | **Do not** apply to prod from this task |
| **MEDIA-SHADOW-PATH** | **NO_CHANGE_REQUIRED** | Runtime notes non-canonical shadow; mirroring **disabled** | — | — | Untouched |
| **MEDIA CDN delivery** (current tip) | **NO_CHANGE_REQUIRED** | Infra report samples **200** | — | `a901751a2c3a` | Untouched |
| **AC-WEBSITE-01** projection consolidate | **DEFERRED** | See §5 migration plan — **stop before execution** | — | — | Untouched |
| **V2-MEDIA-01** YouTube embeds | **DEFERRED** | Design + privacy review required; backlog NOT IMPLEMENTED by policy | — | — | Untouched |
| **THEME-PACKS-REST / palette** | **DEFERRED** | Explicit non-goal of C3 | — | — | Untouched |
| **HOST-*** / Package A | **Out of scope** | Platform infra report | — | — | — |

---

## 5. AC-WEBSITE-01 — migration plan (STOP — do not execute)

**Status:** **DEFERRED** · POST-V1 · high-risk legacy-data / dual-path consolidation  
**Rule:** Plan only; **no schema apply, no data rewrite, no WE01 rebuild** in this task.

### Problem statement

BlessBoard (and to a lesser degree ActiveClinic) still has **parallel content paths**:

1. Shared engine: `platform.website_content` draft/published + versions (WE01 canonical).  
2. Legacy / product bridges: `blessboard.website_inline_field_drafts`, `website_structured_drafts`, classic CMS publish bridge.  
3. Structured collections (ministries, leadership, AC catalogue) that intentionally stay product-specific.

Goal of **AC-WEBSITE-01**: one **authoritative projection per surface** without breaking publish, RBAC, or history.

### Proposed phases (future authorized work)

| Phase | Work | Risk | Gate |
| --- | ---: | --- | --- |
| 0 | Inventory per page/key: which store is source of truth today; list dual-write keys | Low (read-only) | Spreadsheet + disposable tenant samples |
| 1 | Read adapters only: public/renderer always prefer engine published; draft mode merges bridge overlays with explicit precedence | Medium | Hosted BB+AC draft/live matrix |
| 2 | Write adapters: WE01 pencils write engine first; bridge sync best-effort with metrics | Medium–High | Feature flag on testing; no production |
| 3 | Freeze dual-write; backfill engine from bridge for orphan keys | **High** (data) | Backup + dry-run + row counts |
| 4 | Retire unused bridge write paths | High | Compatibility window + rollback flag |

### Explicit non-goals (this plan)

- Merging AC catalogue / BB structured collections into a generic page builder.  
- Deleting historical `website_versions` rows.  
- Production cutover without backup evidence (`BACKUP-PROD-VERIFY`).

### Stop condition

**Do not start Phase 2–4** until Phase 0–1 inventory is approved and a dedicated migration ticket authorizes testing-only apply. **This task stops here.**

---

## 6. Tests run this pass

```
node --test --test-concurrency=1 \
  tests/v2-01-shared-image-payload-contract.test.js \
  tests/v2-01-shared-image-placement.test.js \
  tests/v2-01-universal-image-editor.test.js \
  tests/v2-01-shared-section-management.test.js \
  tests/v2-01-unpublished-changes-panel.test.js \
  tests/v2-01-field-history-restore.test.js
```

| Result | Count |
| --- | ---: |
| Pass | **42** |
| Fail | **0** |
| Skip | **3** (pre-existing DB-gated) |

Log: `/tmp/v2-01-website-infra-debt-tests.log`  
DB: `npm run db:status:testing` → **0 pending** (no secrets logged in this report).

---

## 7. Explicit non-actions

| Action | Status |
| --- | --- |
| Application code change | **None** |
| Deploy to V8 testing | **Not required** |
| Schema / data migration apply | **None** (113 already applied; AC-WEBSITE-01 not started) |
| WE01 rebuild / BB+AC service duplication | **None** |
| Production touch | **None** |
| Hostinger / media root changes | **None** |

---

## 8. Production status

| Check | Result |
| --- | --- |
| `blessboard.com` `/healthz` | `03a89106e2fe` · `moovex-platform-production` |
| Migrations / media / deploy | **Unchanged** |

---

## FINAL VERDICT (repeat)

Reconciled shared website/media infrastructure debt against completed WE01 / payload / placement / crop / section / theme / publish QA: **prior defects FIXED_VERIFIED**; **DB-LEDGER-113 NO_CHANGE_REQUIRED** (already applied); **AC-WEBSITE-01 / V2-MEDIA-01 / remaining theme packs DEFERRED** with projection consolidation **planned and stopped**. **No code or deploy this task.**
