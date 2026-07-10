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
const ministriesRepo = require("../src/db/pg/church/ministriesRepo");
const ministryLeadersRepo = require("../src/db/pg/church/ministryLeadersRepo");
const membersRepo = require("../src/db/pg/church/membersRepo");
const memberMinistriesRepo = require("../src/db/pg/church/memberMinistriesRepo");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const churchRoutes = require("../src/routes/church");
const { setChurchMemberSession } = require("../src/church/memberAuth");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeApp(ctx, sessionHook) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "test-leader-dashboard-roster-visual",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = ctx;
    if (typeof sessionHook === "function") sessionHook(req);
    next();
  });
  app.use(churchRoutes());
  app.use((req, res) => res.status(404).type("text").send("not found"));
  return app;
}

async function cleanup(pool, branchId, orgId) {
  await pool.query(`DELETE FROM public.church_audit_logs WHERE branch_id = $1`, [branchId]).catch(() => {});
  await pool.query(`DELETE FROM public.church_member_ministries WHERE branch_id = $1`, [branchId]).catch(() => {});
  await pool.query(`DELETE FROM public.church_members WHERE branch_id = $1`, [branchId]).catch(() => {});
  await pool.query(`DELETE FROM public.church_ministry_activity_notes WHERE branch_id = $1`, [branchId]).catch(() => {});
  await pool.query(`DELETE FROM public.church_attendance_records WHERE branch_id = $1`, [branchId]).catch(() => {});
  await pool.query(`DELETE FROM public.church_duty_roster WHERE branch_id = $1`, [branchId]).catch(() => {});
  await pool.query(`DELETE FROM public.church_ministry_leaders WHERE branch_id = $1`, [branchId]);
  await pool.query(`DELETE FROM public.church_ministries WHERE branch_id = $1`, [branchId]);
  await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branchId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
}

