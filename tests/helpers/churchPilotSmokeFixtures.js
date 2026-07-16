"use strict";

/**
 * Reusable fixtures for BlessBoard pilot smoke tests.
 * Does not change production behaviour — test-only helpers.
 */

const path = require("path");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const request = require("supertest");

const { getPgPool } = require("../../src/db/pg/pool");
const { ensureChurchSchema } = require("../../src/db/pg/ensureChurchSchema");
const { ensureCanonicalTenantsForTests } = require("./pgTestSeed");
const { TENANT_ZM } = require("../../src/tenants/tenantIds");
const organizationsRepo = require("../../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../../src/db/pg/church/branchesRepo");
const branchAdminsRepo = require("../../src/db/pg/church/branchAdminsRepo");
const hqAdminsRepo = require("../../src/db/pg/church/hqAdminsRepo");
const membersRepo = require("../../src/db/pg/church/membersRepo");
const churchRoutes = require("../../src/routes/church");
const { CSRF_FIELD } = require("../../src/church/churchSessionCsrf");

const DEFAULT_PASSWORD = "SmokeTest_pw_123456";

function makeSuffix(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Host/path-safe slug segment (letters, numbers, hyphens only). */
function slugSegment(value, maxLen = 30) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, maxLen);
}

function extractCsrf(html) {
  const text = String(html || "");
  const m =
    text.match(new RegExp(`name="${CSRF_FIELD}"\\s+value="([^"]+)"`)) ||
    text.match(new RegExp(`name='${CSRF_FIELD}'\\s+value='([^']+)'`));
  return m ? m[1] : null;
}

/**
 * Minimal church app with injected tenant context (no Host resolution).
 */
function makeInjectedChurchApp(ctx, opts = {}) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: opts.sessionSecret || "church-pilot-smoke-suite",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = typeof ctx === "function" ? ctx(req) : ctx;
    res.locals.asset = (k) => `/${String(k || "").replace(/^\//, "")}`;
    next();
  });
  app.use(churchRoutes());
  return app;
}

async function bootstrapPilotSmokeDb() {
  const pool = getPgPool();
  await ensureCanonicalTenantsForTests(pool);
  await ensureChurchSchema(pool);
  return pool;
}

/**
 * Tear down an organisation and dependent rows used by smoke fixtures.
 */
async function cleanupPilotOrganization(pool, organizationId) {
  const orgId = Number(organizationId);
  if (!Number.isFinite(orgId) || orgId <= 0) return;

  const tables = [
    "church_pilot_feature_flag_audit",
    "church_pilot_feature_flag_tenant_overrides",
    "church_notification_test_deliveries",
    "church_scheduled_report_deliveries",
    "church_scheduled_report_runs",
    "church_scheduled_report_recipients",
    "church_scheduled_reports",
    "church_hq_broadcast_deliveries",
    "church_hq_broadcast_targets",
    "church_hq_broadcasts",
    "church_survey_answers",
    "church_survey_response_sessions",
    "church_survey_questions",
    "church_surveys",
    "church_appointment_confidential_notes",
    "church_appointment_reminders",
    "church_appointments",
    "church_appointment_leave",
    "church_appointment_availability",
    "church_appointment_settings",
    "church_volunteer_assignments",
    "church_volunteer_shifts",
    "church_volunteer_availability",
    "church_volunteer_member_skills",
    "church_volunteer_role_skills",
    "church_volunteer_skills",
    "church_volunteer_roles",
    "church_group_attendance",
    "church_group_notes",
    "church_group_meetings",
    "church_group_join_requests",
    "church_group_memberships",
    "church_group_leaders",
    "church_groups",
    "church_event_registration_answers",
    "church_event_registration_form_questions",
    "church_event_registration_forms",
    "church_event_visitor_follow_ups",
    "church_event_volunteers",
    "church_event_registrations",
    "church_pastoral_automation_work_items",
    "church_pastoral_automation_runs",
    "church_pastoral_automation_settings",
    "church_pastoral_case_attachments",
    "church_pastoral_case_notes",
    "church_pastoral_cases",
    "church_safeguarding_incidents",
    "church_attendance_offline_queue",
    "church_attendance_check_ins",
    "church_attendance_service_sessions",
    "church_member_attendance_qr_tokens",
    "church_attendance_cross_branch_authorizations",
    "church_member_attendance_exemptions",
    "church_attendance_branch_rules",
    "church_member_branch_history",
    "church_member_import_rows",
    "church_member_import_batches",
    "church_attendance_records",
    "church_prayer_requests",
    "church_events",
    "church_monthly_reports",
    "church_organization_inactivity_warnings",
    "church_audit_logs",
    "church_ministry_leaders",
    "church_branch_admins",
    "church_hq_admins",
    "church_members",
    "church_branch_website_content",
    "church_branches",
    "church_organization_package_trial_reminders",
    "church_organization_package_trials",
    "church_organization_package_history",
    "church_billing_invoices",
    "church_billing_branch_snapshots",
    "church_giving_summaries",
    "church_organizations",
  ];

  for (const table of tables) {
    try {
      if (table === "church_organizations") {
        await pool.query(`DELETE FROM public.${table} WHERE id = $1`, [orgId]);
      } else if (table === "church_pilot_feature_flag_audit") {
        await pool.query(`DELETE FROM public.${table} WHERE organization_id = $1`, [orgId]);
      } else {
        await pool.query(`DELETE FROM public.${table} WHERE organization_id = $1`, [orgId]);
      }
    } catch {
      /* table may not exist in older schemas — ignore for cleanup resilience */
    }
  }
}

