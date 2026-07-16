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
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const membersRepo = require("../src/db/pg/church/membersRepo");
const auditLogsRepo = require("../src/db/pg/church/auditLogsRepo");
const {
  formatMetadataForDisplay,
  sanitizeMetadataForDisplay,
  parseAuditFilters,
  packageChangeFromRow,
  reasonFromRow,
  resultFromRow,
  entityIdentifierFromRow,
  isBranchRestrictedAuditRow,
  buildAuditExportCsv,
  AUDIT_ACTION_GROUPS,
} = require("../src/church/auditLogFormatting");
const { organisationAllowsAuditExport } = require("../src/services/church/auditLogViewerService");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const churchRoutes = require("../src/routes/church");
const blessboardAdminRoutes = require("../src/routes/blessboardAdmin");
const { ROLES } = require("../src/auth/roles");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeChurchApp(ctx) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "test-audit-viewer",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = ctx;
    next();
  });
  app.use(churchRoutes());
  app.use((req, res) => res.status(404).type("text").send("not found"));
  return app;
}

function makePlatformApp(role) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "test-audit-viewer-platform",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isBlessBoardApexHost = true;
    if (role) {
      req.session.adminUser = {
        id: 1,
        username: "super",
        display_name: "Super",
        role,
      };
    }
    next();
  });
  app.use("/admin", blessboardAdminRoutes());
  app.use((req, res) => res.status(404).type("text").send("not found"));
  return app;
}

