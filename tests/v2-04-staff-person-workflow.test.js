"use strict";

/**
 * V2.04 Phase 3 — staff-managed person workflow tests.
 * No Stitch UI. Covers BB + AC adapters and platform orchestration.
 */

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  runStaffManagedPersonWorkflow,
  STAFF_PERSON_WORKFLOW_CODE,
  assertStaffPersonAdapter,
} = require("../src/platform/person/workflow");
const {
  PERSON_MATCH_CODE,
  PERSON_MATCH_ACTION,
  BLESSBOARD_DUPLICATE_POLICY,
  ACTIVECLINIC_DUPLICATE_POLICY,
} = require("../src/platform/person/duplicate");
const {
  PERSON_RELATIONSHIP_KEY,
} = require("../src/platform/person/personConstants");
const {
  createBlessBoardStaffMemberAdapter,
  PORTAL_ACCESS: BB_PORTAL,
} = require("../src/blessboard/services/blessBoardStaffMemberWorkflowAdapter");
const {
  createActiveClinicStaffPatientAdapter,
  PORTAL_ACCESS: AC_PORTAL,
} = require("../src/activeclinic/services/activeClinicStaffPatientWorkflowAdapter");
const {
  clearProductRuntimeContracts,
  registerPersonProductAdapter,
  getPersonProductAdapter,
} = require("../src/platform/contracts/productRuntimeRegistry");
const {
  SHARED_AUDIT_ACTION,
} = require("../src/platform/audit");

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHURCH = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BRANCH = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const HCO = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const FACILITY = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PERSON_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const SUBJECT = "11111111-1111-4111-8111-111111111111";

function makeHooks(auditLog) {
  return {
    async createPerson() {
      return {
        ok: true,
        person: {
          id: PERSON_ID,
          organizationId: ORG,
          platformIdentityId: null,
          firstName: "Ada",
          lastName: "Lovelace",
        },
      };
    },
    async getPerson(_db, input) {
      return {
        ok: true,
        person: {
          id: input.personId,
          organizationId: ORG,
          platformIdentityId: null,
        },
        links: [],
      };
    },
    async linkPersonProductRelationship(_db, input) {
      return {
        ok: true,
        link: {
          id: "22222222-2222-4222-8222-222222222222",
          personId: input.personId,
          subjectRef: input.subjectRef,
          relationshipKey: input.relationshipKey,
          productCode: input.productCode,
        },
      };
    },
    evaluatePersonDuplicates: require("../src/platform/person/duplicate")
      .evaluatePersonDuplicates,
    async recordAudit(_db, payload) {
      auditLog.push(payload);
      return { ok: true };
    },
  };
}

describe("V2.04 staff person adapter contract", () => {
  it("requires authorize/normalize/candidates/create methods", () => {
    assert.equal(assertStaffPersonAdapter(null).ok, false);
    assert.equal(
      assertStaffPersonAdapter({
        productCode: "blessboard",
        relationshipKey: "bb.membership",
      }).ok,
      false
    );
  });
});

