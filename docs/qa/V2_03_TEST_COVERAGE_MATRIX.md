# V2.03 QA — Risk Coverage Matrix (QA05)

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_TEST_COVERAGE_MATRIX` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisites** | [QA02 Inventory](./V2_03_TEST_INVENTORY.md) · [QA03 Harness](./V2_03_COVERAGE_HARNESS.md) · [QA04 Analyzer](./V2_03_COVERAGE_ANALYZER.md) |
| **Evidence basis** | Test file inventory · `coverage/v203-critical` · `coverage/coverage-gap-report.*` · PL11 known P2 pins |
| **Mode** | READ / ANALYZE (no source or test mutations) |
| **Verdict** | **`V203_RISK_COVERAGE_MATRIX_COMPLETE`** |

---

## Classification legend

| Class | Meaning |
|-------|---------|
| **STRONG_AUTOMATED** | Multiple dedicated automated suites; happy path + meaningful negatives; in curated/critical packs |
| **PARTIAL_AUTOMATED** | Automated coverage exists but depth, negatives, or line/branch coverage is incomplete |
| **SMOKE_ONLY** | Thin suite and/or hosted smoke scripts; not a durable regression net |
| **MANUAL_ONLY** | Relies on unwired hosted/manual scripts; little or no automated proof |
| **UNTESTED** | No meaningful automated suite for the capability as named |

Coverage notes use QA03 **critical** pack aggregates where cited (diagnostic, not gates).

---

## PLATFORM

| Capability | Class | Primary automated evidence | Coverage / residual notes |
|------------|-------|----------------------------|---------------------------|
| auth | **STRONG_AUTOMATED** | `v8-shared-auth-password-security`, BB/AC login suites, `v7-bb-login` family | Shared password/security green in critical pack |
| session | **STRONG_AUTOMATED** | `v8-shared-session-security`, `platform-v5-sessions`, AC session principal | — |
| registration | **STRONG_AUTOMATED** | `v7-unified-registration-engine`, BB/AC registration suites, PC10B platform-01/02/03 | AC edit-navigation pins remain P2 (PL11 F1/F2) |
| verification | **STRONG_AUTOMATED** | `v8-shared-verification`, BB email verification suite cluster | Phone OTP workflows present |
| phone | **STRONG_AUTOMATED** | `v7-shared-phone-identity`, `v7-bb-ac-phone-parity`, BB phone-* | Platform phone-field SoT post-PL06 |
| email | **PARTIAL_AUTOMATED** | AC transactional email; BB verification delivery/resend | General outbound email paths thinner than verification |
| RBAC | **STRONG_AUTOMATED** | `v8-shared-rbac-tenant-isolation`, BB rbac-foundation/e2e, AC role matrix | Platform `src/platform/rbac/*` line coverage still uneven (~low-30s on several catalog/audit files) |
| tenant scope | **STRONG_AUTOMATED** | `v8-tenant-product-isolation`, PC02 characterization, AC product isolation | Forged org / cross-tenant exercised in key suites |
| media | **PARTIAL_AUTOMATED** | PC08 media consolidation, shared media folders/library, BB/AC media tests | Media **write** paths weaker than read/resolution; Content Library test pin F9 |
| CMS mechanisms | **PARTIAL_AUTOMATED** | PC11 CMS convergence, PL05 canonical CMS, content-admin | Classic↔engine dual-write residual intentional |
| website engine | **PARTIAL_AUTOMATED** | Shared editor waves, website lifecycle/sections, PC07 HTTP utils | Editor HTTP strong; product chrome still product-local |
| publication | **PARTIAL_AUTOMATED** | PC10 publication, BB p0 publish auth, phase4 publish, PC10B baselines | Aggregate publication lines ~75%; `blessboardBridge` branches ~31% |
| versions/restore | **PARTIAL_AUTOMATED** | phase3 version history/compare/restore, phase4 restore, field-history restore | Depth uneven across BB vs AC |
| audit/history | **PARTIAL_AUTOMATED** | field history, BB reports-audit, HQ governance audit, shared audit logging | Platform audit still has production-lag COLS_LEGACY residual |
| migrations/bootstrap | **STRONG_AUTOMATED** | PL07 baseline, DBCL nets, db-foundation, v8 migration contract, identity gate | Ceiling 043/118/042 proven |

---

## BLESSBOARD

| Capability | Class | Primary automated evidence | Coverage / residual notes |
|------------|-------|----------------------------|---------------------------|
| registration | **STRONG_AUTOMATED** | register-church, instant-free, growth-trial, risk/duplicate/approval suites | Large suite mass; operator presenter/queue covered |
| HQ/branch | **STRONG_AUTOMATED** | HQ/branch shells, provisioning, isolation, website HQ/branch | — |
| staff/access | **STRONG_AUTOMATED** | `blessboard-staff-access`, staff-invitation, phone invitation | Catalogue assignments (post user_roles freeze) |
| roles | **STRONG_AUTOMATED** | rbac-foundation, authorization, HQ roles | Legacy RBAC removal covered (`v2-02-legacy-rbac-removal`) |
| website editor | **PARTIAL_AUTOMATED** | shared editor suites, BB editor routes tests | `blessboardWebsiteEditorRoutes` ~32% lines in critical pack |
| public website | **PARTIAL_AUTOMATED** | public URL harden, draft/live integrity, apex marketing/home | Known P2: path-public 301 + CDN demo debt (PL11 F3/F4) |
| CMS | **PARTIAL_AUTOMATED** | classic CMS + PC11/PL05 | Dual-write bridge still required for live parity |
| media | **PARTIAL_AUTOMATED** | blessboard-media + shared media | Operational `media_assets` vs website_media dual store intentional |
| publish | **STRONG_AUTOMATED** | p0 publish auth, church publish, phase4, PC10B BB | Auth negatives present |
| restore | **PARTIAL_AUTOMATED** | phase3/4 restore | Less product-wide than publish |
| sermons | **SMOKE_ONLY** | sermon image persistence + public visual | No deep sermons domain suite |
| giving | **PARTIAL_AUTOMATED** | `blessboard-giving`, finance-separation, billing-boundaries, church giving | Not in AC-critical clinical pack |
| events | **PARTIAL_AUTOMATED** | church events / public events-sermons visual | Thin vs registration/website |
| ministries | **PARTIAL_AUTOMATED** | church ministry* suites | Mostly church-path legacy naming; still exercised |

---

## ACTIVECLINIC

| Capability | Class | Primary automated evidence | Coverage / residual notes |
|------------|-------|----------------------------|---------------------------|
| registration | **PARTIAL_AUTOMATED** | clinic-registration*, ACW09, platform-02/03, identity idempotency | PL11 F1/F2/F6 test debt; pages often 200 with pin mismatches |
| clinic/facility | **STRONG_AUTOMATED** | batch2 facilities, facility foundation, departments regression | — |
| staff/access | **STRONG_AUTOMATED** | staff invitation, roles-access, multi-role RBAC, navigation RBAC | — |
| patients | **STRONG_AUTOMATED** | batch1 reception, batch2 workspace, patient foundation/merge | — |
| appointments | **STRONG_AUTOMATED** | batch1/2 appointments, appointment foundation | — |
| clinical | **STRONG_AUTOMATED** | batch1 clinical, batch2 encounter, ACN17/19/20 | Batch1–3 green in PL11/QA01 |
| pharmacy | **PARTIAL_AUTOMATED** | pharmacy foundation/ops/parity + departments regression | Ops covered; not as deep as clinical batch1 |
| lab | **PARTIAL_AUTOMATED** | diagnostics foundation/RBAC/UI (shared diagnostics surface) | No separate “lab-only” suite name |
| radiology | **UNTESTED** | — | No AC radiology-specific suite; not evidenced beyond generic diagnostics |
| billing | **PARTIAL_AUTOMATED** | batch1/2 billing, phase4/5d billing-cashier, finance RBAC | **Critical pack lines ~33%** on billing/cashier cluster; ops service ~12% lines |
| rooms/spaces | **PARTIAL_AUTOMATED** | `activeclinic-batch3-acn27-rooms` | Single suite; MVP isolation verified historically |
| clinical documents | **PARTIAL_AUTOMATED** | `activeclinic-batch3-acn18-clinical-documents` | Known private storage gap (product) |
| visit/release summary | **PARTIAL_AUTOMATED** | `activeclinic-batch3-acp05-visit-summary` (+ ACP03–07) | Known PDF storage gap (product) |
| website | **PARTIAL_AUTOMATED** | CMS/public/hardening/template + PC10B AC | PL11 F5 availability (`user_roles` fixture) |
| patient portal | **PARTIAL_AUTOMATED** | patient-portal + ACP portal leaves | PL11 F7 guest token **400** |
| booking | **PARTIAL_AUTOMATED** | public-booking, mf10, procedure booking, linkage | Hosted/env sensitivity remains |

---

## Required negative tests

| Negative class | Status | Evidence | Gap severity |
|----------------|--------|----------|--------------|
| unauthenticated | **PARTIAL_AUTOMATED** | PC02, v8 RBAC isolation, BB p0 publish auth, AC batch2 RBAC | P1 — not uniformly applied to every mutation surface |
| wrong role | **STRONG_AUTOMATED** | BB/AC RBAC matrices, publish auth, finance/diagnostics RBAC | — |
| wrong tenant | **STRONG_AUTOMATED** | v8 tenant/product isolation, AC batch2, unified registration | — |
| wrong facility/branch | **PARTIAL_AUTOMATED** | AC batch2 facility isolation; some BB branch isolation | P1 — not every AC clinical/billing write asserts facility |
| forged org ID | **PARTIAL_AUTOMATED** | PC02 forged IDs, BB publish auth, platform-admin-team forged org | P1 — expand to more admin mutation routes |
| invalid input | **PARTIAL_AUTOMATED** | registration validation, phone, PC02 | P2 — uneven outside registration/phone |
| missing resource | **PARTIAL_AUTOMATED** | pass5 missing states; scattered 404 asserts | P2 |
| duplicate submission | **STRONG_AUTOMATED** | BB/AC registration idempotency & duplicate flows | — |
| cross-product host | **PARTIAL_AUTOMATED** | hostname resolution, host-context, env isolation; unified login env pin F8 | P1 — dedicated host-mismatch matrix incomplete |

---

## Rollup by class

| Class | Rough capability count (matrix rows) |
|-------|--------------------------------------|
| STRONG_AUTOMATED | 18 |
| PARTIAL_AUTOMATED | 28 |
| SMOKE_ONLY | 1 (BB sermons) |
| MANUAL_ONLY | 0 (as primary class; many hosted orphans remain supplemental) |
| UNTESTED | 1 (AC radiology as distinct capability) |

---

## P0 / P1 / P2 test gaps

### P0_TEST_GAPS

1. **ActiveClinic billing/cashier write-path depth** — automated suites exist, but critical-pack coverage is weak (~33% lines; `activeClinicBillingOpsService` ~12%). Money-path mutations need stronger automated proof (authz + tenant/facility + invalid/duplicate).
2. **ActiveClinic radiology as a distinct clinical capability** — **UNTESTED** (no radiology-specific suite; diagnostics ≠ radiology proof).

### P1_TEST_GAPS

1. Platform **publication dual-write / bridge branch** coverage (`blessboardBridge` ~31% branches) despite publish suites.
2. BlessBoard **website editor route** depth (`blessboardWebsiteEditorRoutes` ~32% lines).
3. AC **registration** automated pins (PL11 F1/F2/F6) — false-fail / contract drift risk.
4. AC **patient portal** guest-token registration (PL11 F7).
5. **Negative-test uniformity** — unauthenticated / forged org / facility isolation not applied to all HIGH mutation surfaces (billing writes, CMS writes, media writes, clinical docs finalize).
6. **Cross-product host** mismatch automation incomplete (env pin F8 class).
7. **Media write** + **CMS write** paths vs read/resolution imbalance.
8. HIGH untested runtime files in product trees (examples): `websiteDraftPublishService.js`, authorized website scope modules, `unpublishedChangesPanel.js`.

### P2_TEST_GAPS

1. BB **sermons** smoke/visual-only.
2. BB **events** thin relative to registration/website.
3. Lab vs radiology naming/clarity (diagnostics collapses lab; radiology still UNTESTED).
4. Content Library `wantsHtml` pin (PL11 F9).
5. Draft/live path-public + CDN demo debt (PL11 F3/F4).
6. Visit-summary PDF / clinical-doc private storage gaps (product intentional, still QA-visible).
7. 59 orphan hosted scripts unwired from npm (manual-only supplemental).
8. Presentation/formatting helpers under-tested (acceptable LOWER risk).

---

## Recommended next QA focus (not executed here)

1. Expand AC billing/cashier automated negatives + branch coverage (P0).
2. Add radiology capability suite or explicitly fold into diagnostics with named radiology cases (P0/P1).
3. Close AC registration/portal **test contract** debt (P1) without product behavior churn unless bugs found.
4. Extend forged-org / unauth / facility isolation to HIGH write routes (P1).

---

## Required marker

```text
V203_RISK_COVERAGE_MATRIX_COMPLETE

P0_TEST_GAPS: 2
P1_TEST_GAPS: 8
P2_TEST_GAPS: 8
```
