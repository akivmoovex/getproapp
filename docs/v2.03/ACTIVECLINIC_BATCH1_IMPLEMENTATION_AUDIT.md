# ActiveClinic V2.03 Batch 1 — Implementation Audit

| Field | Value |
|-------|--------|
| **Audit ID** | `V2_03_AC_BATCH1_AUDIT` |
| **Date** | 2026-09-26 |
| **Branch** | `V10` |
| **HEAD SHA** | `802912259ab0fdea48fe0a3b6596e3a4b2080383` |
| **Stitch project** | [ActiveClinic Operational Design System](https://stitch.withgoogle.com/projects/12134201997833374170) |
| **Stitch project ID** | `projects/12134201997833374170` |
| **Scope** | ACN01–ACN16, ACN21–ACN23, ACN25–ACN26 (21 screens) |
| **Mode** | Read-only audit — **no implementation**, **no Stitch redesign**, **no production changes** |
| **Verdict** | **`V2_03_AC_BATCH1_AUDIT_COMPLETE`** |

---

## 1. Executive summary

V10 already contains a substantial ActiveClinic authenticated-ops backend (appointments, reception, clinical encounters, patients, billing/cashier, staff, onboarding). Batch 1 Stitch screens mostly map onto that stack as **EXISTING** or **PARTIAL** visual/UX upgrades rather than greenfield domain work.

| Classification | Count | Screens |
|----------------|-------|---------|
| **EXISTING** | 13 | ACN01, ACN06, ACN07, ACN08, ACN09, ACN10, ACN12, ACN13, ACN14, ACN15, ACN21, ACN22, ACN23 |
| **PARTIAL** | 6 | ACN02, ACN03, ACN04, ACN05, ACN11, ACN25 |
| **NEW** | 2 | ACN16, ACN26 |

**Highest reuse:** appointments + status history, reception queue, clinical encounter workspace, patient directory/duplicates, booking-request inbox, billing invoices + cashier receipts, platform onboarding engine.

**Highest Batch 1 build cost:** unified services+pricing ops catalogue (ACN02/03), practitioner availability workspace (ACN05), patient consent ledger (ACN11), clinical follow-up worklist (ACN16), performance KPIs (ACN25), import/export centre (ACN26).

**Architecture rule applied:** common technical capabilities stay at platform level; clinical domain models remain ActiveClinic-specific. Do not force patients/encounters/diagnoses into BlessBoard member models. Do not share AC billing ledger with BB giving.

---

## 2. Branch gate

```
Branch: V10
HEAD:   802912259ab0fdea48fe0a3b6596e3a4b2080383
Remote: origin/V10
```

Gate **PASSED**. Audit proceeded.

---

## 3. Stitch inventory (Batch 1)

Authoritative design source for this audit: **ActiveClinic Operational Design System** (`12134201997833374170`), created 2026-09-26. This is distinct from earlier AC Stitch projects (Juflona Pilot `12272131183982732110`, Public Booking `17813606734422395399`, Identity/MW `10611909237747031838`).

| Code | Title | Desktop screen ID | Mobile screen ID |
|------|-------|-------------------|------------------|
| ACN01 | Clinic Setup Checklist | `cf28e47453c24613bca3271a3f049baf` | `1828dea96c514a51a899040cfe22081a` |
| ACN02 | Services & Pricing Catalogue | `f963c18596564e258d930e279be50c09` | `60da9b7d0cad445284cb35a5605e1076` |
| ACN03 | Add/Edit Service Editor | `c01c76d9e55e45f1a781c95741616b11` | — |
| ACN04 | Practitioners Directory | `cf8a6c1d72e641ecab48d3fb4d723c7b` | `62253ac931ca49c7953aefee10b9cfb6` |
| ACN05 | Practitioner Profile & Availability | `c034741fee634ff59862cf2c710d7dac` | `b04d04960b7643dd89a7634b423a0747` |
| ACN06 | Appointment Calendar | `3c1a421cf1e140e9affe193071c8f80a` | `c36313bff4274c72b341c38cdfafbc35` |
| ACN07 | Create Appointment & Conflict Validator | `c1e205c9ebd84f7a8f67d21681230d83` | — |
| ACN08 | Appointment Detail & Status Lifecycle | `1ec9b9f67d9746ebbbf331cd2ecf2a04` | — |
| ACN09 | Booking Requests Queue & Review | `41394d581882437b80e941cebefbb95f` | — |
| ACN10 | Patient Directory & Duplicate Prevention | `d6fa60ee647a44949449f163990a3e1f` | `580bd1e41bf1439e97587ee3accb8b30` |
| ACN11 | Patient Profile & Consent Management | `63b85a8c28b84e9e81db2930c93c1217` | `147ab133a55f41e6afc6faf3010f03e3` |
| ACN12 | Patient Check-in Workflow | `ed27c2dfb6474a139b126c5bd57e0869` | `a2900a9ef33247d8817fe801f4a06fd5` |
| ACN13 | Live Patient Queue | `4bdf5a39d81043e1bd9488caa0833048` | `a21f9b37a2ca4939948bf39a86a5df90` |
| ACN14 | Practitioner Worklist | `ae083a2bfe324046b4d9a0648c516bbd` | `f792e472b455437eb354e25d336fd869` |
| ACN15 | Clinical Encounter Workspace | `3ea33c0c474342bbbbb307014209bfec` | `ec4486cb5e944705bede9c3100c47e9d` |
| ACN16 | Follow-up Worklist | `0c83bbfc71b94c2f958931693345d1db` | `362b305120114a5cac2ac38622a148f8` |
| ACN21 | Invoices & Account Ledgers | `0886c0c2471d4744aa0101aed17abd22` | `3af2006929ff463eaea366b3e5086091` |
| ACN22 | Create/Edit Invoice Editor | `25af03d4c3724841a33fb03415ec1b4d` | — |
| ACN23 | Payment Recording & Statutory Receipt | `9288cc1e473941f4905d69b2393f066b` | `9d872ffd29954df9affe648916b2497f` |
| ACN25 | Clinic Performance Dashboard | `b834a9b768664c1d91302a0aa1b79b7c` | `1615176a78ac4a88a77f71712c6671a6` |
| ACN26 | Data Import & Export Centre | `4137e48363914fa1be8a0bff9b3970c3` | `ef7f27a94f464d6daa4d39d0a81771d9` |

Also present in project (out of Batch 1 implementation matrix): Design Foundation screen `31aacd7e0b2a4629bc2b9de98369e37e`.

**Out of Batch 1 scope:** ACN17–ACN20, ACN24 (not in Stitch Batch 1 set audited here).

---

## 4. Platform reuse vs AC-specific boundary

### 4.1 Reuse at platform level (do not re-implement in AC)

| Capability | Existing location | AC wiring today | Batch 1 guidance |
|------------|-------------------|-----------------|------------------|
| RBAC decisions / tenant scope | `src/platform/rbac/*` | `activeClinicPermissionMiddleware`, `authorizeActiveClinic` | Reuse facade; keep permission catalogue rows AC-scoped |
| Audit logging | `src/platform/audit/*`, `platform.audit_events` | Used across AC clinical/billing | Reuse; add event types as needed |
| Validation | `src/platform/validation/sharedFieldValidators.js` | Partial use via patient/contact validators | Call shared for email/phone/UUID/text |
| Phone / geography | `phoneNumberService`, `geography/*`, phone-field partial | AC patient/staff contact | Reuse |
| Onboarding engine | `src/platform/onboarding/*`, mig `032` | `activeClinicOnboardingAdapter` | Reuse for ACN01 |
| Registration consent (T&Cs) | `registrationConsent.js` | Clinic registration terms | Reuse for onboarding legal only — **not** clinical consent |
| Shared forms | `src/platform/forms/*` | `registerActiveClinicSharedFormRoutes` | Reuse for non-clinical forms only |
| Announcements | `src/platform/announcements/*` | AC shared announcement routes | Reuse if Batch 1 needs clinic notices |
| Website media | `src/platform/media/*`, website media services | AC website CMS | Reuse for catalogue imagery |
| Website publish checklist | `website/checklistService.js` | AC website availability | Pattern for ACN01 website step |

### 4.2 Pattern-only (copy approach, not tables/code)

| Pattern | BB / platform reference | AC equivalent |
|---------|-------------------------|---------------|
| Duplicate warn / never auto-merge | BB registration duplicate matches | `activeClinicPatientDuplicateService` (already exists) |
| Status history append-only | BB `member_request_status_history`; forms `status_history_json` | AC `appointment_status_events`, billing event tables |
| CSV import/export jobs | BB branch member import routes | **No AC centre yet** (ACN26) — extract platform job/audit shell if both products need it |
| Pagination / search clamps | Ad-hoc limit/offset everywhere | Keep pattern; optional shared helper later |
| Collections “follow-up” copy | — | Billing collections ≠ clinical follow-up |

### 4.3 Must remain ActiveClinic-specific

- Patients, identifiers, emergency contacts, patient facility links
- Appointments, service types, collision checks, booking requests
- Reception queue / check-in
- Encounters, triage, vitals, nursing, diagnoses, clinical orders, alerts
- Clinical follow-up worklist (ACN16) — new AC domain
- Practitioner clinical availability schedules (ACN05) — new AC domain
- Billing: charge catalogue, invoices, payments, receipts, cashier sessions
- Staff clinical roster semantics beyond shared org/user identity

### 4.4 Duplicated BB/AC infrastructure to avoid

| Do **not** share | Why |
|------------------|-----|
| BB members ↔ AC patients | Different PII, consent, clinical identity |
| BB giving / receipts ↔ AC invoices / cashier | Different SoD, statutory, and ledger rules |
| BB appointments (deferred / none) ↔ AC appointments | AC owns scheduling |
| BB church chrome / Sacred Modernity ↔ AC Clinical Resilience | Separate design systems |
| BB member notifications inbox ↔ AC clinical alerts | Different audiences and urgency |

---

## 5. Screen matrix

Legend for **Existing/Partial/New**: functional readiness of V10 code vs Stitch Batch 1 requirement (not visual parity).

| Screen | Requirement | Existing/Partial/New | Existing route | Existing backend | Existing DB | Platform capability reused | New platform capability needed | AC-specific work | Migration needed | Risk |
|--------|-------------|----------------------|----------------|------------------|-------------|----------------------------|--------------------------------|------------------|------------------|------|
| **ACN01** | Clinic setup checklist (profile, facility, staff, hours, departments, website readiness) | **EXISTING** | `GET /app/onboarding`; `POST /app/onboarding/{skip,continue,complete}`; setup panels under `/app/settings/clinic-setup/*` | `activeClinicAppRoutes.js`, `activeClinicOnboardingAdapter.js`, `loadActiveClinicSettingsScreens.js` | Org/facility/staff/dept; platform onboarding progress (`032`); AC registration onboarding (`027`) is separate | Platform onboarding engine; website checklist; RBAC; audit | None | Stitch visual parity; checklist step mapping to Stitch cards | No (unless new checklist keys) | Low — mostly presentation |
| **ACN02** | Unified services & pricing catalogue | **PARTIAL** | `/app/settings/website/catalogue`; `/app/billing/catalog`; public `/clinics/:clinicKey/{services,pricing}` | `clinicWebsiteCatalogueService.js`, `activeClinicWebsiteCmsRoutes.js`, `activeClinicBillingService.js` | `appointment_service_types` (`012`,`034`); `charge_catalogue_items` (`018`); `public_procedures` (`019`) | Media; validation; RBAC (`website.*`, `billing.catalog.*`) | Optional shared “catalogue list UI” shell only | Unify scheduling service + charge price + public visibility into one ops surface (or clear dual-tab IA) | Maybe link table / price fields if product unifies | Medium — dual catalogue confusion |
| **ACN03** | Add/edit service editor | **PARTIAL** | `/app/settings/website/catalogue/services/{new,:id/edit}`; `/app/billing/catalog/new` | Catalogue + billing create/update services | Same as ACN02 | Forms validation; media picker | None | Single editor covering duration, bookability, price, visibility | Same as ACN02 | Medium |
| **ACN04** | Practitioners directory | **PARTIAL** | `GET /app/staff`; public `/clinics/:clinicKey/doctors`; CMS doctors tab | `activeClinicStaffRoutes.js`, `activeClinicStaffService.js`, `staffMemberRepository.js` | `staff_members` (`004`); facility assignments (`005`); public profile cols (`019`) | Phone; media; RBAC `staff.*` | None | Rename/IA to “Practitioners”; clinical roster filters; Stitch table/cards | No for list; maybe flags later | Low–Medium |
| **ACN05** | Practitioner profile + **availability workspace** | **PARTIAL** | `/app/staff/:id`; CMS doctor form; `/app/appointments/schedule` | Staff profile + CMS; collision checks on create | Staff + facility `public_hours_json` only — **no per-practitioner availability tables** | Phone; media; audit | Optional shared recurring-schedule primitive (if BB later needs appointments) | **New AC availability model + UI** (templates, exceptions, bookable windows) | **Yes** — staff availability / exceptions | **High** — scheduling correctness |
| **ACN06** | Appointment calendar (desktop + mobile agenda) | **EXISTING** | `GET /app/appointments/calendar` (+ list/schedule/missed) | `activeClinicAppointmentRoutes.js`, `loadActiveClinicAppointmentScreens.js`, `activeClinicAppointmentService.js` | `appointments`, `appointment_status_events` (`013`) | Tenant scope; audit | None | Stitch calendar chrome; denser day/week grids if deferred in code | No | Medium — calendar UX density |
| **ACN07** | Create appointment + conflict validator | **EXISTING** | `GET/POST /app/appointments/new` | `createAppointment` / `findStaffCollision` → `RESULT.COLLISION` | `appointments` | Validation; RBAC `appointment.create` | None | Stitch conflict UI; optional room/resource conflicts (not in DB) | No unless resources added | Medium — collision scope is staff-time only |
| **ACN08** | Appointment detail + status lifecycle | **EXISTING** | `GET /app/appointments/:id`; cancel/check-in/no-show/reschedule/confirm POSTs | Status machine in `activeClinicAppointmentService.js` | Status + append-only events (`013`) | Audit; status-history pattern | None | Stitch lifecycle rail / badges | No | Low |
| **ACN09** | Booking requests queue & review | **EXISTING** | `GET /app/booking-requests`; detail; link; create-patient | `activeClinicBookingLinkageRoutes.js`, `activeClinicBookingPatientLinkageService.js` | `public_booking_requests` (`019`); linkage (`024`) | Duplicate-warn pattern; patient create | None | Approval/reject UX if Stitch exceeds linkage inbox; dedicated RBAC keys if required | Maybe RBAC keys | Medium — inbox is linkage-focused |
| **ACN10** | Patient directory + duplicate prevention | **EXISTING** | `GET /app/patients`; create; quick-register | `activeClinicPatientRoutes.js`, `activeClinicPatientDuplicateService.js`, `patientRepository.js` | `patients` (`008`); identifiers (`009`); links (`010`,`023`); platform identity profile (`026`) | Phone; validation; audit | None | Stitch duplicate panel; merge remains unassigned (`patient.merge`) | No for warn; **Yes** if merge shipped | Medium — merge is reserved/unassigned |
| **ACN11** | Patient profile + **consent management** | **PARTIAL** | `/app/patients/:patientNumber` (+ edit, identifiers, emergency contacts, archive, print card) | Patient service + emergency contact repo | Patients; `patient_emergency_contacts.consent_to_contact` (`011`) only | Registration consent **not** reusable for clinical | **Consider** generic consent ledger primitive (product/versioned, non-clinical) if BB also needs consents | **AC clinical consent types, capture, history UI** | **Yes** — consent records/history | **High** — privacy/compliance |
| **ACN12** | Patient check-in workflow | **EXISTING** | `/app/reception/check-in`; walk-in; `POST /app/appointments/:id/check-in` | `activeClinicReceptionRoutes.js`, `activeClinicReceptionService.js` | Reception arrivals / queue (`014`); appointment status | RBAC; audit | None | Stitch multi-step check-in chrome | No | Low |
| **ACN13** | Live patient queue | **EXISTING** | `GET /app/reception`; call-board; queue actions | Reception service + routes | `reception_queue` (`014`) | — | None | Stitch kanban/status chips; realtime polish if required | No | Medium — realtime expectations |
| **ACN14** | Practitioner worklist | **EXISTING** | `GET /app/clinical`; `/app/appointments/schedule` | `activeClinicClinicalRoutes.js`, `activeClinicClinicalService.js` | Encounters (`015`); appointments | — | None | “My patients today” filters by assigned clinician; Stitch list | Maybe filter indexes | Low–Medium |
| **ACN15** | Clinical encounter workspace | **EXISTING** | `/app/clinical/encounter/:id` (+ triage/vitals/nursing/diagnosis/orders/close/alerts) | Clinical service + routes; consultation workspace views | Encounters, triage, vitals, nursing, notes, diagnoses, orders, alerts (`015`) | Audit; validation | None | Stitch workspace layout; keep CDS blocked per `ACTIVECLINIC_PRODUCT_GAPS.md` | No for core | High clinical safety if over-scoped (CDS blocked) |
| **ACN16** | Clinical follow-up worklist | **NEW** | — (none clinical) | — | — | Worklist **pattern** only; do not reuse PA clinic-registration follow-up or billing collections | Optional shared worklist shell (filters, pagination, empty states) | **New AC follow-up entities, statuses, assignment, routes, RBAC, views** | **Yes** | **High** — greenfield clinical workflow |
| **ACN21** | Invoices & account ledgers | **EXISTING** | `/app/billing/invoices`; patient account; statement; AR | `activeClinicBillingRoutes.js`, `activeClinicBillingService.js`, `activeClinicBillingOpsService.js` | `invoices`, `invoice_lines`, `patient_charges`, payments (`018`,`025`) | Audit; RBAC | None | Stitch ledger tables; do not share BB giving | No | Medium — finance SoD |
| **ACN22** | Create/edit invoice editor | **EXISTING** | `/app/billing/invoices/new`; post/void/amend | Billing invoice create/amend flows | Same | Validation; audit | None | Richer live editor vs create+amend paths | No | Medium |
| **ACN23** | Payment recording & statutory receipt | **EXISTING** | `/app/cashier/payment`; `/app/cashier/receipt/:receiptNumber`; session open/close | `activeClinicCashierRoutes.js`, cashier session services | `payments`, `receipts`, `cashier_sessions` (`018`) | Audit | None | Statutory receipt presentation; print; legal copy review | Maybe receipt template fields | **High** — statutory/compliance presentation |
| **ACN25** | Clinic performance dashboard | **PARTIAL** | `GET /app` home; `/app/billing/reports/revenue` | `loadActiveClinicDashboardHome.js` (capability tiles, avoids unauthorized KPIs) | Derived from existing domains | Capability-tile pattern | Optional shared KPI aggregation helper later | Ops KPIs: throughput, no-shows, utilization, revenue tiles with RBAC gating | Maybe materialized views / rollups | Medium — metric honesty / authz |
| **ACN26** | Data import & export centre | **NEW** | — | Permission stub only: `activeclinic.billing.reports.export` | — | Audit; validation; media/file handling | **Yes — platform import/export job framework** (job status, file storage, audit, RBAC) preferred over AC-only | AC entity mappers (patients, services, appointments); dry-run; error report | **Yes** (jobs + file refs; AC entity maps) | **High** — data integrity / PII |

---

## 6. Existing backend inventory (Batch 1–relevant)

### 6.1 HTTP / services / views

| Domain | Routes module | Key services / loaders | Views (under `views/activeclinic/app/`) |
|--------|---------------|------------------------|----------------------------------------|
| Onboarding / home | `activeClinicAppRoutes.js` | `activeClinicOnboardingAdapter.js`, `loadActiveClinicDashboardHome.js` | `onboarding-content.ejs`, `home-content.ejs` |
| Settings / clinic setup | `activeClinicSettingsRoutes.js` | `loadActiveClinicSettingsScreens.js` | clinic-setup regional/departments content |
| Website catalogue | `activeClinicWebsiteCmsRoutes.js` | `clinicWebsiteCatalogueService.js` | `website-cms-catalogue*.ejs` |
| Staff | `activeClinicStaffRoutes.js` | `activeClinicStaffService.js` | `staff-*-content.ejs` |
| Appointments | `activeClinicAppointmentRoutes.js` | `activeClinicAppointmentService.js`, `appointmentRepository.js` | `appointments-*-content.ejs`, `appointment-*-content.ejs` |
| Booking requests | `activeClinicBookingLinkageRoutes.js` | `activeClinicBookingPatientLinkageService.js` | `booking-requests*-content.ejs` |
| Patients | `activeClinicPatientRoutes.js` | `activeClinicPatientService.js`, `activeClinicPatientDuplicateService.js` | `patients-*-content.ejs`, `patient-*-content.ejs` |
| Reception | `activeClinicReceptionRoutes.js` | `activeClinicReceptionService.js` | `reception-*-content.ejs` |
| Clinical | `activeClinicClinicalRoutes.js` | `activeClinicClinicalService.js` | `clinical-*-content.ejs`, `consultation-workspace-content.ejs`, triage/vitals/… |
| Billing | `activeClinicBillingRoutes.js` | `activeClinicBillingService.js`, `activeClinicBillingOpsService.js` | `billing-*-content.ejs` |
| Cashier | `activeClinicCashierRoutes.js` | cashier session / payment services | `cashier-*-content.ejs` |
| Public booking overlap | `activeClinicPublicBookingRoutes.js`, `activeClinicPublicRoutes.js` | booking + public catalogue | `views/activeclinic/tenant/*`, booking views |

### 6.2 RBAC (existing keys — Batch 1)

Documented in `docs/activeclinic/ACTIVECLINIC_FOUNDATIONAL_PERMISSION_MATRIX.md` and migrations `blessboard/077+` permission seeds (`080`–`088` series historically used for AC foundational perms).

| Area | Representative permission keys |
|------|--------------------------------|
| Access | `activeclinic.access` |
| Staff | `activeclinic.staff.view/create/update/invite/archive` |
| Patients | `patient.search/create/update/view/...`; `duplicate_override`; `merge` **unassigned** |
| Appointments | `appointment.view/create/update/cancel/check_in/manage_schedule` |
| Reception | `reception.view/check_in/manage_queue/call_next/transfer/cancel` |
| Clinical | `encounter.view/manage`; triage/nursing/consultation/diagnosis/order/alert keys |
| Billing | `billing.view`; `invoice.create/post/void/amend`; `billing.catalog.manage`; `billing.reports.export` |
| Cashier | `payment.collect/view/allocate/refund/reverse`; `cashier.open_session/close_session/...` |
| Website | `website.view/edit`; availability publish keys |

**Likely new RBAC for NEW/PARTIAL screens:** follow-up worklist; consent manage; staff availability manage; import/export centre; performance dashboard metric packs.

### 6.3 DB migrations (canonical — ignore `* 2.sql` duplicates)

**ActiveClinic schema (`db/migrations/activeclinic/`):** `001`–`035`, especially:

| Migrations | Domain |
|------------|--------|
| `002`–`007` | HCO, facilities, staff, roles, invitations |
| `008`–`011` | Patients, identifiers, registrations, emergency contacts |
| `012`–`013` | Service types, appointments + status events |
| `014` | Reception queue |
| `015` | Clinical encounters (+ related clinical tables in same wave) |
| `018`, `021`, `025` | Billing / cashier / invoice consistency / Phase4 billing gaps |
| `019`, `024`, `034` | Public website/booking, patient linkage, service visibility |
| `022` | Departments |
| `026`–`033` | Clinic registration lifecycle / terms (platform-admin, not ACN01 ops checklist) |

**Platform (`db/migrations/platform/`):** audit (`012`,`037`), identities (`020`,`026`), onboarding (`032`), geo (`034`), forms (`039`–`041`), announcements (`042`), media/website (`027`–`035`).

---

## 7. Per-screen notes (gaps that drive classification)

### EXISTING (backend-ready; Stitch = primarily UI/parity)

- **ACN01:** Ops onboarding checklist exists; Stitch may add more marketing/setup cards — map carefully to real facts.
- **ACN06–08:** Full appointment stack with collision + status events.
- **ACN09:** Staff inbox for public booking requests with patient link/create.
- **ACN10:** Directory + duplicate warnings; merge intentionally deferred.
- **ACN12–15:** Reception + clinical queue + encounter workspace are production-shaped V7 features.
- **ACN21–23:** Billing invoices + cashier payment/receipt path exist; “statutory” is presentation/compliance, not a missing ledger.

### PARTIAL

- **ACN02/03:** Two catalogues (bookable service types vs charge catalogue). Stitch implies one ops catalogue.
- **ACN04:** Staff directory ≈ practitioners; naming and clinical filters differ.
- **ACN05:** Profile exists; **availability workspace does not**.
- **ACN11:** Profile exists; **consent management beyond emergency-contact flag does not**.
- **ACN25:** Home is capability tiles, not a performance KPI dashboard.

### NEW

- **ACN16:** No clinical follow-up worklist. Existing “follow-up” strings refer to clinic-registration review, booking status `clinic_follow_up`, or billing collections — **do not overload those**.
- **ACN26:** No import/export centre. Only billing report export permission stub + ad-hoc HTML reports.

---

## 8. Proposed implementation sequence

Order prioritizes foundations that unlock later screens, platform extraction before AC-only features, and lowest-risk EXISTING visual work interleaved with schema-heavy NEW items.

### Phase 0 — Foundations (platform + contracts)

1. Register Stitch project `12134201997833374170` in `docs/stitch-project-map.md` as V2.03 operational design authority (docs-only follow-up).
2. Decide product questions that block schema:
   - ACN02/03: unify vs dual-tab catalogue IA
   - ACN11: consent types / retention / who may capture
   - ACN16: follow-up definition (post-encounter task vs scheduled return visit vs both)
   - ACN23: statutory receipt legal requirements by jurisdiction
   - ACN26: entities in Batch 1 import/export (patients? services? staff?)
3. Extract **platform import/export job shell** (file + job status + audit + RBAC hooks) before AC entity mappers — avoids BB/AC duplicate frameworks.

### Phase 1 — Low-risk EXISTING Stitch parity (no schema)

4. ACN01 onboarding checklist visual parity  
5. ACN06–08 appointments calendar/create/detail  
6. ACN12–14 reception check-in, live queue, practitioner worklist filters (UI-first)  
7. ACN15 encounter workspace chrome (no CDS)  
8. ACN09 booking requests queue chrome  
9. ACN10 patient directory + duplicate panel chrome  
10. ACN21–23 billing list/editor + cashier payment/receipt presentation  

### Phase 2 — PARTIAL catalogue & staff

11. ACN04 practitioners directory IA rename/filters  
12. ACN02/03 services+pricing unification (migrate/link tables as decided)  
13. ACN05 practitioner availability model + workspace (**migration**)  

### Phase 3 — Consent, follow-up, performance

14. ACN11 patient consent ledger (**migration**; reuse platform consent *primitive* only if designed generically)  
15. ACN16 clinical follow-up worklist (**migration** + RBAC)  
16. ACN25 performance dashboard KPIs (RBAC-gated aggregates; optional rollup migration)  

### Phase 4 — Import/export

17. ACN26 wire AC mappers onto platform job shell; dry-run + error report; audit every job  

### Suggested dependency graph

```
Platform import/export shell ──► ACN26
ACN02/03 catalogue decision ──► ACN05 (bookable windows need service durations)
ACN08/15 status+encounter ──► ACN16 follow-up
ACN10 patient identity ──► ACN11 consent
ACN06–08 + reception ──► ACN25 KPI inputs
```

---

## 9. Risk register (Batch 1)

| Risk | Screens | Mitigation |
|------|---------|------------|
| Dual catalogue price drift | ACN02/03 | Explicit product decision; single write path or sync rules |
| Availability without resource/room model | ACN05/07 | Document staff-time-only collisions; expand later |
| Clinical consent treated as T&Cs checkbox | ACN11 | Separate AC consent domain from `registrationConsent` |
| Follow-up confused with PA registration follow-up | ACN16 | New routes/tables; never reuse `clinicRegistrationReviewService` |
| Statutory receipt non-compliance | ACN23 | Legal review of receipt fields before visual-only ship |
| KPI leakage across RBAC | ACN25 | Keep capability gating; no unauthorized clinical aggregates |
| Bulk import corrupting patients | ACN26 | Dry-run, duplicate warn, no auto-merge, full audit |
| CDS creep in encounter UI | ACN15 | Honor `ACTIVECLINIC_PRODUCT_GAPS.md` blocks |

---

## 10. Explicit non-goals (this audit)

- No feature implementation
- No Stitch redesign / regeneration
- No production deploys
- No pharmacy/diagnostics screens (outside Batch 1 list)
- No BlessBoard chrome or member-model reuse for clinical records

---

## 11. Final verdict

**`V2_03_AC_BATCH1_AUDIT_COMPLETE`**

Branch gate passed (`V10` @ `802912259ab0fdea48fe0a3b6596e3a4b2080383`). All 21 Batch 1 screens inventoried against Stitch project `12134201997833374170` and mapped to V10 routes/services/DB/RBAC with platform-reuse guidance and an implementation sequence.
