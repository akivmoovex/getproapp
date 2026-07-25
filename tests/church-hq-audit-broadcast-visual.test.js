"use strict";

const fs = require("fs");
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
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const branchAdminsRepo = require("../src/db/pg/church/branchAdminsRepo");
const membersRepo = require("../src/db/pg/church/membersRepo");
const ministriesRepo = require("../src/db/pg/church/ministriesRepo");
const ministryLeadersRepo = require("../src/db/pg/church/ministryLeadersRepo");
const auditLogsRepo = require("../src/db/pg/church/auditLogsRepo");
const { formatMetadataForDisplay } = require("../src/church/auditLogFormatting");
const { setChurchMemberSession } = require("../src/church/memberAuth");
const { setChurchBranchAdminSession } = require("../src/church/branchAdminAuth");
const { setChurchLeaderSession } = require("../src/church/leaderAuth");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const churchRoutes = require("../src/routes/church");

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
      secret: "test-hq-audit-broadcast-visual",
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

async function cleanup(pool, orgIds) {
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_feed_item_reads WHERE organization_id = $1`, [orgId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_hq_broadcast_attachments WHERE organization_id = $1`, [orgId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_hq_broadcast_targets WHERE organization_id = $1`, [orgId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_hq_broadcasts WHERE organization_id = $1`, [orgId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [orgId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_member_ministries WHERE organization_id = $1`, [orgId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_ministry_leaders WHERE organization_id = $1`, [orgId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_ministries WHERE organization_id = $1`, [orgId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_members WHERE organization_id = $1`, [orgId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = $1`, [orgId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]).catch(() => {});
  }
}

const demoCtx = {
  kind: "branch",
  orgSlug: "demo",
  organization: { id: 1, name: "Demo", status: "active" },
  branch: { id: 1, name: "Demo Branch", status: "active" },
};

test("anonymous users are blocked from HQ audit and broadcasts", async () => {
  const app = makeApp(demoCtx);
  for (const pathName of ["/hq/audit", "/hq/broadcasts", "/hq/broadcasts/new"]) {
    const res = await request(app).get(pathName);
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, "/hq/login");
  }
});

test("member, leader, and branch-admin sessions cannot access HQ audit or broadcasts", async () => {
  const memberApp = makeApp(demoCtx, (req) => {
    setChurchMemberSession(req, {
      member_id: 11,
      organization_id: 1,
      branch_id: 1,
      full_name: "Member",
      status: "verified",
    });
  });
  const leaderApp = makeApp(demoCtx, (req) => {
    setChurchLeaderSession(req, {
      leader_id: 22,
      organization_id: 1,
      branch_id: 1,
      ministry_id: 3,
      full_name: "Leader",
      role: "ministry_leader",
      status: "active",
    });
  });
  const branchApp = makeApp(demoCtx, (req) => {
    setChurchBranchAdminSession(req, {
      branch_admin_id: 33,
      organization_id: 1,
      branch_id: 1,
      full_name: "Branch Admin",
      role: "branch_admin",
      status: "active",
    });
  });

  for (const app of [memberApp, leaderApp, branchApp]) {
    for (const pathName of ["/hq/audit", "/hq/broadcasts"]) {
      const res = await request(app).get(pathName);
      assert.equal(res.status, 302);
      assert.equal(res.headers.location, "/hq/login");
    }
  }
});

test("existing HQ audit and broadcast route paths remain unchanged", () => {
  const auditSrc = fs.readFileSync(path.join(__dirname, "../src/routes/church/hqAdminAudit.js"), "utf8");
  const broadcastSrc = fs.readFileSync(
    path.join(__dirname, "../src/routes/church/hqAdminBroadcasts.js"),
    "utf8"
  );
  assert.match(auditSrc, /router\.get\("\/hq\/audit"/);
  assert.match(auditSrc, /router\.get\(\s*"\/hq\/audit\/:auditId"/);
  assert.match(broadcastSrc, /router\.get\("\/hq\/broadcasts"/);
  assert.match(broadcastSrc, /router\.get\("\/hq\/broadcasts\/new"/);
  assert.match(broadcastSrc, /confirm-publish/);
  assert.doesNotMatch(broadcastSrc, /\/hq\/permissions/);
  assert.doesNotMatch(broadcastSrc, /\/hq\/templates/);
});

test("HQ shell does not add screens 59 or 60 navigation", () => {
  const shell = fs.readFileSync(path.join(__dirname, "../views/church/partials/hq_shell_start.ejs"), "utf8");
  const nav = fs.readFileSync(path.join(__dirname, "../src/church/http/classicAdminNav.js"), "utf8");
  assert.match(shell, /data-hq-shell="stitch-v49"/);
  assert.match(nav, /href: "\/hq\/audit"/);
  assert.match(nav, /href: "\/hq\/broadcasts"/);
  assert.doesNotMatch(nav, /\/hq\/permissions/);
  assert.doesNotMatch(nav, /\/hq\/templates/);
  assert.doesNotMatch(shell, /\/hq\/permissions/);
  assert.doesNotMatch(shell, /Permissions/);
  assert.doesNotMatch(shell, /Templates/);
});

test("safe metadata renders and sensitive audit fields are absent", () => {
  const safe = formatMetadataForDisplay({
    title: "Verified Member",
    status: "verified",
    password: "secret-password",
    password_hash: "$2a$12$abc",
    token: "tok_abc",
    csrf_token: "csrf123",
    cookie: "sid=abc",
    session_id: "sess-1",
    secret_answer: "blue",
    request_body: { raw: true },
    database_url: "postgres://x",
    env: { DATABASE_URL: "x" },
  });
  assert.match(safe, /Verified Member/);
  assert.match(safe, /"status": "verified"/);
  assert.doesNotMatch(safe, /secret-password/);
  assert.doesNotMatch(safe, /\$2a\$12\$abc/);
  assert.doesNotMatch(safe, /tok_abc/);
  assert.doesNotMatch(safe, /csrf123/);
  assert.doesNotMatch(safe, /sid=abc/);
  assert.doesNotMatch(safe, /sess-1/);
  assert.doesNotMatch(safe, /blue/);
  assert.doesNotMatch(safe, /postgres:\/\//);
  assert.doesNotMatch(safe, /DATABASE_URL/);
});

test("desktop and mobile structural classes exist in HQ audit and broadcast views", () => {
  const audit = fs.readFileSync(path.join(__dirname, "../views/church/hq/audit_trail.ejs"), "utf8");
  const broadcasts = fs.readFileSync(path.join(__dirname, "../views/church/hq/broadcasts.ejs"), "utf8");
  const form = fs.readFileSync(path.join(__dirname, "../views/church/hq/broadcast_form.ejs"), "utf8");
  const detail = fs.readFileSync(path.join(__dirname, "../views/church/hq/broadcast_detail.ejs"), "utf8");
  const confirm = fs.readFileSync(
    path.join(__dirname, "../views/church/hq/broadcast_confirm_publish.ejs"),
    "utf8"
  );

  assert.match(audit, /data-hq-audit-filters/);
  assert.match(audit, /data-hq-audit-desktop/);
  assert.match(audit, /data-hq-audit-mobile/);
  assert.match(audit, /church-show-desktop-only/);
  assert.match(audit, /church-show-mobile-only/);
  assert.match(audit, /data-hq-empty="audit"/);
  assert.match(audit, /data-hq-audit-pagination/);

  assert.match(broadcasts, /data-hq-broadcast-filters/);
  assert.match(broadcasts, /data-hq-broadcast-desktop/);
  assert.match(broadcasts, /data-hq-broadcast-mobile/);
  assert.match(broadcasts, /church-hq-priority/);
  assert.match(broadcasts, /church-hq-status/);
  assert.match(broadcasts, /church-hq-flag--featured/);
  assert.match(broadcasts, /church-hq-flag--pinned/);
  assert.match(broadcasts, /data-hq-empty="broadcasts"/);

  assert.match(form, /name="title"/);
  assert.match(form, /name="body"/);
  assert.match(form, /name="category"/);
  assert.match(form, /name="priority"/);
  assert.match(form, /name="audience"/);
  assert.match(form, /name="target_scope"/);
  assert.match(form, /name="branch_ids"/);
  assert.match(form, /name="is_pinned"/);
  assert.match(form, /name="is_featured"/);
  assert.match(form, /name="publish_at"/);
  assert.match(form, /name="expires_at"/);
  assert.match(form, /name="featured_until"/);
  assert.match(form, /name="action_label"/);
  assert.match(form, /name="action_url"/);
  assert.match(form, /name="attachments"/);
  assert.match(form, /name="_intent"/);

  assert.match(detail, /data-hq-broadcast-analytics/);
  assert.match(detail, /data-hq-analytics-by-branch/);
  assert.match(detail, /data-hq-broadcast-attachments/);
  assert.match(detail, /data-hq-broadcast-action-link/);
  assert.match(detail, /data-hq-broadcast-actions-archived/);

  assert.match(confirm, /data-hq-estimated-audience/);
  assert.match(confirm, /name="_publish_token"/);
});

test(
  "HQ audit trail and broadcast centre visual alignment",
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
    const suffix = makeSuffix("hqvis");
    const passwordHash = await bcrypt.hash("testpass123", 12);

    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `hqvis_a_${suffix}`.replace(/[^a-z0-9_]/g, "").slice(0, 40),
      name: `HQ Visual Org A ${suffix}`,
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `hqvis_b_${suffix}`.replace(/[^a-z0-9_]/g, "").slice(0, 40),
      name: `HQ Visual Org B ${suffix}`,
    });
    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: "main",
      name: `HQ Visual Branch A ${suffix}`,
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgB.id,
      slug: "main",
      name: `HQ Visual Branch B ${suffix}`,
    });

    await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: orgA.id,
      full_name: "HQ Visual Admin A",
      email: `hq_vis_a_${suffix}@example.com`,
      phone: "0977555401",
      password_hash: passwordHash,
    });
    await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: orgB.id,
      full_name: "HQ Visual Admin B",
      email: `hq_vis_b_${suffix}@example.com`,
      phone: "0977555402",
      password_hash: passwordHash,
    });
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      full_name: "Branch Visual Admin",
      email: `branch_vis_${suffix}@example.com`,
      phone: "0977555403",
      password_hash: passwordHash,
    });
    await membersRepo.createPendingMember(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      platform_tenant_id: TENANT_ZM,
      email: `member_vis_${suffix}@example.com`,
      phone: "0977555404",
      full_name: "Visual Member",
      password_hash: passwordHash,
      gender: "female",
      age_group: "Adult (36-60)",
      address_area: "Lusaka",
      attendance_duration: "Less than 6 months",
      ministry_interest: "choir",
    });
    const memberRow = await membersRepo.findMemberByEmailOrPhoneForBranch(
      pool,
      branchA.id,
      `member_vis_${suffix}@example.com`
    );
    await membersRepo.updateMemberStatusForBranch(pool, memberRow.id, branchA.id, "verified");

    const ministry = await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      name: "Visual Ministry",
      slug: "visual-ministry",
      description: "Visual test ministry",
      leader_name: "Visual Leader",
      visibility: "members",
      status: "published",
      created_by_admin_id: null,
    });
    await ministryLeadersRepo.createMinistryLeader(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      ministry_id: ministry.id,
      full_name: "Visual Leader",
      email: `leader_vis_${suffix}@example.com`,
      phone: "0977555405",
      password_hash: passwordHash,
      role: "ministry_leader",
      status: "active",
    });

    const logA = await auditLogsRepo.insertAuditLog(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      actor_type: "hq_admin",
      actor_id: 1,
      action: "member_verified_by_admin",
      entity_type: "member",
      entity_id: memberRow.id,
      metadata_json: {
        title: "Visual Member",
        status: "verified",
        password: "should-not-render",
        token: "tok-should-not-render",
      },
    });
    await auditLogsRepo.insertAuditLog(pool, {
      organization_id: orgB.id,
      branch_id: branchB.id,
      actor_type: "hq_admin",
      actor_id: 2,
      action: "hq_broadcast_published",
      entity_type: "hq_broadcast",
      entity_id: 999,
      metadata_json: { title: "Other Org Broadcast" },
    });

    const appA = makeApp({
      kind: "branch",
      orgSlug: orgA.slug,
      organization: orgA,
      branch: branchA,
    });
    const hqAgent = request.agent(appA);
    await hqAgent.post("/hq/login").type("form").send({
      identifier: `hq_vis_a_${suffix}@example.com`,
      password: "testpass123",
    });

    const emptyAudit = await hqAgent.get("/hq/audit?q=definitely-no-match-xyz");
    assert.equal(emptyAudit.status, 200);
    assert.match(emptyAudit.text, /data-hq-empty="audit"/);
    assert.match(emptyAudit.text, /No audit events match these filters/);

    const auditList = await hqAgent.get("/hq/audit");
    assert.equal(auditList.status, 200);
    assert.match(auditList.text, /Global audit trail/);
    assert.match(auditList.text, /data-hq-audit-filters/);
    assert.match(auditList.text, /name="q"/);
    assert.match(auditList.text, /name="branch_id"/);
    assert.match(auditList.text, /name="action_group"/);
    assert.match(auditList.text, /data-hq-audit-desktop/);
    assert.match(auditList.text, /data-hq-audit-mobile/);
    assert.match(auditList.text, /church-show-desktop-only/);
    assert.match(auditList.text, /church-show-mobile-only/);
    assert.match(auditList.text, /Member verified/);
    assert.doesNotMatch(auditList.text, /Other Org Broadcast/);
    assert.match(auditList.text, /church-branch-nav-link--active[^>]*>[\s\S]*Audit Trail/);

    const auditDetail = await hqAgent.get(`/hq/audit/${logA.id}`);
    assert.equal(auditDetail.status, 200);
    assert.match(auditDetail.text, /data-hq-audit-metadata/);
    assert.match(auditDetail.text, /Visual Member/);
    assert.doesNotMatch(auditDetail.text, /should-not-render/);
    assert.doesNotMatch(auditDetail.text, /tok-should-not-render/);

    const emptyBroadcasts = await hqAgent.get("/hq/broadcasts?q=definitely-no-match-xyz");
    assert.equal(emptyBroadcasts.status, 200);
    assert.match(emptyBroadcasts.text, /data-hq-empty="broadcasts"/);

    const draftRes = await hqAgent.post("/hq/broadcasts").type("form").send({
      title: `Visual Draft ${suffix}`,
      body: "Draft body for visual tests",
      category: "General",
      priority: "high",
      audience: "members",
      target_scope: "all_branches",
      is_pinned: "1",
      is_featured: "1",
      action_label: "Learn more",
      action_url: "https://example.com/learn",
      _intent: "draft",
    });
    assert.equal(draftRes.status, 303);
    const draftMatch = /\/hq\/broadcasts\/(\d+)/.exec(draftRes.headers.location || "");
    assert.ok(draftMatch);
    const draftId = Number(draftMatch[1]);

    const list = await hqAgent.get("/hq/broadcasts");
    assert.equal(list.status, 200);
    assert.match(list.text, /Broadcast Center/);
    assert.match(list.text, /data-hq-broadcast-filters/);
    assert.match(list.text, /name="priority"/);
    assert.match(list.text, /name="audience"/);
    assert.match(list.text, /data-hq-broadcast-desktop/);
    assert.match(list.text, /data-hq-broadcast-mobile/);
    assert.match(list.text, /Visual Draft/);
    assert.match(list.text, /church-hq-priority--high/);
    assert.match(list.text, /church-hq-status--draft/);
    assert.match(list.text, /Featured/);
    assert.match(list.text, /Pinned/);
    assert.match(list.text, /church-branch-nav-link--active[^>]*>[\s\S]*Broadcasts/);

    const formPage = await hqAgent.get("/hq/broadcasts/new");
    assert.equal(formPage.status, 200);
    assert.match(formPage.text, /data-hq-broadcast-form/);
    assert.match(formPage.text, /name="title"/);
    assert.match(formPage.text, /name="attachments"/);
    assert.match(formPage.text, /name="_intent" value="draft"/);
    assert.match(formPage.text, /name="_intent" value="review"/);

    const reviewRes = await hqAgent.post(`/hq/broadcasts/${draftId}`).type("form").send({
      title: `Visual Draft ${suffix}`,
      body: "Draft body for visual tests",
      category: "General",
      priority: "high",
      audience: "members",
      target_scope: "all_branches",
      is_pinned: "1",
      is_featured: "1",
      action_label: "Learn more",
      action_url: "https://example.com/learn",
      _intent: "review",
    });
    assert.equal(reviewRes.status, 303);
    assert.match(reviewRes.headers.location || "", /confirm-publish/);

    const confirmPage = await hqAgent.get(`/hq/broadcasts/${draftId}/confirm-publish`);
    assert.equal(confirmPage.status, 200);
    assert.match(confirmPage.text, /data-hq-estimated-audience/);
    assert.match(confirmPage.text, /Estimated audience/);
    assert.match(confirmPage.text, /name="_publish_token"/);
    const token = /name="_publish_token" value="([^"]+)"/.exec(confirmPage.text);
    assert.ok(token);

    const publishRes = await hqAgent.post(`/hq/broadcasts/${draftId}/publish`).type("form").send({
      _publish_token: token[1],
    });
    assert.equal(publishRes.status, 303);

    const detail = await hqAgent.get(`/hq/broadcasts/${draftId}`);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-hq-broadcast-analytics/);
    assert.match(detail.text, /Current estimated audience/);
    assert.match(detail.text, /data-hq-analytics-by-branch/);
    assert.match(detail.text, /Breakdown by branch/);
    assert.match(detail.text, /data-hq-broadcast-action-link/);
    assert.match(detail.text, /Learn more/);
    assert.match(detail.text, /church-hq-status--published/);

    await hqAgent.post(`/hq/broadcasts/${draftId}/archive`).expect(303);
    const archived = await hqAgent.get(`/hq/broadcasts/${draftId}`);
    assert.equal(archived.status, 200);
    assert.match(archived.text, /data-hq-broadcast-actions-archived/);
    assert.doesNotMatch(archived.text, /href="\/hq\/broadcasts\/\d+\/edit"/);
    assert.match(archived.text, /archived/);

    const appB = makeApp({
      kind: "branch",
      orgSlug: orgB.slug,
      organization: orgB,
      branch: branchB,
    });
    const hqB = request.agent(appB);
    await hqB.post("/hq/login").type("form").send({
      identifier: `hq_vis_b_${suffix}@example.com`,
      password: "testpass123",
    });
    assert.equal((await hqB.get(`/hq/audit/${logA.id}`)).status, 404);
    assert.equal((await hqB.get(`/hq/broadcasts/${draftId}`)).status, 404);

    const memberAgent = request.agent(appA);
    await memberAgent.post("/login").type("form").send({
      identifier: `member_vis_${suffix}@example.com`,
      password: "testpass123",
    });
    assert.equal((await memberAgent.get("/hq/audit")).headers.location, "/hq/login");
    assert.equal((await memberAgent.get("/hq/broadcasts")).headers.location, "/hq/login");

    const branchAgent = request.agent(appA);
    await branchAgent.post("/branch/login").type("form").send({
      identifier: `branch_vis_${suffix}@example.com`,
      password: "testpass123",
    });
    assert.equal((await branchAgent.get("/hq/audit")).headers.location, "/hq/login");
    assert.equal((await branchAgent.get("/hq/broadcasts")).headers.location, "/hq/login");

    const leaderAgent = request.agent(appA);
    await leaderAgent.post("/leader/login").type("form").send({
      identifier: `leader_vis_${suffix}@example.com`,
      password: "testpass123",
    });
    assert.equal((await leaderAgent.get("/hq/audit")).headers.location, "/hq/login");
    assert.equal((await leaderAgent.get("/hq/broadcasts")).headers.location, "/hq/login");

    for (let i = 0; i < 25; i += 1) {
      await auditLogsRepo.insertAuditLog(pool, {
        organization_id: orgA.id,
        branch_id: branchA.id,
        actor_type: "system",
        actor_id: null,
        action: "member_verified_by_admin",
        entity_type: "member",
        entity_id: memberRow.id,
        metadata_json: { title: `Page filler ${i}` },
      });
    }
    const paged = await hqAgent.get("/hq/audit?limit=10");
    assert.equal(paged.status, 200);
    assert.match(paged.text, /data-hq-audit-pagination/);
    assert.match(paged.text, /Next/);

    await cleanup(pool, [orgA.id, orgB.id]);
  }
);
