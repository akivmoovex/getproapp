"use strict";

/**
 * Safety + seed/cleanup for BlessBoard V5 controlled pilot rehearsal (testing only).
 */

const bcrypt = require("bcryptjs");
const { TENANT_ZM } = require("../../tenants/tenantIds");
const organizationsRepo = require("../../db/pg/church/organizationsRepo");
const branchesRepo = require("../../db/pg/church/branchesRepo");
const branchAdminsRepo = require("../../db/pg/church/branchAdminsRepo");
const hqAdminsRepo = require("../../db/pg/church/hqAdminsRepo");
const {
  isTestingDeployment,
  getDeploymentEnvMode,
  getChurchHostDomain,
} = require("../../church/blessBoardEnv");
const { verifyDatabaseIdentity } = require("../../startup/blessBoardOrgDbGate");
const { summarizeDatabaseUrlEnv } = require("../../db/pg/pool");
const { getDatabaseIdentity } = require("../../db/pg/church/databaseIdentityRepo");

const PILOT_MARKER_PREFIX = "controlled-pilot:";
const SYNTHETIC_PASSWORD = "PilotRehearsal_TestOnly_2026!";
const SECRET_LEAK =
  /(postgres(ql)?:\/\/[^\s"']+|(?:password|passwd|pwd)\s*[:=]\s*\S+|bearer\s+[A-Za-z0-9\-._~+/]+=*)/gi;

function redactSecrets(text) {
  return String(text || "").replace(SECRET_LEAK, "[redacted]");
}

function refuse(code, message) {
  return Object.assign(new Error(redactSecrets(message)), { code });
}

function normalizePilotId(raw) {
  const id = String(raw || "")
    .trim()
    .toLowerCase();
  if (!id) throw refuse("INVALID_PILOT_ID", "Pilot identifier is required (non-empty).");
  if (/[*?%]|^\.|\/|\\|\s/.test(id)) {
    throw refuse(
      "INVALID_PILOT_ID",
      "Pilot identifier must not contain wildcards, spaces, or path characters."
    );
  }
  if (!/^[a-z0-9][a-z0-9_-]{1,31}$/.test(id)) {
    throw refuse(
      "INVALID_PILOT_ID",
      "Pilot identifier must be 2–32 chars: letters, numbers, hyphen, underscore."
    );
  }
  return id;
}

function pilotMarker(pilotId) {
  return `${PILOT_MARKER_PREFIX}${pilotId}`;
}

function foundationSlug(pilotId) {
  return `p-${pilotId}-f`.slice(0, 40);
}

function growthSlug(pilotId) {
  return `p-${pilotId}-g`.slice(0, 40);
}

function branchHost(pilotId, kind) {
  return `p-${pilotId}-${kind}`.slice(0, 40);
}

async function assertControlledPilotSafety(pool, opts = {}) {
  if (!isTestingDeployment()) {
    throw refuse(
      "PRODUCTION_REFUSED",
      `Refusing: DEPLOYMENT_ENV mode is "${getDeploymentEnvMode()}" (need testing). Never runs against production.`
    );
  }

  const allowTestUrl =
    opts.allowTestDatabaseUrl === true ||
    process.env.GETPRO_TEST_DB === "1" ||
    process.env.NODE_ENV === "test";

  const hasDatabaseUrl = Boolean(String(process.env.DATABASE_URL || "").trim());
  const hasTestUrl = Boolean(String(process.env.TEST_DATABASE_URL || "").trim());
  if (!hasDatabaseUrl && !(allowTestUrl && hasTestUrl)) {
    throw refuse(
      "DATABASE_URL_REQUIRED",
      "Refusing: DATABASE_URL is required (or TEST_DATABASE_URL under GETPRO_TEST_DB/NODE_ENV=test)."
    );
  }

  if (hasDatabaseUrl && !allowTestUrl) {
    const summary = summarizeDatabaseUrlEnv();
    if (summary.effectiveSource !== "DATABASE_URL") {
      throw refuse(
        "DATABASE_URL_REQUIRED",
        `Refusing: effective DB source is ${summary.effectiveSource}; need DATABASE_URL.`
      );
    }
  }

  const identityCheck = await verifyDatabaseIdentity(pool, { deploymentEnv: "testing" });
  if (identityCheck.status === "fatal") {
    throw refuse(
      "IDENTITY_MISMATCH",
      identityCheck.sanitizedMessage || "Database identity check failed."
    );
  }

  const row = await getDatabaseIdentity(pool);
  if (!row) {
    throw refuse(
      "IDENTITY_MISSING",
      "No church_database_identity row — run npm run church:db-identity:init -- --env testing --confirm"
    );
  }
  if (String(row.environmentCode || "").toLowerCase() !== "testing") {
    throw refuse(
      "IDENTITY_MISMATCH",
      `Database identity is "${row.environmentCode}" — controlled pilot requires testing.`
    );
  }

  if (opts.requireConfirm && !opts.confirmed) {
    throw refuse("CONFIRM_REQUIRED", "Refusing: pass --confirm to proceed.");
  }

  return { ok: true, mode: getDeploymentEnvMode(), identity: row };
}

async function findPilotOrganizations(pool, pilotId) {
  const marker = pilotMarker(pilotId);
  const r = await pool.query(
    `SELECT id, slug, name, plan_code, status, data_environment, plan_notes, platform_tenant_id
     FROM public.church_organizations
     WHERE plan_notes = $1
        OR slug IN ($2, $3)
     ORDER BY id ASC`,
    [marker, foundationSlug(pilotId), growthSlug(pilotId)]
  );
  return r.rows;
}

async function assertNoConflictingSlug(pool, slug, pilotId) {
  const r = await pool.query(
    `SELECT id, slug, name, plan_notes, data_environment
     FROM public.church_organizations
     WHERE lower(trim(slug)) = lower(trim($1))
     LIMIT 1`,
    [slug]
  );
  const row = r.rows[0];
  if (!row) return;
  const marker = pilotMarker(pilotId);
  if (String(row.plan_notes || "") === marker && ["pilot", "test"].includes(row.data_environment)) {
    return;
  }
  throw refuse(
    "TENANT_CONFLICT",
    `Refusing: slug "${slug}" already belongs to another organisation (id=${row.id}). Will not overwrite.`
  );
}

async function createPilotBranchAdmin(pool, org, branch, opts = {}) {
  return branchAdminsRepo.createBranchAdmin(pool, {
    organization_id: org.id,
    branch_id: branch.id,
    full_name: opts.fullName || "Pilot Branch Admin (synthetic)",
    email: opts.email,
    phone: opts.phone || "260970000010",
    password_hash: opts.passwordHash,
    role: "branch_admin",
    status: "active",
  });
}

async function createPilotHqAdmin(pool, org, opts = {}) {
  return hqAdminsRepo.createHqAdmin(pool, {
    organization_id: org.id,
    full_name: opts.fullName || "Pilot HQ Admin (synthetic)",
    email: opts.email,
    phone: opts.phone || "260970000011",
    password_hash: opts.passwordHash,
    role: "hq_admin",
    status: "active",
    can_view_finance: false,
  });
}

/**
 * Delete one synthetic pilot organisation and dependent rows (testing only).
 * Order matters for FK constraints; missing tables are ignored.
 */
async function deletePilotOrganizationCascade(pool, organizationId) {
  const orgId = Number(organizationId);
  if (!Number.isFinite(orgId) || orgId <= 0) return;

  const tables = [
    "church_platform_support_access_events",
    "church_platform_support_access",
    "church_organization_account_managers",
    "church_pilot_feature_flag_audit",
    "church_pilot_feature_flag_tenant_overrides",
    "church_notification_test_deliveries",
    "church_scheduled_report_deliveries",
    "church_scheduled_report_runs",
    "church_scheduled_report_recipients",
    "church_scheduled_reports",
    "church_hq_broadcast_attachments",
    "church_hq_broadcast_deliveries",
    "church_hq_broadcast_targets",
    "church_hq_broadcasts",
    "church_organization_usage_months",
    "church_announcement_attachments",
    "church_announcements",
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
      } else {
        await pool.query(`DELETE FROM public.${table} WHERE organization_id = $1`, [orgId]);
      }
    } catch {
      /* table may not exist — ignore for cleanup resilience */
    }
  }
}