async function createBranchAdmin(pool, org, branch, opts = {}) {
  const suffix = opts.suffix || makeSuffix("ba");
  const passwordHash = opts.passwordHash || (await bcrypt.hash(DEFAULT_PASSWORD, 12));
  const admin = await branchAdminsRepo.createBranchAdmin(pool, {
    organization_id: org.id,
    branch_id: branch.id,
    full_name: opts.fullName || "Smoke Branch Admin",
    email: opts.email || `ba_${suffix}@example.com`,
    phone: opts.phone || "0977000001",
    password_hash: passwordHash,
    role: "branch_admin",
    status: "active",
  });
  return { ...admin, password: DEFAULT_PASSWORD, passwordHash };
}

async function createHqAdmin(pool, org, opts = {}) {
  const suffix = opts.suffix || makeSuffix("hq");
  const passwordHash = opts.passwordHash || (await bcrypt.hash(DEFAULT_PASSWORD, 12));
  const admin = await hqAdminsRepo.createHqAdmin(pool, {
    organization_id: org.id,
    full_name: opts.fullName || "Smoke HQ Admin",
    email: opts.email || `hq_${suffix}@example.com`,
    phone: opts.phone || "0977000002",
    password_hash: passwordHash,
    role: "hq_admin",
    status: "active",
    can_view_finance: opts.canViewFinance === true,
  });
  return { ...admin, password: DEFAULT_PASSWORD, passwordHash };
}

/**
 * Foundation tenant: single active branch + admins.
 */
async function createFoundationSmokeTenant(pool, opts = {}) {
  const suffix = opts.suffix || makeSuffix("found");
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  const org = await organizationsRepo.createOrganization(pool, {
    platform_tenant_id: TENANT_ZM,
    slug: slugSegment(`found-${suffix}`, 40),
    name: opts.name || `Foundation Smoke ${suffix}`,
  });
  await organizationsRepo.updateOrganizationPlan(
    pool,
    org.id,
    { plan_code: "foundation", plan_status: "active", plan_notes: "pilot-smoke" },
    null
  );
  await pool.query(
    `UPDATE public.church_organizations
     SET status = 'active', timezone = 'Africa/Lusaka'
     WHERE id = $1`,
    [org.id]
  );

  const branch = await branchesRepo.createBranch(pool, {
    organization_id: org.id,
    slug: slugSegment(`main-${suffix}`),
    host_slug: slugSegment(`main-${suffix}`),
    name: "Main Campus",
    status: "active",
    member_registration_enabled: true,
  });

  const branchAdmin = await createBranchAdmin(pool, org, branch, { suffix, passwordHash });
  const hqAdmin = await createHqAdmin(pool, org, { suffix, passwordHash });

  const orgRow = await organizationsRepo.findOrganizationById(pool, org.id);
  const branchRow = await branchesRepo.findBranchByIdForPlatform(pool, branch.id);

  return {
    packageCode: "foundation",
    suffix,
    password: DEFAULT_PASSWORD,
    passwordHash,
    organization: orgRow,
    branch: branchRow,
    branchAdmin,
    hqAdmin,
    ctx: {
      kind: "branch",
      organization: orgRow,
      branch: branchRow,
      hostSlug: branchRow.host_slug,
    },
  };
}

