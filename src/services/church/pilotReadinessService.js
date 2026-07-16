"use strict";

/**
 * Per-organisation pilot-readiness checklist evaluation.
 * Never auto-publishes or activates. Placeholder/demo data cannot alone mark Complete.
 */

const organizationsRepo = require("../../db/pg/church/organizationsRepo");
const branchesRepo = require("../../db/pg/church/branchesRepo");
const branchAdminsRepo = require("../../db/pg/church/branchAdminsRepo");
const websiteContentRepo = require("../../db/pg/church/websiteContentRepo");
const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");
const { resolvePackageFromPlanCode } = require("../../church/blessBoardPackageCatalogue");
const { churchPublicHost } = require("../../church/platformProvisioningValidation");
const {
  CHECKLIST_ITEMS,
  STATUS_LABELS,
  ROLE_LABELS,
  getChecklistItemDefinition,
  isKnownChecklistItemKey,
  looksLikePlaceholderText,
  isPlaceholderServiceTimes,
  isReservedDemoHostSlug,
  isDemoLikeOrganisation,
} = require("../../church/pilotReadinessCatalogue");

function itemResult(def, status, detail, link) {
  return {
    key: def.key,
    label: def.label,
    description: def.description,
    responsibleRole: def.responsibleRole,
    responsibleRoleLabel: ROLE_LABELS[def.responsibleRole] || def.responsibleRole,
    evaluation: def.evaluation,
    autoStatus: status,
    status,
    statusLabel: STATUS_LABELS[status] || status,
    detail: detail || null,
    link: link || null,
    note: null,
    manualStatus: null,
    placeholderDetected: false,
  };
}

async function loadPrimaryBranch(db, organizationId) {
  const branches = await branchesRepo.listBranchesForOrganization(db, organizationId);
  if (!branches || !branches.length) return { branches: [], primary: null };
  const active = branches.filter((b) => String(b.status || "") === "active");
  const primary = active[0] || branches[0] || null;
  return { branches, primary };
}

async function countAttendanceForBranch(db, branchId) {
  try {
    const r = await db.query(
      `SELECT COUNT(*)::int AS c
       FROM public.church_attendance_records
       WHERE branch_id = $1`,
      [branchId]
    );
    return r.rows[0] ? Number(r.rows[0].c) || 0 : 0;
  } catch {
    return 0;
  }
}

async function countMembersForOrg(db, organizationId) {
  try {
    const r = await db.query(
      `SELECT COUNT(*)::int AS c
       FROM public.church_members
       WHERE organization_id = $1`,
      [organizationId]
    );
    return r.rows[0] ? Number(r.rows[0].c) || 0 : 0;
  } catch {
    return 0;
  }
}

async function countFinanceHqAdmins(db, organizationId) {
  try {
    const r = await db.query(
      `SELECT COUNT(*)::int AS c
       FROM public.church_hq_admins
       WHERE organization_id = $1 AND status = 'active' AND can_view_finance = true`,
      [organizationId]
    );
    return r.rows[0] ? Number(r.rows[0].c) || 0 : 0;
  } catch {
    return 0;
  }
}

async function loadItemNotes(db, organizationId) {
  const r = await db.query(
    `SELECT item_key, note, manual_status, updated_at, updated_by_actor_type, updated_by_actor_id
     FROM public.church_pilot_readiness_item_notes
     WHERE organization_id = $1`,
    [organizationId]
  );
  const map = new Map();
  for (const row of r.rows) {
    map.set(row.item_key, row);
  }
  return map;
}

async function loadLatestApproval(db, organizationId) {
  const r = await db.query(
    `SELECT id, approved_by_actor_type, approved_by_actor_id, approved_by_label,
            approved_at, note
     FROM public.church_pilot_readiness_approvals
     WHERE organization_id = $1
     ORDER BY approved_at DESC, id DESC
     LIMIT 1`,
    [organizationId]
  );
  return r.rows[0] || null;
}

function applyManualOverride(item, noteRow) {
  if (!noteRow) return item;
  item.note = noteRow.note || null;
  item.manualStatus = noteRow.manual_status || null;
  item.noteUpdatedAt = noteRow.updated_at || null;
  // Manual status applies for manual items, or when reviewing needs_review placeholders.
  if (noteRow.manual_status) {
    if (item.evaluation === "manual" || item.autoStatus === "needs_review") {
      item.status = noteRow.manual_status;
      item.statusLabel = STATUS_LABELS[item.status] || item.status;
    }
  }
  return item;
}

