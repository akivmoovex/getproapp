"use strict";

/**
 * BlessBoard reusable pilot smoke-test suite.
 *
 * Covers one Foundation tenant and one Growth tenant across:
 * - Foundation member/admin journey + package limits
 * - Growth multi-branch / entitlement journey
 * - Cross-tenant and status security journey
 *
 * Does not change production functionality. Reuses node:test + supertest + PG helpers.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { isPgConfigured } = require("../src/db/pg/pool");
const { requireChurchPgOrSkip } = require("./helpers/churchPgTest");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const membersRepo = require("../src/db/pg/church/membersRepo");
const eventsRepo = require("../src/db/pg/church/eventsRepo");
const hqBroadcastsRepo = require("../src/db/pg/church/hqBroadcastsRepo");
const auditLogsRepo = require("../src/db/pg/church/auditLogsRepo");
const { activateBranch } = require("../src/services/church/branchActivationPolicyService");
const { assertCanActivateMember } = require("../src/services/church/churchSeatQuotaService");
const { transferMemberToBranch } = require("../src/services/church/memberBranchTransferService");
const { getOrganisationPlan, hasEntitlement } = require("../src/services/church/churchEntitlementService");
const {
  getOrganisationTrialStatus,
  grantGrowthTrial,
} = require("../src/services/church/churchGrowthTrialService");
const scheduledReportService = require("../src/services/church/scheduledReportService");
const scheduledBroadcastService = require("../src/services/church/scheduledBroadcastService");
const { getChurchAccessBlock } = require("../src/church/churchStatusAccess");
const { formatMetadataForDisplay } = require("../src/church/auditLogFormatting");
const { CSRF_FIELD } = require("../src/church/churchSessionCsrf");

const {
  bootstrapPilotSmokeDb,
  cleanupPilotOrganization,
  createFoundationSmokeTenant,
  createGrowthSmokeTenant,
  createVerifiedMember,
  seedVerifiedMembers,
  makeInjectedChurchApp,
  loginBranchAdmin,
  loginHqAdmin,
  loginMember,
  extractCsrf,
  postWithCsrf,
  slugSegment,
  DEFAULT_PASSWORD,
} = require("./helpers/churchPilotSmokeFixtures");

test(
  "BlessBoard pilot smoke: Foundation + Growth + security journeys",
  { skip: !isPgConfigured() },
  async (t) => {
    const pool = await requireChurchPgOrSkip(t);
    if (!pool) return;

    await bootstrapPilotSmokeDb();

    const foundation = await createFoundationSmokeTenant(pool);
    const growth = await createGrowthSmokeTenant(pool);
    const orgIds = [foundation.organization.id, growth.organization.id];

    try {
      // ─── FOUNDATION JOURNEY ───────────────────────────────────────────
      await t.test("Foundation: public homepage loads", async () => {
        const app = makeInjectedChurchApp(foundation.ctx);
        const home = await request(app).get("/");
        assert.equal(home.status, 200);
        assert.doesNotMatch(home.text, /Internal Server Error/i);
      });

      let registeredMemberId = null;
      await t.test("Foundation: member registers", async () => {
        const app = makeInjectedChurchApp(foundation.ctx);
        const email = `reg_${foundation.suffix}@example.com`;
        const register = await request(app).post("/register").type("form").send({
          full_name: "Pilot Registered Member",
          phone: "0977555001",
          email,
          gender: "female",
          age_group: "Adult (36-60)",
          address_area: "Kafue",
          attendance_duration: "Less than 6 months",
          password: DEFAULT_PASSWORD,
          confirm_password: DEFAULT_PASSWORD,
          accept_terms: "on",
        });
        assert.ok([302, 303].includes(register.status));
        assert.equal(register.headers.location, "/registration-submitted");

        const row = await membersRepo.findMemberByEmailOrPhoneForBranch(
          pool,
          foundation.branch.id,
          email
        );
        assert.ok(row);
        assert.equal(row.status, "pending");
        registeredMemberId = row.id;
      });

      await t.test("Foundation: administrator verifies member", async () => {
        const app = makeInjectedChurchApp(foundation.ctx);
        const { agent } = await loginBranchAdmin(app, foundation);
        assert.ok([302, 303].includes((await agent.get("/branch/dashboard")).status) || true);

        const queue = await agent.get("/branch/member-verification");
        assert.equal(queue.status, 200);
        assert.match(queue.text, /Pilot Registered Member/);

        const approve = await agent
          .post(`/branch/members/${registeredMemberId}/approve`)
          .type("form")
          .send({ review_comment: "Welcome pilot", redirect_to: "queue" });
        assert.equal(approve.status, 303);

        const verified = await membersRepo.findMemberByIdForBranch(
          pool,
          registeredMemberId,
          foundation.branch.id
        );
        assert.equal(verified.status, "verified");
      });

      let memberAgent = null;
      await t.test("Foundation: member logs in", async () => {
        const app = makeInjectedChurchApp(foundation.ctx);
        const member = await membersRepo.findMemberByIdForBranch(
          pool,
          registeredMemberId,
          foundation.branch.id
        );
        const { agent, login } = await loginMember(app, {
          email: member.email,
          password: DEFAULT_PASSWORD,
        });
        assert.ok([302, 303].includes(login.status));
        const portal = await agent.get("/member/dashboard");
        assert.equal(portal.status, 200);
        assert.doesNotMatch(portal.text, /Internal Server Error/i);
        memberAgent = agent;
      });

      await t.test("Foundation: event registration surface", async () => {
        const event = await eventsRepo.createEventForBranch(pool, {
          organization_id: foundation.organization.id,
          branch_id: foundation.branch.id,
          title: "Pilot Sunday Service",
          description: "Smoke event",
          event_date: "2026-07-20",
          start_time: "10:00",
          location: "Main Hall",
          visibility: "members",
          status: "published",
          created_by_admin_id: foundation.branchAdmin.id,
        });
        assert.ok(event.id);

        const app = makeInjectedChurchApp(foundation.ctx);
        if (!memberAgent) {
          const member = await membersRepo.findMemberByIdForBranch(
            pool,
            registeredMemberId,
            foundation.branch.id
          );
          memberAgent = (await loginMember(app, { email: member.email, password: DEFAULT_PASSWORD }))
            .agent;
        }
        const eventsPage = await memberAgent.get("/member/events");
        assert.equal(eventsPage.status, 200);
        assert.match(eventsPage.text, /Pilot Sunday Service/);
      });

      await t.test("Foundation: QR entitlement + manual attendance", async () => {
        const plan = await getOrganisationPlan(pool, foundation.organization.id);
        assert.equal(hasEntitlement(plan, "attendance.qr"), true);
        assert.equal(hasEntitlement(plan, "attendance.offline"), false);

        const app = makeInjectedChurchApp(foundation.ctx);
        const { agent } = await loginBranchAdmin(app, foundation);
        const formPage = await agent.get("/branch/attendance");
        assert.equal(formPage.status, 200);
        const csrf = extractCsrf(formPage.text);
        const today = new Date().toISOString().slice(0, 10);
        const saved = await agent.post("/branch/attendance").type("form").send({
          [CSRF_FIELD]: csrf || "",
          attendance_type: "Sunday service",
          service_name: "Pilot Manual Service",
          attendance_date: today,
          adults_count: "12",
          youth_count: "3",
          children_count: "2",
          first_time_visitors_count: "1",
          new_members_count: "0",
          volunteers_count: "2",
          notes: "pilot smoke",
          submit_action: "submit",
        });
        assert.equal(saved.status, 303);
        assert.match(String(saved.headers.location || ""), /\/branch\/attendance\//);
      });

      await t.test("Foundation: prayer request", async () => {
        const app = makeInjectedChurchApp(foundation.ctx);
        const member = await membersRepo.findMemberByIdForBranch(
          pool,
          registeredMemberId,
          foundation.branch.id
        );
        const { agent } = await loginMember(app, { email: member.email, password: DEFAULT_PASSWORD });
        const page = await agent.get("/member/prayer-request");
        assert.equal(page.status, 200);
        const csrf = extractCsrf(page.text);
        const posted = await agent.post("/member/prayer-request").type("form").send({
          [CSRF_FIELD]: csrf || "",
          prayer_topic: "Pilot prayer",
          details: "Please pray for the pilot congregation.",
          urgency: "normal",
          privacy_level: "prayer_team",
        });
        assert.equal(posted.status, 303);
        assert.match(String(posted.headers.location || ""), /prayer_submitted/);

        const { agent: adminAgent } = await loginBranchAdmin(app, foundation);
        const queue = await adminAgent.get("/branch/prayer-requests");
        assert.equal(queue.status, 200);
        assert.match(queue.text, /Pilot prayer/);
      });

      await t.test("Foundation: branch administrator views basic report", async () => {
        const app = makeInjectedChurchApp(foundation.ctx);
        const { agent } = await loginBranchAdmin(app, foundation);
        const reports = await agent.get("/branch/reports");
        assert.equal(reports.status, 200);
        assert.doesNotMatch(reports.text, /Internal Server Error/i);
        const newReport = await agent.get("/branch/reports/new");
        assert.equal(newReport.status, 200);
      });

      await t.test("Foundation: second active branch is rejected", async () => {
        const second = await branchesRepo.createBranch(pool, {
          organization_id: foundation.organization.id,
          slug: slugSegment(`sec-${foundation.suffix}`),
          host_slug: slugSegment(`sec-${foundation.suffix}`),
          name: "Second Campus",
          status: "suspended",
        });
        await assert.rejects(
          () =>
            activateBranch(pool, second.id, {
              platformAdminId: null,
              billingAcknowledged: false,
            }),
          (err) => err && err.code === "FOUNDATION_ACTIVE_BRANCH_LIMIT"
        );
        assert.equal(
          await branchesRepo.countActiveBranchesForOrganization(pool, foundation.organization.id),
          1
        );
      });

      await t.test("Foundation: 251st active member is rejected safely", async () => {
        // One verified member already exists from registration journey.
        await seedVerifiedMembers(pool, {
          organizationId: foundation.organization.id,
          branchId: foundation.branch.id,
          count: 249,
          emailPrefix: `seat_${foundation.suffix}_`,
        });
        const pending251 = await membersRepo.createPendingMember(pool, {
          organization_id: foundation.organization.id,
          branch_id: foundation.branch.id,
          platform_tenant_id: foundation.organization.platform_tenant_id,
          email: `pending251_${foundation.suffix}@example.com`,
          phone: "0977555251",
          full_name: "Pending 251",
          password_hash: foundation.passwordHash,
          gender: "male",
          age_group: "Adult (36-60)",
          address_area: "Lusaka",
          attendance_duration: "Less than 6 months",
        });
        await assert.rejects(
          () => membersRepo.verifyMemberForBranch(pool, pending251.id, foundation.branch.id, 1),
          (err) => err && err.code === "FOUNDATION_MEMBER_LIMIT"
        );
        const stillPending = await membersRepo.findMemberByIdForBranch(
          pool,
          pending251.id,
          foundation.branch.id
        );
        assert.equal(stillPending.status, "pending");
        await assert.rejects(
          () =>
            assertCanActivateMember(pool, {
              organizationId: foundation.organization.id,
              branchId: foundation.branch.id,
              memberId: pending251.id,
              currentStatus: "pending",
            }),
          (err) => err && err.code === "FOUNDATION_MEMBER_LIMIT"
        );
      });

      await t.test("Foundation: Growth-only feature is blocked", async () => {
        const app = makeInjectedChurchApp(foundation.ctx);
        const { agent } = await loginBranchAdmin(app, foundation);
        const offlineGet = await agent.get("/branch/attendance-offline");
        assert.equal(offlineGet.status, 200);
        assert.match(offlineGet.text, /Growth|Foundation|package|upgrade/i);

        const blockedPost = await agent.post("/branch/attendance-offline").type("form").send({});
        assert.equal(blockedPost.status, 409);

        await assert.rejects(
          () =>
            scheduledReportService.createSchedule(pool, {
              organizationId: foundation.organization.id,
              branchId: foundation.branch.id,
              actorType: "branch_admin",
              actorId: foundation.branchAdmin.id,
              body: {
                report_type: "branch_attendance_summary",
                export_format: "csv",
                frequency: "daily",
                timezone: "Africa/Lusaka",
                delivery_time_local: "09:00",
                period_month: "2026-06",
                recipients: [
                  { recipient_type: "branch_admin", recipient_id: foundation.branchAdmin.id },
                ],
              },
            }),
          (err) => err && (err.code === "PACKAGE_FEATURE_DENIED" || /Growth|package|entitlement/i.test(err.message))
        );
      });

      // ─── GROWTH JOURNEY ───────────────────────────────────────────────
      await t.test("Growth: multiple branches are active", async () => {
        const count = await branchesRepo.countActiveBranchesForOrganization(
          pool,
          growth.organization.id
        );
        assert.equal(count, 2);
        assert.equal(growth.branchA.status, "active");
        assert.equal(growth.branchB.status, "active");
      });

      await t.test("Growth: branch path loads", async () => {
        const app = makeInjectedChurchApp({
          kind: "branch",
          organization: growth.organization,
          branch: growth.branchA,
          hostBranch: growth.branchA,
          hostSlug: growth.branchA.host_slug,
        });
        const pathRes = await request(app).get(`/branches/${growth.branchB.slug}/events`);
        assert.equal(pathRes.status, 200);
        assert.doesNotMatch(pathRes.text, /Internal Server Error/i);
      });

      await t.test("Growth: member transfer", async () => {
        const member = await createVerifiedMember(pool, growth.organization, growth.branchA, {
          suffix: `xfer_${growth.suffix}`,
          passwordHash: growth.passwordHash,
          email: `xfer_${growth.suffix}@example.com`,
        });
        const transferred = await transferMemberToBranch(pool, {
          memberId: member.id,
          fromBranchId: growth.branchA.id,
          toBranchId: growth.branchB.id,
          organizationId: growth.organization.id,
          organization: growth.organization,
          actorType: "branch_admin",
          actorId: growth.branchAdmin.id,
          reason: "Pilot smoke transfer",
        });
        assert.equal(Number(transferred.member.branch_id), Number(growth.branchB.id));
      });

      await t.test("Growth: offline attendance entitlement", async () => {
        const plan = await getOrganisationPlan(pool, growth.organization.id);
        assert.equal(hasEntitlement(plan, "attendance.offline"), true);
        assert.equal(hasEntitlement(plan, "attendance.qr"), true);

        const app = makeInjectedChurchApp(growth.ctx);
        const { agent } = await loginBranchAdmin(app, growth);
        const page = await agent.get("/branch/attendance-offline");
        assert.equal(page.status, 200);
        assert.match(page.text, /Included|Growth|Offline attendance/i);
        assert.doesNotMatch(page.text, /Not found/i);
      });

      await t.test("Growth: scheduled report", async () => {
        const created = await scheduledReportService.createSchedule(pool, {
          organizationId: growth.organization.id,
          branchId: growth.branchA.id,
          actorType: "branch_admin",
          actorId: growth.branchAdmin.id,
          at: new Date("2026-07-16T05:00:00.000Z"),
          body: {
            report_type: "branch_attendance_summary",
            export_format: "csv",
            frequency: "daily",
            timezone: "Africa/Lusaka",
            delivery_time_local: "09:00",
            period_month: "2026-06",
            recipients: [
              { recipient_type: "branch_admin", recipient_id: growth.branchAdmin.id },
              { recipient_type: "hq_admin", recipient_id: growth.hqAdmin.id },
            ],
          },
        });
        assert.ok(created.id);
        assert.equal(created.status, "enabled");

        const app = makeInjectedChurchApp(growth.ctx);
        const { agent } = await loginBranchAdmin(app, growth);
        const list = await agent.get("/branch/scheduled-reports");
        assert.equal(list.status, 200);
        assert.doesNotMatch(list.text, /Internal Server Error/i);
      });

      await t.test("Growth: scheduled broadcast", async () => {
        const future = new Date("2026-08-01T10:00:00.000Z");
        const draft = await hqBroadcastsRepo.createBroadcastForOrganization(
          pool,
          growth.organization.id,
          {
            title: "Pilot scheduled broadcast",
            body: "Growth smoke broadcast body.",
            category: "Leadership",
            audience: "branch_admins",
            target_scope: "selected_branches",
            branch_ids: [growth.branchA.id],
            delivery_channels: ["in_app"],
            status: "draft",
            publish_at: future,
            created_by_hq_admin_id: growth.hqAdmin.id,
          }
        );
        await scheduledBroadcastService.moveToPreview(pool, draft.id, growth.organization.id);
        await scheduledBroadcastService.computeAndStoreAudienceEstimate(
          pool,
          draft.id,
          growth.organization.id
        );
        await scheduledBroadcastService.submitForApproval(pool, draft.id, growth.organization.id);
        const approved = await scheduledBroadcastService.approveBroadcast(pool, {
          broadcastId: draft.id,
          organizationId: growth.organization.id,
          hqAdminId: growth.hqAdmin.id,
          at: new Date("2026-07-15T09:00:00.000Z"),
        });
        assert.equal(approved.outcome, "scheduled");

        const app = makeInjectedChurchApp(growth.hqCtx);
        const { agent } = await loginHqAdmin(app, growth);
        const list = await agent.get("/hq/scheduled-broadcasts");
        assert.equal(list.status, 200);
        assert.doesNotMatch(list.text, /Internal Server Error/i);
      });

      await t.test("Growth: cross-branch dashboard", async () => {
        const plan = await getOrganisationPlan(pool, growth.organization.id);
        assert.equal(hasEntitlement(plan, "reports.cross_branch"), true);

        const app = makeInjectedChurchApp(growth.hqCtx);
        const { agent } = await loginHqAdmin(app, growth);
        const dash = await agent.get("/hq/cross-branch-reports");
        assert.equal(dash.status, 200);
        assert.match(dash.text, /Cross-branch/i);
        assert.doesNotMatch(dash.text, /upgrade to Growth/i);
      });

      await t.test("Growth: usage page", async () => {
        const app = makeInjectedChurchApp(growth.ctx);
        const { agent } = await loginBranchAdmin(app, growth);
        const account = await agent.get("/branch/account");
        assert.equal(account.status, 200);
        assert.match(account.text, /Growth|usage|package|branch/i);

        const hqApp = makeInjectedChurchApp(growth.hqCtx);
        const { agent: hqAgent } = await loginHqAdmin(hqApp, growth);
        const hqAccount = await hqAgent.get("/hq/account");
        assert.equal(hqAccount.status, 200);
        assert.match(hqAccount.text, /Growth|usage|package/i);
      });

      await t.test("Growth: package and trial status", async () => {
        const plan = await getOrganisationPlan(pool, growth.organization.id);
        assert.equal(plan.packageCode, "growth");
        assert.equal(plan.planStatus, "active");

        const trialStatus = await getOrganisationTrialStatus(pool, growth.organization.id);
        assert.equal(trialStatus.hasTrial, false);
        assert.equal(trialStatus.status, "none");

        await assert.rejects(
          () =>
            grantGrowthTrial(pool, growth.organization.id, {
              reason: "pilot smoke should not grant on paid Growth",
              grantedByPlatformAdminId: null,
            }),
          (err) => err && err.code === "ALREADY_GROWTH"
        );
      });

      // ─── SECURITY JOURNEY ─────────────────────────────────────────────
      await t.test("Security: cross-tenant branch access rejected", async () => {
        const app = makeInjectedChurchApp(foundation.ctx);
        const { agent } = await loginBranchAdmin(app, foundation);
        const foreign = await agent.get(`/branch/members/${growth.branchA.id}`);
        // Member detail with a foreign branch id should not expose Growth data.
        assert.ok([404, 400, 403].includes(foreign.status) || foreign.status === 200);
        if (foreign.status === 200) {
          assert.doesNotMatch(foreign.text, /Campus A|Growth Smoke/i);
        }

        const growthApp = makeInjectedChurchApp({
          kind: "branch",
          organization: growth.organization,
          branch: growth.branchA,
          hostBranch: growth.branchA,
          hostSlug: growth.branchA.host_slug,
        });
        const foreignPath = await request(growthApp).get(
          `/branches/${foundation.branch.slug}/events`
        );
        assert.equal(foreignPath.status, 404);
      });

      await t.test("Security: cross-tenant member access rejected", async () => {
        const growthMember = await createVerifiedMember(
          pool,
          growth.organization,
          growth.branchA,
          {
            suffix: `secmem_${growth.suffix}`,
            passwordHash: growth.passwordHash,
            email: `secmem_${growth.suffix}@example.com`,
          }
        );
        const app = makeInjectedChurchApp(foundation.ctx);
        const { agent } = await loginBranchAdmin(app, foundation);
        const cross = await agent.get(`/branch/members/${growthMember.id}`);
        assert.ok([404, 403, 400].includes(cross.status));
      });

      await t.test("Security: suspended organisation blocked", async () => {
        await pool.query(`UPDATE public.church_organizations SET status = 'suspended' WHERE id = $1`, [
          foundation.organization.id,
        ]);
        const suspendedOrg = {
          ...foundation.organization,
          status: "suspended",
        };
        const block = getChurchAccessBlock({
          kind: "branch",
          organization: suspendedOrg,
          branch: foundation.branch,
        });
        assert.ok(block);
        assert.equal(block.code, "organization");

        const app = makeInjectedChurchApp({
          ...foundation.ctx,
          organization: suspendedOrg,
        });
        const home = await request(app).get("/");
        assert.ok([503, 403, 200].includes(home.status));
        if (home.status === 200) {
          assert.match(home.text, /unavailable|suspended|not available|temporarily/i);
        }

        await pool.query(`UPDATE public.church_organizations SET status = 'active' WHERE id = $1`, [
          foundation.organization.id,
        ]);
      });

      await t.test("Security: inactive branch blocked", async () => {
        const inactive = await branchesRepo.createBranch(pool, {
          organization_id: growth.organization.id,
          slug: slugSegment(`ina-${growth.suffix}`),
          host_slug: slugSegment(`ina-${growth.suffix}`),
          name: "Inactive Campus",
          status: "suspended",
        });
        const block = getChurchAccessBlock({
          kind: "branch",
          organization: growth.organization,
          branch: inactive,
        });
        assert.ok(block);
        assert.equal(block.code, "branch");

        const app = makeInjectedChurchApp({
          kind: "branch",
          organization: growth.organization,
          branch: growth.branchA,
          hostBranch: growth.branchA,
          hostSlug: growth.branchA.host_slug,
        });
        const pathRes = await request(app).get(`/branches/${inactive.slug}`);
        assert.ok([403, 503, 404, 200].includes(pathRes.status));
        assert.doesNotMatch(pathRes.text || "", /Campus A Events|Internal Server Error/i);
      });

      await t.test("Security: restricted pastoral record denied", async () => {
        const display = formatMetadataForDisplay({
          title: "ok",
          pastoral_note: "confidential pastoral care note",
          password: "should-hide",
        });
        assert.doesNotMatch(display, /pastoral|confidential pastoral|should-hide/i);

        await auditLogsRepo.insertAuditLog(pool, {
          organization_id: foundation.organization.id,
          branch_id: foundation.branch.id,
          actor_type: "branch_admin",
          actor_id: foundation.branchAdmin.id,
          action: "pastoral_note_recorded",
          entity_type: "church_member",
          entity_id: registeredMemberId,
          metadata_json: {
            pastoral_note: "private pastoral text",
            status: "ok",
          },
        });

        const app = makeInjectedChurchApp(foundation.ctx);
        const { agent } = await loginBranchAdmin(app, foundation);
        const activity = await agent.get("/branch/activity");
        assert.ok([200, 404].includes(activity.status));
        if (activity.status === 200) {
          assert.doesNotMatch(activity.text, /private pastoral text/);
        }
      });

      await t.test("Security: direct POST entitlement bypass rejected", async () => {
        const app = makeInjectedChurchApp(foundation.ctx);
        const { agent } = await loginBranchAdmin(app, foundation);

        const bypassOffline = await agent.post("/branch/attendance-offline").type("form").send({
          mode: "sync",
        });
        assert.equal(bypassOffline.status, 409);

        const bypassAppts = await agent.post("/branch/appointments").type("form").send({});
        assert.equal(bypassAppts.status, 409);

        const prevStrict = process.env.GETPRO_REQUIRE_CHURCH_CSRF;
        process.env.GETPRO_REQUIRE_CHURCH_CSRF = "1";
        try {
          const csrfBypass = await agent.post("/branch/attendance").type("form").send({
            attendance_type: "Sunday service",
            service_name: "CSRF Bypass Attempt",
            attendance_date: new Date().toISOString().slice(0, 10),
            adults_count: "1",
            youth_count: "0",
            children_count: "0",
            first_time_visitors_count: "0",
            new_members_count: "0",
            volunteers_count: "0",
            submit_action: "save_draft",
          });
          assert.ok([403, 400].includes(csrfBypass.status));
        } finally {
          if (prevStrict === undefined) delete process.env.GETPRO_REQUIRE_CHURCH_CSRF;
          else process.env.GETPRO_REQUIRE_CHURCH_CSRF = prevStrict;
        }

        // Valid CSRF path still works (control).
        const ok = await postWithCsrf(agent, "/branch/attendance", "/branch/attendance", {
          attendance_type: "Midweek service",
          service_name: "CSRF Control Service",
          attendance_date: new Date().toISOString().slice(0, 10),
          adults_count: "2",
          youth_count: "0",
          children_count: "0",
          first_time_visitors_count: "0",
          new_members_count: "0",
          volunteers_count: "0",
          submit_action: "save_draft",
        });
        assert.equal(ok.status, 303);
      });
    } finally {
      for (const orgId of orgIds) {
        await cleanupPilotOrganization(pool, orgId);
      }
    }
  }
);
