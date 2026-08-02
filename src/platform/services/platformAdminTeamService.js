"use strict";

/**
 * Platform Admin organisation team management.
 * Thin adapter over Staff Access + invitation + RBAC assignment services.
 * Does not implement a second role engine.
 */

const { recordAuditEventSafe } = require("./auditEventService");
const { getPlatformDeploymentCode } = require("../config/platformDeploymentCode");
const {
  authorize,
} = require("../../blessboard/services/blessBoardRbacAuthorizationService");
const {
  listStaffAccess,
  getStaffAccessDetail,
  listRoleCatalogue,
  listAssignableScopeOptions,
  sensitivityLabel,
  STATUS: STAFF_STATUS,
} = require("../../blessboard/services/staffAccessService");
const {
  createRoleAssignment,
  revokeRoleAssignment,
  CHURCH_ASSIGNABLE_SCOPE_TYPES,
  HIGHLY_SENSITIVE_ROLE_KEYS,
} = require("../../blessboard/services/blessBoardRoleAssignmentService");
const {
  inviteBlessBoardStaff,
  listPendingInvitations,
  STATUS: INVITE_STATUS,
} = require("../../blessboard/services/inviteBlessBoardStaff");
const {
  createScopedTeamMember,
  STATUS: SCOPED_STATUS,
} = require("./createScopedTeamMemberService");
const { normalizeEmail } = require("../../blessboard/services/createBlessBoardUser");
const authRepo = require("../../blessboard/repositories/blessBoardAuthRepository");
const { resolveOrganizationTarget } = require("./platformSupportModeService");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  CONFLICT: "conflict",
  LOOKUP_ERROR: "lookup_error",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

function deploymentCode(env) {
  const id = getPlatformDeploymentCode(env || process.env);
  return id && id.ok ? id.code : "blessboard-org-v5";
}

function buildTenantContext(org) {
  return {
    resolved: true,
    organization: {
      id: org.id,
      organizationKey: org.organization_key,
      displayName: org.display_name,
    },
    church: {
      id: org.church_id,
      churchKey: org.church_key,
      displayName: org.church_name,
    },
    primaryBranch: null,
  };
}

async function assertPlatformPermission(db, actorUserId, permissionKey) {
  const userId = String(actorUserId || "").trim();
  if (!UUID_RE.test(userId)) {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "unauthenticated" };
  }
  const decision = await authorize(db, {
    actor: { userId },
    permission: permissionKey,
    tenantContext: {
      organizationId: null,
      churchId: null,
      primaryBranchId: null,
    },
    resourceContext: {
      organizationId: null,
      churchId: null,
      branchId: null,
    },
  });
  if (decision && decision.allowed === true) {
    return { ok: true };
  }
  const roles = await db.query(
    `SELECT 1
       FROM blessboard.user_roles
      WHERE user_id = $1
        AND role_key = 'platform_admin'
        AND status = 'active'
      LIMIT 1`,
    [userId]
  );
  if (roles.rows[0]) {
    return { ok: true };
  }
  return {
    ok: false,
    status: STATUS.FORBIDDEN,
    reason: (decision && decision.reasonCode) || "forbidden",
  };
}

function roleMarkers(roleKey, sensitivity, permissionGroups) {
  const key = String(roleKey || "");
  const perms = [];
  if (permissionGroups && typeof permissionGroups === "object") {
    for (const group of Object.values(permissionGroups)) {
      if (Array.isArray(group)) perms.push(...group);
    }
  }
  const markers = [];
  if (
    /pastoral|minister|pastor|welfare/i.test(key) ||
    perms.some(
      (p) => String(p).startsWith("pastoral_") || String(p).startsWith("welfare_")
    )
  ) {
    markers.push("pastoral");
  }
  if (
    /safeguard/i.test(key) ||
    perms.some((p) => String(p).includes("safeguarding"))
  ) {
    markers.push("safeguarding");
  }
  if (
    /finance|giving/i.test(key) ||
    perms.some(
      (p) => String(p).startsWith("finance.") || String(p).startsWith("giving.")
    )
  ) {
    markers.push("finance");
  }
  if (/export/i.test(key) || perms.some((p) => String(p).includes("export"))) {
    markers.push("export");
  }
  if (
    /publish|website/i.test(key) ||
    perms.some((p) => String(p).includes("website.publish"))
  ) {
    markers.push("publication");
  }
  if (
    HIGHLY_SENSITIVE_ROLE_KEYS.includes(key) ||
    sensitivity === "Highly sensitive"
  ) {
    markers.push("highly_sensitive");
  } else if (sensitivity === "Sensitive" || markers.length) {
    markers.push("sensitive");
  }
  return markers;
}

