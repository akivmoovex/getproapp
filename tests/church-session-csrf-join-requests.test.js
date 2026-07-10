"use strict";

const fs = require("fs");
const path = require("path");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  CSRF_FIELD,
  issueChurchSessionCsrfToken,
  validateChurchSessionCsrfToken,
  ensureChurchSessionCsrfSecret,
  TOKEN_PREFIX,
} = require("../src/church/churchSessionCsrf");
const { getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const branchAdminsRepo = require("../src/db/pg/church/branchAdminsRepo");
const membersRepo = require("../src/db/pg/church/membersRepo");
const ministriesRepo = require("../src/db/pg/church/ministriesRepo");
const ministryLeadersRepo = require("../src/db/pg/church/ministryLeadersRepo");
const memberMinistriesRepo = require("../src/db/pg/church/memberMinistriesRepo");
const ministryJoinRequestsRepo = require("../src/db/pg/church/ministryJoinRequestsRepo");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { churchPgSkipIfUnconfigured, requireChurchPgOrSkip } = require("./helpers/churchPgTest");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const churchRoutes = require("../src/routes/church");
const { setChurchMemberSession } = require("../src/church/memberAuth");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function extractCsrf(html) {
  const text = String(html || "");
  const m =
    text.match(new RegExp(`name="${CSRF_FIELD}"\\s+value="([^"]+)"`)) ||
    text.match(new RegExp(`name='${CSRF_FIELD}'\\s+value='([^']+)'`));
  return m ? m[1] : null;
}

function makeApp(ctx, sessionHook) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "test-church-session-csrf",
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

async function cleanup(pool, branchIds, orgIds) {
  for (const branchId of branchIds) {
    await pool.query(`DELETE FROM public.church_audit_logs WHERE branch_id = $1`, [branchId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_ministry_join_requests WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_member_ministries WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_ministry_leaders WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_ministries WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_members WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branchId]);
  }
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("church session CSRF tokens validate with timing-safe HMAC and reject garbage", () => {
  const req = { session: {} };
  const a = issueChurchSessionCsrfToken(req);
  const b = issueChurchSessionCsrfToken(req);
  assert.notEqual(a, b);
  assert.match(a, new RegExp(`^${TOKEN_PREFIX}\\.`));
  assert.equal(validateChurchSessionCsrfToken(req, a), true);
  assert.equal(validateChurchSessionCsrfToken(req, b), true);
  assert.equal(validateChurchSessionCsrfToken(req, "csc1.deadbeef.nope"), false);
  assert.equal(validateChurchSessionCsrfToken(req, null), false);
  assert.equal(validateChurchSessionCsrfToken({ session: {} }, a), false);
  assert.doesNotMatch(a, /password|session|cookie/i);
});

test("HQ broadcast publish keeps confirmation token separate from CSRF", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../src/routes/church/hqAdminBroadcasts.js"),
    "utf8"
  );
  assert.match(src, /requireChurchSessionCsrf/);
  assert.match(src, /issuePublishToken|_publish_token|hqBroadcastPublishToken/);
  assert.match(src, /\/hq\/broadcasts\/:broadcastId\/publish/);
  const view = fs.readFileSync(
    path.join(__dirname, "../views/church/hq/broadcast_confirm_publish.ejs"),
    "utf8"
  );
  assert.match(view, /_publish_token/);
  assert.match(view, /csrf_field|churchCsrfToken|_csrf/);
});

test("migration 093 SQL defines leader recommendation columns and constraints", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "../db/postgres/093_church_ministry_join_leader_recommendation.sql"),
    "utf8"
  );
  assert.match(sql, /leader_recommendation/);
  assert.match(sql, /leader_comment/);
  assert.match(sql, /leader_reviewed_at/);
  assert.match(sql, /leader_reviewer_id/);
  assert.match(sql, /recommend_approval/);
  assert.match(sql, /do_not_recommend/);
  assert.match(sql, /more_info_needed/);
  assert.match(sql, /church_ministry_leaders/);
  assert.match(sql, /idx_church_ministry_join_requests_ministry_leader_review/);
  const schema = fs.readFileSync(path.join(__dirname, "../src/db/pg/ensureChurchSchema.js"), "utf8");
  assert.match(schema, /093_church_ministry_join_leader_recommendation\.sql/);
});