async function cleanup(pool, orgIds) {
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_members WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("filters parse date range, action, user, package and security groups", () => {
  assert.ok(AUDIT_ACTION_GROUPS.some((g) => g.id === "package"));
  assert.ok(AUDIT_ACTION_GROUPS.some((g) => g.id === "security"));
  const parsed = parseAuditFilters({
    date_from: "2026-01-01",
    date_to: "2026-01-31",
    action: "platform_package_assigned",
    actor_id: "42",
    action_group: "package",
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.filters.dateFrom, "2026-01-01");
  assert.equal(parsed.filters.dateTo, "2026-01-31");
  assert.equal(parsed.filters.action, "platform_package_assigned");
  assert.equal(parsed.filters.actorId, 42);
  assert.equal(parsed.filters.actionGroup, "package");
});

test("restricted-data redaction strips passwords, tokens and pastoral notes", () => {
  const display = formatMetadataForDisplay({
    title: "ok",
    password: "secret",
    token: "abc",
    pastoral_note: "confidential care",
    prayer_details: "healing request text",
    note: "generic note body",
    plan_notes: "commercial plan note ok",
    reason: "upgrade",
    previous_package: "foundation",
    new_package: "growth",
  });
  assert.match(display, /"title": "ok"/);
  assert.match(display, /"reason": "upgrade"/);
  assert.match(display, /commercial plan note ok/);
  assert.doesNotMatch(display, /secret/);
  assert.doesNotMatch(display, /abc/);
  assert.doesNotMatch(display, /pastoral/);
  assert.doesNotMatch(display, /confidential care/);
  assert.doesNotMatch(display, /healing request/);
  assert.doesNotMatch(display, /generic note body/);

  const sanitized = sanitizeMetadataForDisplay(
    { admin_note: "private", status: "verified", session_id: "x", content: "hidden" },
    0
  );
  assert.equal(sanitized.admin_note, undefined);
  assert.equal(sanitized.session_id, undefined);
  assert.equal(sanitized.content, undefined);
  assert.equal(sanitized.status, "verified");
});

test("package/reason/result display helpers and branch restriction markers", () => {
  const row = {
    action: "platform_package_assigned",
    actor_type: "platform_admin",
    entity_type: "church_organization",
    entity_id: 9,
    metadata_json: {
      previous_package: "foundation",
      new_package: "growth",
      reason: "Pilot upgrade",
      status: "saved",
    },
  };
  assert.equal(packageChangeFromRow(row), "foundation → growth");
  assert.equal(reasonFromRow(row), "Pilot upgrade");
  assert.equal(resultFromRow(row), "saved");
  assert.equal(entityIdentifierFromRow(row), "9");
  assert.equal(isBranchRestrictedAuditRow(row), true);
  assert.equal(
    isBranchRestrictedAuditRow({ action: "member_verified_by_admin", actor_type: "branch_admin" }),
    false
  );

  const csv = buildAuditExportCsv([
    {
      created_at: "2026-07-16T10:00:00.000Z",
      organization_name: "Org",
      branch_name: "Main",
      actor_type: "branch_admin",
      actor_label: "Ada",
      action: "member_verified_by_admin",
      entity_type: "member",
      entity_id: 1,
      metadata_json: { status: "verified", password: "nope" },
      ip_address: "127.0.0.1",
    },
  ]);
  assert.match(csv, /timestamp,organization,branch/);
  assert.match(csv, /Ada/);
  assert.match(csv, /127\.0\.0\.1/);
  assert.doesNotMatch(csv, /nope/);
});

test("platform tenant manager denied audit access", async () => {
  const banned = await request(makePlatformApp(ROLES.TENANT_MANAGER))
    .get("/admin/church/audit")
    .set("Host", "blessboard.com");
  assert.equal(banned.status, 403);
});

test(
  "platform super-admin can open audit",
  { skip: !isPgConfigured() },
  async () => {
    const allowed = await request(makePlatformApp(ROLES.SUPER_ADMIN))
      .get("/admin/church/audit")
      .set("Host", "blessboard.com");
    assert.equal(allowed.status, 200);
    assert.match(allowed.text, /Platform audit log/);
  }
);

test(
  "audit viewer: platform, HQ/branch scoping, member denial, redaction, pagination, export, cross-tenant",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("audv");
    const passwordHash = await bcrypt.hash("testpass123456", 12);

    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `audva_${suffix}`.slice(0, 40),
      name: `Audit Viewer A ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgA.id,
      { plan_code: "growth", plan_status: "active", plan_notes: null },
      null
    );
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `audvb_${suffix}`.slice(0, 40),
      name: `Audit Viewer B ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgB.id,
      { plan_code: "foundation", plan_status: "active", plan_notes: null },
      null
    );

    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: "main",
      host_slug: `ava_${suffix}`.slice(0, 30),
      name: `Branch A ${suffix}`,
      status: "active",
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgB.id,
      slug: "main",
      host_slug: `avb_${suffix}`.slice(0, 30),
      name: `Branch B ${suffix}`,
      status: "active",
    });

    const adminA = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      full_name: "Branch Admin A",
      email: `ba_a_${suffix}@example.com`,
      phone: "0977111001",
      password_hash: passwordHash,
    });
    await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: orgA.id,
      full_name: "HQ Admin A",
      email: `hq_a_${suffix}@example.com`,
      phone: "0977111002",
      password_hash: passwordHash,
    });
    await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: orgB.id,
      full_name: "HQ Admin B",
      email: `hq_b_${suffix}@example.com`,
      phone: "0977111003",
      password_hash: passwordHash,
    });
    await membersRepo.createPendingMember(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      platform_tenant_id: TENANT_ZM,
      email: `mem_a_${suffix}@example.com`,
      phone: "0977111004",
      full_name: "Ordinary Member",
      password_hash: passwordHash,
    });
    await pool.query(`UPDATE public.church_members SET status = 'verified' WHERE email = $1`, [
      `mem_a_${suffix}@example.com`,
    ]);

    const memberLog = await auditLogsRepo.insertAuditLog(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      actor_type: "branch_admin",
      actor_id: adminA.id,
      action: "member_verified_by_admin",
      entity_type: "member",
      entity_id: 7001,
      metadata_json: {
        title: "Verified Member",
        status: "verified",
        password: "should-hide",
        pastoral_note: "private pastoral text",
      },
      target_label: "Verified Member",
      ip_address: "203.0.113.10",
    });
    const packageLog = await auditLogsRepo.insertAuditLog(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      actor_type: "platform_admin",
      actor_id: 1,
      action: "platform_package_assigned",
      entity_type: "church_organization",
      entity_id: orgA.id,
      metadata_json: {
        previous_package: "foundation",
        new_package: "growth",
        reason: "Growth pilot",
      },
      target_label: orgA.name,
    });
    const otherOrgLog = await auditLogsRepo.insertAuditLog(pool, {
      organization_id: orgB.id,
      branch_id: branchB.id,
      actor_type: "branch_admin",
      actor_id: 1,
      action: "announcement_published",
      entity_type: "announcement",
      entity_id: 88,
      metadata_json: { title: "Other Org Secret" },
    });
    // Extra branch events for pagination
    for (let i = 0; i < 3; i += 1) {
      await auditLogsRepo.insertAuditLog(pool, {
        organization_id: orgA.id,
        branch_id: branchA.id,
        actor_type: "branch_admin",
        actor_id: adminA.id,
        action: "announcement_created",
        entity_type: "announcement",
        entity_id: 800 + i,
        metadata_json: { title: `Extra ${i}` },
      });
    }

    assert.equal(await organisationAllowsAuditExport(pool, orgA.id), true);
    assert.equal(await organisationAllowsAuditExport(pool, orgB.id), false);

    const platformApp = makePlatformApp(ROLES.SUPER_ADMIN);
    const platformPage = await request(platformApp)
      .get("/admin/church/audit")
      .set("Host", "blessboard.com");
    assert.equal(platformPage.status, 200);
    assert.match(platformPage.text, /Platform audit log/);
    assert.match(platformPage.text, /Verified Member|Member verified/);

    const platformExport = await request(platformApp)
      .get("/admin/church/audit/export.csv")
      .set("Host", "blessboard.com");
    assert.equal(platformExport.status, 200);
    assert.match(platformExport.headers["content-type"], /csv/);
    assert.doesNotMatch(platformExport.text, /should-hide/);
    assert.doesNotMatch(platformExport.text, /private pastoral/);

    const ctxA = {
      kind: "branch",
      orgSlug: orgA.slug,
      organization: await organizationsRepo.findOrganizationById(pool, orgA.id),
      branch: branchA,
    };
    const appA = makeChurchApp(ctxA);

    const memberAgent = request.agent(appA);
    await memberAgent.post("/member/login").type("form").send({
      identifier: `mem_a_${suffix}@example.com`,
      password: "testpass123456",
    });
    const memberHq = await memberAgent.get("/hq/audit");
    assert.ok([302, 303].includes(memberHq.status));
    assert.match(String(memberHq.headers.location || ""), /hq\/login|login/i);
    const memberBranch = await memberAgent.get("/branch/activity");
    assert.ok([302, 303].includes(memberBranch.status));
    assert.match(String(memberBranch.headers.location || ""), /branch\/login|login/i);

    const branchAgent = request.agent(appA);
    await branchAgent.post("/branch/login").type("form").send({
      identifier: `ba_a_${suffix}@example.com`,
      password: "testpass123456",
    });
    const timeline = await branchAgent.get("/branch/activity");
    assert.equal(timeline.status, 200);
    assert.match(timeline.text, /Member verified|Verified Member/);
    assert.doesNotMatch(timeline.text, /Package assigned|platform_package_assigned|Growth pilot/);
    assert.doesNotMatch(timeline.text, /Other Org Secret/);
    assert.doesNotMatch(timeline.text, /should-hide/);
    assert.doesNotMatch(timeline.text, /private pastoral/);

    const restrictedDetail = await branchAgent.get(`/branch/activity/${packageLog.id}`);
    assert.equal(restrictedDetail.status, 404);

    const page1 = await branchAgent.get("/branch/activity?limit=2&page=1");
    assert.equal(page1.status, 200);
    assert.match(page1.text, /page 1 of/);
    const page2 = await branchAgent.get("/branch/activity?limit=2&page=2");
    assert.equal(page2.status, 200);
    assert.match(page2.text, /page 2 of/);

    const branchExport = await branchAgent.get("/branch/activity/export.csv");
    assert.equal(branchExport.status, 200);
    assert.match(branchExport.text, /Verified Member|member_verified/);
    assert.doesNotMatch(branchExport.text, /should-hide|pastoral/);

    const crossBranch = await branchAgent.get(`/branch/activity/${otherOrgLog.id}`);
    assert.equal(crossBranch.status, 404);

    const hqAgent = request.agent(appA);
    await hqAgent.post("/hq/login").type("form").send({
      identifier: `hq_a_${suffix}@example.com`,
      password: "testpass123456",
    });
    const hqTrail = await hqAgent.get("/hq/audit");
    assert.equal(hqTrail.status, 200);
    assert.match(hqTrail.text, /Global audit trail/);
    assert.match(hqTrail.text, /Member verified|Verified Member/);
    assert.doesNotMatch(hqTrail.text, /Other Org Secret/);

    const hqDetail = await hqAgent.get(`/hq/audit/${memberLog.id}`);
    assert.equal(hqDetail.status, 200);
    assert.match(hqDetail.text, /203\.0\.113\.10/);
    assert.doesNotMatch(hqDetail.text, /should-hide/);
    assert.doesNotMatch(hqDetail.text, /private pastoral/);

    const hqExport = await hqAgent.get("/hq/audit/export.csv");
    assert.equal(hqExport.status, 200);

    const packageFilter = await hqAgent.get("/hq/audit?action_group=package");
    assert.equal(packageFilter.status, 200);
    assert.match(packageFilter.text, /Package assigned|foundation → growth|Growth pilot/);

    const crossHq = await hqAgent.get(`/hq/audit/${otherOrgLog.id}`);
    assert.equal(crossHq.status, 404);

    const ctxB = {
      kind: "branch",
      orgSlug: orgB.slug,
      organization: await organizationsRepo.findOrganizationById(pool, orgB.id),
      branch: branchB,
    };
    const hqB = request.agent(makeChurchApp(ctxB));
    await hqB.post("/hq/login").type("form").send({
      identifier: `hq_b_${suffix}@example.com`,
      password: "testpass123456",
    });
    const hqBCross = await hqB.get(`/hq/audit/${memberLog.id}`);
    assert.equal(hqBCross.status, 404);
    const hqBExport = await hqB.get("/hq/audit/export.csv");
    assert.equal(hqBExport.status, 403);

    await cleanup(pool, [orgA.id, orgB.id]);
  }
);
