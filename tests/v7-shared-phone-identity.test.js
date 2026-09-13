"use strict";

/**
 * Shared phone identity — canonical E.164, uniqueness, multi-org login.
 *
 * Architecture under test:
 *   one normalized phone → one platform identity → many org memberships
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const {
  normalizePhoneNumber,
  VALIDATION_MODES,
} = require("../src/platform/services/phoneNumberService");
const {
  normalizeRegistrationPhone,
} = require("../src/blessboard/services/normalizeRegistrationPhone");
const {
  normalizeBlessBoardPhone,
} = require("../src/blessboard/services/normalizeBlessBoardPhone");
const {
  normalizeActiveClinicPhone,
} = require("../src/activeclinic/services/normalizeActiveClinicContact");
const {
  resolveLoginIdentifierFromBody,
} = require("../src/platform/auth/resolveLoginIdentifier");
const {
  submitAndProvisionClinicRegistration,
} = require("../src/activeclinic/services/submitClinicRegistrationService");
const {
  authenticateActiveClinicIdentity,
  STATUS: AC_AUTH_STATUS,
} = require("../src/activeclinic/services/authenticateActiveClinicIdentity");
const { CODE_ACTIVECLINIC_ORG_V6 } = require("../src/platform/config/deploymentProfiles");

const PASSWORD = "SharedPhoneQa99!";
const EXPECTED = "+260977198697";

const EQUIVALENT_FORMS = [
  "+260977198697",
  "0977198697",
  "260977198697",
  "977198697",
  "0977 198 697",
  "0977-198-697",
];

const INVALID_FORMS = [
  { raw: "097719869", label: "too-short-with-trunk-0" },
  { raw: "09771", label: "far-too-short" },
  { raw: "09771986970", label: "too-long" },
  { raw: "abcdefghij", label: "letters" },
  { raw: "123", label: "tiny" },
  { raw: "+260123", label: "invalid-e164" },
];

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

function e164All(raw) {
  const env = { DEPLOYMENT_ENV: "testing", NODE_ENV: "production" };
  return {
    shared: normalizePhoneNumber({ phone: raw, phoneCountry: "ZM", env }),
    bb: normalizeBlessBoardPhone(raw, { phoneCountry: "ZM", env }),
    reg: normalizeRegistrationPhone(raw, { phoneCountry: "ZM", env }),
    ac: normalizeActiveClinicPhone(raw, { country: "ZM", env }),
  };
}

describe("shared phone identity", () => {
  let pool;
  let skipReason = null;

  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? String(err.message).slice(0, 240) : "no db";
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("equivalent Zambia forms normalize identically across shared + BB + AC", () => {
    for (const raw of EQUIVALENT_FORMS) {
      const all = e164All(raw);
      assert.equal(all.shared.ok, true, `shared ${raw}`);
      assert.equal(all.shared.e164, EXPECTED, `shared ${raw}`);
      assert.equal(all.bb.ok, true, `bb ${raw}`);
      assert.equal(all.bb.normalized, EXPECTED, `bb ${raw}`);
      assert.equal(all.reg.ok, true, `reg ${raw}`);
      assert.equal(all.reg.normalized, EXPECTED, `reg ${raw}`);
      assert.equal(all.ac.ok, true, `ac ${raw}`);
      assert.equal(all.ac.normalized || all.ac.e164, EXPECTED, `ac ${raw}`);
    }
  });

  it("rejects too-short / too-long / invalid in relaxed and strict modes", () => {
    for (const mode of [VALIDATION_MODES.RELAXED, VALIDATION_MODES.STRICT]) {
      for (const { raw, label } of INVALID_FORMS) {
        const r = normalizePhoneNumber({
          phone: raw,
          phoneCountry: "ZM",
          validationMode: mode,
        });
        assert.equal(r.ok, false, `${mode} should reject ${label} (${raw})`);
        assert.ok(r.error, `${mode} ${label} needs message`);
      }
    }
  });

  it("login resolver never falls back to raw national digits", () => {
    const ok = resolveLoginIdentifierFromBody({
      login_mode: "phone",
      phone_country: "ZM",
      phone_national: "0977198697",
    });
    assert.equal(ok.phoneOk, true);
    assert.equal(ok.identifier, EXPECTED);

    const bad = resolveLoginIdentifierFromBody({
      login_mode: "phone",
      phone_country: "ZM",
      phone_national: "097719869",
    });
    assert.equal(bad.phoneOk, false);
    assert.equal(bad.identifier, "");
    assert.match(String(bad.phoneError || ""), /valid phone/i);
  });

  it("AC: second clinic with same phone reuses one identity; phone login still works", async () => {
    requireDb();
    const stamp = uniq("phid");
    const phone = `+26097${String(Date.now()).slice(-7)}`;
    const payloadBase = {
      contactName: "Phone Identity Admin",
      contactPhone: phone,
      province: "Lusaka",
      city: "Lusaka",
      address: "1 Phone Identity Rd",
      countryCode: "ZM",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      acceptTerms: "on",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      dataEnvironment: "testing",
      env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    };

    const first = await submitAndProvisionClinicRegistration(pool, {
      ...payloadBase,
      clinicName: `Phone Clinic A ${stamp}`,
      contactEmail: `${stamp}-a@example.invalid`,
    });
    assert.equal(first.ok, true, JSON.stringify(first));

    const second = await submitAndProvisionClinicRegistration(pool, {
      ...payloadBase,
      clinicName: `Phone Clinic B ${stamp}`,
      contactEmail: `${stamp}-b@example.invalid`,
    });
    assert.equal(second.ok, true, JSON.stringify(second));
    assert.notEqual(second.organizationId, first.organizationId);
    assert.equal(second.identityId, first.identityId);

    const identities = await pool.query(
      `SELECT id FROM platform.identities WHERE phone_normalized = $1`,
      [phone]
    );
    assert.equal(identities.rows.length, 1, "one identity per phone");

    const staff = await pool.query(
      `SELECT organization_id FROM activeclinic.staff_members
        WHERE platform_identity_id = $1 AND status <> 'archived'`,
      [identities.rows[0].id]
    );
    assert.equal(staff.rows.length, 2, "two clinic memberships");

    for (const form of [phone, phone.replace("+260", "0"), phone.replace("+", "")]) {
      const auth = await authenticateActiveClinicIdentity(pool, {
        identifier: form,
        password: PASSWORD,
        deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
        hostname: "activeclinic.pronline.org",
        country: "ZM",
      });
      assert.ok(
        auth.ok === true || auth.status === AC_AUTH_STATUS.SELECT_ORGANIZATION,
        `login failed for ${form}: ${JSON.stringify(auth)}`
      );
      if (auth.status === AC_AUTH_STATUS.SELECT_ORGANIZATION) {
        assert.ok((auth.organizations || []).length >= 2);
      }
    }
  });

  it("AC: second clinic with same phone but wrong password does not create a second identity", async () => {
    requireDb();
    const stamp = uniq("phbad");
    const phone = `+26097${String(Date.now() + 11).slice(-7)}`;
    const first = await submitAndProvisionClinicRegistration(pool, {
      clinicName: `Phone Guard A ${stamp}`,
      contactName: "Guard Admin",
      contactPhone: phone,
      contactEmail: `${stamp}-a@example.invalid`,
      province: "Lusaka",
      city: "Lusaka",
      address: "2 Guard Rd",
      countryCode: "ZM",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      acceptTerms: "on",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      dataEnvironment: "testing",
      env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    });
    assert.equal(first.ok, true, JSON.stringify(first));

    const second = await submitAndProvisionClinicRegistration(pool, {
      clinicName: `Phone Guard B ${stamp}`,
      contactName: "Guard Admin",
      contactPhone: phone,
      contactEmail: `${stamp}-b@example.invalid`,
      province: "Lusaka",
      city: "Lusaka",
      address: "3 Guard Rd",
      countryCode: "ZM",
      password: "WrongPassword99!",
      passwordConfirm: "WrongPassword99!",
      acceptTerms: "on",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      dataEnvironment: "testing",
      env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    });
    assert.equal(second.ok, false, JSON.stringify(second));

    const identities = await pool.query(
      `SELECT id FROM platform.identities WHERE phone_normalized = $1`,
      [phone]
    );
    assert.equal(identities.rows.length, 1);

    const hash = await pool.query(
      `SELECT password_hash FROM platform.identities WHERE id = $1`,
      [identities.rows[0].id]
    );
    assert.equal(await bcrypt.compare(PASSWORD, hash.rows[0].password_hash), true);
  });
});
