# BlessBoard V5 — Release blockers consolidation

**Date:** 2026-07-19  
**Mode:** Documentation consolidation only — **no application code, env, routing, or data changes**  
**Sources:** GUI / a11y / security / performance audits · demo readiness · route/link audit · env reference · shadow & authoritative docs · plan-key plan · V4→V5 migration docs (see §Sources)

**Operating posture today**

| Gate | Status |
|------|--------|
| Local V5 foundation + automated suites | Strong evidence of code readiness |
| Hosted catalogue (`diagnostic-church`) | READY for **shadow** |
| Demo personas / published CMS / samples | **MISSING** — blocks full E2E + authoritative pilot |
| `BLESSBOARD_TENANT_ROUTING_MODE` | Must remain **`off`** until shadow runbook is executed; **`authoritative` NOT READY** |
| Production / estate-wide cutover | **BLOCKED** (migration + routing gates) |

---

## 1. True blockers

| ID | Area | Blocker | Severity | Evidence | Required action | Owner type | Required before |
|----|------|---------|----------|----------|-----------------|------------|-----------------|
| B01 | Tenant routing | Live **shadow** evidence pack not captured (mode flip + logs + apex/tenant Host checks) | **CRITICAL** | [`V5_AUTHORITATIVE_ROUTING_PREREQUISITES.md`](../deployment/V5_AUTHORITATIVE_ROUTING_PREREQUISITES.md) §1 — MISSING/UNVERIFIED; shadow readiness is GO to *enable*, not evidence of success | Execute [`V5_SHADOW_MODE_RUNBOOK.md`](../deployment/V5_SHADOW_MODE_RUNBOOK.md); file §7–§10 + §14 evidence pack | Ops | AUTHORITATIVE PILOT |
| B02 | Demo data | No platform / HQ / branch / member personas on hosted V5 demo tenant | **CRITICAL** | [`V5_DEMO_TENANT_READINESS.md`](../testing/V5_DEMO_TENANT_READINESS.md) — users `0`, roles `0` | Provision PA, `church_hq_admin`, `branch_admin` on `hq`, active member + primary membership via approved scripts/UI (never `church:seed-demos`) | Ops + Product | DEMO · AUTHORITATIVE PILOT |
| B03 | Demo data | No published Home / About (`public_pages`) for `diagnostic-church` | **CRITICAL** | Demo readiness §4 items 13–14 MISSING | Publish `home` + `about` (or signed empty-content waiver) | Ops + Content | DEMO · AUTHORITATIVE PILOT |
| B04 | Demo data | No operational sample rows (announcements, events, ministries, sermons, resources, forms, requests, giving methods, attendance) | **HIGH** | Demo readiness §4 item 15 — all module counts `0` | Seed safe samples per module used in smoke | Ops + Content | DEMO · AUTHORITATIVE PILOT |
| B05 | Testing | Hosted authoritative smoke (T06+) **NOT RUN** | **CRITICAL** | [`V5_DEMO_E2E_SMOKE_TEST.md`](../testing/V5_DEMO_E2E_SMOKE_TEST.md); authoritative prereqs §2 | After B01–B04 + supervised authoritative enable, execute smoke + evidence pack | QA + Ops | AUTHORITATIVE PILOT |
| B06 | Migration | No **hosted** V4→V5 migration rehearsal / dry-run / apply | **CRITICAL** | [`V5_FINAL_MIGRATION_READINESS.md`](../database/V5_FINAL_MIGRATION_READINESS.md) **H1** | Hosted dry-run + apply against intended V5 project; reconcile counts | Ops + DBA | PRODUCTION CUTOVER |
| B07 | Migration | Open product mapping decisions (M4–M12) without written answers/waivers | **HIGH** | Final migration readiness **H2**; cutover §8 | Close or waive mapping decisions in sign-off table | Product + Ops | PRODUCTION CUTOVER |
| B08 | Migration | Media **blob** copy incomplete (metadata-only; binaries deferred) | **HIGH** | Final migration readiness **H3**; rehearsal `media_blob_copy_deferred` | Decide blob strategy or accept 404 risk with waiver | Product + Ops | PRODUCTION CUTOVER |
| B09 | Governance | Manual approval / go–no-go for authoritative unsigned | **CRITICAL** | Authoritative prereqs § — approval gate unsigned | Signed pilot approval before mode=`authoritative` | Leadership | AUTHORITATIVE PILOT |
| B10 | Governance | Estate-wide production cutover gates open (backups, window, DNS, Hostinger env, identity) | **CRITICAL** | [`V5_HOSTED_MIGRATION_AND_CUTOVER.md`](../database/V5_HOSTED_MIGRATION_AND_CUTOVER.md) | Complete cutover preconditions + signed window | Ops + Leadership | PRODUCTION CUTOVER |
| B11 | Ops | Operator confirm Hostinger already runs V5 foundation + DNS before any routing flip | **HIGH** | Shadow readiness § — operator gate | Confirm `/healthz`, deployment code, DNS for apex + `diagnostic.blessboard.org` | Ops | SHADOW MODE |
| B12 | Commercial | `plan_key` migration not approved; `free`/`professional`/`partner` unresolved for production vocabulary | **HIGH** | [`BLESSBOARD_PLAN_KEY_MIGRATION_PLAN.md`](../migrations/BLESSBOARD_PLAN_KEY_MIGRATION_PLAN.md) — analysis only | Approve insert/repoint plan; resolve `partner` disposition; update provision defaults | Product | PRODUCTION CUTOVER |

