"use strict";

/**
 * Centralized session revocation via account security_version.
 *
 * Covers:
 * 1. Existing session works before change
 * 2. Password reset invalidates existing session
 * 3. Role removal invalidates existing session
 * 4. Branch-scope removal invalidates existing session
 * 5. Organization suspension invalidates affected tenant sessions
 * 6. Unrelated tenant session remains valid
 * 7. Re-login creates a session with the new version
 * 8. Direct request using the old session is rejected
 * 9. Bulk scope revocation affects only intended users
 * 10. Audit logs are created without secrets
 */

const path = require("path");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { churchPgSkipIfUnconfigured, requireChurchPgOrSkip } = require("./helpers/churchPgTest");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const churchRoutes = require("../src/routes/church");
const membersRepo = require("../src/db/pg/church/membersRepo");
const branchAdminsRepo = require("../src/db/pg/church/branchAdminsRepo");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const { transferMemberToBranch } = require("../src/services/church/memberBranchTransferService");
const {
  sessionMatchesSecurityVersion,
  normalizeSecurityVersion,
} = require("../src/church/accountSecurityVersion");

const PASSWORD = "SecVerPass123!";

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeTenantApp(org, branch) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "security-version-test",
      resave: false,
      saveUninitialized: true,
      name: "getpro_sid",
    })
  );
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = {
      kind: "branch",
      host: `${branch.host_slug || branch.slug}.blessboard.com`,
      orgSlug: org.slug,
      hostSlug: branch.host_slug || branch.slug,
      organization: org,
      branch,
    };
    next();
  });
  app.use(churchRoutes());
  return app;
}

async function seedOrgBranch(pool, suffix, { planCode = "growth" } = {}) {
  const orgRes = await pool.query(
    `INSERT INTO public.church_organizations
       (platform_tenant_id, name, slug, status, plan_code)
     VALUES ($1, $2, $3, 'active', $4) RETURNING *`,
    [TENANT_ZM, `SV Org ${suffix}`, `sv-org-${suffix}`, planCode]
  );
  const org = orgRes.rows[0];
  const brRes = await pool.query(
    `INSERT INTO public.church_branches
       (organization_id, name, slug, host_slug, status, member_registration_enabled)
     VALUES ($1, $2, $3, $4, 'active', true) RETURNING *`,
    [org.id, `SV Branch ${suffix}`, `sv-br-${suffix}`, `sv-br-${suffix}`]
  );
  return { org, branch: brRes.rows[0] };
}

