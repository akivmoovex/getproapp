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
const membersRepo = require("../src/db/pg/church/membersRepo");
const branchAdminsRepo = require("../src/db/pg/church/branchAdminsRepo");
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const auditLogsRepo = require("../src/db/pg/church/auditLogsRepo");
const passwordResetRateLimitsRepo = require("../src/db/pg/church/passwordResetRateLimitsRepo");
const {
  checkPasswordResetRateLimit,
  normalizeResetIdentifier,
  gatePasswordResetRequest,
  recordPasswordResetSubmission,
} = require("../src/services/church/passwordResetRateLimitService");
const { PASSWORD_RESET_RATE_LIMIT } = require("../src/church/passwordResetRateLimit");
const { PUBLIC_SUCCESS_MESSAGE } = require("../src/church/memberPasswordResetRequestValidation");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const churchRoutes = require("../src/routes/church");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeChurchApp(ctx, isChurchHost = true) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "test-church-password-reset-rate-limit",
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

async function cleanup(pool, orgId) {
  await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_password_reset_rate_limits WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_hq_admin_password_reset_requests WHERE organization_id = $1`, [orgId]);
  await pool.query(
    `DELETE FROM public.church_branch_admin_password_reset_requests WHERE organization_id = $1`,
    [orgId]
  );
  await pool.query(`DELETE FROM public.church_member_password_reset_requests WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_members WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
}

test("normalizeResetIdentifier lowercases email", () => {
  assert.equal(normalizeResetIdentifier("User@Example.com"), "user@example.com");
});

test("non-church host still 404s forgot-password POST", async () => {
  const app = makeChurchApp(null, false);
  const res = await request(app).post("/forgot-password").type("form").send({ identifier: "x@y.com" });
  assert.equal(res.status, 404);
});