async function evaluateItems(db, org, ctx) {
  const { primary, branches, blessboardAdminMode } = ctx;
  const demoLike = isDemoLikeOrganisation(org, primary);
  const linkCtx = {
    organizationId: org.id,
    primaryBranchId: primary ? primary.id : null,
    blessboardAdminMode: Boolean(blessboardAdminMode),
  };

  const activeBranches = branches.filter((b) => String(b.status || "") === "active");
  const primaryActive = primary && String(primary.status || "") === "active";

  let website = null;
  if (primary) {
    try {
      website = await websiteContentRepo.getPublishedWebsiteContentForBranch(db, primary.id);
    } catch {
      website = null;
    }
  }

  let activeAdminCount = 0;
  if (primaryActive) {
    try {
      activeAdminCount = await branchAdminsRepo.countActiveBranchAdminsForBranch(db, primary.id);
    } catch {
      activeAdminCount = 0;
    }
  } else if (activeBranches.length) {
    for (const b of activeBranches) {
      try {
        activeAdminCount += await branchAdminsRepo.countActiveBranchAdminsForBranch(db, b.id);
      } catch {
        /* ignore */
      }
    }
  }

  const memberCount = await countMembersForOrg(db, org.id);
  const attendanceCount = primary ? await countAttendanceForBranch(db, primary.id) : 0;
  const financeAdmins = await countFinanceHqAdmins(db, org.id);
  const packageResolved = resolvePackageFromPlanCode(org.plan_code);

  const hostSlug = primary ? String(primary.host_slug || primary.slug || "").trim() : "";
  const publicHost = hostSlug ? churchPublicHost(hostSlug) : null;

  /** @type {Record<string, object>} */
  const byKey = {};

  // 1 organisation identity
  {
    const def = getChecklistItemDefinition("organisation_identity");
    const hasCore = Boolean(
      String(org.name || "").trim() &&
        String(org.slug || "").trim() &&
        String(org.country || "").trim()
    );
    const hasContact = Boolean(
      String(org.primary_contact_email || "").trim() ||
        String(org.primary_contact_phone || "").trim()
    );
    let status = "incomplete";
    let detail = "Name, slug, and country are required.";
    let placeholderDetected = false;
    if (hasCore && hasContact) {
      if (demoLike || looksLikePlaceholderText(org.name)) {
        status = "needs_review";
        detail = "Identity fields look like demo/placeholder data.";
        placeholderDetected = true;
      } else {
        status = "complete";
        detail = "Identity and primary contact present.";
      }
    } else if (hasCore) {
      status = "incomplete";
      detail = "Add a primary contact email or phone.";
    }
    const item = itemResult(def, status, detail, def.link(linkCtx));
    item.placeholderDetected = placeholderDetected;
    byKey[def.key] = item;
  }

  // 2 package assigned
  {
    const def = getChecklistItemDefinition("package_assigned");
    let status = "incomplete";
    let detail = "Package is not assigned.";
    if (packageResolved.usedFallback) {
      status = "incomplete";
      detail = `Plan code falls back to ${packageResolved.packageCode} (${packageResolved.fallbackReason || "unknown"}). Assign Foundation or Growth explicitly.`;
    } else if (String(org.plan_status || "") !== "active") {
      status = "incomplete";
      detail = `Plan status is ${org.plan_status || "unset"}.`;
    } else {
      status = "complete";
      detail = `Package ${packageResolved.packageCode} assigned (${packageResolved.entitlementSource}).`;
    }
    byKey[def.key] = itemResult(def, status, detail, def.link(linkCtx));
  }

  // 3 primary subdomain
  {
    const def = getChecklistItemDefinition("primary_subdomain");
    let status = "incomplete";
    let detail = "No primary branch host slug.";
    let placeholderDetected = false;
    if (hostSlug) {
      if (isReservedDemoHostSlug(hostSlug)) {
        status = "needs_review";
        detail = "Host slug is reserved demo (demo). Use a real church subdomain.";
        placeholderDetected = true;
      } else if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(hostSlug)) {
        status = "incomplete";
        detail = "Host slug format is invalid.";
      } else if (!primaryActive) {
        status = "incomplete";
        detail = `Host slug “${hostSlug}” exists but primary branch is not active.`;
      } else {
        status = "complete";
        detail = publicHost ? `https://${publicHost}` : hostSlug;
      }
    }
    const item = itemResult(def, status, detail, def.link(linkCtx));
    item.placeholderDetected = placeholderDetected;
    item.publicHost = publicHost;
    byKey[def.key] = item;
  }

  // 4 branch configured
  {
    const def = getChecklistItemDefinition("branch_configured");
    let status = "incomplete";
    let detail = "No branches found.";
    if (activeBranches.length >= 1) {
      status = "complete";
      detail = `${activeBranches.length} active branch(es).`;
    } else if (branches.length >= 1) {
      status = "incomplete";
      detail = `${branches.length} branch(es) exist but none are active.`;
    }
    byKey[def.key] = itemResult(def, status, detail, def.link(linkCtx));
  }

  // 5 branch administrator
  {
    const def = getChecklistItemDefinition("branch_administrator");
    let status = "incomplete";
    let detail = "No active branch administrator on an active branch.";
    if (!activeBranches.length) {
      status = "incomplete";
      detail = "Activate a branch before assigning administrators.";
    } else if (activeAdminCount >= 1) {
      status = "complete";
      detail = `${activeAdminCount} active branch administrator(s).`;
    }
    byKey[def.key] = itemResult(def, status, detail, def.link(linkCtx));
  }

  // 6 service schedule
  {
    const def = getChecklistItemDefinition("service_schedule");
    const times =
      (website && website.service_times) ||
      (primary && primary.service_times) ||
      "";
    let status = "incomplete";
    let detail = "Service times are empty.";
    let placeholderDetected = false;
    if (!primaryActive) {
      status = "incomplete";
      detail = "Primary branch is not active.";
    } else if (isPlaceholderServiceTimes(times)) {
      status = String(times || "").trim() ? "needs_review" : "incomplete";
      detail = "Service times still use the provision placeholder.";
      placeholderDetected = Boolean(String(times || "").trim());
    } else {
      status = "complete";
      detail = "Custom service times configured.";
    }
    const item = itemResult(def, status, detail, def.link(linkCtx));
    item.placeholderDetected = placeholderDetected;
    byKey[def.key] = item;
  }

  // 7 branding
  {
    const def = getChecklistItemDefinition("branding_uploaded");
    let status = "incomplete";
    let detail = "No published website content.";
    let placeholderDetected = false;
    if (!primaryActive) {
      status = "incomplete";
      detail = "Primary branch is not active.";
    } else if (!website) {
      status = "incomplete";
      detail = "Publish website content from the branch website editor.";
    } else {
      const hero = website.homepage_hero_subtitle || "";
      const about = website.about_body || "";
      const welcome = website.welcome_message || "";
      if (
        looksLikePlaceholderText(hero) ||
        looksLikePlaceholderText(about) ||
        looksLikePlaceholderText(welcome)
      ) {
        status = "needs_review";
        detail = "Published content still contains onboarding placeholder copy.";
        placeholderDetected = true;
      } else {
        status = "complete";
        detail = "Published website content looks customised.";
      }
    }
    const item = itemResult(def, status, detail, def.link(linkCtx));
    item.placeholderDetected = placeholderDetected;
    byKey[def.key] = item;
  }

  // 8 public contact
  {
    const def = getChecklistItemDefinition("public_contact");
    const phone =
      (website && website.contact_phone) ||
      (primary && primary.contact_phone) ||
      "";
    const email =
      (website && website.contact_email) ||
      (primary && primary.contact_email) ||
      "";
    const address =
      (website && (website.address || website.location_text)) ||
      (primary && primary.location_text) ||
      "";
    let status = "incomplete";
    let detail = "Add a public phone or email and a location.";
    if (!primaryActive) {
      status = "incomplete";
      detail = "Primary branch is not active.";
    } else if ((phone || email) && address) {
      status = "complete";
      detail = "Public contact and location present.";
    } else if (phone || email) {
      status = "incomplete";
      detail = "Add a public location/address.";
    }
    byKey[def.key] = itemResult(def, status, detail, def.link(linkCtx));
  }

  // 9 public pages reviewed (manual)
  {
    const def = getChecklistItemDefinition("public_pages_reviewed");
    let status = "needs_review";
    let detail = "Manually review public pages, then mark complete.";
    if (!website) {
      status = "incomplete";
      detail = "Publish public pages before review.";
    } else if (publicHost) {
      detail = `Review https://${publicHost}/ then confirm.`;
    }
    const item = itemResult(
      def,
      status,
      detail,
      publicHost ? `https://${publicHost}/` : def.link(linkCtx)
    );
    byKey[def.key] = item;
  }

  // 10 member registration tested
  {
    const def = getChecklistItemDefinition("member_registration_tested");
    const enabled = primary ? primary.member_registration_enabled !== false : false;
    let status = "incomplete";
    let detail = "Member registration not ready.";
    let placeholderDetected = false;
    if (!primaryActive) {
      status = "incomplete";
      detail = "Primary branch is not active.";
    } else if (!enabled) {
      status = "incomplete";
      detail = "Member registration is disabled.";
    } else if (demoLike) {
      status = "needs_review";
      detail = "Demo organisation — confirm a real registration test separately.";
      placeholderDetected = true;
    } else if (memberCount < 1) {
      status = "needs_review";
      detail = "Registration is enabled but no members yet — run a test registration.";
    } else {
      status = "complete";
      detail = `${memberCount} member record(s) present after registration enabled.`;
    }
    const item = itemResult(def, status, detail, def.link(linkCtx));
    item.placeholderDetected = placeholderDetected;
    byKey[def.key] = item;
  }

  // 11 attendance tested
  {
    const def = getChecklistItemDefinition("attendance_tested");
    let status = "incomplete";
    let detail = "No attendance records.";
    let placeholderDetected = false;
    if (!primaryActive) {
      status = "incomplete";
      detail = "Primary branch is not active.";
    } else if (demoLike && attendanceCount > 0) {
      status = "needs_review";
      detail = "Attendance exists on a demo-like organisation — confirm it is a real test.";
      placeholderDetected = true;
    } else if (attendanceCount < 1) {
      status = "incomplete";
      detail = "Record a test attendance entry.";
    } else {
      status = "complete";
      detail = `${attendanceCount} attendance record(s).`;
    }
    const item = itemResult(def, status, detail, def.link(linkCtx));
    item.placeholderDetected = placeholderDetected;
    byKey[def.key] = item;
  }

  // 12 safeguarding (manual)
  {
    const def = getChecklistItemDefinition("safeguarding_roles");
    byKey[def.key] = itemResult(
      def,
      "needs_review",
      "Confirm safeguarding roles with the church (not automated in product).",
      def.link(linkCtx)
    );
  }

  // 13 finance roles (manual with signal)
  {
    const def = getChecklistItemDefinition("finance_roles");
    let status = "needs_review";
    let detail =
      financeAdmins > 0
        ? `${financeAdmins} HQ admin(s) have finance visibility — confirm this is intentional.`
        : "No HQ admin has can_view_finance — review whether finance access is required.";
    byKey[def.key] = itemResult(def, status, detail, def.link(linkCtx));
  }

  // 14 backup (manual + verification service signal)
  {
    const def = getChecklistItemDefinition("backup_status");
    let status = "needs_review";
    let detail = "Confirm operational backup status with platform operations.";
    try {
      const churchBackupVerificationService = require("./churchBackupVerificationService");
      const backup = await churchBackupVerificationService.getBackupVerificationStatus(db);
      if (!backup.available || backup.status === "missing") {
        status = "incomplete";
        detail = "No successful backup verification recorded in application diagnostics.";
      } else if (backup.status === "stale" || backup.status === "failed") {
        status = "needs_review";
        detail = backup.warnings && backup.warnings[0] ? backup.warnings[0] : "Backup verification needs review.";
      } else if (backup.status === "recorded") {
        status = "needs_review";
        detail =
          "Backup verification recorded — confirm restoration test and mark complete when ops sign off.";
        if (!backup.lastRestorationTestAt) {
          detail = "Backup verification recorded, but no restoration test has been recorded yet.";
        } else if (backup.lastRestorationTestOutcome === "success") {
          status = "needs_review";
          detail =
            "Backup verification and a successful restoration test are recorded — confirm before marking Complete.";
        }
      }
    } catch {
      /* keep needs_review */
    }
    byKey[def.key] = itemResult(def, status, detail, def.link(linkCtx));
  }

  // 15 support contact
  {
    const def = getChecklistItemDefinition("support_contact");
    const has =
      String(org.primary_contact_name || "").trim() &&
      (String(org.primary_contact_email || "").trim() ||
        String(org.primary_contact_phone || "").trim());
    let status = "incomplete";
    let detail = "Set organisation primary contact name and email/phone.";
    let placeholderDetected = false;
    if (has) {
      if (demoLike) {
        status = "needs_review";
        detail = "Support contact present on demo-like organisation — confirm with the church.";
        placeholderDetected = true;
      } else {
        status = "needs_review";
        detail = "Contact present — confirm it is the agreed support handoff.";
      }
    }
    const item = itemResult(def, status, detail, def.link(linkCtx));
    item.placeholderDetected = placeholderDetected;
    byKey[def.key] = item;
  }

  // 16 privacy / consent (manual)
  {
    const def = getChecklistItemDefinition("privacy_consent");
    byKey[def.key] = itemResult(
      def,
      "needs_review",
      "Review platform privacy/terms and registration consent for this pilot.",
      def.link(linkCtx)
    );
  }

  return CHECKLIST_ITEMS.map((def) => byKey[def.key]);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {{ blessboardAdminMode?: boolean }} [opts]
 */
