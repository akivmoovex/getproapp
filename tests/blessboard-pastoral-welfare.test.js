"use strict";

/**
 * BlessBoard V5 pastoral care + welfare confidentiality tests (ephemeral Postgres).
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
const pastoral = require("../src/blessboard/services/pastoralCareService");
const welfare = require("../src/blessboard/services/welfareCareService");
const {
  presentMemberRequestWithPastoralRedaction,
  REDACTED_MESSAGE,
} = require("../src/blessboard/services/memberRequestPastoralRedaction");
const {
  PLATFORM_ADMIN_PERMISSIONS,
  CHURCH_HQ_ADMIN_PERMISSIONS,
} = require("../src/blessboard/rbac/legacyCompatibilityPermissions");
const { makeResolvedTenantContext } = require("./helpers/blessboardV5Fixtures");
const { SAFE_BODIES } = require("../src/blessboard/services/pastoralWelfareNotify");

describe("blessboard pastoral welfare confidentiality", () => {
  let databaseUrl;
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let orgA;
  let orgB;
  let churchA;
  let churchB;
  let branchA;
  let branchB;
  let branchA2;
  let tenantA;
  let tenantB;
  let actorPa;
  let actorHq;
  let actorCell;
  let actorCellOther;
  let actorMinister;
  let actorPastor;
  let actorSafeguarding;
  let actorWelfare;
  let actorWelfareApprover;
  let actorFinance;
  let memberA;
  let cellA;

  function requireDb() {
    if (skipSuite) assert.fail(`Setup unavailable: ${skipReason}`);
  }

  before(async () => {
    process.env.PLATFORM_DEPLOYMENT_CODE = "blessboard-org-staging";
    process.env.DEPLOYMENT_ENV = "testing";
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });

      const platformA = await provisionPlatformTenant(pool, {
        organizationKey: "pw-org-a",
        displayName: "PW Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "pw-org-a",
        hostname: "pw-a.blessboard.test",
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      orgA = platformA.records.organization;

      const platformB = await provisionPlatformTenant(pool, {
        organizationKey: "pw-org-b",
        displayName: "PW Org B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "pw-org-b",
        hostname: "pw-b.blessboard.test",
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      orgB = platformB.records.organization;

      const churchProvA = await provisionBlessBoardChurch(pool, {
        organizationKey: "pw-org-a",
        churchKey: "pw-org-a",
        displayName: "PW Org A",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Headquarters",
      });
      churchA = churchProvA.records.church;
      branchA = churchProvA.records.hqBranch;

      const branch2 = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary)
         VALUES ($1, 'ndola', 'Ndola', 'branch', 'active', false)
         RETURNING id, branch_key`,
        [churchA.id]
      );
      branchA2 = { id: branch2.rows[0].id, key: branch2.rows[0].branch_key };

      const churchProvB = await provisionBlessBoardChurch(pool, {
        organizationKey: "pw-org-b",
        churchKey: "pw-org-b",
        displayName: "PW Org B",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Headquarters",
      });
      churchB = churchProvB.records.church;
      branchB = churchProvB.records.hqBranch;

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

      async function mkUser(email, name) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName: name,
          password: "Test-Password-123!",
        });
        if (!created.ok) throw new Error(`user create failed: ${created.message || created.reason}`);
        return created.user;
      }

      actorPa = await mkUser("pa@pw.test", "Platform Admin");
      actorHq = await mkUser("hq@pw-a.test", "HQ Admin");
      actorCell = await mkUser("cell@pw-a.test", "Cell Leader");
      actorCellOther = await mkUser("cell2@pw-a.test", "Other Cell");
      actorMinister = await mkUser("minister@pw-a.test", "Minister");
      actorPastor = await mkUser("pastor@pw-a.test", "Branch Pastor");
      actorSafeguarding = await mkUser("safe@pw-a.test", "Safeguarding");
      actorWelfare = await mkUser("welfare@pw-a.test", "Welfare Officer");
      actorWelfareApprover = await mkUser("wapprover@pw-a.test", "Welfare Approver");
      actorFinance = await mkUser("finance@pw-a.test", "Finance Officer");

      for (const assign of [
        { email: "pa@pw.test", organizationKey: "pw-org-a", roleKey: "platform_admin" },
        {
          email: "hq@pw-a.test",
          organizationKey: "pw-org-a",
          roleKey: "church_hq_admin",
          churchKey: "pw-org-a",
        },
      ]) {
        const r = await assignBlessBoardRole(pool, assign);
        if (!r.ok) throw new Error(`role assign failed: ${r.status || r.message}`);
      }

      async function assignCatalogueRole(userId, roleKey, scope) {
        const role = await rbacRepo.findRoleByKey(pool, roleKey);
        if (!role) throw new Error(`missing role ${roleKey}`);
        return rbacRepo.insertAssignment(pool, {
          userId,
          organizationId: orgA.id,
          churchId: churchA.id,
          roleId: role.id,
          scopeType: scope.scopeType,
          scopeId: scope.scopeId,
          assignedByUserId: actorHq.id,
          assignmentOrigin: "manual",
          assignmentReason: "pastoral welfare test",
        });
      }

      const cellIns = await pool.query(
        `INSERT INTO blessboard.cells (
           organization_id, church_id, branch_id, cell_key, display_name, status
         ) VALUES ($1,$2,$3,'alpha','Alpha','active')
         RETURNING id`,
        [orgA.id, churchA.id, branchA.id]
      );
      cellA = { id: cellIns.rows[0].id };

      const cellB = await pool.query(
        `INSERT INTO blessboard.cells (
           organization_id, church_id, branch_id, cell_key, display_name, status
         ) VALUES ($1,$2,$3,'beta','Beta','active')
         RETURNING id`,
        [orgA.id, churchA.id, branchA.id]
      );

      await assignCatalogueRole(actorCell.id, "cell_leader", {
        scopeType: "cell",
        scopeId: cellA.id,
      });
      await assignCatalogueRole(actorCellOther.id, "cell_leader", {
        scopeType: "cell",
        scopeId: cellB.rows[0].id,
      });
      await assignCatalogueRole(actorMinister.id, "minister", {
        scopeType: "branch",
        scopeId: branchA.id,
      });
      await assignCatalogueRole(actorPastor.id, "branch_pastor", {
        scopeType: "branch",
        scopeId: branchA.id,
      });
      await assignCatalogueRole(actorSafeguarding.id, "safeguarding_officer", {
        scopeType: "church",
        scopeId: churchA.id,
      });
      await assignCatalogueRole(actorWelfare.id, "welfare_officer", {
        scopeType: "branch",
        scopeId: branchA.id,
      });
      await assignCatalogueRole(actorWelfareApprover.id, "welfare_approver", {
        scopeType: "branch",
        scopeId: branchA.id,
      });
      await assignCatalogueRole(actorFinance.id, "finance_officer", {
        scopeType: "branch",
        scopeId: branchA.id,
      });

      const memberIns = await pool.query(
        `INSERT INTO blessboard.members
           (church_id, first_name, last_name, preferred_name,
            email_normalized, email_display, phone_normalized, phone_display, status)
         VALUES ($1, 'Member', 'A', 'Member A',
                 'member-a@pw-a.test', 'member-a@pw-a.test', '+15550009901', '+15550009901', 'active')
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

    it("legacy PA and HQ bundles exclude pastoral confidential permissions", () => {
    requireDb();
    for (const key of [
      "pastoral_cases.view_restricted",
      "pastoral_cases.view_highly_confidential",
      "pastoral_cases.view_safeguarding",
      "pastoral_cases.view_assigned",
      "welfare_cases.approve_assistance",
    ]) {
      assert.ok(!PLATFORM_ADMIN_PERMISSIONS.includes(key));
      assert.ok(!CHURCH_HQ_ADMIN_PERMISSIONS.includes(key));
    }
  });

  it("Platform Administrator cannot authorize pastoral note permissions", async () => {
    requireDb();
    const r = await authorize(pool, {
      actor: { userId: actorPa.id },
      permission: "pastoral_cases.view_highly_confidential",
      tenantContext: tenantA,
    });
    assert.equal(r.allowed, false);
  });

  it("Church System Administrator cannot authorize pastoral note permissions", async () => {
    requireDb();
    const r = await authorize(pool, {
      actor: { userId: actorHq.id },
      permission: "pastoral_cases.view_restricted",
      tenantContext: tenantA,
    });
    assert.equal(r.allowed, false);
  });

  it("Cell Leader creates referral and cannot read minister-only notes on another cell case", async () => {
    requireDb();
    const created = await pastoral.createPastoralCase(pool, {
      actorUserId: actorCell.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      cellId: cellA.id,
      tenantContext: tenantA,
      caseKey: "ref_alpha_1",
      title: "Referral Alpha",
      category: "referral",
      confidentialityLevel: "general_care",
      memberId: memberA.id,
      isReferral: true,
    });
    assert.equal(created.ok, true, created.reason || "create failed");

    await pastoral.assignPastoralCase(pool, {
      actorUserId: actorPastor.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      tenantContext: tenantA,
      caseId: created.case.id,
      assigneeUserId: actorMinister.id,
      assignmentRole: "minister",
    });

    const note = await pastoral.addPastoralCaseNote(pool, {
      actorUserId: actorMinister.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      tenantContext: tenantA,
      caseId: created.case.id,
      body: "CONFIDENTIAL_MINISTER_NOTE_BODY",
      noteVisibility: "minister_only",
    });
    assert.equal(note.ok, true);

    const detailCell = await pastoral.getPastoralCaseDetail(pool, {
      actorUserId: actorCell.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      cellId: cellA.id,
      tenantContext: tenantA,
      caseId: created.case.id,
      includeNoteBodies: true,
    });
    assert.equal(detailCell.ok, true);
    const ministerNote = detailCell.notes.find((n) => n.id === note.note.id);
    assert.ok(ministerNote);
    assert.equal(ministerNote.body, null);
    assert.equal(ministerNote.bodyRedacted, true);

    const other = await pastoral.getPastoralCaseDetail(pool, {
      actorUserId: actorCellOther.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      tenantContext: tenantA,
      caseId: created.case.id,
      includeNoteBodies: true,
    });
    assert.equal(other.ok, false);
    assert.equal(other.status, pastoral.STATUS.NOT_FOUND);
  });

  it("Minister sees assigned cases only; unassigned highly confidential is concealed", async () => {
    requireDb();
    const hc = await pastoral.createPastoralCase(pool, {
      actorUserId: actorPastor.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      tenantContext: tenantA,
      caseKey: "hc_case_1",
      title: "HC Case",
      category: "other",
      confidentialityLevel: "highly_confidential",
      isReferral: false,
    });
    assert.equal(hc.ok, true);

    const denied = await pastoral.getPastoralCaseDetail(pool, {
      actorUserId: actorMinister.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      tenantContext: tenantA,
      caseId: hc.case.id,
      includeNoteBodies: true,
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.status, pastoral.STATUS.NOT_FOUND);

    await pastoral.assignPastoralCase(pool, {
      actorUserId: actorPastor.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      tenantContext: tenantA,
      caseId: hc.case.id,
      assigneeUserId: actorMinister.id,
      assignmentRole: "minister",
    });

    // Minister still lacks highly confidential permission
    const stillDenied = await pastoral.getPastoralCaseDetail(pool, {
      actorUserId: actorMinister.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      tenantContext: tenantA,
      caseId: hc.case.id,
      includeNoteBodies: true,
    });
    assert.equal(stillDenied.ok, false);

    const pastorOk = await pastoral.getPastoralCaseDetail(pool, {
      actorUserId: actorPastor.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      tenantContext: tenantA,
      caseId: hc.case.id,
      includeNoteBodies: true,
    });
    assert.equal(pastorOk.ok, true);
  });

  it("Pastor escalation path and safeguarding isolation", async () => {
    requireDb();
    const created = await pastoral.createPastoralCase(pool, {
      actorUserId: actorMinister.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      tenantContext: tenantA,
      caseKey: "esc_case_1",
      title: "Escalate me",
      category: "general",
      confidentialityLevel: "restricted_care",
      isReferral: false,
    });
    assert.equal(created.ok, true);
    await pastoral.assignPastoralCase(pool, {
      actorUserId: actorPastor.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      tenantContext: tenantA,
      caseId: created.case.id,
      assigneeUserId: actorMinister.id,
      assignmentRole: "minister",
    });
    const esc = await pastoral.escalatePastoralCase(pool, {
      actorUserId: actorMinister.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      tenantContext: tenantA,
      caseId: created.case.id,
    });
    assert.equal(esc.ok, true);
    assert.equal(esc.case.status, "escalated");

    const sg = await pastoral.createPastoralCase(pool, {
      actorUserId: actorPastor.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      tenantContext: tenantA,
      caseKey: "sg_case_1",
      title: "Safeguarding",
      category: "safeguarding",
      confidentialityLevel: "safeguarding_restricted",
      isReferral: false,
    });
    // Pastor lacks view_safeguarding — create should fail for safeguarding_restricted
    assert.equal(sg.ok, false);

    // Create as safeguarding officer after temporarily using pastor to open general then change — use direct insert via service with safeguarding actor after granting create... safeguarding has edit but not create. Open via pastor at general then change confidentiality requires view_safeguarding for target.
    const open = await pastoral.createPastoralCase(pool, {
      actorUserId: actorPastor.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      tenantContext: tenantA,
      caseKey: "sg_open_1",
      title: "To safeguarding",
      category: "safeguarding",
      confidentialityLevel: "restricted_care",
      isReferral: false,
    });
    assert.equal(open.ok, true);
    await pastoral.assignPastoralCase(pool, {
      actorUserId: actorPastor.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      tenantContext: tenantA,
      caseId: open.case.id,
      assigneeUserId: actorSafeguarding.id,
      assignmentRole: "safeguarding",
    });
    // Pastor cannot raise to safeguarding without view_safeguarding
    const raise = await pastoral.changePastoralConfidentiality(pool, {
      actorUserId: actorPastor.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      tenantContext: tenantA,
      caseId: open.case.id,
      confidentialityLevel: "safeguarding_restricted",
    });
    assert.equal(raise.ok, false);

    const pastorBrowse = await pastoral.getPastoralCaseDetail(pool, {
      actorUserId: actorPastor.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      tenantContext: tenantA,
      caseId: open.case.id,
      includeNoteBodies: true,
    });
    assert.equal(pastorBrowse.ok, true);
  });

  it("case list privacy and branch/org isolation", async () => {
    requireDb();
    const listed = await pastoral.listPastoralCases(pool, {
      actorUserId: actorMinister.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      tenantContext: tenantA,
    });
    assert.equal(listed.ok, true);
    for (const c of listed.cases) {
      assert.ok(c.caseKey);
      assert.ok(c.title);
      assert.ok(!("noteBody" in c));
      assert.ok(!("body" in c));
    }

    const crossOrg = await pastoral.listPastoralCases(pool, {
      actorUserId: actorMinister.id,
      organizationId: orgB.id,
      churchId: churchB.id,
      branchId: branchB.id,
      tenantContext: tenantB,
    });
    assert.equal(crossOrg.ok, false);

    const otherBranchCase = await pool.query(
      `INSERT INTO blessboard.pastoral_cases (
         organization_id, church_id, branch_id, case_key, category,
         confidentiality_level, status, title, opened_by_user_id
       ) VALUES ($1,$2,$3,'branch2_case','general','general_care','open','Other branch',$4)
       RETURNING id`,
      [orgA.id, churchA.id, branchA2.id, actorPastor.id]
    );
    const ministerOnWrongBranch = await pastoral.getPastoralCaseDetail(pool, {
      actorUserId: actorMinister.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      tenantContext: tenantA,
      caseId: otherBranchCase.rows[0].id,
      includeNoteBodies: true,
    });
    assert.equal(ministerOnWrongBranch.ok, false);
  });

  it("notification bodies contain no narrative", () => {
    for (const body of Object.values(SAFE_BODIES)) {
      assert.ok(!/confidential|safeguarding|prayer text|narrative/i.test(body));
      assert.ok(body.length < 120);
    }
  });

  it("member request prayer/pastoral message redaction compatibility", () => {
    const redacted = presentMemberRequestWithPastoralRedaction(
      { category: "prayer", message: "SECRET_PRAYER", subject: "Help" },
      { mayViewPastoralBodies: false }
    );
    assert.equal(redacted.message, REDACTED_MESSAGE);
    assert.equal(redacted.messageRedacted, true);
    const allowed = presentMemberRequestWithPastoralRedaction(
      { category: "prayer", message: "SECRET_PRAYER", subject: "Help" },
      { mayViewPastoralBodies: true }
    );
    assert.equal(allowed.message, "SECRET_PRAYER");
  });

  it("welfare SoD: requester cannot approve; finance payload omits operational summary", async () => {
    requireDb();
    const wcase = await welfare.createWelfareCase(pool, {
      actorUserId: actorWelfare.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      tenantContext: tenantA,
      caseKey: "welfare_1",
      title: "Assistance",
      memberId: memberA.id,
    });
    assert.equal(wcase.ok, true);

    const req = await welfare.createWelfareRequest(pool, {
      actorUserId: actorWelfare.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      tenantContext: tenantA,
      welfareCaseId: wcase.case.id,
      operationalSummary: "Food parcel for household",
      assistanceType: "food",
      amountRequested: 50,
      currencyCode: "USD",
    });
    assert.equal(req.ok, true);

    // Dual-role: requester also holds approve — must still be denied for SoD.
    const approverRole = await rbacRepo.findRoleByKey(pool, "welfare_approver");
    await rbacRepo.insertAssignment(pool, {
      userId: actorWelfare.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      roleId: approverRole.id,
      scopeType: "branch",
      scopeId: branchA.id,
      assignedByUserId: actorHq.id,
      assignmentOrigin: "manual",
      assignmentReason: "sod self-approval probe",
    });

    const selfApprove = await welfare.decideWelfareRequest(pool, {
      actorUserId: actorWelfare.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      tenantContext: tenantA,
      requestId: req.request.id,
      decision: "approved",
      amountApproved: 50,
      financeInstructionSummary: "Pay USD 50 food voucher",
    });
    assert.equal(selfApprove.ok, false);
    assert.equal(selfApprove.reason, "self_approval");

    const approved = await welfare.decideWelfareRequest(pool, {
      actorUserId: actorWelfareApprover.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      tenantContext: tenantA,
      requestId: req.request.id,
      decision: "approved",
      amountApproved: 50,
      financeInstructionSummary: "Pay USD 50 food voucher",
    });
    assert.equal(approved.ok, true);

    // Approval history immutable — second row possible but original request summary unchanged
    const detail = await welfare.getWelfareRequestDetail(pool, {
      actorUserId: actorWelfare.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      tenantContext: tenantA,
      requestId: req.request.id,
    });
    assert.equal(detail.request.operationalSummary, "Food parcel for household");
    assert.equal(detail.approvals.length, 1);

    const financeDeniedPastoral = await authorize(pool, {
      actor: { userId: actorFinance.id },
      permission: "pastoral_cases.view_restricted",
      tenantContext: tenantA,
    });
    assert.equal(financeDeniedPastoral.allowed, false);

    const payment = await welfare.getWelfareFinanceInstructions(pool, {
      actorUserId: actorWelfareApprover.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      tenantContext: tenantA,
      requestId: req.request.id,
    });
    assert.equal(payment.ok, true);
    assert.equal(payment.payment.financeInstructionSummary, "Pay USD 50 food voucher");
    assert.ok(!("operationalSummary" in payment.payment));

    const dist = await welfare.recordWelfareDistribution(pool, {
      actorUserId: actorWelfare.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      tenantContext: tenantA,
      requestId: req.request.id,
      amountDistributed: 50,
      currencyCode: "USD",
      distributionMethod: "voucher",
      recipientAcknowledged: true,
    });
    assert.equal(dist.ok, true);
  });

  it("audit events recorded without confidential bodies", async () => {
    requireDb();
    const events = await pool.query(
      `SELECT event_key, metadata_json::text AS meta
         FROM blessboard.pastoral_case_events
        WHERE event_key IN (
          'pastoral.case.created',
          'pastoral.case.assigned',
          'pastoral.case.escalated',
          'pastoral.case.highly_confidential_accessed'
        )
        ORDER BY created_at DESC
        LIMIT 20`
    );
    assert.ok(events.rowCount > 0);
    for (const row of events.rows) {
      assert.ok(!/CONFIDENTIAL_MINISTER_NOTE_BODY/i.test(row.meta));
      assert.ok(!/Food parcel for household/i.test(row.meta));
    }
  });
});
