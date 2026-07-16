"use strict";

const bcrypt = require("bcryptjs");
const auditLogsRepo = require("./auditLogsRepo");
const organizationsRepo = require("./organizationsRepo");
const branchesRepo = require("./branchesRepo");
const branchAdminsRepo = require("./branchAdminsRepo");
const hqAdminsRepo = require("./hqAdminsRepo");
const churchPlanService = require("../../../services/church/churchPlanService");
const { buildUsageWarnings, normalizePlanCode, getPlanLimit, formatLimitValue, canCreateAdditionalBranch } = require("../../../church/churchPlans");
const { normalizeSlug } = require("../../../church/platformProvisioningValidation");
const { onboardNewBranchContent } = require("../../../services/church/branchOnboardingService");
const {
  resolveCreateBranchLifecycle,
  activateBranch,
  FOUNDATION_SECOND_ACTIVE_ERROR,
} = require("../../../services/church/branchActivationPolicyService");
const { resolvePackageFromPlanCode } = require("../../../church/blessBoardPackageCatalogue");
const seatQuota = require("../../../services/church/churchSeatQuotaService");

async function checkOrganizationSlugAvailable(pool, slug, client) {
  const db = client || pool;
  const s = normalizeSlug(slug);
  if (!s) return false;
  const r = await db.query(`SELECT 1 FROM public.church_organizations WHERE slug = $1 LIMIT 1`, [s]);
  return r.rows.length === 0;
}

async function checkOrganizationSlugAvailableForUpdate(pool, slug, excludeOrganizationId) {
  return organizationsRepo.checkOrganizationSlugAvailableForUpdate(pool, slug, excludeOrganizationId);
}

async function checkBranchHostSlugAvailable(pool, slug, client) {
  const db = client || pool;
  return branchesRepo.isBranchHostSlugAvailable(db, slug);
}

async function findChurchOrganizationById(pool, organizationId) {
  const r = await pool.query(`SELECT * FROM public.church_organizations WHERE id = $1 LIMIT 1`, [
    organizationId,
  ]);
  return r.rows[0] ?? null;
}

async function findOrganizationByIdForPlatform(pool, organizationId) {
  return organizationsRepo.findOrganizationByIdForPlatform(pool, organizationId);
}

async function findChurchOrganizationBySlug(pool, slug) {
  const s = normalizeSlug(slug);
  if (!s) return null;
  const r = await pool.query(`SELECT * FROM public.church_organizations WHERE slug = $1 LIMIT 1`, [s]);
  return r.rows[0] ?? null;
}