async function getOrganisationPilotReadiness(pool, organizationId, opts = {}) {
  const id = Number(organizationId);
  if (!Number.isFinite(id) || id <= 0) {
    const err = new Error("Invalid organisation id.");
    err.code = "VALIDATION";
    throw err;
  }
  const org = await organizationsRepo.findOrganizationById(pool, id);
  if (!org) {
    const err = new Error("Organisation not found.");
    err.code = "NOT_FOUND";
    throw err;
  }

  const { branches, primary } = await loadPrimaryBranch(pool, id);
  const items = await evaluateItems(pool, org, {
    branches,
    primary,
    blessboardAdminMode: opts.blessboardAdminMode,
  });

  let notesMap = new Map();
  try {
    notesMap = await loadItemNotes(pool, id);
  } catch {
    notesMap = new Map();
  }

  const withNotes = items.map((item) => applyManualOverride({ ...item }, notesMap.get(item.key)));

  let approval = null;
  try {
    approval = await loadLatestApproval(pool, id);
  } catch {
    approval = null;
  }

  const counts = {
    complete: withNotes.filter((i) => i.status === "complete").length,
    incomplete: withNotes.filter((i) => i.status === "incomplete").length,
    needs_review: withNotes.filter((i) => i.status === "needs_review").length,
    total: withNotes.length,
  };

  const readyForApproval = counts.incomplete === 0 && counts.needs_review === 0;

  return {
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      planCode: org.plan_code,
      planStatus: org.plan_status,
    },
    primaryBranch: primary
      ? {
          id: primary.id,
          name: primary.name,
          status: primary.status,
          hostSlug: primary.host_slug || primary.slug,
          publicHost: churchPublicHost(primary.host_slug || primary.slug),
        }
      : null,
    branchCount: branches.length,
    activeBranchCount: branches.filter((b) => b.status === "active").length,
    demoLike: isDemoLikeOrganisation(org, primary),
    items: withNotes,
    counts,
    readyForApproval,
    approval: approval
      ? {
          id: approval.id,
          approvedAt: approval.approved_at,
          approvedByLabel: approval.approved_by_label,
          approvedByActorType: approval.approved_by_actor_type,
          approvedByActorId: approval.approved_by_actor_id,
          note: approval.note,
        }
      : null,
  };
}