/**
 * Growth tenant: two active branches + admins (finance HQ optional).
 */
async function createGrowthSmokeTenant(pool, opts = {}) {
  const suffix = opts.suffix || makeSuffix("growth");
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  const org = await organizationsRepo.createOrganization(pool, {
    platform_tenant_id: TENANT_ZM,
    slug: slugSegment(`growth-${suffix}`, 40),
    name: opts.name || `Growth Smoke ${suffix}`,
  });
  await organizationsRepo.updateOrganizationPlan(
    pool,
    org.id,
    { plan_code: "growth", plan_status: "active", plan_notes: "pilot-smoke" },
    null
  );
  await pool.query(
    `UPDATE public.church_organizations
     SET status = 'active', timezone = 'Africa/Lusaka'
     WHERE id = $1`,
    [org.id]
  );

  const branchA = await branchesRepo.createBranch(pool, {
    organization_id: org.id,
    slug: slugSegment(`a-${suffix}`),
    host_slug: slugSegment(`a-${suffix}`),
    name: "Campus A",
    status: "active",
    member_registration_enabled: true,
  });
  const branchB = await branchesRepo.createBranch(pool, {
    organization_id: org.id,
    slug: slugSegment(`b-${suffix}`),
    host_slug: slugSegment(`b-${suffix}`),
    name: "Campus B",
    status: "active",
    member_registration_enabled: true,
  });

  const branchAdmin = await createBranchAdmin(pool, org, branchA, {
    suffix: `${suffix}a`,
    passwordHash,
  });
  const hqAdmin = await createHqAdmin(pool, org, {
    suffix,
    passwordHash,
    canViewFinance: true,
  });

  const orgRow = await organizationsRepo.findOrganizationById(pool, org.id);
  const branchARow = await branchesRepo.findBranchByIdForPlatform(pool, branchA.id);
  const branchBRow = await branchesRepo.findBranchByIdForPlatform(pool, branchB.id);

  return {
    packageCode: "growth",
    suffix,
    password: DEFAULT_PASSWORD,
    passwordHash,
    organization: orgRow,
    branch: branchARow,
    branchA: branchARow,
    branchB: branchBRow,
    branchAdmin,
    hqAdmin,
    ctx: {
      kind: "branch",
      organization: orgRow,
      branch: branchARow,
      hostSlug: branchARow.host_slug,
    },
    hqCtx: {
      kind: "branch",
      organization: orgRow,
      branch: branchARow,
      hostSlug: branchARow.host_slug,
    },
  };
}

async function createVerifiedMember(pool, org, branch, opts = {}) {
  const suffix = opts.suffix || makeSuffix("mem");
  const passwordHash = opts.passwordHash || (await bcrypt.hash(DEFAULT_PASSWORD, 12));
  const pending = await membersRepo.createPendingMember(pool, {
    organization_id: org.id,
    branch_id: branch.id,
    platform_tenant_id: TENANT_ZM,
    email: opts.email || `mem_${suffix}@example.com`,
    phone: opts.phone || "0977111222",
    full_name: opts.fullName || "Smoke Member",
    password_hash: passwordHash,
    gender: "female",
    age_group: "Adult (36-60)",
    address_area: "Kafue",
    attendance_duration: "Less than 6 months",
  });
  const verified = await membersRepo.verifyMemberForBranch(
    pool,
    pending.id,
    branch.id,
    opts.verifiedByAdminId || null
  );
  return { ...(verified || pending), password: DEFAULT_PASSWORD, passwordHash };
}

