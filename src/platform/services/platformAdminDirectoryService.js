"use strict";

/**
 * Platform Admin directory: cross-organisation staff-user and member discovery.
 * Safe field projection only — no passwords, tokens, pastoral, welfare, or Finance.
 */

const { recordAuditEventSafe } = require("./auditEventService");
const { getPlatformDeploymentCode } = require("../config/platformDeploymentCode");
const {
  authorize,
} = require("../../blessboard/services/blessBoardRbacAuthorizationService");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  LOOKUP_ERROR: "lookup_error",
});

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const ALLOWED_LIMITS = Object.freeze([10, 25, 50, 100]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const USER_STATUSES = Object.freeze([
  "active",
  "inactive",
  "suspended",
  "invited",
]);
const MEMBER_STATUSES = Object.freeze([
  "pending",
  "active",
  "inactive",
  "suspended",
  "archived",
]);

function snapLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  const rounded = Math.floor(n);
  if (ALLOWED_LIMITS.includes(rounded)) return rounded;
  if (rounded <= 0) return DEFAULT_LIMIT;
  if (rounded > MAX_LIMIT) return MAX_LIMIT;
  let best = DEFAULT_LIMIT;
  let bestDist = Infinity;
  for (const allowed of ALLOWED_LIMITS) {
    const d = Math.abs(allowed - rounded);
    if (d < bestDist) {
      best = allowed;
      bestDist = d;
    }
  }
  return best;
}

function normalizePage(raw) {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 10000);
}

function sanitizeQ(raw) {
  if (raw == null) return "";
  return String(raw).trim().slice(0, 100).replace(/[%_]/g, "");
}

function deploymentCode(env) {
  const id = getPlatformDeploymentCode(env || process.env);
  return id && id.ok ? id.code : "blessboard-org-v5";
}

function normalizeOrgKey(raw) {
  if (raw == null) return null;
  const key = String(raw)
    .trim()
    .toLowerCase()
    .slice(0, 64)
    .replace(/[^a-z0-9_-]/g, "");
  return key || null;
}

function normalizeUserListInput(query) {
  const q = query && typeof query === "object" ? query : {};
  const page = normalizePage(q.page);
  const limit = snapLimit(q.limit);
  const statusRaw = q.status != null ? String(q.status).trim().toLowerCase() : "";
  const status = USER_STATUSES.includes(statusRaw) ? statusRaw : null;
  const roleRaw =
    q.role != null ? String(q.role).trim().toLowerCase().slice(0, 64) : "";
  const roleKey = roleRaw && /^[a-z][a-z0-9_]{0,63}$/.test(roleRaw) ? roleRaw : null;
  const organizationId =
    q.organizationId != null && UUID_RE.test(String(q.organizationId).trim())
      ? String(q.organizationId).trim()
      : null;
  const churchId =
    q.churchId != null && UUID_RE.test(String(q.churchId).trim())
      ? String(q.churchId).trim()
      : null;
  const branchId =
    q.branchId != null && UUID_RE.test(String(q.branchId).trim())
      ? String(q.branchId).trim()
      : null;
  return {
    ok: true,
    value: {
      page,
      limit,
      offset: (page - 1) * limit,
      q: sanitizeQ(q.q),
      status,
      roleKey,
      organizationId,
      organizationKey: normalizeOrgKey(q.organizationKey),
      churchId,
      branchId,
    },
  };
}

