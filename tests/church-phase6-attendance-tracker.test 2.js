"use strict";

const path = require("path");
const fs = require("fs");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const branchAdminsRepo = require("../src/db/pg/church/branchAdminsRepo");
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const attendanceRepo = require("../src/db/pg/church/attendanceRepo");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const churchRoutes = require("../src/routes/church");
const {
  parseAttendanceTrackerQuery,
  resolveAttendanceListState,
  ATTENDANCE_TRACKER_UNIQUENESS_RULE,
} = require("../src/church/attendanceValidation");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeApp(ctx, isChurchHost = true) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "test-phase6-attendance",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isChurchHost = isChurchHost;
    req.churchContext = ctx;
    next();
  });
  app.use(churchRoutes());
  app.use((req, res) => res.status(404).type("text").send("not found"));
  return app;
}

function extractCsrf(html) {
  const m = String(html || "").match(/name="_csrf"[^>]*value="([^"]+)"/);
  return m ? m[1] : "";
}

async function cleanup(pool, branchIds, orgIds) {
  for (const branchId of branchIds) {
    await pool.query(`DELETE FROM public.church_audit_logs WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_attendance_records WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branchId]);
  }
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("parseAttendanceTrackerQuery allowlists filters", () => {
  assert.deepEqual(parseAttendanceTrackerQuery({ type: "Sunday service", status: "draft", q: " am ", month: "2026-07" }), {
    attendanceType: "Sunday service",
    status: "draft",
    q: "am",
    month: "2026-07",
    date: "",
    branchId: null,
    showForm: false,
  });
  assert.equal(parseAttendanceTrackerQuery({ type: "DROP TABLE" }).attendanceType, "all");
  assert.equal(parseAttendanceTrackerQuery({ status: "present" }).status, "all");
  assert.equal(parseAttendanceTrackerQuery({ branch_id: "-1" }).branchId, null);
  assert.equal(parseAttendanceTrackerQuery({ new: "1" }).showForm, true);
});

test("resolveAttendanceListState distinguishes empty and no_results", () => {
  assert.equal(resolveAttendanceListState({ q: "" }, [], { hasRecordsInScope: false }), "empty");
  assert.equal(resolveAttendanceListState({ q: "x" }, []), "no_results");
  assert.equal(resolveAttendanceListState({ status: "draft" }, []), "no_results");
  assert.equal(resolveAttendanceListState({ q: "" }, [{ id: 1 }]), "results");
});

test("attendance uniqueness rule is documented for branch tracker rows", () => {
  assert.match(ATTENDANCE_TRACKER_UNIQUENESS_RULE, /branch_id/);
  assert.match(ATTENDANCE_TRACKER_UNIQUENESS_RULE, /service_date/);
  assert.match(ATTENDANCE_TRACKER_UNIQUENESS_RULE, /ministry_id IS NULL/);
});

test("Giving navigation stays separate from Attendance destinations", () => {
  const nav = fs.readFileSync(
    path.join(__dirname, "../src/church/http/classicAdminNav.js"),
    "utf8"
  );
  const shell = fs.readFileSync(
    path.join(__dirname, "../views/church/partials/branch_admin_shell_start.ejs"),
    "utf8"
  );
  assert.match(nav, /href: "\/branch\/attendance"/);
  assert.match(nav, /testId: "nav-attendance"/);
  assert.match(nav, /href: "\/branch\/giving-summary"/);
  assert.match(nav, /testId: "nav-giving"/);
  assert.doesNotMatch(nav, /testId: "nav-giving"[^]*href: "\/branch\/attendance/);
  const givingItem = nav.match(/key: "giving-summary"[\s\S]*?testId: "nav-giving"/);
  assert.ok(givingItem);
  assert.match(givingItem[0], /href: "\/branch\/giving-summary"/);
  assert.doesNotMatch(givingItem[0], /\/branch\/attendance/);
  assert.match(shell, /data-testid="nav-more-giving"/);
  assert.match(shell, /href="\/branch\/giving-summary"/);
  assert.match(shell, /href="\/branch\/attendance"/);
  assert.doesNotMatch(shell, /href="\/branch\/attendance"[^>]*>\s*Giving\s*</);
});

test("unauthenticated and non-church hosts cannot open attendance tracker", async () => {
  const blocked = makeApp(null, false);
  assert.equal((await request(blocked).get("/branch/attendance")).status, 404);
  assert.equal((await request(blocked).get("/hq/attendance")).status, 404);

  const app = makeApp({
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Demo", status: "active", plan_code: "foundation" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  const branch = await request(app).get("/branch/attendance");
  assert.equal(branch.status, 302);
  assert.equal(branch.headers.location, "/branch/login");
  const hq = await request(app).get("/hq/attendance");
  assert.equal(hq.status, 302);
  assert.equal(hq.headers.location, "/hq/login");
});

test(
  "Phase 6 branch attendance tracker: retrieve, create, update, duplicate, isolation, CSRF, empty, responsive",
  async (t) => {
    if (!isPgConfigured()) return t.skip("PostgreSQL not configured");
    const pool = getPgPool();
    try {
      await ensureCanonicalTenantsForTests(pool);
      await ensureChurchSchema(pool);
    } catch (err) {
      return t.skip(`Church PG schema unavailable: ${err.message}`);
    }

    const suffix = makeSuffix("p6att");
    const passwordHash = await bcrypt.hash("testpass123", 12);
    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `p6aa_${suffix}`.slice(0, 40),
      name: `Phase6 Att A ${suffix}`,
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `p6ab_${suffix}`.slice(0, 40),
      name: `Phase6 Att B ${suffix}`,
    });
    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: "main",
      host_slug: `hs_branchA_${suffix}`.slice(0, 40),
      name: `Branch A ${suffix}`,
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgB.id,
      slug: "main",
      host_slug: `hs_branchB_${suffix}`.slice(0, 40),
      name: `Branch B ${suffix}`,
    });
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      full_name: "Admin A",
      email: `admin_a_${suffix}@example.com`,
      phone: "0977111001",
      password_hash: passwordHash,
    });
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgB.id,
      branch_id: branchB.id,
      full_name: "Admin B",
      email: `admin_b_${suffix}@example.com`,
      phone: "0977111002",
      password_hash: passwordHash,
    });

    const appA = makeApp({
      kind: "branch",
      orgSlug: orgA.slug,
      organization: orgA,
      branch: branchA,
    });
    const agent = request.agent(appA);
    await agent.post("/branch/login").type("form").send({
      identifier: `admin_a_${suffix}@example.com`,
      password: "testpass123",
    });

    const emptyPage = await agent.get("/branch/attendance");
    assert.equal(emptyPage.status, 200);
    assert.match(emptyPage.text, /data-p6-screen="attendance-tracker"/);
    assert.match(emptyPage.text, /data-list-state="empty"/);
    assert.match(emptyPage.text, /data-testid="attendance-empty"/);
    assert.match(emptyPage.text, /data-responsive="desktop-mobile"/);
    assert.match(emptyPage.text, /data-testid="nav-giving"/);
    assert.match(emptyPage.text, /href="\/branch\/giving-summary"/);
    assert.doesNotMatch(emptyPage.text, /data-testid="nav-giving"[^>]*href="\/branch\/attendance/);
    assert.doesNotMatch(emptyPage.text, /\bPresent\b|\bAbsent\b|\bLate\b|\bExcused\b/);

    const formPage = await agent.get("/branch/attendance?new=1");
    assert.equal(formPage.status, 200);
    assert.match(formPage.text, /data-testid="attendance-compose"/);
    assert.match(formPage.text, /data-unsaved-guard="1"/);
    const csrf = extractCsrf(formPage.text);
    assert.ok(csrf);

    const create = await agent.post("/branch/attendance").type("form").send({
      _csrf: csrf,
      attendance_type: "Sunday service",
      service_name: "Morning Worship",
      attendance_date: "2026-07-12",
      adults_count: 40,
      youth_count: 10,
      children_count: 5,
      first_time_visitors_count: 2,
      new_members_count: 1,
      volunteers_count: 8,
      notes: "Phase 6 create",
      submit_action: "save_draft",
    });
    assert.equal(create.status, 303);
    const recordId = Number(String(create.headers.location).match(/\/branch\/attendance\/(\d+)/)[1]);
    assert.ok(recordId > 0);

    const stored = await attendanceRepo.findAttendanceRecordByIdForBranch(pool, recordId, branchA.id);
    assert.equal(stored.status, "draft");
    assert.equal(stored.adults_count, 40);
    assert.equal(await attendanceRepo.findAttendanceRecordByIdForBranch(pool, recordId, branchB.id), null);

    const list = await agent.get("/branch/attendance");
    assert.equal(list.status, 200);
    assert.match(list.text, /data-list-state="results"/);
    assert.match(list.text, /data-testid="attendance-table"/);
    assert.match(list.text, /data-testid="attendance-cards"/);
    assert.match(list.text, /Morning Worship/);
    assert.match(list.text, /data-testid="attendance-overview"/);

    const filtered = await agent.get("/branch/attendance?type=Sunday%20service&status=draft&q=Morning");
    assert.equal(filtered.status, 200);
    assert.match(filtered.text, /Morning Worship/);
    const miss = await agent.get("/branch/attendance?q=zzzz-no-match");
    assert.equal(miss.status, 200);
    assert.match(miss.text, /data-testid="attendance-no-results"/);

    const updateCsrfPage = await agent.get("/branch/attendance?new=1");
    const updateCsrf = extractCsrf(updateCsrfPage.text);
    const update = await agent.post("/branch/attendance").type("form").send({
      _csrf: updateCsrf,
      attendance_type: "Sunday service",
      service_name: "Morning Worship",
      attendance_date: "2026-07-12",
      adults_count: 45,
      youth_count: 10,
      children_count: 5,
      first_time_visitors_count: 2,
      new_members_count: 1,
      volunteers_count: 8,
      notes: "Updated draft",
      submit_action: "save_draft",
    });
    assert.equal(update.status, 303);
    assert.match(String(update.headers.location), /notice=updated/);
    const updated = await attendanceRepo.findAttendanceRecordByIdForBranch(pool, recordId, branchA.id);
    assert.equal(updated.adults_count, 45);

    const detail = await agent.get(`/branch/attendance/${recordId}`);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-p6-screen="attendance-record-detail"/);
    assert.match(detail.text, /data-testid="attendance-detail-back"/);
    assert.match(detail.text, /data-testid="attendance-detail-breakdown"/);
    assert.match(detail.text, /data-testid="attendance-detail-members-empty"/);
    assert.match(detail.text, /data-testid="attendance-detail-context"/);
    assert.match(detail.text, /data-testid="attendance-detail-total"/);
    assert.match(detail.text, /Individual member attendance was not recorded for this service/);
    assert.match(detail.text, /data-testid="attendance-detail-edit"/);
    assert.match(detail.text, /data-testid="attendance-detail-submit"/);
    assert.match(detail.text, /data-testid="attendance-detail-mobile-actions"/);
    assert.match(detail.text, /href="\/branch\/attendance"/);
    assert.doesNotMatch(detail.text, /\+12%|Sunny,|Weather|First Service \(08:00\)/);
    assert.doesNotMatch(detail.text, /aggregate headcounts/i);

    const editPage = await agent.get(`/branch/attendance/${recordId}?edit=1`);
    assert.equal(editPage.status, 200);
    assert.match(editPage.text, /data-edit-mode="1"/);
    assert.match(editPage.text, /data-testid="attendance-detail-edit-form"/);
    const detailCsrf = extractCsrf(editPage.text);
    const detailUpdate = await agent.post(`/branch/attendance/${recordId}/update`).type("form").send({
      _csrf: detailCsrf,
      attendance_type: "Sunday service",
      service_name: "Morning Worship",
      attendance_date: "2026-07-12",
      adults_count: 50,
      youth_count: 10,
      children_count: 5,
      first_time_visitors_count: 2,
      new_members_count: 1,
      volunteers_count: 8,
      notes: "Edited on detail",
      submit_action: "save_draft",
    });
    assert.equal(detailUpdate.status, 303);
    assert.match(String(detailUpdate.headers.location), /notice=updated/);
    const afterDetailEdit = await attendanceRepo.findAttendanceRecordByIdForBranch(pool, recordId, branchA.id);
    assert.equal(afterDetailEdit.adults_count, 50);
    assert.equal(afterDetailEdit.notes, "Edited on detail");

    const prevEditCsrf = process.env.GETPRO_REQUIRE_CHURCH_CSRF;
    process.env.GETPRO_REQUIRE_CHURCH_CSRF = "1";
    try {
      const detailCsrfReject = await agent.post(`/branch/attendance/${recordId}/update`).type("form").send({
        attendance_type: "Sunday service",
        service_name: "Morning Worship",
        attendance_date: "2026-07-12",
        adults_count: 1,
        youth_count: 0,
        children_count: 0,
        first_time_visitors_count: 0,
        new_members_count: 0,
        volunteers_count: 0,
        submit_action: "save_draft",
      });
      assert.equal(detailCsrfReject.status, 403);
    } finally {
      if (prevEditCsrf === undefined) delete process.env.GETPRO_REQUIRE_CHURCH_CSRF;
      else process.env.GETPRO_REQUIRE_CHURCH_CSRF = prevEditCsrf;
    }

    await attendanceRepo.updateAttendanceStatusForBranch(pool, recordId, branchA.id, "submitted");
    const submittedDetail = await agent.get(`/branch/attendance/${recordId}`);
    assert.equal(submittedDetail.status, 200);
    assert.doesNotMatch(submittedDetail.text, /data-testid="attendance-detail-edit"/);
    assert.equal((await agent.get(`/branch/attendance/${recordId}?edit=1`)).text.includes('data-edit-mode="1"'), false);

    const dupCsrfPage = await agent.get("/branch/attendance?new=1");
    const dupCsrf = extractCsrf(dupCsrfPage.text);
    const duplicate = await agent.post("/branch/attendance").type("form").send({
      _csrf: dupCsrf,
      attendance_type: "Sunday service",
      service_name: "morning worship",
      attendance_date: "2026-07-12",
      adults_count: 1,
      youth_count: 0,
      children_count: 0,
      first_time_visitors_count: 0,
      new_members_count: 0,
      volunteers_count: 0,
      submit_action: "save_draft",
    });
    assert.equal(duplicate.status, 409);
    assert.match(duplicate.text, /already exists/i);

    const invalidRecord = await agent.get("/branch/attendance/999999999");
    assert.equal(invalidRecord.status, 404);
    const invalidType = await agent.post("/branch/attendance").type("form").send({
      _csrf: extractCsrf((await agent.get("/branch/attendance?new=1")).text),
      attendance_type: "Not A Real Type",
      service_name: "X",
      attendance_date: "2026-07-13",
      adults_count: 1,
      youth_count: 0,
      children_count: 0,
      first_time_visitors_count: 0,
      new_members_count: 0,
      volunteers_count: 0,
      submit_action: "save_draft",
    });
    assert.equal(invalidType.status, 400);

    const prev = process.env.GETPRO_REQUIRE_CHURCH_CSRF;
    process.env.GETPRO_REQUIRE_CHURCH_CSRF = "1";
    try {
      const csrfReject = await agent.post("/branch/attendance").type("form").send({
        attendance_type: "Sunday service",
        service_name: "CSRF Blocked",
        attendance_date: "2026-07-14",
        adults_count: 1,
        youth_count: 0,
        children_count: 0,
        first_time_visitors_count: 0,
        new_members_count: 0,
        volunteers_count: 0,
        submit_action: "save_draft",
      });
      assert.equal(csrfReject.status, 403);
    } finally {
      if (prev === undefined) delete process.env.GETPRO_REQUIRE_CHURCH_CSRF;
      else process.env.GETPRO_REQUIRE_CHURCH_CSRF = prev;
    }

    const appB = makeApp({
      kind: "branch",
      orgSlug: orgB.slug,
      organization: orgB,
      branch: branchB,
    });
    const agentB = request.agent(appB);
    await agentB.post("/branch/login").type("form").send({
      identifier: `admin_b_${suffix}@example.com`,
      password: "testpass123",
    });
    const tenantIsolation = await agentB.get(`/branch/attendance/${recordId}`);
    assert.equal(tenantIsolation.status, 404);
    const listB = await agentB.get("/branch/attendance");
    assert.equal(listB.status, 200);
    assert.doesNotMatch(listB.text, /Morning Worship/);

    await cleanup(pool, [branchA.id, branchB.id], [orgA.id, orgB.id]);
  }
);

test(
  "Phase 6 HQ Growth attendance tracker: authorized access, branch filter, tenant isolation; Foundation blocked",
  async (t) => {
    if (!isPgConfigured()) return t.skip("PostgreSQL not configured");
    const pool = getPgPool();
    try {
      await ensureCanonicalTenantsForTests(pool);
      await ensureChurchSchema(pool);
    } catch (err) {
      return t.skip(`Church PG schema unavailable: ${err.message}`);
    }

    const suffix = makeSuffix("p6hqatt");
    const passwordHash = await bcrypt.hash("hq_pass_123456", 12);
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `p6hq_${suffix}`.slice(0, 40),
      name: `Phase6 HQ Att ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      org.id,
      { plan_code: "growth", plan_status: "active", plan_notes: null },
      null
    );
    const orgFresh = await organizationsRepo.findOrganizationById(pool, org.id);
    const branch1 = await branchesRepo.createBranch(pool, {
      organization_id: orgFresh.id,
      slug: "main",
      host_slug: `hs_branch1_${suffix}`.slice(0, 40),
      name: "Main Campus",
      status: "active",
    });
    const branch2 = await branchesRepo.createBranch(pool, {
      organization_id: orgFresh.id,
      slug: "east",
      host_slug: `hs_branch2_${suffix}`.slice(0, 40),
      name: "East Campus",
      status: "active",
    });
    const orgOther = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `p6hqo_${suffix}`.slice(0, 40),
      name: `Phase6 HQ Other ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgOther.id,
      { plan_code: "growth", plan_status: "active", plan_notes: null },
      null
    );
    const orgOtherFresh = await organizationsRepo.findOrganizationById(pool, orgOther.id);
    const branchOther = await branchesRepo.createBranch(pool, {
      organization_id: orgOtherFresh.id,
      slug: "main",
      host_slug: `hs_branchOther_${suffix}`.slice(0, 40),
      name: "Other Main",
      status: "active",
    });
    await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: orgFresh.id,
      full_name: "HQ Admin",
      email: `hq_${suffix}@example.com`,
      phone: "0977222001",
      password_hash: passwordHash,
    });

    await attendanceRepo.createAttendanceRecord(pool, {
      organization_id: orgFresh.id,
      branch_id: branch1.id,
      attendance_date: "2026-07-05",
      attendance_type: "Sunday service",
      service_name: "HQ Visible Main",
      adults_count: 20,
      youth_count: 5,
      children_count: 3,
      first_time_visitors_count: 1,
      new_members_count: 0,
      volunteers_count: 2,
      notes: "",
      status: "submitted",
      created_by_admin_id: null,
    });
    await attendanceRepo.createAttendanceRecord(pool, {
      organization_id: orgFresh.id,
      branch_id: branch2.id,
      attendance_date: "2026-07-06",
      attendance_type: "Midweek service",
      service_name: "HQ Visible East",
      adults_count: 10,
      youth_count: 2,
      children_count: 1,
      first_time_visitors_count: 0,
      new_members_count: 0,
      volunteers_count: 1,
      notes: "",
      status: "draft",
      created_by_admin_id: null,
    });
    await attendanceRepo.createAttendanceRecord(pool, {
      organization_id: orgOtherFresh.id,
      branch_id: branchOther.id,
      attendance_date: "2026-07-07",
      attendance_type: "Sunday service",
      service_name: "Foreign Attendance",
      adults_count: 99,
      youth_count: 0,
      children_count: 0,
      first_time_visitors_count: 0,
      new_members_count: 0,
      volunteers_count: 0,
      notes: "",
      status: "submitted",
      created_by_admin_id: null,
    });

    const app = makeApp({
      kind: "branch",
      orgSlug: orgFresh.slug,
      organization: orgFresh,
      branch: branch1,
    });
    const agent = request.agent(app);
    await agent.post("/hq/login").type("form").send({
      identifier: `hq_${suffix}@example.com`,
      password: "hq_pass_123456",
    });

    const page = await agent.get("/hq/attendance");
    assert.equal(page.status, 200);
    assert.match(page.text, /data-p6-screen="attendance-tracker"/);
    assert.match(page.text, /name="branch_id"/);
    assert.match(page.text, /HQ Visible Main/);
    assert.match(page.text, /HQ Visible East/);
    assert.doesNotMatch(page.text, /Foreign Attendance/);
    assert.doesNotMatch(page.text, /data-testid="attendance-compose"/);

    const mainRecord = await attendanceRepo.listAttendanceRecordsForOrganization(pool, orgFresh.id, {
      branchId: branch1.id,
      q: "HQ Visible Main",
    });
    assert.ok(mainRecord[0]);
    const hqDetail = await agent.get(`/hq/attendance/${mainRecord[0].id}`);
    assert.equal(hqDetail.status, 200);
    assert.match(hqDetail.text, /data-p6-screen="attendance-record-detail"/);
    assert.match(hqDetail.text, /HQ Visible Main/);
    assert.match(hqDetail.text, /Individual member attendance was not recorded for this service/);
    assert.match(hqDetail.text, /data-testid="attendance-detail-total"/);
    assert.doesNotMatch(hqDetail.text, /data-testid="attendance-detail-edit"/);
    assert.doesNotMatch(hqDetail.text, /data-testid="attendance-detail-submit"/);
    assert.doesNotMatch(hqDetail.text, /data-testid="attendance-detail-mobile-actions"/);
    assert.doesNotMatch(hqDetail.text, /Sunny|Weather|\+12%/);
    assert.match(hqDetail.text, /href="\/hq\/attendance"/);

    const foreignId = (
      await attendanceRepo.listAttendanceRecordsForOrganization(pool, orgOtherFresh.id, {
        q: "Foreign Attendance",
      })
    )[0].id;
    assert.equal((await agent.get(`/hq/attendance/${foreignId}`)).status, 404);

    const branchFiltered = await agent.get(`/hq/attendance?branch_id=${branch1.id}`);
    assert.equal(branchFiltered.status, 200);
    assert.match(branchFiltered.text, /HQ Visible Main/);
    assert.doesNotMatch(branchFiltered.text, /HQ Visible East/);

    const badBranch = await agent.get(`/hq/attendance?branch_id=${branchOther.id}`);
    assert.equal(badBranch.status, 200);
    assert.doesNotMatch(badBranch.text, /Foreign Attendance/);

    const foundationOrg = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `p6hqf_${suffix}`.slice(0, 40),
      name: `Phase6 HQ Found ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      foundationOrg.id,
      { plan_code: "foundation", plan_status: "active", plan_notes: null },
      null
    );
    const foundationFresh = await organizationsRepo.findOrganizationById(pool, foundationOrg.id);
    const foundationBranch = await branchesRepo.createBranch(pool, {
      organization_id: foundationFresh.id,
      slug: "main",
      host_slug: `hs_foundationBranch_${suffix}`.slice(0, 40),
      name: "Found Main",
      status: "active",
    });
    await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: foundationFresh.id,
      full_name: "HQ Found",
      email: `hqf_${suffix}@example.com`,
      phone: "0977333001",
      password_hash: passwordHash,
    });
    const foundationApp = makeApp({
      kind: "branch",
      orgSlug: foundationFresh.slug,
      organization: foundationFresh,
      branch: foundationBranch,
    });
    const foundationAgent = request.agent(foundationApp);
    await foundationAgent.post("/hq/login").type("form").send({
      identifier: `hqf_${suffix}@example.com`,
      password: "hq_pass_123456",
    });
    assert.equal((await foundationAgent.get("/hq/attendance")).status, 403);

    await cleanup(
      pool,
      [branch1.id, branch2.id, branchOther.id, foundationBranch.id],
      [orgFresh.id, orgOtherFresh.id, foundationFresh.id]
    );
  }
);
