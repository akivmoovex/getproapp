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
  submitPlatformRegistration,
  listUnifiedRegistrations,
  isSelfRegistrationProvisioningEnabled,
} = require("../src/platform/registration");
const { ACTION: LIFECYCLE_AUDIT_ACTION } = require("../src/platform/registration/lifecycleAudit");
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
const { DEFAULT_DEPARTMENT_SPECS } = require("../src/activeclinic/services/activeClinicDepartmentService");
const { CODE_ACTIVECLINIC_ORG_V6 } = require("../src/platform/config/deploymentProfiles");
const {
  ENV_KEY: LEGACY_FLAG,
} = require("../src/blessboard/config/instantFreeProvisioningEnabled");
const {
  ENV_KEY: SHARED_FLAG,
} = require("../src/platform/registration/killSwitch");
const {
  DEFAULT_ZAMBIA_PROVINCE,
  DEFAULT_ZAMBIA_CITY,
} = require("./helpers/zambiaRegistrationFixtures");

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
    province: DEFAULT_ZAMBIA_PROVINCE,
    city: DEFAULT_ZAMBIA_CITY,
    address: "1 Independence Avenue",
    countryCode: "ZM",
    notes: "unified registration engine",
    password: "clinic-admin-pass-12",
    passwordConfirm: "clinic-admin-pass-12",
    acceptTerms: "on",
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

  it("5 shared duplicate checks soft-reuse a clinic twin and a church twin", async () => {
    if (!requireDb()) return;
    const payload = clinicPayload();
    const first = await submitAndProvisionClinicRegistration(pool, payload);
    assert.equal(first.ok, true, JSON.stringify(first));
    const second = await submitAndProvisionClinicRegistration(pool, payload);
    assert.equal(second.ok, true, JSON.stringify(second));
    assert.equal(second.organizationId, first.organizationId);
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
          AND action_key = ANY($2::text[])`,
      [
        clinic.organizationId,
        [
          LIFECYCLE_AUDIT_ACTION.PROVISIONING_COMPLETED,
          LIFECYCLE_AUDIT_ACTION.ORGANIZATION_CREATED,
          LIFECYCLE_AUDIT_ACTION.WEBSITE_INITIALIZED,
        ],
      ]
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

  it("12 ActiveClinic existing identity password-verifies via shared engine", async () => {
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
    const bcrypt = require("bcryptjs");
    await pool.query(`UPDATE platform.identities SET password_hash = $2 WHERE id = $1`, [
      identity.identity.id,
      await bcrypt.hash(payload.password, 12),
    ]);
    const provisioned = await submitProductRegistration(pool, {
      productCode: PRODUCT.ACTIVECLINIC,
      payload,
      env: {},
      dataEnvironment: "testing",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(provisioned.code, RESULT.ACTIVE, JSON.stringify(provisioned));
    assert.equal(provisioned.engine, ENGINE);
    assert.equal(provisioned.identityId, identity.identity.id);
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
    assert.equal(hq.rows[0].branch_key, "main-campus");
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

  it("19 clinic existing identity without password is rejected explicitly", async () => {
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
    assert.equal(held.ok, false, JSON.stringify(held));
    assert.equal(held.code, "existing_account_requires_sign_in");
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
    const held = await submitAndProvisionClinicRegistration(pool, {
      ...payload,
      env: { SELF_REGISTRATION_PROVISIONING_ENABLED: "false" },
    });
    assert.equal(held.ok, true, JSON.stringify(held));
    assert.equal(held.reviewRequired, true);
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

  it("23 duplicate clinic submission soft-reuses the same clinic", async () => {
    if (!requireDb()) return;
    const payload = clinicPayload();
    const first = await submitAndProvisionClinicRegistration(pool, payload);
    const second = await submitAndProvisionClinicRegistration(pool, payload);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true, JSON.stringify(second));
    assert.equal(second.organizationId, first.organizationId);
    const count = await pool.query(
      `SELECT count(*)::int AS n FROM activeclinic.clinic_registration_applications
        WHERE contact_email_normalized = $1`,
      [payload.contactEmail.toLowerCase()]
    );
    assert.equal(count.rows[0].n, 1);
  });

  it("24 cross-product existing identity password-verifies instead of review hold", async () => {
    if (!requireDb()) return;
    const payload = clinicPayload();
    const created = await createPlatformIdentity(pool, {
      status: "active",
      primaryEmail: payload.contactEmail,
      emailNormalized: payload.contactEmail,
      emailVerifiedAt: new Date().toISOString(),
      primaryPhone: payload.contactPhone,
      phoneNormalized: payload.contactPhone,
      phoneVerifiedAt: new Date().toISOString(),
    });
    assert.equal(created.ok, true);
    const bcrypt = require("bcryptjs");
    await pool.query(`UPDATE platform.identities SET password_hash = $2 WHERE id = $1`, [
      created.identity.id,
      await bcrypt.hash(payload.password, 12),
    ]);
    const provisioned = await submitProductRegistration(pool, {
      productCode: PRODUCT.ACTIVECLINIC,
      payload,
      env: {},
      dataEnvironment: "testing",
    });
    assert.equal(provisioned.engine, ENGINE);
    assert.equal(provisioned.code, RESULT.ACTIVE, JSON.stringify(provisioned));
    assert.equal(provisioned.identityId, created.identity.id);
  });

  it("25 provision hold does not leave a false-active organisation", async () => {
    if (!requireDb()) return;
    const payload = clinicPayload();
    const held = await submitAndProvisionClinicRegistration(pool, {
      ...payload,
      env: { SELF_REGISTRATION_PROVISIONING_ENABLED: "false" },
    });
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

  it("hardening 1: new ActiveClinic registration does not store pending_review", async () => {
    if (!requireDb()) return;
    const result = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    assert.equal(result.ok, true, JSON.stringify(result));
    const row = await pool.query(
      `SELECT status FROM activeclinic.clinic_registration_applications WHERE id = $1`,
      [result.application.id]
    );
    assert.equal(row.rows[0].status, "active");
    assert.notEqual(row.rows[0].status, "pending_review");
    assert.notEqual(row.rows[0].status, "approved");
  });

  it("hardening 2: new BlessBoard review hold does not store duplicate_review", async () => {
    if (!requireDb()) return;
    const held = await submitChurch(churchBody({ selected_plan: "network" }));
    const row = await pool.query(
      `SELECT application_status FROM blessboard.platform_church_registration_applications WHERE id = $1`,
      [held.application.id]
    );
    assert.equal(row.rows[0].application_status, "review_required");
    assert.notEqual(row.rows[0].application_status, "duplicate_review");
  });

  it("hardening 3: both products expose the same canonical state vocabulary", () => {
    assert.deepEqual(
      [LIFECYCLE.SUBMITTED, LIFECYCLE.PROVISIONING, LIFECYCLE.REVIEW_REQUIRED, LIFECYCLE.ACTIVE, LIFECYCLE.REJECTED, LIFECYCLE.SUSPENDED, LIFECYCLE.PROVISION_FAILED],
      ["submitted", "provisioning", "review_required", "active", "rejected", "suspended", "provision_failed"]
    );
  });

  it("hardening 4-5: legacy pending_review and duplicate_review still read as review_required", () => {
    assert.equal(
      toCanonicalLifecycle(PRODUCT.ACTIVECLINIC, { status: "pending_review" }),
      LIFECYCLE.REVIEW_REQUIRED
    );
    assert.equal(
      toCanonicalLifecycle(PRODUCT.BLESSBOARD, { application_status: "duplicate_review" }),
      LIFECYCLE.REVIEW_REQUIRED
    );
  });

  it("hardening 6-10: shared provisioning lifecycle, failure, and retry idempotency", async () => {
    const calls = [];
    const adapter = {
      productCode: "activeclinic",
      validate: async () => ({ ok: true, normalized: { name: "spy" } }),
      persistSubmitted: async () => ({
        ok: true,
        application: { id: "00000000-0000-4000-8000-000000000099" },
      }),
      collectReviewSignals: async () => ({}),
      provision: async () => {
        calls.push("provision");
        return { ok: false, reviewRequired: false, reason: "forced_failure" };
      },
      websiteDefaults: async () => {
        calls.push("websiteDefaults");
        return { skip: true };
      },
      markLifecycle: async (_db, input) => {
        calls.push(`lifecycle:${input.status}`);
      },
    };
    const failed = await submitPlatformRegistration(
      { query: async () => ({ rows: [] }) },
      { adapter, productCode: PRODUCT.ACTIVECLINIC, payload: {}, env: {} }
    );
    assert.equal(failed.engine, ENGINE);
    assert.equal(failed.code, RESULT.PROVISION_FAILED);
    assert.ok(calls.includes("lifecycle:provisioning"));
    assert.ok(calls.includes("provision"));
    assert.ok(calls.includes("lifecycle:provision_failed"));
    assert.ok(!calls.includes("lifecycle:active"));
    assert.ok(!calls.includes("websiteDefaults"));

    const successCalls = [];
    const successAdapter = {
      productCode: "blessboard",
      validate: async () => ({ ok: true, normalized: {} }),
      persistSubmitted: async () => ({
        ok: true,
        application: { id: "00000000-0000-4000-8000-000000000098" },
      }),
      collectReviewSignals: async () => ({}),
      provision: async () => {
        successCalls.push("provision");
        return {
          ok: true,
          organizationId: "00000000-0000-4000-8000-000000000097",
          identityId: "00000000-0000-4000-8000-000000000096",
        };
      },
      websiteDefaults: async () => {
        successCalls.push("websiteDefaults");
        return { skip: true, reason: "test_skip" };
      },
      markLifecycle: async (_db, input) => {
        successCalls.push(`lifecycle:${input.status}`);
      },
    };
    const succeeded = await submitPlatformRegistration(
      { query: async () => ({ rows: [] }) },
      { adapter: successAdapter, productCode: PRODUCT.BLESSBOARD, payload: {}, env: {} }
    );
    assert.equal(succeeded.engine, ENGINE);
    assert.equal(succeeded.code, RESULT.ACTIVE);
    assert.deepEqual(successCalls, [
      "lifecycle:provisioning",
      "provision",
      "websiteDefaults",
      "lifecycle:active",
    ]);
  });

  it("hardening 8-10: retry does not duplicate organisation, admin, or already-provisioned rows", async () => {
    if (!requireDb()) return;
    const payload = clinicPayload();
    const first = await submitAndProvisionClinicRegistration(pool, payload);
    assert.equal(first.ok, true, JSON.stringify(first));
    const orgId = first.organizationId;
    const identityId = first.identityId;
    const second = await submitAndProvisionClinicRegistration(pool, payload);
    assert.equal(second.ok, true, JSON.stringify(second));
    assert.equal(second.organizationId, orgId);
    const orgs = await pool.query(
      `SELECT count(*)::int AS n FROM platform.organizations WHERE id = $1`,
      [orgId]
    );
    assert.equal(orgs.rows[0].n, 1);
    if (identityId) {
      const identities = await pool.query(
        `SELECT count(*)::int AS n FROM platform.identities WHERE id = $1`,
        [identityId]
      );
      assert.equal(identities.rows[0].n, 1);
    }
    const again = await require("../src/activeclinic/services/approveClinicRegistrationService").approveAndProvisionClinicRegistration(
      pool,
      {
        applicationId: first.application.id,
        dataEnvironment: "testing",
        deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      }
    );
    assert.equal(again.ok, true, JSON.stringify(again));
    assert.equal(again.alreadyProvisioned || again.organizationId === orgId, true);
    const orgCount = await pool.query(
      `SELECT count(*)::int AS n FROM platform.organizations WHERE id = $1`,
      [orgId]
    );
    assert.equal(orgCount.rows[0].n, 1);
  });

  it("hardening 11-13: new clinic receives default departments and bootstrap is idempotent", async () => {
    if (!requireDb()) return;
    const result = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    assert.equal(result.ok, true, JSON.stringify(result));
    const depts = await pool.query(
      `SELECT department_key FROM activeclinic.departments WHERE organization_id = $1 ORDER BY department_key`,
      [result.organizationId]
    );
    const keys = depts.rows.map((row) => row.department_key);
    const expected = DEFAULT_DEPARTMENT_SPECS.map((spec) => spec.key).sort();
    assert.deepEqual(keys, expected);
    const { ensureDefaultDepartments } = require("../src/activeclinic/services/activeClinicDepartmentService");
    const again = await ensureDefaultDepartments(pool, {
      organizationId: result.organizationId,
      healthcareOrganizationId: result.healthcareOrganization.id,
      facilityId: result.facility.id,
    });
    assert.equal(again.ok, true);
    assert.equal(again.created, 0);
    const after = await pool.query(
      `SELECT count(*)::int AS n FROM activeclinic.departments WHERE organization_id = $1`,
      [result.organizationId]
    );
    assert.equal(after.rows[0].n, expected.length);
  });

  it("hardening 14-18: both products get one website draft from the shared lifecycle", async () => {
    if (!requireDb()) return;
    const clinic = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    const church = await submitChurch(churchBody());
    assert.equal(clinic.ok, true, JSON.stringify(clinic));
    assert.equal(church.ok, true, JSON.stringify(church));
    const clinicSites = await pool.query(
      `SELECT count(*)::int AS n FROM platform.website_instances WHERE organization_id = $1 AND product_code = 'activeclinic' AND status <> 'archived'`,
      [clinic.organizationId]
    );
    const churchSites = await pool.query(
      `SELECT count(*)::int AS n FROM platform.website_instances WHERE organization_id = $1 AND product_code = 'blessboard' AND status <> 'archived'`,
      [church.records.organizationId]
    );
    assert.equal(clinicSites.rows[0].n, 1);
    assert.equal(churchSites.rows[0].n, 1);
    const { initializeOrganizationWebsite } = require("../src/platform/registration");
    const acAdapter = require("../src/activeclinic/registration/activeClinicRegistrationAdapter");
    const bbAdapter = require("../src/blessboard/registration/blessboardChurchRegistrationAdapter");
    const clinicAgain = await initializeOrganizationWebsite(pool, {
      adapter: acAdapter,
      productCode: PRODUCT.ACTIVECLINIC,
      organizationId: clinic.organizationId,
      application: clinic.application,
      provision: clinic,
    });
    const churchAgain = await initializeOrganizationWebsite(pool, {
      adapter: bbAdapter,
      productCode: PRODUCT.BLESSBOARD,
      organizationId: church.records.organizationId,
      application: church.application,
      provision: church,
    });
    assert.equal(clinicAgain.existed, true);
    assert.equal(clinicAgain.created, false);
    assert.equal(churchAgain.existed, true);
    assert.equal(churchAgain.created, false);
    const clinicSites2 = await pool.query(
      `SELECT count(*)::int AS n FROM platform.website_instances WHERE organization_id = $1 AND product_code = 'activeclinic' AND status <> 'archived'`,
      [clinic.organizationId]
    );
    const churchSites2 = await pool.query(
      `SELECT count(*)::int AS n FROM platform.website_instances WHERE organization_id = $1 AND product_code = 'blessboard' AND status <> 'archived'`,
      [church.records.organizationId]
    );
    assert.equal(clinicSites2.rows[0].n, 1);
    assert.equal(churchSites2.rows[0].n, 1);
  });

  it("hardening 19-20: both products use the shared kill switch; BlessBoard alias is not another engine", async () => {
    if (!requireDb()) return;
    const clinic = await submitProductRegistration(pool, {
      productCode: PRODUCT.ACTIVECLINIC,
      payload: clinicPayload(),
      env: { [SHARED_FLAG]: "0" },
      dataEnvironment: "testing",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(clinic.engine, ENGINE);
    assert.equal(clinic.code, RESULT.REVIEW_REQUIRED);
    const clinicRow = await pool.query(
      `SELECT status FROM activeclinic.clinic_registration_applications WHERE id = $1`,
      [clinic.application.id]
    );
    assert.equal(clinicRow.rows[0].status, "review_required");

    const church = await submitChurch(churchBody(), { [LEGACY_FLAG]: "0", PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging" });
    assert.equal(church.engine, ENGINE);
    const churchRow = await pool.query(
      `SELECT application_status FROM blessboard.platform_church_registration_applications WHERE id = $1`,
      [church.application.id]
    );
    assert.equal(churchRow.rows[0].application_status, "review_required");
  });

  it("hardening 21-23: unified queue shows canonical state for new and legacy rows", async () => {
    if (!requireDb()) return;
    const clinic = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    const church = await submitChurch(churchBody({ selected_plan: "network" }));
    await pool.query(
      `UPDATE activeclinic.clinic_registration_applications SET status = 'pending_review' WHERE id = $1`,
      [clinic.application.id]
    );
    await pool.query(
      `UPDATE blessboard.platform_church_registration_applications SET application_status = 'duplicate_review' WHERE id = $1`,
      [church.application.id]
    );
    const held = await listUnifiedRegistrations(pool, { lifecycle: "review_required", limit: 200 });
    const clinicHeld = held.find((row) => row.id === clinic.application.id);
    const churchHeld = held.find((row) => row.id === church.application.id);
    assert.ok(clinicHeld);
    assert.ok(churchHeld);
    assert.equal(clinicHeld.canonicalLifecycle, LIFECYCLE.REVIEW_REQUIRED);
    assert.equal(churchHeld.canonicalLifecycle, LIFECYCLE.REVIEW_REQUIRED);
    assert.equal(clinicHeld.storedStatus, "pending_review");
    assert.equal(churchHeld.storedStatus, "duplicate_review");
  });

  it("architecture: HTTP wrappers invoke the shared orchestrator, not an independent provisioner", async () => {
    const clinicSrc = require("node:fs").readFileSync(
      require("node:path").join(__dirname, "../src/activeclinic/http/activeClinicPublicRoutes.js"),
      "utf8"
    );
    const churchSrc = require("node:fs").readFileSync(
      require("node:path").join(__dirname, "../src/blessboard/http/apexMarketingRoutes.js"),
      "utf8"
    );
    assert.match(clinicSrc, /submitAndProvisionClinicRegistration/);
    assert.doesNotMatch(clinicSrc, /approveAndProvisionClinicRegistration\(/);
    assert.match(churchSrc, /submitChurchRegistration/);
    assert.doesNotMatch(churchSrc, /provisionRegisteredBlessBoardChurch\(/);
    const calls = [];
    const adapter = {
      validate: async () => {
        calls.push("validate");
        return { ok: false, error: "spy-stop" };
      },
      persistSubmitted: async () => {
        calls.push("persist");
        return { ok: true };
      },
      provision: async () => {
        calls.push("provision");
        return { ok: true };
      },
    };
    const result = await submitPlatformRegistration(
      { query: async () => ({ rows: [] }) },
      { adapter, payload: {}, env: {} }
    );
    assert.equal(result.engine, ENGINE);
    assert.deepEqual(calls, ["validate"]);
  });
});
