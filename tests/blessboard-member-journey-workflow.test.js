"use strict";

/**
 * BlessBoard V5 member-journey workflow UI tests (ephemeral Postgres).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const {
  createJourneyContact,
  createHandover,
  submitHandover,
  acceptHandover,
  updateHandoverCore,
} = require("../src/blessboard/services/memberJourneyHandoverService");
const {
  approveClassCompletion,
  recommendClassCompletion,
  createClassProgram,
  createClassCohort,
  enrolMember,
} = require("../src/blessboard/services/memberJourneyDomainService");
const {
  getDashboardCounts,
  getMemberPortalJourneySummary,
} = require("../src/blessboard/services/memberJourneyWorkflowService");
const { SAFE_TITLES: NOTIFY_TITLES, SAFE_BODIES } = require("../src/blessboard/services/memberJourneyNotify");
const { makeResolvedTenantContext } = require("./helpers/blessboardV5Fixtures");
const { CSRF_COOKIE, CSRF_FIELD, issueCsrfToken } = require("../src/platform/http/v5Csrf");

describe("blessboard member journey workflow", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let org;
  let church;
  let branch;
  let tenant;
  let hqUser;
  let memberUser;
  let memberId;
  let cookie;

  before(async () => {
    process.env.PLATFORM_DEPLOYMENT_CODE = "blessboard-org-staging";
    process.env.DEPLOYMENT_ENV = "testing";
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });

      const platform = await provisionPlatformTenant(pool, {
        organizationKey: "mjw-org",
        displayName: "MJW Org",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "mjw-org",
        hostname: "mjw.blessboard.org",
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      org = platform.records.organization;

      const churchProv = await provisionBlessBoardChurch(pool, {
        organizationKey: "mjw-org",
        churchKey: "mjw-org",
        displayName: "MJW Church",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ",
      });
      church = churchProv.records.church;
      branch = churchProv.records.hqBranch;
      tenant = makeResolvedTenantContext({
        organization: org,
        church,
        primaryBranch: branch,
        hqBranch: branch,
      });

      const hq = await createBlessBoardUser(pool, {
        email: "hq@mjw.test",
        displayName: "HQ",
        password: "Test-Password-123!",
      });
      hqUser = hq.user;
      await assignBlessBoardRole(pool, {
        email: "hq@mjw.test",
        organizationKey: "mjw-org",
        churchKey: "mjw-org",
        roleKey: "church_hq_admin",
      });

      const mem = await createBlessBoardUser(pool, {
        email: "member@mjw.test",
        displayName: "Member",
        password: "Test-Password-123!",
      });
      memberUser = mem.user;
      const mrow = await pool.query(
        `INSERT INTO blessboard.members
           (church_id, user_id, first_name, last_name, preferred_name,
            email_normalized, email_display, phone_normalized, phone_display, status)
         VALUES ($1,$2,'Mem','Ber','M','member@mjw.test','member@mjw.test','+15559990001','+1', 'active')
         RETURNING id`,
        [church.id, memberUser.id]
      );
      memberId = mrow.rows[0].id;
      await pool.query(
        `INSERT INTO blessboard.member_branch_memberships
           (member_id, branch_id, membership_status, is_primary, joined_at)
         VALUES ($1,$2,'active',true,now())`,
        [memberId, branch.id]
      );

      app = createV5FoundationApp({
        getPool: () => pool,
        env: {
          NODE_ENV: "test",
          PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
          SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
          SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
          BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
          BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
        },
      });

      const session = await createV5Session(pool, {
        deploymentCode: "blessboard-org-staging",
        userId: hqUser.id,
        organizationId: org.id,
        churchId: church.id,
        branchId: branch.id,
      });
      cookie = `${DEFAULT_V5_COOKIE}=${session.rawToken}`;
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("dashboard and list routes render for HQ", async () => {
    requireDb();
    const dash = await request(app)
      .get("/hq/member-journey")
      .set("Host", "mjw.blessboard.org")
      .set("Cookie", cookie)
      .set("Accept", "text/html");
    assert.equal(dash.status, 200);
    assert.match(dash.text, /data-bb-member-journey|Member journey|Evangelism|First Timers/i);

    const contacts = await request(app)
      .get("/hq/member-journey/contacts")
      .set("Host", "mjw.blessboard.org")
      .set("Cookie", cookie);
    assert.equal(contacts.status, 200);

    const handovers = await request(app)
      .get("/hq/member-journey/handovers")
      .set("Host", "mjw.blessboard.org")
      .set("Cookie", cookie);
    assert.equal(handovers.status, 200);
  });

  it("denies unauthenticated direct URL access", async () => {
    requireDb();
    const res = await request(app)
      .get("/hq/member-journey/contacts")
      .set("Host", "mjw.blessboard.org")
      .set("Accept", "text/html");
    assert.ok(res.status === 303 || res.status === 401);
  });

  it("rejects POST without CSRF", async () => {
    requireDb();
    const res = await request(app)
      .post("/hq/member-journey/contacts")
      .set("Host", "mjw.blessboard.org")
      .set("Cookie", cookie)
      .type("form")
      .send({ firstName: "A", lastName: "B", email: "ab@mjw.test" });
    assert.equal(res.status, 403);
  });

  it("stale handover action is rejected", async () => {
    requireDb();
    const contact = await createJourneyContact(pool, {
      actorUserId: hqUser.id,
      organizationId: org.id,
      churchId: church.id,
      branchId: branch.id,
      tenantContext: tenant,
      firstName: "Stale",
      lastName: "Test",
      email: "stale@mjw.test",
      sourceType: "evangelism",
    });
    assert.equal(contact.ok, true, contact.reason);
    const created = await createHandover(pool, {
      actorUserId: hqUser.id,
      organizationId: org.id,
      churchId: church.id,
      branchId: branch.id,
      tenantContext: tenant,
      journeyContactId: contact.contact.id,
      fromStage: "evangelism",
      toStage: "first_timers",
    });
    assert.equal(created.ok, true, created.reason);
    await submitHandover(pool, {
      actorUserId: hqUser.id,
      churchId: church.id,
      handoverId: created.handover.id,
      tenantContext: tenant,
    });

    const csrf = issueCsrfToken({
      NODE_ENV: "test",
      SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    });
    const res = await request(app)
      .post(`/hq/member-journey/handovers/${created.handover.id}`)
      .set("Host", "mjw.blessboard.org")
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        action: "submit",
        expectedStatus: "draft",
      });
    assert.equal(res.status, 303);
    assert.match(String(res.headers.location || ""), /stale|error/);
  });

  it("previous-stage edit denied after acceptance", async () => {
    requireDb();
    const contact = await createJourneyContact(pool, {
      actorUserId: hqUser.id,
      organizationId: org.id,
      churchId: church.id,
      branchId: branch.id,
      tenantContext: tenant,
      firstName: "Edit",
      lastName: "Deny",
      email: "editdeny@mjw.test",
      sourceType: "manual",
    });
    const created = await createHandover(pool, {
      actorUserId: hqUser.id,
      organizationId: org.id,
      churchId: church.id,
      branchId: branch.id,
      tenantContext: tenant,
      journeyContactId: contact.contact.id,
      fromStage: "registration",
      toStage: "first_timers",
      notesSummary: "before",
    });
    await submitHandover(pool, {
      actorUserId: hqUser.id,
      churchId: church.id,
      handoverId: created.handover.id,
      tenantContext: tenant,
    });
    await acceptHandover(pool, {
      actorUserId: hqUser.id,
      churchId: church.id,
      handoverId: created.handover.id,
      tenantContext: tenant,
    });
    const denied = await updateHandoverCore(pool, {
      actorUserId: hqUser.id,
      churchId: church.id,
      handoverId: created.handover.id,
      tenantContext: tenant,
      notesSummary: "after",
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.reason, "previous_stage_edit_denied");
  });

  it("class completion self-approval is denied", async () => {
    requireDb();
    const program = await createClassProgram(pool, {
      actorUserId: hqUser.id,
      organizationId: org.id,
      churchId: church.id,
      tenantContext: tenant,
      programKey: "salvation",
      displayName: "Salvation",
      programType: "salvation",
    });
    assert.equal(program.ok, true, program.reason);
    const cohort = await createClassCohort(pool, {
      actorUserId: hqUser.id,
      organizationId: org.id,
      churchId: church.id,
      branchId: branch.id,
      tenantContext: tenant,
      programId: program.program.id,
      cohortKey: "salv_1",
      displayName: "Salvation 1",
      startsOn: "2026-02-01",
    });
    assert.equal(cohort.ok, true, cohort.reason);
    const enrolled = await enrolMember(pool, {
      actorUserId: hqUser.id,
      organizationId: org.id,
      churchId: church.id,
      branchId: branch.id,
      tenantContext: tenant,
      cohortId: cohort.cohort.id,
      memberId,
    });
    assert.equal(enrolled.ok, true, enrolled.reason);
    const rec = await recommendClassCompletion(pool, {
      actorUserId: hqUser.id,
      churchId: church.id,
      enrolmentId: enrolled.enrolment.id,
      tenantContext: tenant,
    });
    assert.equal(rec.ok, true, rec.reason);
    const self = await approveClassCompletion(pool, {
      actorUserId: hqUser.id,
      churchId: church.id,
      enrolmentId: enrolled.enrolment.id,
      tenantContext: tenant,
    });
    assert.equal(self.ok, false);
    assert.equal(self.reason, "self_approval_denied");
  });

  it("member portal journey hides staff-only fields", async () => {
    requireDb();
    const summary = await getMemberPortalJourneySummary(pool, {
      churchId: church.id,
      memberId,
    });
    assert.equal(summary.ok, true);
    assert.equal(Object.prototype.hasOwnProperty.call(summary.summary, "handovers"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(summary.summary, "returnReason"), false);
    assert.ok(Array.isArray(summary.summary.classes));
    assert.ok(Array.isArray(summary.summary.departments));
  });

  it("notification copy is redacted", () => {
    for (const key of Object.keys(NOTIFY_TITLES)) {
      assert.doesNotMatch(NOTIFY_TITLES[key], /phone|email|confession|counsel|return reason/i);
      assert.doesNotMatch(SAFE_BODIES[key], /phone|email|confession|counsel|@|\+\d/i);
    }
  });

  it("dashboard counts load for authorized HQ", async () => {
    requireDb();
    const counts = await getDashboardCounts(pool, {
      actorUserId: hqUser.id,
      organizationId: org.id,
      churchId: church.id,
      branchId: branch.id,
      tenantContext: tenant,
    });
    assert.equal(counts.ok, true, counts.reason);
    assert.equal(typeof counts.counts.firstTimersAwaitingAcceptance, "number");
    assert.equal(typeof counts.counts.stalledHandovers, "number");
  });
});