---

## 2. Accepted limitations

| ID | Area | Limitation | Severity | Evidence | Required action | Owner type | Required before |
|----|------|------------|----------|----------|-----------------|------------|-----------------|
| A01 | Product | No payment checkout / QR payment / giving processor | INFORMATIONAL | GUI parity audits — BLOCKED BY DATA / intentional | Keep info-only; document in demos | Product | POST-CUTOVER |
| A02 | Product | Contact form POST / fabricated KPIs / DNS-SSL / deploy-restart-rollback UIs omitted | INFORMATIONAL | Full GUI regression + PA/HQ/BA parity | Do not invent metrics or ops controls for demo | Product | POST-CUTOVER |
| A03 | Product | Create Organization is CLI-only (no PA create-org UI) | LOW | PLATFORM_ADMIN_PARITY — BLOCKED BY DATA | Use CLI for demo orgs | Ops | DEMO |
| A04 | Product | Tenant login uses apex transfer (not Stitch in-page password card) | LOW | TENANT_PUBLIC_PARITY — MATERIAL intentional | Demo apex↔tenant transfer; do not add parent-domain cookies | Product | DEMO |
| A05 | Product | Soft-archive media only; no malware scan; church-wide media library among BA | LOW | MEDIA_ATTACHMENT_SECURITY_AUDIT | Accept or schedule later | Product + Security | POST-CUTOVER |
| A06 | Security | CSRF cookie not HttpOnly (double-submit design) | INFORMATIONAL | SESSION_COOKIE / CSRF audits | Keep intentional | Security | N/A |
| A07 | Security | No session purge job; minor path CHECK vs `/member` allowlist notes | LOW | SESSION_COOKIE_AUDIT remaining risks | Track; not flip-blockers | Engineering | POST-CUTOVER |
| A08 | Performance | No Lighthouse / hosted query benchmarks claimed | INFORMATIONAL | FE + server query audits | Optional measure later | Engineering | POST-CUTOVER |
| A09 | GUI | Stitch-only screens still missing (account/settings/detail pairs, etc.) | LOW | Parity audits — BLOCKED BY MISSING STITCH | Accept chrome gaps or schedule Stitch | Design | POST-CUTOVER |
| A10 | Env | Invalid routing/host-context enums fail-closed to `off` | INFORMATIONAL | ENV reference | Safe default; keep | Engineering | N/A |

---

## 3. Deferred features