function normalizeMemberListInput(query) {
  const q = query && typeof query === "object" ? query : {};
  const page = normalizePage(q.page);
  const limit = snapLimit(q.limit);
  const statusRaw = q.status != null ? String(q.status).trim().toLowerCase() : "";
  const status = MEMBER_STATUSES.includes(statusRaw) ? statusRaw : null;
  const organizationId =
    q.organizationId != null && UUID_RE.test(String(q.organizationId).trim())
      ? String(q.organizationId).trim()
      : null;
  const churchId =
    q.churchId != null && UUID_RE.test(String(q.churchId).trim())
      ? String(q.churchId).trim()
      : null;
  const branchId =
    q.branchId != null && UUID_RE.test(String(q.branchId).trim())
      ? String(q.branchId).trim()
      : null;
  const memberNumber =
    q.memberNumber != null ? String(q.memberNumber).trim().slice(0, 64) : "";
  return {
    ok: true,
    value: {
      page,
      limit,
      offset: (page - 1) * limit,
      q: sanitizeQ(q.q),
      status,
      organizationId,
      organizationKey: normalizeOrgKey(q.organizationKey),
      churchId,
      branchId,
      memberNumber: memberNumber || null,
    },
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

async function resolveOrganizationFilter(client, filters) {
  if (filters.organizationId) {
    const r = await client.query(
      `SELECT id, organization_key, display_name
         FROM platform.organizations WHERE id = $1 LIMIT 1`,
      [filters.organizationId]
    );
    return r.rows[0] || null;
  }
  if (filters.organizationKey) {
    const r = await client.query(
      `SELECT id, organization_key, display_name
         FROM platform.organizations WHERE organization_key = $1 LIMIT 1`,
      [filters.organizationKey]
    );
    return r.rows[0] || null;
  }
  return null;
}

function mapStaffUserRow(row) {
  return {
    userId: String(row.user_id),
    displayName: String(row.display_name || ""),
    emailDisplay: row.email_display != null ? String(row.email_display) : null,
    status: String(row.user_status || ""),
    lastLoginAt: row.last_login_at || null,
    invitationState: String(row.invitation_state || "none"),
    organizationId: row.organization_id != null ? String(row.organization_id) : null,
    organizationKey: row.organization_key != null ? String(row.organization_key) : null,
    organizationName: row.organization_name != null ? String(row.organization_name) : null,
    churchId: row.church_id != null ? String(row.church_id) : null,
    churchKey: row.church_key != null ? String(row.church_key) : null,
    churchName: row.church_name != null ? String(row.church_name) : null,
    branchId: row.branch_id != null ? String(row.branch_id) : null,
    branchKey: row.branch_key != null ? String(row.branch_key) : null,
    branchName: row.branch_name != null ? String(row.branch_name) : null,
    legacyRoles: Array.isArray(row.legacy_roles)
      ? row.legacy_roles.filter(Boolean)
      : [],
    rbacRoles: Array.isArray(row.rbac_roles) ? row.rbac_roles.filter(Boolean) : [],
  };
}

function mapMemberRow(row) {
  const id = String(row.member_id);
  const preferred = row.preferred_name != null ? String(row.preferred_name).trim() : "";
  const composed = `${row.first_name || ""} ${row.last_name || ""}`.trim();
  return {
    memberId: id,
    memberNumber: id,
    displayName: preferred || composed || "—",
    firstName: row.first_name != null ? String(row.first_name) : null,
    lastName: row.last_name != null ? String(row.last_name) : null,
    emailDisplay: row.email_display != null ? String(row.email_display) : null,
    phoneDisplay: row.phone_display != null ? String(row.phone_display) : null,
    status: String(row.member_status || ""),
    accountLinked: Boolean(row.user_id),
    linkedUserId: row.user_id != null ? String(row.user_id) : null,
    organizationId: String(row.organization_id),
    organizationKey: String(row.organization_key || ""),
    organizationName: String(row.organization_name || ""),
    churchId: String(row.church_id),
    churchKey: row.church_key != null ? String(row.church_key) : null,
    churchName: row.church_name != null ? String(row.church_name) : null,
    branchId: row.branch_id != null ? String(row.branch_id) : null,
    branchKey: row.branch_key != null ? String(row.branch_key) : null,
    branchName: row.branch_name != null ? String(row.branch_name) : null,
    membershipStatus:
      row.membership_status != null ? String(row.membership_status) : null,
    registeredAt: row.created_at || null,
  };
}

async function listPlatformUsers(db, input) {
  const gate = await assertPlatformPermission(
    db,
    input.actorUserId,
    "platform.users.view"
  );
  if (!gate.ok) {
    return { ok: false, status: gate.status, reason: gate.reason, users: [], total: 0 };
  }
  const f = normalizeUserListInput(input.filters || {}).value;

  try {
    const org = await resolveOrganizationFilter(db, f);
    if ((f.organizationId || f.organizationKey) && !org) {
      return {
        ok: true,
        status: STATUS.OK,
        users: [],
        total: 0,
        page: f.page,
        limit: f.limit,
        totalPages: 0,
        filters: f,
      };
    }
    const orgId = org ? org.id : f.organizationId;

    const params = [];
    const where = ["u.status IS NOT NULL"];
    let i = 1;

    where.push(`(
      EXISTS (
        SELECT 1 FROM blessboard.user_roles ur0
         WHERE ur0.user_id = u.id AND ur0.status = 'active'
      )
      OR EXISTS (
        SELECT 1 FROM blessboard.user_role_assignments ura0
         WHERE ura0.user_id = u.id AND ura0.status = 'active' AND ura0.revoked_at IS NULL
      )
      OR EXISTS (
        SELECT 1 FROM blessboard.user_invitations ui0
         WHERE lower(ui0.email_normalized) = u.email_normalized
           AND ui0.status = 'pending'
      )
    )`);

    if (f.q) {
      const like = `%${f.q.toLowerCase()}%`;
      where.push(
        `(lower(u.display_name) LIKE $${i} OR lower(u.email_normalized) LIKE $${i} OR lower(COALESCE(u.email_display, '')) LIKE $${i})`
      );
      params.push(like);
      i += 1;
    }
    if (f.status) {
      where.push(`u.status = $${i++}`);
      params.push(f.status);
    }
    if (orgId) {
      where.push(`(
        EXISTS (
          SELECT 1 FROM blessboard.user_roles ur
           WHERE ur.user_id = u.id AND ur.organization_id = $${i} AND ur.status = 'active'
        )
        OR EXISTS (
          SELECT 1 FROM blessboard.user_role_assignments ura
           WHERE ura.user_id = u.id AND ura.organization_id = $${i}
             AND ura.status = 'active' AND ura.revoked_at IS NULL
        )
        OR EXISTS (
          SELECT 1 FROM blessboard.user_invitations ui
           WHERE lower(ui.email_normalized) = u.email_normalized
             AND ui.organization_id = $${i} AND ui.status = 'pending'
        )
      )`);
      params.push(orgId);
      i += 1;
    }
    if (f.churchId) {
      where.push(`(
        EXISTS (
          SELECT 1 FROM blessboard.user_roles ur
           WHERE ur.user_id = u.id AND ur.church_id = $${i} AND ur.status = 'active'
        )
        OR EXISTS (
          SELECT 1 FROM blessboard.user_role_assignments ura
           WHERE ura.user_id = u.id AND ura.church_id = $${i}
             AND ura.status = 'active' AND ura.revoked_at IS NULL
        )
      )`);
      params.push(f.churchId);
      i += 1;
    }
    if (f.branchId) {
      where.push(`(
        EXISTS (
          SELECT 1 FROM blessboard.user_roles ur
           WHERE ur.user_id = u.id AND ur.branch_id = $${i} AND ur.status = 'active'
        )
        OR EXISTS (
          SELECT 1 FROM blessboard.user_role_assignments ura
           WHERE ura.user_id = u.id AND ura.scope_type = 'branch' AND ura.scope_id = $${i}
             AND ura.status = 'active' AND ura.revoked_at IS NULL
        )
      )`);
      params.push(f.branchId);
      i += 1;
    }
    if (f.roleKey) {
      where.push(`(
        EXISTS (
          SELECT 1 FROM blessboard.user_roles ur
           WHERE ur.user_id = u.id AND ur.role_key = $${i} AND ur.status = 'active'
        )
        OR EXISTS (
          SELECT 1 FROM blessboard.user_role_assignments ura
          JOIN blessboard.roles r ON r.id = ura.role_id
           WHERE ura.user_id = u.id AND r.role_key = $${i}
             AND ura.status = 'active' AND ura.revoked_at IS NULL
        )
      )`);
      params.push(f.roleKey);
      i += 1;
    }

    const whereSql = where.join(" AND ");
    const countRes = await db.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.users u WHERE ${whereSql}`,
      params
    );
    const total = countRes.rows[0] ? Number(countRes.rows[0].n) : 0;

    params.push(f.limit);
    params.push(f.offset);
    const listRes = await db.query(
      `SELECT u.id AS user_id, u.display_name, u.email_display, u.email_normalized,
              u.status AS user_status, u.last_login_at,
              CASE
                WHEN u.status = 'invited' THEN 'invited'
                WHEN EXISTS (
                  SELECT 1 FROM blessboard.user_invitations ui
                   WHERE lower(ui.email_normalized) = u.email_normalized
                     AND ui.status = 'pending'
                ) THEN 'pending_invitation'
                ELSE 'none'
              END AS invitation_state,
              (
                SELECT ur.organization_id FROM blessboard.user_roles ur
                 WHERE ur.user_id = u.id AND ur.status = 'active'
                 ORDER BY CASE ur.role_key
                   WHEN 'platform_admin' THEN 0
                   WHEN 'church_hq_admin' THEN 1
                   ELSE 2 END, ur.created_at ASC
                 LIMIT 1
              ) AS organization_id,
              (
                SELECT ur.church_id FROM blessboard.user_roles ur
                 WHERE ur.user_id = u.id AND ur.status = 'active'
                 ORDER BY CASE ur.role_key
                   WHEN 'platform_admin' THEN 0
                   WHEN 'church_hq_admin' THEN 1
                   ELSE 2 END, ur.created_at ASC
                 LIMIT 1
              ) AS church_id,
              (
                SELECT ur.branch_id FROM blessboard.user_roles ur
                 WHERE ur.user_id = u.id AND ur.status = 'active' AND ur.branch_id IS NOT NULL
                 ORDER BY ur.created_at ASC
                 LIMIT 1
              ) AS branch_id,
              COALESCE((
                SELECT array_agg(DISTINCT ur.role_key ORDER BY ur.role_key)
                  FROM blessboard.user_roles ur
                 WHERE ur.user_id = u.id AND ur.status = 'active'
              ), ARRAY[]::text[]) AS legacy_roles,
              COALESCE((
                SELECT array_agg(DISTINCT r.role_key ORDER BY r.role_key)
                  FROM blessboard.user_role_assignments ura
                  JOIN blessboard.roles r ON r.id = ura.role_id
                 WHERE ura.user_id = u.id AND ura.status = 'active' AND ura.revoked_at IS NULL
                   AND (ura.expires_at IS NULL OR ura.expires_at > now())
              ), ARRAY[]::text[]) AS rbac_roles
         FROM blessboard.users u
        WHERE ${whereSql}
        ORDER BY u.display_name ASC, u.email_normalized ASC, u.id ASC
        LIMIT $${i++} OFFSET $${i++}`,
      params
    );

    const orgIds = [
      ...new Set(listRes.rows.map((r) => r.organization_id).filter(Boolean)),
    ];
    const churchIds = [
      ...new Set(listRes.rows.map((r) => r.church_id).filter(Boolean)),
    ];
    const branchIds = [
      ...new Set(listRes.rows.map((r) => r.branch_id).filter(Boolean)),
    ];
    const orgMap = new Map();
    const churchMap = new Map();
    const branchMap = new Map();
    if (orgIds.length) {
      const or = await db.query(
        `SELECT id, organization_key, display_name FROM platform.organizations WHERE id = ANY($1::uuid[])`,
        [orgIds]
      );
      for (const row of or.rows) orgMap.set(String(row.id), row);
    }
    if (churchIds.length) {
      const cr = await db.query(
        `SELECT id, church_key, display_name FROM blessboard.churches WHERE id = ANY($1::uuid[])`,
        [churchIds]
      );
      for (const row of cr.rows) churchMap.set(String(row.id), row);
    }
    if (branchIds.length) {
      const br = await db.query(
        `SELECT id, branch_key, display_name FROM blessboard.branches WHERE id = ANY($1::uuid[])`,
        [branchIds]
      );
      for (const row of br.rows) branchMap.set(String(row.id), row);
    }

    const users = listRes.rows.map((row) => {
      const o = row.organization_id ? orgMap.get(String(row.organization_id)) : null;
      const c = row.church_id ? churchMap.get(String(row.church_id)) : null;
      const b = row.branch_id ? branchMap.get(String(row.branch_id)) : null;
      return mapStaffUserRow({
        ...row,
        organization_key: o ? o.organization_key : null,
        organization_name: o ? o.display_name : null,
        church_key: c ? c.church_key : null,
        church_name: c ? c.display_name : null,
        branch_key: b ? b.branch_key : null,
        branch_name: b ? b.display_name : null,
      });
    });

    const auditOrgId =
      orgId ||
      (input.auditOrganizationId && UUID_RE.test(String(input.auditOrganizationId))
        ? String(input.auditOrganizationId)
        : null);
    if (auditOrgId) {
      await recordAuditEventSafe(db, {
        deploymentCode: deploymentCode(input.env),
        organizationId: auditOrgId,
        churchId: f.churchId || null,
        actorUserId: input.actorUserId,
        actionKey: "platform.users.search",
        entityType: "user_directory",
        outcome: "success",
        metadata: {
          source: "platform_admin",
          count: users.length,
          actor_type: "platform_admin",
        },
      });
    }

    return {
      ok: true,
      status: STATUS.OK,
      users,
      total,
      page: f.page,
      limit: f.limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / f.limit),
      filters: f,
    };
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message).slice(0, 120) : "lookup",
      users: [],
      total: 0,
    };
  }
}

async function getPlatformUserDetail(db, input) {
  const gate = await assertPlatformPermission(
    db,
    input.actorUserId,
    "platform.users.view"
  );
  if (!gate.ok) {
    return { ok: false, status: gate.status, reason: gate.reason, user: null };
  }
  const userId = String(input.userId || "").trim();
  if (!UUID_RE.test(userId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "user_id", user: null };
  }
  try {
    const userRes = await db.query(
      `SELECT u.id AS user_id, u.display_name, u.email_display, u.email_normalized,
              u.status AS user_status, u.last_login_at, u.created_at, u.password_changed_at,
              (u.password_hash IS NOT NULL) AS has_password,
              COALESCE(u.password_change_required, false) AS password_change_required,
              u.sign_in_locked_until,
              CASE
                WHEN u.status = 'invited' THEN 'invited'
                WHEN EXISTS (
                  SELECT 1 FROM blessboard.user_invitations ui
                   WHERE lower(ui.email_normalized) = u.email_normalized
                     AND ui.status = 'pending'
                ) THEN 'pending_invitation'
                ELSE 'none'
              END AS invitation_state
         FROM blessboard.users u
        WHERE u.id = $1
        LIMIT 1`,
      [userId]
    );
    if (!userRes.rows[0]) {
      return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found", user: null };
    }
    const u = userRes.rows[0];
    const legacy = await db.query(
      `SELECT ur.role_key, ur.status, ur.organization_id, ur.church_id, ur.branch_id,
              o.organization_key, o.display_name AS organization_name,
              c.church_key, c.display_name AS church_name,
              b.branch_key, b.display_name AS branch_name
         FROM blessboard.user_roles ur
         LEFT JOIN platform.organizations o ON o.id = ur.organization_id
         LEFT JOIN blessboard.churches c ON c.id = ur.church_id
         LEFT JOIN blessboard.branches b ON b.id = ur.branch_id
        WHERE ur.user_id = $1 AND ur.status = 'active'
        ORDER BY ur.role_key ASC`,
      [userId]
    );
    const rbac = await db.query(
      `SELECT r.role_key, ura.status, ura.scope_type, ura.scope_id, ura.organization_id,
              ura.church_id, ura.expires_at, ura.assignment_origin,
              o.organization_key, o.display_name AS organization_name,
              c.church_key, c.display_name AS church_name
         FROM blessboard.user_role_assignments ura
         JOIN blessboard.roles r ON r.id = ura.role_id
         LEFT JOIN platform.organizations o ON o.id = ura.organization_id
         LEFT JOIN blessboard.churches c ON c.id = ura.church_id
        WHERE ura.user_id = $1 AND ura.status = 'active' AND ura.revoked_at IS NULL
        ORDER BY r.role_key ASC`,
      [userId]
    );
    const pendingInvites = await db.query(
      `SELECT ui.id, ui.role_key, ui.status, ui.expires_at, ui.organization_id,
              o.organization_key, o.display_name AS organization_name
         FROM blessboard.user_invitations ui
         LEFT JOIN platform.organizations o ON o.id = ui.organization_id
        WHERE lower(ui.email_normalized) = $1 AND ui.status = 'pending'
        ORDER BY ui.created_at DESC
        LIMIT 10`,
      [u.email_normalized]
    );

    const primaryOrg =
      (legacy.rows[0] && legacy.rows[0].organization_id) ||
      (rbac.rows[0] && rbac.rows[0].organization_id) ||
      null;
    const primaryChurch =
      (legacy.rows[0] && legacy.rows[0].church_id) ||
      (rbac.rows[0] && rbac.rows[0].church_id) ||
      null;

    const sessions = await db.query(
      `SELECT COUNT(*)::int AS count
         FROM platform.deployment_sessions
        WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()`,
      [userId]
    );

    const detail = {
      userId: String(u.user_id),
      displayName: String(u.display_name || ""),
      emailDisplay: u.email_display != null ? String(u.email_display) : null,
      status: String(u.user_status || ""),
      lastLoginAt: u.last_login_at || null,
      createdAt: u.created_at || null,
      passwordChangedAt: u.password_changed_at || null,
      hasPassword: Boolean(u.has_password),
      passwordChangeRequired: Boolean(u.password_change_required),
      signInLockedUntil: u.sign_in_locked_until || null,
      signInLocked:
        Boolean(u.sign_in_locked_until) &&
        new Date(u.sign_in_locked_until).getTime() > Date.now(),
      activeSessionCount: Number(sessions.rows[0] && sessions.rows[0].count) || 0,
      invitationState: String(u.invitation_state || "none"),
      legacyAssignments: legacy.rows.map((r) => ({
        roleKey: r.role_key,
        status: r.status,
        organizationId: r.organization_id,
        organizationKey: r.organization_key,
        organizationName: r.organization_name,
        churchId: r.church_id,
        churchKey: r.church_key,
        churchName: r.church_name,
        branchId: r.branch_id,
        branchKey: r.branch_key,
        branchName: r.branch_name,
      })),
      rbacAssignments: rbac.rows.map((r) => ({
        roleKey: r.role_key,
        status: r.status,
        scopeType: r.scope_type,
        scopeId: r.scope_id,
        organizationId: r.organization_id,
        organizationKey: r.organization_key,
        organizationName: r.organization_name,
        churchId: r.church_id,
        churchKey: r.church_key,
        churchName: r.church_name,
        expiresAt: r.expires_at,
        assignmentOrigin: r.assignment_origin,
      })),
      pendingInvitations: pendingInvites.rows.map((r) => ({
        invitationId: r.id,
        roleKey: r.role_key,
        status: r.status,
        expiresAt: r.expires_at,
        organizationKey: r.organization_key,
        organizationName: r.organization_name,
      })),
      supportContextAvailable: false,
      enterChurchAdminHref: null,
      enterChurchAdminLabel: "Enter church admin context (coming soon)",
      primaryOrganizationId: primaryOrg ? String(primaryOrg) : null,
      primaryChurchId: primaryChurch ? String(primaryChurch) : null,
    };

    if (primaryOrg) {
      await recordAuditEventSafe(db, {
        deploymentCode: deploymentCode(input.env),
        organizationId: String(primaryOrg),
        churchId: primaryChurch ? String(primaryChurch) : null,
        actorUserId: input.actorUserId,
        actionKey: "platform.users.view_detail",
        entityType: "user",
        entityId: userId,
        outcome: "success",
        metadata: { source: "platform_admin", actor_type: "platform_admin" },
      });
    }

    return { ok: true, status: STATUS.OK, user: detail };
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message).slice(0, 120) : "lookup",
      user: null,
    };
  }
}

async function listPlatformMembers(db, input) {
  const gate = await assertPlatformPermission(
    db,
    input.actorUserId,
    "platform.members.search"
  );
  if (!gate.ok) {
    return {
      ok: false,
      status: gate.status,
      reason: gate.reason,
      members: [],
      total: 0,
    };
  }
  const f = normalizeMemberListInput(input.filters || {}).value;

  try {
    const org = await resolveOrganizationFilter(db, f);
    if ((f.organizationId || f.organizationKey) && !org) {
      return {
        ok: true,
        status: STATUS.OK,
        members: [],
        total: 0,
        page: f.page,
        limit: f.limit,
        totalPages: 0,
        filters: f,
      };
    }
    const orgId = org ? org.id : f.organizationId;

    const params = [];
    const where = ["1=1"];
    let i = 1;

    if (orgId) {
      where.push(`o.id = $${i++}`);
      params.push(orgId);
    }
    if (f.churchId) {
      where.push(`c.id = $${i++}`);
      params.push(f.churchId);
    }
    if (f.branchId) {
      where.push(`mb.branch_id = $${i++}`);
      params.push(f.branchId);
    }
    if (f.status) {
      where.push(`m.status = $${i++}`);
      params.push(f.status);
    }
    if (f.memberNumber && UUID_RE.test(f.memberNumber)) {
      where.push(`m.id = $${i++}`);
      params.push(f.memberNumber);
    } else if (f.memberNumber) {
      where.push(`m.id::text ILIKE $${i++}`);
      params.push(`%${f.memberNumber.replace(/[^a-f0-9-]/gi, "").slice(0, 64)}%`);
    }
    if (f.q) {
      const like = `%${f.q.toLowerCase()}%`;
      const phoneQ = f.q.replace(/[^\d+]/g, "").slice(0, 32);
      where.push(`(
        lower(m.first_name) LIKE $${i}
        OR lower(m.last_name) LIKE $${i}
        OR lower(COALESCE(m.preferred_name, '')) LIKE $${i}
        OR lower(COALESCE(m.email_normalized, '')) LIKE $${i}
        OR COALESCE(m.phone_normalized, '') LIKE $${i + 1}
        OR m.id::text ILIKE $${i}
      )`);
      params.push(like);
      params.push(phoneQ ? `%${phoneQ}%` : like);
      i += 2;
    }

    const joinSql = `
      FROM blessboard.members m
      INNER JOIN blessboard.churches c ON c.id = m.church_id
      INNER JOIN platform.organizations o ON o.id = c.organization_id
      LEFT JOIN LATERAL (
        SELECT mb2.membership_status, mb2.is_primary, mb2.joined_at, mb2.branch_id
          FROM blessboard.member_branch_memberships mb2
         WHERE mb2.member_id = m.id
         ORDER BY mb2.is_primary DESC, mb2.joined_at ASC NULLS LAST, mb2.id ASC
         LIMIT 1
      ) mb ON true
      LEFT JOIN blessboard.branches b ON b.id = mb.branch_id
    `;
    const whereSql = where.join(" AND ");

    const countRes = await db.query(
      `SELECT COUNT(*)::int AS n ${joinSql} WHERE ${whereSql}`,
      params
    );
    const total = countRes.rows[0] ? Number(countRes.rows[0].n) : 0;

    params.push(f.limit);
    params.push(f.offset);
    const listRes = await db.query(
      `SELECT m.id AS member_id, m.church_id, m.user_id, m.first_name, m.last_name,
              m.preferred_name, m.email_display, m.phone_display, m.status AS member_status,
              m.created_at, o.id AS organization_id, o.organization_key,
              o.display_name AS organization_name,
              c.church_key, c.display_name AS church_name,
              mb.membership_status, mb.branch_id, b.branch_key, b.display_name AS branch_name
         ${joinSql}
        WHERE ${whereSql}
        ORDER BY m.last_name ASC, m.first_name ASC, m.id ASC
        LIMIT $${i++} OFFSET $${i++}`,
      params
    );

    const members = listRes.rows.map(mapMemberRow);

    const auditOrgId =
      orgId ||
      (input.auditOrganizationId && UUID_RE.test(String(input.auditOrganizationId))
        ? String(input.auditOrganizationId)
        : null);
    if (auditOrgId) {
      await recordAuditEventSafe(db, {
        deploymentCode: deploymentCode(input.env),
        organizationId: auditOrgId,
        churchId: f.churchId || (members[0] && members[0].churchId) || null,
        actorUserId: input.actorUserId,
        actionKey: "platform.members.search",
        entityType: "member_directory",
        outcome: "success",
        metadata: {
          source: "platform_admin",
          count: members.length,
          actor_type: "platform_admin",
        },
      });
    }

    return {
      ok: true,
      status: STATUS.OK,
      members,
      total,
      page: f.page,
      limit: f.limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / f.limit),
      filters: f,
    };
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message).slice(0, 120) : "lookup",
      members: [],
      total: 0,
    };
  }
}

async function getPlatformMemberSupportProfile(db, input) {
  const gate = await assertPlatformPermission(
    db,
    input.actorUserId,
    "platform.members.view_support_profile"
  );
  if (!gate.ok) {
    return { ok: false, status: gate.status, reason: gate.reason, member: null };
  }
  const memberId = String(input.memberId || "").trim();
  if (!UUID_RE.test(memberId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "member_id", member: null };
  }

  try {
    const res = await db.query(
      `SELECT m.id AS member_id, m.church_id, m.user_id, m.first_name, m.last_name,
              m.preferred_name, m.email_display, m.phone_display, m.status AS member_status,
              m.created_at, m.updated_at,
              o.id AS organization_id, o.organization_key, o.display_name AS organization_name,
              c.church_key, c.display_name AS church_name,
              mb.membership_status, mb.branch_id, mb.joined_at,
              b.branch_key, b.display_name AS branch_name,
              u.display_name AS linked_user_name, u.email_display AS linked_user_email,
              u.status AS linked_user_status, u.last_login_at AS linked_user_last_login_at
         FROM blessboard.members m
         INNER JOIN blessboard.churches c ON c.id = m.church_id
         INNER JOIN platform.organizations o ON o.id = c.organization_id
         LEFT JOIN LATERAL (
           SELECT mb2.membership_status, mb2.joined_at, mb2.branch_id
             FROM blessboard.member_branch_memberships mb2
            WHERE mb2.member_id = m.id
            ORDER BY mb2.is_primary DESC, mb2.joined_at ASC NULLS LAST
            LIMIT 1
         ) mb ON true
         LEFT JOIN blessboard.branches b ON b.id = mb.branch_id
         LEFT JOIN blessboard.users u ON u.id = m.user_id
        WHERE m.id = $1
        LIMIT 1`,
      [memberId]
    );
    if (!res.rows[0]) {
      return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found", member: null };
    }
    const row = res.rows[0];

    const audits = await db.query(
      `SELECT id, action_key, entity_type, outcome, created_at
         FROM platform.audit_events
        WHERE organization_id = $1
          AND entity_type IN ('member', 'member_registration', 'member_directory')
          AND entity_id = $2
        ORDER BY created_at DESC
        LIMIT 25`,
      [row.organization_id, memberId]
    );

    const profile = {
      ...mapMemberRow(row),
      updatedAt: row.updated_at || null,
      joinedAt: row.joined_at || null,
      linkedUserName: row.linked_user_name != null ? String(row.linked_user_name) : null,
      linkedUserEmail:
        row.linked_user_email != null ? String(row.linked_user_email) : null,
      linkedUserStatus:
        row.linked_user_status != null ? String(row.linked_user_status) : null,
      linkedUserLastLoginAt: row.linked_user_last_login_at || null,
      technical: {
        memberId: String(row.member_id),
        churchId: String(row.church_id),
        organizationId: String(row.organization_id),
        branchId: row.branch_id != null ? String(row.branch_id) : null,
        linkedUserId: row.user_id != null ? String(row.user_id) : null,
      },
      safeAuditHistory: audits.rows.map((a) => ({
        id: a.id,
        actionKey: a.action_key,
        entityType: a.entity_type,
        outcome: a.outcome,
        createdAt: a.created_at,
      })),
      supportContextAvailable: false,
      enterChurchAdminHref: null,
      enterChurchAdminLabel: "Enter church admin context (coming soon)",
    };

    await recordAuditEventSafe(db, {
      deploymentCode: deploymentCode(input.env),
      organizationId: String(row.organization_id),
      churchId: String(row.church_id),
      branchId: row.branch_id || null,
      actorUserId: input.actorUserId,
      actionKey: "platform.members.view_support_profile",
      entityType: "member",
      entityId: memberId,
      outcome: "success",
      metadata: { source: "platform_admin", actor_type: "platform_admin" },
    });

    return { ok: true, status: STATUS.OK, member: profile };
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message).slice(0, 120) : "lookup",
      member: null,
    };
  }
}

async function resolveOrganizationRef(db, organizationKeyOrId) {
  const raw = String(organizationKeyOrId || "").trim();
  if (!raw) return null;
  if (UUID_RE.test(raw)) {
    const r = await db.query(
      `SELECT id, organization_key, display_name FROM platform.organizations WHERE id = $1 LIMIT 1`,
      [raw]
    );
    return r.rows[0] || null;
  }
  const key = raw.toLowerCase().slice(0, 64);
  const r = await db.query(
    `SELECT id, organization_key, display_name FROM platform.organizations WHERE organization_key = $1 LIMIT 1`,
    [key]
  );
  return r.rows[0] || null;
}

module.exports = {
  STATUS,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  ALLOWED_LIMITS,
  USER_STATUSES,
  MEMBER_STATUSES,
  normalizeUserListInput,
  normalizeMemberListInput,
  listPlatformUsers,
  getPlatformUserDetail,
  listPlatformMembers,
  getPlatformMemberSupportProfile,
  resolveOrganizationRef,
};
