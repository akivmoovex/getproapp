"use strict";

/**
 * V7 unified platform registration engine.
 * Proves both products use the same orchestrator, lifecycle, review policy,
 * and normalized results. Product adapters own facility/HQ records only.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const {
  PRODUCT,
  ENGINE,
  RESULT,
  LIFECYCLE,
  REVIEW_REASON,
  decideReview,
  toCanonicalLifecycle,
  submitProductRegistration,
  listUnifiedRegistrations,
  isSelfRegistrationProvisioningEnabled,
} = require("../src/platform/registration");
const {
  submitAndProvisionClinicRegistration,
} = require("../src/activeclinic/services/submitClinicRegistrationService");
const {
  rejectClinicRegistration,
} = require("../src/activeclinic/services/approveClinicRegistrationService");
const {
  submitChurchRegistration,
  submitInstantFreeChurchRegistration,
  submitPlatformChurchRegistration,
} = require("../src/blessboard/services/platformChurchRegistrationService");
const {
  validatePlatformChurchRegistration,
} = require("../src/blessboard/services/platformChurchRegistrationValidation");
const {
  createPlatformIdentity,
} = require("../src/platform/services/platformIdentityService");
const { ORGANIZATION_ADMIN } = require("../src/activeclinic/services/activeClinicAuthorizationService");
const { CODE_ACTIVECLINIC_ORG_V6 } = require("../src/platform/config/deploymentProfiles");
const {
  ENV_KEY: LEGACY_FLAG,
} = require("../src/blessboard/config/instantFreeProvisioningEnabled");
const {
  ENV_KEY: SHARED_FLAG,
} = require("../src/platform/registration/killSwitch");

const PASSWORD = "TestPassword99!";
const IDENTITY_KEY = "blessboard-platform-v5";
let pool;
let skipReason = null;
let stamp = 0;
let phoneSeq = 970000000;
let ipSeq = 40;

function requireDb() {
  if (skipReason) {
    // eslint-disable-next-line no-console
    console.log("skip:", skipReason);
    return false;
  }
  return true;
}

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function clinicPayload(overrides) {
  stamp += 1;
  return {
    clinicName: `URE Clinic ${stamp}`,
    contactName: "Clinic Administrator",
    contactEmail: `ure-clinic-${stamp}@example.invalid`,
    contactPhone: nextPhone(),
    province: "Lusaka Province",
    city: "Lusaka",
    address: "1 Independence Avenue",
    countryCode: "ZM",
    notes: "unified registration engine",
    password: "clinic-admin-pass-12",
    passwordConfirm: "clinic-admin-pass-12",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    dataEnvironment: "testing",
    env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    ...overrides,
  };
}

function churchBody(overrides) {
  stamp += 1;
  const key = `urech${stamp}${crypto.randomBytes(3).toString("hex")}`;
  return {
    church_name: `URE Church ${stamp} ${key}`,
    country: "Zambia",
    city: "Lusaka",
    contact_name: "Church Administrator",
    role_in_church: "Pastor",
    phone: nextPhone(),
    email: `${key}@example.org`,
    selected_plan: "foundation",
    organization_key: key,
    password: PASSWORD,
    password_confirm: PASSWORD,
    branch_name: "HQ Campus",
    consent_contact: "on",
    ...overrides,
  };
}

function fakeReq() {
  ipSeq += 1;
  return {
    ip: `203.0.113.${ipSeq % 250}`,
    requestId: `ure-${Date.now()}-${ipSeq}`,
    get: () => "ure-test-agent",
  };
}

async function submitChurch(body, env) {
  const validation = validatePlatformChurchRegistration(body, { instantFreeEnabled: true });
  assert.equal(validation.ok, true, JSON.stringify(validation));
  return submitChurchRegistration(pool, fakeReq(), validation, {
    env: env || { PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging" },
    dataEnvironment: "testing",
    deploymentCode: "blessboard-org-staging",
  });
}

describe("V7 unified registration engine", () => {
  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });
    } catch (err) {
      skipReason = err && err.message ? String(err.message).slice(0, 240) : "no foundation db";
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("1 ActiveClinic registration invokes the shared platform orchestrator", async () => {
    if (!requireDb()) return;
    const result = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.engine, ENGINE);
    assert.equal(result.reviewRequired, false);
    assert.ok(result.organizationId);
  });

  it("2 BlessBoard registration invokes the same shared orchestrator", async () => {
    if (!requireDb()) return;
    const result = await submitChurch(churchBody());
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.engine, ENGINE);
    assert.ok(result.records && result.records.organizationId);
  });

  it("3 both products use the same canonical lifecycle vocabulary", () => {
    assert.equal(
      toCanonicalLifecycle(PRODUCT.ACTIVECLINIC, { status: "review_required" }),
      LIFECYCLE.REVIEW_REQUIRED
    );
    assert.equal(
      toCanonicalLifecycle(PRODUCT.ACTIVECLINIC, { status: "pending_review" }),
      LIFECYCLE.REVIEW_REQUIRED
    );
    assert.equal(
      toCanonicalLifecycle(PRODUCT.BLESSBOARD, { application_status: "duplicate_review" }),
      LIFECYCLE.REVIEW_REQUIRED
    );
    assert.equal(
      toCanonicalLifecycle(PRODUCT.BLESSBOARD, { application_status: "review_required" }),
      LIFECYCLE.REVIEW_REQUIRED
    );
    assert.equal(
      toCanonicalLifecycle(PRODUCT.ACTIVECLINIC, {
        status: "approved",
        provisioning_status: "provisioned",
      }),
      LIFECYCLE.ACTIVE
    );
    assert.equal(
      toCanonicalLifecycle(PRODUCT.BLESSBOARD, {
        application_status: "closed",
        provisioning_status: "provisioned",
        organization_id: "00000000-0000-4000-8000-000000000001",
      }),
      LIFECYCLE.ACTIVE
    );
  });

  it("4 shared identity normalization is reused (email/phone on both payloads)", async () => {
    if (!requireDb()) return;
    const clinic = await submitAndProvisionClinicRegistration(
      pool,
      clinicPayload({ contactEmail: "  Clinic.Norm@Example.INVALID  " })
    );
    assert.equal(clinic.ok, true, JSON.stringify(clinic));
    const stored = await pool.query(
      `SELECT contact_email_normalized FROM activeclinic.clinic_registration_applications WHERE id = $1`,
      [clinic.application.id]
    );
    assert.equal(stored.rows[0].contact_email_normalized, "clinic.norm@example.invalid");

    const church = await submitChurch(churchBody({ email: "  Church.Norm@Example.ORG  " }));
    assert.equal(church.ok, true, JSON.stringify(church));
    const churchRow = await pool.query(
      `SELECT lower(contact_email) AS email
         FROM blessboard.platform_church_registration_applications
        WHERE id = $1`,
      [church.application.id]
    );
    assert.equal(churchRow.rows[0].email, "church.norm@example.org");
  });

  it("5 shared duplicate checks reject a second clinic and reuse a church twin", async () => {
    if (!requireDb()) return;
    const payload = clinicPayload();
    const first = await submitAndProvisionClinicRegistration(pool, payload);
    assert.equal(first.ok, true, JSON.stringify(first));
    const second = await submitAndProvisionClinicRegistration(pool, payload);
    assert.equal(second.ok, false);
    assert.equal(second.code, "duplicate_application");
    assert.equal(second.engine, ENGINE);

    const body = churchBody();
    const churchFirst = await submitChurch(body);
    assert.equal(churchFirst.ok, true, JSON.stringify(churchFirst));
    const churchSecond = await submitChurch(body);
    assert.equal(churchSecond.engine, ENGINE);
    assert.ok(churchSecond.alreadyProvisioned || churchSecond.ok || churchSecond.review);
  });

  it("6 shared review decision handling is product-agnostic", () => {
    const collision = decideReview({
      signals: { identityCollision: true, provisioningEnabled: true },
    });
    const network = decideReview({
      signals: { networkPlan: true, provisioningEnabled: true },
    });
    const normal = decideReview({ signals: { provisioningEnabled: true } });
    assert.equal(collision.reviewRequired, true);
    assert.equal(collision.reason, REVIEW_REASON.IDENTITY_COLLISION);
    assert.equal(network.reason, REVIEW_REASON.NETWORK_PLAN_MANUAL_REVIEW);
    assert.equal(normal.autoProvision, true);
    assert.equal(normal.reviewRequired, false);
  });

  it("7 shared audit is recorded after successful organisation provisioning", async () => {
    if (!requireDb()) return;
    const clinic = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    assert.equal(clinic.ok, true, JSON.stringify(clinic));
    const audit = await pool.query(
      `SELECT count(*)::int AS n
         FROM platform.audit_events
        WHERE organization_id = $1
          AND action_key = 'registration.lifecycle'`,
      [clinic.organizationId]
    );
    assert.ok(audit.rows[0].n >= 1);
  });

  it("8 both produce normalized ACTIVE / REVIEW_REQUIRED results", async () => {
    if (!requireDb()) return;
    const clinic = await submitProductRegistration(pool, {
      productCode: PRODUCT.ACTIVECLINIC,
      payload: clinicPayload(),
      env: {},
      dataEnvironment: "testing",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(clinic.code, RESULT.ACTIVE);
    assert.equal(clinic.canonicalLifecycle, LIFECYCLE.ACTIVE);
    assert.equal(clinic.engine, ENGINE);

    const body = churchBody();
    const validation = validatePlatformChurchRegistration(body, { instantFreeEnabled: true });
    const church = await submitProductRegistration(pool, {
      productCode: PRODUCT.BLESSBOARD,
      payload: { ...validation.data, data: validation.data, req: fakeReq() },
      env: {},
      dataEnvironment: "testing",
      deploymentCode: "blessboard-org-staging",
    });
    assert.equal(church.code, RESULT.ACTIVE);
    assert.equal(church.canonicalLifecycle, LIFECYCLE.ACTIVE);
    assert.equal(church.engine, ENGINE);
  });

  it("9 ActiveClinic adapter creates a primary facility", async () => {
    if (!requireDb()) return;
    const result = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    const facilities = await pool.query(
      `SELECT count(*)::int AS n FROM activeclinic.facilities WHERE organization_id = $1 AND is_primary = true`,
      [result.organizationId]
    );
    assert.equal(facilities.rows[0].n, 1);
  });

  it("10 ActiveClinic adapter creates clinic healthcare-organisation defaults", async () => {
    if (!requireDb()) return;
    const result = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    const hco = await pool.query(
      `SELECT count(*)::int AS n FROM activeclinic.healthcare_organizations WHERE organization_id = $1`,
      [result.organizationId]
    );
    assert.equal(hco.rows[0].n, 1);
  });

  it("11 ActiveClinic adapter creates membership and organisation-admin access", async () => {
    if (!requireDb()) return;
    const result = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    const assignment = await pool.query(
      `SELECT count(*)::int AS n
         FROM activeclinic.staff_facility_assignments
        WHERE organization_id = $1 AND staff_member_id = $2`,
      [result.organizationId, result.staffMemberId]
    );
    assert.equal(assignment.rows[0].n, 1);
    const role = await pool.query(
      `SELECT r.role_key
         FROM activeclinic.staff_role_assignments a
         JOIN blessboard.roles r ON r.id = a.role_id
        WHERE a.organization_id = $1 AND a.staff_member_id = $2`,
      [result.organizationId, result.staffMemberId]
    );
    assert.ok(role.rows.some((row) => row.role_key === ORGANIZATION_ADMIN));
  });

  it("12 ActiveClinic duplicate/identity decisions are made by the shared engine", async () => {
    if (!requireDb()) return;
    const payload = clinicPayload();
    const identity = await createPlatformIdentity(pool, {
      status: "active",
      primaryEmail: payload.contactEmail,
      emailNormalized: payload.contactEmail,
      emailVerifiedAt: new Date().toISOString(),
      primaryPhone: payload.contactPhone,
      phoneNormalized: payload.contactPhone,
      phoneVerifiedAt: new Date().toISOString(),
    });
    assert.equal(identity.ok, true, JSON.stringify(identity));
    const held = await submitProductRegistration(pool, {
      productCode: PRODUCT.ACTIVECLINIC,
      payload,
      env: {},
      dataEnvironment: "testing",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(held.code, RESULT.REVIEW_REQUIRED);
    assert.equal(held.engine, ENGINE);
    assert.equal(held.canonicalLifecycle, LIFECYCLE.REVIEW_REQUIRED);
  });

  it("13 BlessBoard adapter creates HQ", async () => {
    if (!requireDb()) return;
    const body = churchBody({ branch_name: "Main Campus" });
    const result = await submitChurch(body);
    assert.equal(result.ok, true, JSON.stringify(result));
    const hq = await pool.query(
      `SELECT b.branch_key, b.branch_type, b.is_primary
         FROM blessboard.branches b
         JOIN blessboard.churches c ON c.id = b.church_id
        WHERE c.organization_id = $1`,
      [result.records.organizationId]
    );
    assert.equal(hq.rowCount, 1);
    assert.equal(hq.rows[0].branch_key, "hq");
    assert.equal(hq.rows[0].branch_type, "hq");
    assert.equal(hq.rows[0].is_primary, true);
  });

  it("14 BlessBoard adapter creates required church defaults", async () => {
    if (!requireDb()) return;
    const result = await submitChurch(churchBody());
    const orgId = result.records.organizationId;
    const church = await pool.query(
      `SELECT count(*)::int AS n FROM blessboard.churches WHERE organization_id = $1`,
      [orgId]
    );
    assert.equal(church.rows[0].n, 1);
    const onboarding = await pool.query(
      `SELECT count(*)::int AS n FROM blessboard.organization_onboarding WHERE organization_id = $1`,
      [orgId]
    );
    assert.equal(onboarding.rows[0].n, 1);
  });

  it("15 BlessBoard adapter creates administrator membership/access", async () => {
    if (!requireDb()) return;
    const result = await submitChurch(churchBody());
    assert.ok(result.records.administratorUserId);
    const user = await pool.query(`SELECT count(*)::int AS n FROM blessboard.users WHERE id = $1`, [
      result.records.administratorUserId,
    ]);
    assert.equal(user.rows[0].n, 1);
  });

  it("16 BlessBoard entrypoints share the engine rather than a second provisioning workflow", async () => {
    if (!requireDb()) return;
    const instant = await submitInstantFreeChurchRegistration(
      pool,
      fakeReq(),
      validatePlatformChurchRegistration(churchBody(), { instantFreeEnabled: true }),
      { env: { PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging" }, dataEnvironment: "testing", deploymentCode: "blessboard-org-staging" }
    );
    const enquiry = await submitPlatformChurchRegistration(
      pool,
      fakeReq(),
      validatePlatformChurchRegistration(churchBody({ password: undefined, password_confirm: undefined, organization_key: undefined }), {
        instantFreeEnabled: false,
      })
    );
    assert.equal(instant.engine, ENGINE);
    assert.equal(enquiry.engine, ENGINE);
  });

  it("17 normal clinic auto-provisions", async () => {
    if (!requireDb()) return;
    const result = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    assert.equal(result.reviewRequired, false);
    const org = await pool.query(`SELECT status FROM platform.organizations WHERE id = $1`, [
      result.organizationId,
    ]);
    assert.equal(org.rows[0].status, "active");
  });

  it("18 normal church auto-provisions", async () => {
    if (!requireDb()) return;
    const result = await submitChurch(churchBody());
    assert.equal(result.ok, true, JSON.stringify(result));
    const org = await pool.query(`SELECT status FROM platform.organizations WHERE id = $1`, [
      result.records.organizationId,
    ]);
    assert.equal(org.rows[0].status, "active");
  });

  it("19 clinic exception enters review_required", async () => {
    if (!requireDb()) return;
    const payload = clinicPayload();
    await createPlatformIdentity(pool, {
      status: "active",
      primaryEmail: payload.contactEmail,
      emailNormalized: payload.contactEmail,
      emailVerifiedAt: new Date().toISOString(),
      primaryPhone: payload.contactPhone,
      phoneNormalized: payload.contactPhone,
      phoneVerifiedAt: new Date().toISOString(),
    });
    const held = await submitAndProvisionClinicRegistration(pool, payload);
    assert.equal(held.ok, true);
    assert.equal(held.reviewRequired, true);
    assert.equal(held.application.status, "review_required");
    assert.equal(held.engine, ENGINE);
  });

  it("20 church exception enters review_required", async () => {
    if (!requireDb()) return;
    const held = await submitChurch(churchBody({ selected_plan: "network" }));
    assert.equal(held.engine, ENGINE);
    assert.equal(held.networkSupportContact, true);
    const row = await pool.query(
      `SELECT application_status FROM blessboard.platform_church_registration_applications WHERE id = $1`,
      [held.application.id]
    );
    assert.equal(
      toCanonicalLifecycle(PRODUCT.BLESSBOARD, row.rows[0]),
      LIFECYCLE.REVIEW_REQUIRED
    );
  });

  it("21 PA can reject an ActiveClinic review-required registration", async () => {
    if (!requireDb()) return;
    const payload = clinicPayload();
    await createPlatformIdentity(pool, {
      status: "active",
      primaryEmail: payload.contactEmail,
      emailNormalized: payload.contactEmail,
      emailVerifiedAt: new Date().toISOString(),
      primaryPhone: payload.contactPhone,
      phoneNormalized: payload.contactPhone,
      phoneVerifiedAt: new Date().toISOString(),
    });
    const held = await submitAndProvisionClinicRegistration(pool, payload);
    const rejected = await rejectClinicRegistration(pool, {
      applicationId: held.application.id,
      rejectionReason: "Identity requires a manual decision.",
      actorIdentityId: null,
    });
    assert.equal(rejected.ok, true, JSON.stringify(rejected));
    const row = await pool.query(
      `SELECT status FROM activeclinic.clinic_registration_applications WHERE id = $1`,
      [held.application.id]
    );
    assert.equal(row.rows[0].status, "rejected");
    assert.equal(
      toCanonicalLifecycle(PRODUCT.ACTIVECLINIC, row.rows[0]),
      LIFECYCLE.REJECTED
    );
  });

  it("22 Network and kill-switch holds use the same review lifecycle", () => {
    const network = decideReview({
      productCode: PRODUCT.BLESSBOARD,
      signals: { networkPlan: true, provisioningEnabled: true },
    });
    const kill = decideReview({
      productCode: PRODUCT.ACTIVECLINIC,
      signals: { provisioningEnabled: false },
    });
    assert.equal(network.reviewRequired, true);
    assert.equal(kill.reviewRequired, true);
    assert.equal(kill.reason, REVIEW_REASON.SELF_REGISTRATION_PROVISIONING_DISABLED);
  });

  it("23 duplicate clinic submission is safely rejected", async () => {
    if (!requireDb()) return;
    const payload = clinicPayload();
    const first = await submitAndProvisionClinicRegistration(pool, payload);
    const second = await submitAndProvisionClinicRegistration(pool, payload);
    assert.equal(first.ok, true);
    assert.equal(second.ok, false);
    assert.equal(second.code, "duplicate_application");
    const count = await pool.query(
      `SELECT count(*)::int AS n FROM activeclinic.clinic_registration_applications
        WHERE contact_email_normalized = $1`,
      [payload.contactEmail.toLowerCase()]
    );
    assert.equal(count.rows[0].n, 1);
  });

  it("24 cross-product identity uses shared review policy rather than a second engine", async () => {
    if (!requireDb()) return;
    const payload = clinicPayload();
    await createPlatformIdentity(pool, {
      status: "active",
      primaryEmail: payload.contactEmail,
      emailNormalized: payload.contactEmail,
      emailVerifiedAt: new Date().toISOString(),
      primaryPhone: payload.contactPhone,
      phoneNormalized: payload.contactPhone,
      phoneVerifiedAt: new Date().toISOString(),
    });
    const held = await submitProductRegistration(pool, {
      productCode: PRODUCT.ACTIVECLINIC,
      payload,
      env: {},
      dataEnvironment: "testing",
    });
    assert.equal(held.engine, ENGINE);
    assert.equal(held.code, RESULT.REVIEW_REQUIRED);
    assert.ok(
      held.reason === REVIEW_REASON.IDENTITY_COLLISION ||
        held.reason === REVIEW_REASON.EXISTING_IDENTITY_ACK_REQUIRED
    );
  });

  it("25 provision hold does not leave a false-active organisation", async () => {
    if (!requireDb()) return;
    const payload = clinicPayload();
    await createPlatformIdentity(pool, {
      status: "active",
      primaryEmail: payload.contactEmail,
      emailNormalized: payload.contactEmail,
      emailVerifiedAt: new Date().toISOString(),
      primaryPhone: payload.contactPhone,
      phoneNormalized: payload.contactPhone,
      phoneVerifiedAt: new Date().toISOString(),
    });
    const held = await submitAndProvisionClinicRegistration(pool, payload);
    assert.equal(held.reviewRequired, true);
    const app = await pool.query(
      `SELECT organization_id, status FROM activeclinic.clinic_registration_applications WHERE id = $1`,
      [held.application.id]
    );
    assert.equal(app.rows[0].status, "review_required");
    assert.equal(app.rows[0].organization_id, null);
  });

  it("26 existing provisioned organisations are not recreated", async () => {
    if (!requireDb()) return;
    const body = churchBody();
    const first = await submitChurch(body);
    assert.equal(first.ok, true, JSON.stringify(first));
    const orgId = first.records.organizationId;
    const second = await submitChurch(body);
    const orgs = await pool.query(
      `SELECT count(*)::int AS n FROM platform.organizations WHERE id = $1`,
      [orgId]
    );
    assert.equal(orgs.rows[0].n, 1);
    if (second.ok && second.records && second.records.organizationId) {
      assert.equal(second.records.organizationId, orgId);
    }
  });

  it("27 tenant isolation remains intact after mixed-product registration", async () => {
    if (!requireDb()) return;
    const clinic = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    const church = await submitChurch(churchBody());
    const clinicFacilities = await pool.query(
      `SELECT count(*)::int AS n FROM activeclinic.facilities WHERE organization_id = $1`,
      [church.records.organizationId]
    );
    const churchOnClinic = await pool.query(
      `SELECT count(*)::int AS n FROM blessboard.churches WHERE organization_id = $1`,
      [clinic.organizationId]
    );
    assert.equal(clinicFacilities.rows[0].n, 0);
    assert.equal(churchOnClinic.rows[0].n, 0);
  });

  it("architecture: kill switch is shared and no longer selects a BlessBoard-only engine", () => {
    assert.equal(isSelfRegistrationProvisioningEnabled({}), true);
    assert.equal(isSelfRegistrationProvisioningEnabled({ [LEGACY_FLAG]: "0" }), false);
    assert.equal(isSelfRegistrationProvisioningEnabled({ [SHARED_FLAG]: "0" }), false);
    assert.equal(isSelfRegistrationProvisioningEnabled({ [SHARED_FLAG]: "1", [LEGACY_FLAG]: "0" }), true);
  });

  it("architecture: unified PA queue exposes both products with canonical state", async () => {
    if (!requireDb()) return;
    const clinic = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    const church = await submitChurch(churchBody());
    const rows = await listUnifiedRegistrations(pool, { product: "all", limit: 100 });
    const clinicRow = rows.find((row) => row.id === clinic.application.id);
    const churchRow = rows.find((row) => row.id === church.application.id);
    assert.ok(clinicRow);
    assert.ok(churchRow);
    assert.equal(clinicRow.productCode, PRODUCT.ACTIVECLINIC);
    assert.equal(churchRow.productCode, PRODUCT.BLESSBOARD);
    assert.equal(clinicRow.canonicalLifecycle, LIFECYCLE.ACTIVE);
    assert.equal(churchRow.canonicalLifecycle, LIFECYCLE.ACTIVE);
  });
});
