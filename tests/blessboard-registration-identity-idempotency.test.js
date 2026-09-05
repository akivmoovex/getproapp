"use strict";

/**
 * BlessBoard registration administrator identity / idempotency regressions.
 * Covers preferred reuse rules, same-church retry, phone/email conflicts, and rollback safety.
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
const appRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  provisionRegisteredBlessBoardChurch,
  STATUS,
} = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const {
  validatePlatformChurchRegistration,
} = require("../src/blessboard/services/platformChurchRegistrationValidation");
const {
  submitAndProvisionClinicRegistration,
} = require("../src/activeclinic/services/submitClinicRegistrationService");
const { CODE_ACTIVECLINIC_ORG_V6 } = require("../src/platform/config/deploymentProfiles");

const PASSWORD = "TestPassword99!";
const ACTOR = Object.freeze({
  type: "public_self_registration",
  source: "register_church",
  dataEnvironment: "testing",
  deploymentCode: "moovex-platform-testing",
});

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

function nextPhone(seq) {
  return `+26097${String(1000000 + seq).slice(-7)}`;
}

describe("BlessBoard registration identity conflict / idempotency", () => {
  let pool;
  let skipReason = null;
  let phoneSeq = 0;

  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  function phone() {
    phoneSeq += 1;
    return nextPhone(phoneSeq);
  }

  async function insertApplication(overrides = {}) {
    const key = uniq("idemp");
    const contactPhone = overrides.contact_phone || overrides.contact_phone_normalized || phone();
    return appRepo.createApplication(pool, {
      church_name: overrides.church_name || `Idemp Church ${key}`,
      country: overrides.country || "Zambia",
      city: overrides.city || "Lusaka",
      contact_name: overrides.contact_name || "Ada Admin",
      contact_email: overrides.contact_email || `${key}@example.org`,
      contact_phone: contactPhone,
      contact_phone_normalized: overrides.contact_phone_normalized || contactPhone,
      selected_plan: "foundation",
      consent_terms: true,
      branch_name: overrides.branch_name || "Main Campus",
    });
  }

  async function provision(app, extra = {}) {
    return provisionRegisteredBlessBoardChurch(
      pool,
      {
        applicationId: app.id,
        administratorPassword: PASSWORD,
        requestedOrganizationKey: extra.organizationKey || uniq("org"),
        actorContext: ACTOR,
        ...extra,
      },
      { allowRetry: true }
    );
  }

  async function countUsersByEmail(email) {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.users WHERE email_normalized = $1`,
      [String(email).toLowerCase()]
    );
    return r.rows[0].n;
  }

  it("A. brand-new email + brand-new phone succeeds", async () => {
    requireDb();
    const email = `${uniq("a")}@example.org`;
    const p = phone();
    const app = await insertApplication({
      contact_email: email,
      contact_phone: p,
      contact_phone_normalized: p,
    });
    const result = await provision(app);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.alreadyProvisioned, false);
    assert.ok(result.records.administratorUserId);
    assert.equal(await countUsersByEmail(email), 1);
  });

  it("B. existing platform identity not yet a member of this church reuses and assigns roles", async () => {
    requireDb();
    const email = `${uniq("b")}@example.org`;
    const p1 = phone();
    const first = await insertApplication({
      contact_email: email,
      contact_phone: p1,
      contact_phone_normalized: p1,
      church_name: `First Church ${uniq("b1")}`,
      city: `City-${uniq("b1")}`,
    });
    const r1 = await provision(first);
    assert.equal(r1.ok, true, JSON.stringify(r1));
    const userId = r1.records.administratorUserId;

    const p2 = phone();
    const second = await insertApplication({
      contact_email: email,
      contact_phone: p2,
      contact_phone_normalized: p2,
      church_name: `Second Church ${uniq("b2")}`,
      city: `City-${uniq("b2")}`,
    });
    const r2 = await provision(second);
    assert.equal(r2.ok, true, JSON.stringify(r2));
    assert.equal(String(r2.records.administratorUserId), String(userId));
    assert.equal(r2.records.administratorLinkedExisting, true);
    assert.equal(await countUsersByEmail(email), 1);

    const roles = await pool.query(
      `SELECT organization_id, role_key FROM blessboard.user_roles
        WHERE user_id = $1 AND status = 'active' AND role_key = 'church_hq_admin'
        ORDER BY organization_id`,
      [userId]
    );
    assert.equal(roles.rowCount, 2);
    assert.notEqual(String(r1.records.organizationId), String(r2.records.organizationId));

    const hash = await pool.query(
      `SELECT password_hash FROM blessboard.users WHERE id = $1`,
      [userId]
    );
    assert.equal(await bcrypt.compare(PASSWORD, hash.rows[0].password_hash), true);
  });

  it("C. same church registration retried after success is idempotent", async () => {
    requireDb();
    const email = `${uniq("c")}@example.org`;
    const p = phone();
    const app = await insertApplication({
      contact_email: email,
      contact_phone: p,
      contact_phone_normalized: p,
    });
    const first = await provision(app);
    assert.equal(first.ok, true);
    const second = await provision(app, {
      organizationKey: first.records.organizationKey,
    });
    assert.equal(second.ok, true);
    assert.equal(second.alreadyProvisioned, true);
    assert.equal(String(second.records.organizationId), String(first.records.organizationId));
    assert.equal(await countUsersByEmail(email), 1);
  });

  it("D. same registration application retried after provisioning is idempotent", async () => {
    requireDb();
    const email = `${uniq("d")}@example.org`;
    const p = phone();
    const app = await insertApplication({
      contact_email: email,
      contact_phone: p,
      contact_phone_normalized: p,
    });
    const first = await provision(app);
    assert.equal(first.ok, true);
    const again = await provisionRegisteredBlessBoardChurch(
      pool,
      {
        applicationId: app.id,
        administratorPassword: PASSWORD,
        requestedOrganizationKey: first.records.organizationKey,
        actorContext: ACTOR,
      },
      { allowRetry: true }
    );
    assert.equal(again.ok, true);
    assert.equal(again.alreadyProvisioned, true);
    assert.equal(await countUsersByEmail(email), 1);
  });

  it("E. administrator email already exists → deterministic reuse or clear existing_account", async () => {
    requireDb();
    const email = `${uniq("e")}@example.org`;
    await createBlessBoardUser(pool, {
      email,
      displayName: "Existing",
      password: PASSWORD,
    });
    const p = phone();
    const app = await insertApplication({
      contact_email: email,
      contact_phone: p,
      contact_phone_normalized: p,
      contact_name: "Existing",
    });
    const okReuse = await provision(app);
    assert.equal(okReuse.ok, true, JSON.stringify(okReuse));
    assert.equal(okReuse.records.administratorLinkedExisting, true);
    assert.equal(await countUsersByEmail(email), 1);

    const wrongPhone = phone();
    const wrong = await insertApplication({
      contact_email: email,
      contact_phone: wrongPhone,
      contact_phone_normalized: wrongPhone,
      church_name: `Wrong Pass Church ${uniq("ew")}`,
      city: `City-${uniq("ew")}`,
    });
    const bad = await provisionRegisteredBlessBoardChurch(
      pool,
      {
        applicationId: wrong.id,
        administratorPassword: "DefinitelyWrong99",
        requestedOrganizationKey: uniq("eworg"),
        actorContext: ACTOR,
      },
      { allowRetry: true }
    );
    assert.equal(bad.ok, false);
    assert.equal(bad.status, STATUS.EXISTING_ACCOUNT);
    assert.equal(await countUsersByEmail(email), 1);
  });

  it("F. administrator phone already exists → reuse when password matches", async () => {
    requireDb();
    const email1 = `${uniq("f1")}@example.org`;
    const sharedPhone = phone();
    await createBlessBoardUser(pool, {
      email: email1,
      displayName: "Phone Owner",
      password: PASSWORD,
      phoneNormalized: sharedPhone,
      phoneDisplay: sharedPhone,
    });

    // Same email + same phone: soft idempotency / multi-org path after first church
    const app1 = await insertApplication({
      contact_email: email1,
      contact_phone: sharedPhone,
      contact_phone_normalized: sharedPhone,
      contact_name: "Phone Owner",
      church_name: `Phone Church ${uniq("f")}`,
    });
    const r1 = await provision(app1);
    assert.equal(r1.ok, true, JSON.stringify(r1));
    assert.equal(await countUsersByEmail(email1), 1);
  });

  it("G. email and phone resolve to different existing identities → identity_conflict", async () => {
    requireDb();
    const emailA = `${uniq("g1")}@example.org`;
    const emailB = `${uniq("g2")}@example.org`;
    const phoneA = phone();
    const phoneB = phone();
    await createBlessBoardUser(pool, {
      email: emailA,
      displayName: "User A",
      password: PASSWORD,
      phoneNormalized: phoneA,
      phoneDisplay: phoneA,
    });
    await createBlessBoardUser(pool, {
      email: emailB,
      displayName: "User B",
      password: PASSWORD,
      phoneNormalized: phoneB,
      phoneDisplay: phoneB,
    });

    const app = await insertApplication({
      contact_email: emailA,
      contact_phone: phoneB,
      contact_phone_normalized: phoneB,
      church_name: `Split Identity ${uniq("g")}`,
      city: `City-${uniq("g")}`,
    });
    const result = await provision(app);
    assert.equal(result.ok, false);
    assert.equal(result.status, STATUS.IDENTITY_CONFLICT);
    assert.equal(result.organizationId || null, null);
    const orgs = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE display_name = $1`,
      [app.church_name]
    );
    assert.equal(orgs.rows[0].n, 0);
  });

  it("H. failed transaction leaves no orphan tenant graph", async () => {
    requireDb();
    const email = `${uniq("h")}@example.org`;
    const p = phone();
    const app = await insertApplication({
      contact_email: email,
      contact_phone: p,
      contact_phone_normalized: p,
    });
    const beforeUsers = await pool.query(`SELECT COUNT(*)::int AS n FROM blessboard.users`);
    const beforeOrgs = await pool.query(`SELECT COUNT(*)::int AS n FROM platform.organizations`);

    const result = await provisionRegisteredBlessBoardChurch(
      pool,
      {
        applicationId: app.id,
        administratorPassword: PASSWORD,
        requestedOrganizationKey: uniq("horg"),
        actorContext: {
          ...ACTOR,
          deploymentCode: "blessboard-org-v5", // retired → fails before durable writes commit
        },
      },
      { allowRetry: true }
    );
    assert.equal(result.ok, false);

    const afterUsers = await pool.query(`SELECT COUNT(*)::int AS n FROM blessboard.users`);
    const afterOrgs = await pool.query(`SELECT COUNT(*)::int AS n FROM platform.organizations`);
    assert.equal(afterUsers.rows[0].n, beforeUsers.rows[0].n);
    assert.equal(afterOrgs.rows[0].n, beforeOrgs.rows[0].n);
    assert.equal(await countUsersByEmail(email), 0);
  });

  it("I. registration consent validation still works", async () => {
    requireDb();
    const body = {
      church_name: `Consent Church ${uniq("i")}`,
      country: "Zambia",
      city: "Lusaka",
      contact_name: "Consent Admin",
      email: `${uniq("i")}@example.org`,
      phone: phone(),
      role_in_church: "Pastor",
      branch_name: "HQ",
      selected_plan: "foundation",
      password: PASSWORD,
      password_confirm: PASSWORD,
      organization_key: uniq("iconsent"),
      consent_terms: false,
    };
    const validation = validatePlatformChurchRegistration(body, {
      instantFreeEnabled: true,
      env: { NODE_ENV: "test" },
    });
    assert.equal(validation.ok, false);
    assert.ok(
      validation.field === "registration_consent" ||
        validation.field === "consent_terms" ||
        validation.field === "consent" ||
        /consent/i.test(String(validation.error || ""))
    );
  });

  it("J. ActiveClinic shared registration is not regressed", async () => {
    requireDb();
    const stamp = uniq("jac");
    const payload = {
      clinicName: `AC Identity Guard ${stamp}`,
      contactName: "Clinic Admin",
      contactEmail: `ac-${stamp}@example.invalid`,
      contactPhone: phone(),
      province: "Lusaka",
      city: "Lusaka",
      address: "1 Independence Avenue",
      countryCode: "ZM",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      acceptTerms: "on",
    };
    const created = await submitAndProvisionClinicRegistration(pool, {
      ...payload,
      dataEnvironment: "testing",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    });
    assert.equal(created.ok, true, JSON.stringify(created));
    assert.ok(created.organizationId || (created.application && created.application.organization_id));
  });

  it("same-church new application after success returns already_provisioned without duplicate user", async () => {
    requireDb();
    const email = `${uniq("sc")}@example.org`;
    const p1 = phone();
    const churchName = `Same Church Retry ${uniq("sc")}`;
    const app1 = await insertApplication({
      contact_email: email,
      contact_phone: p1,
      contact_phone_normalized: p1,
      church_name: churchName,
      city: "Lusaka",
      country: "Zambia",
    });
    const first = await provision(app1);
    assert.equal(first.ok, true);

    const p2 = phone();
    const app2 = await insertApplication({
      contact_email: email,
      contact_phone: p2,
      contact_phone_normalized: p2,
      church_name: churchName,
      city: "Lusaka",
      country: "Zambia",
    });
    const second = await provision(app2, {
      organizationKey: first.records.organizationKey,
    });
    assert.equal(second.ok, true, JSON.stringify(second));
    assert.equal(second.alreadyProvisioned, true);
    assert.equal(String(second.records.organizationId), String(first.records.organizationId));
    assert.equal(await countUsersByEmail(email), 1);
  });
});