async function upsertItemNote(pool, opts) {
  const organizationId = Number(opts.organizationId);
  const itemKey = String(opts.itemKey || "").trim();
  if (!isKnownChecklistItemKey(itemKey)) {
    const err = new Error("Unknown checklist item.");
    err.code = "VALIDATION";
    throw err;
  }
  const note = opts.note != null ? String(opts.note).trim().slice(0, 4000) : null;
  let manualStatus = opts.manualStatus != null ? String(opts.manualStatus).trim() : null;
  if (manualStatus === "") manualStatus = null;
  if (manualStatus && !["complete", "incomplete", "needs_review"].includes(manualStatus)) {
    const err = new Error("Invalid manual status.");
    err.code = "VALIDATION";
    throw err;
  }

  const existing = await pool.query(
    `SELECT id FROM public.church_pilot_readiness_item_notes
     WHERE organization_id = $1 AND item_key = $2 LIMIT 1`,
    [organizationId, itemKey]
  );

  let row;
  if (existing.rows[0]) {
    const r = await pool.query(
      `UPDATE public.church_pilot_readiness_item_notes
       SET note = $2,
           manual_status = $3,
           updated_by_actor_type = $4,
           updated_by_actor_id = $5,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        existing.rows[0].id,
        note,
        manualStatus,
        opts.actorType || "platform_admin",
        opts.actorId || null,
      ]
    );
    row = r.rows[0];
  } else {
    const r = await pool.query(
      `INSERT INTO public.church_pilot_readiness_item_notes (
         organization_id, item_key, note, manual_status,
         updated_by_actor_type, updated_by_actor_id
       ) VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        organizationId,
        itemKey,
        note,
        manualStatus,
        opts.actorType || "platform_admin",
        opts.actorId || null,
      ]
    );
    row = r.rows[0];
  }

  await auditLogsRepo.insertAuditLog(pool, {
    organization_id: organizationId,
    branch_id: null,
    actor_type: opts.actorType || "platform_admin",
    actor_id: opts.actorId || null,
    action: "platform_pilot_readiness_note_updated",
    entity_type: "pilot_readiness_item",
    entity_id: row.id,
    target_label: itemKey,
    metadata_json: {
      item_key: itemKey,
      manual_status: manualStatus,
      has_note: Boolean(note),
    },
  });

  return row;
}