| ID | Area | Item | Severity | Evidence | Required action | Owner type | Required before |
|----|------|------|----------|----------|-----------------|------------|-----------------|
| D01 | Member | `/member/prayer` route | LOW | Route/link audit DEFERRED; member parity | Do not add href until product/route exists | Product | POST-CUTOVER |
| D02 | Branch | Reports / Departments / Duty roster (Stitch exists, V5 absent) | MEDIUM | BRANCH_ADMIN_PARITY | Schedule modules | Product | POST-CUTOVER |
| D03 | HQ | Monthly report review, Roles UI, Org templates — missing by design | MEDIUM | HQ_ADMIN_PARITY | Schedule or keep deferred | Product | POST-CUTOVER |
| D04 | Auth | Waiting verification / Forgot password | MEDIUM | TENANT_PUBLIC_PARITY | Product decision | Product | POST-CUTOVER |
| D05 | Platform | Billing checkout, DNS/SSL verify, deploy/restart/rollback | MEDIUM | PLATFORM_ADMIN_PARITY | Out of V5 foundation scope | Product | POST-CUTOVER |
| D06 | Performance | Brand logo resize; list pagination; extra indexes; narrow SELECTs | LOW | FE + server query audits | Backlog | Engineering | POST-CUTOVER |
| D07 | A11y | Speculative ARIA; universal `aria-describedby`; full SR matrix | LOW | ACCESSIBILITY_AUDIT | Manual / later | Engineering | POST-CUTOVER |
| D08 | Migration | Media group blob copy | HIGH | See B08 | Same as B08 | Ops | PRODUCTION CUTOVER |

---

## 4. Manual verification items

| ID | Area | Check | Severity | Evidence | Required action | Owner type | Required before |
|----|------|-------|----------|----------|-----------------|------------|-----------------|
| M01 | Deployment | Hostinger env pairing: `PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5`, `DEPLOYMENT_ENV=testing`, V5-only `DATABASE_URL`, `GETPRO_DATABASE_URL` unset, jobs `0`, `SESSION_SECRET` ≥32 | HIGH | ENV reference; shadow readiness §1–2 | Panel walkthrough; `db:identity:check` | Ops | SHADOW MODE |
| M02 | Deployment | DNS: apex + `diagnostic.blessboard.org` → V5 app | HIGH | Shadow / authoritative docs | Dig / curl with Host headers | Ops | SHADOW MODE |
| M03 | Routing | After shadow flip: apex `/healthz`/`/`/`/login`; demo Host still foundation HTML; shadow log keys; unknown host; no secrets in logs | CRITICAL | Shadow runbook §7–§14 | Capture evidence pack | Ops + QA | AUTHORITATIVE PILOT |
| M04 | Auth | Live cookie host-only (no `Domain=.blessboard.org`); CSRF 403; transfer wrong-host | HIGH | Session audit; smoke plan | Browser DevTools + smoke T-items | QA | AUTHORITATIVE PILOT |
| M05 | GUI | Browser a11y: drawer keyboard, sticky skip targets, media dialogs | MEDIUM | A11y + responsive audits | Manual browser QA | QA | DEMO |
| M06 | GUI | Responsive: long names, nested HQ tables, bottom tabs, chip rails | MEDIUM | RESPONSIVE_STATIC_AUDIT | Manual browser QA | QA | DEMO |
| M07 | Security | Confirm authz matrix in live roles after personas exist | MEDIUM | AUTHORIZATION_MATRIX | Role-matrix smoke | QA | AUTHORITATIVE PILOT |
| M08 | Migration | Hosted `db:status`, backups ≤24h, fingerprint separation, ≤4h rollback plan | CRITICAL | Hosted cutover runbook | Ops checklist | Ops | PRODUCTION CUTOVER |
| M09 | V4 | Confirm V4 `blessboard.com` path unchanged while V5 routing stays off/shadow | MEDIUM | Overnight report; cutover | Smoke V4 site | Ops | SHADOW MODE |
| M10 | Dependencies | Triage multer / path-to-regexp highs before production | MEDIUM | Final migration readiness §3 | npm audit plan | Engineering | PRODUCTION CUTOVER |

