# ActiveClinic V2.03 — QA Release Handoff

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_QA_RELEASE_HANDOFF` |
| **Date** | 2026-09-27 |
| **Version** | **2.03** |
| **Branch** | `V10` |
| **Application candidate SHA** | `b8c18c3ded9892aa318ae6e029600aa34ff4941b` |
| **Hosted application SHA (pronline)** | `b8c18c3ded98` |
| **Final gate** | `V2_03_FINAL_RELEASE_GATE_PASS` |
| **Freeze companion** | [`V2_03_RELEASE_FREEZE.md`](./V2_03_RELEASE_FREEZE.md) |
| **Production** | **NOT DEPLOYED** — app and DB untouched |

---

## 1. Release identity

| Item | Value |
|------|--------|
| Version | 2.03 |
| Branch | V10 |
| QA candidate SHA | `b8c18c3ded9892aa318ae6e029600aa34ff4941b` |
| Testing deployment | `moovex-platform-testing` |
| Environment | `testing` |
| Testing DB identity | `moovex-platform-v7` |
| Testing DB environment | `testing` |
| Migrations (ActiveClinic testing) | through **042** |
| Production | **NOT DEPLOYED** |

Any **application** change after this SHA invalidates the candidate (see freeze record). Documentation-only updates do not change the application candidate when clearly classified.

---

## 2. Release scope

### Batch 1 — Staff clinical / reception foundation

Canonical staff surfaces for ActiveClinic V2.03 Batch 1A (config, appointments, patients/reception, clinical encounter workspace, billing foundation, management data). Evidence: `docs/v2.03/V2_03_AC_*_PASS.md`, `docs/qa/V2_03_AC_BATCH1_FINAL_QA.md`.

### Batch 2 — Operational shell & facilities

Dashboard, patient/appointment workspaces, clinical encounter polish, operational queues, billing queues, facilities & departments (**AC-B2-10** owns `/app/facilities`), staff shell, RBAC/tenant/facility isolation. Evidence: `docs/qa/V2_03_BATCH2_*`, Batch 2 RBAC audit.

### Batch 3 — Leaves + formerly deferred new screens

| Area | Status |
|------|--------|
| ACN17 Vitals, ACN19 Rx editor, ACN20 referrals | Implemented (earlier Batch 3 leaves) |
| AC-P03 / AC-P04 / AC-P06 / AC-P07 portal leaves | Implemented |
| **ACN27 Rooms & Spaces** | **IMPLEMENTED_MVP** |
| **ACN18 Clinical Documents** | **IMPLEMENTED_MVP_WITH_PRIVATE_STORAGE_GAP** |
| **AC-P05 Visit Summary** | **IMPLEMENTED_MVP_WITH_PDF_STORAGE_GAP** |

Prior “deferred” status for ACN27 / ACN18 / AC-P05 is **obsolete** for approved V2.03 MVP scope. Intentional gaps below are **not** implemented features.

---

## 3. New final screen status

| Screen | Status |
|--------|--------|
| ACN27 | `IMPLEMENTED_MVP` |
| ACN18 | `IMPLEMENTED_MVP_WITH_PRIVATE_STORAGE_GAP` |
| AC-P05 | `IMPLEMENTED_MVP_WITH_PDF_STORAGE_GAP` |

---

## 4. ACN27 — Rooms & Spaces (QA notes)

| Item | Detail |
|------|--------|
| Facility | **Required** |
| Department | **Optional** |
| Canonical route | `/app/rooms` |
| Facilities catalogue | **B2-10** remains canonical at `/app/facilities` — ACN27 does **not** replace facilities/departments |
| RBAC view | `activeclinic.facility.view` |
| RBAC manage | `activeclinic.facility.update` |
| Migration | `040_facility_rooms.sql` → `activeclinic.facility_rooms` |
| Verified | tenant isolation, facility isolation, desktop, 390px |

**Explicitly NOT included:** occupancy, IoT, equipment inventory, room scheduling, bed management.

---

## 5. ACN18 — Clinical Documents (QA notes)

| Item | Detail |
|------|--------|
| Domain tables | `clinical_documents`, `clinical_document_events` |
| Statuses | `draft`, `final` |
| Final docs | Immutable via ordinary edit |
| RBAC view | `activeclinic.clinical_document.view` |
| RBAC create | `activeclinic.clinical_document.create` |
| RBAC finalize | `activeclinic.clinical_document.finalize` |
| Migration | `041_clinical_documents.sql` |
| Gap marker | `BINARY_ATTACHMENT_DEFERRED_PRIVATE_STORAGE_REQUIRED` |
| Public CMS / website media for PHI | **NO** |

### Final hosted security verification (`b8c18c3ded98`)

| Case | Result |
|------|--------|
| Valid own | **200** (completes ~0.5s) |
| Nonexistent | **404** (~280ms) |
| Cross-patient | **404**, no PHI |
| Cross-tenant / scoped | **404** or legitimate earlier **403** |
| Unauthorized role | **403**, no PHI |
| Request completion | **All terminate** (prior hang resolved) |

**Not included:** private binary attachments, attachment download, e-sign, DICOM/HL7, advanced document versioning.

---

## 6. AC-P05 — Visit Summary (QA notes)

| Item | Detail |
|------|--------|
| Release model | Explicit clinician release required |
| Encounter completed | Does **NOT** auto-release |
| Snapshot | One immutable patient-safe snapshot per encounter |
| Patient reads | Stored snapshot only |
| Raw `consultation_notes` | **NEVER EXPOSED** |
| ACN18 documents | **NOT** automatically exposed to patient |
| Release permission | `activeclinic.visit_summary.release` |
| Role | `activeclinic_clinician` |
| Migration | `042_patient_visit_summary_releases.sql` |
| Gap marker | `VISIT_SUMMARY_PDF_DEFERRED_PRIVATE_STORAGE_REQUIRED` |
| Verified | patient isolation, tenant isolation, facility scope, release RBAC, desktop, 390px |

**Portal integrations:** AC-P03 / AC-P04 conditional Visit Summary links; AC-P06 contextual invoice link when snapshot contains a legitimate invoice reference.

**Explicit gaps:** PDF/private storage; re-release/versioning; booking↔encounter FK/date-match; automatic patient instructions; patient-view audit; ACN18→patient release bridge.

---

## 7. Stitch status (six final screens)

| Screen | Stitch ID |
|--------|-----------|
| ACN18 Desktop | `9b5d55cc2e8445f5bf97ef98f00cf8d3` |
| ACN18 Mobile | `ee65f85e2f484eb9b147dc06c97949ad` |
| ACN27 Desktop | `b8f071b326234022afb3eecc665be9bc` |
| ACN27 Mobile | `74a8167ce99e45388a7dd1fbe9a92a88` |
| AC-P05 Desktop | `cd4b21d6860843c6b6862f92326857af` |
| AC-P05 Mobile | `5df55128997f4b9b916852f26b972bb5` |

| Hosted result | Value |
|---------------|--------|
| Six screens | **PASS** |
| Unresolved visual **A** | **0** |
| Unresolved responsive **B** | **0** |
| Design | V2.03 frozen token remap (not imported MD3) |

Documented C/D/E/F gaps remain open by design — do not reopen as blockers.

---

## 8. Test / QA evidence

### Local suites (post ACN18 hang fix)

| Suite | Result |
|-------|--------|
| Batch 1 | **28 pass / 0 fail** |
| Batch 2 (incl. RBAC/isolation) | **27 pass / 0 fail** |
| Batch 3 (incl. ACN18/27/AC-P05) | **29 pass / 0 fail** |
| **Total** | **84 pass / 0 fail** |

### Hosted final release gate (`b8c18c3ded98`)

| Area | Result |
|------|--------|
| B1 / B2 / B3 representative smoke | **PASS** |
| RBAC | **PASS** |
| Tenant isolation | **PASS** |
| Facility isolation | **PASS** |
| Patient isolation | **PASS** |
| BlessBoard / shared | **PASS** |

### ACN18 blocker history (do not erase)

1. Hosted gate on `d5bb8204` exposed ACN18 scoped-document **response hang** (forged/cross-patient → no bytes ~40s).
2. Root cause: `renderSimpleState` returns HTML string; callers did not `res.send`.
3. Fixed in `b8c18c3d` (`sendSimpleState` / `sendDocumentNotFound`).
4. Local regression tests passed (hang-detection HTTP test).
5. Hosted retest on `b8c18c3ded98` passed (404 ~280ms; hang count 0).
6. **Blocker resolved** — see `docs/qa/V2_03_ACN18_ISOLATION_HANG_FIX.md` and Attempt 2 vs Attempt 3 in `docs/qa/V2_03_V10_POST_DEPLOY_GATE.md`.

---

## 9. Migration status (TESTING only)

| Migration | Ledger |
|-----------|--------|
| 036 | APPLIED |
| 037 | APPLIED |
| 038 | APPLIED |
| 039 | APPLIED |
| 040 | APPLIED — `facility_rooms` |
| 041 | APPLIED — `clinical_documents`, `clinical_document_events` |
| 042 | APPLIED — `patient_visit_summary_releases` |

**These are TESTING state.** Do **not** claim applied to production. No production migration authorization is implied by this handoff.

---

## 10. Production status

| Item | State |
|------|--------|
| V2.03 promoted to production | **NO** |
| Production app | **Untouched** (historical SHA separate, e.g. `03a89106e2fe`) |
| Production DB | **Untouched** |
| Production migration of 040–042 | **Not authorized** by this handoff |

---

## 11. Manual QA checklist (prioritized)

### P0 — Security

- [ ] ACN18 cross-patient document detail → 404, no PHI, completes promptly
- [ ] ACN18 unauthorized roles (e.g. facility_admin / receptionist) → 403
- [ ] ACN18 forged / missing document → 404, completes promptly
- [ ] AC-P05 unreleased visit unavailable to patient
- [ ] AC-P05 cross-patient summary denied
- [ ] AC-P05 raw `consultation_notes` never on patient or staff release surfaces as raw notes
- [ ] Tenant isolation (org-scoped resources)
- [ ] Facility isolation (rooms / clinical scope)

### P1 — Functional

- [ ] ACN27 room list / filters / Add Room (facility_admin) / detail-edit where fixture permits
- [ ] ACN18 draft → edit → finalize → final read-only
- [ ] AC-P05 explicit clinician release
- [ ] AC-P03 / AC-P04 Visit Summary links only when released
- [ ] AC-P06 invoice link only with valid released invoice reference
- [ ] Core clinical workflow (patients, appointments, clinical, follow-up, referrals)

### P1 — Visual

- [ ] Six Stitch screens (IDs above)
- [ ] Desktop + 390px
- [ ] Navigation, forms, tables/cards
- [ ] No major horizontal overflow; important controls usable on 390px

### P2 — Regression

- [ ] B1/B2/B3 representative journeys
- [ ] BlessBoard shared smoke (home, login, no AC UI/data leakage)

---

## 12. Known non-blocking V2.03 gaps

### KNOWN NON-BLOCKING V2.03 GAPS

**ACN18**

- private binary storage
- attachment download
- e-sign
- DICOM/HL7
- advanced versioning

**AC-P05**

- PDF/private storage
- re-release/versioning
- booking↔encounter FK/date-match
- automatic patient instructions
- patient-view audit
- ACN18→patient release bridge

**ACN27**

- occupancy
- IoT
- equipment inventory
- room scheduling
- bed management

**Marking: NOT V2.03 QA BLOCKERS.**

Tracked in:

- [`docs/v2.03/ACTIVECLINIC_BATCH3_OPEN_DECISIONS.md`](../v2.03/ACTIVECLINIC_BATCH3_OPEN_DECISIONS.md)
- [`docs/BACKLOG.md`](../BACKLOG.md) § ActiveClinic V2.03 post-MVP gaps
- Platform private PHI storage workstream (architecture) — **not** website/CMS media

---

## 13. Rollback / escalation

| Situation | Action |
|-----------|--------|
| Application defect on frozen SHA | File defect; do **not** silent-patch without new SHA + redeploy + re-gate |
| Security isolation failure | Escalate as P0; stop QA acceptance |
| Need product gap (binary/PDF/occupancy) | Backlog only — out of V2.03 MVP |
| Deploy/promote | Requires separate production authorization (not this handoff) |

**Authoritative identity:** SHA `b8c18c3ded9892aa318ae6e029600aa34ff4941b` (prefer over mutable branch tip if tip moves).

**Tag recommendation:** Do **not** create `v2.03-qa` automatically; optional after QA acceptance. Prefer exact SHA as authoritative until acceptance.

---

## 14. Related evidence index

| Doc | Role |
|-----|------|
| [`V2_03_RELEASE_FREEZE.md`](./V2_03_RELEASE_FREEZE.md) | Freeze rules |
| [`V2_03_V10_POST_DEPLOY_GATE.md`](./V2_03_V10_POST_DEPLOY_GATE.md) | Hosted gate Attempts 1–3 |
| [`V2_03_ACN18_ISOLATION_HANG_FIX.md`](./V2_03_ACN18_ISOLATION_HANG_FIX.md) | Hang root cause + fix |
| [`V2_03_NEW_SCREENS_FINAL_RECONCILIATION.md`](./V2_03_NEW_SCREENS_FINAL_RECONCILIATION.md) | New-screen reconcile |
| `docs/v2.03/ACN27_*`, `ACN18_*`, `ACP05_*` | Implementation records |