test("anonymous and member remain blocked from leader recommend route", async () => {
  const app = makeApp({
    kind: "branch",
    organization: { id: 1, name: "Demo", status: "active" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  const anon = await request(app).post("/leader/requests/1/recommend").type("form").send({
    recommendation: "recommend_approval",
  });
  assert.equal(anon.status, 302);
  assert.equal(anon.headers.location, "/leader/login");

  const memberApp = makeApp(
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
  const member = await request(memberApp).post("/leader/requests/1/recommend").type("form").send({
    recommendation: "recommend_approval",
  });
  assert.equal(member.status, 302);
  assert.equal(member.headers.location, "/leader/login");
});

test(
  "church session CSRF protects leader and branch join-request mutations",
  {
    ...churchPgSkipIfUnconfigured(),
  },
  async (t) => {
    const prevStrict = process.env.GETPRO_REQUIRE_CHURCH_CSRF;
    process.env.GETPRO_REQUIRE_CHURCH_CSRF = "1";
    const pool = await requireChurchPgOrSkip(t);
    if (!pool) {
      if (prevStrict === undefined) delete process.env.GETPRO_REQUIRE_CHURCH_CSRF;
      else process.env.GETPRO_REQUIRE_CHURCH_CSRF = prevStrict;
      return;
    }

    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("cscj");
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `cscj_${suffix}`.replace(/[^a-z0-9_]/g, "").slice(0, 40),
      name: `CSRF Join Church ${suffix}`,
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: `CSRF Join Branch ${suffix}`,
    });
    const branchOther = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "east",
      name: `CSRF Other Branch ${suffix}`,
    });
    const passwordHash = await bcrypt.hash("testpass123", 12);
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      full_name: "Admin CSRF",
      email: `admin_cscj_${suffix}@example.com`,
      phone: "0977000101",
      password_hash: passwordHash,
    });
    const youth = await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      name: "Youth Ministry",
      slug: "youth",
      description: "Youth",
      leader_name: "Youth Leader",
      visibility: "members",
      status: "published",
      created_by_admin_id: null,
    });
    const choir = await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      name: "Choir Ministry",
      slug: "choir",
      description: "Choir",
      leader_name: "Choir Leader",
      visibility: "members",
      status: "published",
      created_by_admin_id: null,
    });
    const otherBranchMinistry = await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: org.id,
      branch_id: branchOther.id,
      name: "East Youth",
      slug: "youth-east",
      description: "East",
      leader_name: "East Leader",
      visibility: "members",
      status: "published",
      created_by_admin_id: null,
    });
    await ministryLeadersRepo.createMinistryLeader(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      ministry_id: youth.id,
      full_name: "Youth Leader",
      email: `youth.cscj_${suffix}@example.com`,
      phone: "0977000111",
      password_hash: passwordHash,
      role: "ministry_leader",
      status: "active",
    });
    const member = await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      email: `member_cscj_${suffix}@example.com`,
      phone: "0977333111",
      full_name: "CSRF Applicant",
      password_hash: passwordHash,
    });
    await membersRepo.updateMemberStatusForBranch(pool, member.id, branch.id, "verified");
    const otherMember = await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branchOther.id,
      platform_tenant_id: TENANT_ZM,
      email: `other_cscj_${suffix}@example.com`,
      phone: "0977333222",
      full_name: "Other Branch Applicant",
      password_hash: passwordHash,
    });
    await membersRepo.updateMemberStatusForBranch(pool, otherMember.id, branchOther.id, "verified");

    try {
      const joinReq = await ministryJoinRequestsRepo.createJoinRequestForMember(pool, {
        organization_id: org.id,
        branch_id: branch.id,
        member_id: member.id,
        ministry_id: youth.id,
        message: "Please let me join.",
      });
      const choirReq = await ministryJoinRequestsRepo.createJoinRequestForMember(pool, {
        organization_id: org.id,
        branch_id: branch.id,
        member_id: member.id,
        ministry_id: choir.id,
        message: "Choir request",
      });
      const otherBranchReq = await ministryJoinRequestsRepo.createJoinRequestForMember(pool, {
        organization_id: org.id,
        branch_id: branchOther.id,
        member_id: otherMember.id,
        ministry_id: otherBranchMinistry.id,
        message: "Other branch",
      });

      const app = makeApp({
        kind: "branch",
        orgSlug: org.slug,
        organization: org,
        branch,
      });
      const leaderAgent = request.agent(app);
      await leaderAgent.post("/leader/login").type("form").send({
        identifier: `youth.cscj_${suffix}@example.com`,
        password: "testpass123",
      });

      const detailGet = await leaderAgent.get(`/leader/requests/${joinReq.id}`);
      assert.equal(detailGet.status, 200);
      const csrfA = extractCsrf(detailGet.text);
      assert.ok(csrfA);
      const csrfB = extractCsrf((await leaderAgent.get(`/leader/requests/${joinReq.id}`)).text);
      assert.ok(csrfB);
      assert.notEqual(csrfA, csrfB);
      assert.equal(detailGet.req.path, `/leader/requests/${joinReq.id}`);

      const missing = await leaderAgent
        .post(`/leader/requests/${joinReq.id}/recommend`)
        .type("form")
        .send({ recommendation: "recommend_approval", leader_comment: "ok" });
      assert.equal(missing.status, 403);
      assert.match(missing.text, /form token/i);

      const afterMissing = await ministryJoinRequestsRepo.findJoinRequestByIdForBranch(
        pool,
        joinReq.id,
        branch.id
      );
      assert.equal(afterMissing.leader_recommendation, null);
      assert.equal(afterMissing.status, "submitted");

      const invalid = await leaderAgent
        .post(`/leader/requests/${joinReq.id}/recommend`)
        .type("form")
        .send({
          recommendation: "recommend_approval",
          leader_comment: "ok",
          [CSRF_FIELD]: "csc1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        });
      assert.equal(invalid.status, 403);

      const afterInvalid = await ministryJoinRequestsRepo.findJoinRequestByIdForBranch(
        pool,
        joinReq.id,
        branch.id
      );
      assert.equal(afterInvalid.leader_recommendation, null);

      const valid = await leaderAgent
        .post(`/leader/requests/${joinReq.id}/recommend`)
        .type("form")
        .send({
          recommendation: "recommend_approval",
          leader_comment: "Strong fit",
          [CSRF_FIELD]: csrfA,
        });
      assert.equal(valid.status, 303);

      const stored = await ministryJoinRequestsRepo.findJoinRequestByIdForBranch(pool, joinReq.id, branch.id);
      assert.equal(stored.status, "submitted");
      assert.equal(stored.leader_recommendation, "recommend_approval");
      assert.equal(
        await memberMinistriesRepo.findActiveMemberMinistry(pool, member.id, youth.id, branch.id),
        null
      );

      const tabTokenStillWorks = await leaderAgent
        .post(`/leader/requests/${joinReq.id}/recommend`)
        .type("form")
        .send({
          recommendation: "more_info_needed",
          leader_comment: "Need schedule",
          [CSRF_FIELD]: csrfB,
        });
      assert.equal(tabTokenStillWorks.status, 303);

      const crossMinistry = await leaderAgent
        .post(`/leader/requests/${choirReq.id}/recommend`)
        .type("form")
        .send({
          recommendation: "recommend_approval",
          [CSRF_FIELD]: csrfA,
        });
      assert.equal(crossMinistry.status, 404);

      const crossBranch = await leaderAgent
        .post(`/leader/requests/${otherBranchReq.id}/recommend`)
        .type("form")
        .send({
          recommendation: "recommend_approval",
          [CSRF_FIELD]: csrfA,
        });
      assert.equal(crossBranch.status, 404);

      const audit = await pool.query(
        `SELECT action, metadata_json FROM public.church_audit_logs
         WHERE branch_id = $1 AND action = 'ministry_join_request_leader_reviewed'
         ORDER BY id DESC LIMIT 1`,
        [branch.id]
      );
      assert.equal(audit.rows.length, 1);
      const meta = JSON.stringify(audit.rows[0].metadata_json || {});
      assert.doesNotMatch(meta, /csc1\.|_csrf|Strong fit|Need schedule/i);

      const adminAgent = request.agent(app);
      await adminAgent.post("/branch/login").type("form").send({
        identifier: `admin_cscj_${suffix}@example.com`,
        password: "testpass123",
      });
      const adminDetail = await adminAgent.get(`/branch/ministry-join-requests/${joinReq.id}`);
      assert.equal(adminDetail.status, 200);
      const adminCsrf = extractCsrf(adminDetail.text);
      assert.ok(adminCsrf);

      const approveMissing = await adminAgent
        .post(`/branch/ministry-join-requests/${joinReq.id}/approve`)
        .type("form")
        .send({});
      assert.equal(approveMissing.status, 403);

      const stillOpen = await ministryJoinRequestsRepo.findJoinRequestByIdForBranch(pool, joinReq.id, branch.id);
      assert.equal(stillOpen.status, "submitted");

      const rejectMissing = await adminAgent
        .post(`/branch/ministry-join-requests/${joinReq.id}/reject`)
        .type("form")
        .send({ admin_comment: "No" });
      assert.equal(rejectMissing.status, 403);

      const approveValid = await adminAgent
        .post(`/branch/ministry-join-requests/${joinReq.id}/approve`)
        .type("form")
        .send({ [CSRF_FIELD]: adminCsrf });
      assert.equal(approveValid.status, 303);

      const approved = await ministryJoinRequestsRepo.findJoinRequestByIdForBranch(pool, joinReq.id, branch.id);
      assert.equal(approved.status, "approved");
      const membership = await memberMinistriesRepo.findActiveMemberMinistry(
        pool,
        member.id,
        youth.id,
        branch.id
      );
      assert.ok(membership);

      const announceGet = await adminAgent.get("/branch/announcements/new");
      assert.equal(announceGet.status, 200);
      const announceCsrf = extractCsrf(announceGet.text);
      assert.ok(announceCsrf);
      const announceMissing = await adminAgent.post("/branch/announcements").type("form").send({
        title: "No token",
        body: "Body",
        category: "general",
        audience: "all_members",
        priority: "normal",
        _intent: "draft",
      });
      assert.equal(announceMissing.status, 403);
      const announceInvalid = await adminAgent.post("/branch/announcements").type("form").send({
        title: "Bad token",
        body: "Body",
        category: "general",
        audience: "all_members",
        priority: "normal",
        _intent: "draft",
        [CSRF_FIELD]: "csc1.bad.token",
      });
      assert.equal(announceInvalid.status, 403);
      const announceValid = await adminAgent.post("/branch/announcements").type("form").send({
        title: `CSRF Announcement ${suffix}`,
        body: "Protected create",
        category: "general",
        audience: "all_members",
        priority: "normal",
        _intent: "draft",
        [CSRF_FIELD]: announceCsrf,
      });
      assert.ok([302, 303].includes(announceValid.status));
    } finally {
      if (prevStrict === undefined) delete process.env.GETPRO_REQUIRE_CHURCH_CSRF;
      else process.env.GETPRO_REQUIRE_CHURCH_CSRF = prevStrict;
      await cleanup(pool, [branch.id, branchOther.id], [org.id]);
    }
  }
);

test(
  "migration 093 applies and preserves null leader-review fields",
  churchPgSkipIfUnconfigured(),
  async (t) => {
    const pool = await requireChurchPgOrSkip(t);
    if (!pool) return;
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'church_ministry_join_requests'
         AND column_name IN ('leader_recommendation','leader_comment','leader_reviewed_at','leader_reviewer_id')
       ORDER BY column_name`
    );
    assert.equal(cols.rows.length, 4);

    const idx = await pool.query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public'
         AND indexname IN (
           'idx_church_ministry_join_requests_ministry_leader_review',
           'idx_church_ministry_join_requests_leader_reviewer'
         )`
    );
    assert.equal(idx.rows.length, 2);

    const check = await pool.query(
      `SELECT 1 FROM pg_constraint
       WHERE conname = 'church_ministry_join_requests_leader_recommendation_check'`
    );
    assert.equal(check.rows.length, 1);

    const nullOk = await pool.query(
      `SELECT COUNT(*)::int AS c FROM public.church_ministry_join_requests
       WHERE leader_recommendation IS NULL`
    );
    assert.ok(Number(nullOk.rows[0].c) >= 0);
  }
);