test(
  "password reset rate limiting integration",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("pwrl");
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `pwrl_${suffix}`,
      name: `Rate Limit Church ${suffix}`,
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: `Rate Limit Branch ${suffix}`,
    });
    const passwordHash = await bcrypt.hash("testpass123456", 12);

    await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      email: `member_${suffix}@example.com`,
      phone: "0977111401",
      full_name: "Known Member",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult (36-60)",
      address_area: "Kafue",
      attendance_duration: "Less than 6 months",
    });

    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      full_name: "Branch Admin",
      email: `ba_${suffix}@example.com`,
      phone: "0977111402",
      password_hash: passwordHash,
      role: "branch_admin",
    });

    await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: org.id,
      full_name: "HQ Admin",
      email: `hq_${suffix}@example.com`,
      phone: "0977111403",
      password_hash: passwordHash,
      role: "hq_admin",
    });

    const ctx = {
      kind: "branch",
      orgSlug: org.slug,
      organization: org,
      branch,
    };
    const app = makeChurchApp(ctx);
    const identifier = `member_${suffix}@example.com`;
    const unknownIdentifier = `unknown_${suffix}@example.com`;
    for (let i = 0; i < PASSWORD_RESET_RATE_LIMIT.maxPerIdentifierPerHour; i++) {
      const res = await request(app).post("/forgot-password").type("form").send({ identifier: unknownIdentifier });
      assert.equal(res.status, 303);
    }
    const unknownBefore = await pool.query(
      `SELECT COUNT(*)::int AS count FROM public.church_member_password_reset_requests
       WHERE branch_id = $1 AND identifier_submitted ILIKE $2`,
      [branch.id, `%unknown_${suffix}%`]
    );
    assert.equal(unknownBefore.rows[0].count, PASSWORD_RESET_RATE_LIMIT.maxPerIdentifierPerHour);

    await request(app).post("/forgot-password").type("form").send({ identifier: unknownIdentifier });
    const unknownAfter = await pool.query(
      `SELECT COUNT(*)::int AS count FROM public.church_member_password_reset_requests
       WHERE branch_id = $1 AND identifier_submitted ILIKE $2`,
      [branch.id, `%unknown_${suffix}%`]
    );
    assert.equal(unknownAfter.rows[0].count, unknownBefore.rows[0].count);

    for (let i = 0; i < PASSWORD_RESET_RATE_LIMIT.maxPerIdentifierPerHour; i++) {
      const res = await request(app).post("/forgot-password").type("form").send({ identifier });
      assert.equal(res.status, 303);
      assert.equal(res.headers.location, "/forgot-password-submitted");
    }

    const beforeLimited = await pool.query(
      `SELECT COUNT(*)::int AS count FROM public.church_member_password_reset_requests WHERE branch_id = $1`,
      [branch.id]
    );
    assert.equal(beforeLimited.rows[0].count, PASSWORD_RESET_RATE_LIMIT.maxPerIdentifierPerHour * 2);

    const limited = await request(app).post("/forgot-password").type("form").send({ identifier });
    assert.equal(limited.status, 303);
    assert.equal(limited.headers.location, "/forgot-password-submitted");

    const submitted = await request(app).get("/forgot-password-submitted");
    assert.match(submitted.text, new RegExp(PUBLIC_SUCCESS_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(submitted.text, /rate limit/i);
    assert.doesNotMatch(submitted.text, /too many/i);

    const afterLimited = await pool.query(
      `SELECT COUNT(*)::int AS count FROM public.church_member_password_reset_requests WHERE branch_id = $1`,
      [branch.id]
    );
    assert.equal(afterLimited.rows[0].count, beforeLimited.rows[0].count);

    const auditLimited = await pool.query(
      `SELECT * FROM public.church_audit_logs
       WHERE organization_id = $1 AND action = 'password_reset_request_rate_limited'
       ORDER BY id DESC LIMIT 5`,
      [org.id]
    );
    assert.ok(auditLimited.rows.length >= 1);
    const auditJson = JSON.stringify(auditLimited.rows);
    assert.equal(auditJson.includes("testpass"), false);
    assert.equal(auditJson.includes(identifier), false);

    const branchRes = await request(app)
      .post("/branch/forgot-password")
      .type("form")
      .send({ identifier: `ba_${suffix}@example.com` });
    assert.equal(branchRes.status, 303);

    const branchBucket = await passwordResetRateLimitsRepo.findRecentIdentifierAttempts(
      pool,
      org.id,
      branch.id,
      "branch_admin",
      normalizeResetIdentifier(`ba_${suffix}@example.com`)
    );
    assert.ok(branchBucket);
    assert.equal(branchBucket.request_type, "branch_admin");

    const hqRes = await request(app)
      .post("/hq/forgot-password")
      .type("form")
      .send({ identifier: `hq_${suffix}@example.com` });
    assert.equal(hqRes.status, 303);

    const hqBucket = await passwordResetRateLimitsRepo.findRecentIdentifierAttempts(
      pool,
      org.id,
      branch.id,
      "hq_admin",
      normalizeResetIdentifier(`hq_${suffix}@example.com`)
    );
    assert.ok(hqBucket);
    assert.equal(hqBucket.request_type, "hq_admin");

    const fakeReq = {
      ip: "203.0.113.50",
      connection: { remoteAddress: "203.0.113.50" },
      get: () => "RateLimitTestAgent/1.0",
    };
    for (let i = 0; i < PASSWORD_RESET_RATE_LIMIT.maxPerIpPerHour; i++) {
      await recordPasswordResetSubmission(pool, fakeReq, {
        requestType: "member",
        organizationId: org.id,
        branchId: branch.id,
        identifier: `ipspam_${i}_${suffix}@example.com`,
      });
    }
    const ipBlocked = await gatePasswordResetRequest(pool, fakeReq, {
      requestType: "member",
      organizationId: org.id,
      branchId: branch.id,
      identifier: `ipspam_extra_${suffix}@example.com`,
    });
    assert.equal(ipBlocked.allowed, false);

    const idNorm = normalizeResetIdentifier(identifier);
    await pool.query(
      `UPDATE public.church_password_reset_rate_limits
       SET blocked_until = now() - interval '1 minute',
           attempt_count = 0,
           first_attempt_at = now() - interval '2 hours',
           last_attempt_at = now() - interval '2 hours'
       WHERE organization_id = $1 AND branch_id = $2 AND request_type = 'member' AND identifier_normalized = $3`,
      [org.id, branch.id, idNorm]
    );

    const check = await checkPasswordResetRateLimit(pool, {
      requestType: "member",
      organizationId: org.id,
      branchId: branch.id,
      identifier,
      identifierNormalized: idNorm,
      ipAddress: null,
      userAgent: null,
      ipBucket: null,
    });
    assert.equal(check.allowed, true);

    await cleanup(pool, org.id);
  }
);
