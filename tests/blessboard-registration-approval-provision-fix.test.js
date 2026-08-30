"use strict";

/**
 * Focused approval/provisioning fixes:
 * - duplicate_review + Foundation approve
 * - safe email reuse vs identity conflict
 * - draft pages without revision_number (pre-043 schema)
 * - rollback / retry / double-approve
 * - diagnostic logging without secrets
 * - sequential client.query on one TX client
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");
const crypto = require("crypto");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const appRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  provisionRegisteredBlessBoardChurch,
  STATUS,
  classifyExistingAdministratorIdentity,
  extractProvisionErrorDiagnostics,
} = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const {
  approveAndProvisionRegistrationApplication,
} = require("../src/blessboard/services/registrationApplicationsAdminService");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const {
  sanitizeRegistrationTraceFields,
} = require("../src/blessboard/services/registrationTraceLog");

const DEPLOYMENT = "blessboard-org-staging";
const PASSWORD = "TestPassword99!";

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

describe("registration approval provision fix", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let platformAdmin = null;

  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });

      const key = uniq("fixpa");
      const email = `pa-${key}@example.org`;
      const user = await createBlessBoardUser(pool, {
        email,
        password: PASSWORD,
        displayName: "Fix Platform Admin",
      });
      assert.equal(user.ok, true, user.message);

      const bootApp = await appRepo.createApplication(pool, {
        church_name: `Fix PA Church ${key}`,
        country: "Kenya",
        city: "Nairobi",
        contact_name: "PA",
        contact_email: `${uniq("boot")}@example.org`,
        contact_phone: `+2547${String(Date.now()).slice(-7)}`,
        contact_phone_normalized: `+2547${String(Date.now()).slice(-7)}`,
        selected_plan: "foundation",
        consent_terms: true,
      });
      const provisioned = await provisionRegisteredBlessBoardChurch(pool, {
        applicationId: bootApp.id,
        administratorPassword: PASSWORD,
        requestedOrganizationKey: key,
        actorContext: {
          type: "test",
          source: "approval-fix",
          dataEnvironment: "testing",
          deploymentCode: DEPLOYMENT,
        },
      });
      assert.equal(provisioned.ok, true, provisioned.message || provisioned.status);
      const role = await assignBlessBoardRole(pool, {
        email,
        organizationKey: provisioned.records.organizationKey,
        roleKey: "platform_admin",
      });
      assert.equal(role.ok, true, role.message);
      platformAdmin = {
        userId: user.user.id,
        email,
        organizationId: provisioned.records.organizationId,
      };
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  async function insertFoundationApp(overrides = {}) {
    const key = uniq("fapp");
    const phoneTail = String(Date.now() + Math.floor(Math.random() * 9000)).slice(-7);
    return appRepo.createApplication(pool, {
      church_name: overrides.church_name || `Foundation ${key}`,
      country: "Kenya",
      city: "Nairobi",
      contact_name: overrides.contact_name || "Applicant",
      contact_email: overrides.contact_email || `${key}@example.org`,
      contact_phone: overrides.contact_phone || `+2547${phoneTail}`,
      contact_phone_normalized: overrides.contact_phone_normalized || `+2547${phoneTail}`,
      selected_plan: overrides.selected_plan || "foundation",
      consent_terms: true,
      branch_name: overrides.branch_name || "Main Campus",
    });
  }

  it("classifies safe vs conflicting administrator identities", () => {
    assert.equal(classifyExistingAdministratorIdentity(null).ok, true);
    assert.equal(classifyExistingAdministratorIdentity({ id: "1", status: "active" }).reuse, true);
    assert.equal(classifyExistingAdministratorIdentity({ id: "1", status: "invited" }).reuse, true);
    assert.equal(classifyExistingAdministratorIdentity({ id: "1", status: "suspended" }).ok, false);
    assert.equal(classifyExistingAdministratorIdentity({ id: "1", status: "inactive" }).ok, false);
  });

  it("extractProvisionErrorDiagnostics redacts connection strings and keeps pg fields", () => {
    const err = new Error("insert failed postgresql://user:secret@host/db");
    err.name = "DatabaseError";
    err.code = "42703";
    err.constraint = "x";
    err.table = "public_pages";
    err.schema = "blessboard";
    const d = extractProvisionErrorDiagnostics(err);
    assert.equal(d.postgresCode, "42703");
    assert.equal(d.table, "public_pages");
    assert.equal(d.schema, "blessboard");
    assert.equal(d.constraint, "x");
    const sanitized = sanitizeRegistrationTraceFields({
      event: "church_registration_transaction",
      postgresCode: d.postgresCode,
      errorName: d.errorName,
      constraint: d.constraint,
      table: d.table,
      schema: d.schema,
      provisioningStage: "ensure_draft_website",
      password: "secret",
      email: "leak@example.org",
    });
    assert.equal(sanitized.postgresCode, "42703");
    assert.equal(sanitized.provisioningStage, "ensure_draft_website");
    assert.equal(sanitized.password, undefined);
    assert.equal(sanitized.email, undefined);
  });

  it("approves a normal submitted Foundation application", async () => {
    requireDb();
    const key = uniq("norm");
    const app = await insertFoundationApp({ church_name: `Normal ${key}` });
    const approved = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: app.id,
      actorUserId: platformAdmin.userId,
      organizationKey: key,
      deploymentCode: DEPLOYMENT,
      dataEnvironment: "testing",
    });
    assert.equal(approved.ok, true, approved.message || approved.status);
    assert.equal(approved.records.planKey, "free");
    assert.equal(approved.records.applicationStatus, "closed");
    assert.equal(approved.records.provisioningStatus, "provisioned");
    const sub = await pool.query(
      `SELECT p.plan_key FROM platform.organization_subscriptions s
         JOIN platform.plans p ON p.id = s.plan_id
        WHERE s.organization_id = $1`,
      [approved.records.organizationId]
    );
    assert.equal(sub.rows[0].plan_key, "free");
  });

  it("approves a duplicate_review Foundation application", async () => {
    requireDb();
    const key = uniq("duprev");
    const existingEmail = `${uniq("exist")}@example.org`;
    await createBlessBoardUser(pool, {
      email: existingEmail,
      password: PASSWORD,
      displayName: "Existing",
    });
    const app = await insertFoundationApp({
      church_name: `Dup Review ${key}`,
      contact_email: existingEmail,
    });
    await appRepo.updateApplicationRiskReviewState(pool, app.id, {
      applicationStatus: "duplicate_review",
      riskDecision: "review_required",
      riskReasonCodes: ["duplicate_email"],
    });
    const approved = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: app.id,
      actorUserId: platformAdmin.userId,
      organizationKey: key,
      deploymentCode: DEPLOYMENT,
      dataEnvironment: "testing",
    });
    assert.equal(approved.ok, true, approved.message || approved.status);
    assert.equal(approved.records.administratorLinkedExisting, true);
    const roles = await pool.query(
      `SELECT role_key FROM blessboard.user_roles
        WHERE user_id = $1 AND organization_id = $2 AND status = 'active'
        ORDER BY role_key`,
      [approved.records.administratorUserId, approved.records.organizationId]
    );
    assert.deepEqual(
      roles.rows.map((r) => r.role_key),
      ["branch_admin", "church_hq_admin"]
    );
  });

  it("rejects suspended identity with clear conflict (no org created)", async () => {
    requireDb();
    const key = uniq("sus");
    const email = `${uniq("sus")}@example.org`;
    await createBlessBoardUser(pool, {
      email,
      password: PASSWORD,
      displayName: "Suspended Person",
    });
    await pool.query(`UPDATE blessboard.users SET status = 'suspended' WHERE email_normalized = $1`, [
      email.toLowerCase(),
    ]);
    const app = await insertFoundationApp({
      church_name: `Sus Church ${key}`,
      contact_email: email,
    });
    await appRepo.updateApplicationRiskReviewState(pool, app.id, {
      applicationStatus: "duplicate_review",
      riskDecision: "review_required",
      riskReasonCodes: ["duplicate_email"],
    });
    const approved = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: app.id,
      actorUserId: platformAdmin.userId,
      organizationKey: key,
      deploymentCode: DEPLOYMENT,
      dataEnvironment: "testing",
    });
    assert.equal(approved.ok, false);
    assert.equal(approved.message, "identity_conflict");
    const orgs = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE organization_key = $1`,
      [key]
    );
    assert.equal(orgs.rows[0].n, 0);
    const row = await appRepo.findApplicationById(pool, app.id);
    assert.equal(row.organization_id, null);
    assert.notEqual(row.provisioning_status, "provisioned");
  });

  it("duplicate organization slug fails without partial tenant", async () => {
    requireDb();
    const key = uniq("taken");
    await provisionPlatformTenant(pool, {
      organizationKey: key,
      displayName: "Taken",
      dataEnvironment: "testing",
      productKey: "blessboard",
      productTenantKey: key,
      hostname: `${key}.blessboard.test`,
      domainType: "canonical",
      deploymentCode: DEPLOYMENT,
    });
    const app = await insertFoundationApp({ church_name: `Clash ${key}` });
    const approved = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: app.id,
      actorUserId: platformAdmin.userId,
      organizationKey: key,
      deploymentCode: DEPLOYMENT,
      dataEnvironment: "testing",
    });
    assert.equal(approved.ok, false);
    const churches = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.churches WHERE church_key = $1`,
      [key]
    );
    assert.equal(churches.rows[0].n, 0);
  });

  it("failed provisioning rolls back and allows retry after correction", async () => {
    requireDb();
    const key = uniq("retry");
    const app = await insertFoundationApp({ church_name: `Retry ${key}` });

    let calls = 0;
    const failingProvision = async (db, input, options) => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: false,
          status: STATUS.PROVISIONING_FAILED,
          message: "forced_failure",
        };
      }
      return provisionRegisteredBlessBoardChurch(db, input, options);
    };

    const first = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: app.id,
      actorUserId: platformAdmin.userId,
      organizationKey: key,
      deploymentCode: DEPLOYMENT,
      dataEnvironment: "testing",
      provisionFn: failingProvision,
    });
    assert.equal(first.ok, false);

    // Simulate orchestrator failure state after rollback (retryable category).
    await appRepo.updateApplicationProvisioningState(pool, app.id, {
      applicationStatus: "submitted",
      provisioningStatus: "provisioning_failed",
      provisioningFailedAt: new Date().toISOString(),
      provisioningErrorCode: STATUS.PROVISIONING_FAILED,
      provisioningErrorDetail: "forced_failure",
    });

    const second = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: app.id,
      actorUserId: platformAdmin.userId,
      organizationKey: key,
      deploymentCode: DEPLOYMENT,
      dataEnvironment: "testing",
      provisionFn: failingProvision,
    });
    assert.equal(second.ok, true, second.message || second.status);
    assert.equal(second.records.provisioningStatus, "provisioned");
  });

  it("double approve is idempotent (already provisioned)", async () => {
    requireDb();
    const key = uniq("dbl");
    const app = await insertFoundationApp({ church_name: `Double ${key}` });
    const first = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: app.id,
      actorUserId: platformAdmin.userId,
      organizationKey: key,
      deploymentCode: DEPLOYMENT,
      dataEnvironment: "testing",
    });
    assert.equal(first.ok, true);
    const second = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: app.id,
      actorUserId: platformAdmin.userId,
      organizationKey: key,
      deploymentCode: DEPLOYMENT,
      dataEnvironment: "testing",
    });
    assert.equal(second.ok, true);
    assert.equal(second.alreadyProvisioned, true);
    const counts = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE organization_key = $1`,
      [key]
    );
    assert.equal(counts.rows[0].n, 1);
  });

  it("provisions when public_pages.revision_number is absent (pre-043)", async () => {
    requireDb();
    await pool.query(`ALTER TABLE blessboard.public_pages DROP COLUMN IF EXISTS revision_number`);
    await pool.query(`ALTER TABLE blessboard.page_sections DROP COLUMN IF EXISTS revision_number`);

    const key = uniq("norev");
    const app = await insertFoundationApp({ church_name: `NoRev ${key}` });
    const approved = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: app.id,
      actorUserId: platformAdmin.userId,
      organizationKey: key,
      deploymentCode: DEPLOYMENT,
      dataEnvironment: "testing",
    });
    assert.equal(approved.ok, true, approved.message || approved.status);
    assert.equal(approved.records.provisioningStatus, "provisioned");
    const pages = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.public_pages WHERE church_id = $1 AND status = 'draft'`,
      [approved.records.churchId]
    );
    assert.equal(pages.rows[0].n, 8);
    const settings = await pool.query(
      `SELECT website_status FROM blessboard.church_settings WHERE church_id = $1`,
      [approved.records.churchId]
    );
    assert.equal(settings.rows[0].website_status, "draft");

    // Restore columns for later suites sharing this process DB if any.
    await pool.query(`
      ALTER TABLE blessboard.public_pages
        ADD COLUMN IF NOT EXISTS revision_number INTEGER NOT NULL DEFAULT 1`);
    await pool.query(`
      ALTER TABLE blessboard.page_sections
        ADD COLUMN IF NOT EXISTS revision_number INTEGER NOT NULL DEFAULT 1`);
  });

  it("does not run concurrent client.query on the same transaction client", async () => {
    requireDb();
    const key = uniq("seq");
    const app = await insertFoundationApp({ church_name: `Seq ${key}` });

    const realConnect = pool.connect.bind(pool);
    let concurrentHits = 0;
    pool.connect = async function patchedConnect() {
      const client = await realConnect();
      let inflight = 0;
      const realQuery = client.query.bind(client);
      client.query = function patchedQuery(...args) {
        if (inflight > 0) concurrentHits += 1;
        inflight += 1;
        const result = realQuery(...args);
        Promise.resolve(result).finally(() => {
          inflight -= 1;
        });
        return result;
      };
      return client;
    };

    try {
      const approved = await approveAndProvisionRegistrationApplication(pool, {
        applicationId: app.id,
        actorUserId: platformAdmin.userId,
        organizationKey: key,
        deploymentCode: DEPLOYMENT,
        dataEnvironment: "testing",
      });
      assert.equal(approved.ok, true, approved.message || approved.status);
      assert.equal(concurrentHits, 0);
    } finally {
      pool.connect = realConnect;
    }
  });

  it("orchestrator invitation mode accepts duplicate_review without pre-flip", async () => {
    requireDb();
    const key = uniq("direct");
    const email = `${uniq("direct")}@example.org`;
    await createBlessBoardUser(pool, {
      email,
      password: PASSWORD,
      displayName: "Direct",
    });
    const app = await insertFoundationApp({
      church_name: `Direct ${key}`,
      contact_email: email,
    });
    await appRepo.updateApplicationRiskReviewState(pool, app.id, {
      applicationStatus: "duplicate_review",
      riskDecision: "review_required",
      riskReasonCodes: ["duplicate_email"],
    });
    const result = await provisionRegisteredBlessBoardChurch(
      pool,
      {
        applicationId: app.id,
        requestedOrganizationKey: key,
        actorContext: {
          type: "platform_admin",
          source: "test",
          actorUserId: platformAdmin.userId,
          dataEnvironment: "testing",
          deploymentCode: DEPLOYMENT,
        },
      },
      { administratorViaInvitation: true, allowRetry: true }
    );
    assert.equal(result.ok, true, result.message || result.status);
    assert.equal(result.records.administratorLinkedExisting, true);
  });
});
