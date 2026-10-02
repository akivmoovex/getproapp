# ActiveClinic V2.03 Batch 3 — Final Stitch Parity Audit + Scope Freeze

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_BATCH3_FINAL_PARITY_AUDIT` |
| **Date** | 2026-09-26 |
| **Branch** | `V10` |
| **Previous HEAD** | `6e8b437374745687e7ff1464c8d448b21d384f1b` |
| **Stitch project** | `3741389873539108242` |
| **Frozen B1+B2 RC** | `6fb754ebef4c1bc652f1868b68b90ac96fbd8711` |
| **Verdict** | `V2_03_BATCH3_FINAL_PARITY_PASS` |
| **Production** | **NO** |

---

## 1. V2.03 scope freeze

### IMPLEMENTED (in V2.03 Batch 3)

| Code | Title | Notes |
|------|-------|-------|
| **ACN17** | Vitals & Observations | Existing vitals backend; leaf UI |
| **ACN19** | Prescription Editor | Existing clinical_order prescription path |
| **ACN20** | Referral Management | B-scope over ACN16 `pending_referral` |
| **AC-P03** | My Appointments | Existing portal bookings list |
| **AC-P04** | Appointment Detail & Reschedule | Existing portal detail/cancel/reschedule |
| **AC-P06** | Invoices & Receipts | Additive portal read projection |
| **AC-P07** | Profile & Contact Details | Existing portal profile |

### DEFERRED (explicit V2.03 out-of-scope — not implementation failures)

| Code | Freeze class | Reason |
|------|--------------|--------|
| **ACN18** | `DEFERRED_PRODUCT_BACKEND_SECURITY` | No clinical-document domain; needs product definition, persistence/backend, and PHI/security model. CMS media must not be overloaded. |
| **ACN27** | `DEFERRED_PRODUCT_BACKEND` | Stitch rooms/location inventory ≠ canonical B2-10 sites/facilities. Cannot safely leaf over existing backend; must not rewrite `/app/facilities`. |
| **AC-P05** | `DEFERRED_PRODUCT_SECURITY` | No patient visit-summary release/projector; needs product release rules, backend capability, and patient-visible PHI security model. |

**Not done for deferred screens:** placeholder backends, fake/demo persistence, forced mapping of ACN27 onto B2-10 facilities.

Authority: `docs/v2.03/ACTIVECLINIC_BATCH3_OPEN_DECISIONS.md` (updated).

---

## 2. Stitch references (implemented only)

| Code | Desktop | Mobile |
|------|---------|--------|
| ACN17 | `e4dc47dcc41a411184e987308aedc943` | `c8552b6186d4428283b31d7b875005d6` |
| ACN19 | `47c5eb28d5e1482e9dd0c2f2cbee7b59` | `5e5048f347414e53af6e8a86aa83fba7` |
| ACN20 | `9afe2826b316421e81d56d98364e1fbf` | `43fabf392a204db68bd229e2acc51926` |
| AC-P03 | `e5bc2a1492da4e1fb675d14c884ec059` | `2ea963ee11384dd680b21978b3f56ea1` |
| AC-P04 | `497d0c05f6f241f981d07b47be7c7606` | `0af4b000cec2477389a576b11b33cba0` |
| AC-P06 | `a493b33db83c4873ab2964391ee088b9` | `5b381b193b6643d09cbc317b55fd5f32` |
| AC-P07 | `e042789d436d48e8843e4bb3f99f379b` | `c15fcece57e2481cb4d5ff988b325730` |

Audit method: live MCP `get_screen` HTML + screenshots vs current EJS/CSS leaf packs and pass docs. No unsupported demo functionality added for visual match.

---

## 3. Per-screen parity matrix

Gap codes: **A** VISUAL_FIX_REQUIRED · **B** RESPONSIVE_FIX_REQUIRED · **C** EXISTING_BACKEND_DIFFERENCE · **D** DEMO_ONLY_STITCH_CONTENT · **E** INTENTIONALLY_OMITTED_UNSUPPORTED_FUNCTION · **F** ACCEPTABLE_IMPLEMENTATION_VARIATION

| Screen | Layout / hierarchy | Typography / spacing | Cards / tables / badges | Forms / actions | Nav / context | Desktop | 390px | Remaining gaps |
|--------|--------------------|----------------------|-------------------------|-----------------|---------------|---------|-------|----------------|
| **ACN17** | F — single-observation form vs Stitch multi-vital board | F — uses `--ac-*` tokens | F — history list + badges | C/E — one type per save; no BMI auto / pain scale / pulse-ox checkbox | F — encounter banner inside staff shell | PASS | PASS (banner/actions stack; form 1-col) | D/E: Load Baseline, trend sparkline, safety rules rail, Commit to EHR chrome |
| **ACN19** | F — single Rx form vs multi-line draft editor | F | F | E — no catalogue search, CDS, EPCS, multi-line cards | F | PASS | PASS | E: DEA/NPI chrome, draft med cards, interaction engine |
| **ACN20** | F — filtered follow-up worklist vs CRM | F | F — gp-ops table/cards | C/E — ACN16 statuses only; no Draft→Sent machine | F — Follow-up nav highlight | PASS | PASS (filter stack; touch buttons) | D/E: HL7, destination directory, PDF packets, New Outbound |
| **AC-P03** | F — filter + table/cards vs Stitch hub + sidebar | F — portal `--acp-*` | F — status badges | C — bookings statuses; no live calendar | F — portal nav | PASS | PASS (filter wrap; full-width CTAs) | D/E: calendar widget, visit summaries, virtual care CTA, express check-in |
| **AC-P04** | F — detail + request forms | F | F | C — request-based reschedule (no live slots) | F | PASS | PASS | D/E: QR check-in, ratings, maps, .ics/PDF |
| **AC-P06** | F — summary + invoices/receipts lists | F | F | E — read-only; no Pay Now | F | PASS | PASS | D/E: KPI insurance cards, auto-pay, PDF export, Pay Outstanding |
| **AC-P07** | F — profile form | F | F | C — wired existing fields only | F | PASS | PASS | D/E: pronouns, preferred language, landline, emergency block, Level-3 assurance chrome |

### A / B corrections this pass

**None.** No visual or responsive blockers found that are safe to fix without inventing unsupported functionality or altering frozen B1+B2 architecture/tokens.

Asset stamps unchanged (no CSS/app asset edits):

| Surface | Canonical stamp |
|---------|-----------------|
| Staff shell | `SHELL_ASSET_VERSION` = `v2-03-b3-acn20-01` |
| Patient portal | `ASSET_VERSION` = `v2-03-b3-acp06-01` |

Tests updated to consume exported canonical stamps (ACN20, AC-P06) instead of obsolete hard-coded leaf IDs.

---

## 4. Gap roll-up

| Class | Release-blocking? | Items |
|-------|-------------------|-------|
| **A VISUAL_FIX_REQUIRED** | — | **None** |
| **B RESPONSIVE_FIX_REQUIRED** | — | **None** |
| **C EXISTING_BACKEND_DIFFERENCE** | No | Single-observation vitals; follow-up referral statuses; booking request reschedule; profile field set |
| **D DEMO_ONLY_STITCH_CONTENT** | No | Telemetry/MAR chrome, calendars, virtual care, KPI insurance tiles, assurance badges, demo patient narrative |
| **E INTENTIONALLY_OMITTED_UNSUPPORTED_FUNCTION** | No | CDS, clinical document archive, room inventory, visit-summary release, Pay Now, HL7 referral CRM |
| **F ACCEPTABLE_IMPLEMENTATION_VARIATION** | No | Staff shell + portal chrome vs Stitch standalone shells; leaf density vs demo density |

**Visual blockers:** none  
**Functional blockers (implemented set):** none  
**Intentional / deferred:** see §1 deferred + E/D above  

---

## 5. Shared infra (unchanged)

Reuse confirmed: `ac-app-tokens.css`, staff shell, portal chrome, `gp-ops` / badges where applicable, money formatting on AC-P06, dual desktop table / mobile card lists.

No token value changes. No shell/nav/Patients/Appointment Detail/B2 clinical/billing/facilities architecture changes.

---

## 6. Tests

| Pack | Result |
|------|--------|
| Batch 3 focused (5 suites) | **11 pass / 0 fail** |
| B1+B2 + clinical parity (13 suites) | **41 pass / 0 fail** |
| **Combined** | **52 pass / 0 fail** |

RBAC · tenant isolation · facility isolation: **PASS** (included in packs).

---

## 7. Production

**Untouched. Not pushed. Not deployed.**

---

## Marker

`ACTIVECLINIC_V2_03_BATCH3_FINAL_PARITY`

`V2_03_BATCH3_FINAL_PARITY_PASS`
