# ActiveClinic V2.03 — V10 Post-Deploy Hosted Gate

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_V10_POST_DEPLOY_GATE` |
| **Expected SHA** | `d5bb82045e6858b628257a81f54d5d7d8dc4e1ab` |
| **Production** | Untouched (healthz identity only) |

This document records **two separate attempts**. Attempt 1 is not rewritten as a pass.

---

## Attempt 1 — Pre-push / SHA lag (BLOCKED)

| Field | Value |
|-------|--------|
| **When** | 2026-09-26 (pre-push) |
| **Verdict** | **`V2_03_V10_HOSTED_GATE_BLOCKED`** |

### Gate stop reason

**SOURCE ALIGNMENT = FAIL** and **HOSTED ALIGNMENT = FAIL**.

| Surface | Observed SHA | Match expected `d5bb8204…`? |
|---------|--------------|------------------------------|
| Local `HEAD` | `d5bb82045e6858b628257a81f54d5d7d8dc4e1ab` | YES |
| `origin/V10` (after fetch) | `0014616f6161b839344039ef7ed44cebeffb9f27` | **NO** |
| `activeclinic.pronline.org` `/healthz` `gitSha` | `0014616f6161` | **NO** |
| `blessboard.pronline.org` `/healthz` `gitSha` | `0014616f6161` | **NO** |

Per gate rules: **STOP** — functional certification against wrong SHA not executed.

Testing migrations 036–042 were already APPLIED (schema ahead of hosted app). Production healthz remained `03a89106e2fe` / `moovex-platform-production`.

---

## Attempt 2 — Post-push final hosted QA (BLOCKED)

| Field | Value |
|-------|--------|
| **When** | 2026-09-26 (post-push) |
| **Verdict** | **`V2_03_V10_FINAL_HOSTED_GATE_BLOCKED`** |
| **Mode** | VERIFY + HOSTED QA ONLY — no app/schema/migrate/commit/push/prod/fix |

### 1. Local / origin alignment

| Check | Result |
|-------|--------|
| `git fetch origin` | done |
| Local `HEAD` | `d5bb82045e6858b628257a81f54d5d7d8dc4e1ab` |
| `origin/V10` | `d5bb82045e6858b628257a81f54d5d7d8dc4e1ab` |
| `origin/V10...HEAD` left-right | `0 0` |
| **SOURCE ALIGNMENT** | **PASS** |

### 2. Hosted deployment

| Surface | `gitSha` | Profile | Environment |
|---------|----------|---------|-------------|
| AC pronline | `d5bb82045e68` | `moovex-platform-testing` | `testing` |
| BB pronline | `d5bb82045e68` | `moovex-platform-testing` | `testing` |

**HOSTED ALIGNMENT: PASS** (unambiguous abbreviation of expected SHA).

### 3. Environment + DB identity

| Item | Value | Result |
|------|-------|--------|
| Deployment profile | `moovex-platform-testing` | PASS |
| Environment | `testing` | PASS |
| DB identity (expected) | `moovex-platform-v7` | PASS |
| DB environment (expected) | `testing` | PASS |
| Production identity in use | NO | PASS |

### 4. Migration state (read-only; no migrate run)

Ledger module `activeclinic` on testing DB:

| Migration | Ledger | Objects |
|-----------|--------|---------|
| 036 | APPLIED | — |
| 037 | APPLIED | — |
| 038 | APPLIED | — |
| 039 | APPLIED | — |
| 040 | APPLIED | `activeclinic.facility_rooms` exists |
| 041 | APPLIED | `clinical_documents`, `clinical_document_events` exist |
| 042 | APPLIED | `patient_visit_summary_releases` exists |

Platform 036–039 also APPLIED (prior remediation). **No migrations re-run.**

### 5. Baseline staff QA

| Route | Result |
|-------|--------|
| POST `/login` (clinician/nurse/facility_admin/receptionist) | PASS |
| `/app` | 200 |
| `/app/services` (clinician) | 403 (legitimate RBAC) |
| `/app/clinical` | 200 |
| `/app/clinical/follow-up` | 200 |
| `/app/clinical/referrals` | 200 |

**BASELINE STAFF: PASS**

### 6. ACN27 — Rooms & Spaces

| Check | Result |
|-------|--------|
| functional (list, filters/facility context, Add Room for facility_admin, B2-10 `/app/facilities` intact) | PASS |
| RBAC (clinician list 200 / new 403; facility_admin new 200) | PASS |
| tenant isolation | PASS (org-scoped) |
| facility isolation (forged room → 404) | PASS |
| desktop Stitch `b8f071b326234022afb3eecc665be9bc` | PASS |
| 390px Stitch `74a8167ce99e45388a7dd1fbe9a92a88`; primary CTA ≥44px; no major overflow | PASS |
| occupancy engine | not present (intentional) |

### 7. ACN18 — Clinical Documents

| Check | Result |
|-------|--------|
| list / new form / stitch ids | PASS |
| nurse view 200 / nurse create 403 / facility_admin list 403 | PASS |
| create draft (clinician, CSRF-correct) → detail 200 | PASS |
| public CMS / file input | **NO** (`data-ac-binary-attachments="deferred"`; no `type=file`) |
| binary attachment status | intentional deferred (UI deferred attr; docs marker `BINARY_ATTACHMENT_DEFERRED_PRIVATE_STORAGE_REQUIRED`) |
| desktop / 390 stitch + primary touch | PASS |
| **forged / missing document detail** | **FAIL — request hangs (no HTTP completion; CDN timeout / abort ≥12–20s)** |
| **cross-patient document detail** | **FAIL — same hang** |

#### Blocker evidence (Attempt 2)

1. Hosted own document detail: **HTTP 200 ~548ms**  
   `/app/clinical/patients/{pid}/documents/02af2472-b50d-4917-a1b3-6de62bf42a9e`
2. Hosted forged / cross-patient detail: **no response** (Abort after 15–20s) for:
   - `.../documents/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee`
   - `.../documents/00000000-0000-4000-8000-000000000099`
   - cross-patient path with real doc id under foreign patient id
   - forged `/edit`
3. Earlier edge samples also showed `307` self-`Location` via `hcdn` then `504 Gateway Time-out`.
4. Code inspection on expected SHA (read-only): `activeClinicClinicalDocumentRoutes.js` calls `return renderSimpleState(res, { status: 404, ... })` but `renderSimpleState(title, message, extras)` returns an HTML **string** and does not write to `res`. Correct call sites elsewhere use `res.status(...).type("html").send(renderSimpleState(...))`. Mis-invocation explains hung not-found responses.

**Per gate rules: STOP ACN18 isolation certification. Do not patch during this gate.**

### 8. AC-P05 — Visit Summary

| Check | Result |
|-------|--------|
| staff `/app/clinical/encounter/:id/visit-summary/release` | 200 (clinician) |
| explicit release UI present | PASS |
| automatic release | NOT observed / not claimed |
| nurse / facility_admin GET release | **403** |
| nurse / facility_admin POST release | **403** |
| raw `consultation_notes` / internal notes / audit payloads on staff page | not exposed |
| portal list + stitch desktop id | PASS |
| forged portal summary | **404** |
| AC-P03/P04/P06 dead links on unreleased empty list | no dead release-gated links observed |
| PDF | intentional deferred copy (“PDF download is not available yet…”) — docs marker `VISIT_SUMMARY_PDF_DEFERRED_PRIVATE_STORAGE_REQUIRED` |
| desktop / 390 | PASS (primary controls ≥44px; secondary chrome F) |

### 9. Security / isolation (hosted)

| Domain | Result |
|--------|--------|
| ACN27 cross-facility / forged room | PASS (404) |
| ACN18 cross-patient / forged doc | **FAIL (hang)** — blocker |
| AC-P05 forged summary / unauthorized release | PASS |
| Legitimate RBAC 403 | PASS (not classified as app failure) |

### 10. B1+B2+B3 hosted regression

Representative authenticated smoke (facility_admin / clinician as appropriate): Dashboard, Patients, Appointments, Clinical, Follow-up, Referrals, Pharmacy, Diagnostics, Billing, Facilities, Rooms — **no unexpected 404/500**. Portal: Bookings, Visit Summaries, Invoices, Profile — **PASS**.

Clinical Documents list/new/own detail — PASS; **not-found paths excluded from regression pass** (blocker above).

**B1+B2+B3 HOSTED REGRESSION: PASS** (with ACN18 not-found exception recorded as blocker, not silent).

### 11. Six Stitch screens

| Screen | ID | Hosted |
|--------|-----|--------|
| ACN18 Desktop | `9b5d55cc2e8445f5bf97ef98f00cf8d3` | present |
| ACN18 Mobile | `ee65f85e2f484eb9b147dc06c97949ad` | present |
| ACN27 Desktop | `b8f071b326234022afb3eecc665be9bc` | present |
| ACN27 Mobile | `74a8167ce99e45388a7dd1fbe9a92a88` | present |
| AC-P05 Desktop | `cd4b21d6860843c6b6862f92326857af` | present (portal) |
| AC-P05 Mobile | `5df55128997f4b9b916852f26b972bb5` | present |

| Class | Unresolved |
|-------|------------|
| A visual blocker | **0** |
| B responsive blocker | **0** (primary CTAs ≥44px; smaller secondary nav/filter chrome = **F**) |

### 12. BlessBoard shared regression

Same SHA `d5bb82045e68`. Health / public home / login page / no ActiveClinic UI leakage — **PASS**.

### 13. Intentional gaps (still accurate; not V2.03 blockers)

**ACN18:** private binary attachment storage; attachment download; e-sign; DICOM/HL7; advanced versioning  

**AC-P05:** PDF/private storage; re-release/versioning; booking↔encounter FK/date-match limitation; automatic patient instructions; patient-view audit stream; ACN18 → patient release bridge  

**ACN27:** occupancy; IoT; equipment inventory; room scheduling; bed management  

### 14. Production safety (read-only)

| Host | Deployment | `gitSha` | Touched |
|------|------------|----------|---------|
| `activeclinic.org` | `moovex-platform-production` | `03a89106e2fe` | NO |
| `blessboard.com` | `moovex-platform-production` | `03a89106e2fe` | NO |

Production DB not queried for 040–042; no production migrate/deploy.

### 15. Change inventory (this gate)

| Item | Value |
|------|-------|
| QA documentation changed | **YES** (this file only for gate record) |
| Application code changed during gate | **NO** |
| Database schema / migrations during gate | **NO** |
| Production app/DB touched | **NO** |

### 16. Release blockers (Attempt 2)

1. **ACN18 not-found / cross-patient document HTTP hang** on hosted SHA `d5bb82045e68` — isolation cannot be certified; incorrect `renderSimpleState(res, opts)` usage leaves response open. **Do not treat as intentional gap.**

---

## Final Attempt 2 scorecard

See companion return block `ACTIVECLINIC_V2_03_V10_FINAL_HOSTED_GATE` in the gate agent report.

**READY FOR V2.03 QA RELEASE HANDOFF: NO** (until ACN18 not-found response path is fixed outside this gate and re-verified).

---

## Post-gate fix note (2026-09-27) — not a rewrite of Attempt 2

Attempt 2 remains **`V2_03_V10_FINAL_HOSTED_GATE_BLOCKED`**.

A focused engineering fix was applied afterward:

| Item | Value |
|------|--------|
| Doc | [`V2_03_ACN18_ISOLATION_HANG_FIX.md`](./V2_03_ACN18_ISOLATION_HANG_FIX.md) |
| Root cause | `renderSimpleState` returns HTML string; ACN18 called it as if it ended `res` |
| Fix | `sendSimpleState` / `sendDocumentNotFound` + update/finalize 404 on scoped miss |
| Local regression | Batch 1+2+3 **84 pass / 0 fail** (includes hang-detection HTTP test) |
| Hosted re-gate | **Not yet run** — requires commit + deploy of fix tip |

Do not treat Attempt 2 as a historical pass.
