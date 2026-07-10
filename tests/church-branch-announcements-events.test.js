"use strict";

const path = require("path");
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
const membersRepo = require("../src/db/pg/church/membersRepo");
const announcementsRepo = require("../src/db/pg/church/announcementsRepo");
const eventsRepo = require("../src/db/pg/church/eventsRepo");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const churchRoutes = require("../src/routes/church");

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
      secret: "test-church-announcements-events",
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

async function cleanup(pool, branchIds, orgIds) {
  for (const branchId of branchIds) {
    await pool.query(`DELETE FROM public.church_feed_item_reads WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_announcement_attachments WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_audit_logs WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_events WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_announcements WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_members WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branchId]);
  }
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("non-church host cannot access /branch/announcements or /branch/events", async () => {
  const app = makeApp(null, false);
  const ann = await request(app).get("/branch/announcements");
  assert.equal(ann.status, 404);
  const ev = await request(app).get("/branch/events");
  assert.equal(ev.status, 404);
});

test("unauthenticated visitor redirects to /branch/login", async () => {
  const app = makeApp({
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Demo", status: "active" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  const res = await request(app).get("/branch/announcements");
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "/branch/login");
});

test(
  "branch announcements and events management",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("ae");
    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `ae_a_${suffix}`,
      name: `AE Church A ${suffix}`,
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `ae_b_${suffix}`,
      name: `AE Church B ${suffix}`,
    });
    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: "main",
      name: `AE Branch A ${suffix}`,
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgB.id,
      slug: "main",
      name: `AE Branch B ${suffix}`,
    });
    const passwordHash = await bcrypt.hash("testpass123", 12);
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      full_name: "Admin A",
      email: `admin_a_${suffix}@example.com`,
      phone: "0977222001",
      password_hash: passwordHash,
    });
    const member = await membersRepo.createPendingMember(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      platform_tenant_id: TENANT_ZM,
      email: `member_${suffix}@example.com`,
      phone: "0977222002",
      full_name: "Verified Member",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult (36-60)",
      address_area: "Kafue",
      attendance_duration: "Less than 6 months",
    });
    await membersRepo.updateMemberStatusForBranch(pool, member.id, branchA.id, "verified");

    const app = makeApp({
      kind: "branch",
      orgSlug: orgA.slug,
      organization: orgA,
      branch: branchA,
    });
    const adminAgent = request.agent(app);
    await adminAgent.post("/branch/login").type("form").send({
      identifier: `admin_a_${suffix}@example.com`,
      password: "testpass123",
    });

    const draftAnn = await adminAgent.post("/branch/announcements").type("form").send({
      title: "Draft notice",
      body: "Draft body",
      category: "General",
      audience: "members",
      _intent: "draft",
    });
    assert.equal(draftAnn.status, 303);
    const draftAnnId = Number(String(draftAnn.headers.location).match(/\/branch\/announcements\/(\d+)/)[1]);

    const publishAnn = await adminAgent.post("/branch/announcements").type("form").send({
      title: "Members announcement",
      body: "For members only",
      category: "General",
      audience: "members",
      _intent: "publish",
    });
    assert.equal(publishAnn.status, 303);

    const publicAnn = await adminAgent.post("/branch/announcements").type("form").send({
      title: "Public announcement",
      body: "For everyone",
      category: "Outreach",
      audience: "public",
      _intent: "publish",
    });
    assert.equal(publicAnn.status, 303);

    const leadersAnn = await announcementsRepo.createAnnouncementForBranch(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      title: "Leaders only",
      body: "Secret leaders message",
      category: "General",
      audience: "leaders",
      status: "published",
      publish_at: new Date(),
      created_by_admin_id: null,
    });

    const otherBranchAnn = await announcementsRepo.createAnnouncementForBranch(pool, {
      organization_id: orgB.id,
      branch_id: branchB.id,
      title: "Other branch",
      body: "Not yours",
      category: "General",
      audience: "public",
      status: "published",
      publish_at: new Date(),
      created_by_admin_id: null,
    });

    const crossBranch = await adminAgent.get(`/branch/announcements/${otherBranchAnn.id}`);
    assert.equal(crossBranch.status, 404);

    const memberAgent = request.agent(app);
    await memberAgent.post("/login").type("form").send({
      identifier: `member_${suffix}@example.com`,
      password: "testpass123",
    });
    const memberAnn = await memberAgent.get("/member/announcements");
    assert.equal(memberAnn.status, 200);
    assert.match(memberAnn.text, /Members announcement/);
    assert.match(memberAnn.text, /Public announcement/);
    assert.match(memberAnn.text, /Leaders only/);
    assert.doesNotMatch(memberAnn.text, /Draft notice/);

    const publicHome = await request(app).get("/");
    assert.equal(publicHome.status, 200);
    assert.match(publicHome.text, /Public announcement/);
    assert.doesNotMatch(publicHome.text, /Members announcement/);
    assert.doesNotMatch(publicHome.text, /Leaders only/);

    const publishDraft = await adminAgent
      .post(`/branch/announcements/${draftAnnId}/publish`)
      .type("form")
      .send({});
    assert.equal(publishDraft.status, 303);

    const future = new Date();
    future.setDate(future.getDate() + 10);
    const eventDate = future.toISOString().slice(0, 10);

    const draftEvent = await adminAgent.post("/branch/events").type("form").send({
      title: "Draft event",
      description: "Not visible yet",
      event_date: eventDate,
      start_time: "10:00 AM",
      location: "Hall",
      visibility: "public",
      _intent: "draft",
    });
    assert.equal(draftEvent.status, 303);
    const draftEventId = Number(String(draftEvent.headers.location).match(/\/branch\/events\/(\d+)/)[1]);

    const publishEvent = await adminAgent.post("/branch/events").type("form").send({
      title: "Public worship night",
      description: "Open to all",
      event_date: eventDate,
      start_time: "6:00 PM",
      location: "Sanctuary",
      visibility: "public",
      _intent: "publish",
    });
    assert.equal(publishEvent.status, 303);

    const membersEvent = await eventsRepo.createEventForBranch(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      title: "Members bible study",
      description: "Members only study",
      event_date: eventDate,
      start_time: "7:00 PM",
      location: "Room 2",
      visibility: "members",
      status: "published",
      created_by_admin_id: null,
    });

    const otherBranchEvent = await eventsRepo.createEventForBranch(pool, {
      organization_id: orgB.id,
      branch_id: branchB.id,
      title: "Other branch event",
      description: "Hidden",
      event_date: eventDate,
      visibility: "public",
      status: "published",
      created_by_admin_id: null,
    });

    const crossEvent = await adminAgent.get(`/branch/events/${otherBranchEvent.id}`);
    assert.equal(crossEvent.status, 404);

    const memberEvents = await memberAgent.get("/member/events");
    assert.equal(memberEvents.status, 200);
    assert.match(memberEvents.text, /Public worship night/);
    assert.match(memberEvents.text, /Members bible study/);
    assert.doesNotMatch(memberEvents.text, /Draft event/);

    const publicEventsHome = await request(app).get("/");
    assert.match(publicEventsHome.text, /Public worship night/);
    assert.doesNotMatch(publicEventsHome.text, /Members bible study/);

    const publishDraftEvent = await adminAgent
      .post(`/branch/events/${draftEventId}/publish`)
      .type("form")
      .send({});
    assert.equal(publishDraftEvent.status, 303);

    await cleanup(pool, [branchA.id, branchB.id], [orgA.id, orgB.id]);
  }
);
