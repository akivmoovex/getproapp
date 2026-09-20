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

  it("BUG-009: email+phone conflict rejects without leaking account details", async () => {
    requireDb();
    const stamp = uniq("phsplit");
    const phoneA = `+26097${String(Date.now() + 21).slice(-7)}`;
    const phoneB = `+26097${String(Date.now() + 31).slice(-7)}`;
    const emailA = `${stamp}-a@example.invalid`;
    const emailB = `${stamp}-b@example.invalid`;

    const first = await submitAndProvisionClinicRegistration(pool, {
      clinicName: `Split A ${stamp}`,
      contactName: "Split Admin",
      contactPhone: phoneA,
      contactEmail: emailA,
      province: "Lusaka",
      city: "Lusaka",
      address: "4 Split Rd",
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
      clinicName: `Split B ${stamp}`,
      contactName: "Split Admin",
      contactPhone: phoneB,
      contactEmail: emailB,
      province: "Lusaka",
      city: "Lusaka",
      address: "5 Split Rd",
      countryCode: "ZM",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      acceptTerms: "on",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      dataEnvironment: "testing",
      env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    });
    assert.equal(second.ok, true, JSON.stringify(second));

    const conflict = await submitAndProvisionClinicRegistration(pool, {
      clinicName: `Split Conflict ${stamp}`,
      contactName: "Split Admin",
      contactPhone: phoneA,
      contactEmail: emailB,
      province: "Lusaka",
      city: "Lusaka",
      address: "6 Split Rd",
      countryCode: "ZM",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      acceptTerms: "on",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      dataEnvironment: "testing",
      env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    });
    assert.equal(conflict.ok, false, JSON.stringify(conflict));
    assert.equal(conflict.code, "identity_conflict");
    const errText = JSON.stringify(conflict.errors || {});
    assert.match(errText, /different accounts/i);
    assert.doesNotMatch(errText, new RegExp(emailA.replace(".", "\\."), "i"));
    assert.doesNotMatch(errText, /Split A/i);
  });

  it("BUG-009: equivalent phone formats still block unauthorized reuse", async () => {
    requireDb();
    const stamp = uniq("pheq");
    const national = `97${String(Date.now() + 41).slice(-7)}`;
    const e164 = `+260${national}`;
    const first = await submitAndProvisionClinicRegistration(pool, {
      clinicName: `Eq A ${stamp}`,
      contactName: "Eq Admin",
      contactPhone: e164,
      contactEmail: `${stamp}-a@example.invalid`,
      province: "Lusaka",
      city: "Lusaka",
      address: "7 Eq Rd",
      countryCode: "ZM",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      acceptTerms: "on",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      dataEnvironment: "testing",
      env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    });
    assert.equal(first.ok, true, JSON.stringify(first));

    for (const form of [`0${national}`, national, `260${national}`]) {
      const attempt = await submitAndProvisionClinicRegistration(pool, {
        clinicName: `Eq Thief ${stamp} ${form}`,
        contactName: "Eq Thief",
        contactPhone: form,
        phoneCountry: "ZM",
        contactEmail: `${stamp}-${form.replace(/\D/g, "").slice(-6)}@example.invalid`,
        province: "Lusaka",
        city: "Lusaka",
        address: "8 Eq Rd",
        countryCode: "ZM",
        password: "WrongPassword99!",
        passwordConfirm: "WrongPassword99!",
        acceptTerms: "on",
        deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
        dataEnvironment: "testing",
        env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
      });
      assert.equal(attempt.ok, false, `form ${form} => ${JSON.stringify(attempt)}`);
    }

    const identities = await pool.query(
      `SELECT id FROM platform.identities WHERE phone_normalized = $1`,
      [e164]
    );
    assert.equal(identities.rows.length, 1);
  });

  it("BUG-009: concurrent different-user claims keep a single identity", async () => {
    requireDb();
    const stamp = uniq("phrace");
    const phone = `+26097${String(Date.now() + 51).slice(-7)}`;
    const base = {
      contactName: "Race Admin",
      contactPhone: phone,
      province: "Lusaka",
      city: "Lusaka",
      address: "9 Race Rd",
      countryCode: "ZM",
      acceptTerms: "on",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      dataEnvironment: "testing",
      env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    };

    const owner = await submitAndProvisionClinicRegistration(pool, {
      ...base,
      clinicName: `Race Owner ${stamp}`,
      contactEmail: `${stamp}-owner@example.invalid`,
      password: PASSWORD,
      passwordConfirm: PASSWORD,
    });
    assert.equal(owner.ok, true, JSON.stringify(owner));

    const claims = await Promise.all(
      [1, 2, 3].map((n) =>
        submitAndProvisionClinicRegistration(pool, {
          ...base,
          clinicName: `Race Claim ${stamp}-${n}`,
          contactEmail: `${stamp}-claim${n}@example.invalid`,
          password: `WrongPassword${n}9!`,
          passwordConfirm: `WrongPassword${n}9!`,
        })
      )
    );
    for (const claim of claims) {
      assert.equal(claim.ok, false, JSON.stringify(claim));
    }

    const identities = await pool.query(
      `SELECT id FROM platform.identities WHERE phone_normalized = $1`,
      [phone]
    );
    assert.equal(identities.rows.length, 1);

    const staff = await pool.query(
      `SELECT organization_id FROM activeclinic.staff_members
        WHERE platform_identity_id = $1 AND status <> 'archived'`,
      [identities.rows[0].id]
    );
    assert.equal(staff.rows.length, 1, "thieves must not gain memberships");
  });

  it("shared match helpers: email/phone split and password gate", async () => {
    const {
      matchRegistrationContactPrincipals,
      authorizeExistingPrincipalReuse,
      REGISTRATION_IDENTITY_REASON,
    } = require("../src/platform/registration/resolveRegistrationContactIdentity");

    const split = matchRegistrationContactPrincipals(
      { id: "email-id" },
      [{ id: "phone-id" }]
    );
    assert.equal(split.ok, false);
    assert.equal(split.reason, REGISTRATION_IDENTITY_REASON.EMAIL_PHONE_SPLIT);

    const hash = await bcrypt.hash(PASSWORD, 4);
    const bad = await authorizeExistingPrincipalReuse({
      passwordHash: hash,
      password: "WrongPassword99!",
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.reason, REGISTRATION_IDENTITY_REASON.PASSWORD_MISMATCH);

    const good = await authorizeExistingPrincipalReuse({
      passwordHash: hash,
      password: PASSWORD,
    });
    assert.equal(good.ok, true);
  });

  it("BUG-009: suspended identity phone rejects without creating a second principal", async () => {
    requireDb();
    const stamp = uniq("phsus");
    const phone = `+26097${String(Date.now() + 61).slice(-7)}`;
    const first = await submitAndProvisionClinicRegistration(pool, {
      clinicName: `Sus A ${stamp}`,
      contactName: "Sus Admin",
      contactPhone: phone,
      contactEmail: `${stamp}-a@example.invalid`,
      province: "Lusaka",
      city: "Lusaka",
      address: "10 Sus Rd",
      countryCode: "ZM",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      acceptTerms: "on",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      dataEnvironment: "testing",
      env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    });
    assert.equal(first.ok, true, JSON.stringify(first));

    await pool.query(
      `UPDATE platform.identities
          SET status = 'suspended', suspended_at = now(), updated_at = now()
        WHERE id = $1`,
      [first.identityId]
    );

    const second = await submitAndProvisionClinicRegistration(pool, {
      clinicName: `Sus B ${stamp}`,
      contactName: "Sus Admin",
      contactPhone: phone,
      contactEmail: `${stamp}-b@example.invalid`,
      province: "Lusaka",
      city: "Lusaka",
      address: "11 Sus Rd",
      countryCode: "ZM",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      acceptTerms: "on",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      dataEnvironment: "testing",
      env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    });
    assert.equal(second.ok, false, JSON.stringify(second));
    assert.equal(second.code, "reject_suspended");
    const errText = JSON.stringify(second.errors || {});
    assert.match(errText, /cannot be used for a new clinic registration/i);
    assert.doesNotMatch(errText, /password_hash|SQLSTATE|node_modules/i);

    const identities = await pool.query(
      `SELECT id, status FROM platform.identities WHERE phone_normalized = $1`,
      [phone]
    );
    assert.equal(identities.rows.length, 1);
    assert.equal(identities.rows[0].status, "suspended");
  });

  it("V8: authorized multi-clinic reuse provisions under moovex-platform-v8-testing", async () => {
    requireDb();
    const {
      CODE_MOOVEX_PLATFORM_V8_TESTING,
    } = require("../src/platform/config/deploymentProfiles");

    const dep = await pool.query(
      `SELECT 1 FROM platform.deployments WHERE deployment_code = $1 AND status = 'active'`,
      [CODE_MOOVEX_PLATFORM_V8_TESTING]
    );
    if (!dep.rows[0]) {
      // Foundation DB in CI may not have run seed 009 yet — insert for this suite only.
      await pool.query(
        `INSERT INTO platform.deployments (
           deployment_code, application_code, release_version, canonical_domain,
           environment_code, status, jobs_enabled, database_access_mode, session_cookie_name
         ) VALUES (
           $1, 'platform', 'v8', 'neuniversity.org', 'testing', 'active', false,
           'read_write', 'moovex_platform_v8_testing_sid'
         )
         ON CONFLICT (deployment_code) DO UPDATE SET status = 'active', updated_at = now()`,
        [CODE_MOOVEX_PLATFORM_V8_TESTING]
      );
    }

    const stamp = uniq("phv8");
    const phone = `+26097${String(Date.now() + 71).slice(-7)}`;
    const env = {
      NODE_ENV: "test",
      PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_V8_TESTING,
      DEPLOYMENT_ENV: "testing",
    };
    const first = await submitAndProvisionClinicRegistration(pool, {
      clinicName: `V8 Phone A ${stamp}`,
      contactName: "V8 Admin",
      contactPhone: phone,
      contactEmail: `${stamp}-a@example.invalid`,
      province: "Lusaka",
      city: "Lusaka",
      address: "12 V8 Rd",
      countryCode: "ZM",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      acceptTerms: "on",
      deploymentCode: CODE_MOOVEX_PLATFORM_V8_TESTING,
      dataEnvironment: "testing",
      env,
    });
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.equal(first.reviewRequired, false);

    const thief = await submitAndProvisionClinicRegistration(pool, {
      clinicName: `V8 Phone Thief ${stamp}`,
      contactName: "V8 Thief",
      contactPhone: phone,
      contactEmail: `${stamp}-thief@example.invalid`,
      province: "Lusaka",
      city: "Lusaka",
      address: "13 V8 Rd",
      countryCode: "ZM",
      password: "WrongPassword99!",
      passwordConfirm: "WrongPassword99!",
      acceptTerms: "on",
      deploymentCode: CODE_MOOVEX_PLATFORM_V8_TESTING,
      dataEnvironment: "testing",
      env,
    });
    assert.equal(thief.ok, false, JSON.stringify(thief));
    assert.equal(thief.code, "existing_account_password_mismatch");

    const second = await submitAndProvisionClinicRegistration(pool, {
      clinicName: `V8 Phone B ${stamp}`,
      contactName: "V8 Admin",
      contactPhone: phone,
      contactEmail: `${stamp}-b@example.invalid`,
      province: "Lusaka",
      city: "Lusaka",
      address: "14 V8 Rd",
      countryCode: "ZM",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      acceptTerms: "on",
      deploymentCode: CODE_MOOVEX_PLATFORM_V8_TESTING,
      dataEnvironment: "testing",
      env,
    });
    assert.equal(second.ok, true, JSON.stringify(second));
    assert.equal(second.identityId, first.identityId);
    assert.notEqual(second.organizationId, first.organizationId);
  });
});
