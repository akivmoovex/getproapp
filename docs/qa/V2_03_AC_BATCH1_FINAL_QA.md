# V2.03 — ActiveClinic Batch 1 Final QA

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_AC_BATCH1_FINAL_QA` |
| **Date** | 2026-09-26 |
| **Branch** | `V10` |
| **Scope** | ACN01–16, ACN21–23, ACN25–26 — final QA, no new features |
| **Hosts probed** | `activeclinic.pronline.org`, `blessboard.pronline.org` only |
| **Production** | **Untouched** (no prod hosts hit; no writes to pronline) |

---

## 1. Identity

| Item | Value |
|------|--------|
| **Local SHA (committed HEAD)** | `27d4021147c0e03fd3c724ea47081a1e1a00ef17` (`27d40211`) |
| **Local HEAD message** | Deduplicate Batch1 platform CSV, money, and status-transition helpers |
| **Hosted SHA (AC + BB `/healthz`)** | `802912259ab0` |
| **Hosted vs local** | Hosted is **14 commits behind** `V10` HEAD; Batch 1 V2.03 commits are **not** on pronline |
| **Working tree** | Uncommitted Stitch parity WIP (frozen tokens, ODS stitch IDs, `docs/v2.03/AC_BATCH1_STITCH_PARITY.md`) — not in hosted, not in committed SHA |
| **Deployment identity** | `deploymentCode=moovex-platform-testing` · `environment=testing` · `expectedIdentityKey=moovex-platform-v7` · `platformLine=v8` · `mode=moovex-platform-runtime` |
| **DB identity** | `expectedDatabaseEnvironment=testing` · `mediaWriteNamespace=testing` · `sessionCookieName=moovex_platform_testing_sid` · `jobsEnabled=false` |
| **Schema gate** | `schemaCompatible=true` (hosted healthz) |

---

## 2. Migrations (Batch 1–relevant)

| Migration | Purpose |
|-----------|---------|
| `db/migrations/activeclinic/036_batch1a_services_practitioners.sql` | Ops catalogue pricing / practitioner availability |
| `db/migrations/activeclinic/037_batch1a_appointment_canonical_statuses.sql` | Appointment status vocabulary |
| `db/migrations/activeclinic/038_batch1a_patient_consent_clinic_fields.sql` | Patient consent ledger |
| `db/migrations/activeclinic/039_batch1a_clinical_follow_up.sql` | Clinical follow-up worklist |
| `db/migrations/blessboard/118_activeclinic_management_data_permissions.sql` | `performance.view` / `data.import` / `data.export` |
| `db/migrations/platform/043_shared_data_jobs_and_preferences.sql` | Platform data jobs + prefs |
| `db/migrations/platform/037_audit_events_product_facility.sql` | Audit product/facility columns |

**Hosted note:** Healthz schema checks pass for **pre–Batch-1** V7 required set. Batch 1A tables/permissions above are **not proven applied on hosted** (new routes 404; deploy lag).

---

## 3. Automated tests

| Suite | Tests | Pass | Fail | Skip |
|-------|------:|-----:|-----:|-----:|
| `tests/activeclinic-batch1a-*.test.js` (config, appointments, patient/reception, clinical, billing, management) | 28 | 28 | 0 | 0 |
| BB/platform + public booking + nav RBAC (`church-member-import`, `v2-03-platform-shared-foundation`, `activeclinic-public-booking`, `activeclinic-navigation-rbac`) | 28 | 27 | 0 | 1 |
| Extra regression (`mf05-onboarding`, `appointment-foundation`, `v8-shared-rbac-tenant-isolation`, `v8-tenant-product-isolation`) | 31 | 31 | 0 | 0 |
| **Totals** | **87** | **86** | **0** | **1** |

Local Batch1a coverage exercised (via HTTP + service layer): forged-tenant denial, RBAC 403, cross-clinic isolation, persistence after refresh, consent privacy (no clinical leak into finance HTML), stitch markers, cash/bank/mobile money payment rules, data-job preview/commit isolation.

---

## 4. Hosted smoke (safe, read-only)

| Check | Result |
|-------|--------|
| `GET https://activeclinic.pronline.org/healthz` | **200** · SHA `802912259ab0` · schema OK |
| `GET https://blessboard.pronline.org/healthz` | **200** · SHA `802912259ab0` · schema OK |
| AC `/login` · BB `/login` | **200** |
| AC `/` · clinics directory | **200** |
| AC `/book` | **302** (redirect — expected unauthenticated) |
| Pre-existing staff routes (`/app/onboarding`, `/app/patients`, `/app/reception`, `/app/appointments/calendar`, `/app/billing/invoices`) | **303** → auth (route present) |
| **Batch 1–new routes** (`/app/services`, `/app/performance`, `/app/data`, `/app/clinical/follow-up`) | **404** — **not deployed** on hosted SHA |
| Mutations / authenticated journey on hosted | **Not run** (would require login writes; deploy lag makes journey invalid) |
| Production hosts | **Not contacted** |

---

## 5. Journey matrix (local automated evidence vs hosted)

