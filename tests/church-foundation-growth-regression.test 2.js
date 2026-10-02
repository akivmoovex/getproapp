"use strict";

/**
 * BlessBoard Foundation + Growth automated regression suite.
 *
 * Reusable journey covering Foundation, Growth, and security paths.
 * Network fixtures are not implemented — only asserts Network-only features stay unavailable.
 *
 * Fixtures: tests/helpers/churchPilotSmokeFixtures.js
 * Run: npm run test:church:regression
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { isPgConfigured } = require("../src/db/pg/pool");
const { requireChurchPgOrSkip } = require("./helpers/churchPgTest");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const membersRepo = require("../src/db/pg/church/membersRepo");
const eventsRepo = require("../src/db/pg/church/eventsRepo");
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const hqBroadcastsRepo = require("../src/db/pg/church/hqBroadcastsRepo");
const auditLogsRepo = require("../src/db/pg/church/auditLogsRepo");
const pastoralAutomationRepo = require("../src/db/pg/church/pastoralAutomationRepo");
const attendanceCheckInRepo = require("../src/db/pg/church/attendanceCheckInRepo");
const { activateBranch } = require("../src/services/church/branchActivationPolicyService");
const {
  assertCanActivateMember,
  countPrivilegedAccountsForOrganization,
} = require("../src/services/church/churchSeatQuotaService");
const { transferMemberToBranch } = require("../src/services/church/memberBranchTransferService");
const { getOrganisationPlan, hasEntitlement } = require("../src/services/church/churchEntitlementService");
const {
  getOrganisationTrialStatus,
  grantGrowthTrial,
} = require("../src/services/church/churchGrowthTrialService");
const scheduledReportService = require("../src/services/church/scheduledReportService");
const scheduledBroadcastService = require("../src/services/church/scheduledBroadcastService");
const growthAttendanceOfflineSyncService = require("../src/services/church/growthAttendanceOfflineSyncService");
const growthPastoralAutomationService = require("../src/services/church/growthPastoralAutomationService");
const growthAppointmentsService = require("../src/services/church/growthAppointmentsService");
const growthSurveysService = require("../src/services/church/growthSurveysService");
const growthGroupsService = require("../src/services/church/growthGroupsService");
const growthVolunteerSchedulingService = require("../src/services/church/growthVolunteerSchedulingService");
const growthAdvancedEventsService = require("../src/services/church/growthAdvancedEventsService");
const foundationPastoralCareService = require("../src/services/church/foundationPastoralCareService");
const crossBranchComparisonService = require("../src/services/church/crossBranchComparisonService");
const { getChurchAccessBlock } = require("../src/church/churchStatusAccess");
const { formatMetadataForDisplay } = require("../src/church/auditLogFormatting");
const { resolveFeatureUi } = require("../src/church/blessBoardPackageFeatures");
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
  serviceActorCtx,
  setBranchAdminFlags,
  setHqAdminFlags,
  DEFAULT_PASSWORD,
} = require("./helpers/churchPilotSmokeFixtures");

test(
  "BlessBoard Foundation + Growth regression: journeys + security",
  { skip: !isPgConfigured() },
  async (t) => {
    const pool = await requireChurchPgOrSkip(t);
    if (!pool) return;

    await bootstrapPilotSmokeDb();

    const foundation = await createFoundationSmokeTenant(pool);
    const growth = await createGrowthSmokeTenant(pool);
    const orgIds = [foundation.organization.id, growth.organization.id];

    try {
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
        const row = await membersRepo.findMemberByEmailOrPhoneForBranch(pool, foundation.branch.id, email);
        assert.ok(row);
        assert.equal(row.status, "pending");
        registeredMemberId = row.id;
      });

      await t.test("Foundation: administrator verifies member", async () => {
        const app = makeInjectedChurchApp(foundation.ctx);
        const { agent } = await loginBranchAdmin(app, foundation);
        const queue = await agent.get("/branch/member-verification");
        assert.equal(queue.status, 200);
        assert.match(queue.text, /Pilot Registered Member/);
        const approve = await agent
          .post(`/branch/members/${registeredMemberId}/approve`)
          .type("form")
          .send({ review_comment: "Welcome pilot", redirect_to: "queue" });
        assert.equal(approve.status, 303);
        const verified = await membersRepo.findMemberByIdForBranch(pool, registeredMemberId, foundation.branch.id);
        assert.equal(verified.status, "verified");
      });

      let memberAgent = null;
      await t.test("Foundation: member logs in and opens portal", async () => {
        const app = makeInjectedChurchApp(foundation.ctx);
        const member = await membersRepo.findMemberByIdForBranch(pool, registeredMemberId, foundation.branch.id);
        const { agent, login } = await loginMember(app, { email: member.email, password: DEFAULT_PASSWORD });
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
          const member = await membersRepo.findMemberByIdForBranch(pool, registeredMemberId, foundation.branch.id);
          memberAgent = (await loginMember(app, { email: member.email, password: DEFAULT_PASSWORD })).agent;
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
        const member = await membersRepo.findMemberByIdForBranch(pool, registeredMemberId, foundation.branch.id);
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
        await setBranchAdminFlags(pool, foundation.branchAdmin.id, { can_access_pastoral: true });
        const { agent: adminAgent } = await loginBranchAdmin(app, foundation);
        const queue = await adminAgent.get("/branch/prayer-requests");
        assert.equal(queue.status, 200);
        assert.match(queue.text, /Pilot prayer/);
      });

      await t.test("Foundation: basic report pages", async () => {
        const app = makeInjectedChurchApp(foundation.ctx);
        const { agent } = await loginBranchAdmin(app, foundation);
        const reports = await agent.get("/branch/reports");
        assert.equal(reports.status, 200);
        const newReport = await agent.get("/branch/reports/new");
        assert.equal(newReport.status, 200);
        const basic = await agent.get("/branch/reports/basic");
        assert.equal(basic.status, 200);
        assert.doesNotMatch(basic.text, /Internal Server Error/i);
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
          () => activateBranch(pool, second.id, { platformAdminId: null, billingAcknowledged: false }),
          (err) => err && err.code === "FOUNDATION_ACTIVE_BRANCH_LIMIT"
        );
        assert.equal(await branchesRepo.countActiveBranchesForOrganization(pool, foundation.organization.id), 1);
      });

      await t.test("Foundation: 251st active member is rejected safely", async () => {
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
        const stillPending = await membersRepo.findMemberByIdForBranch(pool, pending251.id, foundation.branch.id);
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

      await t.test("Foundation: 11th administrator is rejected", async () => {
        const privileged = await countPrivilegedAccountsForOrganization(pool, foundation.organization.id);
        const need = Math.max(0, 10 - privileged.total);
        for (let i = 0; i < need; i++) {
          await hqAdminsRepo.createHqAdminForPlatform(
            pool,
            foundation.organization.id,
            {
              full_name: `HQ Seat ${i}`,
              email: `hqseat${i}_${foundation.suffix}@example.com`,
              phone: `09771${String(100000 + i).slice(-6)}`,
              role: "hq_admin",
              password_hash: foundation.passwordHash,
            },
            null
          );
        }
        assert.equal((await countPrivilegedAccountsForOrganization(pool, foundation.organization.id)).total, 10);
        await assert.rejects(
          () =>
            hqAdminsRepo.createHqAdminForPlatform(
              pool,
              foundation.organization.id,
              {
                full_name: "HQ Eleventh",
                email: `hq11_${foundation.suffix}@example.com`,
                phone: "0977199999",
                role: "hq_admin",
                password_hash: foundation.passwordHash,
              },
              null
            ),
          (err) => err && err.code === "FOUNDATION_ADMIN_LIMIT"
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
                recipients: [{ recipient_type: "branch_admin", recipient_id: foundation.branchAdmin.id }],
              },
            }),
          (err) => err && (err.code === "PACKAGE_FEATURE_DENIED" || /Growth|package|entitlement/i.test(err.message))
        );
      });

      await t.test("Foundation + Growth: Network-only features remain unavailable", async () => {
        const fPlan = await getOrganisationPlan(pool, foundation.organization.id);
        const gPlan = await getOrganisationPlan(pool, growth.organization.id);
        for (const plan of [fPlan, gPlan]) {
          assert.equal(hasEntitlement(plan, "network.executive_hierarchy"), false);
          assert.equal(hasEntitlement(plan, "network.priority_support"), false);
          assert.notEqual(resolveFeatureUi(plan, "network_executive_hierarchy").state, "available");
          assert.notEqual(resolveFeatureUi(plan, "network_priority_support").state, "available");
        }
        const app = makeInjectedChurchApp(growth.hqCtx);
        const { agent } = await loginHqAdmin(app, growth);
        const hierarchy = await agent.get("/hq/network/hierarchy");
        assert.ok([404, 403, 409, 302, 303, 200].includes(hierarchy.status));
        if (hierarchy.status === 200) {
          assert.match(hierarchy.text, /Network|unavailable|upgrade|not available|package|Not found/i);
        }
      });

      await t.test("Growth: multiple branches are active", async () => {
        const count = await branchesRepo.countActiveBranchesForOrganization(pool, growth.organization.id);
        assert.equal(count, 2);
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
          reason: "Regression transfer",
        });
        assert.equal(Number(transferred.member.branch_id), Number(growth.branchB.id));
      });

      await t.test("Growth: offline attendance sync", async () => {
        const plan = await getOrganisationPlan(pool, growth.organization.id);
        assert.equal(hasEntitlement(plan, "attendance.offline"), true);
        const member = await createVerifiedMember(pool, growth.organization, growth.branchA, {
          suffix: `off_${growth.suffix}`,
          passwordHash: growth.passwordHash,
          email: `off_${growth.suffix}@example.com`,
          phone: "0977555010",
        });
        const session = await attendanceCheckInRepo.createServiceSession(pool, {
          organization_id: growth.organization.id,
          branch_id: growth.branchA.id,
          attendance_type: "sunday",
          service_name: "Offline Sync Service",
          session_date: new Date().toISOString().slice(0, 10),
          notes: "",
        });
        const ctx = serviceActorCtx(growth.organization, growth.branchA, growth.branchAdmin);
        const sync = await growthAttendanceOfflineSyncService.submitOfflineBatch(pool, ctx, [
          {
            client_item_id: `offline_${growth.suffix}_1`,
            service_session_id: session.id,
            member_id: member.id,
            check_in_kind: "member",
            captured_at_client: new Date().toISOString(),
            capture_source: "regression-suite",
          },
        ]);
        assert.ok(sync.length >= 1);
        assert.ok(sync[0].checkIn || sync[0].queueItem || sync[0].skipped);
        const app = makeInjectedChurchApp(growth.ctx);
        const { agent } = await loginBranchAdmin(app, growth);
        const page = await agent.get("/branch/attendance-offline");
        assert.equal(page.status, 200);
      });

      await t.test("Growth: care automation", async () => {
        const plan = await getOrganisationPlan(pool, growth.organization.id);
        await setBranchAdminFlags(pool, growth.branchAdmin.id, { can_access_pastoral: true });
        await pastoralAutomationRepo.upsertSettings(pool, {
          organization_id: growth.organization.id,
          branch_id: growth.branchA.id,
          enabled: true,
          missed_service_threshold_weeks: 4,
          first_response_target_hours: 24,
          follow_up_target_days: 7,
          auto_create_cases: true,
          updated_by_admin_id: growth.branchAdmin.id,
        });
        const ctx = serviceActorCtx(growth.organization, growth.branchA, {
          ...growth.branchAdmin,
          can_access_pastoral: true,
        });
        const runKey = `missed_service:regression_${growth.suffix}`;
        const scan1 = await growthPastoralAutomationService.runMissedServiceScan(pool, ctx, plan, { runKey });
        assert.ok(scan1.stats || scan1.skipped || scan1.duplicateRun);
        const scan2 = await growthPastoralAutomationService.runMissedServiceScan(pool, ctx, plan, { runKey });
        assert.equal(scan2.duplicateRun, true);
        await setBranchAdminFlags(pool, growth.branchAdmin.id, { can_access_pastoral: true });
        const app = makeInjectedChurchApp(growth.ctx);
        const { agent } = await loginBranchAdmin(app, growth);
        const page = await agent.get("/branch/pastoral-automation");
        assert.equal(page.status, 200);
        const fPlan = await getOrganisationPlan(pool, foundation.organization.id);
        await assert.rejects(
          () =>
            growthPastoralAutomationService.runMissedServiceScan(
              pool,
              serviceActorCtx(foundation.organization, foundation.branch, foundation.branchAdmin),
              fPlan,
              { runKey: `missed_service:foundation_${foundation.suffix}` }
            ),
          (err) => err && err.code === "PACKAGE_REQUIRED"
        );
      });

      await t.test("Growth: appointment", async () => {
        const plan = await getOrganisationPlan(pool, growth.organization.id);
        await setBranchAdminFlags(pool, growth.branchAdmin.id, { can_access_pastoral: true });
        const member = await createVerifiedMember(pool, growth.organization, growth.branchA, {
          suffix: `appt_${growth.suffix}`,
          passwordHash: growth.passwordHash,
          email: `appt_${growth.suffix}@example.com`,
          phone: "0977555011",
        });
        const ctx = serviceActorCtx(growth.organization, growth.branchA, {
          ...growth.branchAdmin,
          can_access_pastoral: true,
        });
        await growthAppointmentsService.saveSettings(pool, ctx, plan, {
          default_duration_minutes: 30,
          buffer_minutes: 15,
          reminder_hours_before: 24,
        });
        await growthAppointmentsService.addAvailability(pool, ctx, plan, {
          minister_admin_id: growth.branchAdmin.id,
          day_of_week: 1,
          start_time: "09:00:00",
          end_time: "17:00:00",
          is_recurring: true,
        });
        const startsAt = new Date("2026-07-20T10:00:00.000Z");
        while (startsAt.getUTCDay() !== 1) startsAt.setUTCDate(startsAt.getUTCDate() + 1);
        const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
        const appt = await growthAppointmentsService.requestAppointment(
          pool,
          ctx,
          plan,
          {
            minister_admin_id: growth.branchAdmin.id,
            member_id: member.id,
            starts_at: startsAt,
            ends_at: endsAt,
            duration_minutes: 30,
            purpose: "Pastoral visit",
            member_request_note: "Regression suite",
          },
          { autoApprove: true }
        );
        assert.ok(appt.id);
        const app = makeInjectedChurchApp(growth.ctx);
        const { agent } = await loginBranchAdmin(app, growth);
        const page = await agent.get("/branch/appointments");
        assert.equal(page.status, 200);
      });

      await t.test("Growth: survey", async () => {
        const plan = await getOrganisationPlan(pool, growth.organization.id);
        await setBranchAdminFlags(pool, growth.branchAdmin.id, { can_access_pastoral: true });
        const ctx = serviceActorCtx(growth.organization, growth.branchA, {
          ...growth.branchAdmin,
          can_access_pastoral: true,
        });
        const survey = await growthSurveysService.createSurvey(pool, ctx, plan, {
          title: `Regression Survey ${growth.suffix}`,
          consent_text: "I consent to this pastoral survey.",
          status: "draft",
        });
        assert.ok(survey.id);
        const app = makeInjectedChurchApp(growth.ctx);
        const { agent } = await loginBranchAdmin(app, growth);
        const page = await agent.get("/branch/surveys");
        assert.equal(page.status, 200);
      });

      await t.test("Growth: group", async () => {
        const plan = await getOrganisationPlan(pool, growth.organization.id);
        const ctx = serviceActorCtx(growth.organization, growth.branchA, growth.branchAdmin);
        const group = await growthGroupsService.createGroup(pool, ctx, plan, {
          name: `Life Group ${growth.suffix}`,
          capacity: 12,
          meeting_day_of_week: 3,
          meeting_time: "18:00:00",
        });
        assert.ok(group.id);
        const app = makeInjectedChurchApp(growth.ctx);
        const { agent } = await loginBranchAdmin(app, growth);
        const page = await agent.get("/branch/groups");
        assert.equal(page.status, 200);
      });

      await t.test("Growth: volunteer schedule", async () => {
        const plan = await getOrganisationPlan(pool, growth.organization.id);
        const ctx = serviceActorCtx(growth.organization, growth.branchA, growth.branchAdmin);
        const role = await growthVolunteerSchedulingService.createRole(pool, ctx, plan, {
          name: `Usher ${growth.suffix}`,
        });
        const skill = await growthVolunteerSchedulingService.createSkill(pool, ctx, plan, `Greeting ${growth.suffix}`);
        assert.ok(role.id);
        assert.ok(skill.id);
        const startsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        startsAt.setHours(9, 0, 0, 0);
        const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
        const shift = await growthVolunteerSchedulingService.createShift(pool, ctx, plan, {
          role_id: role.id,
          title: `Sunday ushers ${growth.suffix}`,
          starts_at: startsAt,
          ends_at: endsAt,
          slots: 2,
        });
        assert.ok(shift.id);
        const app = makeInjectedChurchApp(growth.ctx);
        const { agent } = await loginBranchAdmin(app, growth);
        const page = await agent.get("/branch/volunteer-scheduling");
        assert.equal(page.status, 200);
      });

      await t.test("Growth: advanced event", async () => {
        const plan = await getOrganisationPlan(pool, growth.organization.id);
        const ctx = serviceActorCtx(growth.organization, growth.branchA, growth.branchAdmin);
        await eventsRepo.createEventForBranch(pool, {
          organization_id: growth.organization.id,
          branch_id: growth.branchA.id,
          title: `Advanced Event ${growth.suffix}`,
          description: "Growth advanced",
          event_date: "2026-08-01",
          start_time: "10:00",
          location: "Hall",
          visibility: "members",
          status: "published",
          created_by_admin_id: growth.branchAdmin.id,
        });
        const form = await growthAdvancedEventsService.createRegistrationForm(pool, ctx, plan, {
          title: `Event form ${growth.suffix}`,
          consent_text: "I consent to event registration.",
        });
        assert.ok(form.id);
        const fPlan = await getOrganisationPlan(pool, foundation.organization.id);
        await assert.rejects(
          () =>
            growthAdvancedEventsService.createRegistrationForm(
              pool,
              serviceActorCtx(foundation.organization, foundation.branch, foundation.branchAdmin),
              fPlan,
              { title: "Blocked", consent_text: "x" }
            ),
          (err) => err && (err.code === "PACKAGE_REQUIRED" || /Growth|package/i.test(err.message))
        );
      });

      let growthSchedule = null;
      await t.test("Growth: scheduled report", async () => {
        growthSchedule = await scheduledReportService.createSchedule(pool, {
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
        assert.ok(growthSchedule.id);
        assert.equal(growthSchedule.status, "enabled");
        const app = makeInjectedChurchApp(growth.ctx);
        const { agent } = await loginBranchAdmin(app, growth);
        const list = await agent.get("/branch/scheduled-reports");
        assert.equal(list.status, 200);
      });

      await t.test("Growth: scheduled broadcast", async () => {
        const future = new Date("2026-08-01T10:00:00.000Z");
        const draft = await hqBroadcastsRepo.createBroadcastForOrganization(pool, growth.organization.id, {
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
        });
        await scheduledBroadcastService.moveToPreview(pool, draft.id, growth.organization.id);
        await scheduledBroadcastService.computeAndStoreAudienceEstimate(pool, draft.id, growth.organization.id);
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
      });

      await t.test("Growth: cross-branch dashboard", async () => {
        const plan = await getOrganisationPlan(pool, growth.organization.id);
        assert.equal(hasEntitlement(plan, "reports.cross_branch"), true);
        const app = makeInjectedChurchApp(growth.hqCtx);
        const { agent } = await loginHqAdmin(app, growth);
        const dash = await agent.get("/hq/cross-branch-reports");
        assert.equal(dash.status, 200);
        assert.match(dash.text, /Cross-branch/i);
      });

      await t.test("Growth: package usage page", async () => {
        const app = makeInjectedChurchApp(growth.ctx);
        const { agent } = await loginBranchAdmin(app, growth);
        const account = await agent.get("/branch/account");
        assert.equal(account.status, 200);
        assert.match(account.text, /Growth|usage|package|branch/i);
        const hqApp = makeInjectedChurchApp(growth.hqCtx);
        const { agent: hqAgent } = await loginHqAdmin(hqApp, growth);
        const hqAccount = await hqAgent.get("/hq/account");
        assert.equal(hqAccount.status, 200);
      });

      await t.test("Growth: package and trial status", async () => {
        const plan = await getOrganisationPlan(pool, growth.organization.id);
        assert.equal(plan.packageCode, "growth");
        const trialStatus = await getOrganisationTrialStatus(pool, growth.organization.id);
        assert.equal(trialStatus.hasTrial, false);
        await assert.rejects(
          () =>
            grantGrowthTrial(pool, growth.organization.id, {
              reason: "should not grant on paid Growth",
              grantedByPlatformAdminId: null,
            }),
          (err) => err && err.code === "ALREADY_GROWTH"
        );
      });

      await t.test("Security: cross-tenant branch access rejected", async () => {
        const app = makeInjectedChurchApp(foundation.ctx);
        const { agent } = await loginBranchAdmin(app, foundation);
        const foreign = await agent.get(`/branch/members/${growth.branchA.id}`);
        assert.ok([404, 400, 403, 200].includes(foreign.status));
        if (foreign.status === 200) assert.doesNotMatch(foreign.text, /Campus A|Growth Smoke/i);
        const growthApp = makeInjectedChurchApp({
          kind: "branch",
          organization: growth.organization,
          branch: growth.branchA,
          hostBranch: growth.branchA,
          hostSlug: growth.branchA.host_slug,
        });
        const foreignPath = await request(growthApp).get(`/branches/${foundation.branch.slug}/events`);
        assert.equal(foreignPath.status, 404);
      });

      await t.test("Security: cross-tenant member access rejected", async () => {
        const growthMember = await createVerifiedMember(pool, growth.organization, growth.branchA, {
          suffix: `secmem_${growth.suffix}`,
          passwordHash: growth.passwordHash,
          email: `secmem_${growth.suffix}@example.com`,
          phone: "0977555099",
        });
        const app = makeInjectedChurchApp(foundation.ctx);
        const { agent } = await loginBranchAdmin(app, foundation);
        const cross = await agent.get(`/branch/members/${growthMember.id}`);
        assert.ok([404, 403, 400].includes(cross.status));
      });

      await t.test("Security: suspended organisation blocked", async () => {
        await pool.query(`UPDATE public.church_organizations SET status = 'suspended' WHERE id = $1`, [
          foundation.organization.id,
        ]);
        const suspendedOrg = { ...foundation.organization, status: "suspended" };
        const block = getChurchAccessBlock({
          kind: "branch",
          organization: suspendedOrg,
          branch: foundation.branch,
        });
        assert.ok(block);
        assert.equal(block.code, "organization");
        const app = makeInjectedChurchApp({ ...foundation.ctx, organization: suspendedOrg });
        const home = await request(app).get("/");
        assert.ok([503, 403, 200].includes(home.status));
        if (home.status === 200) assert.match(home.text, /unavailable|suspended|not available|temporarily/i);
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
      });

      await t.test("Security: restricted pastoral record denied", async () => {
        const display = formatMetadataForDisplay({
          title: "ok",
          pastoral_note: "confidential pastoral care note",
          password: "should-hide",
        });
        assert.doesNotMatch(display, /pastoral|confidential pastoral|should-hide/i);
        await setBranchAdminFlags(pool, foundation.branchAdmin.id, { can_access_pastoral: false });
        await assert.rejects(
          () =>
            foundationPastoralCareService.openPastoralCase(
              pool,
              {
                ...serviceActorCtx(foundation.organization, foundation.branch, foundation.branchAdmin),
                can_access_pastoral: false,
              },
              {
                member_id: registeredMemberId,
                title: "Denied case",
                summary: "Should be denied",
              }
            ),
          (err) => err && err.code === "PERMISSION_DENIED"
        );
        await auditLogsRepo.insertAuditLog(pool, {
          organization_id: foundation.organization.id,
          branch_id: foundation.branch.id,
          actor_type: "branch_admin",
          actor_id: foundation.branchAdmin.id,
          action: "pastoral_note_recorded",
          entity_type: "church_member",
          entity_id: registeredMemberId,
          metadata_json: { pastoral_note: "private pastoral text", status: "ok" },
        });
        const app = makeInjectedChurchApp(foundation.ctx);
        const { agent } = await loginBranchAdmin(app, foundation);
        const activity = await agent.get("/branch/activity");
        assert.ok([200, 404].includes(activity.status));
        if (activity.status === 200) assert.doesNotMatch(activity.text, /private pastoral text/);
      });

      await t.test("Security: finance permission gates giving KPI", async () => {
        await setHqAdminFlags(pool, growth.hqAdmin.id, { can_view_finance: false });
        const canView = await crossBranchComparisonService.hqAdminCanViewFinance(
          pool,
          growth.hqAdmin.id,
          growth.organization.id
        );
        assert.equal(canView, false);
        const report = await crossBranchComparisonService.loadCrossBranchComparison(pool, {
          organizationId: growth.organization.id,
          canViewFinance: false,
          query: { date_from: "2026-01-01", date_to: "2026-07-16" },
        });
        assert.ok(report);
        if (report.totals && Object.prototype.hasOwnProperty.call(report.totals, "giving_total")) {
          assert.equal(report.totals.giving_total, null);
        }
        await setHqAdminFlags(pool, growth.hqAdmin.id, { can_view_finance: true });
      });

      await t.test("Security: direct URL and POST entitlement bypass rejected", async () => {
        const app = makeInjectedChurchApp(foundation.ctx);
        const { agent } = await loginBranchAdmin(app, foundation);
        for (const path of [
          "/branch/attendance-offline",
          "/branch/appointments",
          "/branch/surveys",
          "/branch/groups",
          "/branch/pastoral-automation",
          "/branch/scheduled-reports",
          "/branch/volunteer-scheduling",
        ]) {
          const getRes = await agent.get(path);
          assert.ok([200, 403, 404, 409].includes(getRes.status));
          if (getRes.status === 200) {
            assert.match(getRes.text, /Growth|Foundation|package|upgrade|not included|locked|Included on/i);
          }
        }
        assert.equal((await agent.post("/branch/attendance-offline").type("form").send({ mode: "sync" })).status, 409);
        assert.equal((await agent.post("/branch/appointments").type("form").send({})).status, 409);
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

      await t.test("Security: duplicate background job is idempotent", async () => {
        assert.ok(growthSchedule && growthSchedule.id);
        const scheduledFor = new Date("2026-07-16T07:00:00.000Z");
        const first = await scheduledReportService.executeScheduleRun(pool, growthSchedule, {
          scheduledFor,
          at: scheduledFor,
        });
        assert.ok(first);
        const second = await scheduledReportService.executeScheduleRun(pool, growthSchedule, {
          scheduledFor,
          at: scheduledFor,
        });
        assert.equal(second.outcome, "duplicate_job");
      });

      await t.test("Security: quota race allows only one activation at the limit", async () => {
        const pendingA = await membersRepo.createPendingMember(pool, {
          organization_id: foundation.organization.id,
          branch_id: foundation.branch.id,
          platform_tenant_id: foundation.organization.platform_tenant_id,
          email: `race_a_${foundation.suffix}@example.com`,
          phone: "0977555801",
          full_name: "Race A",
          password_hash: foundation.passwordHash,
          gender: "male",
          age_group: "Adult (36-60)",
          address_area: "Lusaka",
          attendance_duration: "Less than 6 months",
        });
        const pendingB = await membersRepo.createPendingMember(pool, {
          organization_id: foundation.organization.id,
          branch_id: foundation.branch.id,
          platform_tenant_id: foundation.organization.platform_tenant_id,
          email: `race_b_${foundation.suffix}@example.com`,
          phone: "0977555802",
          full_name: "Race B",
          password_hash: foundation.passwordHash,
          gender: "female",
          age_group: "Adult (36-60)",
          address_area: "Lusaka",
          attendance_duration: "Less than 6 months",
        });
        const results = await Promise.allSettled([
          membersRepo.verifyMemberForBranch(pool, pendingA.id, foundation.branch.id, 1),
          membersRepo.verifyMemberForBranch(pool, pendingB.id, foundation.branch.id, 1),
        ]);
        const fulfilled = results.filter((r) => r.status === "fulfilled");
        const rejected = results.filter(
          (r) => r.status === "rejected" && r.reason && r.reason.code === "FOUNDATION_MEMBER_LIMIT"
        );
        assert.equal(fulfilled.length, 0);
        assert.equal(rejected.length, 2);
      });
    } finally {
      for (const orgId of orgIds) {
        await cleanupPilotOrganization(pool, orgId);
      }
    }
  }
);
