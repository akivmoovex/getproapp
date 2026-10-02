# V2.04 — Person Foundation Phase 1

## Platform Contracts Implementation Report

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_PERSON_FOUNDATION_PHASE1` |
| **Phase** | 1 — PLATFORM CONTRACTS |
| **Branch** | `V4` |
| **Date** | 2026-09-30 |
| **Based on** | [`V2_04_PERSON_MEMBER_PATIENT_AUDIT.md`](./V2_04_PERSON_MEMBER_PATIENT_AUDIT.md) |
| **UI / Stitch** | Not implemented (by design) |
| **Production DB** | Not touched |
| **Verdict** | See footer |

---

## 1. Objective met

Delivered the **minimum shared platform person contracts** so BlessBoard Membership and ActiveClinic Patient Record can both relate to a demographic **Person**, without:

- redesigning Stitch UI
- rewriting existing `blessboard.members` / `activeclinic.patients`
- requiring portal activation for staff-created records
- moving Church ID, Patient Number, clinical, ministry, or attendance into Person

Conceptual model implemented:

```text
platform.persons                    (demographic person)
        │
        ├── optional platform.identities   (portal / login — nullable)
        │
        └── platform.person_product_links
                 ├── bb.membership  → opaque subject_ref (member id)
                 └── ac.patient     → opaque subject_ref (patient id)
```

---

## 2. Reuse vs create

| Need | Decision |
|------|----------|
| Auth identity / sessions / OTP / password | **Reuse** `platform.identities` + session/verification stack |
| Phone normalization | **Reuse** `phoneNumberService` |
| Email normalization | **Reuse** platform lower/trim + format checks |
| Org / branch / facility scope | **Reuse** `rejectForgedTenantIdentifiers` / trusted scope |
| Audit sink | **Reuse** + **extend** catalogue keys |
| Product adapter registry | **Extend** `productRuntimeRegistry` |
| Demographic person aggregate | **Create** additive `platform.persons` |
| Product relationship link | **Create** `platform.person_product_links` |
| Address primitives | **Create** `platform.person_addresses` |
| Related / next-of-kin / emergency primitives | **Create** `platform.person_related_contacts` |
| AC clinical consent / emergency table | **Keep** product-local (`patient_consents`, `patient_emergency_contacts`) |
| BB membership / attendance / ministries | **Keep** product-local |

Compatibility strategy: **additive layer only**. Existing members/patients remain source of truth. Opt-in linking via `person_product_links` + projection helpers — **no backfill** in Phase 1.

---

## 3. Artifacts delivered

### Migration (additive, reversible notes included)

- `db/migrations/platform/046_person_foundation.sql`
  - `platform.persons`
  - `platform.person_product_links`
  - `platform.person_addresses`
  - `platform.person_related_contacts`
  - No `ALTER`/`DROP` of `blessboard.members`, `activeclinic.patients`, or `platform.identities`

### Platform module

| File | Role |
|------|------|
| `src/platform/person/personConstants.js` | Relationship keys, roles, forbidden field list |
| `src/platform/person/personNormalization.js` | Name / phone / email / DOB / address / related-contact normalize |
| `src/platform/person/personScope.js` | Trusted org + soft location scope |
| `src/platform/person/personRepository.js` | Persistence helpers |
| `src/platform/person/personService.js` | Create/update/link/verify/address/contact (no product requires) |
| `src/platform/person/personCompatibility.js` | Project drafts from BB member / AC patient without writes |
| `src/platform/person/index.js` | Public exports |

### Contracts

- `productRuntimeRegistry.registerPersonProductAdapter` / `getPersonProductAdapter`
- BB bootstrap registers `bb.membership` + `projectPersonDraftFromBlessBoardMember`
- AC bootstrap registers `ac.patient` + `projectPersonDraftFromActiveClinicPatient`
- Default relationship key resolved via **adapter**, not `if (product === …)` in person service

### Audit catalogue

- Actions: `person.created`, `person.updated`, `person.product_linked`, `person.verification_updated`, `person.address_added`, `person.related_contact_added`
- Entities: `person`, `person_product_link`, `person_address`, `person_related_contact`

### Tests

- `tests/v2-04-person-foundation-phase1.test.js` (13 pass)
- Existing `tests/v2-03-platform-shared-foundation.test.js` still pass

---

## 4. Boundary enforcement

### On Person (platform)

1. Person identity (demographic row)
2. Normalized name
3. Normalized phone (via shared phone service)
4. Normalized email
5. DOB (optional)
6. Address primitives
7. Related contacts
8. Next-of-kin / emergency-contact **primitives** (not guardianship)
9. Organization scope (required)
10. Location scope (soft `branch_id` / `facility_id`)
11. Audit metadata keys
12. Verification state (`phone_verified_at` / `email_verified_at` on person — independent of login identity)

### Explicitly NOT on Person

- Church ID / member number / membership status / ministries / attendance
- Patient Number / diagnoses / encounters / prescriptions / clinical notes / observations
- Clinical consent ledger (ACN11 remains AC-owned)

Forbidden field rejection is enforced in `normalizePersonDemographics` / `PERSON_FORBIDDEN_FIELDS`.

### Staff-created without portal

`platform_identity_id` is **nullable**. `createPerson` succeeds with no identity link. Product links do not require portal activation.

---

## 5. Backward compatibility

| Existing surface | Phase 1 impact |
|------------------|----------------|
| BB auth (`blessboard.users` / platform identities) | Untouched |
| AC auth / patient portal identities | Untouched |
| `blessboard.members` | Untouched (no ALTER) |
| `activeclinic.patients` + ACN10/11 | Untouched (no ALTER) |
| AC `patient_emergency_contacts` | Remains authoritative for AC UI; platform table is optional shared mechanism |
| Tenant / org isolation | Enforced on new person APIs via trusted scope |

Projection helpers map product records → person drafts for later opt-in linking without data rewrite.

---

## 6. What Phase 1 deliberately did not do

- No Stitch / EJS redesign
- No member or patient backfill into `platform.persons`
- No Church ID allocator
- No patient merge / import changes
- No clinical consent move to platform
- No BB dual-stack retirement
- No production migration apply / deploy

---

## 7. Recommended next phases

| Phase | Focus |
|-------|--------|
| **2** | Product write-path adapters (create member/patient → optional person + link) behind feature flags |
| **3** | AC: optional sync of emergency contacts / address projections; keep ACN11 consent local |
| **4** | BB: staff member create uses person contracts; Church ID remains BB-owned |
| **Later** | Stitch UI once designs land |

---

## 8. Test evidence

```text
node --test tests/v2-04-person-foundation-phase1.test.js
# tests 13, pass 13, fail 0

node --test tests/v2-03-platform-shared-foundation.test.js
# still green (run in same session as Phase 1 suite)
```

Smoke: BB + AC bootstraps register `personProductAdapters: ["activeclinic","blessboard"]` with default keys `bb.membership` / `ac.patient`.

---

## 9. Files changed

**Added**

- `db/migrations/platform/046_person_foundation.sql`
- `src/platform/person/*`
- `tests/v2-04-person-foundation-phase1.test.js`
- `docs/architecture/V2_04_PERSON_FOUNDATION_PHASE1.md`

**Modified**

- `src/platform/contracts/productRuntimeRegistry.js`
- `src/platform/audit/sharedAuditCatalog.js`
- `src/blessboard/bootstrap/registerBlessBoardPlatformContracts.js`
- `src/activeclinic/bootstrap/registerActiveClinicPlatformContracts.js`

---

PHASE1_PLATFORM_PERSON_FOUNDATION_PASS
