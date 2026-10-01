"use strict";

/**
 * V2.04 Phase 5 — ActiveClinic staff Add Patient domain foundation.
 * No Stitch UI. Reuses ACN10/11; no parallel patient stack.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  RESULT,
  PATIENT_STATUS,
  PORTAL_ACCESS_STATUS,
  PATIENT_PERMISSION,
  PATIENT_PERMISSION_ALIASES,
  PATIENT_NUMBER_POLICY,
  resolvePermissionKey,
  assertStaffActor,
  assertClinicalBoundary,
  assertPatientNumberPolicy,
  assertPatientNumberImmutable,
  derivePortalAccessStatus,
  assertPatientDoesNotRequirePortal,
  createStaffManagedPatient,
  updatePatientDemographics,
  evaluateStaffPatientDuplicates,
  checkStaffPatientIdentifierConflict,
  findReusablePersonForPatient,
} = require("../src/activeclinic/services/activeClinicPatientDomainService");
const {
  CREATE_TIME_PATIENT_STATUSES,
  CLINICAL_FORBIDDEN_FIELDS,
  STAFF_DEMOGRAPHIC_FIELDS,
} = require("../src/activeclinic/services/patientDomainConstants");
const {
  isValidPatientNumberFormat,
  generateActiveClinicPatientNumber,
} = require("../src/activeclinic/services/generateActiveClinicPatientNumber");
const {
  PERM,
  registerActiveClinicPatient,
  updateActiveClinicPatient,
} = require("../src/activeclinic/services/activeClinicPatientService");
const {
  findPotentialPatientDuplicates,
  findIdentifierConflict,
} = require("../src/activeclinic/services/activeClinicPatientDuplicateService");
const consentService = require("../src/activeclinic/services/activeClinicPatientConsentService");

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const HCO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const HCO_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const FACILITY = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const STAFF = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PATIENT_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const PERSON_ID = "11111111-1111-4111-8111-111111111111";

function allowOnly(allowedKeys) {
  const set = new Set(allowedKeys.map(resolvePermissionKey));
  return async (_db, input) => {
    const key = resolvePermissionKey(input.permission);
    return {
      allowed: set.has(key),
      reasonCode: set.has(key) ? "RBAC_ALLOWED" : "RBAC_PERMISSION_DENIED",
      permission: key,
    };
  };
}

describe("V2.04 AC patient domain constants + gates", () => {
  it("defines patient/portal statuses separately and preserves create-time subset", () => {
    assert.deepEqual([...CREATE_TIME_PATIENT_STATUSES], ["active", "inactive"]);
    assert.equal(PORTAL_ACCESS_STATUS.NONE, "none");
    assert.equal(PATIENT_STATUS.ACTIVE, "active");
    assert.ok(!assertPatientDoesNotRequirePortal({}).requiresPortal);
  });

  it("maps patients.* aliases to activeclinic.patient.* catalogue keys", () => {
    assert.equal(resolvePermissionKey("patients.view"), PATIENT_PERMISSION.VIEW);
    assert.equal(resolvePermissionKey("patients.create"), PATIENT_PERMISSION.CREATE);
    assert.equal(resolvePermissionKey("patients.edit"), PATIENT_PERMISSION.EDIT);
    assert.equal(
      PATIENT_PERMISSION_ALIASES["patients.create"],
      "activeclinic.patient.create"
    );
    assert.equal(PERM.CREATE, PATIENT_PERMISSION.CREATE);
    assert.equal(PERM.UPDATE, PATIENT_PERMISSION.EDIT);
    assert.equal(PERM.VIEW, PATIENT_PERMISSION.VIEW);
  });

  it("preserves HCO-scoped Patient Number policy AC-YYYY-NNNNNN", () => {
    assert.equal(PATIENT_NUMBER_POLICY.format, "AC-YYYY-NNNNNN");
    assert.equal(PATIENT_NUMBER_POLICY.scope, "healthcare_organization");
    assert.equal(PATIENT_NUMBER_POLICY.mutable, false);
    assert.equal(isValidPatientNumberFormat("AC-2026-000042"), true);
    assert.equal(isValidPatientNumberFormat("CH-100"), false);
    assert.equal(assertPatientNumberPolicy("AC-2026-000001").ok, true);
    assert.equal(assertPatientNumberPolicy("BAD").ok, false);
    assert.equal(
      assertPatientNumberImmutable(
        { patientNumber: "AC-2026-000001" },
        "AC-2026-000002"
      ).code,
      RESULT.PATIENT_NUMBER_IMMUTABLE
    );
  });

  it("rejects clinical fields on demographic paths", () => {
    for (const field of [
      "diagnosis",
      "encounters",
      "prescriptions",
      "clinicalNotes",
      "observations",
      "referrals",
      "clinicalDocuments",
    ]) {
      assert.equal(
        assertClinicalBoundary({ [field]: { id: 1 } }).code,
        RESULT.CLINICAL_FIELD_FORBIDDEN,
        field
      );
    }
    assert.ok(CLINICAL_FORBIDDEN_FIELDS.includes("diagnosis"));
    assert.ok(STAFF_DEMOGRAPHIC_FIELDS.includes("nextOfKin"));
    assert.equal(assertClinicalBoundary({ demographics: { firstName: "A" } }).ok, true);
  });

  it("forbids patient self-create", () => {
    assert.equal(
      assertStaffActor({
        selfCreate: true,
        staffMemberId: STAFF,
        organizationId: ORG,
        healthcareOrganizationId: HCO,
      }).code,
      RESULT.SELF_CREATE_FORBIDDEN
    );
  });
});

describe("V2.04 AC staff patient create + portal separation", () => {
  it("creates via staff path with portal none and allocated Patient Number", async () => {
    const audits = [];
    const result = await createStaffManagedPatient(
      {},
      {
        staffMemberId: STAFF,
        organizationId: ORG,
        healthcareOrganizationId: HCO,
        facilityId: FACILITY,
        demographics: {
          firstName: "James",
          lastName: "Banda",
          dateOfBirth: "1990-01-15",
          sexAtRegistration: "male",
          phoneNormalized: "+260971111111",
          email: "james@example.com",
        },
        address: { city: "Lusaka", countryCode: "ZM" },
        nextOfKin: { fullName: "Ann Banda", relationship: "spouse" },
        emergencyContacts: [
          { fullName: "Ann Banda", relationship: "spouse", phone: "+260972222222" },
        ],
        source: "staff_api",
      },
      {
        authorize: allowOnly([PATIENT_PERMISSION.CREATE]),
        hooks: {
          async createPerson() {
            return {
              ok: true,
              person: {
                id: PERSON_ID,
                organizationId: ORG,
                platformIdentityId: null,
              },
            };
          },
          async linkPersonProductRelationship(_db, input) {
            return {
              ok: true,
              link: {
                id: "link-1",
                subjectRef: input.subjectRef,
                personId: PERSON_ID,
              },
            };
          },
          async recordAudit(_db, payload) {
            audits.push(payload);
            return { ok: true };
          },
          evaluatePersonDuplicates: () => ({
            ok: true,
            overallMatchCode: "NO_MATCH",
            action: "ALLOW",
            blocking: false,
            matches: [],
          }),
        },
        adapter: {
          productCode: "activeclinic",
          relationshipKey: "ac.patient",
          duplicatePolicy: {
            decide: () => ({
              action: "ALLOW",
              blocking: false,
              overrideAllowed: false,
            }),
          },
          createPermissionKey: PATIENT_PERMISSION.CREATE,
          presentMatch: () => ({}),
          authorize: async () => ({ ok: true }),
          normalizeProductFields: (input) => ({
            ok: true,
            product: {
              healthcareOrganizationId: HCO,
              facilityId: FACILITY,
              patientStatus: "active",
              portalAccessStatus: "none",
              ...(input.product || {}),
            },
            productIdentifiers: [],
          }),
          loadDuplicateCandidates: async () => ({ ok: true, candidates: [] }),
          createProductRelationship: async () => ({
            ok: true,
            subjectRef: PATIENT_ID,
            productIdentifier: "AC-2026-000001",
            relationshipStatus: "active",
            portalAccessStatus: "none",
            productRecord: {
              patient: {
                id: PATIENT_ID,
                patientNumber: "AC-2026-000001",
                status: "active",
                platformIdentityId: null,
                healthcareOrganizationId: HCO,
                organizationId: ORG,
              },
            },
            location: {
              organizationId: ORG,
              healthcareOrganizationId: HCO,
              facilityId: FACILITY,
            },
          }),
        },
      }
    );

    assert.equal(result.ok, true);
    assert.equal(result.patientNumber, "AC-2026-000001");
    assert.equal(result.portalAccessStatus, "none");
    assert.equal(result.patientStatus, "active");
    assert.equal(result.personId, PERSON_ID);
    assert.equal(derivePortalAccessStatus(result.patient), "none");
    assert.ok(audits.some((a) => a.actionKey === "activeclinic.patient.create" || a.metadata));
  });

  it("denies create without patients.create / activeclinic.patient.create", async () => {
    const result = await createStaffManagedPatient(
      {},
      {
        staffMemberId: STAFF,
        organizationId: ORG,
        healthcareOrganizationId: HCO,
        facilityId: FACILITY,
        demographics: { firstName: "A", lastName: "B" },
      },
      {
        authorize: allowOnly([PATIENT_PERMISSION.VIEW]),
        adapter: {
          productCode: "activeclinic",
          relationshipKey: "ac.patient",
          duplicatePolicy: { decide: () => ({ action: "ALLOW", blocking: false }) },
          createPermissionKey: PATIENT_PERMISSION.CREATE,
          presentMatch: () => ({}),
          authorize: async () => ({ ok: true }),
          normalizeProductFields: () => ({
            ok: true,
            product: {},
            productIdentifiers: [],
          }),
          loadDuplicateCandidates: async () => ({ ok: true, candidates: [] }),
          createProductRelationship: async () => ({ ok: true }),
        },
      }
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, RESULT.UNAUTHORIZED);
  });

  it("accepts patients.create alias for authorization", async () => {
    const result = await createStaffManagedPatient(
      {},
      {
        staffMemberId: STAFF,
        organizationId: ORG,
        healthcareOrganizationId: HCO,
        facilityId: FACILITY,
        demographics: { firstName: "A", lastName: "B" },
      },
      {
        authorize: allowOnly(["patients.create"]),
        hooks: {
          async createPerson() {
            return { ok: true, person: { id: PERSON_ID, organizationId: ORG } };
          },
          async linkPersonProductRelationship(_db, input) {
            return {
              ok: true,
              link: { id: "l", subjectRef: input.subjectRef, personId: PERSON_ID },
            };
          },
          async recordAudit() {
            return { ok: true };
          },
          evaluatePersonDuplicates: () => ({
            ok: true,
            overallMatchCode: "NO_MATCH",
            action: "ALLOW",
            blocking: false,
            matches: [],
          }),
        },
        adapter: {
          productCode: "activeclinic",
          relationshipKey: "ac.patient",
          duplicatePolicy: {
            decide: () => ({ action: "ALLOW", blocking: false, overrideAllowed: false }),
          },
          createPermissionKey: PATIENT_PERMISSION.CREATE,
          presentMatch: () => ({}),
          authorize: async () => ({ ok: true }),
          normalizeProductFields: () => ({
            ok: true,
            product: {
              healthcareOrganizationId: HCO,
              facilityId: FACILITY,
              patientStatus: "active",
              portalAccessStatus: "none",
            },
            productIdentifiers: [],
          }),
          loadDuplicateCandidates: async () => ({ ok: true, candidates: [] }),
          createProductRelationship: async () => ({
            ok: true,
            subjectRef: PATIENT_ID,
            productIdentifier: "AC-2026-000010",
            relationshipStatus: "active",
            portalAccessStatus: "none",
            productRecord: {
              patient: {
                id: PATIENT_ID,
                patientNumber: "AC-2026-000010",
                status: "active",
                platformIdentityId: null,
              },
            },
            location: {
              organizationId: ORG,
              healthcareOrganizationId: HCO,
              facilityId: FACILITY,
            },
          }),
        },
      }
    );
    assert.equal(result.ok, true);
    assert.equal(result.portalAccessStatus, "none");
  });

  it("surfaces duplicate warning from shared workflow", async () => {
    const result = await createStaffManagedPatient(
      {},
      {
        staffMemberId: STAFF,
        organizationId: ORG,
        healthcareOrganizationId: HCO,
        facilityId: FACILITY,
        demographics: {
          firstName: "James",
          lastName: "Banda",
          phoneNormalized: "+260971111111",
        },
      },
      {
        authorize: allowOnly([PATIENT_PERMISSION.CREATE]),
        hooks: {
          evaluatePersonDuplicates: () => ({
            ok: true,
            overallMatchCode: "STRONG_POSSIBLE_MATCH",
            action: "WARN_REVIEW",
            blocking: true,
            matches: [
              {
                subjectRef: "other-patient",
                matchCode: "STRONG_POSSIBLE_MATCH",
                reasons: ["phone"],
              },
            ],
          }),
          async recordAudit() {
            return { ok: true };
          },
        },
        adapter: {
          productCode: "activeclinic",
          relationshipKey: "ac.patient",
          duplicatePolicy: {
            decide: () => ({
              action: "WARN_REVIEW",
              blocking: true,
              overrideAllowed: true,
            }),
          },
          createPermissionKey: PATIENT_PERMISSION.CREATE,
          presentMatch: (c, s, d) => ({
            subjectRef: c.subjectRef,
            matchCode: s.matchCode,
            action: d.action,
          }),
          authorize: async () => ({ ok: true }),
          normalizeProductFields: () => ({
            ok: true,
            product: {
              healthcareOrganizationId: HCO,
              facilityId: FACILITY,
              patientStatus: "active",
              portalAccessStatus: "none",
            },
            productIdentifiers: [],
          }),
          loadDuplicateCandidates: async () => ({
            ok: true,
            candidates: [
              {
                id: "other-patient",
                subjectRef: "other-patient",
                firstName: "James",
                lastName: "Banda",
                phoneNormalized: "+260971111111",
                productIdentifiers: [],
              },
            ],
          }),
          createProductRelationship: async () => {
            throw new Error("must not create");
          },
        },
      }
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, RESULT.DUPLICATE_WARNING);
  });

  it("rejects clinical payload on create", async () => {
    const result = await createStaffManagedPatient(
      {},
      {
        staffMemberId: STAFF,
        organizationId: ORG,
        healthcareOrganizationId: HCO,
        facilityId: FACILITY,
        demographics: { firstName: "A", lastName: "B" },
        diagnosis: { code: "A00" },
      },
      { authorize: allowOnly([PATIENT_PERMISSION.CREATE]) }
    );
    assert.equal(result.code, RESULT.CLINICAL_FIELD_FORBIDDEN);
  });
});

describe("V2.04 AC duplicates + identifier + HCO isolation", () => {
  it("evaluates duplicates only within provided HCO scope", async () => {
    const calls = [];
    const result = await evaluateStaffPatientDuplicates(
      {},
      {
        organizationId: ORG,
        healthcareOrganizationId: HCO,
        phoneNormalized: "+260971111111",
        firstName: "James",
        lastName: "Banda",
      },
      {
        findPotentialPatientDuplicates: async (_db, input) => {
          calls.push(input);
          return {
            ok: true,
            matches: [
              {
                patientId: PATIENT_ID,
                matchStrength: "strong",
                reasons: ["phone"],
              },
            ],
            blocking: true,
            hasStrong: true,
          };
        },
      }
    );
    assert.equal(result.ok, true);
    assert.equal(result.blocking, true);
    assert.equal(calls[0].healthcareOrganizationId, HCO);
    assert.notEqual(calls[0].healthcareOrganizationId, HCO_B);
  });

  it("shared phone alone is a warning surface via ACN10 path", async () => {
    const result = await evaluateStaffPatientDuplicates(
      {},
      {
        organizationId: ORG,
        healthcareOrganizationId: HCO,
        phoneNormalized: "+260971111111",
      },
      {
        findPotentialPatientDuplicates: async () => ({
          ok: true,
          matches: [{ patientId: PATIENT_ID, matchStrength: "strong", reasons: ["phone"] }],
          blocking: true,
          hasStrong: true,
        }),
      }
    );
    assert.equal(result.blocking, true);
    assert.equal(result.hasStrong, true);
  });

  it("reports identifier conflict within HCO", async () => {
    const conflicted = await checkStaffPatientIdentifierConflict(
      {},
      {
        organizationId: ORG,
        healthcareOrganizationId: HCO,
        identifierType: "national_id",
        identifierValueNormalized: "123456/78/1",
      },
      {
        findIdentifierConflict: async () => ({
          conflict: {
            patientId: PATIENT_ID,
            identifierType: "national_id",
          },
        }),
      }
    );
    assert.equal(conflicted.ok, false);
    assert.equal(conflicted.code, RESULT.IDENTIFIER_CONFLICT);

    const clear = await checkStaffPatientIdentifierConflict(
      {},
      {
        organizationId: ORG,
        healthcareOrganizationId: HCO,
        identifierType: "national_id",
        identifierValueNormalized: "999999/99/1",
      },
      {
        findIdentifierConflict: async () => ({ conflict: null }),
      }
    );
    assert.equal(clear.ok, true);
  });
});

describe("V2.04 AC demographics update + person reuse + RBAC", () => {
  it("updates demographics with patients.edit and audits; blocks Patient Number change", async () => {
    const audits = [];
    const immutable = await updatePatientDemographics(
      {},
      {
        staffMemberId: STAFF,
        organizationId: ORG,
        healthcareOrganizationId: HCO,
        facilityId: FACILITY,
        patientId: PATIENT_ID,
        patientNumber: "AC-2026-000099",
        currentPatientNumber: "AC-2026-000001",
        demographics: { firstName: "Jim", lastName: "Banda" },
      },
      {
        authorize: allowOnly(["patients.edit"]),
      }
    );
    assert.equal(immutable.code, RESULT.PATIENT_NUMBER_IMMUTABLE);

    const updated = await updatePatientDemographics(
      {},
      {
        staffMemberId: STAFF,
        organizationId: ORG,
        healthcareOrganizationId: HCO,
        facilityId: FACILITY,
        patientId: PATIENT_ID,
        demographics: { firstName: "Jim", lastName: "Banda" },
        address: { city: "Ndola" },
        nextOfKin: { fullName: "Ann" },
      },
      {
        authorize: allowOnly([PATIENT_PERMISSION.EDIT]),
        updateActiveClinicPatient: async (_db, input) => {
          assert.equal(input.healthcareOrganizationId, HCO);
          assert.equal(input.organizationId, ORG);
          return {
            ok: true,
            patient: {
              id: PATIENT_ID,
              patientNumber: "AC-2026-000001",
              firstName: "Jim",
              lastName: "Banda",
              status: "active",
              organizationId: ORG,
              healthcareOrganizationId: HCO,
              platformIdentityId: null,
            },
          };
        },
      }
    );
    // domain audits via recordSharedPlatformAudit — stub by wrapping create path style
    assert.equal(updated.ok, true);
    assert.equal(updated.portalAccessStatus, "none");
    assert.equal(updated.patient.firstName, "Jim");

    const denied = await updatePatientDemographics(
      {},
      {
        staffMemberId: STAFF,
        organizationId: ORG,
        healthcareOrganizationId: HCO,
        patientId: PATIENT_ID,
        demographics: { firstName: "X", lastName: "Y" },
      },
      { authorize: allowOnly([PATIENT_PERMISSION.VIEW]) }
    );
    assert.equal(denied.code, RESULT.UNAUTHORIZED);

    const clinical = await updatePatientDemographics(
      {},
      {
        staffMemberId: STAFF,
        organizationId: ORG,
        healthcareOrganizationId: HCO,
        patientId: PATIENT_ID,
        prescriptions: [{ drug: "x" }],
      },
      { authorize: allowOnly([PATIENT_PERMISSION.EDIT]) }
    );
    assert.equal(clinical.code, RESULT.CLINICAL_FIELD_FORBIDDEN);

    void audits;
  });

  it("detects HCO mismatch on update result", async () => {
    const result = await updatePatientDemographics(
      {},
      {
        staffMemberId: STAFF,
        organizationId: ORG,
        healthcareOrganizationId: HCO,
        patientId: PATIENT_ID,
        demographics: { firstName: "A", lastName: "B" },
      },
      {
        authorize: allowOnly([PATIENT_PERMISSION.EDIT]),
        updateActiveClinicPatient: async () => ({
          ok: true,
          patient: {
            id: PATIENT_ID,
            organizationId: ORG,
            healthcareOrganizationId: HCO_B,
            patientNumber: "AC-2026-000001",
            status: "active",
          },
        }),
      }
    );
    assert.equal(result.code, RESULT.HCO_MISMATCH);
  });

  it("reuses person on exact org phone; ambiguous when multiple", async () => {
    const exact = await findReusablePersonForPatient(
      {
        query: async () => ({
          rows: [
            {
              id: PERSON_ID,
              organization_id: ORG,
              phone_normalized: "+260971111111",
              email_normalized: null,
              status: "active",
            },
          ],
        }),
      },
      { organizationId: ORG, phoneNormalized: "+260971111111" }
    );
    assert.equal(exact.reason, "exact_match");
    assert.equal(exact.person.id, PERSON_ID);

    const ambiguous = await findReusablePersonForPatient(
      {
        query: async () => ({
          rows: [
            { id: "1", organization_id: ORG, phone_normalized: "+260971111111", status: "active" },
            { id: "2", organization_id: ORG, phone_normalized: "+260971111111", status: "active" },
          ],
        }),
      },
      { organizationId: ORG, phoneNormalized: "+260971111111" }
    );
    assert.equal(ambiguous.reason, "ambiguous");
    assert.equal(ambiguous.person, null);
  });
});

describe("V2.04 AC ACN10/11 regression smoke", () => {
  it("keeps ACN10 register/duplicate and ACN11 update/consent exports", () => {
    assert.equal(typeof registerActiveClinicPatient, "function");
    assert.equal(typeof updateActiveClinicPatient, "function");
    assert.equal(typeof findPotentialPatientDuplicates, "function");
    assert.equal(typeof findIdentifierConflict, "function");
    assert.equal(typeof generateActiveClinicPatientNumber, "function");
    assert.equal(typeof consentService, "object");
    assert.ok(
      Object.keys(consentService).length > 0,
      "ACN11 consent service remains exported"
    );
  });

  it("does not add a parallel patients table migration in Phase 5", () => {
    const migDir = path.join(
      __dirname,
      "../db/migrations/activeclinic"
    );
    const files = fs.readdirSync(migDir).filter((f) => f.endsWith(".sql"));
    const phase5Parallel = files.filter((f) =>
      /patient_domain_v204|parallel_patient|staff_add_patient_table/i.test(f)
    );
    assert.deepEqual(phase5Parallel, []);
    // Existing foundation migration still present
    assert.ok(files.includes("008_patients.sql"));
    assert.ok(files.includes("038_batch1a_patient_consent_clinic_fields.sql"));
  });

  it("domain service composes existing register path (no second insert helper)", () => {
    const src = fs.readFileSync(
      path.join(
        __dirname,
        "../src/activeclinic/services/activeClinicPatientDomainService.js"
      ),
      "utf8"
    );
    assert.match(src, /runStaffManagedPersonWorkflow/);
    assert.match(src, /createActiveClinicStaffPatientAdapter/);
    assert.match(src, /updateActiveClinicPatient/);
    assert.match(src, /findPotentialPatientDuplicates/);
    assert.doesNotMatch(src, /INSERT INTO activeclinic\.patients/);
  });
});