function effectiveAccessSummary(userRow) {
  const roles = userRow.activeRoles || [];
  const keys = roles.map((r) => r.roleKey).filter(Boolean);
  const hasFinance = keys.some((k) => /finance|giving/i.test(k));
  const hasPastoral = keys.some((k) => /pastor|minister|welfare|safeguard/i.test(k));
  const hasExport = keys.some((k) => /export|auditor/i.test(k));
  const hasPublication = keys.some((k) => /publish|website/i.test(k));
  const parts = [];
  if (keys.length === 0) parts.push("No active roles");
  else parts.push(`${keys.length} active role${keys.length === 1 ? "" : "s"}`);
  if (hasFinance) parts.push("Finance");
  if (hasPastoral) parts.push("Pastoral/safeguarding");
  if (hasExport) parts.push("Export");
  if (hasPublication) parts.push("Publication");
  return parts.join(" · ");
}

async function resolveTeamOrganization(db, organizationKeyOrId) {
  const org = await resolveOrganizationTarget(db, organizationKeyOrId);
  if (!org) return null;
  let countryCode = org.country_code || null;
  if (!countryCode && org.church_id) {
    const cc = await db.query(
      `SELECT country_code FROM blessboard.churches WHERE id = $1 LIMIT 1`,
      [org.church_id]
    );
    countryCode = cc.rows[0] ? cc.rows[0].country_code : null;
  }
  return {
    id: org.id,
    organization_key: org.organization_key,
    display_name: org.display_name,
    church_id: org.church_id,
    church_key: org.church_key,
    church_name: org.church_name,
    country_code: countryCode,
  };
}

async function enrichLastLoginAndInvites(db, organizationId, churchId, users) {
  if (!users.length) return users;
  const ids = users.map((u) => u.id);
  const loginR = await db.query(
    `SELECT id, last_login_at FROM blessboard.users WHERE id = ANY($1::uuid[])`,
    [ids]
  );
  const loginMap = new Map(
    loginR.rows.map((r) => [String(r.id), r.last_login_at || null])
  );
  const pending = await listPendingInvitations(db, {
    organizationId,
    churchId,
    limit: 200,
  });
  const inviteByEmail = new Map();
  if (pending.ok) {
    for (const inv of pending.invitations) {
      const email = String(inv.emailDisplay || "")
        .trim()
        .toLowerCase();
      if (email) inviteByEmail.set(email, inv);
    }
  }
  return users.map((u) => {
    const email = String(u.emailDisplay || "")
      .trim()
      .toLowerCase();
    const invite = inviteByEmail.get(email) || null;
    const activeRoles = u.activeRoles || [];
    const legacyRoles = activeRoles.filter((r) => r.source === "legacy");
    const rbacRoles = activeRoles.filter((r) => r.source === "rbac");
    const scopes = [
      ...new Set(activeRoles.map((r) => r.scopeType).filter(Boolean)),
    ];
    const expiries = rbacRoles
      .map((r) => r.expiresAt)
      .filter(Boolean)
      .sort();
    return {
      ...u,
      lastLoginAt: loginMap.get(String(u.id)) || null,
      invitationStatus: invite
        ? "pending"
        : String(u.status) === "invited"
          ? "invited"
          : "none",
      pendingInvitation: invite,
      branchNames: [
        ...new Set(
          legacyRoles
            .map((r) => r.branchDisplayName)
            .filter(Boolean)
        ),
      ],
      legacyRoleKeys: legacyRoles.map((r) => r.roleKey),
      rbacRoleKeys: rbacRoles.map((r) => r.roleKey),
      scopeSummary: scopes.join(", ") || "—",
      expirySummary: expiries.length ? String(expiries[0]) : "—",
      effectiveAccessSummary: effectiveAccessSummary(u),
    };
  });
}

