# V2.04 — Shared Person / Member / Patient Foundation

## Phase 0 — Read-Only Discovery Audit

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_PERSON_MEMBER_PATIENT_AUDIT` |
| **Phase** | 0 — READ-ONLY |
| **Branch** | `V4` |
| **Date** | 2026-09-30 |
| **Scope** | Existing V4 codebase inventory for BlessBoard staff-managed Members, ActiveClinic staff-managed Patients, and shared GetPro person/identity infrastructure |
| **Out of scope** | UI redesign, Stitch invent, migrations, deploy, production, speculative layouts |
| **Prior art** | [`docs/v2.03/PLATFORM_SHARED_FOUNDATION.md`](../v2.03/PLATFORM_SHARED_FOUNDATION.md), [`docs/v2.03/V2_03_PLATFORM_CONSOLIDATION_BACKLOG.md`](../v2.03/V2_03_PLATFORM_CONSOLIDATION_BACKLOG.md), [`docs/activeclinic/clinical/ACTIVECLINIC_PATIENT_IDENTITY_MODEL.md`](../activeclinic/clinical/ACTIVECLINIC_PATIENT_IDENTITY_MODEL.md), [`docs/activeclinic/clinical/ACTIVECLINIC_PATIENT_DUPLICATE_DETECTION.md`](../activeclinic/clinical/ACTIVECLINIC_PATIENT_DUPLICATE_DETECTION.md) |

---

## Executive summary

GetPro already has a **product-neutral authentication identity** (`platform.identities`) plus strong shared mechanisms (sessions, OTP, phone/email normalization, RBAC primitives, audit, data-job shell, communication prefs). It does **not** have a shared demographic **person** aggregate.

| Product person-of-record | Status |
|--------------------------|--------|
| **ActiveClinic patients** | Mature HCO-owned domain (`activeclinic.patients` + ACN10 directory/duplicates + ACN11 profile/consent) |
| **BlessBoard members (V5/V8)** | Mature church-owned domain (`blessboard.members` + branch memberships + registration workflow) |
| **BlessBoard legacy church** | Parallel stack still present (`public.church_members` + per-person QR attendance) |
| **Shared person table** | **Absent** — by design today; products own demographics |

**Do not duplicate:** AC patient duplicate engine, AC consent ledger, BB membership workflow, platform identity/auth stack, platform data-job shell, phone normalization service.

**Architecture target confirmed:** Platform owns mechanisms + optional person/contact primitives; products own membership / patient / clinical / pastoral semantics via adapters — never `if (product === …)` inside generic platform services when a registry/adapter can solve it.

---

## 1. Existing reusable components (PLATFORM)

### 1.1 Identity / authentication account

| Capability | Status | Key artifacts |
|------------|--------|---------------|
| Auth identity | **Present** | `platform.identities` — `db/migrations/platform/020_platform_identities.sql` |
| Product profile links | **Present** | `platform.identity_product_profiles` — types include `blessboard_user`, `activeclinic_staff`, `activeclinic_patient` (`021`, `026`) |
| Identity service | **Present** | `src/platform/services/platformIdentityService.js`, `platformIdentityCredentialService.js`, `identityProductProfileService.js` |
| Repo | **Present** | `src/platform/repositories/platformIdentityRepository.js` |
| Runtime contracts | **Present** | `src/platform/contracts/productRuntimeRegistry.js` (`identityNormalizers`, RBAC authorizers, registration adapters) |
| Demographic person aggregate | **Missing** | No `platform.persons` / shared person table |

**Boundary (explicit in schema comments):** identities are authentication only — no org/product/clinical ownership.

### 1.2 Authentication, sessions, password hashing, recovery, OTP

| Capability | Status | Key artifacts |
|------------|--------|---------------|
| Password hashing | **Present** | bcrypt via credential service; BB may still keep hash on `blessboard.users` during transition |
| Password policy | **Present** | `src/platform/auth/sharedPasswordPolicy.js`, registration vault |
| Login identifier | **Present** | `src/platform/auth/resolveLoginIdentifier.js` |
| Sessions | **Present** | `platform.deployment_sessions` (`010`, `022`, `025`); `src/platform/session/*`; V5 cookie gate |
| Auth transfer | **Present** | `platform.auth_transfers`; BB + AC identity transfer services |
| Action tokens | **Present** | `platform.identity_action_tokens` (`024`, patient purposes in `026`) — activation / password reset |
| OTP / verification | **Present** | `platform.identity_verification_challenges` (`036`); `src/platform/verification/*` |
| Platform-admin recovery | **Present (BB-coupled)** | `platformAdminAccountRecoveryService.js` still requires BlessBoard reset/invite (Class E allowlist) |

### 1.3 Phone / email normalization

| Capability | Status | Key artifacts |
|------------|--------|---------------|
| Identity normalize | **Present** | E.164 phone + lowercase email; DB trigger on identities |
| Shared phone service | **Present** | `src/platform/services/phoneNumberService.js`, `platformPhoneFieldLocals.js`, `public/platform/phone-field.*` |
| Field validators | **Present** | `src/platform/validation/sharedFieldValidators.js` |
| Product wrappers | **Present (debt)** | `src/blessboard/services/normalizeBlessBoardPhone.js`; BB registration duplicate normalization |

### 1.4 Organization / location / facility / branch scoping

| Capability | Status | Key artifacts |
|------------|--------|---------------|
| Organizations | **Present** | `platform.organizations`, `organization_products`, domains, deployments |
| Trusted tenant scope | **Present** | `src/platform/rbac/sharedTenantScope.js` — reject forged org/church/branch/facility IDs |
| Soft branch/facility IDs | **Present** | On sessions, audit, forms, jobs, prefs — **not** a shared facility tree |
| Geographic catalogue | **Present** | `platform.geographic_*` (`034`, `044`, `045`) — city/country for registration, not person addresses |
| Product location meaning | **Product-owned** | BB branches vs AC facilities remain separate tables |

### 1.5 RBAC / permission guards

| Capability | Status | Key artifacts |
|------------|--------|---------------|
| Shared authz mechanism | **Present** | `src/platform/rbac/*` — facade, effective perms, catalogue service, assignment audit |
| Product authorizers | **Present** | Registered via `productRuntimeRegistry` |
| Role/permission storage | **Still BB-centric** | Physical rows largely under `blessboard.roles` / permissions (documented Phase F debt) |
| AC patient perms | **Present** | Catalogue in blessboard migrations `080`, `091`, `092` |

### 1.6 Audit logging

| Capability | Status | Key artifacts |
|------------|--------|---------------|
| Append-only audit | **Present** | `platform.audit_events` (`012`, `037` product/facility) |
| Catalogue | **Present** | `src/platform/audit/sharedAuditCatalog.js` |
| Website audit | **Present** | Separate website trail |

### 1.7 Notifications / media / forms / jobs

| Capability | Status | Key artifacts |
|------------|--------|---------------|
| Notification dispatch | **Present (shell)** | `src/platform/notifications/*` — channel registry; noop without adapter |
| Communication prefs / policy acceptances | **Present** | `platform.communication_preferences`, `platform.policy_acceptances` (`043`); **not** clinical consent |
| Media | **Present** | Website/CDN media (`027`+); distinct from BB operational media |
| Form submission review | **Present** | `039`/`040` — submitted → review → accept/reject/close |
| Import/export jobs | **Present (shell)** | `platform.data_jobs` + `src/platform/jobs/*`; adapters by `entity_key` |

### 1.8 Duplicate detection / search / related contacts / addresses

| Capability | Platform status |
|------------|-----------------|
| Verified contact uniqueness on identities | **Present** |
| Registration `adapter.findDuplicate` hook | **Present** (product implements) |
| Fuzzy person duplicate engine | **Missing** at platform |
| Shared list query / pagination | **Present** — `src/platform/http/listQuery.js` |
| Shared person search index | **Missing** |
| Related contacts / next-of-kin / emergency | **Missing** at platform (AC owns locally) |
| Person address entity | **Missing** (city catalogue + optional registration address fields only) |

### 1.9 Known platform → product coupling (must not expand)

Examples of `if (product === …)` or hard requires (prefer adapters going forward):

- `src/platform/jobs/dataJobService.js`
- `src/platform/services/platformAdminAccountRecoveryService.js`
- `src/platform/services/createScopedTeamMemberService.js`
- `src/platform/services/authTransferService.js`
- Website/forms branding forks
- Allowlist: `scripts/architecture/dependencyDirectionAllowlists.js`

**Preferred seam:** `productRuntimeRegistry` + product bootstrap registrars (`registerBlessBoardPlatformContracts.js`, `registerActiveClinicPlatformContracts.js`).

---

## 2. Existing BlessBoard implementation

### 2.1 Dual-stack warning (compatibility risk)

| Layer | Schema | Person table | Code home |
|-------|--------|--------------|-----------|
| **Canonical V5/V8** | `blessboard.*` | `blessboard.members` | `src/blessboard/`, `views/blessboard/v5/` |
| **Legacy church** | `public.church_*` | `public.church_members` | `src/church/`, `src/routes/church/`, `views/church/` |

Login: V5 uses `blessboard.users` (optional `platform_identity_id` via `076_users_platform_identity_link.sql`); legacy may store password on `church_members`.

### 2.2 Members / membership / Church ID

| Area | Status | Key artifacts |
|------|--------|---------------|
| Member profile | **Present (V5)** | `blessboard.members` — names + email/phone only; statuses `pending\|active\|inactive\|suspended\|archived` (`020_create_members_memberships_registrations.sql`) |
| Branch membership | **Present** | `member_branch_memberships` (primary + multi-branch); transfer requests in `110_membership_workflow_v8.sql` |
| Registrations | **Present** | `member_registrations` + review events; `memberRegistrationService.js`, `membershipWorkflowService.js` |
| Member directory / profile UI | **Present** | HQ/branch admin + portal: `hqMembersAdminRoutes.js`, `memberPortalRoutes.js`, `memberIdentityRepository.js` |
| Access gate | **Present** | `requireActiveMember.js` / `requireActiveMemberForTenant.js` |
| **Human Church ID / member number** | **Missing** | No `member_number` column; `church_id` is tenant FK only. “Church ID” in registration success copy refers to **org registration reference**, not member number |
| Legacy members | **Present** | `church_members` (`049`, `050`, `066`) + import batches (`104`) |

### 2.3 Visitors / conversion

| Path | Status |
|------|--------|
| First-class `visitors` person table | **Absent** |
| Activity visitor forms | Present — platform activity forms + `activityRegistrationService.js` |
| Attendance visitor check-ins | Present (legacy) — ephemeral name/phone on check-in |
| Journey contacts → link member | Present — `journey_contacts.member_id` |
| Visitor → member conversion | **Registration approve** is the primary path; no one-shot `convertVisitorToMember` |

### 2.4 Attendance

| Model | Status | Notes |
|-------|--------|-------|
| V5 aggregate headcount | **Present** | `attendance_events` / `attendance_entries` (`023`) — category counts, not per-person |
| Legacy per-person + QR | **Present** | `church_attendance_service_sessions`, QR tokens, check-ins (`112`, `114`) |

### 2.5 Ministries / departments / requests

| Area | Status | Key artifacts |
|------|--------|---------------|
| CMS ministries + join | **Present** | `014`, `022` participation; join pending→active |
| Journey departments/cells | **Present** | `060`/`061` domain + memberships |
| Member requests | **Present** | `blessboard.member_requests` (`025`); pastoral redaction helpers |
| Legacy ministry join / requests | **Present** | `church_ministry_join_requests`, `church_member_requests` |

### 2.6 Blocking / access status

Statuses on `members` + branch membership + `users.status` + org/branch host gates (`churchStatusAccess.js`). No separate `blocked` flag beyond status enums.

### 2.7 Duplicate detection (BB) — important distinction

| Engine | What it duplicates | Reuse for members? |
|--------|--------------------|--------------------|
| Live unique indexes on `blessboard.members` email/phone per church | Exact contact collisions | **Yes** — keep |
| `registrationDuplicateScoring.js` et al. | **Church organization** registration applications (Phase 2 PA), not people | **No** — wrong domain |
| Fuzzy staff-managed member duplicate panel | **Not found** as AC-style warning workflow | Gap for staff member create if required |

### 2.8 Import

| Path | Status |
|------|--------|
| Platform job adapter | `bb.member_import` preview/export template — `blessboardDataJobAdapters.js` |
| Commit authority | Still **legacy church** member-import review/commit routes (`churchMemberImportService.js`) |

---

## 3. Existing ActiveClinic implementation

### 3.1 ACN10 — Patient Directory & Duplicate Prevention

| Item | Detail |
|------|--------|
| Routes | `GET /app/patients`; create / quick-register with duplicate warnings |
| Services | `activeClinicPatientService.js`, `activeClinicPatientDuplicateService.js`, `loadActiveClinicPatientScreens.js`, `patientPrivacyHelpers.js` |
| Repo | `patientRepository.js` (`searchPatientsByOrg`, `findDuplicateCandidates`) |
| Views | `patients-list-content.ejs`, `patient-form-content.ejs` |
| Markers | `data-ac-batch1="ACN10"` (dual with Batch 2 `AC-B2-02` in places) |
| Merge | **Deferred** — `merge` stub / unassigned `activeclinic.patient.merge` |
| Docs | `ACTIVECLINIC_PATIENT_DUPLICATE_DETECTION.md` |

**Duplicate strengths:** strong (live identifier or exact phone warning), moderate (email+name, name+DOB), weak (name only). Override requires `activeclinic.patient.duplicate_override` and is audited. Identifier uniqueness is DB-enforced; phone is not unique.

### 3.2 ACN11 — Patient Profile & Consent Management

| Item | Detail |
|------|--------|
| Routes | Profile, edit, identifiers, emergency contacts, consents grant/withdraw, archive, mark-deceased, print card |
| Consent service | `activeClinicPatientConsentService.js` — AC-local clinical/admin ledger |
| Tables | `patient_consents`, `patient_consent_events` (`038`); next-of-kin columns on `patients` |
| Emergency contacts | `patient_emergency_contacts` (`011`) — `consent_to_contact` is contact permission only, not guardianship |
| Platform consent | Must **not** merge clinical ledger into `platform/consent` prefs/policy acceptances |
| Markers | `data-ac-stitch="ACN11"` |

### 3.3 Patients / numbers / facilities / portal

| Area | Status | Key artifacts |
|------|--------|---------------|
| Patient record | **Present** | `008_patients.sql` — HCO-owned demographics + address columns |
| Patient number | **Present** | `AC-YYYY-NNNNNN` via counters; immutable trigger; `generateActiveClinicPatientNumber.js` |
| Identifiers | **Present** | `009_patient_identifiers.sql` (incl. insurance member number type) |
| Facility links | **Present** | `010` — `patient_registrations`, `patient_facility_links` |
| Registration status | **Present** | `023` — `complete` \| `incomplete` |
| Portal | **Present** | Optional `platform_identity_id` (`020`); portal routes/auth/password services; profile type `activeclinic_patient` |
| Import/export | **Partial** | `ac.patients` **export only** via data jobs; no patient CSV import adapter |
| Guardianship | **Explicitly out** | Next of kin / emergency ≠ legal authority |

**Identity model note:** `ACTIVECLINIC_PATIENT_IDENTITY_MODEL.md` still lists portal linking as deferred in places; code has linking via `020`/`026` (doc lag — do not re-implement).

---

## 4. Existing database structures

### 4.1 Platform (identity & shared mechanisms)

| Migration | Tables / focus |
|-----------|----------------|
| `020_platform_identities.sql` | `identities`, `identity_product_profiles` |
| `021_…multi_org_ac.sql` | AC multi-org staff links |
| `023_identity_credential_lockout_fields.sql` | Lockout |
| `024_identity_action_tokens.sql` | Activation / reset tokens |
| `026_activeclinic_patient_identity_profile.sql` | `activeclinic_patient` + token purposes |
| `010`/`022`/`025` | Deployment sessions + context |
| `011` | Auth transfers |
| `012`/`037` | Audit events |
| `036` | Verification challenges |
| `034`/`044`/`045` | Geography |
| `039`/`040` | Tenant forms + review |
| `043` | Data jobs, communication prefs, policy acceptances |

### 4.2 BlessBoard members (canonical)

| Migration | Tables / focus |
|-----------|----------------|
| `020_create_members_memberships_registrations.sql` | `members`, `member_branch_memberships`, `member_registrations` |
| `023_create_attendance.sql` | Aggregate attendance |
| `025_create_resources_forms_requests.sql` | `member_requests` |
| `014`/`022` | Ministries / participation |
| `060`/`061`/`063` | Member journey domain |
| `076_users_platform_identity_link.sql` | User → platform identity |
| `110_membership_workflow_v8.sql` | Intake, review events, transfers, pastoral notes |
| Legacy `db/postgres/049`–`114`… | `church_members`, attendance QR, import batches, ministry join |

### 4.3 ActiveClinic patients

| Migration | Tables / focus |
|-----------|----------------|
| `008_patients.sql` | `patients`, `patient_number_counters` |
| `009_patient_identifiers.sql` | Authoritative identifiers |
| `010_…facility_links.sql` | Registrations + facility links |
| `011_patient_emergency_contacts.sql` | Emergency contacts |
| `020_patient_portal_identity.sql` | Portal link + events |
| `023_patient_registration_status.sql` | Completeness |
| `024_public_booking_patient_linkage.sql` | Booking ↔ patient |
| `038_batch1a_patient_consent_clinic_fields.sql` | Consents, next of kin, clinic JSON |

### 4.4 Repositories / services / routes / middleware (index)

| Layer | Platform | BlessBoard | ActiveClinic |
|-------|----------|------------|--------------|
| Repos | `platformIdentityRepository`, action-token + verification repos | `memberIdentityRepository`, attendance/participation/journey repos | `patientRepository`, identifier/emergency/registration repos |
| Services | identity, credential, phone, session, verification, jobs, consent prefs, RBAC | memberRegistration, membershipWorkflow, memberPortal, journey, participation | patientService, duplicate, consent, portal auth/password/profile, number generator |
| HTTP | V5 session gate, platform admin, location routes | hq/branch members, membership workflow, member portal, attendance | `activeClinicPatientRoutes`, portal routes, management data |
| Middleware | `loadV5Session`, tenant scope | `requireActiveMember*` | `activeClinicPermissionMiddleware`, `loadActiveClinicPatientAuth` |
| Adapters | `productRuntimeRegistry`, data job adapters | `blessboardDataJobAdapters`, verification adapter | `activeClinicDataJobAdapters`, platform contract bootstrap |

---

## 5. Duplicate implementations

| Concern | Implementations today | Recommendation |
|---------|----------------------|----------------|
| Phone/email normalize | Platform phone service + BB wrappers + product column triggers | **Reuse platform**; thin product wrappers only |
| Auth sessions | Shared V5/deployment sessions; BB/AC portal shells | Keep shared session; product principal adapters |
| Password reset tokens | Platform action tokens (AC); BB password reset services; legacy church reset requests | Prefer platform tokens + product handlers |
| OTP / verification | Platform shared verification + product adapters | Keep |
| Duplicate scoring | BB **church-registration** scoring vs AC **patient** duplicate service | **Do not merge** — different domains; optional later shared *scoring primitive* with product signal policies |
| Member vs patient demographics | Parallel columns (name, phone, email, status) | Expected; optional shared person only if V2.04 explicitly adds it |
| Import CSV | Platform job shell + BB church commit path + AC export | Keep shell; product mappers |
| Related contacts | AC only | Lift **mechanism** only if BB needs related contacts; keep clinical flags AC-owned |
| Consent | Platform prefs/policy vs AC clinical ledger | **Keep separate** forever for clinical types |
| BB dual member stacks | `blessboard.members` vs `church_members` | Compatibility risk — do not invent a third stack |

---

## 6. Missing infrastructure (relative to architecture target)

| Target capability | Gap |
|-------------------|-----|
| Shared person / demographic aggregate | No `platform.persons` (or equivalent) |
| Shared related-contacts primitive | AC-local only |
| Shared person address model | Address columns on AC patients / registration fields only |
| Shared fuzzy duplicate *primitive* | Product-local engines only (AC patients; BB org-registration) |
| BlessBoard human Church ID / member number | Not implemented |
| BB staff-managed member duplicate warning UX (ACN10-like) | Not equivalent to AC |
| First-class BB visitors + conversion service | Continuum of forms/check-ins/contacts only |
| Unified per-person BB attendance on V5 | Still legacy QR path |
| Patient CSV import | Export-only |
| Patient merge | Deferred by design |
| Platform RBAC storage independence | Still reads BB role tables |
| Zero platform→product requires for recovery/team | Allowlisted debt remains |

---

## 7. Recommended shared platform boundary

```text
PLATFORM (mechanisms + optional person primitives)
  identities / credentials / sessions / OTP / action tokens
  phone + email normalization
  organization + trusted scope (soft branch/facility IDs)
  RBAC decision helpers + catalogue lookup
  audit sink
  notification dispatch + communication prefs / policy acceptances
  data job shell (import/export orchestration)
  list query / pagination helpers
  [OPTIONAL V2.04] person contact primitives:
      related-contacts mechanism (subject_kind + subject_ref)
      address value-object helpers / normalization
      duplicate-signal scoring kit (injectable product policy)
  NEVER: membership status, Church ID rules, patient number,
         clinical consent types, attendance, pastoral requests

PRODUCT ADAPTERS (bootstrap → productRuntimeRegistry / job adapters)
  BlessBoard: membership, Church ID, branch membership, attendance,
              ministry/pastoral requests, visitor conversion policy
  ActiveClinic: patient record, Patient Number, facility links,
                clinical consent ledger, clinical extensions
```

**Hard rules:**

1. Platform must never `require` BlessBoard/ActiveClinic for generic person services — register adapters.
2. Do not introduce `if (product === "blessboard"|"activeclinic")` in new platform person services.
3. Do not put clinical consent or membership semantics in platform tables.
4. Opaque `subject_kind` + `subject_ref` (as used by prefs/jobs) is the preferred coupling style.

---

## 8. BB-only responsibilities

- `blessboard.members` (and until retired: `church_members`) as person-of-record for church
- Membership status / verification / suspension / archive semantics
- Church ID / member number allocation & display (when introduced)
- Branch assignment, transfers, primary membership
- Member directory & staff-managed member profile (product UX; Stitch later)
- Attendance models (aggregate and/or per-person QR)
- Ministries, departments, cells, join requests
- Pastoral/practical member requests
- Visitor continuum & conversion policy
- Member portal access gates
- Member import commit mapping (`bb.member_import` / church import review)

---

## 9. AC-only responsibilities

- `activeclinic.patients` as HCO person-of-record
- Patient Number (`AC-YYYY-NNNNNN`) generation & immutability
- Patient status (`active|inactive|deceased|archived`)
- Facility relationships (`patient_facility_links`)
- Authoritative identifiers + uniqueness
- ACN10 directory search & duplicate override workflow
- ACN11 profile + **clinical/admin consent ledger**
- Next of kin + emergency contacts (product semantics)
- Patient portal activation / linking / recovery UX on top of platform identities
- Patient export (and future import mapper)
- Clinical extensions (encounters, notes, etc. — out of V2.04 person foundation)

---

## 10. Migration requirements (planning only — do not apply in Phase 0)

| Priority | Likely need | Notes |
|----------|-------------|-------|
| P0 | None destructive | Phase 0 forbids destructive migrations |
| P1 (if shared person adopted) | Additive `platform` tables for person/contact primitives OR explicit decision to **not** share demographics | Prefer additive; products keep FKs to their member/patient rows |
| P1 | BB `member_number` / Church ID column + counter (BB schema) | Product-owned; mirror AC counter pattern carefully |
| P1 | Related-contacts platform mechanism (optional) | Only if BB needs it; AC can keep local table or adapt |
| P2 | Patient import adapter metadata only | No wipe; job shell already exists |
| P2 | RBAC storage move off blessboard schema | Existing consolidation debt — not person-specific |
| Avoid | Merging BB dual stacks in same migration as person foundation | Separate program |
| Avoid | Moving AC consent into platform | Boundary violation |
| Avoid | Rewriting applied migration history | Hard denial |

---

## 11. Compatibility risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| BB dual member stacks diverge further | **High** | Treat V5 `blessboard.members` as canonical for new work; legacy only via adapters |
| Treating platform `identities` as demographic person | **High** | Keep auth vs person-of-record split (AC identity model already states this) |
| Merging AC clinical consent with platform prefs | **High** | Documented forbid; keep ACN11 local |
| Reusing BB org-registration duplicate scoring for people | **Medium** | Wrong domain — leave alone |
| Soft-breaking patient_number / member uniqueness | **High** | Preserve immutability & HCO/church scope |
| Platform services gaining new product `require`s | **Medium** | Use registry; architecture tests |
| Portal linking doc vs code lag | **Low** | Update docs; do not rebuild portal |
| Cross-product person sharing (same human as member+patient) | **Product decision** | Out of scope unless explicitly designed; today separate records by org/HCO |
| Stitch screens absent | **Process** | No UI invent; backend foundation only in later phases |

---

## 12. Proposed implementation phases

| Phase | Name | Intent |
|-------|------|--------|
| **0** | Discovery (this doc) | Read-only audit — **complete when marked below** |
| **1** | Boundary freeze + contracts | Document person vs identity vs product record; extend `productRuntimeRegistry` slots (duplicate policy, related contacts, number allocators) without UI |
| **2** | Platform primitives (additive) | Only mechanisms missing: optional related-contacts/address helpers / duplicate scoring kit — **no** product screens |
| **3** | AC adapter alignment | Wire ACN10/11 to any new primitives **without** redesign; keep consent local; preserve tests |
| **4** | BB adapter alignment | Staff-managed members on V5 canonical path; Church ID; optional duplicate warnings; do not redesign Stitch-absent UI |
| **5** | Import convergence | BB commit via job adapter; AC patient import mapper when required |
| **6** | Dual-stack BB retirement plan | Separate epic — not blocked on person primitives, but must not conflict |
| **Later** | Stitch-led UI | Member/patient staff screens when designs arrive |

Each phase must pass architecture dependency tests and existing product characterization tests before proceeding.

---

## 13. Files likely to change (later phases — not Phase 0)

### Platform
- `src/platform/contracts/productRuntimeRegistry.js`
- `src/platform/services/platformIdentity*.js` (link only — not demographics unless decided)
- `src/platform/services/phoneNumberService.js` (reuse)
- `src/platform/jobs/*`, `src/platform/rbac/*`, `src/platform/audit/*`
- New: optional `src/platform/person/` or `src/platform/contacts/` (if approved)
- New additive `db/migrations/platform/0xx_*.sql`

### BlessBoard
- `src/blessboard/repositories/memberIdentityRepository.js`
- `src/blessboard/services/memberRegistrationService.js`, `membershipWorkflowService.js`
- `src/blessboard/http/hqMembersAdminRoutes.js`, branch member routes
- `src/blessboard/services/blessboardDataJobAdapters.js`
- `src/blessboard/bootstrap/registerBlessBoardPlatformContracts.js`
- Possible new Church ID generator service + migration under `db/migrations/blessboard/`

### ActiveClinic
- `src/activeclinic/services/activeClinicPatientService.js`
- `src/activeclinic/services/activeClinicPatientDuplicateService.js`
- `src/activeclinic/services/activeClinicPatientConsentService.js` (keep local)
- `src/activeclinic/http/activeClinicPatientRoutes.js`
- `src/activeclinic/services/activeClinicDataJobAdapters.js`
- `src/activeclinic/bootstrap/registerActiveClinicPlatformContracts.js`

### Avoid changing for foundation alone
- Stitch-driven EJS layouts / marketing CSS
- Clinical encounter modules
- Website CMS twins
- Production config / deploy scripts

---

## 14. Tests protecting existing behavior

### Platform / identity
- `tests/v2-03-platform-shared-foundation.test.js`
- `tests/blessboard-phone-identity-foundation.test.js`
- `tests/activeclinic-mf-identity.test.js`
- `tests/activeclinic-registration-identity-idempotency.test.js`
- Architecture: `npm run test:architecture` / dependency direction allowlists

### BlessBoard members / registration / attendance
- `tests/blessboard-members-schema.test.js`
- `tests/blessboard-member-registration.test.js`
- `tests/blessboard-member-portal.test.js`
- `tests/v8-bb-membership.test.js`
- `tests/v8-bb-hq-membership-route.test.js`
- `tests/blessboard-attendance.test.js`
- `tests/blessboard-member-journey-foundation.test.js`
- `tests/blessboard-forms-requests.test.js`
- Church legacy: `church-member-portal`, `church-member-import`, `church-phase6-members-directory-verification`, `church-foundation-attendance`, `church-growth-advanced-attendance`
- Org-registration duplicates (do not break): `blessboard-registration-duplicate-*.test.js`

### ActiveClinic patients (ACN10/11 critical)
- `tests/activeclinic-patient-foundation.test.js`
- `tests/activeclinic-batch1a-patient-reception.test.js` (ACN10–13)
- `tests/activeclinic-patient-merge-safety.test.js`
- `tests/activeclinic-patient-ui-parity.test.js`
- `tests/activeclinic-patient-registration-rbac.test.js`
- `tests/activeclinic-patient-portal.test.js`
- `tests/activeclinic-mf08-patient-registration.test.js`
- `tests/activeclinic-mf09-patient-dashboard.test.js`
- `tests/activeclinic-batch1a-management-data.test.js` (export jobs)
- `tests/v203-ac-batch1-test-readiness.test.js`

Any later phase that touches person/identity must keep these green (or intentionally update characterization with documented behavior change).

---

## Decision log (Phase 0)

| Decision | Outcome |
|----------|---------|
| Implement UI / Stitch layouts? | **No** — screens not available |
| Create migrations? | **No** |
| Deploy / production? | **No** |
| Shared person table required? | **Open** — recommend Phase 1 product decision; mechanisms-first if uncertain |
| Reuse AC ACN10/11 as-is? | **Yes** — do not rebuild |
| Reuse platform identities as person-of-record? | **No** |
| Merge BB dual stacks in V2.04? | **No** — separate epic |

---

## Verdict

Discovery completed on branch `V4` with sufficient inventory of platform identity mechanisms, BlessBoard member stacks, and ActiveClinic ACN10/ACN11 patient foundations. No blockers to planning Phase 1 boundary freeze. No implementation performed.

V2_04_PERSON_FOUNDATION_AUDIT_COMPLETE