async function loadTenantBundle(pool, organizationId) {
  const org = await organizationsRepo.findOrganizationById(pool, organizationId);
  const branches = await branchesRepo.listBranchesForOrganization(pool, organizationId);
  const members = await pool.query(
    `SELECT COUNT(*)::int AS c FROM public.church_members WHERE organization_id = $1`,
    [organizationId]
  );
  const hq = (
    await pool.query(
      `SELECT id, email, full_name, status FROM public.church_hq_admins WHERE organization_id = $1 ORDER BY id LIMIT 1`,
      [organizationId]
    )
  ).rows[0];
  const ba = (
    await pool.query(
      `SELECT id, email, full_name, status, branch_id FROM public.church_branch_admins WHERE organization_id = $1 ORDER BY id LIMIT 1`,
      [organizationId]
    )
  ).rows[0];
  const domain = getChurchHostDomain();
  return {
    organization: org,
    branches,
    hqAdmin: hq,
    branchAdmin: ba,
    memberCount: Number(members.rows[0]?.c) || 0,
    hosts: branches.map((b) => `${b.host_slug || b.slug}.${domain}`),
  };
}

async function seedControlledPilot(pool, opts) {
  const pilotId = normalizePilotId(opts.pilotId);
  await assertControlledPilotSafety(pool, {
    requireConfirm: true,
    confirmed: opts.confirm === true,
    allowTestDatabaseUrl: opts.allowTestDatabaseUrl,
  });

  const existing = await findPilotOrganizations(pool, pilotId);
  const marker = pilotMarker(pilotId);
  const bySlug = new Map(existing.map((o) => [o.slug, o]));

  if (
    bySlug.has(foundationSlug(pilotId)) &&
    bySlug.has(growthSlug(pilotId)) &&
    existing.every((o) => String(o.plan_notes || "") === marker)
  ) {
    return {
      ok: true,
      idempotent: true,
      pilotId,
      marker,
      foundation: await loadTenantBundle(pool, bySlug.get(foundationSlug(pilotId)).id),
      growth: await loadTenantBundle(pool, bySlug.get(growthSlug(pilotId)).id),
    };
  }

  await assertNoConflictingSlug(pool, foundationSlug(pilotId), pilotId);
  await assertNoConflictingSlug(pool, growthSlug(pilotId), pilotId);

  const passwordHash = await bcrypt.hash(SYNTHETIC_PASSWORD, 10);

  let foundationOrg = bySlug.get(foundationSlug(pilotId));
  if (!foundationOrg) {
    foundationOrg = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: foundationSlug(pilotId),
      name: `[PILOT ${pilotId}] Foundation Rehearsal`,
      data_environment: "pilot",
      status: "active",
      plan_code: "foundation",
    });
  }
  await organizationsRepo.updateOrganizationPlan(
    pool,
    foundationOrg.id,
    { plan_code: "foundation", plan_status: "active", plan_notes: marker },
    null
  );
  await pool.query(
    `UPDATE public.church_organizations
     SET status = 'active', timezone = 'Africa/Lusaka', data_environment = 'pilot', plan_notes = $2
     WHERE id = $1`,
    [foundationOrg.id, marker]
  );

  let foundationBranch = (await branchesRepo.listBranchesForOrganization(pool, foundationOrg.id))[0];
  if (!foundationBranch) {
    foundationBranch = await branchesRepo.createBranch(pool, {
      organization_id: foundationOrg.id,
      slug: branchHost(pilotId, "fm"),
      host_slug: branchHost(pilotId, "fm"),
      name: "Main Campus (synthetic)",
      status: "active",
      member_registration_enabled: true,
    });
  }

  const fOrg = await organizationsRepo.findOrganizationById(pool, foundationOrg.id);
  let foundationBa = (
    await pool.query(
      `SELECT * FROM public.church_branch_admins WHERE organization_id = $1 ORDER BY id LIMIT 1`,
      [fOrg.id]
    )
  ).rows[0];
  let foundationHq = (
    await pool.query(
      `SELECT * FROM public.church_hq_admins WHERE organization_id = $1 ORDER BY id LIMIT 1`,
      [fOrg.id]
    )
  ).rows[0];
  if (!foundationBa) {
    foundationBa = await createPilotBranchAdmin(pool, fOrg, foundationBranch, {
      passwordHash,
      email: `pilot.${pilotId}.foundation.ba@example.test`,
    });
  }
  if (!foundationHq) {
    foundationHq = await createPilotHqAdmin(pool, fOrg, {
      passwordHash,
      email: `pilot.${pilotId}.foundation.hq@example.test`,
    });
  }

  let growthOrg = bySlug.get(growthSlug(pilotId));
  if (!growthOrg) {
    growthOrg = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: growthSlug(pilotId),
      name: `[PILOT ${pilotId}] Growth Rehearsal`,
      data_environment: "pilot",
      status: "active",
      plan_code: "growth",
    });
  }
  await organizationsRepo.updateOrganizationPlan(
    pool,
    growthOrg.id,
    { plan_code: "growth", plan_status: "active", plan_notes: marker },
    null
  );
  await pool.query(
    `UPDATE public.church_organizations
     SET status = 'active', timezone = 'Africa/Lusaka', data_environment = 'pilot', plan_notes = $2
     WHERE id = $1`,
    [growthOrg.id, marker]
  );

  const gOrg = await organizationsRepo.findOrganizationById(pool, growthOrg.id);
  let growthBranches = await branchesRepo.listBranchesForOrganization(pool, gOrg.id);
  if (growthBranches.length < 2) {
    const existingHosts = new Set(growthBranches.map((b) => b.host_slug || b.slug));
    if (!existingHosts.has(branchHost(pilotId, "ga"))) {
      await branchesRepo.createBranch(pool, {
        organization_id: gOrg.id,
        slug: branchHost(pilotId, "ga"),
        host_slug: branchHost(pilotId, "ga"),
        name: "Campus A (synthetic)",
        status: "active",
        member_registration_enabled: true,
      });
    }
    if (!existingHosts.has(branchHost(pilotId, "gb"))) {
      await branchesRepo.createBranch(pool, {
        organization_id: gOrg.id,
        slug: branchHost(pilotId, "gb"),
        host_slug: branchHost(pilotId, "gb"),
        name: "Campus B (synthetic)",
        status: "active",
        member_registration_enabled: true,
      });
    }
    growthBranches = await branchesRepo.listBranchesForOrganization(pool, gOrg.id);
  }

  let growthBa = (
    await pool.query(
      `SELECT * FROM public.church_branch_admins WHERE organization_id = $1 ORDER BY id LIMIT 1`,
      [gOrg.id]
    )
  ).rows[0];
  let growthHq = (
    await pool.query(
      `SELECT * FROM public.church_hq_admins WHERE organization_id = $1 ORDER BY id LIMIT 1`,
      [gOrg.id]
    )
  ).rows[0];
  if (!growthBa) {
    growthBa = await createPilotBranchAdmin(pool, gOrg, growthBranches[0], {
      passwordHash,
      email: `pilot.${pilotId}.growth.ba@example.test`,
    });
  }
  if (!growthHq) {
    growthHq = await createPilotHqAdmin(pool, gOrg, {
      passwordHash,
      email: `pilot.${pilotId}.growth.hq@example.test`,
    });
  }

  return {
    ok: true,
    idempotent: false,
    pilotId,
    marker,
    foundation: await loadTenantBundle(pool, fOrg.id),
    growth: await loadTenantBundle(pool, gOrg.id),
  };
}

