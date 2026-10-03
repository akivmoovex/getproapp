"use strict";

/**
 * V2.06 — Password recovery restore (BlessBoard + ActiveClinic).
 * Testing delivery outbox + mocked capture; no live SMS/email.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const bcrypt = require("bcryptjs");
const {
  createBlessBoardUser,
} = require("../src/blessboard/services/createBlessBoardUser");
const authRepo = require("../src/blessboard/repositories/blessBoardAuthRepository");
const {
  requestPasswordReset,
  completePasswordReset,
  lookupTestingPasswordResetDelivery,
  inspectPasswordResetToken,
  STATUS: BB_STATUS,
  NEUTRAL_MESSAGE: BB_NEUTRAL,
} = require("../src/blessboard/services/passwordResetService");
const {
  resolvePasswordResetEmailAdapter,
} = require("../src/blessboard/services/passwordResetEmailDelivery");
const {
  clearTestingDeliveries,
} = require("../src/platform/auth/passwordRecoveryTestingDelivery");
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
  lookupTestingPasswordResetDelivery: lookupAcTestingDelivery,
  NEUTRAL_MESSAGE: AC_NEUTRAL,
} = require("../src/activeclinic/services/activeClinicPasswordRecoveryService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  CODE_ORG_STAGING,
} = require("../src/platform/config/deploymentProfiles");
const { hashSessionToken } = require("../src/platform/session/sessionToken");
const tokenRepo = require("../src/blessboard/repositories/userActionTokenRepository");

const OLD_PASSWORD = "GpQa!V206Recover9A";
const NEW_PASSWORD = "GpQa!V206Recover9B";

const TEST_ENV = Object.freeze({
  NODE_ENV: "test",
  DEPLOYMENT_ENV: "testing",
  DATABASE_IDENTITY_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
  BLESSBOARD_APEX_ORIGIN: "https://blessboard.test",
});

let pool = null;
let skipReason = null;
let phoneSeq = 0;

function requireDb() {
  if (skipReason) {
    assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }
}

function uniq(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(2).toString("hex")}`;
}

function nextPhone() {
  phoneSeq += 1;
  return `+26097${String(1000000 + (Date.now() % 1000000) + phoneSeq).slice(-7)}`;
}

function extractBbToken(resetUrl) {
  const u = new URL(resetUrl);
  return String(u.searchParams.get("token") || "");
}

function extractAcToken(resetUrl) {
  const parts = String(resetUrl).split("/reset-password/");
  return decodeURIComponent(parts[1] || "");
}

async function seedAcStaff(stamp) {
  const tenant = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `ac_v206_${stamp}`,
    displayName: `AC V206 ${stamp}`,
    productKey: "activeclinic",
    productTenantKey: `v206-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(tenant.ok, true, JSON.stringify(tenant));
  const hco = await createHealthcareOrganization(pool, {
    organizationId: tenant.records.organization.id,
    legalName: "Legal V206",
    publicName: `Clinic ${stamp}`,
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true, JSON.stringify(hco));
  const email = `ac.recover.${stamp}@example.test`;
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
    password: OLD_PASSWORD,
  });
  const staff = await createStaffMember(pool, {
    organizationId: tenant.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    firstName: "Reset",
    lastName: "User",
    employmentType: "permanent",
    email,
    phone,
    status: "active",
    platformIdentityId: identity.identity.id,
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  return { email, phone, identityId: identity.identity.id };
}

describe("V2.06 password recovery restore", () => {
  before(async () => {
    try {
      const url = await resetFoundationDatabase();
      pool = createFoundationPool(url);
      await migrate({ pool });
    } catch (err) {
      skipReason = err && err.message ? String(err.message).slice(0, 240) : "no db";
      pool = null;
    }
  });

  after(async () => {
    clearTestingDeliveries();
    if (pool) {
      try {
        await pool.end();
      } catch {
        /* ignore */
      }
    }
  });

  it("keeps live Resend fail-closed outside confirmed production", () => {
    const adapter = resolvePasswordResetEmailAdapter(
      {
        NODE_ENV: "test",
        DEPLOYMENT_ENV: "testing",
        BLESSBOARD_EMAIL_DELIVERY_ADAPTER: "resend",
        BLESSBOARD_EMAIL_FROM: "no-reply@example.org",
        RESEND_API_KEY: "test-key-never-used",
      },
      {}
    );
    assert.equal(adapter.sendingAvailable, false);
  });

  it("1+3+4+5+6+7+8) valid BB recovery: token, complete, login, reuse/expiry", async () => {
    requireDb();
    clearTestingDeliveries();
    const email = `${uniq("bb")}@example.test`;
    const created = await createBlessBoardUser(pool, {
      email,
      displayName: "BB V206 Recover",
      password: OLD_PASSWORD,
    });
    assert.equal(created.ok, true, JSON.stringify(created));

    const forgot = await requestPasswordReset(pool, {
      email,
      requestIp: "127.0.0.1",
      env: TEST_ENV,
    });
    assert.equal(forgot.ok, true);
    assert.equal(forgot.message, BB_NEUTRAL);
    assert.equal(forgot.sent, true);
    assert.ok(
      forgot.deliveryStatus === "queued" || forgot.deliveryStatus === "link_generated",
      forgot.deliveryStatus
    );

    const delivery = await lookupTestingPasswordResetDelivery(pool, {
      identifier: email,
      env: TEST_ENV,
    });
    assert.equal(delivery.ok, true, JSON.stringify(delivery));
    assert.match(delivery.resetUrl, /\/reset-password\?token=/);

    const token = extractBbToken(delivery.resetUrl);
    assert.ok(token.length >= 20);

    const preview = await inspectPasswordResetToken(pool, token);
    assert.equal(preview.ok, true);

    const done = await completePasswordReset(pool, {
      token,
      password: NEW_PASSWORD,
      passwordConfirm: NEW_PASSWORD,
      deploymentCode: CODE_ORG_STAGING,
      env: TEST_ENV,
    });
    assert.equal(done.ok, true, JSON.stringify(done));

    const after = await authRepo.findUserByEmail(pool, email);
    assert.ok(after && after.password_hash);
    assert.equal(await bcrypt.compare(OLD_PASSWORD, after.password_hash), false);
    assert.equal(await bcrypt.compare(NEW_PASSWORD, after.password_hash), true);

    const reuse = await completePasswordReset(pool, {
      token,
      password: "GpQa!V206Recover9C",
      passwordConfirm: "GpQa!V206Recover9C",
      deploymentCode: CODE_ORG_STAGING,
      env: TEST_ENV,
    });
    assert.equal(reuse.ok, false);
    assert.ok(
      reuse.status === BB_STATUS.CONSUMED || reuse.status === BB_STATUS.INVALID_TOKEN,
      reuse.status
    );

    const rawExpired = crypto.randomBytes(32).toString("base64url");
    const inserted = await tokenRepo.insertActionToken(pool, {
      userId: String(created.user.id),
      purpose: "password_reset",
      tokenHash: hashSessionToken(rawExpired),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    await pool.query(
      `UPDATE blessboard.user_action_tokens
          SET created_at = now() - interval '2 hours',
              expires_at = now() - interval '1 hour'
        WHERE id = $1`,
      [inserted.id]
    );
    const expired = await inspectPasswordResetToken(pool, rawExpired);
    assert.equal(expired.status, BB_STATUS.EXPIRED);
  });

  it("2+3+4+5+6+7+8) valid AC recovery: token, complete, verify, reuse", async () => {
    requireDb();
    clearTestingDeliveries();
    const stamp = Date.now().toString(36);
    const seeded = await seedAcStaff(stamp);

    const forgot = await requestActiveClinicPasswordReset(pool, {
      identifier: seeded.email,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      env: TEST_ENV,
      requestIp: "127.0.0.1",
    });
    assert.equal(forgot.ok, true);
    assert.equal(forgot.message, AC_NEUTRAL);
    assert.equal(forgot.resetUrl, undefined);

    const delivery = await lookupAcTestingDelivery(pool, {
      identifier: seeded.email,
      env: TEST_ENV,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(delivery.ok, true, JSON.stringify(delivery));
    const rawToken = extractAcToken(delivery.resetUrl);
    assert.ok(rawToken.length >= 20);

    const done = await completeActiveClinicPasswordReset(pool, {
      rawToken,
      password: NEW_PASSWORD,
      passwordConfirm: NEW_PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(done.ok, true, JSON.stringify(done));

    const oldPw = await verifyPlatformIdentityPassword(pool, {
      identityId: seeded.identityId,
      password: OLD_PASSWORD,
    });
    assert.equal(oldPw.ok, false);

    const newPw = await verifyPlatformIdentityPassword(pool, {
      identityId: seeded.identityId,
      password: NEW_PASSWORD,
    });
    assert.equal(newPw.ok, true);

    const reuse = await completeActiveClinicPasswordReset(pool, {
      rawToken,
      password: "GpQa!V206Recover9C",
      passwordConfirm: "GpQa!V206Recover9C",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(reuse.ok, false);
  });

  it("3) invalid identifiers still receive generic anti-enumeration responses", async () => {
    requireDb();
    clearTestingDeliveries();
    const unknownEmail = `nobody_${uniq("x")}@example.test`;

    const bb = await requestPasswordReset(pool, {
      email: unknownEmail,
      requestIp: "127.0.0.9",
      env: TEST_ENV,
    });
    assert.equal(bb.ok, true);
    assert.equal(bb.message, BB_NEUTRAL);
    assert.equal(bb.sent, false);

    const ac = await requestActiveClinicPasswordReset(pool, {
      identifier: unknownEmail,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      env: TEST_ENV,
    });
    assert.equal(ac.ok, true);
    assert.equal(ac.message, AC_NEUTRAL);

    const bbLookup = await lookupTestingPasswordResetDelivery(pool, {
      identifier: unknownEmail,
      env: TEST_ENV,
    });
    assert.equal(bbLookup.ok, false);
  });
});