async function recordPilotApproval(pool, opts) {
  const organizationId = Number(opts.organizationId);
  const readiness = await getOrganisationPilotReadiness(pool, organizationId, {
    blessboardAdminMode: opts.blessboardAdminMode,
  });

  if (!readiness.readyForApproval && !opts.force) {
    const err = new Error(
      "Pilot approval requires every checklist item to be Complete (no Incomplete or Needs Review remaining)."
    );
    err.code = "NOT_READY";
    err.readiness = readiness;
    throw err;
  }

  const note = opts.note != null ? String(opts.note).trim().slice(0, 4000) : null;
  const snapshot = {
    counts: readiness.counts,
    items: readiness.items.map((i) => ({
      key: i.key,
      status: i.status,
      autoStatus: i.autoStatus,
      manualStatus: i.manualStatus,
    })),
    demoLike: readiness.demoLike,
  };

  const r = await pool.query(
    `INSERT INTO public.church_pilot_readiness_approvals (
       organization_id, approved_by_actor_type, approved_by_actor_id,
       approved_by_label, note, snapshot_json
     ) VALUES ($1,$2,$3,$4,$5,$6::jsonb)
     RETURNING *`,
    [
      organizationId,
      opts.actorType || "platform_admin",
      opts.actorId || null,
      opts.actorLabel || "Platform administrator",
      note,
      JSON.stringify(snapshot),
    ]
  );

  await auditLogsRepo.insertAuditLog(pool, {
    organization_id: organizationId,
    branch_id: null,
    actor_type: opts.actorType || "platform_admin",
    actor_id: opts.actorId || null,
    action: "platform_pilot_readiness_approved",
    entity_type: "pilot_readiness_approval",
    entity_id: r.rows[0].id,
    target_label: readiness.organization.slug,
    metadata_json: {
      approved_at: r.rows[0].approved_at,
      counts: readiness.counts,
      force: Boolean(opts.force),
    },
  });

  return {
    approval: r.rows[0],
    readiness: await getOrganisationPilotReadiness(pool, organizationId, {
      blessboardAdminMode: opts.blessboardAdminMode,
    }),
  };
}

module.exports = {
  getOrganisationPilotReadiness,
  upsertItemNote,
  recordPilotApproval,
  looksLikePlaceholderText,
  isPlaceholderServiceTimes,
  isDemoLikeOrganisation,
};