async function previewPilotCleanup(pool, pilotId) {
  const id = normalizePilotId(pilotId);
  const orgs = await findPilotOrganizations(pool, id);
  const marker = pilotMarker(id);
  const eligible = orgs.filter(
    (o) =>
      String(o.plan_notes || "") === marker &&
      ["pilot", "test"].includes(String(o.data_environment || ""))
  );
  const counts = [];
  for (const org of eligible) {
    const tables = [
      "church_members",
      "church_branches",
      "church_hq_admins",
      "church_branch_admins",
      "church_attendance_records",
      "church_scheduled_reports",
      "church_hq_broadcasts",
      "church_audit_logs",
      "church_platform_support_access",
    ];
    const row = { organizationId: org.id, slug: org.slug, tables: {} };
    for (const t of tables) {
      try {
        const r = await pool.query(
          `SELECT COUNT(*)::int AS c FROM public.${t} WHERE organization_id = $1`,
          [org.id]
        );
        row.tables[t] = Number(r.rows[0]?.c) || 0;
      } catch {
        row.tables[t] = null;
      }
    }
    counts.push(row);
  }
  return {
    pilotId: id,
    marker,
    organizations: eligible,
    ineligible: orgs.filter((o) => !eligible.includes(o)),
    counts,
  };
}

