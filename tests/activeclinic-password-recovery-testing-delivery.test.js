"use strict";

/**
 * ActiveClinic public password recovery — testing delivery outbox + one-time reset.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const {
  provisionPlatformTenant,
} = require("../src/platform/services/provisionPlatformTenant");
const {
  createPlatformIdentity,
} = require("../src/platform/services/platformIdentityService");
const {
  setPlatformIdentityPassword,
  verifyPlatformIdentityPassword,
} = require("../src/platform/services/platformIdentityCredentialService");
const {
  createHealthcareOrganization,
} = require("../src/activeclinic/services/healthcareOrganizationService");
const {
  createStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  requestActiveClinicPasswordReset,
  completeActiveClinicPasswordReset,
  lookupTestingPasswordResetDelivery,
  previewResetToken,
  NEUTRAL_MESSAGE,
} = require("../src/activeclinic/services/activeClinicPasswordRecoveryService");
const {
  clearTestingDeliveries,
} = require("../src/activeclinic/services/activeClinicTestingDeliveryOutbox");
const { DELIVERY } = require("../src/activeclinic/services/activeClinicShareLinks");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../src/platform/config/deploymentProfiles");

const PASSWORD = "GpQa!AcRecover9A";
const NEW_PASSWORD = "GpQa!AcRecover9B";
const TEST_ENV = {
  DEPLOYMENT_ENV: "testing",
  DATABASE_IDENTITY_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
  NODE_ENV: "test",
};

let pool = null;
let databaseUrl = null;
let skipReason = null;
let phoneSeq = 0;

function nextPhone() {
  phoneSeq += 1;
  return `+26097${String(1000000 + (Date.now() % 1000000) + phoneSeq).slice(-7)}`;
}

async function seedTenant(stamp) {
  const tenant = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `ac_pwrec_${stamp}`,
    displayName: `AC PW Rec ${stamp}`,
    productKey: "activeclinic",
    productTenantKey: `pwrec-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(tenant.ok, true, JSON.stringify(tenant));
  const hco = await createHealthcareOrganization(pool, {
    organizationId: tenant.records.organization.id,
    legalName: "Legal PW Rec",
    publicName: `Clinic ${stamp}`,
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true, JSON.stringify(hco));
  return {
    orgId: tenant.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
  };
}

describe("activeclinic password recovery testing delivery", () => {
  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    clearTestingDeliveries();
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipReason) {
      assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
    }
  }

  it("creates token, stores testing outbox URL on QA host, completes reset, rejects reuse and old password", async () => {
    requireDb();
    clearTestingDeliveries();
    const stamp = Date.now().toString(36);
    const ac = await seedTenant(stamp);
    const email = `recover.${stamp}@example.test`;
    const phone = nextPhone();

    const identity = await createPlatformIdentity(pool, {
      emailNormalized: email,
      primaryEmail: email,
      phoneNormalized: phone,
      primaryPhone: phone,
      emailVerifiedAt: new Date().toISOString(),
      phoneVerifiedAt: new Date().toISOString(),
      status: "active",
    });
    assert.equal(identity.ok, true, JSON.stringify(identity));
    await setPlatformIdentityPassword(pool, {
      identityId: identity.identity.id,
      password: PASSWORD,
    });

    const staff = await createStaffMember(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      firstName: "Reset",
      lastName: "User",
      employmentType: "permanent",
      email,
      phone,
      status: "active",
      platformIdentityId: identity.identity.id,
    });
    assert.equal(staff.ok, true, JSON.stringify(staff));

    const forgot = await requestActiveClinicPasswordReset(pool, {
      identifier: email,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      env: TEST_ENV,
      requestIp: "127.0.0.1",
    });
    assert.equal(forgot.ok, true);
    assert.equal(forgot.message, NEUTRAL_MESSAGE);
    assert.ok(
      forgot.deliveryStatus === DELIVERY.LINK_GENERATED ||
        forgot.deliveryStatus === DELIVERY.QUEUED,
      forgot.deliveryStatus
    );
    assert.equal(forgot.resetUrl, undefined);

    const delivery = await lookupTestingPasswordResetDelivery(pool, {
      identifier: email,
      env: TEST_ENV,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(delivery.ok, true, JSON.stringify(delivery));
    assert.match(
      delivery.resetUrl,
      /^https:\/\/activeclinic\.pronline\.org\/reset-password\//
    );

    const rawToken = decodeURIComponent(delivery.resetUrl.split("/reset-password/")[1]);
    assert.ok(rawToken);

    const preview = await previewResetToken(pool, {
      rawToken,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(preview.ok, true);

    const completed = await completeActiveClinicPasswordReset(pool, {
      rawToken,
      password: NEW_PASSWORD,
      passwordConfirm: NEW_PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(completed.ok, true, JSON.stringify(completed));

    const oldPw = await verifyPlatformIdentityPassword(pool, {
      identityId: identity.identity.id,
      password: PASSWORD,
    });
    assert.equal(oldPw.ok, false);

    const newPw = await verifyPlatformIdentityPassword(pool, {
      identityId: identity.identity.id,
      password: NEW_PASSWORD,
    });
    assert.equal(newPw.ok, true);

    const reuse = await completeActiveClinicPasswordReset(pool, {
      rawToken,
      password: "GpQa!AcRecover9C",
      passwordConfirm: "GpQa!AcRecover9C",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(reuse.ok, false);
    assert.ok(
      ["consumed", "revoked", "invalid_token", "expired"].includes(reuse.code),
      reuse.code
    );
  });

  it("unknown identifier stays enumeration-safe", async () => {
    requireDb();
    const unknown = await requestActiveClinicPasswordReset(pool, {
      identifier: `nobody.${Date.now()}@example.test`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      env: TEST_ENV,
    });
    assert.equal(unknown.ok, true);
    assert.equal(unknown.message, NEUTRAL_MESSAGE);
  });

  it("production env refuses testing delivery lookup", async () => {
    requireDb();
    const blocked = await lookupTestingPasswordResetDelivery(pool, {
      identifier: "anyone@example.test",
      env: {
        DEPLOYMENT_ENV: "production",
        DATABASE_IDENTITY_ENV: "production",
      },
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, "refused_non_testing_environment");
  });
});