describe("V2.04 BlessBoard staff member adapter", () => {
  it("normalizes Church ID, branch, membership + portal access status", () => {
    const adapter = createBlessBoardStaffMemberAdapter({
      authorize: async () => ({ allowed: true }),
    });
    const ok = adapter.normalizeProductFields({
      trusted: { organizationId: ORG, churchId: CHURCH, branchId: BRANCH },
      product: {
        memberNumber: "BB-1001",
        membershipStatus: "active",
        portalAccessStatus: BB_PORTAL.NONE,
      },
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.product.memberNumber, "BB-1001");
    assert.equal(ok.product.churchId, CHURCH);
    assert.equal(ok.product.branchId, BRANCH);
    assert.equal(ok.product.portalAccessStatus, "not_activated");
    assert.ok(
      ok.productIdentifiers.some(
        (x) => x.key === "member_number" && x.valueNormalized === "BB-1001"
      )
    );
  });

  it("rejects clinical fields and allows staff create without portal", () => {
    const adapter = createBlessBoardStaffMemberAdapter({
      authorize: async () => ({ allowed: true }),
    });
    const clinical = adapter.normalizeProductFields({
      trusted: { churchId: CHURCH, branchId: BRANCH },
      product: { diagnosis: "x" },
    });
    assert.equal(clinical.ok, false);

    const noPortal = adapter.normalizeProductFields({
      trusted: { churchId: CHURCH, branchId: BRANCH },
      product: { portalAccessStatus: "not_activated", membershipStatus: "active" },
    });
    assert.equal(noPortal.ok, true);
    assert.equal(noPortal.product.portalAccessStatus, "not_activated");
  });

  it("authorize denies without actor/church context", async () => {
    const adapter = createBlessBoardStaffMemberAdapter({
      authorize: async () => ({ allowed: true }),
    });
    const denied = await adapter.authorize({}, {
      trusted: { organizationId: ORG },
      actor: {},
    });
    assert.equal(denied.ok, false);
  });
});

describe("V2.04 ActiveClinic staff patient adapter", () => {
  it("normalizes HCO, facility, patient status, portal access", () => {
    const adapter = createActiveClinicStaffPatientAdapter({
      registerActiveClinicPatient: async () => ({ ok: true }),
    });
    const ok = adapter.normalizeProductFields({
      trusted: { organizationId: ORG, facilityId: FACILITY },
      product: {
        healthcareOrganizationId: HCO,
        patientStatus: "active",
        portalAccessStatus: AC_PORTAL.NONE,
        sexAtRegistration: "female",
      },
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.product.healthcareOrganizationId, HCO);
    assert.equal(ok.product.facilityId, FACILITY);
    assert.equal(ok.product.portalAccessStatus, "none");
  });

  it("rejects clinical and BlessBoard fields", () => {
    const adapter = createActiveClinicStaffPatientAdapter({
      registerActiveClinicPatient: async () => ({ ok: true }),
    });
    assert.equal(
      adapter.normalizeProductFields({
        trusted: { facilityId: FACILITY },
        product: { healthcareOrganizationId: HCO, diagnosis: "flu" },
      }).ok,
      false
    );
    assert.equal(
      adapter.normalizeProductFields({
        trusted: { facilityId: FACILITY },
        product: { healthcareOrganizationId: HCO, churchId: CHURCH },
      }).ok,
      false
    );
  });
});

describe("V2.04 staff person workflow orchestration", () => {
  it("runs authorize → normalize → match → person → product → audit for BB", async () => {
    const auditLog = [];
    const createdMembers = [];
    const adapter = createBlessBoardStaffMemberAdapter({
      authorize: async () => ({ allowed: true, reasonCode: "RBAC_ALLOWED" }),
    });
    adapter.loadDuplicateCandidates = async () => ({ ok: true, candidates: [] });
    adapter.createProductRelationship = async (_db, ctx) => {
      createdMembers.push(ctx);
      return {
        ok: true,
        subjectRef: SUBJECT,
        productIdentifier: ctx.product.memberNumber,
        relationshipStatus: "active",
        portalAccessStatus: "not_activated",
        productRecord: { member: { id: SUBJECT } },
        location: {
          organizationId: ORG,
          churchId: CHURCH,
          branchId: BRANCH,
        },
      };
    };

    const result = await runStaffManagedPersonWorkflow(
      {},
      {
        productCode: "blessboard",
        adapter,
        trusted: {
          organizationId: ORG,
          churchId: CHURCH,
          branchId: BRANCH,
        },
        actor: { userId: "33333333-3333-4333-8333-333333333333" },
        demographics: {
          firstName: "Ada",
          lastName: "Lovelace",
          phoneNormalized: "+260971234567",
          email: "ada@example.com",
        },
        product: {
          memberNumber: "BB-42",
          membershipStatus: "active",
          portalAccessStatus: "not_activated",
        },
        source: "test",
        hooks: makeHooks(auditLog),
      }
    );

    assert.equal(result.ok, true);
    assert.equal(result.code, STAFF_PERSON_WORKFLOW_CODE.OK);
    assert.equal(result.person.id, PERSON_ID);
    assert.equal(result.personCreated, true);
    assert.equal(result.subjectRef, SUBJECT);
    assert.equal(result.productIdentifier, "BB-42");
    assert.equal(result.portalAccessStatus, "not_activated");
    assert.equal(result.relationshipKey, PERSON_RELATIONSHIP_KEY.BB_MEMBERSHIP);
    assert.equal(createdMembers.length, 1);
    assert.equal(auditLog.length, 1);
    assert.equal(
      auditLog[0].actionKey,
      SHARED_AUDIT_ACTION.STAFF_PERSON_WORKFLOW_COMPLETED
    );
    assert.equal(auditLog[0].metadata.person_id, PERSON_ID);
    assert.equal(auditLog[0].metadata.subject_ref, SUBJECT);
    assert.equal(auditLog[0].organizationId, ORG);
    assert.equal(auditLog[0].churchId, CHURCH);
    assert.equal(auditLog[0].branchId, BRANCH);
  });

  it("blocks BB duplicate Church ID without override", async () => {
    const adapter = createBlessBoardStaffMemberAdapter({
      authorize: async () => ({ allowed: true }),
    });
    adapter.loadDuplicateCandidates = async () => ({
      ok: true,
      candidates: [
        {
          id: SUBJECT,
          subjectRef: SUBJECT,
          organizationId: ORG,
          productCode: "blessboard",
          firstName: "Other",
          lastName: "Person",
          productIdentifiers: [
            { key: "member_number", valueNormalized: "BB-42" },
          ],
        },
      ],
    });
    adapter.createProductRelationship = async () => {
      throw new Error("must_not_create");
    };

    const result = await runStaffManagedPersonWorkflow(
      {},
      {
        adapter,
        trusted: {
          organizationId: ORG,
          churchId: CHURCH,
          branchId: BRANCH,
        },
        actor: { userId: "33333333-3333-4333-8333-333333333333" },
        demographics: { firstName: "Ada", lastName: "Lovelace" },
        product: { memberNumber: "BB-42" },
        hooks: makeHooks([]),
      }
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, STAFF_PERSON_WORKFLOW_CODE.DUPLICATE_BLOCKED);
    assert.equal(result.overallMatchCode, PERSON_MATCH_CODE.EXACT_IDENTIFIER_MATCH);
    assert.equal(result.action, PERSON_MATCH_ACTION.BLOCK);
  });

  it("runs AC adapter path and refuses clinical leakage", async () => {
    const auditLog = [];
    const adapter = createActiveClinicStaffPatientAdapter({
      registerActiveClinicPatient: async () => ({
        ok: true,
        patient: {
          id: SUBJECT,
          patientNumber: "AC-2026-000001",
          status: "active",
          platformIdentityId: null,
        },
      }),
    });
    // Bypass live auth/DB for orchestration unit test.
    adapter.authorize = async () => ({ ok: true });
    adapter.loadDuplicateCandidates = async () => ({ ok: true, candidates: [] });

    const clinical = await runStaffManagedPersonWorkflow(
      {},
      {
        adapter,
        trusted: { organizationId: ORG, facilityId: FACILITY },
        actor: { staffMemberId: "44444444-4444-4444-8444-444444444444" },
        demographics: { firstName: "James", lastName: "Banda" },
        product: {
          healthcareOrganizationId: HCO,
          diagnosis: "should-fail",
        },
        hooks: makeHooks(auditLog),
      }
    );
    assert.equal(clinical.ok, false);
    assert.equal(clinical.code, STAFF_PERSON_WORKFLOW_CODE.VALIDATION_FAILED);

    const ok = await runStaffManagedPersonWorkflow(
      {},
      {
        adapter,
        trusted: { organizationId: ORG, facilityId: FACILITY },
        actor: {
          staffMemberId: "44444444-4444-4444-8444-444444444444",
          platformIdentityId: "55555555-5555-4555-8555-555555555555",
        },
        demographics: {
          firstName: "James",
          lastName: "Banda",
          phoneNormalized: "+260972222222",
          dateOfBirth: "1988-01-01",
        },
        product: {
          healthcareOrganizationId: HCO,
          patientStatus: "active",
          portalAccessStatus: "none",
        },
        hooks: makeHooks(auditLog),
      }
    );
    assert.equal(ok.ok, true);
    assert.equal(ok.productIdentifier, "AC-2026-000001");
    assert.equal(ok.relationshipKey, PERSON_RELATIONSHIP_KEY.AC_PATIENT);
    assert.equal(ok.portalAccessStatus, "none");
    assert.equal(ok.location.healthcareOrganizationId, HCO);
    assert.equal(ok.location.facilityId, FACILITY);
    assert.equal(auditLog[0].facilityId, FACILITY);
    assert.equal(auditLog[0].metadata.portal_access_status, "none");
  });

  it("requires duplicate override for AC strong phone match", async () => {
    const adapter = createActiveClinicStaffPatientAdapter({
      registerActiveClinicPatient: async () => ({ ok: true, patient: { id: SUBJECT } }),
    });
    adapter.authorize = async () => ({ ok: true });
    adapter.loadDuplicateCandidates = async () => ({
      ok: true,
      candidates: [
        {
          id: SUBJECT,
          subjectRef: SUBJECT,
          organizationId: ORG,
          productCode: "activeclinic",
          firstName: "Other",
          lastName: "Person",
          phoneNormalized: "+260971234567",
        },
      ],
    });
    adapter.createProductRelationship = async () => {
      throw new Error("must_not_create");
    };

    const blocked = await runStaffManagedPersonWorkflow(
      {},
      {
        adapter,
        trusted: { organizationId: ORG, facilityId: FACILITY },
        actor: { staffMemberId: "44444444-4444-4444-8444-444444444444" },
        demographics: {
          firstName: "Ada",
          lastName: "Lovelace",
          phoneNormalized: "+260971234567",
        },
        product: { healthcareOrganizationId: HCO },
        hooks: makeHooks([]),
      }
    );
    assert.equal(blocked.ok, false);
    assert.equal(
      blocked.code,
      STAFF_PERSON_WORKFLOW_CODE.DUPLICATE_OVERRIDE_REQUIRED
    );
    assert.equal(
      blocked.overallMatchCode,
      PERSON_MATCH_CODE.STRONG_POSSIBLE_MATCH
    );
  });

  it("denies unauthorized actors before product create", async () => {
    const adapter = createBlessBoardStaffMemberAdapter({
      authorize: async () => ({ allowed: false, reasonCode: "RBAC_PERMISSION_DENIED" }),
    });
    adapter.createProductRelationship = async () => {
      throw new Error("must_not_create");
    };
    const result = await runStaffManagedPersonWorkflow(
      {},
      {
        adapter,
        trusted: {
          organizationId: ORG,
          churchId: CHURCH,
          branchId: BRANCH,
        },
        actor: { userId: "33333333-3333-4333-8333-333333333333" },
        demographics: { firstName: "Ada", lastName: "Lovelace" },
        product: {},
        hooks: makeHooks([]),
      }
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, STAFF_PERSON_WORKFLOW_CODE.UNAUTHORIZED);
  });
});

describe("V2.04 staff workflow registry wiring + migration", () => {
  beforeEach(() => clearProductRuntimeContracts());
  afterEach(() => clearProductRuntimeContracts());

  it("registers staffManagedWorkflow on person product adapters", () => {
    registerPersonProductAdapter("blessboard", {
      relationshipKeys: [PERSON_RELATIONSHIP_KEY.BB_MEMBERSHIP],
      defaultRelationshipKey: PERSON_RELATIONSHIP_KEY.BB_MEMBERSHIP,
      duplicatePolicy: BLESSBOARD_DUPLICATE_POLICY,
      staffManagedWorkflow: createBlessBoardStaffMemberAdapter({
        authorize: async () => ({ allowed: true }),
      }),
    });
    registerPersonProductAdapter("activeclinic", {
      relationshipKeys: [PERSON_RELATIONSHIP_KEY.AC_PATIENT],
      defaultRelationshipKey: PERSON_RELATIONSHIP_KEY.AC_PATIENT,
      duplicatePolicy: ACTIVECLINIC_DUPLICATE_POLICY,
      staffManagedWorkflow: createActiveClinicStaffPatientAdapter({
        registerActiveClinicPatient: async () => ({ ok: true }),
      }),
    });
    assert.ok(getPersonProductAdapter("blessboard").staffManagedWorkflow);
    assert.ok(getPersonProductAdapter("activeclinic").staffManagedWorkflow);
  });

  it("ships additive Church ID / member_number migration", () => {
    const sql = fs.readFileSync(
      path.join(
        __dirname,
        "../db/migrations/blessboard/119_member_number_church_id.sql"
      ),
      "utf8"
    );
    assert.match(sql, /ADD COLUMN IF NOT EXISTS member_number/);
    assert.doesNotMatch(sql, /DROP TABLE/);
  });

  it("platform workflow does not hard-require product packages", () => {
    const src = fs.readFileSync(
      path.join(
        __dirname,
        "../src/platform/person/workflow/staffPersonWorkflow.js"
      ),
      "utf8"
    );
    assert.doesNotMatch(src, /require\(["'][^"']*blessboard/);
    assert.doesNotMatch(src, /require\(["'][^"']*activeclinic/);
    assert.doesNotMatch(src, /require\(["'][^"']*\/church\//);
  });
});