async function cleanupControlledPilot(pool, opts) {
  const pilotId = normalizePilotId(opts.pilotId);
  await assertControlledPilotSafety(pool, {
    requireConfirm: true,
    confirmed: opts.confirm === true,
    allowTestDatabaseUrl: opts.allowTestDatabaseUrl,
  });

  const preview = await previewPilotCleanup(pool, pilotId);
  if (!preview.organizations.length) {
    return { ok: true, alreadyGone: true, pilotId, preview, deleted: [] };
  }
  if (preview.ineligible.length) {
    throw refuse(
      "CLEANUP_SCOPE",
      `Refusing: found ${preview.ineligible.length} org(s) matching slug but not pilot marker/data_environment.`
    );
  }
  if (opts.previewOnly) {
    return { ok: true, previewOnly: true, pilotId, preview, deleted: [] };
  }

  const deleted = [];
  for (const org of preview.organizations) {
    const live = await organizationsRepo.findOrganizationById(pool, org.id);
    if (!live || live.data_environment === "production") {
      throw refuse("CLEANUP_SCOPE", `Refusing to delete organisation id=${org.id} (not a pilot row).`);
    }
    if (String(live.plan_notes || "") !== pilotMarker(pilotId)) {
      throw refuse("CLEANUP_SCOPE", `Refusing: plan_notes mismatch for id=${org.id}.`);
    }
    await deletePilotOrganizationCascade(pool, org.id);
    deleted.push({ id: org.id, slug: org.slug });
  }

  return { ok: true, pilotId, preview, deleted };
}

module.exports = {
  PILOT_MARKER_PREFIX,
  SYNTHETIC_PASSWORD,
  normalizePilotId,
  pilotMarker,
  foundationSlug,
  growthSlug,
  branchHost,
  assertControlledPilotSafety,
  seedControlledPilot,
  previewPilotCleanup,
  cleanupControlledPilot,
  findPilotOrganizations,
  loadTenantBundle,
  redactSecrets,
  refuse,
};