---

## 5. Commercial / package migration items

| ID | Area | Item | Severity | Evidence | Required action | Owner type | Required before |
|----|------|------|----------|----------|-----------------|------------|-----------------|
| C01 | Plans | `plan_key` immutable — must insert + repoint, never in-place rename | HIGH | Plan-key migration plan §1 | Design migration SQL under approval | Engineering | PRODUCTION CUTOVER |
| C02 | Plans | Map `free`→`foundation`, keep `growth`, `professional`→`network` | HIGH | Plan-key plan §2–§3 | Implement under approval | Product + Engineering | PRODUCTION CUTOVER |
| C03 | Plans | `partner` disposition gated — do not auto-delete; live inventory missing | HIGH | Plan-key plan blockers | Capture live inventory; product decision | Product + Ops | PRODUCTION CUTOVER |
| C04 | Plans | Provision still defaults `planKey: "free"` until cutover | MEDIUM | Plan-key plan | Update provision + `mapPlanKey` with migration | Engineering | PRODUCTION CUTOVER |
| C05 | Billing | Do not conflate cents drift (1490 vs 1499) with plan_key rename | LOW | Plan-key plan | Separate billing ticket | Product | POST-CUTOVER |
| C06 | Dual models | Church package catalogue vs platform entitlements dual model | MEDIUM | Plan-key plan | Align resolver post-rename | Engineering | PRODUCTION CUTOVER |

---

## 6. Hosted-data migration items

| ID | Area | Item | Severity | Evidence | Required action | Owner type | Required before |
|----|------|------|----------|----------|-----------------|------------|-----------------|
| H01 | Hosted migrate | Local rehearsal PASS ≠ hosted cutover | CRITICAL | [`V4_TO_V5_MIGRATION_REHEARSAL.md`](../database/V4_TO_V5_MIGRATION_REHEARSAL.md); final readiness | Hosted dry-run/apply | Ops | PRODUCTION CUTOVER |
| H02 | Hosted migrate | Explicit `V4_SOURCE_*` / `V5_TARGET_*` only — no `DATABASE_URL` fallback | CRITICAL | Migration tooling tests; env policy | Operator runbooks only | Ops | PRODUCTION CUTOVER |
| H03 | Hosted migrate | Identity gate `DATABASE_IDENTITY_EXPECTED` before writes | CRITICAL | Identity / cutover docs | Always run check | Ops | PRODUCTION CUTOVER |
| H04 | Hosted migrate | No reverse-write V5→V4; no recreate `public.tenants` / `public.session` on V5 | CRITICAL | Hosted cutover hard rules | Enforce in runbook | Ops | PRODUCTION CUTOVER |
| H05 | Hosted migrate | Quarantine expected invalids (e.g. bad org slug, missing contact) | MEDIUM | Local rehearsal report | Review quarantine lists on hosted | Ops | PRODUCTION CUTOVER |
| H06 | Hosted migrate | Reconciliation counts on hosted after apply | HIGH | Final readiness | Sign-off table | Ops + QA | PRODUCTION CUTOVER |
| H07 | Demo data | Never use `church:seed-demos` / V4 seeds on V5 DB | CRITICAL | Demo readiness INVALID note | Use V5 provision/scripts only | Ops | DEMO |

---

## 7. Deployment actions that must never run automatically

