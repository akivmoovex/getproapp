"use strict";

/**
 * Focused regression: phone-reuse administrator role assignment during church provisioning.
 * Covers the V2.04 assign_administrator_roles / emailMatched=false failure mode.
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
  buildAdministratorRoleAssignInput,
} = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const {
  assignBlessBoardRole,
  STATUS: ROLE_STATUS,
} = require("../src/blessboard/services/assignBlessBoardRole");

const PASSWORD = "TestPassword99";

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

function actor() {
  return {
    type: "test",
    source: "unit",
    dataEnvironment: "testing",
    deploymentCode: "moovex-platform-testing",
  };
}

describe("BB church provisioning — phone-reuse role assignment (V2.04)", () => {
  let databaseUrl;
  let pool;
  let skipSuite = false;
  let skipReason = "";

  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  async function insertApplication(overrides = {}) {
    const key = uniq("pru");
    const phone =
      overrides.contact_phone_normalized ||
      `+26097${String(1000000 + (crypto.randomBytes(3).readUIntBE(0, 3) % 8999999)).padStart(7, "0")}`;
    return appRepo.createApplication(pool, {
      church_name: overrides.church_name || `Phone Reuse Church ${key}`,
      country: "Zambia",
      city: "Lusaka",
      contact_name: overrides.contact_name || "Ada Admin",
      contact_email: overrides.contact_email || `${key}@example.org`,
      contact_phone: overrides.contact_phone || phone,
      contact_phone_normalized: phone,
      selected_plan: "foundation",
      consent_terms: true,
      branch_name: "Main Campus",
    });
  }

  async function activeRolesForUserOrg(userId, organizationId) {
    const r = await pool.query(
      `SELECT r.role_key, a.organization_id
         FROM blessboard.user_role_assignments a
         JOIN blessboard.roles r ON r.id = a.role_id
        WHERE a.user_id = $1 AND a.organization_id = $2 AND a.status = 'active'
        ORDER BY r.role_key`,
      [userId, organizationId]
    );
    return r.rows;
  }

  async function orgCountByKey(organizationKey) {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE organization_key = $1`,
      [organizationKey]
    );
    return r.rows[0].n;
  }

  it("A: brand-new identity → new church provisions with HQ + branch admin roles", async () => {
    requireDb();
    const app = await insertApplication();
    const result = await provisionRegisteredBlessBoardChurch(pool, {
      applicationId: app.id,
      administratorPassword: PASSWORD,
      actorContext: actor(),
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, STATUS.OK);
    const roles = await activeRolesForUserOrg(
      result.records.administratorUserId,
      result.records.organizationId
    );
    assert.deepEqual(
      roles.map((r) => r.role_key),
      ["branch_administrator", "organisation_administrator"]
    );
  });

  it("B/C: existing identity matched by phone + different email → new church (no duplicate user)", async () => {
    requireDb();
    const phone = `+26097${String(2000000 + (Date.now() % 7999999)).slice(0, 7)}`;
    const existingEmail = `${uniq("exist")}@example.org`;
    const registrationEmail = `${uniq("newmail")}@example.org`;
    const hash = await bcrypt.hash(PASSWORD, 4);

    const created = await createBlessBoardUser(pool, {
      email: existingEmail,
      displayName: "Existing Phone User",
      passwordHash: hash,
      phoneNormalized: phone,
      phoneDisplay: phone,
    });
    assert.equal(created.ok, true);
    const existingUserId = String(created.user.id);

    const app = await insertApplication({
      contact_email: registrationEmail,
      contact_phone: phone,
      contact_phone_normalized: phone,
      church_name: `Phone Match Church ${uniq("pmc")}`,
    });

    const result = await provisionRegisteredBlessBoardChurch(
      pool,
      {
        applicationId: app.id,
        administratorPassword: PASSWORD,
        actorContext: actor(),
      },
      { allowMultiOrgIdentityReuse: true }
    );

    assert.equal(result.ok, true, result.message || result.status);
    assert.equal(String(result.records.administratorUserId), existingUserId);

    const usersByPhone = await pool.query(
      `SELECT id, email_normalized FROM blessboard.users WHERE phone_normalized = $1`,
      [phone]
    );
    assert.equal(usersByPhone.rows.length, 1);
    assert.equal(String(usersByPhone.rows[0].id), existingUserId);

    const roles = await activeRolesForUserOrg(existingUserId, result.records.organizationId);
    assert.deepEqual(
      roles.map((r) => r.role_key),
      ["branch_administrator", "organisation_administrator"]
    );
  });

  it("D: existing admin of Church A becomes admin of new Church B; A roles untouched", async () => {
    requireDb();
    const phone = `+26097${String(3000000 + (Date.now() % 6999999)).slice(0, 7)}`;
    const email = `${uniq("multi")}@example.org`;

    const appA = await insertApplication({
      contact_email: email,
      contact_phone: phone,
      contact_phone_normalized: phone,
      church_name: `Church A ${uniq("a")}`,
    });
    const first = await provisionRegisteredBlessBoardChurch(pool, {
      applicationId: appA.id,
      administratorPassword: PASSWORD,
      actorContext: actor(),
    });
    assert.equal(first.ok, true);
    const userId = String(first.records.administratorUserId);
    const orgA = String(first.records.organizationId);
    const rolesABefore = await activeRolesForUserOrg(userId, orgA);
    assert.equal(rolesABefore.length, 2);

    const appB = await insertApplication({
      contact_email: email,
      contact_phone: phone,
      contact_phone_normalized: phone,
      church_name: `Church B ${uniq("b")}`,
    });
    const second = await provisionRegisteredBlessBoardChurch(
      pool,
      {
        applicationId: appB.id,
        administratorPassword: PASSWORD,
        actorContext: actor(),
      },
      { allowMultiOrgIdentityReuse: true }
    );
    assert.equal(second.ok, true, second.message || second.status);
    assert.equal(String(second.records.administratorUserId), userId);
    assert.notEqual(String(second.records.organizationId), orgA);

    const rolesAAfter = await activeRolesForUserOrg(userId, orgA);
    assert.deepEqual(
      rolesAAfter.map((r) => r.role_key),
      rolesABefore.map((r) => r.role_key)
    );
    const rolesB = await activeRolesForUserOrg(userId, second.records.organizationId);
    assert.deepEqual(
      rolesB.map((r) => r.role_key),
      ["branch_administrator", "organisation_administrator"]
    );
  });

  it("E: duplicate role assignment is idempotent (already_assigned)", async () => {
    requireDb();
    const app = await insertApplication();
    const result = await provisionRegisteredBlessBoardChurch(pool, {
      applicationId: app.id,
      administratorPassword: PASSWORD,
      actorContext: actor(),
    });
    assert.equal(result.ok, true);

    const again = await assignBlessBoardRole(pool, {
      userId: result.records.administratorUserId,
      email: app.contact_email,
      organizationKey: result.records.organizationKey,
      roleKey: "church_hq_admin",
      churchKey: result.records.organizationKey,
    });
    assert.equal(again.ok, true);
    assert.equal(again.status, ROLE_STATUS.ALREADY_ASSIGNED);

    const roles = await activeRolesForUserOrg(
      result.records.administratorUserId,
      result.records.organizationId
    );
    assert.equal(roles.filter((r) => r.role_key === "organisation_administrator").length, 1);
  });

  it("F: provisioning failure rolls back all new organization data", async () => {
    requireDb();
    const app = await insertApplication({ church_name: `Rollback Church ${uniq("rb")}` });
    const churchMod = require("../src/blessboard/services/provisionBlessBoardChurch");
    const original = churchMod.provisionBlessBoardChurch;
    churchMod.provisionBlessBoardChurch = async () => ({
      ok: false,
      status: "church_conflict",
      message: "injected_failure",
    });
    try {
      const failed = await provisionRegisteredBlessBoardChurch(pool, {
        applicationId: app.id,
        administratorPassword: PASSWORD,
        actorContext: actor(),
      });
      assert.equal(failed.ok, false);
      assert.equal(failed.status, STATUS.PROVISIONING_FAILED);

      const orgs = await pool.query(
        `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE display_name = $1`,
        [app.church_name]
      );
      assert.equal(orgs.rows[0].n, 0);

      const appRow = await appRepo.findApplicationById(pool, app.id);
      assert.equal(appRow.provisioning_status, "provisioning_failed");
      assert.equal(appRow.application_status, "submitted");
    } finally {
      churchMod.provisionBlessBoardChurch = original;
    }
  });

  it("G: safe retry after rollback succeeds with allowRetry", async () => {
    requireDb();
    const app = await insertApplication({ church_name: `Retry Safe ${uniq("rs")}` });
    const churchMod = require("../src/blessboard/services/provisionBlessBoardChurch");
    const original = churchMod.provisionBlessBoardChurch;
    churchMod.provisionBlessBoardChurch = async () => ({
      ok: false,
      status: "church_conflict",
      message: "injected_failure",
    });
    try {
      const failed = await provisionRegisteredBlessBoardChurch(pool, {
        applicationId: app.id,
        administratorPassword: PASSWORD,
        actorContext: actor(),
      });
      assert.equal(failed.ok, false);

      churchMod.provisionBlessBoardChurch = original;
      const ok = await provisionRegisteredBlessBoardChurch(
        pool,
        {
          applicationId: app.id,
          administratorPassword: PASSWORD,
          actorContext: actor(),
        },
        { allowRetry: true }
      );
      assert.equal(ok.ok, true);
      assert.equal(ok.records.provisioningStatus, "provisioned");
      assert.equal(await orgCountByKey(ok.records.organizationKey), 1);
    } finally {
      churchMod.provisionBlessBoardChurch = original;
    }
  });

  it("H: cross-tenant permissions remain isolated (no roles on foreign org)", async () => {
    requireDb();
    const app1 = await insertApplication({ church_name: `Iso A ${uniq("ia")}` });
    const app2 = await insertApplication({ church_name: `Iso B ${uniq("ib")}` });
    const a = await provisionRegisteredBlessBoardChurch(pool, {
      applicationId: app1.id,
      administratorPassword: PASSWORD,
      actorContext: actor(),
    });
    const b = await provisionRegisteredBlessBoardChurch(pool, {
      applicationId: app2.id,
      administratorPassword: PASSWORD,
      actorContext: actor(),
    });
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);

    const cross = await activeRolesForUserOrg(a.records.administratorUserId, b.records.organizationId);
    assert.equal(cross.length, 0);
    const own = await activeRolesForUserOrg(a.records.administratorUserId, a.records.organizationId);
    assert.equal(own.length, 2);
  });

  it("I: normal same-email registration path unchanged", async () => {
    requireDb();
    const phone = `+26097${String(4000000 + (Date.now() % 5999999)).slice(0, 7)}`;
    const email = `${uniq("same")}@example.org`;
    const hash = await bcrypt.hash(PASSWORD, 4);
    const created = await createBlessBoardUser(pool, {
      email,
      displayName: "Same Email User",
      passwordHash: hash,
      phoneNormalized: phone,
      phoneDisplay: phone,
    });
    assert.equal(created.ok, true);
    const existingUserId = String(created.user.id);

    const app = await insertApplication({
      contact_email: email,
      contact_phone: phone,
      contact_phone_normalized: phone,
      church_name: `Same Email Church ${uniq("sec")}`,
    });
    const result = await provisionRegisteredBlessBoardChurch(
      pool,
      {
        applicationId: app.id,
        administratorPassword: PASSWORD,
        actorContext: actor(),
      },
      { allowMultiOrgIdentityReuse: true }
    );
    assert.equal(result.ok, true, result.message || result.status);
    assert.equal(String(result.records.administratorUserId), existingUserId);
    const roles = await activeRolesForUserOrg(existingUserId, result.records.organizationId);
    assert.deepEqual(
      roles.map((r) => r.role_key),
      ["branch_administrator", "organisation_administrator"]
    );
  });

  it("buildAdministratorRoleAssignInput prefers userId and omits unmatched contact email", () => {
    const input = buildAdministratorRoleAssignInput({
      application: { contact_email: "new@example.org" },
      existingUser: {
        id: "11111111-1111-1111-1111-111111111111",
        email_normalized: "old@example.org",
      },
      administratorUserId: "11111111-1111-1111-1111-111111111111",
      organizationKey: "demo-c",
      roleKey: "church_hq_admin",
      churchKey: "demo-c",
    });
    assert.equal(input.userId, "11111111-1111-1111-1111-111111111111");
    assert.equal(input.email, "old@example.org");
    assert.notEqual(input.email, "new@example.org");
  });

  it("mapRoleAssignmentFailureStatus: user_not_found is not database_conflict", () => {
    const {
      mapRoleAssignmentFailureStatus,
      STATUS: PROV_STATUS,
    } = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
    assert.equal(
      mapRoleAssignmentFailureStatus({ status: "user_not_found", message: "user_not_found" }),
      PROV_STATUS.ADMINISTRATOR_NOT_FOUND
    );
    assert.equal(
      mapRoleAssignmentFailureStatus({
        status: "transaction_error",
        diagnostics: { postgresCode: "23505", constraint: "user_role_assignments_active_scope_uidx" },
      }),
      PROV_STATUS.DATABASE_CONFLICT
    );
  });

  it("assignBlessBoardRole with userId does not fall back to unmatched email", async () => {
    requireDb();
    const phone = `+26097${String(5000000 + (Date.now() % 4999999)).slice(0, 7)}`;
    const hash = await bcrypt.hash(PASSWORD, 4);
    const created = await createBlessBoardUser(pool, {
      email: `${uniq("nofall")}@example.org`,
      displayName: "No Email Fallback",
      passwordHash: hash,
      phoneNormalized: phone,
      phoneDisplay: phone,
    });
    assert.equal(created.ok, true);
    const missing = await assignBlessBoardRole(pool, {
      userId: "00000000-0000-4000-8000-000000000099",
      email: created.user.email_normalized || `${uniq("ghost")}@example.org`,
      organizationKey: "nonexistent-org-key-for-fallback",
      roleKey: "church_hq_admin",
      churchKey: "nonexistent-org-key-for-fallback",
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.status, ROLE_STATUS.USER_NOT_FOUND);
    assert.equal(missing.diagnostics.resolvedByUserId, true);
    assert.equal(missing.diagnostics.resolvedByEmail, false);
  });
});
