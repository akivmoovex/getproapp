"use strict";

/**
 * BlessBoard V5 HQ reports + platform.audit_events:
 * append-only, redaction, scope, report accuracy, pagination, V4 isolation.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const request = require("supertest");

const {
  resetFoundationDatabase,
  foundationDbUnavailableSkipReason,
  createFoundationPool,
} = require("./helpers/foundationDb");
const {
  V5_IDENTITY_KEY: IDENTITY_KEY,
  V5_DEPLOYMENT_CODE: DEPLOYMENT,
  DEFAULT_V5_COOKIE,
  baseV5TestEnv,
  makeTenant,
} = require("./helpers/blessboardV5Fixtures");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const {
  submitMemberRegistration,
  approveMemberRegistration,
  linkMemberToUser,
} = require("../src/blessboard/services/memberRegistrationService");
const {
  sanitizeAuditMetadata,
  recordAuditEvent,
  listOrganizationAuditEvents,
  FORBIDDEN_METADATA_KEYS,
} = require("../src/platform/services/auditEventService");
const { getHqOperationalReport } = require("../src/blessboard/services/hqReportsService");
const {
  assignOrganizationPlan,
} = require("../src/platform/services/entitlementService");
const {
  createGivingEntry,
  submitGivingEntry,
  approveGivingEntry,
} = require("../src/blessboard/services/givingService");
const {
  createMemberRequest,
  updateMemberRequestStatus,
} = require("../src/blessboard/services/formsRequestsService");

const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "ra-a.blessboard.org";
const HOST_B = "ra-b.blessboard.org";
const ROOT = path.join(__dirname, "..");

function baseEnv(overrides) {
  return baseV5TestEnv(overrides);
}

describe("blessboard reports-audit", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let churchA;
  let branchA;
  let hqAdmin;
  let branchAdmin;
  let memberUser;
  let memberId;
  let yearMonth;
  let tenant;

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

      orgA = await provisionPlatformTenant(pool, {
        organizationKey: "ra-a",
        displayName: "RA A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "ra-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: DEPLOYMENT,
        isPrimary: true,
      });
      assert.equal(orgA.ok, true, orgA.message);
      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "ra-a",
        churchKey: "ra-a",
        displayName: "RA Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;
      branchA = chA.records.hqBranch;
      tenant = makeTenant(churchA, orgA.records.organization, branchA);

      const orgB = await provisionPlatformTenant(pool, {
        organizationKey: "ra-b",
        displayName: "RA B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "ra-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: DEPLOYMENT,
        isPrimary: true,
      });
      assert.equal(orgB.ok, true, orgB.message);
      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "ra-b",
        churchKey: "ra-b",
        displayName: "RA Church B",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(chB.ok, true, chB.message);

      async function makeUser(email, role) {
        const created = await createBlessBoardUser(pool, {
          email,
          password: PASSWORD,
          displayName: email,
        });
        assert.equal(created.ok, true, created.reason || created.message);
        if (role) {
          const assigned = await assignBlessBoardRole(pool, role);
          assert.equal(assigned.ok, true, assigned.message || assigned.reason);
        }
        const session = await createV5Session(pool, {
          deploymentCode: DEPLOYMENT,
          userId: created.user.id,
          organizationId: orgA.records.organization.id,
        });
        assert.equal(session.ok, true, session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      hqAdmin = await makeUser("hq@ra-a.example.test", {
        email: "hq@ra-a.example.test",
        organizationKey: "ra-a",
        churchKey: "ra-a",
        roleKey: "church_hq_admin",
      });
      branchAdmin = await makeUser("branch@ra-a.example.test", {
        email: "branch@ra-a.example.test",
        organizationKey: "ra-a",
        churchKey: "ra-a",
        roleKey: "branch_admin",
        branchKey: "hq",
      });
      memberUser = await makeUser("member@ra-a.example.test", null);

      const submitted = await submitMemberRegistration(pool, {
        churchId: churchA.id,
        branchId: branchA.id,
        firstName: "RA",
        lastName: "Member",
        preferredName: "RA",
        email: "member@ra-a.example.test",
        phone: "+15550002001",
      });
      assert.equal(submitted.ok, true, submitted.reason);
      const approved = await approveMemberRegistration(pool, {
        registrationId: submitted.registration.id,
        actorUserId: hqAdmin.user.id,
      });
      assert.equal(approved.ok, true, approved.reason);
      const linked = await linkMemberToUser(pool, {
        memberId: approved.member.id,
        actorUserId: hqAdmin.user.id,
        userId: memberUser.user.id,
      });
      assert.equal(linked.ok, true, linked.reason);
      memberId = approved.member.id;

      const today = new Date();
      yearMonth = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
      });
    } catch (err) {
      skipSuite = true;
      skipReason = String((err && err.message) || err);
      // eslint-disable-next-line no-console
      console.error("reports-audit suite setup failed:", skipReason);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function skipIfNeeded(t) {
    if (skipSuite) {
      t.skip(foundationDbUnavailableSkipReason(skipReason));
      return true;
    }
    return false;
  }

  it("creates append-only audit_events and blocks update/delete", async (t) => {
    if (skipIfNeeded(t)) return;
    const tables = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'platform' AND table_name = 'audit_events'`
    );
    assert.equal(tables.rows.length, 1);

    const recorded = await recordAuditEvent(pool, {
      deploymentCode: DEPLOYMENT,
      organizationId: orgA.records.organization.id,
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: hqAdmin.user.id,
      actionKey: "test.event.write",
      entityType: "test_entity",
      entityId: churchA.id,
      outcome: "success",
      metadata: { status: "ok", count: 1 },
    });
    assert.equal(recorded.ok, true, recorded.reason);
    assert.ok(recorded.event.id);

    await assert.rejects(
      () =>
        pool.query(`UPDATE platform.audit_events SET outcome = 'failure' WHERE id = $1`, [
          recorded.event.id,
        ]),
      /append-only/i
    );
    await assert.rejects(
      () => pool.query(`DELETE FROM platform.audit_events WHERE id = $1`, [recorded.event.id]),
      /append-only/i
    );
  });

  it("redacts secrets and PII from metadata", async (t) => {
    if (skipIfNeeded(t)) return;
    assert.ok(FORBIDDEN_METADATA_KEYS.includes("password"));
    assert.ok(FORBIDDEN_METADATA_KEYS.includes("email"));

    const sanitized = sanitizeAuditMetadata({
      password: "secret-value",
      token: "abc",
      email: "person@example.test",
      status: "approved",
      amount: "10.00",
      currency: "USD",
      mystery: "drop-me",
    });
    assert.equal(sanitized.ok, true);
    assert.deepEqual(sanitized.metadata, {
      status: "approved",
      amount: "10.00",
      currency: "USD",
    });
    assert.ok(sanitized.redactedKeys.includes("password"));
    assert.ok(sanitized.redactedKeys.includes("email"));
    assert.ok(sanitized.redactedKeys.includes("mystery"));

    const recorded = await recordAuditEvent(pool, {
      deploymentCode: DEPLOYMENT,
      organizationId: orgA.records.organization.id,
      churchId: churchA.id,
      actorUserId: hqAdmin.user.id,
      actionKey: "test.redaction",
      entityType: "test_entity",
      outcome: "success",
      metadata: {
        password: "nope",
        email: "hidden@example.test",
        status: "ok",
      },
    });
    assert.equal(recorded.ok, true, recorded.reason);
    assert.equal(recorded.event.metadata.password, undefined);
    assert.equal(recorded.event.metadata.email, undefined);
    assert.equal(recorded.event.metadata.status, "ok");
  });

  it("paginates audit events and scopes by organization/church", async (t) => {
    if (skipIfNeeded(t)) return;
    for (let i = 0; i < 3; i += 1) {
      const r = await recordAuditEvent(pool, {
        deploymentCode: DEPLOYMENT,
        organizationId: orgA.records.organization.id,
        churchId: churchA.id,
        actorUserId: hqAdmin.user.id,
        actionKey: "test.page.item",
        entityType: "test_entity",
        outcome: "success",
        metadata: { count: i },
      });
      assert.equal(r.ok, true, r.reason);
    }

    const page1 = await listOrganizationAuditEvents(pool, {
      organizationId: orgA.records.organization.id,
      churchId: churchA.id,
      actionKey: "test.page.item",
      limit: 2,
    });
    assert.equal(page1.ok, true, page1.reason);
    assert.equal(page1.events.length, 2);
    assert.equal(page1.hasMore, true);
    assert.ok(page1.nextBefore);

    const page2 = await listOrganizationAuditEvents(pool, {
      organizationId: orgA.records.organization.id,
      churchId: churchA.id,
      actionKey: "test.page.item",
      before: page1.nextBefore,
      limit: 2,
    });
    assert.equal(page2.ok, true, page2.reason);
    assert.ok(page2.events.length >= 1);
    assert.ok(!page2.events.some((e) => e.id === page1.events[0].id));
  });

  it("builds HQ reports from real aggregates (no fake numbers)", async (t) => {
    if (skipIfNeeded(t)) return;
    const day = `${yearMonth}-15`;

    const giving = await createGivingEntry(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      scopeBranchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      categoryKey: "tithes",
      givingDate: day,
      amount: "25.50",
      currency: "USD",
    });
    assert.equal(giving.ok, true, giving.reason);
    await submitGivingEntry(pool, {
      id: giving.entry.id,
      churchId: churchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
    });
    await approveGivingEntry(pool, {
      id: giving.entry.id,
      churchId: churchA.id,
      actorUserId: hqAdmin.user.id,
      tenant,
    });

    const request = await createMemberRequest(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      memberId,
      actorUserId: memberUser.user.id,
      category: "prayer",
      subject: "Report request",
      message: "Please include in open count",
    });
    assert.equal(request.ok, true, request.reason);
    await updateMemberRequestStatus(pool, {
      id: request.request.id,
      churchId: churchA.id,
      actorUserId: hqAdmin.user.id,
      tenant,
      status: "in_review",
      note: "Looking",
    });

    const pending = await submitMemberRegistration(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      firstName: "Pending",
      lastName: "Person",
      preferredName: "Pend",
      email: "pending@ra-a.example.test",
      phone: "+15550002099",
    });
    assert.equal(pending.ok, true, pending.reason);

    const report = await getHqOperationalReport(pool, {
      churchId: churchA.id,
      actorUserId: hqAdmin.user.id,
      tenant,
      yearMonth,
    });
    assert.equal(report.ok, true, report.reason);
    assert.equal(Object.prototype.hasOwnProperty.call(report.report, "projectedGrowth"), false);

    const hqBranchMembers = report.report.activeMembersByBranch.find((r) => r.branchKey === "hq");
    assert.ok(hqBranchMembers);
    assert.ok(hqBranchMembers.activeMemberCount >= 1);

    const pendingHq = report.report.registrationsPendingByBranch.find((r) => r.branchKey === "hq");
    assert.ok(pendingHq);
    assert.ok(pendingHq.pendingCount >= 1);

    const usd = report.report.giving.byCurrency.find((g) => g.currency === "USD");
    assert.ok(usd);
    assert.equal(usd.totalAmount, "25.50");
    assert.ok(usd.entryCount >= 1);

    const givingBranch = report.report.giving.byBranch.find(
      (g) => g.branchKey === "hq" && g.currency === "USD"
    );
    assert.ok(givingBranch);
    assert.equal(givingBranch.totalAmount, "25.50");
    assert.doesNotMatch(JSON.stringify(report.report), /donor@|payer_name|card_number|iban/i);
    assert.equal(Object.prototype.hasOwnProperty.call(report.report, "churchId"), false);

    assert.ok(report.report.openRequests.openCount >= 1);
    assert.ok(report.report.openRequests.inReviewCount >= 1);
    assert.ok(Array.isArray(report.report.attendance.byBranch));

    const branchDenied = await getHqOperationalReport(pool, {
      churchId: churchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      yearMonth,
    });
    assert.equal(branchDenied.ok, false);
  });

  it("serves HQ attendance and giving report screens with branch filters", async (t) => {
    if (skipIfNeeded(t)) return;
    const cookie = `${DEFAULT_V5_COOKIE}=${hqAdmin.rawToken}`;

    const consolidated = await request(app)
      .get(`/hq/reports?month=${yearMonth}`)
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(consolidated.status, 200);
    assert.match(consolidated.text, /data-bb-hq-reports="1"/);
    assert.match(consolidated.text, /data-bb-batch="fg-08a"/);
    assert.match(consolidated.text, /data-bb-stitch-reports="57-hq-consolidated-analytics"/);
    assert.match(consolidated.text, /data-bb-stitch-desktop="2a577dc15d4342acb152f16aed21c267"/);
    assert.match(consolidated.text, /data-bb-report-tier="basic"/);
    assert.match(consolidated.text, /data-bb-report-links="1"/);
    assert.match(consolidated.text, /data-bb-report-link="attendance"/);
    assert.match(consolidated.text, /data-bb-report-link-tier="growth-required"/);
    assert.match(consolidated.text, /data-bb-report-link="giving"/);
    assert.match(
      consolidated.text,
      /data-bb-report-link="giving"[^>]*data-bb-report-link-tier="growth-required"|data-bb-report-link-tier="growth-required"[^>]*data-bb-report-link="giving"/
    );
    assert.doesNotMatch(consolidated.text, /href="\/hq\/reports\/attendance/);
    assert.doesNotMatch(consolidated.text, /href="\/hq\/reports\/giving/);
    assert.match(consolidated.text, /Requires Growth — not linked on Foundation/);
    assert.match(consolidated.text, /data-bb-reports-summary="1"/);
    assert.match(consolidated.text, /data-bb-hq-report-filter="1"/);
    assert.match(consolidated.text, /data-bb-report="giving-totals"|data-bb-report="giving-empty"/);
    assert.match(consolidated.text, /name="branch"/);
    assert.match(consolidated.text, /name="month"/);
    assert.match(consolidated.text, /data-bb-reports-unavailable="1"/);
    assert.match(consolidated.text, /data-bb-reports-unavailable-row="generators"/);
    assert.doesNotMatch(consolidated.text, /chart\.js|<canvas|projectedGrowth/i);
    assert.doesNotMatch(consolidated.text, /compliance score:\s*\d+|risk rating:\s*\d+/i);
    assert.doesNotMatch(consolidated.text, new RegExp(churchA.id, "i"));
    assert.doesNotMatch(consolidated.text, /donor@|payer name|card number|iban[\s:]/i);

    const attFoundation = await request(app)
      .get(`/hq/reports/attendance?month=${yearMonth}&branch=hq`)
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(attFoundation.status, 200);
    assert.match(attFoundation.text, /data-bb-hq-attendance-report="1"/);
    assert.match(attFoundation.text, /data-bb-batch="fg-08a"/);
    assert.match(attFoundation.text, /data-bb-att-report-entitlement="denied"/);
    assert.match(attFoundation.text, /data-bb-report-tier="basic"/);
    assert.match(attFoundation.text, /data-bb-att-report-denied="1"/);
    assert.match(attFoundation.text, /data-bb-att-report-unavailable="1"/);
    assert.match(attFoundation.text, /data-bb-att-unavailable="trend"/);
    assert.doesNotMatch(attFoundation.text, /data-bb-hq-att-report-filter="1"/);
    assert.doesNotMatch(attFoundation.text, /data-bb-att-report-summary="1"/);
    assert.doesNotMatch(attFoundation.text, /chart\.js|<canvas|projectedGrowth|\+12%|YoY/i);
    assert.doesNotMatch(attFoundation.text, new RegExp(churchA.id, "i"));

    const givFoundation = await request(app)
      .get(`/hq/reports/giving?month=${yearMonth}&branch=hq`)
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(givFoundation.status, 200);
    assert.match(givFoundation.text, /data-bb-hq-giving-report="1"/);
    assert.match(givFoundation.text, /data-bb-batch="fg-q12"/);
    assert.match(givFoundation.text, /data-bb-giv-report-entitlement="denied"/);
    assert.match(givFoundation.text, /data-bb-report-tier="basic"/);
    assert.match(givFoundation.text, /data-bb-giv-report-denied="1"/);
    assert.match(givFoundation.text, /data-bb-giv-report-unavailable="1"/);
    assert.match(givFoundation.text, /data-bb-giv-unavailable="donor"/);
    assert.doesNotMatch(givFoundation.text, /data-bb-hq-giv-report-filter="1"/);
    assert.doesNotMatch(givFoundation.text, /data-bb-giv-report-summary="1"/);
    assert.doesNotMatch(givFoundation.text, /25\.50/);
    assert.doesNotMatch(givFoundation.text, /chart\.js|<canvas|projectedGrowth|\+12%|YoY/i);
    assert.doesNotMatch(givFoundation.text, new RegExp(churchA.id, "i"));

    const assigned = await assignOrganizationPlan(pool, {
      organizationId: orgA.records.organization.id,
      planKey: "growth",
      productKey: "blessboard",
      status: "active",
    });
    assert.equal(assigned.ok, true, assigned.reason);

    const hubGrowth = await request(app)
      .get(`/hq/reports?month=${yearMonth}`)
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(hubGrowth.status, 200);
    assert.match(hubGrowth.text, /data-bb-report-tier="advanced"/);
    assert.match(hubGrowth.text, /data-bb-report-link-tier="advanced"/);
    assert.match(hubGrowth.text, /href="\/hq\/reports\/attendance/);
    assert.match(hubGrowth.text, /href="\/hq\/reports\/giving/);

    const att = await request(app)
      .get(`/hq/reports/attendance?month=${yearMonth}&branch=hq`)
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(att.status, 200);
    assert.match(att.text, /data-bb-hq-attendance-report="1"/);
    assert.match(att.text, /data-bb-stitch-attendance-report="57-hq-consolidated-analytics"/);
    assert.match(att.text, /data-bb-att-report-entitlement="advanced"/);
    assert.match(att.text, /data-bb-att-report-scope="branch"/);
    assert.match(att.text, /data-bb-hq-att-report-filter="1"/);
    assert.match(att.text, /name="month"/);
    assert.match(att.text, /name="branch"/);
    assert.match(att.text, /value="hq"[^>]*selected|selected[^>]*value="hq"/);
    assert.match(att.text, /data-bb-att-report-summary="1"|data-bb-att-report-empty="1"/);
    assert.match(att.text, /data-bb-att-report-unavailable="1"/);
    assert.match(att.text, /data-bb-att-unavailable="trend"/);
    assert.doesNotMatch(att.text, /data-bb-att-report-denied="1"/);
    assert.doesNotMatch(att.text, /chart\.js|<canvas|projectedGrowth|\+12%|YoY/i);
    assert.doesNotMatch(att.text, new RegExp(churchA.id, "i"));

    const attAll = await request(app)
      .get(`/hq/reports/attendance?month=${yearMonth}`)
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(attAll.status, 200);
    assert.match(attAll.text, /data-bb-att-report-scope="church"/);
    assert.match(attAll.text, /data-bb-att-report-entitlement="advanced"/);
    assert.match(attAll.text, /data-bb-att-report-summary="1"|data-bb-att-report-empty="1"/);
    if (/data-bb-att-report-summary="1"/.test(attAll.text)) {
      assert.match(attAll.text, /data-bb-attendance-grand-total=/);
      assert.match(attAll.text, /data-bb-attendance-summary-table="1"|data-bb-attendance-summary-cards="1"/);
      assert.match(attAll.text, /data-bb-att-report-branches="1"/);
    }
    assert.doesNotMatch(attAll.text, /chart\.js|<canvas/i);

    const giv = await request(app)
      .get(`/hq/reports/giving?month=${yearMonth}&branch=hq`)
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(giv.status, 200);
    assert.match(giv.text, /data-bb-hq-giving-report="1"/);
    assert.match(giv.text, /data-bb-stitch-giving-report="57-hq-consolidated-analytics"/);
    assert.match(giv.text, /data-bb-giv-report-entitlement="advanced"/);
    assert.match(giv.text, /data-bb-giv-report-scope="branch"/);
    assert.match(giv.text, /data-bb-hq-giv-report-filter="1"/);
    assert.match(giv.text, /name="month"/);
    assert.match(giv.text, /name="branch"/);
    assert.match(giv.text, /25\.50|No submitted giving|data-bb-giv-report-empty/i);
    assert.match(giv.text, /data-bb-giv-report-summary="1"|data-bb-giv-report-empty="1"/);
    assert.match(giv.text, /data-bb-giv-report-unavailable="1"/);
    assert.match(giv.text, /data-bb-giv-unavailable="donor"/);
    assert.doesNotMatch(giv.text, /data-bb-giv-report-denied="1"/);
    assert.doesNotMatch(giv.text, /donor@|card number|iban[\s:]|payer_name|account_number/i);
    assert.doesNotMatch(giv.text, /chart\.js|<canvas|projectedGrowth|\+12%|YoY/i);
    assert.doesNotMatch(giv.text, new RegExp(churchA.id, "i"));

    const givAll = await request(app)
      .get(`/hq/reports/giving?month=${yearMonth}`)
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(givAll.status, 200);
    assert.match(givAll.text, /data-bb-giv-report-scope="church"/);
    assert.match(givAll.text, /data-bb-giv-report-entitlement="advanced"/);
    assert.match(givAll.text, /data-bb-giv-report-summary="1"|data-bb-giv-report-empty="1"/);
    if (/data-bb-giv-report-summary="1"/.test(givAll.text)) {
      assert.match(givAll.text, /data-bb-giving-summary-table="1"|data-bb-giving-summary-cards="1"/);
      assert.match(givAll.text, /data-bb-giv-report-branches="1"/);
      assert.match(givAll.text, /data-bb-total=/);
    }
    assert.doesNotMatch(givAll.text, /chart\.js|<canvas|donor@/i);

    const filtered = await getHqOperationalReport(pool, {
      churchId: churchA.id,
      actorUserId: hqAdmin.user.id,
      tenant,
      yearMonth,
      branchId: branchA.id,
    });
    assert.equal(filtered.ok, true, filtered.reason);
    assert.equal(filtered.report.branchFilter.branchKey, "hq");
    assert.equal(filtered.report.reportTier, "advanced");
    const usdFiltered = filtered.report.giving.byCurrency.find((g) => g.currency === "USD");
    assert.ok(usdFiltered);
    assert.equal(usdFiltered.totalAmount, "25.50");

    const unknownBranch = await request(app)
      .get(`/hq/reports/giving?month=${yearMonth}&branch=does-not-exist`)
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(unknownBranch.status, 404);
    assert.match(unknownBranch.text, /not available/i);
    assert.doesNotMatch(unknownBranch.text, /data-bb-giv-report-summary="1"/);
    assert.doesNotMatch(unknownBranch.text, /25\.50/);

    const wrongChurch = await request(app)
      .get(`/hq/reports/giving?month=${yearMonth}`)
      .set("Host", HOST_B)
      .set("Cookie", cookie);
    assert.equal(wrongChurch.status, 403);
    assert.doesNotMatch(wrongChurch.text, /data-bb-giv-report-summary="1"/);
    assert.doesNotMatch(wrongChurch.text, /25\.50/);

    const networkAssigned = await assignOrganizationPlan(pool, {
      organizationId: orgA.records.organization.id,
      planKey: "professional",
      productKey: "blessboard",
      status: "active",
    });
    assert.equal(networkAssigned.ok, true, networkAssigned.reason);

    const givNetwork = await request(app)
      .get(`/hq/reports/giving?month=${yearMonth}`)
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(givNetwork.status, 200);
    assert.match(givNetwork.text, /data-bb-giv-report-entitlement="advanced"/);
    assert.match(givNetwork.text, /data-bb-report-tier="advanced"/);
    assert.doesNotMatch(givNetwork.text, /data-bb-giv-report-denied="1"/);
    assert.match(givNetwork.text, /data-bb-giv-report-summary="1"|data-bb-giv-report-empty="1"/);

    const denied = await request(app)
      .get("/hq/reports/giving")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${branchAdmin.rawToken}`);
    assert.ok(denied.status === 403 || denied.status === 303, `status=${denied.status}`);

    const attBranchDenied = await request(app)
      .get("/hq/reports/attendance")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${branchAdmin.rawToken}`);
    assert.ok(
      attBranchDenied.status === 403 || attBranchDenied.status === 303,
      `status=${attBranchDenied.status}`
    );
  });

  it("serves HQ audit trail with filters, pagination, and privacy-safe HTML", async (t) => {
    if (skipIfNeeded(t)) return;
    const cookie = `${DEFAULT_V5_COOKIE}=${hqAdmin.rawToken}`;

    for (let i = 0; i < 3; i += 1) {
      const recorded = await recordAuditEvent(pool, {
        deploymentCode: DEPLOYMENT,
        organizationId: orgA.records.organization.id,
        churchId: churchA.id,
        branchId: branchA.id,
        actorUserId: hqAdmin.user.id,
        actionKey: "test.hq.audit.gui",
        entityType: "test_entity",
        entityId: churchA.id,
        outcome: i === 0 ? "denied" : "success",
        metadata: {
          password: "must-not-appear",
          email: "secret@example.test",
          status: "ok",
          count: i,
        },
      });
      assert.equal(recorded.ok, true, recorded.reason);
    }

    const list = await request(app)
      .get("/hq/audit")
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(list.status, 200);
    assert.match(list.text, /data-bb-hq-audit="1"/);
    assert.match(list.text, /data-bb-stitch-audit="58-hq-global-audit-trail"/);
    assert.match(list.text, /data-bb-hq-audit-filter="1"/);
    assert.match(list.text, /data-bb-hq-audit-table="1"/);
    assert.match(list.text, /data-bb-hq-audit-cards="1"/);
    assert.match(list.text, /data-bb-audit-summary="1"/);
    assert.match(list.text, /data-bb-audit-privacy="1"/);
    assert.match(list.text, /name="action"/);
    assert.match(list.text, /name="entity"/);
    assert.match(list.text, /name="outcome"/);
    assert.match(list.text, /test\.hq\.audit\.gui/);
    assert.match(list.text, /href="\/hq\/reports"/);
    assert.doesNotMatch(list.text, /export\.csv|Download CSV/i);
    assert.doesNotMatch(list.text, /must-not-appear|secret@example\.test/i);
    assert.doesNotMatch(list.text, /session_token|password_hash|csrf_token|authorization:\s*bearer/i);
    assert.doesNotMatch(list.text, /"password"\s*:|"email"\s*:|metadata\.json/i);
    assert.doesNotMatch(list.text, new RegExp(churchA.id, "i"));
    assert.doesNotMatch(list.text, new RegExp(hqAdmin.user.id, "i"));
    assert.doesNotMatch(list.text, new RegExp(orgA.records.organization.id, "i"));
    assert.match(list.text, new RegExp(String(churchA.id).slice(-8)));
    assert.match(list.text, /data-bb-audit-unavailable="1"/);
    assert.match(list.text, /data-bb-audit-unavailable-row="payload"/);

    const filtered = await request(app)
      .get("/hq/audit?action=test.hq.audit.gui&outcome=denied&entity=test_entity")
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(filtered.status, 200);
    assert.match(filtered.text, /data-bb-outcome="denied"/);
    assert.match(filtered.text, /test\.hq\.audit\.gui/);
    assert.doesNotMatch(filtered.text, /data-bb-outcome="success"/);

    const page1 = await listOrganizationAuditEvents(pool, {
      organizationId: orgA.records.organization.id,
      churchId: churchA.id,
      actionKey: "test.hq.audit.gui",
      limit: 2,
    });
    assert.equal(page1.ok, true, page1.reason);
    assert.equal(page1.hasMore, true);
    assert.ok(page1.nextBefore);

    const paged = await request(app)
      .get(
        `/hq/audit?action=test.hq.audit.gui&before=${encodeURIComponent(
          page1.nextBefore instanceof Date
            ? page1.nextBefore.toISOString()
            : String(page1.nextBefore)
        )}`
      )
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(paged.status, 200);
    assert.match(paged.text, /data-bb-hq-audit-table="1"|data-bb-hq-audit-empty=/);
    assert.match(paged.text, /test\.hq\.audit\.gui|No matching events|No audit events/i);

    const empty = await request(app)
      .get("/hq/audit?action=test.hq.audit.missing")
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(empty.status, 200);
    assert.match(empty.text, /data-bb-hq-audit-empty="no-results"/);

    const denied = await request(app)
      .get("/hq/audit")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${branchAdmin.rawToken}`);
    assert.ok(denied.status === 403 || denied.status === 303, `status=${denied.status}`);
  });

  it("leaves V4 wiring untouched", () => {
    const legacy = fs.readFileSync(path.join(ROOT, "server.legacy.js"), "utf8");
    assert.doesNotMatch(legacy, /createHqReportsRouter|auditEventService|hqReportsService/);
    assert.ok(fs.existsSync(path.join(ROOT, "docs/database/AUDIT_RETENTION.md")));
  });
});