async function seedVerifiedMembers(pool, opts) {
  const status = opts.status || "verified";
  await pool.query(
    `INSERT INTO public.church_members (
       organization_id, branch_id, platform_tenant_id,
       full_name, email, phone, phone_normalized, password_hash, status
     )
     SELECT $1, $2, $3,
            'Seat Member ' || g,
            $4 || g || '@example.com',
            '',
            '',
            'hash',
            $5
     FROM generate_series(1, $6) AS g`,
    [opts.organizationId, opts.branchId, TENANT_ZM, opts.emailPrefix, status, opts.count]
  );
}

async function loginBranchAdmin(app, tenant, agent) {
  const a = agent || request.agent(app);
  const page = await a.get("/branch/login");
  const csrf = extractCsrf(page.text);
  const res = await a.post("/branch/login").type("form").send({
    [CSRF_FIELD]: csrf || undefined,
    identifier: tenant.branchAdmin.email,
    password: tenant.password,
  });
  return { agent: a, login: res };
}

async function loginHqAdmin(app, tenant, agent) {
  const a = agent || request.agent(app);
  const page = await a.get("/hq/login");
  const csrf = extractCsrf(page.text);
  const res = await a.post("/hq/login").type("form").send({
    [CSRF_FIELD]: csrf || undefined,
    identifier: tenant.hqAdmin.email,
    password: tenant.password,
  });
  return { agent: a, login: res };
}

async function loginMember(app, member, agent) {
  const a = agent || request.agent(app);
  const page = await a.get("/login");
  const csrf = extractCsrf(page.text);
  const res = await a.post("/login").type("form").send({
    [CSRF_FIELD]: csrf || undefined,
    identifier: member.email,
    password: member.password || DEFAULT_PASSWORD,
  });
  return { agent: a, login: res };
}

async function postWithCsrf(agent, getPath, postPath, body) {
  const page = await agent.get(getPath);
  const csrf = extractCsrf(page.text);
  return agent
    .post(postPath)
    .type("form")
    .send({
      ...(body || {}),
      [CSRF_FIELD]: csrf || "",
    });
}

/** Service-layer actor context shared by Growth feature helpers. */
function serviceActorCtx(org, branch, admin, extras = {}) {
  return {
    organization_id: org.id,
    branch_id: branch.id,
    platform_tenant_id: org.platform_tenant_id,
    admin_id: admin.id,
    can_access_pastoral: admin.can_access_pastoral === true,
    can_supervise_pastoral: admin.can_supervise_pastoral === true,
    can_view_finance: admin.can_view_finance === true,
    ...extras,
  };
}

async function setBranchAdminFlags(pool, adminId, flags = {}) {
  const sets = [];
  const vals = [adminId];
  let i = 2;
  if (flags.can_access_pastoral != null) {
    sets.push(`can_access_pastoral = $${i++}`);
    vals.push(Boolean(flags.can_access_pastoral));
  }
  if (flags.can_supervise_pastoral != null) {
    sets.push(`can_supervise_pastoral = $${i++}`);
    vals.push(Boolean(flags.can_supervise_pastoral));
  }
  if (flags.can_view_finance != null) {
    sets.push(`can_view_finance = $${i++}`);
    vals.push(Boolean(flags.can_view_finance));
  }
  if (!sets.length) return;
  await pool.query(
    `UPDATE public.church_branch_admins SET ${sets.join(", ")} WHERE id = $1`,
    vals
  );
}

async function setHqAdminFlags(pool, adminId, flags = {}) {
  if (flags.can_view_finance != null) {
    await pool.query(`UPDATE public.church_hq_admins SET can_view_finance = $2 WHERE id = $1`, [
      adminId,
      Boolean(flags.can_view_finance),
    ]);
  }
}

module.exports = {
  CSRF_FIELD,
  DEFAULT_PASSWORD,
  TENANT_ZM,
  makeSuffix,
  slugSegment,
  extractCsrf,
  makeInjectedChurchApp,
  bootstrapPilotSmokeDb,
  cleanupPilotOrganization,
  createFoundationSmokeTenant,
  createGrowthSmokeTenant,
  createVerifiedMember,
  seedVerifiedMembers,
  loginBranchAdmin,
  loginHqAdmin,
  loginMember,
  postWithCsrf,
  serviceActorCtx,
  setBranchAdminFlags,
  setHqAdminFlags,
};