| ID | Action | Severity | Why | Evidence | Owner type |
|----|--------|----------|-----|----------|------------|
| X01 | Set `BLESSBOARD_TENANT_ROUTING_MODE=shadow` | CRITICAL | Requires operator prechecks + restart all workers | Shadow runbook | Ops (manual only) |
| X02 | Set `BLESSBOARD_TENANT_ROUTING_MODE=authoritative` | CRITICAL | Blocked until evidence + approval; changes public HTML | Authoritative prereqs | Ops + Leadership |
| X03 | `migrate:v4-to-v5:apply` against hosted/production URLs | CRITICAL | Destructive writes; needs window + identity | Hosted cutover | Ops (manual only) |
| X04 | Enable jobs (`BLESSBOARD_JOBS_ENABLED=1`) on V5 without approval | HIGH | Cron against platform DB | Env reference; shadow runbook | Ops |
| X05 | Set `GETPRO_DATABASE_URL` on V5 Hostinger | CRITICAL | Silent attach risk to V4/GetPro DB | Env / cutover hard rules | Ops |
| X06 | Parent-domain session cookie `Domain=.blessboard.org` | CRITICAL | Cross-host session leak | Session cookie audit | Engineering — forbidden |
| X07 | Infer routing from `NODE_ENV` / Git branch / hostname | CRITICAL | Unsafe mode flips | tenantRoutingMode | Engineering — forbidden |
| X08 | CI/CD auto-flip routing or auto-apply hosted migration | CRITICAL | Program constraint | This consolidation | Platform |
| X09 | Execute plan_key destructive SQL without product approval | HIGH | Ambiguous `partner` rows | Plan-key plan | Product + Ops |
| X10 | `church:seed-demos` / legacy seed against V5 foundation | CRITICAL | Creates forbidden legacy shapes | Demo readiness | Ops |

---

## 8. Readiness dashboard

Evidence-backed only. **READY** requires documented audit/test evidence that the area works for its stated scope (not “code exists”).

| Area | Status | Evidence summary | Primary blockers / notes |
|------|--------|------------------|--------------------------|
| Apex GUI | **READY** | Full GUI regression — Apex demo-ready; MATERIAL GAPS none | Hosted content not required for apex chrome |
| Tenant public GUI | **READY WITH MANUAL CHECK** | Tenant public parity + regression demo-ready; CMS pages need published data | B03–B04 for real content; authoritative for tenant shell |
| Member portal | **BLOCKED** | Portal chrome READY in regression; hosted personas/memberships MISSING | B02, B04; prayer deferred D01 |
| Branch Admin | **BLOCKED** | Shell/modules demo-ready in parity; no BA user on hosted | B02 |
| HQ Admin | **BLOCKED** | Shell/modules demo-ready; no HQ user on hosted | B02 |
| Platform Admin | **BLOCKED** | Shell demo-ready; no PA user on hosted | B02 |
| Media | **READY WITH MANUAL CHECK** | Media security + Batch 22 audits; soft-archive intentional | Blob migration B08 for cutover media continuity |
| Authentication | **READY WITH MANUAL CHECK** | Session/CSRF/auth HTTP tests PASS; live Hostinger cookie/transfer proofs pending | M04 |
| Authorization | **READY WITH MANUAL CHECK** | Authorization matrix PASS in tests; live role smoke after personas | M07 · B02 |
| Tenant routing | **READY WITH MANUAL CHECK** | Automated routing suites PASS; shadow **GO to enable**; live shadow evidence MISSING; authoritative **NOT READY** | B01 · B05 · B09 · X01/X02 |
| Demo data | **BLOCKED** | Catalogue READY; users/roles/CMS/samples MISSING | B02–B04 |
| Plan-key migration | **DEFERRED** | Analysis-only plan; not approved | C01–C06 · B12 |
| V4 data migration | **READY WITH MANUAL CHECK** | Local rehearsal PASS; hosted **READY WITH MANUAL CONDITIONS** (H1–H3) | B06–B08 · H01–H06 |
| Deployment documentation | **READY** | Env reference, shadow runbook, authoritative prereqs, hosted cutover docs present | Docs do not authorize flips |

### Dashboard status definitions

| Status | Meaning |
|--------|---------|
| READY | Documented evidence that the area meets its current-scope bar |
| READY WITH MANUAL CHECK | Code/docs/tests green; live Hostinger or data verification still required |
| BLOCKED | Explicit missing data, evidence, approval, or migration gate |
| DEFERRED | Intentionally postponed / not in current release scope |
| NOT APPLICABLE | Out of scope for this consolidation |

---