async function seedMember(pool, org, branch, suffix, label = "m") {
  const hash = await bcrypt.hash(PASSWORD, 12);
  const r = await pool.query(
    `INSERT INTO public.church_members
       (organization_id, branch_id, platform_tenant_id, full_name, email, phone_normalized, password_hash, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'verified')
     RETURNING *`,
    [
      org.id,
      branch.id,
      TENANT_ZM,
      `SV ${label} ${suffix}`,
      `sv_${label}_${suffix}@example.com`,
      `26099${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
      hash,
    ]
  );
  return r.rows[0];
}

async function seedBranchAdmin(pool, org, branch, suffix, label = "ba") {
  const hash = await bcrypt.hash(PASSWORD, 12);
  const r = await pool.query(
    `INSERT INTO public.church_branch_admins
       (organization_id, branch_id, full_name, email, username, phone_normalized, password_hash, status, role)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', 'branch_admin')
     RETURNING *`,
    [
      org.id,
      branch.id,
      `SV ${label} ${suffix}`,
      `sv_${label}_${suffix}@example.com`,
      `sv_${label}_${suffix}`,
      `26098${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
      hash,
    ]
  );
  return r.rows[0];
}

async function seedHqAdmin(pool, org, suffix, label = "hq") {
  const hash = await bcrypt.hash(PASSWORD, 12);
  const r = await pool.query(
    `INSERT INTO public.church_hq_admins
       (organization_id, full_name, email, username, phone_normalized, password_hash, status, role)
     VALUES ($1, $2, $3, $4, $5, $6, 'active', 'hq_admin')
     RETURNING *`,
    [
      org.id,
      `SV ${label} ${suffix}`,
      `sv_${label}_${suffix}@example.com`,
      `sv_${label}_${suffix}`,
      `26097${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
      hash,
    ]
  );
  return r.rows[0];
}

async function loginMember(app, email) {
  const agent = request.agent(app);
  const res = await agent.post("/login").type("form").send({
    identifier: email,
    password: PASSWORD,
  });
  assert.equal(res.status, 303, `member login failed for ${email}`);
  return agent;
}

async function loginBranchAdmin(app, email) {
  const agent = request.agent(app);
  const res = await agent.post("/branch/login").type("form").send({
    identifier: email,
    password: PASSWORD,
  });
  assert.equal(res.status, 303, `branch admin login failed for ${email}`);
  return agent;
}

async function loginHq(app, email) {
  const agent = request.agent(app);
  const res = await agent.post("/hq/login").type("form").send({
    identifier: email,
    password: PASSWORD,
  });
  assert.equal(res.status, 303, `hq login failed for ${email}`);
  return agent;
}

function assertRedirectToLogin(res, loginPath) {
  assert.ok([302, 303].includes(res.status), `expected redirect, got ${res.status}`);
  assert.equal(res.headers.location, loginPath);
}

test(
  "security_version: session works, password reset / role / branch-scope / org suspend revoke; unrelated stays valid; re-login + audit",
  churchPgSkipIfUnconfigured(),
  async (t) => {
    const pool = await requireChurchPgOrSkip(t);
    if (!pool) return;
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const suffix = makeSuffix("sv");
    const { org, branch } = await seedOrgBranch(pool, suffix);
    const { org: otherOrg, branch: otherBranch } = await seedOrgBranch(pool, `${suffix}_other`);

    const member = await seedMember(pool, org, branch, suffix, "m");
    const otherMember = await seedMember(pool, otherOrg, otherBranch, `${suffix}_o`, "om");
    const branchAdmin = await seedBranchAdmin(pool, org, branch, suffix, "ba");
    const hq = await seedHqAdmin(pool, org, suffix, "hq");

    // Second branch for transfer / branch-scope tests
    const br2Res = await pool.query(
      `INSERT INTO public.church_branches
         (organization_id, name, slug, host_slug, status, member_registration_enabled)
       VALUES ($1, $2, $3, $4, 'active', true) RETURNING *`,
      [org.id, `SV Branch2 ${suffix}`, `sv-br2-${suffix}`, `sv-br2-${suffix}`]
    );
    const branch2 = br2Res.rows[0];

    const liveOrg = { ...org };
    const liveBranch = { ...branch };
    const app = makeTenantApp(liveOrg, liveBranch);
    const otherApp = makeTenantApp(otherOrg, otherBranch);

    // --- 1. Existing session works before change ---
    const memberAgent = await loginMember(app, member.email);
    const otherAgent = await loginMember(otherApp, otherMember.email);
    const baAgent = await loginBranchAdmin(app, branchAdmin.email);
    const hqAgent = await loginHq(app, hq.email);

    assert.equal((await memberAgent.get("/member/dashboard")).status, 200);
    assert.equal((await otherAgent.get("/member/dashboard")).status, 200);
    assert.equal((await baAgent.get("/branch/dashboard")).status, 200);
    assert.equal((await hqAgent.get("/hq/dashboard")).status, 200);

    const vBefore = normalizeSecurityVersion(
      (await pool.query(`SELECT security_version FROM public.church_members WHERE id = $1`, [member.id])).rows[0]
        .security_version
    );
    assert.ok(vBefore >= 1);

    // --- 2 + 8. Password reset invalidates; direct old-session request rejected ---
    const newHash = await bcrypt.hash("NewSecVerPass456!", 12);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await membersRepo.resetMemberPasswordByBranchAdmin(client, member.id, branch.id, newHash);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    const vAfterPw = normalizeSecurityVersion(
      (await pool.query(`SELECT security_version FROM public.church_members WHERE id = $1`, [member.id])).rows[0]
        .security_version
    );
    assert.equal(vAfterPw, vBefore + 1);

    const staleMember = await memberAgent.get("/member/dashboard");
    assertRedirectToLogin(staleMember, "/login");

    // Fresh request with stamped stale version (simulates retained cookie / parallel tab)
    const { setChurchMemberSession } = require("../src/church/memberAuth");
    const stampedApp = express();
    stampedApp.set("view engine", "ejs");
    stampedApp.set("views", path.join(__dirname, "../views"));
    stampedApp.use(express.urlencoded({ extended: true }));
    stampedApp.use(
      session({
        secret: "security-version-stale-stamp",
        resave: false,
        saveUninitialized: true,
      })
    );
    stampedApp.use((req, res, next) => {
      req.isChurchHost = true;
      req.churchContext = {
        kind: "branch",
        host: `${liveBranch.host_slug}.blessboard.com`,
        orgSlug: liveOrg.slug,
        hostSlug: liveBranch.host_slug,
        organization: liveOrg,
        branch: liveBranch,
      };
      setChurchMemberSession(req, {
        member_id: member.id,
        organization_id: liveOrg.id,
        branch_id: liveBranch.id,
        status: "verified",
        full_name: member.full_name,
        security_version: vBefore,
      });
      next();
    });
    stampedApp.use(churchRoutes());

    const staleJson = await request(stampedApp)
      .get("/member/dashboard")
      .set("Accept", "application/json")
      .set("X-Requested-With", "XMLHttpRequest");
    assert.equal(staleJson.status, 401);

    // --- 6. Unrelated tenant session remains valid ---
    assert.equal((await otherAgent.get("/member/dashboard")).status, 200);

    // --- 7. Re-login creates a session with the new version ---
    const reLoginAgent = request.agent(app);
    const reLoginRes = await reLoginAgent.post("/login").type("form").send({
      identifier: member.email,
      password: "NewSecVerPass456!",
    });
    assert.equal(reLoginRes.status, 303);
    assert.equal((await reLoginAgent.get("/member/dashboard")).status, 200);

    const memberRowAfterLogin = (
      await pool.query(`SELECT security_version FROM public.church_members WHERE id = $1`, [member.id])
    ).rows[0];
    assert.ok(
      sessionMatchesSecurityVersion({ security_version: memberRowAfterLogin.security_version }, memberRowAfterLogin)
    );

    // --- 3. Role removal invalidates existing session ---
    const baVersionBefore = normalizeSecurityVersion(
      (
        await pool.query(`SELECT security_version FROM public.church_branch_admins WHERE id = $1`, [branchAdmin.id])
      ).rows[0].security_version
    );
    await branchAdminsRepo.deactivateBranchAdminForPlatform(pool, branchAdmin.id, branch.id, null, {
      reason: "role removal test",
    });
    const baVersionAfter = normalizeSecurityVersion(
      (
        await pool.query(`SELECT security_version FROM public.church_branch_admins WHERE id = $1`, [branchAdmin.id])
      ).rows[0].security_version
    );
    assert.equal(baVersionAfter, baVersionBefore + 1);

    const staleBa = await baAgent.get("/branch/dashboard");
    // Deactivated account redirects to login (status check) — version bump ensures it cannot revive.
    assertRedirectToLogin(staleBa, "/branch/login");

    // --- 4. Branch-scope removal invalidates existing session (member transfer) ---
    const transferMember = await seedMember(pool, org, branch, `${suffix}_tr`, "tr");
    const transferApp = makeTenantApp(liveOrg, liveBranch);
    const transferAgent = await loginMember(transferApp, transferMember.email);
    assert.equal((await transferAgent.get("/member/dashboard")).status, 200);

    const trVersionBefore = normalizeSecurityVersion(
      (await pool.query(`SELECT security_version FROM public.church_members WHERE id = $1`, [transferMember.id]))
        .rows[0].security_version
    );
    await transferMemberToBranch(pool, {
      memberId: transferMember.id,
      fromBranchId: branch.id,
      toBranchId: branch2.id,
      organizationId: org.id,
      organization: { ...org, plan_code: "growth" },
      actorType: "branch_admin",
      actorId: branchAdmin.id,
      reason: "branch scope change test",
    });
    const trVersionAfter = normalizeSecurityVersion(
      (await pool.query(`SELECT security_version FROM public.church_members WHERE id = $1`, [transferMember.id]))
        .rows[0].security_version
    );
    assert.equal(trVersionAfter, trVersionBefore + 1);

    const staleTransfer = await transferAgent.get("/member/dashboard");
    // Branch mismatch and/or version mismatch → login
    assertRedirectToLogin(staleTransfer, "/login");

    // --- 5 + 9. Org suspension invalidates affected; bulk scope only intended users ---
    const hqVersionBefore = normalizeSecurityVersion(
      (await pool.query(`SELECT security_version FROM public.church_hq_admins WHERE id = $1`, [hq.id])).rows[0]
        .security_version
    );
    const otherVersionBefore = normalizeSecurityVersion(
      (await pool.query(`SELECT security_version FROM public.church_members WHERE id = $1`, [otherMember.id]))
        .rows[0].security_version
    );

    // Fresh sessions for affected tenants before suspend (password was reset earlier)
    const memberAgent2 = request.agent(app);
    const member2Login = await memberAgent2.post("/login").type("form").send({
      identifier: member.email,
      password: "NewSecVerPass456!",
    });
    assert.equal(member2Login.status, 303);
    assert.equal((await memberAgent2.get("/member/dashboard")).status, 200);
    const hqAgent2 = await loginHq(app, hq.email);
    assert.equal((await hqAgent2.get("/hq/dashboard")).status, 200);

    await organizationsRepo.suspendOrganization(pool, org.id, {
      reason: "security version org suspend test",
      platformAdminId: null,
    });
    liveOrg.status = "suspended";

    const hqVersionAfterSuspend = normalizeSecurityVersion(
      (await pool.query(`SELECT security_version FROM public.church_hq_admins WHERE id = $1`, [hq.id])).rows[0]
        .security_version
    );
    const memberVersionAfterSuspend = normalizeSecurityVersion(
      (await pool.query(`SELECT security_version FROM public.church_members WHERE id = $1`, [member.id])).rows[0]
        .security_version
    );
    const otherVersionAfterSuspend = normalizeSecurityVersion(
      (await pool.query(`SELECT security_version FROM public.church_members WHERE id = $1`, [otherMember.id]))
        .rows[0].security_version
    );

    assert.equal(hqVersionAfterSuspend, hqVersionBefore + 1);
    assert.ok(memberVersionAfterSuspend > vAfterPw);
    assert.equal(otherVersionAfterSuspend, otherVersionBefore, "unrelated tenant must not be bulk-bumped");

    // Affected sessions blocked (org gate 503 and/or version revoke)
    const affectedMember = await memberAgent2.get("/member/dashboard");
    assert.ok([302, 303, 503].includes(affectedMember.status));
    const affectedHq = await hqAgent2.get("/hq/dashboard");
    assert.ok([302, 303, 503].includes(affectedHq.status));

    // Unrelated tenant still valid
    assert.equal((await otherAgent.get("/member/dashboard")).status, 200);

    // After reactivation, old sessions remain invalid due to security_version mismatch
    await organizationsRepo.reactivateOrganization(pool, org.id, {
      reason: "reactivate after security version test",
      platformAdminId: null,
    });
    liveOrg.status = "active";

    assertRedirectToLogin(await memberAgent2.get("/member/dashboard"), "/login");
    assertRedirectToLogin(await hqAgent2.get("/hq/dashboard"), "/hq/login");
    assert.equal((await otherAgent.get("/member/dashboard")).status, 200);

    // Bulk branch deactivation bumps only branch-scoped accounts
    const ba2 = await seedBranchAdmin(pool, org, branch2, `${suffix}_ba2`, "ba2");
    const hqVersionPreBranch = normalizeSecurityVersion(
      (await pool.query(`SELECT security_version FROM public.church_hq_admins WHERE id = $1`, [hq.id])).rows[0]
        .security_version
    );
    const ba2VersionPre = normalizeSecurityVersion(
      (await pool.query(`SELECT security_version FROM public.church_branch_admins WHERE id = $1`, [ba2.id])).rows[0]
        .security_version
    );
    await branchesRepo.suspendBranch(pool, branch2.id, {
      reason: "branch deactivate bulk revoke test",
      platformAdminId: null,
    });
    const ba2VersionPost = normalizeSecurityVersion(
      (await pool.query(`SELECT security_version FROM public.church_branch_admins WHERE id = $1`, [ba2.id])).rows[0]
        .security_version
    );
    const hqVersionPostBranch = normalizeSecurityVersion(
      (await pool.query(`SELECT security_version FROM public.church_hq_admins WHERE id = $1`, [hq.id])).rows[0]
        .security_version
    );
    assert.equal(ba2VersionPost, ba2VersionPre + 1);
    assert.equal(hqVersionPostBranch, hqVersionPreBranch, "HQ must not be bumped by branch-scoped bulk revoke");

    // --- 10. Audit logs without secrets ---
    const audits = await pool.query(
      `SELECT action, actor_type, actor_id, entity_type, entity_id, metadata_json, created_at
       FROM public.church_audit_logs
       WHERE organization_id = $1
         AND action IN (
           'platform_church_organization_suspended',
           'platform_church_branch_suspended',
           'member_transferred_branch',
           'platform_church_branch_admin_deactivated'
         )
       ORDER BY id DESC
       LIMIT 20`,
      [org.id]
    );
    assert.ok(audits.rows.length >= 1);
    for (const row of audits.rows) {
      assert.ok(row.created_at, "audit must have timestamp");
      assert.ok(row.action);
      const meta =
        typeof row.metadata_json === "string" ? JSON.parse(row.metadata_json) : row.metadata_json || {};
      const blob = JSON.stringify(meta).toLowerCase();
      assert.doesNotMatch(blob, /password|password_hash|session|getpro_sid|cookie/);
      if (row.action === "platform_church_organization_suspended") {
        assert.equal(meta.security_version_bumped, true);
        assert.ok(meta.reason);
        assert.ok(meta.security_bump_counts);
      }
      if (row.action === "member_transferred_branch") {
        assert.equal(meta.security_version_bumped, true);
      }
    }

    // Best-effort cleanup so host_slug / email uniqueness does not poison later suites.
    await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = ANY($1::int[])`, [
      [org.id, otherOrg.id],
    ]);
    await pool.query(`DELETE FROM public.church_member_branch_history WHERE organization_id = ANY($1::int[])`, [
      [org.id, otherOrg.id],
    ]);
    await pool.query(`DELETE FROM public.church_members WHERE organization_id = ANY($1::int[])`, [
      [org.id, otherOrg.id],
    ]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = ANY($1::int[])`, [
      [org.id, otherOrg.id],
    ]);
    await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = ANY($1::int[])`, [
      [org.id, otherOrg.id],
    ]);
    await pool.query(`DELETE FROM public.church_ministry_leaders WHERE organization_id = ANY($1::int[])`, [
      [org.id, otherOrg.id],
    ]);
    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = ANY($1::int[])`, [
      [org.id, otherOrg.id],
    ]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = ANY($1::int[])`, [
      [org.id, otherOrg.id],
    ]);
  }
);