| Step | ACN | Local automated | Hosted smoke | Notes |
|------|-----|------------------|--------------|-------|
| Clinic configuration | ACN01 | Pass | Partial (303 onboarding) | Fact-driven checklist; Stitch marketing cards gap |
| Service catalogue / editor | ACN02–03 | Pass | **Fail (404)** | Not on hosted SHA |
| Practitioner directory / availability | ACN04–05 | Pass | Not probed / N/A | Depends on ACN02 deploy |
| Booking + review | ACN06–09 | Pass | Partial (calendar 303) | Create/queue enhanced locally |
| Patient + consent | ACN10–11 | Pass | Partial (patients 303) | Consent ledger local-only until deploy |
| Check-in + queue | ACN12–13 | Pass | Partial (reception 303) | |
| Worklist → encounter → follow-up | ACN14–16 | Pass | **Fail (follow-up 404)** | |
| Invoice → payment → receipt | ACN21–23 | Pass | Partial (invoices 303) | ODS stitch IDs in uncommitted WIP |
| Performance + import/export | ACN25–26 | Pass | **Fail (404)** | |
| Persistence after refresh | — | Pass | Not verified hosted | Batch1a appointment/consent HTTP refresh |
| New session persistence | — | Pass (session cookie re-auth paths) | Not verified hosted | |
| Role authorization / server denial | — | Pass | Not verified hosted | 403/deny paths in Batch1a |
| Tenant / facility isolation | — | Pass | Profile isolation tests Pass | |
| Patient privacy | — | Pass | — | Finance HTML non-leak asserts |
| Audit records | — | Pass (foundation + service audits) | — | |
| Desktop 1440 / mobile 390 | — | CSS + markers | Not screenshot-verified hosted | See Stitch parity doc |
| Stitch parity | — | Partial | N/A on hosted | `COMPLETE_WITH_GAPS` |
| Public booking | — | Pass | `/book` 302 OK | |
| Patient portal | — | Not re-run this pass | Clinics dir 200 | No portal mutation |
| BB regression | — | Pass (member CSV + isolation) | BB healthz/login 200 | |

---

## 6. Screen matrix (ACN)

| Screen | Desktop | Mobile | Functional (local) | RBAC (local) | Persistence (local) | Parity | Hosted |
|--------|---------|--------|--------------------|--------------|---------------------|--------|--------|
| ACN01 | Pass | Pass | Pass | Pass | Pass | Partial | 303 |
| ACN02 | Pass | Pass | Pass | Pass | Pass | Pass* | **404** |
| ACN03 | Pass | N/A | Pass | Pass | Pass | Partial | **404** |
| ACN04 | Pass | Pass | Pass | Pass | Pass | Partial | — |
| ACN05 | Pass | Pass | Pass | Pass | Pass | Partial | — |
| ACN06 | Pass | Pass | Pass | Pass | Pass | Partial | 303 |
| ACN07 | Pass | N/A | Pass | Pass | Pass | Partial | — |
| ACN08 | Pass | N/A* | Pass | Pass | Pass | Partial | — |
| ACN09 | Pass | N/A | Pass | Pass | Pass | Partial | — |
| ACN10 | Pass | Pass | Pass | Pass | Pass | Partial | 303 |
| ACN11 | Pass | Pass | Pass | Pass | Pass | Partial | — |
| ACN12 | Pass | Pass | Pass | Pass | Pass | Partial | — |
| ACN13 | Pass | Pass | Pass | Pass | Pass | Partial | 303 |
| ACN14 | Pass | Pass | Pass | Pass | Pass | Partial | — |
| ACN15 | Pass | Pass | Pass | Pass | Pass | Partial | — |
| ACN16 | Pass | Pass | Pass | Pass | Pass | Partial | **404** |
| ACN21 | Pass | Pass | Pass | Pass | Pass | Partial | 303 |
| ACN22 | Pass | N/A | Pass | Pass | Pass | Partial | — |
| ACN23 | Pass | Pass | Pass | Pass | Pass | Partial | — |
| ACN25 | Pass | Pass | Pass | Pass | Pass | Partial | **404** |
| ACN26 | Pass | Pass | Pass | Pass | Pass | Partial | **404** |

\*Parity Pass for ACN02 refers to local Stitch parity WIP; not deployed.

---

## 7. Failures

| # | Failure | Severity | Impact |
|---|---------|----------|--------|
| F1 | Hosted SHA `802912259ab0` lacks V2.03 Batch 1 commits (14 behind) | **Release** | Cannot certify end-to-end journey on pronline |
| F2 | Hosted **404** on `/app/services`, `/app/performance`, `/app/data`, `/app/clinical/follow-up` | **Release** | Config / management / follow-up unavailable hosted |
| F3 | Uncommitted Stitch parity token/ID changes | Medium | Local HEAD ≠ working tree; parity not frozen in commit |
| F4 | Stitch visual gaps (ACN01 marketing checklist, dual B2 chrome, decorative banners) | Low | Documented in `docs/v2.03/AC_BATCH1_STITCH_PARITY.md` |

**Automated test failures:** none (0 fail).

---

## 8. Known gaps

1. **Deploy lag** — Batch 1 must be deployed to `moovex-platform-testing` / pronline before RELEASE_CANDIDATE.
2. **Hosted authenticated journey** — not executed (safe smoke only; writes avoided; routes missing).
3. **Stitch parity** — `V2_03_AC_BATCH1_STITCH_PARITY_COMPLETE_WITH_GAPS`; frozen-colour WIP uncommitted.
4. **Patient portal deep smoke** — not re-authenticated this pass.
5. **Batch 1 migrations on hosted DB** — not confirmed applied (schema gate covers older V7 set only).

---

## 9. Production untouched confirmation

- Only `*.pronline.org` testing hosts were contacted.
- No production apex (`getproapp.org` / live church/clinic production) probes.
- No POST/PUT/PATCH/DELETE against hosted.
- No DB migration apply against hosted/production.
- No deploy performed.

---

## 10. Final verdict

**`V2_03_AC_BATCH1_COMPLETE_WITH_GAPS`**

Local Batch 1 implementation + automated journey/RBAC/isolation/persistence evidence are green (86 pass / 0 fail / 1 skip). Pronline hosted remains on pre–Batch-1 SHA with new ACN routes 404, so this is **not** a release candidate until deploy + hosted re-smoke.