## 9. Gate summary

| Gate | Ready? | Why |
|------|--------|-----|
| **DEMO** (full role E2E on hosted) | **NO** | B02–B04 (personas + Home/About + samples) |
| **SHADOW MODE** (enable observational routing) | **YES — with operator checks** | Shadow readiness **GO**; complete M01–M02 then X01 manually via runbook. Users/CMS **not** required for shadow |
| **AUTHORITATIVE PILOT** | **NO** | B01, B02–B05, B09 — NOT READY per authoritative prereqs |
| **PRODUCTION CUTOVER** | **NO** | B06–B08, B10, B12 + hosted cutover preconditions |
| **POST-CUTOVER** | Backlog | Accepted limitations + deferred features (A*, D*) |

---

## Sources

| Doc | Role |
|-----|------|
| [`docs/gui/V5_FULL_GUI_REGRESSION_AUDIT.md`](../gui/V5_FULL_GUI_REGRESSION_AUDIT.md) | Cross-portal GUI |
| [`docs/gui/*_PARITY_AUDIT.md`](../gui/) | Per-portal Stitch parity |
| [`docs/gui/V5_ACCESSIBILITY_AUDIT.md`](../gui/V5_ACCESSIBILITY_AUDIT.md) | A11y |
| [`docs/gui/V5_RESPONSIVE_STATIC_AUDIT.md`](../gui/V5_RESPONSIVE_STATIC_AUDIT.md) | Responsive static |
| [`docs/security/V5_*.md`](../security/) | Session, CSRF, authz, I/O, media, query, tenant resolution, logging |
| [`docs/performance/V5_*.md`](../performance/) | FE assets + server queries |
| [`docs/testing/V5_DEMO_TENANT_READINESS.md`](../testing/V5_DEMO_TENANT_READINESS.md) | Hosted demo catalogue vs personas |
| [`docs/testing/V5_DEMO_E2E_SMOKE_TEST.md`](../testing/V5_DEMO_E2E_SMOKE_TEST.md) | Hosted smoke plan |
| [`docs/testing/V5_ROUTE_AND_LINK_AUDIT.md`](../testing/V5_ROUTE_AND_LINK_AUDIT.md) | Nav/route integrity |
| [`docs/deployment/V5_ENVIRONMENT_VARIABLE_REFERENCE.md`](../deployment/V5_ENVIRONMENT_VARIABLE_REFERENCE.md) | Env safety |
| [`docs/deployment/V5_SHADOW_ROUTING_READINESS.md`](../deployment/V5_SHADOW_ROUTING_READINESS.md) | Shadow GO |
| [`docs/deployment/V5_SHADOW_MODE_RUNBOOK.md`](../deployment/V5_SHADOW_MODE_RUNBOOK.md) | Manual shadow flip |
| [`docs/deployment/V5_AUTHORITATIVE_ROUTING_PREREQUISITES.md`](../deployment/V5_AUTHORITATIVE_ROUTING_PREREQUISITES.md) | Authoritative NOT READY |
| [`docs/migrations/BLESSBOARD_PLAN_KEY_MIGRATION_PLAN.md`](../migrations/BLESSBOARD_PLAN_KEY_MIGRATION_PLAN.md) | Commercial keys |
| [`docs/database/V5_FINAL_MIGRATION_READINESS.md`](../database/V5_FINAL_MIGRATION_READINESS.md) | Migration conditions |
| [`docs/database/V5_HOSTED_MIGRATION_AND_CUTOVER.md`](../database/V5_HOSTED_MIGRATION_AND_CUTOVER.md) | Hosted cutover |
| [`docs/database/V4_TO_V5_MIGRATION_REHEARSAL.md`](../database/V4_TO_V5_MIGRATION_REHEARSAL.md) | Local rehearsal PASS |
| [`docs/database/V5_OVERNIGHT_READINESS_REPORT.md`](../database/V5_OVERNIGHT_READINESS_REPORT.md) | Conservative rollout snapshot (superseded in part by later portal/login maturity) |