test("anonymous users are blocked from leader dashboard and roster", async () => {
  const app = makeApp({
    kind: "branch",
    organization: { id: 1, name: "Demo", status: "active" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  const dash = await request(app).get("/leader/dashboard");
  assert.equal(dash.status, 302);
  assert.equal(dash.headers.location, "/leader/login");
  const roster = await request(app).get("/leader/roster");
  assert.equal(roster.status, 302);
  assert.equal(roster.headers.location, "/leader/login");
});

test("member session cannot access leader dashboard or roster", async () => {
  const app = makeApp(
    {
      kind: "branch",
      organization: { id: 9, name: "Demo", status: "active" },
      branch: { id: 9, name: "Demo Branch", status: "active" },
    },
    (req) => {
      setChurchMemberSession(req, {
        member_id: 99,
        organization_id: 9,
        branch_id: 9,
        full_name: "Member User",
        status: "verified",
      });
    }
  );
  const dash = await request(app).get("/leader/dashboard");
  assert.equal(dash.status, 302);
  assert.equal(dash.headers.location, "/leader/login");
  const roster = await request(app).get("/leader/roster");
  assert.equal(roster.status, 302);
  assert.equal(roster.headers.location, "/leader/login");
});

test("leader dashboard and roster routes remain unchanged", () => {
  const src = require("fs").readFileSync(
    path.join(__dirname, "../src/routes/church/leaderPortal.js"),
    "utf8"
  );
  assert.match(src, /router\.get\("\/leader\/dashboard"/);
  assert.match(src, /router\.get\("\/leader\/roster"/);
  assert.doesNotMatch(src, /\/leader\/requests/);
});

test(
  "leader dashboard and roster visual alignment",
  { skip: !isPgConfigured() },
  async (t) => {
    const pool = getPgPool();
    try {
      await pool.query("SELECT 1");
    } catch (e) {
      t.skip(`PostgreSQL unreachable (${e.code || e.message})`);
      return;
    }

    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("ldrv");
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `ldrv_${suffix}`.replace(/[^a-z0-9_]/g, "").slice(0, 40),
      name: `Leader Visual Church ${suffix}`,
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: `Leader Visual Branch ${suffix}`,
    });
    const youth = await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      name: "Youth Ministry",
      slug: "youth-ministry",
      description: "Youth discipleship",
      leader_name: "Grace Mwansa",
      visibility: "members",
      status: "published",
      created_by_admin_id: null,
    });
    const choir = await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      name: "Choir Ministry",
      slug: "choir",
      description: "Worship choir",
      leader_name: "Other Leader",
      visibility: "members",
      status: "published",
      created_by_admin_id: null,
    });
    const passwordHash = await bcrypt.hash("testpass123", 12);
    await ministryLeadersRepo.createMinistryLeader(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      ministry_id: youth.id,
      full_name: "Grace Mwansa",
      email: `youth.visual_${suffix}@example.com`,
      phone: "0977000099",
      password_hash: passwordHash,
      role: "ministry_leader",
      status: "active",
    });
    await ministryLeadersRepo.createMinistryLeader(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      ministry_id: choir.id,
      full_name: "Choir Leader",
      email: `choir.visual_${suffix}@example.com`,
      phone: "0977000098",
      password_hash: passwordHash,
      role: "ministry_leader",
      status: "active",
    });

    const app = makeApp({
      kind: "branch",
      orgSlug: org.slug,
      organization: org,
      branch,
    });
    const agent = request.agent(app);
    await agent
      .post("/leader/login")
      .type("form")
      .send({
        identifier: `youth.visual_${suffix}@example.com`,
        password: "testpass123",
      })
      .expect(302);

    const emptyDash = await agent.get("/leader/dashboard");
    assert.equal(emptyDash.status, 200);
    assert.match(emptyDash.text, /data-leader-shell="stitch-v4[78]"/);
    assert.match(emptyDash.text, /church\.css\?v=4[78]/);
    assert.match(emptyDash.text, /Youth Ministry/);
    assert.match(emptyDash.text, /Grace Mwansa/);
    assert.match(emptyDash.text, /data-leader-dashboard-stats/);
    assert.match(emptyDash.text, /data-leader-quick-actions/);
    assert.match(emptyDash.text, /Roster members[\s\S]*?<strong class="church-leader-stat-card__value">0<\/strong>/);
    assert.match(emptyDash.text, /data-leader-empty="duties"/);
    assert.match(emptyDash.text, /href="\/leader\/roster"/);
    assert.match(emptyDash.text, /href="\/leader\/attendance"/);
    assert.match(emptyDash.text, /href="\/leader\/duties"/);
    assert.match(emptyDash.text, /href="\/leader\/activity-notes"/);
    assert.doesNotMatch(emptyDash.text, /Leader Requests|\/leader\/requests|View Requests/i);
    assert.doesNotMatch(emptyDash.text, /password_hash|session_id|csrf/i);
    assert.doesNotMatch(emptyDash.text, /Choir Ministry/);
    assert.match(emptyDash.text, /church-leader-stat-grid|church-leader-hero|church-leader-quick-action/);
    assert.match(emptyDash.text, /church-member-nav-link--active/);
    assert.match(emptyDash.text, /church-leader-topbar|church-show-mobile-only/);

    const emptyRoster = await agent.get("/leader/roster");
    assert.equal(emptyRoster.status, 200);
    assert.equal(emptyRoster.req.path, "/leader/roster");
    assert.match(emptyRoster.text, /data-leader-empty="roster"/);
    assert.match(emptyRoster.text, /No members assigned to this ministry yet/);
    assert.doesNotMatch(emptyRoster.text, /password_hash|\/leader\/requests/i);
    assert.match(emptyRoster.text, /church-member-nav-link--active/);

    const memberHash = await bcrypt.hash("MemberPass123!", 12);
    const member = await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      full_name: `Samuel Okoro ${suffix}`,
      email: `samuel_${suffix}@example.com`,
      phone: "0977111222",
      password_hash: memberHash,
    });
    await pool.query(`UPDATE public.church_members SET status = 'verified' WHERE id = $1`, [member.id]);
    await memberMinistriesRepo.addMemberToMinistry(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      member_id: member.id,
      ministry_id: youth.id,
      role: "member",
    });

    const otherMember = await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      full_name: `Choir Only ${suffix}`,
      email: `choir_only_${suffix}@example.com`,
      phone: "0977333444",
      password_hash: memberHash,
    });
    await pool.query(`UPDATE public.church_members SET status = 'verified' WHERE id = $1`, [otherMember.id]);
    await memberMinistriesRepo.addMemberToMinistry(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      member_id: otherMember.id,
      ministry_id: choir.id,
      role: "member",
    });

    const populatedDash = await agent.get("/leader/dashboard");
    assert.equal(populatedDash.status, 200);
    assert.match(populatedDash.text, /Roster members[\s\S]*?<strong class="church-leader-stat-card__value">1<\/strong>/);
    assert.doesNotMatch(populatedDash.text, /data-leader-empty="dashboard"/);

    const roster = await agent.get("/leader/roster");
    assert.equal(roster.status, 200);
    assert.match(roster.text, new RegExp(`Samuel Okoro ${suffix}`));
    assert.match(roster.text, /samuel_.*@example\.com/);
    assert.match(roster.text, /0977111222/);
    assert.match(roster.text, /data-leader-roster-desktop/);
    assert.match(roster.text, /data-leader-roster-mobile/);
    assert.match(roster.text, /data-leader-roster-search/);
    assert.match(roster.text, /church-leader-roster-card/);
    assert.doesNotMatch(roster.text, new RegExp(`Choir Only ${suffix}`));
    assert.doesNotMatch(roster.text, /password_hash|MemberPass123/i);

    await cleanup(pool, branch.id, org.id);
  }
);