async function listChurchOrganizations(pool, opts = {}) {
  const q = String(opts.q || "").trim().toLowerCase();
  const status = String(opts.status || "all").trim().toLowerCase();
  const params = [];
  const clauses = [];
  if (q) {
    params.push(`%${q}%`);
    clauses.push(
      `(lower(o.name) LIKE $${params.length} OR lower(o.slug) LIKE $${params.length} OR lower(COALESCE(o.country, '')) LIKE $${params.length})`
    );
  }
  if (status && status !== "all") {
    params.push(status);
    clauses.push(`o.status = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const r = await pool.query(
    `SELECT o.*,
            COUNT(DISTINCT b.id)::int AS branch_count,
            COUNT(DISTINCT ha.id) FILTER (WHERE ha.status = 'active')::int AS hq_admin_count,
            (
              SELECT ha2.full_name
              FROM public.church_hq_admins ha2
              WHERE ha2.organization_id = o.id AND ha2.status = 'active'
              ORDER BY ha2.id ASC
              LIMIT 1
            ) AS hq_admin_name,
            COUNT(DISTINCT m.id) FILTER (WHERE m.status = 'verified')::int AS verified_member_count
     FROM public.church_organizations o
     LEFT JOIN public.church_branches b ON b.organization_id = o.id
     LEFT JOIN public.church_hq_admins ha ON ha.organization_id = o.id
     LEFT JOIN public.church_members m ON m.organization_id = o.id
     ${where}
     GROUP BY o.id
     ORDER BY o.created_at DESC, o.id DESC`,
    params
  );
  return r.rows;
}

async function listChurchBranches(pool, opts = {}) {
  const q = String(opts.q || "").trim().toLowerCase();
  const status = String(opts.status || "all").trim().toLowerCase();
  const params = [];
  const clauses = [];
  if (q) {
    params.push(`%${q}%`);
    clauses.push(
      `(lower(b.name) LIKE $${params.length} OR lower(b.slug) LIKE $${params.length} OR lower(COALESCE(b.host_slug, b.slug)) LIKE $${params.length} OR lower(o.slug) LIKE $${params.length} OR lower(COALESCE(b.city, '')) LIKE $${params.length})`
    );
  }
  if (status && status !== "all") {
    params.push(status);
    clauses.push(`b.status = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const r = await pool.query(
    `SELECT b.*,
            o.name AS organization_name,
            o.slug AS organization_slug,
            o.plan_code,
            COALESCE(NULLIF(trim(b.host_slug), ''), b.slug) AS branch_host_slug,
            ba.full_name AS branch_admin_name,
            ba.email AS branch_admin_email,
            COUNT(m.id) FILTER (WHERE m.status = 'verified')::int AS verified_member_count
     FROM public.church_branches b
     INNER JOIN public.church_organizations o ON o.id = b.organization_id
     LEFT JOIN public.church_branch_admins ba
       ON ba.branch_id = b.id AND ba.status = 'active'
     LEFT JOIN public.church_members m ON m.branch_id = b.id
     ${where}
     GROUP BY b.id, o.id, ba.id
     ORDER BY b.created_at DESC, b.id DESC`,
    params
  );
  return r.rows;
}

async function findChurchBranchById(pool, branchId) {
  const r = await pool.query(
    `SELECT b.*,
            o.name AS organization_name,
            o.slug AS organization_slug,
            o.plan_code,
            o.status AS organization_status,
            ba.full_name AS branch_admin_name,
            ba.email AS branch_admin_email,
            ba.phone AS branch_admin_phone,
            COUNT(m.id) FILTER (WHERE m.status = 'verified')::int AS verified_member_count,
            COUNT(m.id) FILTER (WHERE m.status = 'pending')::int AS pending_member_count,
            lr.status AS latest_report_status,
            lr.period_year AS latest_report_year,
            lr.period_month AS latest_report_month,
            COALESCE(NULLIF(trim(b.host_slug), ''), b.slug) AS branch_host_slug
     FROM public.church_branches b
     INNER JOIN public.church_organizations o ON o.id = b.organization_id
     LEFT JOIN public.church_branch_admins ba
       ON ba.branch_id = b.id AND ba.status = 'active'
     LEFT JOIN public.church_members m ON m.branch_id = b.id
     LEFT JOIN LATERAL (
       SELECT status, period_year, period_month
       FROM public.church_monthly_reports mr
       WHERE mr.branch_id = b.id
       ORDER BY mr.period_year DESC, mr.period_month DESC, mr.id DESC
       LIMIT 1
     ) lr ON true
     WHERE b.id = $1
     GROUP BY b.id, o.id, ba.id, lr.status, lr.period_year, lr.period_month
     LIMIT 1`,
    [branchId]
  );
  return r.rows[0] ?? null;
}

async function getOrganizationDetail(pool, organizationId) {
  const org = await findChurchOrganizationById(pool, organizationId);
  if (!org) return null;
  const [branches, hqAdmins] = await Promise.all([
    branchesRepo.listBranchesForOrganization(pool, organizationId),
    pool.query(
      `SELECT id, full_name, email, phone, status, created_at
       FROM public.church_hq_admins
       WHERE organization_id = $1
       ORDER BY id ASC`,
      [organizationId]
    ),
  ]);
  return {
    organization: org,
    branches,
    hqAdmins: hqAdmins.rows,
  };
}

async function getOrganizationPlatformDetail(pool, organizationId) {
  const detail = await getOrganizationDetail(pool, organizationId);
  if (!detail) return null;
  const [usage, planSummary] = await Promise.all([
    getOrganizationUsageSummary(pool, organizationId),
    getOrganizationPlanSummary(pool, organizationId),
  ]);
  return {
    ...detail,
    usage,
    planSummary,
  };
}

async function listOrganizationsWithPlanSummary(pool, opts = {}) {
  const rows = await listChurchOrganizations(pool, opts);
  return rows.map((row) => {
    const planCode = normalizePlanCode(row.plan_code);
    const usage = {
      branches_count: row.branch_count || 0,
      active_members_count: row.verified_member_count || 0,
      total_members_count: row.verified_member_count || 0,
    };
    const warnings = buildUsageWarnings(planCode, usage);
    const maxBranches = getPlanLimit(planCode, "max_branches");
    const maxMembers = getPlanLimit(planCode, "max_members");
    return {
      ...row,
      plan_code: planCode,
      usage_branches_display: `${usage.branches_count}/${formatLimitValue(maxBranches)}`,
      usage_members_display: `${usage.active_members_count}/${formatLimitValue(maxMembers)}`,
      limitWarnings: warnings,
      limitBadge: warnings.some((w) => w.level === "limit")
        ? "At limit"
        : warnings.some((w) => w.level === "warning")
          ? "Near limit"
          : null,
    };
  });
}

async function getOrganizationUsageSummary(pool, organizationId) {
  return churchPlanService.getOrganizationUsageSummary(pool, organizationId);
}

async function getOrganizationPlanSummary(pool, organizationId) {
  return churchPlanService.getOrganizationPlanSummary(pool, organizationId);
}

async function updateOrganizationPlan(pool, organizationId, fields, platformAdminId) {
  return organizationsRepo.updateOrganizationPlan(pool, organizationId, fields, platformAdminId);
}

async function getProvisioningSummary(pool) {
  const r = await pool.query(
    `SELECT
       COUNT(*)::int AS total_organizations,
       COUNT(*) FILTER (WHERE status = 'active')::int AS active_organizations,
       COUNT(*) FILTER (WHERE data_environment = 'production')::int AS production_organizations,
       COUNT(*) FILTER (WHERE data_environment = 'pilot')::int AS pilot_organizations,
       COUNT(*) FILTER (WHERE data_environment = 'demo')::int AS demo_organizations,
       COUNT(*) FILTER (WHERE data_environment = 'test')::int AS test_organizations,
       COUNT(*) FILTER (WHERE plan_code = 'free' AND data_environment IN ('production', 'pilot'))::int AS free_plan_count,
       COUNT(*) FILTER (WHERE plan_code = 'standard' AND data_environment IN ('production', 'pilot'))::int AS standard_plan_count,
       COUNT(*) FILTER (WHERE plan_code = 'pro' AND data_environment IN ('production', 'pilot'))::int AS pro_plan_count
     FROM public.church_organizations`
  );
  const branches = await pool.query(
    `SELECT
       COUNT(*)::int AS total_branches,
       COUNT(*) FILTER (WHERE status = 'active')::int AS active_branches,
       COUNT(*) FILTER (
         WHERE status = 'active'
           AND organization_id IN (
             SELECT id FROM public.church_organizations
             WHERE data_environment IN ('production', 'pilot')
           )
       )::int AS production_active_branches
     FROM public.church_branches`
  );
  const recent = await pool.query(
    `SELECT id, name, slug, country, plan_code, status, data_environment, created_at
     FROM public.church_organizations
     ORDER BY created_at DESC, id DESC
     LIMIT 8`
  );
  const usageRows = await pool.query(
    `SELECT o.id, o.name, o.slug, o.plan_code, o.data_environment,
            COUNT(DISTINCT b.id)::int AS branch_count,
            COUNT(m.id) FILTER (WHERE m.status = 'verified')::int AS verified_member_count
     FROM public.church_organizations o
     LEFT JOIN public.church_branches b ON b.organization_id = o.id
     LEFT JOIN public.church_members m ON m.organization_id = o.id
     WHERE o.data_environment IN ('production', 'pilot')
     GROUP BY o.id
     ORDER BY o.name ASC`
  );
  const nearMemberLimit = [];
  const atBranchLimit = [];
  for (const row of usageRows.rows) {
    const planCode = normalizePlanCode(row.plan_code);
    const usage = {
      branches_count: row.branch_count,
      active_members_count: row.verified_member_count,
    };
    const warnings = buildUsageWarnings(planCode, usage);
    if (warnings.some((w) => w.code === "member_near_limit" || w.code === "member_limit")) {
      nearMemberLimit.push({ ...row, warnings });
    }
    if (warnings.some((w) => w.code === "branch_limit")) {
      atBranchLimit.push({ ...row, warnings });
    }
  }
  return {
    ...r.rows[0],
    ...branches.rows[0],
    recentOrganizations: recent.rows,
    nearMemberLimitOrganizations: nearMemberLimit.slice(0, 8),
    atBranchLimitOrganizations: atBranchLimit.slice(0, 8),
  };
}

async function createChurchBranch(client, fields) {
  const hostSlug = String(fields.host_slug || fields.slug || "")
    .toLowerCase()
    .trim();
  const slug = String(fields.slug || hostSlug)
    .toLowerCase()
    .trim();
  const status = fields.status || "active";
  const lifecyclePhase =
    fields.lifecycle_phase ||
    (status === "active" ? "active" : status === "archived" ? "archived" : "draft");
  const r = await client.query(
    `INSERT INTO public.church_branches (
       organization_id, slug, host_slug, name, status, lifecycle_phase, billing_ready, city, country,
       pastor_name, contact_phone, contact_email, welcome_message, service_times, location_text,
       member_registration_enabled
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING *`,
    [
      fields.organization_id,
      slug,
      hostSlug,
      fields.name,
      status,
      lifecyclePhase,
      fields.billing_ready === true,
      fields.city,
      fields.country,
      fields.pastor_name,
      fields.contact_phone,
      fields.contact_email,
      fields.welcome_message || null,
      fields.service_times || null,
      fields.location_text || null,
      fields.member_registration_enabled !== false,
    ]
  );
  return r.rows[0];
}

async function recordPlatformAudit(client, entry) {
  await auditLogsRepo.insertAuditLog(client, entry);
}

async function provisionChurchOrganization(pool, payload, platformAdminId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const orgSlug = payload.organization.slug;
    const hostSlug = payload.branch.host_slug || payload.branch.slug;

    const orgAvailable = await checkOrganizationSlugAvailable(pool, orgSlug, client);
    if (!orgAvailable) {
      throw Object.assign(new Error("Organization slug is already in use."), { code: "DUPLICATE_ORG_SLUG" });
    }
    const hostAvailable = await checkBranchHostSlugAvailable(pool, hostSlug, client);
    if (!hostAvailable) {
      throw Object.assign(new Error("Branch host slug is already in use."), { code: "DUPLICATE_HOST_SLUG" });
    }

    const orgResult = await client.query(
      `INSERT INTO public.church_organizations (
         platform_tenant_id, slug, name, status, country, city,
         primary_contact_name, primary_contact_phone, primary_contact_email,
         plan_code, created_by_platform_admin_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        payload.platform_tenant_id,
        orgSlug,
        payload.organization.name,
        payload.organization.status || "active",
        payload.organization.country,
        payload.organization.city,
        payload.organization.primary_contact_name,
        payload.organization.primary_contact_phone,
        payload.organization.primary_contact_email,
        payload.organization.plan_code || "free",
        platformAdminId || null,
      ]
    );
    const organization = orgResult.rows[0];

    const branch = await createChurchBranch(client, {
      organization_id: organization.id,
      slug: payload.branch.slug,
      host_slug: hostSlug,
      name: payload.branch.name,
      status: payload.branch.status || "active",
      city: payload.branch.city,
      country: payload.branch.country,
      pastor_name: payload.branch.pastor_name,
      contact_phone: payload.branch.contact_phone,
      contact_email: payload.branch.contact_email,
    });

    await seatQuota.assertCanAssignPrivilegedRoleLocked(client, {
      organizationId: organization.id,
      actorType: "platform_admin",
      actorId: platformAdminId || null,
      reason: "initial_hq_admin",
    });
    const hqPasswordHash = await bcrypt.hash(payload.hqAdmin.temporary_password, 12);
    const hqAdmin = await createInitialHqAdmin(client, {
      organization_id: organization.id,
      ...payload.hqAdmin,
      password_hash: hqPasswordHash,
    });

    await seatQuota.assertCanAssignPrivilegedRoleLocked(client, {
      organizationId: organization.id,
      actorType: "platform_admin",
      actorId: platformAdminId || null,
      reason: "initial_branch_admin",
    });
    const branchPasswordHash = await bcrypt.hash(payload.branchAdmin.temporary_password, 12);
    const branchAdmin = await createInitialBranchAdmin(client, {
      organization_id: organization.id,
      branch_id: branch.id,
      ...payload.branchAdmin,
      password_hash: branchPasswordHash,
    });

    await recordPlatformAudit(client, {
      organization_id: organization.id,
      branch_id: branch.id,
      actor_type: "platform_admin",
      actor_id: platformAdminId || null,
      action: "platform_church_organization_created",
      entity_type: "church_organization",
      entity_id: organization.id,
      target_label: organization.name,
      metadata_json: { slug: organization.slug, plan_code: organization.plan_code },
    });
    await recordPlatformAudit(client, {
      organization_id: organization.id,
      branch_id: branch.id,
      actor_type: "platform_admin",
      actor_id: platformAdminId || null,
      action: "platform_church_branch_created",
      entity_type: "church_branch",
      entity_id: branch.id,
      target_label: branch.name,
      metadata_json: { slug: branch.slug, host_slug: hostSlug },
    });
    await recordPlatformAudit(client, {
      organization_id: organization.id,
      branch_id: branch.id,
      actor_type: "platform_admin",
      actor_id: platformAdminId || null,
      action: "platform_church_hq_admin_created",
      entity_type: "church_hq_admin",
      entity_id: hqAdmin.id,
      target_label: hqAdmin.full_name,
      metadata_json: { email: hqAdmin.email || null },
    });
    await recordPlatformAudit(client, {
      organization_id: organization.id,
      branch_id: branch.id,
      actor_type: "platform_admin",
      actor_id: platformAdminId || null,
      action: "platform_church_branch_admin_created",
      entity_type: "church_branch_admin",
      entity_id: branchAdmin.id,
      target_label: branchAdmin.full_name,
      metadata_json: { email: branchAdmin.email || null },
    });

    const onboarding = payload.onboarding || { publishWebsite: true, memberRegistrationEnabled: true };
    try {
      await onboardNewBranchContent(client, organization, branch, {
        publishWebsite: onboarding.publishWebsite !== false,
        includeDraftStarters: true,
      });
    } catch (onboardingErr) {
      onboardingErr.code = onboardingErr.code || "ONBOARDING_CONTENT_FAILED";
      throw onboardingErr;
    }

    await client.query("COMMIT");
    return { organization, branch, hqAdmin, branchAdmin };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function createInitialHqAdmin(client, fields) {
  const email = String(fields.email || "").trim().toLowerCase();
  const phone = String(fields.phone || "").trim();
  const phoneNorm = phone.replace(/\D/g, "");
  const fullName = String(fields.full_name || "").trim();
  const username = String(fields.username || email || phoneNorm).trim().toLowerCase();
  const r = await client.query(
    `INSERT INTO public.church_hq_admins (
       organization_id, username, password_hash, display_name, full_name,
       email, phone, phone_normalized, role, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'hq_admin', 'active')
     RETURNING id, organization_id, full_name, email, phone, username, status, created_at`,
    [
      fields.organization_id,
      username,
      fields.password_hash,
      fullName,
      fullName,
      email,
      phone,
      phoneNorm,
    ]
  );
  return r.rows[0];
}

async function createInitialBranchAdmin(client, fields) {
  const email = String(fields.email || "").trim().toLowerCase();
  const phone = String(fields.phone || "").trim();
  const phoneNorm = phone.replace(/\D/g, "");
  const fullName = String(fields.full_name || "").trim();
  const username = String(fields.username || fields.email || phoneNorm).trim().toLowerCase();
  const r = await client.query(
    `INSERT INTO public.church_branch_admins (
       organization_id, branch_id, username, password_hash, display_name, full_name,
       email, phone, phone_normalized, role, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'branch_admin', 'active')
     RETURNING id, organization_id, branch_id, full_name, email, phone, username, status, created_at`,
    [
      fields.organization_id,
      fields.branch_id,
      username,
      fields.password_hash,
      fullName,
      fullName,
      email,
      phone,
      phoneNorm,
    ]
  );
  return r.rows[0];
}

function branchLimitError(planCode, check) {
  const pkg = resolvePackageFromPlanCode(planCode);
  if (pkg.packageCode === "foundation") {
    return FOUNDATION_SECOND_ACTIVE_ERROR;
  }
  if (planCode === "free") {
    return "Free plan allows only 1 branch. Change the organization plan before adding another branch.";
  }
  return check.reason || "Branch limit reached for this plan. Change the organization plan before adding another branch.";
}

async function assertOrganizationCanAddBranch(pool, organization) {
  // Foundation/Growth: additional branch *rows* are allowed (non-active / fair use).
  // Active-branch caps are enforced at activation time via branchActivationPolicyService.
  const pkg = resolvePackageFromPlanCode(organization.plan_code);
  if (pkg.packageCode === "foundation" || pkg.packageCode === "growth") {
    const count = await branchesRepo.countBranchesForOrganization(pool, organization.id);
    return { count, planCode: normalizePlanCode(organization.plan_code), packageCode: pkg.packageCode };
  }

  const count = await branchesRepo.countBranchesForOrganization(pool, organization.id);
  const planCode = normalizePlanCode(organization.plan_code);
  const check = canCreateAdditionalBranch(planCode, count);
  if (!check.allowed) {
    throw Object.assign(new Error(branchLimitError(planCode, check)), { code: "PLAN_BRANCH_LIMIT" });
  }
  return { count, planCode };
}

async function createBranchForOrganization(pool, organizationId, payload, platformAdminId) {
  const organization = await findChurchOrganizationById(pool, organizationId);
  if (!organization) {
    throw Object.assign(new Error("Organization not found."), { code: "NOT_FOUND" });
  }

  await assertOrganizationCanAddBranch(pool, organization);

  const hostSlug = payload.branch.host_slug || payload.branch.slug;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const hostAvailable = await checkBranchHostSlugAvailable(pool, hostSlug, client);
    if (!hostAvailable) {
      throw Object.assign(new Error("Branch host slug is already in use."), { code: "DUPLICATE_HOST_SLUG" });
    }

    const lifecycle = await resolveCreateBranchLifecycle(client, organization, {
      preferActive: payload.branch && payload.branch.status !== "suspended",
    });

    const branch = await createChurchBranch(client, {
      organization_id: organization.id,
      ...payload.branch,
      host_slug: hostSlug,
      status: lifecycle.status,
      lifecycle_phase: lifecycle.lifecycle_phase,
      billing_ready: false,
    });

    await seatQuota.assertCanAssignPrivilegedRoleLocked(client, {
      organizationId: organization.id,
      actorType: "platform_admin",
      actorId: platformAdminId || null,
      reason: "create_branch_initial_admin",
    });
    const branchPasswordHash = await bcrypt.hash(payload.branchAdmin.temporary_password, 12);
    const branchAdmin = await createInitialBranchAdminForBranch(client, {
      organization_id: organization.id,
      branch_id: branch.id,
      ...payload.branchAdmin,
      password_hash: branchPasswordHash,
    });

    await recordPlatformAudit(client, {
      organization_id: organization.id,
      branch_id: branch.id,
      actor_type: "platform_admin",
      actor_id: platformAdminId || null,
      action: "platform_church_branch_created",
      entity_type: "church_branch",
      entity_id: branch.id,
      target_label: branch.name,
      metadata_json: {
        slug: branch.slug,
        host_slug: hostSlug,
        status: branch.status,
        lifecycle_phase: lifecycle.lifecycle_phase,
        package_code: lifecycle.packageCode,
        created_as_active: lifecycle.createdAsActive,
        defer_reason: lifecycle.deferReason || null,
      },
    });
    await recordPlatformAudit(client, {
      organization_id: organization.id,
      branch_id: branch.id,
      actor_type: "platform_admin",
      actor_id: platformAdminId || null,
      action: "platform_church_branch_admin_created",
      entity_type: "church_branch_admin",
      entity_id: branchAdmin.id,
      target_label: branchAdmin.full_name,
      metadata_json: { email: branchAdmin.email || null },
    });

    const onboarding = payload.onboarding || { publishWebsite: true, memberRegistrationEnabled: true };
    try {
      await onboardNewBranchContent(client, organization, branch, {
        publishWebsite: onboarding.publishWebsite !== false && lifecycle.createdAsActive,
        includeDraftStarters: true,
      });
    } catch (onboardingErr) {
      onboardingErr.code = onboardingErr.code || "ONBOARDING_CONTENT_FAILED";
      throw onboardingErr;
    }

    await client.query("COMMIT");
    return {
      organization,
      branch,
      branchAdmin,
      createdAsActive: lifecycle.createdAsActive,
      deferReason: lifecycle.deferReason || null,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function createInitialBranchAdminForBranch(client, fields) {
  return createInitialBranchAdmin(client, fields);
}

async function countBranchesForOrganization(pool, organizationId) {
  return branchesRepo.countBranchesForOrganization(pool, organizationId);
}

async function listBranchesForOrganization(pool, organizationId) {
  return branchesRepo.listBranchesForOrganization(pool, organizationId);
}

async function getBranchProvisioningSummary(pool, branchId) {
  const branch = await findChurchBranchById(pool, branchId);
  if (!branch) return null;
  const planSummary = await getOrganizationPlanSummary(pool, branch.organization_id);
  const hostSlug = branchesRepo.branchHostSlug(branch);
  return {
    branch,
    planSummary,
    branchHostSlug: hostSlug,
  };
}

async function listOrganizationsWithStatusSummary(pool, opts = {}) {
  return listOrganizationsWithPlanSummary(pool, opts);
}

async function listBranchesWithStatusSummary(pool, opts = {}) {
  return listChurchBranches(pool, opts);
}

async function suspendOrganization(pool, organizationId, payload) {
  return organizationsRepo.suspendOrganization(pool, organizationId, payload);
}

async function reactivateOrganization(pool, organizationId, payload) {
  return organizationsRepo.reactivateOrganization(pool, organizationId, payload);
}

async function archiveOrganization(pool, organizationId, payload) {
  return organizationsRepo.archiveOrganization(pool, organizationId, payload);
}

async function updateOrganizationStatus(pool, organizationId, newStatus, payload) {
  return organizationsRepo.updateOrganizationStatus(pool, organizationId, newStatus, payload);
}

async function suspendBranch(pool, branchId, payload) {
  return branchesRepo.suspendBranch(pool, branchId, payload);
}

async function reactivateBranch(pool, branchId, payload) {
  const result = await activateBranch(pool, branchId, {
    reason: payload && payload.reason,
    platformAdminId: payload && payload.platformAdminId,
    billingAcknowledged: payload && payload.billingAcknowledged === true,
  });
  return result.branch;
}

async function archiveBranch(pool, branchId, payload) {
  return branchesRepo.archiveBranch(pool, branchId, payload);
}

async function updateBranchStatus(pool, branchId, newStatus, payload) {
  return branchesRepo.updateBranchStatus(pool, branchId, newStatus, payload);
}

async function findBranchByIdForPlatform(pool, branchId) {
  return branchesRepo.findBranchByIdForPlatform(pool, branchId);
}

async function checkBranchHostSlugAvailableForUpdate(pool, hostSlug, excludeBranchId) {
  return branchesRepo.checkBranchHostSlugAvailableForUpdate(pool, hostSlug, excludeBranchId);
}

async function getBranchAdminSummaryForBranch(pool, branchId) {
  return branchesRepo.getBranchAdminSummaryForBranch(pool, branchId);
}

async function getBranchUsageSummaryForBranch(pool, branchId) {
  return branchesRepo.getBranchUsageSummaryForBranch(pool, branchId);
}

async function updateBranchMetadataForPlatform(pool, branchId, fields, platformAdminId) {
  return branchesRepo.updateBranchMetadataForPlatform(pool, branchId, fields, platformAdminId);
}

async function updateOrganizationMetadataForPlatform(pool, organizationId, fields, platformAdminId) {
  return organizationsRepo.updateOrganizationMetadataForPlatform(pool, organizationId, fields, platformAdminId);
}

async function getBranchPlatformDetail(pool, branchId) {
  const branch = await findChurchBranchById(pool, branchId);
  if (!branch) return null;
  const [branchAdmin, usage, activeAdminCount] = await Promise.all([
    getBranchAdminSummaryForBranch(pool, branchId),
    getBranchUsageSummaryForBranch(pool, branchId),
    branchAdminsRepo.countActiveBranchAdminsForBranch(pool, branchId),
  ]);
  return {
    branch,
    branchHostSlug: branchesRepo.branchHostSlug(branch),
    branchAdmin,
    usage,
    activeAdminCount,
  };
}

async function listBranchAdminsForBranch(pool, branchId) {
  return branchAdminsRepo.listBranchAdminsForBranch(pool, branchId);
}

async function findBranchAdminByIdForPlatform(pool, adminId, branchId) {
  return branchAdminsRepo.findBranchAdminByIdForPlatform(pool, adminId, branchId);
}

async function createBranchAdminForPlatform(pool, branchId, fields, platformAdminId) {
  return branchAdminsRepo.createBranchAdminForPlatform(pool, branchId, fields, platformAdminId);
}

async function updateBranchAdminForPlatform(pool, adminId, branchId, fields, platformAdminId) {
  return branchAdminsRepo.updateBranchAdminForPlatform(pool, adminId, branchId, fields, platformAdminId);
}

async function activateBranchAdminForPlatform(pool, adminId, branchId, platformAdminId, opts = {}) {
  return branchAdminsRepo.activateBranchAdminForPlatform(pool, adminId, branchId, platformAdminId, opts);
}

async function deactivateBranchAdminForPlatform(pool, adminId, branchId, platformAdminId, opts = {}) {
  return branchAdminsRepo.deactivateBranchAdminForPlatform(pool, adminId, branchId, platformAdminId, opts);
}

async function resetBranchAdminPasswordForPlatform(pool, adminId, branchId, passwordHash, platformAdminId) {
  return branchAdminsRepo.resetBranchAdminPasswordForPlatform(
    pool,
    adminId,
    branchId,
    passwordHash,
    platformAdminId
  );
}

async function checkBranchAdminLoginConflictForBranch(pool, branchId, opts) {
  return branchAdminsRepo.checkBranchAdminLoginConflictForBranch(pool, branchId, opts);
}

async function countActiveBranchAdminsForBranch(pool, branchId) {
  return branchAdminsRepo.countActiveBranchAdminsForBranch(pool, branchId);
}

async function getExampleBranchHostSlugForOrganization(pool, organizationId) {
  const r = await pool.query(
    `SELECT COALESCE(NULLIF(trim(host_slug), ''), slug) AS host_slug
     FROM public.church_branches
     WHERE organization_id = $1
     ORDER BY (CASE WHEN status = 'active' THEN 0 ELSE 1 END), id ASC
     LIMIT 1`,
    [organizationId]
  );
  return r.rows[0] ? r.rows[0].host_slug : null;
}

async function listHqAdminsForOrganization(pool, organizationId) {
  return hqAdminsRepo.listHqAdminsForOrganization(pool, organizationId);
}

async function findHqAdminByIdForPlatform(pool, adminId, organizationId) {
  return hqAdminsRepo.findHqAdminByIdForPlatform(pool, adminId, organizationId);
}

async function createHqAdminForPlatform(pool, organizationId, fields, platformAdminId) {
  return hqAdminsRepo.createHqAdminForPlatform(pool, organizationId, fields, platformAdminId);
}

async function updateHqAdminForPlatform(pool, adminId, organizationId, fields, platformAdminId) {
  return hqAdminsRepo.updateHqAdminForPlatform(pool, adminId, organizationId, fields, platformAdminId);
}

async function activateHqAdminForPlatform(pool, adminId, organizationId, platformAdminId, opts = {}) {
  return hqAdminsRepo.activateHqAdminForPlatform(pool, adminId, organizationId, platformAdminId, opts);
}

async function deactivateHqAdminForPlatform(pool, adminId, organizationId, platformAdminId, opts = {}) {
  return hqAdminsRepo.deactivateHqAdminForPlatform(pool, adminId, organizationId, platformAdminId, opts);
}

async function resetHqAdminPasswordForPlatform(pool, adminId, organizationId, passwordHash, platformAdminId) {
  return hqAdminsRepo.resetHqAdminPasswordForPlatform(
    pool,
    adminId,
    organizationId,
    passwordHash,
    platformAdminId
  );
}

async function checkHqAdminLoginConflictForOrganization(pool, organizationId, opts) {
  return hqAdminsRepo.checkHqAdminLoginConflictForOrganization(pool, organizationId, opts);
}

async function countActiveHqAdminsForOrganization(pool, organizationId) {
  return hqAdminsRepo.countActiveHqAdminsForOrganization(pool, organizationId);
}

module.exports = {
  listChurchOrganizations,
  findChurchOrganizationById,
  findOrganizationByIdForPlatform,
  findChurchOrganizationBySlug,
  createChurchOrganization: provisionChurchOrganization,
  listChurchBranches,
  findChurchBranchById,
  createChurchBranch,
  createInitialHqAdmin,
  createInitialBranchAdmin,
  checkOrganizationSlugAvailable,
  checkOrganizationSlugAvailableForUpdate,
  checkBranchHostSlugAvailable,
  getProvisioningSummary,
  getOrganizationDetail,
  getOrganizationPlatformDetail,
  provisionChurchOrganization,
  listOrganizationsWithPlanSummary,
  listOrganizationsWithStatusSummary,
  listBranchesWithStatusSummary,
  getOrganizationUsageSummary,
  getOrganizationPlanSummary,
  updateOrganizationPlan,
  updateOrganizationMetadataForPlatform,
  createBranchForOrganization,
  createInitialBranchAdminForBranch,
  countBranchesForOrganization,
  listBranchesForOrganization,
  getBranchProvisioningSummary,
  updateOrganizationStatus,
  suspendOrganization,
  reactivateOrganization,
  archiveOrganization,
  updateBranchStatus,
  suspendBranch,
  reactivateBranch,
  archiveBranch,
  findBranchByIdForPlatform,
  checkBranchHostSlugAvailableForUpdate,
  getBranchAdminSummaryForBranch,
  getBranchUsageSummaryForBranch,
  updateBranchMetadataForPlatform,
  getBranchPlatformDetail,
  listBranchAdminsForBranch,
  findBranchAdminByIdForPlatform,
  createBranchAdminForPlatform,
  updateBranchAdminForPlatform,
  activateBranchAdminForPlatform,
  deactivateBranchAdminForPlatform,
  resetBranchAdminPasswordForPlatform,
  checkBranchAdminLoginConflictForBranch,
  countActiveBranchAdminsForBranch,
  getExampleBranchHostSlugForOrganization,
  listHqAdminsForOrganization,
  findHqAdminByIdForPlatform,
  createHqAdminForPlatform,
  updateHqAdminForPlatform,
  activateHqAdminForPlatform,
  deactivateHqAdminForPlatform,
  resetHqAdminPasswordForPlatform,
  checkHqAdminLoginConflictForOrganization,
  countActiveHqAdminsForOrganization,
};
