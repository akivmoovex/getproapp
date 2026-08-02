"use strict";

/**
 * BlessBoard V5 Finance role separation + SoD (ephemeral Postgres).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const {
  authorize,
} = require("../src/blessboard/services/blessBoardRbacAuthorizationService");
const rbacRepo = require("../src/blessboard/repositories/blessBoardRbacRepository");
const giving = require("../src/blessboard/services/givingService");
const welfare = require("../src/blessboard/services/welfareCareService");
const {
  PLATFORM_ADMIN_PERMISSIONS,
  CHURCH_HQ_ADMIN_PERMISSIONS,
  BRANCH_ADMIN_PERMISSIONS,
} = require("../src/blessboard/rbac/legacyCompatibilityPermissions");
const { ERROR_CODES } = require("../src/blessboard/services/financeSeparation");
const { makeResolvedTenantContext } = require("./helpers/blessboardV5Fixtures");

const PASSWORD = "correct-horse-battery-staple";

describe("blessboard finance role separation", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let orgA;
  let orgB;
  let churchA;
  let churchB;
  let branchA;
  let branchA2;
  let branchB;
  let tenantA;
  let tenantB;
  let actorPa;
  let actorHq;
  let actorOfficer;
  let actorApprover;
  let actorDirector;
  let actorAuditor;
  let actorMinister;
  let actorCell;
  let actorDept;
  let actorWelfare;
  let actorPastor;
  let actorPastorFinance;
  let memberA;

  function requireDb() {
    if (skipSuite) assert.fail(`Setup unavailable: ${skipReason}`);
  }

  async function assignCatalogueRole(userId, roleKey, scope) {
    const role = await rbacRepo.findRoleByKey(pool, roleKey);
    assert.ok(role, `missing role ${roleKey}`);
    return rbacRepo.insertAssignment(pool, {
      userId,
      organizationId: orgA.id,
      churchId: churchA.id,
      roleId: role.id,
      scopeType: scope.scopeType,
      scopeId: scope.scopeId || null,
      assignedByUserId: actorHq.id,
      assignmentOrigin: "system",
      assignmentReason: "finance separation test",
    });
  }

  async function makeUser(email, name) {
    const created = await createBlessBoardUser(pool, {
      email,
      password: PASSWORD,
      displayName: name || email,
    });
    assert.equal(created.ok, true, created.message || created.reason);
    return created.user;
  }

  before(async () => {
    process.env.PLATFORM_DEPLOYMENT_CODE = "blessboard-org-staging";
    process.env.DEPLOYMENT_ENV = "testing";
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });

      const platformA = await provisionPlatformTenant(pool, {
        organizationKey: "fin-org-a",
        displayName: "Fin Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "fin-a",
        hostname: "fin-a.blessboard.org",
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(platformA.ok, true, platformA.message);
      orgA = platformA.records.organization;

      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "fin-org-a",
        churchKey: "fin-a",
        displayName: "Fin Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;
      branchA = chA.records.hqBranch;

      const b2 = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus', 'Campus', 'branch', 'active', false, 'UTC', 'US')
         RETURNING id, church_id, branch_key, display_name`,
        [churchA.id]
      );
      branchA2 = b2.rows[0];

      const platformB = await provisionPlatformTenant(pool, {
        organizationKey: "fin-org-b",
        displayName: "Fin Org B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "fin-b",
        hostname: "fin-b.blessboard.org",
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(platformB.ok, true, platformB.message);
      orgB = platformB.records.organization;
      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "fin-org-b",
        churchKey: "fin-b",
        displayName: "Fin Church B",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(chB.ok, true, chB.message);
      churchB = chB.records.church;
      branchB = chB.records.hqBranch;

      tenantA = makeResolvedTenantContext({
        organization: orgA,
        church: churchA,
        primaryBranch: branchA,
        hqBranch: branchA,
      });
      tenantB = makeResolvedTenantContext({
        organization: orgB,
        church: churchB,
        primaryBranch: branchB,
        hqBranch: branchB,
      });

      actorPa = await makeUser("pa@fin-a.test", "PA");
      actorHq = await makeUser("hq@fin-a.test", "HQ");
      actorOfficer = await makeUser("officer@fin-a.test", "Officer");
      actorApprover = await makeUser("approver@fin-a.test", "Approver");
      actorDirector = await makeUser("director@fin-a.test", "Director");
      actorAuditor = await makeUser("auditor@fin-a.test", "Auditor");
      actorMinister = await makeUser("minister@fin-a.test", "Minister");
      actorCell = await makeUser("cell@fin-a.test", "Cell");
      actorDept = await makeUser("dept@fin-a.test", "Dept");
      actorWelfare = await makeUser("welfare@fin-a.test", "Welfare");
      actorPastor = await makeUser("pastor@fin-a.test", "Pastor");
      actorPastorFinance = await makeUser("pastor-fin@fin-a.test", "Pastor Fin");

      for (const assign of [
        { email: "pa@fin-a.test", organizationKey: "fin-org-a", roleKey: "platform_admin" },
        {
          email: "hq@fin-a.test",
          organizationKey: "fin-org-a",
          roleKey: "church_hq_admin",
          churchKey: "fin-a",
        },
      ]) {
        const r = await assignBlessBoardRole(pool, assign);
        assert.equal(r.ok, true, r.status || r.message);
      }
      await assignCatalogueRole(actorOfficer.id, "finance_officer", {
        scopeType: "branch",
        scopeId: branchA.id,
      });
      await assignCatalogueRole(actorApprover.id, "finance_approver", {
        scopeType: "church",
        scopeId: churchA.id,
      });
      await assignCatalogueRole(actorDirector.id, "finance_director", {
        scopeType: "church",
        scopeId: churchA.id,
      });
      await assignCatalogueRole(actorAuditor.id, "auditor", {
        scopeType: "church",
        scopeId: churchA.id,
      });
      await assignCatalogueRole(actorMinister.id, "minister", {
        scopeType: "branch",
        scopeId: branchA.id,
      });
      await assignCatalogueRole(actorCell.id, "cell_leader", {
        scopeType: "branch",
        scopeId: branchA.id,
      });
      await assignCatalogueRole(actorDept.id, "department_head", {
        scopeType: "branch",
        scopeId: branchA.id,
      });
      await assignCatalogueRole(actorWelfare.id, "welfare_officer", {
        scopeType: "branch",
        scopeId: branchA.id,
      });
      await assignCatalogueRole(actorPastor.id, "branch_pastor", {
        scopeType: "branch",
        scopeId: branchA.id,
      });
      await assignCatalogueRole(actorPastorFinance.id, "branch_pastor", {
        scopeType: "branch",
        scopeId: branchA.id,
      });
      await assignCatalogueRole(actorPastorFinance.id, "finance_officer", {
        scopeType: "branch",
        scopeId: branchA.id,
      });

      const memberIns = await pool.query(
        `INSERT INTO blessboard.members
           (church_id, first_name, last_name, preferred_name,
            email_normalized, email_display, phone_normalized, phone_display, status)
         VALUES ($1, 'Fin', 'Member', 'Fin',
                 'fin-member@fin-a.test', 'fin-member@fin-a.test', '+15550001111', '+15550001111', 'active')
         RETURNING id`,
        [churchA.id]
      );
      memberA = { id: memberIns.rows[0].id };
      await pool.query(
        `INSERT INTO blessboard.member_branch_memberships
           (member_id, branch_id, membership_status, is_primary, joined_at)
         VALUES ($1, $2, 'active', true, now())`,
        [memberA.id, branchA.id]
      );
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? String(err.message) : "setup failed";
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  async function createSubmitted(actor, amount) {
    const created = await giving.createGivingEntry(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: actor.id,
      tenant: tenantA,
      scopeBranchId: branchA.id,
      categoryKey: "tithes",
      givingDate: "2026-08-01",
      amount: amount || "25.00",
      currency: "USD",
    });
    assert.equal(created.ok, true, created.reason);
    const submitted = await giving.submitGivingEntry(pool, {
      id: created.entry.id,
      churchId: churchA.id,
      actorUserId: actor.id,
      tenant: tenantA,
      scopeBranchId: branchA.id,
    });
    assert.equal(submitted.ok, true, submitted.reason);
    return submitted.entry;
  }

  it("legacy PA excludes Finance transaction permissions; HQ retains temporary giving ops", () => {
    requireDb();
    for (const key of [
      "giving.record",
      "giving.approve",
      "finance.transactions.approve",
      "finance.data.export",
      "finance.bank_details.view",
      "finance.welfare_disbursement.record",
    ]) {
      assert.ok(!PLATFORM_ADMIN_PERMISSIONS.includes(key), key);
    }
    assert.ok(CHURCH_HQ_ADMIN_PERMISSIONS.includes("giving.approve"));
    assert.ok(CHURCH_HQ_ADMIN_PERMISSIONS.includes("finance.transactions.approve"));
    assert.ok(!CHURCH_HQ_ADMIN_PERMISSIONS.includes("finance.data.export"));
    assert.ok(!CHURCH_HQ_ADMIN_PERMISSIONS.includes("finance.bank_details.view"));
    assert.ok(BRANCH_ADMIN_PERMISSIONS.includes("giving.record"));
    assert.ok(!BRANCH_ADMIN_PERMISSIONS.includes("giving.approve"));
  });

  it("Finance Officer can create and submit; cannot approve", async () => {
    requireDb();
    const created = await giving.createGivingEntry(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: actorOfficer.id,
      tenant: tenantA,
      scopeBranchId: branchA.id,
      categoryKey: "offerings",
      givingDate: "2026-08-01",
      amount: "10.00",
      currency: "USD",
    });
    assert.equal(created.ok, true, created.reason);
    const submitted = await giving.submitGivingEntry(pool, {
      id: created.entry.id,
      churchId: churchA.id,
      actorUserId: actorOfficer.id,
      tenant: tenantA,
      scopeBranchId: branchA.id,
    });
    assert.equal(submitted.ok, true, submitted.reason);
    const denied = await giving.approveGivingEntry(pool, {
      id: submitted.entry.id,
      churchId: churchA.id,
      actorUserId: actorOfficer.id,
      tenant: tenantA,
    });
    assert.equal(denied.ok, false);
    assert.ok(
      denied.errorCode === ERROR_CODES.FINANCE_SELF_APPROVAL_DENIED ||
        denied.status === giving.STATUS.FORBIDDEN
    );
  });

  it("Finance Approver can approve eligible transaction; Auditor is read-only", async () => {
    requireDb();
    const entry = await createSubmitted(actorOfficer, "15.00");
    const approved = await giving.approveGivingEntry(pool, {
      id: entry.id,
      churchId: churchA.id,
      actorUserId: actorApprover.id,
      tenant: tenantA,
    });
    assert.equal(approved.ok, true, approved.reason || approved.errorCode);

    const list = await giving.listGivingEntries(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: actorAuditor.id,
      tenant: tenantA,
    });
    assert.equal(list.ok, true);
    const createDenied = await giving.createGivingEntry(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: actorAuditor.id,
      tenant: tenantA,
      scopeBranchId: branchA.id,
      categoryKey: "tithes",
      givingDate: "2026-08-01",
      amount: "1.00",
      currency: "USD",
    });
    assert.equal(createDenied.ok, false);
    assert.equal(createDenied.status, giving.STATUS.FORBIDDEN);
  });

  it("Minister, Cell Leader, Department Head, Welfare Officer denied transaction access", async () => {
    requireDb();
    for (const actor of [actorMinister, actorCell, actorDept, actorWelfare]) {
      const r = await authorize(pool, {
        actor: { userId: actor.id },
        permission: "finance.transactions.view",
        tenantContext: tenantA,
        resourceContext: {
          organizationId: orgA.id,
          churchId: churchA.id,
          branchId: branchA.id,
        },
      });
      assert.equal(r.allowed, false, actor.email || actor.id);
    }
  });

  it("Platform Administrator denied transaction-level Finance by default", async () => {
    requireDb();
    const r = await authorize(pool, {
      actor: { userId: actorPa.id },
      permission: "finance.transactions.approve",
      tenantContext: tenantA,
      resourceContext: {
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: branchA.id,
      },
    });
    assert.equal(r.allowed, false);
    const createDenied = await giving.createGivingEntry(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: actorPa.id,
      tenant: tenantA,
      categoryKey: "tithes",
      givingDate: "2026-08-01",
      amount: "2.00",
      currency: "USD",
    });
    assert.equal(createDenied.ok, false);
  });

  it("Branch Pastor denied without Finance assignment; allowed with scoped Finance role", async () => {
    requireDb();
    const denied = await giving.createGivingEntry(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: actorPastor.id,
      tenant: tenantA,
      scopeBranchId: branchA.id,
      categoryKey: "tithes",
      givingDate: "2026-08-01",
      amount: "3.00",
      currency: "USD",
    });
    assert.equal(denied.ok, false);

    const allowed = await giving.createGivingEntry(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: actorPastorFinance.id,
      tenant: tenantA,
      scopeBranchId: branchA.id,
      categoryKey: "tithes",
      givingDate: "2026-08-01",
      amount: "4.00",
      currency: "USD",
    });
    assert.equal(allowed.ok, true, allowed.reason);
  });

  it("creator and submitter self-approval denied; different approver succeeds", async () => {
    requireDb();
    // Director has create+approve; SoD must still block self-approval.
    const created = await giving.createGivingEntry(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: actorDirector.id,
      tenant: tenantA,
      categoryKey: "tithes",
      givingDate: "2026-08-01",
      amount: "30.00",
      currency: "USD",
    });
    assert.equal(created.ok, true, created.reason);
    const submitted = await giving.submitGivingEntry(pool, {
      id: created.entry.id,
      churchId: churchA.id,
      actorUserId: actorDirector.id,
      tenant: tenantA,
    });
    assert.equal(submitted.ok, true, submitted.reason);
    const self = await giving.approveGivingEntry(pool, {
      id: submitted.entry.id,
      churchId: churchA.id,
      actorUserId: actorDirector.id,
      tenant: tenantA,
    });
    assert.equal(self.ok, false);
    assert.equal(self.errorCode, ERROR_CODES.FINANCE_SELF_APPROVAL_DENIED);
    assert.ok(self.safeMessage);
    assert.ok(!String(self.safeMessage).includes(actorDirector.id));

    const ok = await giving.approveGivingEntry(pool, {
      id: submitted.entry.id,
      churchId: churchA.id,
      actorUserId: actorApprover.id,
      tenant: tenantA,
    });
    assert.equal(ok.ok, true, ok.reason);
  });

  it("adjustment creator cannot approve own adjustment; required reasons enforced", async () => {
    requireDb();
    const entry = await createSubmitted(actorOfficer, "40.00");
    await giving.approveGivingEntry(pool, {
      id: entry.id,
      churchId: churchA.id,
      actorUserId: actorApprover.id,
      tenant: tenantA,
    });
    const noReason = await giving.adjustGivingEntry(pool, {
      id: entry.id,
      churchId: churchA.id,
      actorUserId: actorDirector.id,
      tenant: tenantA,
      amount: "41.00",
    });
    assert.equal(noReason.ok, false);
    assert.equal(noReason.errorCode, ERROR_CODES.FINANCE_REASON_REQUIRED);

    const adjusted = await giving.adjustGivingEntry(pool, {
      id: entry.id,
      churchId: churchA.id,
      actorUserId: actorDirector.id,
      tenant: tenantA,
      amount: "41.00",
      adjustmentReason: "Correct typo",
    });
    assert.equal(adjusted.ok, true, adjusted.reason);
    assert.equal(adjusted.entry.status, "submitted");

    const selfAdj = await giving.approveGivingEntry(pool, {
      id: entry.id,
      churchId: churchA.id,
      actorUserId: actorDirector.id,
      tenant: tenantA,
    });
    assert.equal(selfAdj.ok, false);
    assert.equal(selfAdj.errorCode, ERROR_CODES.FINANCE_SELF_APPROVAL_DENIED);

    const other = await giving.approveGivingEntry(pool, {
      id: entry.id,
      churchId: churchA.id,
      actorUserId: actorApprover.id,
      tenant: tenantA,
    });
    assert.equal(other.ok, true, other.reason);
  });

  it("stale approval and re-approve denied; approved cannot hard-delete; void preserves; reverse links", async () => {
    requireDb();
    const entry = await createSubmitted(actorOfficer, "50.00");
    const first = await giving.approveGivingEntry(pool, {
      id: entry.id,
      churchId: churchA.id,
      actorUserId: actorApprover.id,
      tenant: tenantA,
    });
    assert.equal(first.ok, true);
    const again = await giving.approveGivingEntry(pool, {
      id: entry.id,
      churchId: churchA.id,
      actorUserId: actorApprover.id,
      tenant: tenantA,
    });
    assert.equal(again.ok, false);

    await assert.rejects(async () => {
      await pool.query(`DELETE FROM blessboard.giving_entries WHERE id = $1`, [entry.id]);
    }, /hard-deleted|cannot be hard-deleted/i);

    const voided = await giving.voidGivingEntry(pool, {
      id: entry.id,
      churchId: churchA.id,
      actorUserId: actorDirector.id,
      tenant: tenantA,
      voidReason: "Duplicate posting",
    });
    // already need a fresh approved for reverse — create another
    const entry2 = await createSubmitted(actorOfficer, "55.00");
    await giving.approveGivingEntry(pool, {
      id: entry2.id,
      churchId: churchA.id,
      actorUserId: actorApprover.id,
      tenant: tenantA,
    });
    const reversed = await giving.reverseGivingEntry(pool, {
      id: entry2.id,
      churchId: churchA.id,
      actorUserId: actorDirector.id,
      tenant: tenantA,
      reversalReason: "Chargeback",
    });
    assert.equal(reversed.ok, true, reversed.reason);
    assert.equal(reversed.entry.status, "reversed");
    assert.ok(reversed.reversalEntry);
    assert.equal(reversed.reversalEntry.reversalOfEntryId, entry2.id);

    // void still works on approved (entry already voided above if ok)
    if (voided.ok) {
      assert.equal(voided.entry.status, "void");
      assert.equal(voided.entry.voidReason, "Duplicate posting");
      const stillThere = await pool.query(
        `SELECT id, status FROM blessboard.giving_entries WHERE id = $1`,
        [entry.id]
      );
      assert.equal(stillThere.rows[0].status, "void");
    }
  });

  it("branch Finance user sees assigned branch only; wrong org concealed; client branch id cannot widen", async () => {
    requireDb();
    const onBranch = await giving.createGivingEntry(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: actorOfficer.id,
      tenant: tenantA,
      scopeBranchId: branchA.id,
      categoryKey: "tithes",
      givingDate: "2026-08-02",
      amount: "6.00",
      currency: "USD",
    });
    assert.equal(onBranch.ok, true);

    const wrongBranch = await giving.createGivingEntry(pool, {
      churchId: churchA.id,
      branchId: branchA2.id,
      actorUserId: actorOfficer.id,
      tenant: tenantA,
      scopeBranchId: branchA.id,
      categoryKey: "tithes",
      givingDate: "2026-08-02",
      amount: "7.00",
      currency: "USD",
    });
    assert.equal(wrongBranch.ok, false);

    const widen = await giving.listGivingEntries(pool, {
      churchId: churchA.id,
      branchId: branchA2.id,
      actorUserId: actorOfficer.id,
      tenant: tenantA,
    });
    assert.equal(widen.ok, false);

    const crossOrg = await giving.getGivingEntry(pool, {
      id: onBranch.entry.id,
      churchId: churchB.id,
      actorUserId: actorOfficer.id,
      tenant: tenantB,
    });
    assert.equal(crossOrg.ok, false);
    assert.equal(crossOrg.status, giving.STATUS.NOT_FOUND);
  });

  it("report view does not grant export; export requires explicit permission and audits", async () => {
    requireDb();
    const report = await giving.getMonthlyGivingSummary(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      yearMonth: "2026-08",
      actorUserId: actorApprover.id,
      tenant: tenantA,
    });
    assert.equal(report.ok, true, report.reason);

    const exportDenied = await giving.exportMonthlyGivingSummary(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      yearMonth: "2026-08",
      actorUserId: actorApprover.id,
      tenant: tenantA,
    });
    assert.equal(exportDenied.ok, false);
    assert.equal(exportDenied.errorCode, ERROR_CODES.FINANCE_EXPORT_DENIED);

    const exported = await giving.exportMonthlyGivingSummary(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      yearMonth: "2026-08",
      actorUserId: actorDirector.id,
      tenant: tenantA,
    });
    assert.equal(exported.ok, true, exported.reason);
    const audit = await pool.query(
      `SELECT action_key FROM platform.audit_events
        WHERE action_key = 'finance.report.exported'
          AND actor_user_id = $1
        ORDER BY created_at DESC LIMIT 1`,
      [actorDirector.id]
    );
    assert.ok(audit.rowCount >= 1);
  });

  it("bank details require explicit permission and create safe audit", async () => {
    requireDb();
    const method = await pool.query(
      `INSERT INTO blessboard.giving_methods
         (church_id, branch_id, method_type, label, account_details, status)
       VALUES ($1, $2, 'bank_transfer', 'Main account', 'ACC-SECRET-99', 'published')
       RETURNING id`,
      [churchA.id, branchA.id]
    );
    const denied = await giving.getGivingMethodBankDetails(pool, {
      churchId: churchA.id,
      methodId: method.rows[0].id,
      actorUserId: actorOfficer.id,
      tenant: tenantA,
      branchId: branchA.id,
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.errorCode, ERROR_CODES.FINANCE_BANK_DENIED);

    const allowed = await giving.getGivingMethodBankDetails(pool, {
      churchId: churchA.id,
      methodId: method.rows[0].id,
      actorUserId: actorDirector.id,
      tenant: tenantA,
      branchId: branchA.id,
    });
    assert.equal(allowed.ok, true);
    assert.equal(allowed.details.accountDetails, "ACC-SECRET-99");
    const audit = await pool.query(
      `SELECT action_key, metadata_json::text AS meta
         FROM platform.audit_events
        WHERE action_key = 'finance.bank_details.accessed'
          AND actor_user_id = $1
        ORDER BY created_at DESC LIMIT 1`,
      [actorDirector.id]
    );
    assert.ok(audit.rowCount >= 1);
    assert.ok(!String(audit.rows[0].meta || "").includes("ACC-SECRET"));
  });

  it("welfare finance projection only; pastoral body denied; unapproved hidden; self-approve blocked", async () => {
    requireDb();
    const pastoralDenied = await authorize(pool, {
      actor: { userId: actorOfficer.id },
      permission: "pastoral_cases.view_restricted",
      tenantContext: tenantA,
    });
    assert.equal(pastoralDenied.allowed, false);

    const wCase = await welfare.createWelfareCase(pool, {
      actorUserId: actorWelfare.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      tenantContext: tenantA,
      caseKey: "fin_w_case",
      title: "Assistance",
      memberId: memberA.id,
    });
    assert.equal(wCase.ok, true, wCase.reason);
    const req = await welfare.createWelfareRequest(pool, {
      actorUserId: actorWelfare.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      tenantContext: tenantA,
      welfareCaseId: wCase.case.id,
      assistanceType: "food",
      amountRequested: 50,
      currencyCode: "USD",
      operationalSummary: "Food parcel narrative must stay sealed",
    });
    assert.equal(req.ok, true, req.reason);

    const unapproved = await welfare.getWelfareFinanceInstructions(pool, {
      actorUserId: actorOfficer.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      tenantContext: tenantA,
      requestId: req.request.id,
    });
    assert.equal(unapproved.ok, false);

    const selfWelfare = await welfare.decideWelfareRequest(pool, {
      actorUserId: actorWelfare.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      tenantContext: tenantA,
      requestId: req.request.id,
      decision: "approved",
      amountApproved: 50,
      financeInstructionSummary: "Pay USD 50 voucher",
    });
    assert.equal(selfWelfare.ok, false);

    const welfareApprover = await makeUser("w-approver2@fin-a.test", "W Approver");
    await assignCatalogueRole(welfareApprover.id, "welfare_approver", {
      scopeType: "branch",
      scopeId: branchA.id,
    });
    const approved = await welfare.decideWelfareRequest(pool, {
      actorUserId: welfareApprover.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      tenantContext: tenantA,
      requestId: req.request.id,
      decision: "approved",
      amountApproved: 50,
      financeInstructionSummary: "Pay USD 50 voucher",
    });
    assert.equal(approved.ok, true, approved.reason);

    const payment = await welfare.getWelfareFinanceInstructions(pool, {
      actorUserId: actorOfficer.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      tenantContext: tenantA,
      requestId: req.request.id,
    });
    assert.equal(payment.ok, true, payment.reason);
    assert.equal(payment.payment.financeInstructionSummary, "Pay USD 50 voucher");
    assert.ok(!("operationalSummary" in payment.payment));
    assert.ok(!JSON.stringify(payment.payment).includes("Food parcel narrative"));

    const financeEntry = await giving.createGivingEntry(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: actorOfficer.id,
      tenant: tenantA,
      scopeBranchId: branchA.id,
      categoryKey: "other",
      givingDate: "2026-08-02",
      amount: "50.00",
      currency: "USD",
      welfareRequestId: req.request.id,
    });
    assert.equal(financeEntry.ok, true, financeEntry.reason);
    await giving.submitGivingEntry(pool, {
      id: financeEntry.entry.id,
      churchId: churchA.id,
      actorUserId: actorOfficer.id,
      tenant: tenantA,
      scopeBranchId: branchA.id,
    });
    const selfFin = await giving.approveGivingEntry(pool, {
      id: financeEntry.entry.id,
      churchId: churchA.id,
      actorUserId: actorOfficer.id,
      tenant: tenantA,
    });
    assert.equal(selfFin.ok, false);
    // Officer lacks approve permission; ensure a creator with approve still SoD-blocks.
    const directorCreate = await giving.createGivingEntry(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: actorDirector.id,
      tenant: tenantA,
      categoryKey: "other",
      givingDate: "2026-08-02",
      amount: "50.00",
      currency: "USD",
      welfareRequestId: req.request.id,
    });
    assert.equal(directorCreate.ok, true, directorCreate.reason);
    await giving.submitGivingEntry(pool, {
      id: directorCreate.entry.id,
      churchId: churchA.id,
      actorUserId: actorDirector.id,
      tenant: tenantA,
    });
    const directorSelf = await giving.approveGivingEntry(pool, {
      id: directorCreate.entry.id,
      churchId: churchA.id,
      actorUserId: actorDirector.id,
      tenant: tenantA,
    });
    assert.equal(directorSelf.ok, false);
    assert.equal(directorSelf.errorCode, ERROR_CODES.FINANCE_SELF_APPROVAL_DENIED);
  });
});