async function listOrganizationTeam(db, input) {
  const gate = await assertPlatformPermission(
    db,
    input.actorUserId,
    "platform.roles.view"
  );
  if (!gate.ok) {
    return {
      ok: false,
      status: gate.status,
      reason: gate.reason,
      users: [],
      organization: null,
    };
  }

  const org = await resolveTeamOrganization(db, input.organizationKeyOrId);
  if (!org) {
    return {
      ok: false,
      status: STATUS.NOT_FOUND,
      reason: "organization",
      users: [],
      organization: null,
    };
  }

  const tenantContext = buildTenantContext(org);
  const listed = await listStaffAccess(db, {
    actorUserId: input.actorUserId,
    organizationId: org.id,
    churchId: org.church_id,
    tenantContext,
    q: input.q,
    branchId: input.branchId,
    roleKey: input.roleKey,
    assignmentStatus: input.assignmentStatus,
    sensitivity: input.sensitivity,
  });
  if (!listed.ok) {
    return {
      ok: false,
      status:
        listed.status === STAFF_STATUS.FORBIDDEN
          ? STATUS.FORBIDDEN
          : listed.status === STAFF_STATUS.INVALID_INPUT
            ? STATUS.INVALID_INPUT
            : STATUS.LOOKUP_ERROR,
      reason: listed.reason,
      users: [],
      organization: org,
    };
  }

  const users = await enrichLastLoginAndInvites(
    db,
    org.id,
    org.church_id,
    listed.users || []
  );
  for (const u of users) {
    u.churchName = org.church_name;
  }

  const pending = await listPendingInvitations(db, {
    organizationId: org.id,
    churchId: org.church_id,
    limit: 100,
  });

  await recordAuditEventSafe(db, {
    deploymentCode: deploymentCode(input.env),
    organizationId: org.id,
    churchId: org.church_id,
    actorUserId: input.actorUserId,
    actionKey: "platform.team.view",
    entityType: "organization",
    entityId: org.id,
    outcome: "success",
    metadata: { source: "platform_admin", actor_type: "platform_admin", count: users.length },
  });

  return {
    ok: true,
    status: STATUS.OK,
    organization: org,
    users,
    pendingInvitations: pending.ok ? pending.invitations : [],
    tenantContext,
  };
}

