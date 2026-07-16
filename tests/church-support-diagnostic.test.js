"use strict";

const path = require("path");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema, latestChurchSchemaMigration } = require("../src/db/pg/ensureChurchSchema");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const blessboardAdminRoutes = require("../src/routes/blessboardAdmin");
const { ROLES } = require("../src/auth/roles");
const {
  buildOrganisationSupportDiagnostic,
  exportOrganisationSupportDiagnostic,
  redactEmail,
  redactPhone,
  redactText,
  formatDiagnosticAsText,
} = require("../src/services/church/churchSupportDiagnosticService");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makePlatformApp(role) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "test-support-diagnostic",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isBlessBoardApexHost = true;
    if (role) {
      req.session.adminUser = {
        id: 77,
        username: "super@example.com",
        email: "super@example.com",
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
    await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("redaction masks emails and phones", () => {
  assert.equal(redactEmail("jordan.admin@example.com"), "jo***@example.com");
  assert.match(redactPhone("+260 97 700 0111"), /\*\*\*\d{4}$/);
  const text = redactText("Contact jordan.admin@example.com or +260977000111 for help");
  assert.doesNotMatch(text, /jordan\.admin@example\.com/);
  assert.doesNotMatch(text, /\+260977000111/);
  assert.match(text, /jo\*\*\*@example\.com/);
});

test("formatDiagnosticAsText stays redacted and includes core sections", () => {
  const summary = {
    generatedAt: "2026-07-16T00:00:00.000Z",
    elapsedMs: 12,
    organisation: { id: 1, name: "Demo", slug: "demo", status: "active", platformTenantId: "zm" },
    package: {
      code: "foundation",
      label: "Foundation",
      planStatus: "active",
      storedPlanCode: "foundation",
      entitlementSource: "direct",
      fallback: { used: false, reason: null },
    },
    branches: {
      activeCount: 1,
      lifecycle: {
        byOperationalStatus: { active: 1, suspended: 0, archived: 0 },
        byLifecyclePhase: { active: 1, draft: 0 },
      },
    },
    members: { activeVerifiedCount: 0, totalCount: 0 },
    administrators: { hqActive: 1, branchActive: 0, privilegedSeatTotal: 1 },
    usageAndQuota: {
      unavailable: false,
      warningCount: 0,
      blocked: false,
      meters: { members: { used: 0, limit: 250, display: "0 / 250" } },
    },
    recentFailedJobs: [],
    recentTenantLinkedErrors: { unavailable: false, items: [] },
    application: {
      version: "1.0.0",
      deploymentLabel: "test",
      latestChurchMigration: latestChurchSchemaMigration(),
      nodeEnv: "test",
    },
    customDomain: { status: "not_implemented", note: "n/a" },
    storageHealth: { kind: "attachment_quota", bytesUsed: 0, reconciledAt: null, meter: null, note: "quota" },
  };
  const text = formatDiagnosticAsText(summary);
  assert.match(text, /BlessBoard support diagnostic \(redacted\)/);
  assert.match(text, /\[Package\]/);
  assert.match(text, /foundation/);
  assert.doesNotMatch(text, /SESSION_SECRET|password|Bearer /i);
});

test("missing organisation throws NOT_FOUND", async () => {
  await assert.rejects(
    () =>
      buildOrganisationSupportDiagnostic(
        { query: async () => ({ rows: [] }) },
        0,
        { auditAccess: false }
      ),
    (err) => err && err.code === "VALIDATION"
  );

  await assert.rejects(
    () =>
      buildOrganisationSupportDiagnostic(
        { query: async () => ({ rows: [] }) },
        123456,
        { auditAccess: false }
      ),
    (err) => err && err.code === "NOT_FOUND"
  );
});

test("large-tenant style summary uses counts only and finishes quickly with stubbed reads", async () => {
  const orgId = 42;
  const queries = [];
  const pool = {
    query: async (sql, params) => {
      queries.push(String(sql).replace(/\s+/g, " ").trim());
      if (/FROM public\.church_organizations WHERE id/i.test(sql)) {
        return {
          rows: [
            {
              id: orgId,
              name: "Large Org",
              slug: "large-org",
              status: "active",
              plan_code: "growth",
              plan_status: "active",
              platform_tenant_id: "zm",
              status_reason: "Contact alice@example.com at +260977000111",
              storage_bytes_used: 1024,
              storage_bytes_reconciled_at: new Date().toISOString(),
            },
          ],
        };
      }
      if (/church_branches/i.test(sql) && /COUNT/i.test(sql)) {
        return {
          rows: [
            {
              total_branches: 40,
              active_branches: 35,
              suspended_branches: 3,
              archived_branches: 2,
              lifecycle_draft: 0,
              lifecycle_ready: 1,
              lifecycle_active: 35,
              lifecycle_temporarily_inactive: 2,
              lifecycle_archived: 1,
              lifecycle_closed: 1,
            },
          ],
        };
      }
      if (/church_audit_logs/i.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      if (/billing_/i.test(sql)) {
        return { rows: [{}] };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  // Soft-stub package diagnostic path by ensuring getOrganisationPlan fails closed via empty plan tables.
  // The summary still returns with missing usage marked gracefully.
  const summary = await buildOrganisationSupportDiagnostic(pool, orgId, { auditAccess: false });
  assert.equal(summary.organisation.id, orgId);
  assert.equal(summary.organisation.name, "Large Org");
  assert.match(summary.organisation.statusReason, /al\*\*\*@example\.com|\*\*\*\d{4}/);
  assert.doesNotMatch(summary.organisation.statusReason || "", /alice@example\.com|\+260977000111/);
  assert.equal(summary.branches.lifecycle.byOperationalStatus.active, 35);
  assert.ok(summary.elapsedMs != null);
  assert.ok(summary.elapsedMs < 2000);
  assert.ok(queries.every((q) => !/SELECT\s+\*\s+FROM\s+public\.church_members/i.test(q)));
  assert.ok(queries.some((q) => /COUNT/i.test(q)));
});

test(
  "correct tenant summary, export, auth, missing data, performance",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("sdiag");
    const passwordHash = await bcrypt.hash("testpass123456", 12);
    const orgIds = [];

    try {
      const org = await organizationsRepo.createOrganization(pool, {
        platform_tenant_id: TENANT_ZM,
        slug: `sd_${suffix}`.slice(0, 40),
        name: `Support Diag ${suffix}`,
      });
      orgIds.push(org.id);
      await organizationsRepo.updateOrganizationPlan(
        pool,
        org.id,
        { plan_code: "foundation", plan_status: "active", plan_notes: null },
        null
      );
      await branchesRepo.createBranch(pool, {
        organization_id: org.id,
        slug: `main_${suffix}`.slice(0, 30),
        host_slug: `main_${suffix}`.slice(0, 30),
        name: "Main",
        status: "active",
        lifecycle_phase: "active",
      });
      await hqAdminsRepo.createHqAdmin(pool, {
        organization_id: org.id,
        full_name: "HQ Admin",
        email: `hq_${suffix}@example.com`,
        phone: "0977000111",
        password_hash: passwordHash,
        role: "hq_admin",
        status: "active",
      });

      const started = Date.now();
      const diagnostic = await buildOrganisationSupportDiagnostic(pool, org.id, {
        platformAdminId: 77,
        auditAccess: true,
      });
      const elapsed = Date.now() - started;
      assert.equal(diagnostic.organisation.id, org.id);
      assert.equal(diagnostic.organisation.slug, org.slug);
      assert.equal(diagnostic.package.code, "foundation");
      assert.equal(diagnostic.branches.activeCount, 1);
      assert.equal(diagnostic.administrators.hqActive, 1);
      assert.ok(diagnostic.usageAndQuota);
      assert.equal(diagnostic.customDomain.status, "not_implemented");
      assert.equal(diagnostic.storageHealth.kind, "attachment_quota");
      assert.equal(String(diagnostic.application.latestChurchMigration), latestChurchSchemaMigration());
      assert.ok(diagnostic.redacted);
      assert.doesNotMatch(JSON.stringify(diagnostic), /0977000111|hq_.*@example\.com|password_hash|SESSION_SECRET/i);
      assert.ok(elapsed < 5000, `large-tenant-style diagnostic should stay under 5s (was ${elapsed}ms)`);

      const auditView = await pool.query(
        `SELECT action FROM public.church_audit_logs
         WHERE organization_id = $1 AND action = 'platform_support_diagnostic_viewed'`,
        [org.id]
      );
      assert.ok(auditView.rowCount >= 1);

      const exported = await exportOrganisationSupportDiagnostic(pool, org.id, {
        format: "json",
        platformAdminId: 77,
      });
      assert.equal(exported.format, "json");
      assert.match(exported.body, /"redacted": true/);
      assert.doesNotMatch(exported.body, /0977000111/);

      const txt = await exportOrganisationSupportDiagnostic(pool, org.id, {
        format: "txt",
        platformAdminId: 77,
      });
      assert.match(txt.body, /BlessBoard support diagnostic/);
      const auditExport = await pool.query(
        `SELECT action FROM public.church_audit_logs
         WHERE organization_id = $1 AND action = 'platform_support_diagnostic_exported'`,
        [org.id]
      );
      assert.ok(auditExport.rowCount >= 2);

      await assert.rejects(
        () => buildOrganisationSupportDiagnostic(pool, 999999991, { auditAccess: false }),
        (err) => err && err.code === "NOT_FOUND"
      );

      const denied = await request(makePlatformApp(null))
        .get(`/admin/church/organizations/${org.id}/support-diagnostic`)
        .set("Host", "blessboard.com");
      assert.ok([302, 401, 403].includes(denied.status));

      const tenantManager = await request(makePlatformApp(ROLES.TENANT_MANAGER))
        .get(`/admin/church/organizations/${org.id}/support-diagnostic`)
        .set("Host", "blessboard.com");
      assert.ok([302, 401, 403].includes(tenantManager.status));

      const allowed = await request(makePlatformApp(ROLES.SUPER_ADMIN))
        .get(`/admin/church/organizations/${org.id}/support-diagnostic`)
        .set("Host", "blessboard.com");
      assert.equal(allowed.status, 200);
      assert.match(allowed.text, /Support diagnostic/);
      assert.match(allowed.text, new RegExp(org.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.doesNotMatch(allowed.text, /0977000111/);

      const exportRes = await request(makePlatformApp(ROLES.SUPER_ADMIN))
        .get(`/admin/church/organizations/${org.id}/support-diagnostic/export.json`)
        .set("Host", "blessboard.com");
      assert.equal(exportRes.status, 200);
      assert.match(exportRes.headers["content-type"] || "", /json/);
      const parsed = JSON.parse(exportRes.text);
      assert.equal(parsed.organisation.id, org.id);
      assert.equal(parsed.redacted, true);
    } finally {
      await cleanup(pool, orgIds);
    }
  }
);