async function getOrganizationTeamMember(db, input) {
  const gate = await assertPlatformPermission(
    db,
    input.actorUserId,
    "platform.roles.view"
  );
  if (!gate.ok) {
    return { ok: false, status: gate.status, reason: gate.reason, detail: null };
  }

  const org = await resolveTeamOrganization(db, input.organizationKeyOrId);
  if (!org) {
    return {
      ok: false,
      status: STATUS.NOT_FOUND,
      reason: "organization",
      detail: null,
    };
  }
  const userId = String(input.userId || "").trim();
  if (!UUID_RE.test(userId)) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      reason: "user_id",
      detail: null,
    };
  }

  const tenantContext = buildTenantContext(org);
  const detail = await getStaffAccessDetail(db, {
    actorUserId: input.actorUserId,
    organizationId: org.id,
    churchId: org.church_id,
    tenantContext,
    userId,
  });
  if (!detail.ok) {
    return {
      ok: false,
      status:
        detail.status === STAFF_STATUS.NOT_FOUND
          ? STATUS.NOT_FOUND
          : detail.status === STAFF_STATUS.FORBIDDEN
            ? STATUS.FORBIDDEN
            : STATUS.LOOKUP_ERROR,
      reason: detail.reason,
      detail: null,
      organization: org,
    };
  }

  const loginR = await db.query(
    `SELECT last_login_at FROM blessboard.users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  detail.user.lastLoginAt = loginR.rows[0] ? loginR.rows[0].last_login_at : null;
  detail.organization = org;
  detail.tenantContext = tenantContext;

  const catalogue = await listRoleCatalogue(db, {
    actorUserId: input.actorUserId,
    organizationId: org.id,
    churchId: org.church_id,
    tenantContext,
  });
  const scopeOptions = await listAssignableScopeOptions(db, {
    organizationId: org.id,
    churchId: org.church_id,
  });

  await recordAuditEventSafe(db, {
    deploymentCode: deploymentCode(input.env),
    organizationId: org.id,
    churchId: org.church_id,
    actorUserId: input.actorUserId,
    actionKey: "platform.team.view_member",
    entityType: "user",
    entityId: userId,
    outcome: "success",
    metadata: { source: "platform_admin", actor_type: "platform_admin" },
  });

  return {
    ok: true,
    status: STATUS.OK,
    organization: org,
    detail,
    assignableRoles: (catalogue.ok ? catalogue.roles : []).map((r) => ({
      ...r,
      markers: roleMarkers(r.roleKey, r.sensitivityLabel, r.permissionGroups),
    })),
    scopeOptions: scopeOptions.ok ? scopeOptions.options : {},
    scopeTypes: CHURCH_ASSIGNABLE_SCOPE_TYPES.slice(),
  };
}

async function getTeamInviteContext(db, input) {
  const gate = await assertPlatformPermission(
    db,
    input.actorUserId,
    "platform.users.invite"
  );
  if (!gate.ok) {
    return { ok: false, status: gate.status, reason: gate.reason };
  }
  const viewGate = await assertPlatformPermission(
    db,
    input.actorUserId,
    "platform.roles.view"
  );
  if (!viewGate.ok) {
    return { ok: false, status: viewGate.status, reason: viewGate.reason };
  }

  const org = await resolveTeamOrganization(db, input.organizationKeyOrId);
  if (!org) {
    return { ok: false, status: STATUS.NOT_FOUND, reason: "organization" };
  }
  const tenantContext = buildTenantContext(org);
  const catalogue = await listRoleCatalogue(db, {
    actorUserId: input.actorUserId,
    organizationId: org.id,
    churchId: org.church_id,
    tenantContext,
  });
  const scopeOptions = await listAssignableScopeOptions(db, {
    organizationId: org.id,
    churchId: org.church_id,
  });
  const branchOptions =
    scopeOptions.ok && scopeOptions.options && Array.isArray(scopeOptions.options.branch)
      ? scopeOptions.options.branch.map((b) => ({
          id: b.id,
          displayName: b.label || b.displayName || b.id,
          branchKey: b.key || null,
        }))
      : [];

  return {
    ok: true,
    status: STATUS.OK,
    organization: org,
    tenantContext,
    branches: branchOptions,
    assignableRoles: (catalogue.ok ? catalogue.roles : []).map((r) => ({
      ...r,
      markers: roleMarkers(r.roleKey, r.sensitivityLabel, r.permissionGroups),
    })),
    scopeOptions: scopeOptions.ok ? scopeOptions.options : {},
    scopeTypes: CHURCH_ASSIGNABLE_SCOPE_TYPES.slice(),
  };
}

async function detectTeamUserByEmail(db, input) {
  const gate = await assertPlatformPermission(
    db,
    input.actorUserId,
    "platform.users.invite"
  );
  if (!gate.ok) {
    return { ok: false, status: gate.status, reason: gate.reason, user: null };
  }
  const email = normalizeEmail(String((input && input.email) || ""));
  if (!email || !EMAIL_RE.test(email)) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      reason: "email",
      user: null,
    };
  }
  const row = await authRepo.findUserByEmail(db, email);
  if (!row) {
    return { ok: true, status: STATUS.OK, user: null, email };
  }
  return {
    ok: true,
    status: STATUS.OK,
    email,
    user: {
      id: row.id,
      emailDisplay: row.email_display || row.email_normalized,
      displayName: row.display_name,
      status: row.status,
      lastLoginAt: row.last_login_at || null,
    },
  };
}

function parseRoleAssignmentsBody(body) {
  const out = [];
  if (!body || typeof body !== "object") return out;

  const keys = [].concat(body.role_key || []).filter(Boolean);
  if (!keys.length && body.role_key) keys.push(body.role_key);
  const scopeTypes = [].concat(body.scope_type || []);
  const scopeIds = [].concat(body.scope_id || []);
  const reasons = [].concat(body.assignment_reason || []);
  const expiries = [].concat(body.expires_at || []);

  for (let i = 0; i < keys.length; i += 1) {
    const roleKey = String(keys[i] || "").trim();
    if (!roleKey) continue;
    out.push({
      roleKey,
      scopeType: String(
        scopeTypes[i] != null ? scopeTypes[i] : scopeTypes[0] || "church"
      ).trim(),
      scopeId:
        String(scopeIds[i] != null ? scopeIds[i] : scopeIds[0] || "").trim() ||
        null,
      assignmentReason: String(
        reasons[i] != null ? reasons[i] : reasons[0] || ""
      ).trim(),
      expiresAt:
        String(expiries[i] != null ? expiries[i] : expiries[0] || "").trim() ||
        null,
    });
  }
  return out;
}

async function inviteOrganizationTeamMember(db, input) {
  const gate = await assertPlatformPermission(
    db,
    input.actorUserId,
    "platform.users.invite"
  );
  if (!gate.ok) {
    return { ok: false, status: gate.status, reason: gate.reason };
  }

  const org = await resolveTeamOrganization(db, input.organizationKeyOrId);
  if (!org) {
    return { ok: false, status: STATUS.NOT_FOUND, reason: "organization" };
  }

  if (
    input.submittedOrganizationId &&
    String(input.submittedOrganizationId).trim() &&
    String(input.submittedOrganizationId).trim() !== String(org.id)
  ) {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "forged_organization" };
  }

  const firstName = String((input.firstName || "").trim());
  const lastName = String((input.lastName || "").trim());
  const emailDisplay = String((input.email || "").trim());
  const phone = String((input.phone || "").trim()).slice(0, 40);
  const leadershipTitle = String((input.leadershipTitle || "").trim()).slice(
    0,
    120
  );
  const body = input.body || {};
  let branchId =
    input.branchId != null && String(input.branchId).trim()
      ? String(input.branchId).trim()
      : null;
  const branchKey =
    input.branchKey != null && String(input.branchKey).trim()
      ? String(input.branchKey).trim().toLowerCase()
      : body.branch_key
        ? String(body.branch_key).trim().toLowerCase()
        : "";
  if (!branchId && branchKey) {
    const byKey = await db.query(
      `SELECT b.id FROM blessboard.branches b
        JOIN blessboard.churches c ON c.id = b.church_id
       WHERE c.organization_id = $1 AND b.church_id = $2
         AND lower(b.branch_key) = $3 AND b.status = 'active'
       LIMIT 1`,
      [org.id, org.church_id, branchKey]
    );
    if (!byKey.rows[0]) {
      return { ok: false, status: STATUS.FORBIDDEN, reason: "forged_branch" };
    }
    branchId = String(byKey.rows[0].id);
  }
  const placementRaw = String(body.placement || input.placement || "")
    .trim()
    .toLowerCase();
  const placement =
    placementRaw === "branch" || placementRaw === "hq"
      ? placementRaw
      : branchId
        ? "branch"
        : "hq";
  if (placement === "hq") branchId = null;

  if (!phone) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      reason: "phone",
      message: "Enter a valid phone number.",
    };
  }
  if (!firstName || !lastName) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "name" };
  }

  const roleAssignments = Array.isArray(input.roleAssignments)
    ? input.roleAssignments
    : parseRoleAssignmentsBody(body);
  const primaryRole =
    (roleAssignments[0] && roleAssignments[0].roleKey) ||
    String(body.role_key || input.roleKey || "").trim() ||
    (placement === "branch" ? "branch_admin" : "church_hq_admin");
  const assignmentReason =
    (roleAssignments[0] && roleAssignments[0].assignmentReason) ||
    String(body.assignment_reason || input.assignmentReason || "").trim() ||
    null;
  const expiresAt =
    (roleAssignments[0] && roleAssignments[0].expiresAt) ||
    body.expires_at ||
    input.expiresAt ||
    null;

  if (String(primaryRole) === "platform_administrator" || String(primaryRole) === "platform_admin") {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "platform_scope_forbidden" };
  }

  const roleMeta = await db.query(
    `SELECT role_key, is_sensitive FROM blessboard.roles
      WHERE role_key = $1 AND is_active = true LIMIT 1`,
    [primaryRole]
  );
  const needsSensitive =
    (roleMeta.rows[0] && roleMeta.rows[0].is_sensitive) ||
    HIGHLY_SENSITIVE_ROLE_KEYS.includes(String(primaryRole));
  if (roleMeta.rows[0]) {
    const assignPerm = needsSensitive
      ? "platform.roles.assign_sensitive"
      : "platform.roles.assign_standard";
    const assignGate = await assertPlatformPermission(
      db,
      input.actorUserId,
      assignPerm
    );
    if (!assignGate.ok) {
      return { ok: false, status: STATUS.FORBIDDEN, reason: "assign_permission" };
    }
  }

  const created = await createScopedTeamMember(db, {
    organizationId: org.id,
    churchId: org.church_id,
    actorUserId: input.actorUserId,
    firstName,
    lastName,
    phone,
    email: emailDisplay || undefined,
    leadershipTitle,
    placement,
    branchId,
    roleKey: primaryRole,
    assignmentReason,
    expiresAt,
    country: org.country_code || null,
    actorSource: "platform_admin",
    invitationAcceptBase: input.invitationAcceptBase || "/invite/accept",
    env: input.env,
    deploymentCode: deploymentCode(input.env),
  });

  if (!created.ok) {
    return {
      ok: false,
      status:
        created.status === SCOPED_STATUS.CONFLICT
          ? STATUS.CONFLICT
          : created.status === SCOPED_STATUS.FORBIDDEN
            ? STATUS.FORBIDDEN
            : created.status === SCOPED_STATUS.INVALID_INPUT
              ? STATUS.INVALID_INPUT
              : created.status === SCOPED_STATUS.NOT_FOUND
                ? STATUS.NOT_FOUND
                : STATUS.LOOKUP_ERROR,
      reason: created.reason || "invite_failed",
      message: created.message,
      existingUser: created.existingUser || null,
      existingMember: created.existingMember || null,
    };
  }

  await recordAuditEventSafe(db, {
    deploymentCode: deploymentCode(input.env),
    organizationId: org.id,
    churchId: org.church_id,
    actorUserId: input.actorUserId,
    actionKey: "platform.team.invite",
    entityType: "user",
    entityId: created.userId,
    outcome: "success",
    metadata: {
      source: "platform_admin",
      actor_type: "platform_admin",
      entity_key: primaryRole,
      reason_code: placement,
      status: created.existingUser ? "existing_user" : "new_user",
    },
  });

  return {
    ok: true,
    status: STATUS.OK,
    organization: org,
    userId: created.userId,
    existingUser: Boolean(created.existingUser),
    inviteSkipped: false,
    invitation: created.invitation,
    rawToken: created.rawToken,
    invitationUrl: created.invitationUrl,
    whatsappUrl: created.whatsappUrl,
    shareMessage: created.shareMessage,
    placement: created.placement,
    branch: created.branch,
    church: created.church,
    role: created.role,
    scopeType: created.scopeType,
    phoneDisplay: created.phoneDisplay,
    emailDisplay: created.emailDisplay,
    displayName: created.displayName,
    assignmentResults: created.rbacAssignment
      ? [
          {
            roleKey: primaryRole,
            ok: true,
            assignmentId: created.rbacAssignment.id || null,
          },
        ]
      : [],
    leadershipTitle: leadershipTitle || null,
    result: created,
  };
}

async function assignOrganizationTeamRole(db, input) {
  const org = await resolveTeamOrganization(db, input.organizationKeyOrId);
  if (!org) {
    return { ok: false, status: STATUS.NOT_FOUND, reason: "organization" };
  }
  const userId = String(input.userId || "").trim();
  const actorUserId = String(input.actorUserId || "").trim();
  if (!UUID_RE.test(userId) || !UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  if (userId === actorUserId) {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "self_elevation" };
  }
  if (String(input.scopeType || "") === "platform") {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "platform_scope_forbidden" };
  }
  if (
    input.submittedOrganizationId &&
    String(input.submittedOrganizationId).trim() &&
    String(input.submittedOrganizationId).trim() !== String(org.id)
  ) {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "forged_organization" };
  }

  const roleKey = String(input.roleKey || "").trim();
  const roleMeta = await db.query(
    `SELECT role_key, is_sensitive FROM blessboard.roles
      WHERE role_key = $1 AND is_active = true LIMIT 1`,
    [roleKey]
  );
  if (!roleMeta.rows[0]) {
    return { ok: false, status: STATUS.NOT_FOUND, reason: "role" };
  }
  const needsSensitive =
    roleMeta.rows[0].is_sensitive ||
    HIGHLY_SENSITIVE_ROLE_KEYS.includes(String(roleMeta.rows[0].role_key));
  const assignPerm = needsSensitive
    ? "platform.roles.assign_sensitive"
    : "platform.roles.assign_standard";
  const gate = await assertPlatformPermission(db, actorUserId, assignPerm);
  if (!gate.ok) {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "assign_permission" };
  }
  if (needsSensitive && !String(input.assignmentReason || "").trim()) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "reason_required" };
  }

  let scopeType = String(input.scopeType || "church").trim();
  let scopeId = input.scopeId != null ? String(input.scopeId).trim() : "";
  let churchId = org.church_id;
  if (scopeType === "organisation") {
    churchId = null;
    scopeId = scopeId || org.id;
  } else if (scopeType === "church") {
    scopeId = org.church_id;
    churchId = org.church_id;
  } else if (scopeType === "branch") {
    churchId = org.church_id;
    if (scopeId) {
      const br = await db.query(
        `SELECT b.id FROM blessboard.branches b
          JOIN blessboard.churches c ON c.id = b.church_id
         WHERE b.id = $1 AND c.organization_id = $2 LIMIT 1`,
        [scopeId, org.id]
      );
      if (!br.rows[0]) {
        return {
          ok: false,
          status: STATUS.FORBIDDEN,
          reason: "cross_org_scope_mismatch",
        };
      }
    }
  }

  const tenantContext = buildTenantContext(org);
  let expiresAt = null;
  if (input.expiresAt) {
    const exp = new Date(input.expiresAt);
    if (Number.isNaN(exp.getTime())) {
      return { ok: false, status: STATUS.INVALID_INPUT, reason: "expires_at" };
    }
    expiresAt = exp.toISOString();
  }

  const created = await createRoleAssignment(db, {
    actorUserId,
    userId,
    roleKey,
    organizationId: org.id,
    churchId,
    scopeType,
    scopeId,
    assignmentOrigin: "manual",
    assignmentReason: input.assignmentReason || null,
    expiresAt,
    tenantContext,
    actorChurchId: org.church_id,
    forbidPlatformScope: true,
  });

  if (!created.ok) {
    return {
      ok: false,
      status:
        created.status === "forbidden"
          ? STATUS.FORBIDDEN
          : created.status === "invalid_input"
            ? STATUS.INVALID_INPUT
            : created.status === "conflict"
              ? STATUS.CONFLICT
              : STATUS.LOOKUP_ERROR,
      reason: created.reason,
    };
  }

  await recordAuditEventSafe(db, {
    deploymentCode: deploymentCode(input.env),
    organizationId: org.id,
    churchId: org.church_id,
    actorUserId,
    actionKey: "platform.team.assign",
    entityType: "user_role_assignment",
    entityId: created.assignment && created.assignment.id,
    outcome: "success",
    metadata: {
      source: "platform_admin",
      actor_type: "platform_admin",
      entity_key: roleKey,
      reason_code: created.idempotent ? "idempotent" : "assigned",
    },
  });

  return {
    ok: true,
    status: STATUS.OK,
    assignment: created.assignment,
    idempotent: Boolean(created.idempotent),
    organization: org,
  };
}

async function revokeOrganizationTeamRole(db, input) {
  const gate = await assertPlatformPermission(
    db,
    input.actorUserId,
    "platform.roles.revoke"
  );
  if (!gate.ok) {
    return { ok: false, status: gate.status, reason: gate.reason };
  }

  const org = await resolveTeamOrganization(db, input.organizationKeyOrId);
  if (!org) {
    return { ok: false, status: STATUS.NOT_FOUND, reason: "organization" };
  }
  const userId = String(input.userId || "").trim();
  const assignmentId = String(input.assignmentId || "").trim();
  const actorUserId = String(input.actorUserId || "").trim();
  if (![userId, assignmentId, actorUserId].every((x) => UUID_RE.test(x))) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  if (userId === actorUserId) {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "self_elevation" };
  }

  const owned = await db.query(
    `SELECT id, user_id, organization_id, status
       FROM blessboard.user_role_assignments
      WHERE id = $1 LIMIT 1`,
    [assignmentId]
  );
  const row = owned.rows[0];
  if (!row) {
    return { ok: false, status: STATUS.NOT_FOUND, reason: "assignment" };
  }
  if (
    String(row.organization_id) !== String(org.id) ||
    String(row.user_id) !== userId
  ) {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "forged_organization" };
  }

  const tenantContext = buildTenantContext(org);
  const revoked = await revokeRoleAssignment(db, {
    actorUserId,
    assignmentId,
    revocationReason: input.revocationReason,
    tenantContext,
    actorChurchId: org.church_id,
  });
  if (!revoked.ok) {
    return {
      ok: false,
      status:
        revoked.status === "forbidden"
          ? STATUS.FORBIDDEN
          : revoked.status === "invalid_input"
            ? STATUS.INVALID_INPUT
            : revoked.status === "conflict"
              ? STATUS.CONFLICT
              : STATUS.LOOKUP_ERROR,
      reason: revoked.reason,
    };
  }

  await recordAuditEventSafe(db, {
    deploymentCode: deploymentCode(input.env),
    organizationId: org.id,
    churchId: org.church_id,
    actorUserId,
    actionKey: "platform.team.revoke",
    entityType: "user_role_assignment",
    entityId: assignmentId,
    outcome: "success",
    metadata: { source: "platform_admin", actor_type: "platform_admin", entity_key: "revoke" },
  });

  return { ok: true, status: STATUS.OK, organization: org };
}

async function resendOrganizationTeamInvitation(db, input) {
  const gate = await assertPlatformPermission(
    db,
    input.actorUserId,
    "platform.users.invite"
  );
  if (!gate.ok) {
    return { ok: false, status: gate.status, reason: gate.reason };
  }
  const org = await resolveTeamOrganization(db, input.organizationKeyOrId);
  if (!org) {
    return { ok: false, status: STATUS.NOT_FOUND, reason: "organization" };
  }
  const emailDisplay = String((input.email || "").trim());
  const roleKey = String((input.roleKey || "church_hq_admin").trim().toLowerCase());
  const branchId =
    input.branchId != null && String(input.branchId).trim()
      ? String(input.branchId).trim()
      : null;
  const displayName = String((input.displayName || emailDisplay).trim()).slice(
    0,
    200
  );

  const result = await inviteBlessBoardStaff(db, {
    organizationId: org.id,
    churchId: org.church_id,
    actorUserId: input.actorUserId,
    email: emailDisplay,
    roleKey,
    displayName,
    branchId,
    env: input.env,
    deploymentCode: deploymentCode(input.env),
  });
  if (!result.ok) {
    return {
      ok: false,
      status:
        result.status === INVITE_STATUS.CONFLICT
          ? STATUS.CONFLICT
          : result.status === INVITE_STATUS.FORBIDDEN
            ? STATUS.FORBIDDEN
            : STATUS.LOOKUP_ERROR,
      reason: result.reason,
    };
  }
  await recordAuditEventSafe(db, {
    deploymentCode: deploymentCode(input.env),
    organizationId: org.id,
    churchId: org.church_id,
    actorUserId: input.actorUserId,
    actionKey: "platform.team.invite_resent",
    entityType: "user_invitation",
    entityId: result.invitation && result.invitation.id,
    outcome: "success",
    metadata: { source: "platform_admin", actor_type: "platform_admin" },
  });
  return {
    ok: true,
    status: STATUS.OK,
    invitation: result.invitation,
    rawToken: result.rawToken,
    organization: org,
  };
}

module.exports = {
  STATUS,
  CHURCH_ASSIGNABLE_SCOPE_TYPES,
  sensitivityLabel,
  resolveTeamOrganization,
  listOrganizationTeam,
  getOrganizationTeamMember,
  getTeamInviteContext,
  detectTeamUserByEmail,
  inviteOrganizationTeamMember,
  assignOrganizationTeamRole,
  revokeOrganizationTeamRole,
  resendOrganizationTeamInvitation,
  parseRoleAssignmentsBody,
  roleMarkers,
};
