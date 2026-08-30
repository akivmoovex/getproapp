"use strict";

/**
 * HQ staff-access presentation: list, detail, role catalogue, access audit.
 * Uses RBAC assignments + legacy user_roles display (no silent conversion).
 */

const rbacRepo = require("../repositories/blessBoardRbacRepository");
const {
  listEffectivePermissions,
  authorize,
} = require("./blessBoardRbacAuthorizationService");
const {
  permissionsForLegacyRoleKey,
} = require("../rbac/legacyCompatibilityPermissions");
const {
  HIGHLY_SENSITIVE_ROLE_KEYS,
  isHighlySensitiveRole,
  CHURCH_ASSIGNABLE_SCOPE_TYPES,
} = require("./blessBoardRoleAssignmentService");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  LOOKUP_ERROR: "lookup_error",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PERMISSION_MODULES = Object.freeze([
  { key: "Administration", match: /^(organisation|branches|roles)\./ },
  { key: "Members", match: /^members\./ },
  { key: "Member journey", match: /^(journey_|ministries\.|cells\.|classes\.|departments\.)/ },
  { key: "Cells", match: /^cells\./ },
  { key: "Classes", match: /^classes\./ },
  { key: "Departments", match: /^departments\./ },
  { key: "Pastoral", match: /^pastoral_/ },
  { key: "Welfare", match: /^welfare_/ },
  { key: "Finance", match: /^(finance\.|giving\.)/ },
  { key: "Website", match: /^website\./ },
  { key: "Communications", match: /^(events\.|announcements\.|requests\.)/ },
  { key: "Audit", match: /^audit\./ },
  { key: "Export", match: /(^data\.export$|^finance\.data\.export$)/ },
  { key: "Attendance", match: /^attendance\./ },
]);

const LEGACY_ROLE_LABELS = Object.freeze({
  church_hq_admin: "Church HQ Admin",
  branch_admin: "Branch Admin",
  platform_admin: "Platform Admin",
});

function friendlyRoleLabel(roleKey, displayName) {
  if (displayName) return displayName;
  const key = String(roleKey || "");
  if (LEGACY_ROLE_LABELS[key]) return LEGACY_ROLE_LABELS[key];
  return key
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function initialsFromName(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function formatRelativeTime(value) {
  if (!value) return null;
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return null;
  const diff = Date.now() - then;
  const abs = Math.abs(diff);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (abs < minute) return "just now";
  if (abs < hour) {
    const n = Math.round(abs / minute);
    return `${n} min${n === 1 ? "" : "s"} ago`;
  }
  if (abs < day) {
    const n = Math.round(abs / hour);
    return `${n} hour${n === 1 ? "" : "s"} ago`;
  }
  if (abs < 7 * day) {
    const n = Math.round(abs / day);
    return `${n}d ago`;
  }
  try {
    return new Date(value).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return String(value);
  }
}

function summarizeScope(activeRoles) {
  const roles = activeRoles || [];
  const global = roles.some(
    (r) =>
      r.scopeType === "church" ||
      r.scopeType === "organisation" ||
      r.roleKey === "church_hq_admin"
  );
  if (global) return { label: "Global", icon: "account_balance", kind: "global" };
  const withBranch = roles.find((r) => r.branchDisplayName);
  if (withBranch) {
    return { label: withBranch.branchDisplayName, icon: "location_on", kind: "branch" };
  }
  const branchScoped = roles.find((r) => r.scopeType === "branch");
  if (branchScoped) return { label: "Branch", icon: "location_on", kind: "branch" };
  if (!roles.length) return { label: "—", icon: "remove", kind: "none" };
  return { label: roles[0].scopeType || "—", icon: "tune", kind: "other" };
}

function userStatusPresentation(status) {
  const st = String(status || "").toLowerCase();
  if (st === "active") return { key: "active", label: "Active", chip: "active" };
  if (st === "invited") return { key: "pending", label: "Pending", chip: "pending" };
  if (st === "inactive" || st === "suspended") {
    return { key: "inactive", label: st === "suspended" ? "Suspended" : "Inactive", chip: "inactive" };
  }
  return { key: st || "unknown", label: st || "Unknown", chip: "pending" };
}

async function loadStaffAccessStats(client, organizationId, churchId) {
  const users = await client.query(
    `SELECT COUNT(DISTINCT u.id)::int AS cnt
       FROM blessboard.users u
      WHERE (
          EXISTS (
            SELECT 1 FROM blessboard.user_roles ur
             WHERE ur.user_id = u.id
               AND ur.organization_id = $1
               AND ur.status = 'active'
               AND (ur.church_id IS NULL OR ur.church_id = $2)
          )
          OR EXISTS (
            SELECT 1 FROM blessboard.user_role_assignments a
             WHERE a.user_id = u.id
               AND a.organization_id = $1
               AND (a.church_id IS NULL OR a.church_id = $2)
          )
        )`,
    [organizationId, churchId]
  );
  const churchAdmins = await client.query(
    `SELECT COUNT(DISTINCT uid)::int AS cnt FROM (
       SELECT ur.user_id AS uid
         FROM blessboard.user_roles ur
         JOIN blessboard.users u ON u.id = ur.user_id
        WHERE ur.organization_id = $1 AND ur.church_id = $2
          AND ur.role_key = 'church_hq_admin' AND ur.status = 'active'
          AND u.status IN ('active', 'invited')
       UNION
       SELECT a.user_id
         FROM blessboard.user_role_assignments a
         JOIN blessboard.roles r ON r.id = a.role_id
         JOIN blessboard.users u ON u.id = a.user_id
        WHERE a.organization_id = $1
          AND a.status = 'active'
          AND (a.expires_at IS NULL OR a.expires_at > now())
          AND r.role_key IN ('organisation_administrator', 'church_system_administrator')
          AND a.scope_type IN ('organisation', 'church')
          AND (a.church_id IS NULL OR a.church_id = $2)
          AND u.status IN ('active', 'invited')
     ) t`,
    [organizationId, churchId]
  );
  const branchAdmins = await client.query(
    `SELECT COUNT(DISTINCT uid)::int AS cnt FROM (
       SELECT ur.user_id AS uid
         FROM blessboard.user_roles ur
         JOIN blessboard.users u ON u.id = ur.user_id
        WHERE ur.organization_id = $1 AND ur.church_id = $2
          AND ur.role_key = 'branch_admin' AND ur.status = 'active'
          AND u.status IN ('active', 'invited')
       UNION
       SELECT a.user_id
         FROM blessboard.user_role_assignments a
         JOIN blessboard.roles r ON r.id = a.role_id
         JOIN blessboard.users u ON u.id = a.user_id
        WHERE a.organization_id = $1
          AND a.status = 'active'
          AND (a.expires_at IS NULL OR a.expires_at > now())
          AND r.role_key = 'branch_administrator'
          AND (a.church_id IS NULL OR a.church_id = $2)
          AND u.status IN ('active', 'invited')
     ) t`,
    [organizationId, churchId]
  );
  const pending = await client.query(
    `SELECT COUNT(*)::int AS cnt
       FROM blessboard.user_invitations i
      WHERE i.organization_id = $1
        AND i.church_id = $2
        AND i.status = 'pending'
        AND i.expires_at > now()`,
    [organizationId, churchId]
  );
  return {
    totalUsers: Number(users.rows[0] && users.rows[0].cnt) || 0,
    churchAdmins: Number(churchAdmins.rows[0] && churchAdmins.rows[0].cnt) || 0,
    branchAdmins: Number(branchAdmins.rows[0] && branchAdmins.rows[0].cnt) || 0,
    pendingInvitations: Number(pending.rows[0] && pending.rows[0].cnt) || 0,
  };
}

async function withClient(db, fn) {
  let client = null;
  let owned = false;
  try {
    if (db && typeof db.query === "function" && typeof db.release === "function") {
      return await fn(db);
    }
    if (db && typeof db.connect === "function") {
      client = await db.connect();
      owned = true;
    } else {
      client = db;
    }
    return await fn(client);
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

function sensitivityLabel(roleKey, isSensitive, perms) {
  if (HIGHLY_SENSITIVE_ROLE_KEYS.includes(String(roleKey || ""))) return "Highly sensitive";
  if (isHighlySensitiveRole({ roleKey, isSensitive }, perms || [])) return "Highly sensitive";
  if (isSensitive) return "Sensitive";
  return "Standard";
}

function moduleForPermission(permissionKey) {
  const key = String(permissionKey || "");
  for (const mod of PERMISSION_MODULES) {
    if (mod.match.test(key)) return mod.key;
  }
  return "Other";
}

function friendlyPermissionName(permissionKey) {
  const key = String(permissionKey || "");
  const last = key.split(".").pop() || key;
  return last.replace(/_/g, " ");
}

/**
 * Organisation-scoped staff list (trusted org/church from session).
 */
async function listStaffAccess(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (![organizationId, churchId, actorUserId].every((x) => UUID_RE.test(x))) {
    return { ok: false, status: STATUS.INVALID_INPUT, users: [], reason: "ids" };
  }

  const qRaw = String((input && input.q) || "").trim();
  const {
    prepareIdentitySearchQuery,
  } = require("./phoneFirstIdentityHelpers");
  const search = prepareIdentitySearchQuery(qRaw);
  const q = search.raw.toLowerCase();
  const branchId = input.branchId ? String(input.branchId).trim() : "";
  const roleKey = input.roleKey ? String(input.roleKey).trim() : "";
  const assignmentStatus = input.assignmentStatus
    ? String(input.assignmentStatus).trim()
    : "";
  const userStatus = input.userStatus ? String(input.userStatus).trim() : "";
  const statusFilter = userStatus || assignmentStatus;
  const sensitivity = input.sensitivity ? String(input.sensitivity).trim() : "";
  const limit = Math.min(Math.max(parseInt(String(input.limit || "50"), 10) || 50, 1), 100);
  const offset = Math.max(parseInt(String(input.offset || "0"), 10) || 0, 0);

  try {
    return await withClient(db, async (client) => {
      const authz = await authorize(client, {
        actor: { userId: actorUserId },
        permission: "roles.view",
        tenantContext: input.tenantContext,
        resourceContext: { organizationId, churchId, branchId: branchId || null },
      });
      if (!authz.allowed) {
        return { ok: false, status: STATUS.FORBIDDEN, users: [], reason: authz.reasonCode };
      }

      const params = [organizationId, churchId];
      let where = `
        (
          EXISTS (
            SELECT 1 FROM blessboard.user_roles ur
             WHERE ur.user_id = u.id
               AND ur.organization_id = $1
               AND ur.status = 'active'
               AND (ur.church_id IS NULL OR ur.church_id = $2)
          )
          OR EXISTS (
            SELECT 1 FROM blessboard.user_role_assignments a
             WHERE a.user_id = u.id
               AND a.organization_id = $1
               AND (a.church_id IS NULL OR a.church_id = $2)
          )
        )
      `;
      if (q) {
        params.push(search.like);
        const likeIdx = params.length;
        let phoneClause = "";
        if (search.phoneNormalized) {
          params.push(search.phoneNormalized);
          phoneClause = ` OR u.phone_normalized = $${params.length}`;
        }
        where += ` AND (
          lower(COALESCE(u.display_name, '')) LIKE $${likeIdx}
          OR lower(COALESCE(u.email_normalized, '')) LIKE $${likeIdx}
          OR lower(COALESCE(u.email_display, '')) LIKE $${likeIdx}
          OR lower(COALESCE(u.phone_display, '')) LIKE $${likeIdx}
          OR COALESCE(u.phone_normalized, '') LIKE $${likeIdx}
          ${phoneClause}
        )`;
      }
      if (branchId && UUID_RE.test(branchId)) {
        params.push(branchId);
        where += ` AND (
          EXISTS (
            SELECT 1 FROM blessboard.user_roles ur2
             WHERE ur2.user_id = u.id AND ur2.organization_id = $1
               AND ur2.branch_id = $${params.length} AND ur2.status = 'active'
          )
          OR EXISTS (
            SELECT 1 FROM blessboard.user_role_assignments a2
             WHERE a2.user_id = u.id AND a2.organization_id = $1
               AND a2.scope_type = 'branch' AND a2.scope_id = $${params.length}
          )
        )`;
      }
      if (roleKey) {
        params.push(roleKey);
        where += ` AND (
          EXISTS (
            SELECT 1 FROM blessboard.user_roles ur3
             WHERE ur3.user_id = u.id AND ur3.organization_id = $1
               AND ur3.role_key = $${params.length} AND ur3.status = 'active'
          )
          OR EXISTS (
            SELECT 1 FROM blessboard.user_role_assignments a3
            JOIN blessboard.roles r3 ON r3.id = a3.role_id
             WHERE a3.user_id = u.id AND a3.organization_id = $1
               AND r3.role_key = $${params.length}
          )
        )`;
      }
      if (statusFilter === "expired" || statusFilter === "revoked") {
        if (statusFilter === "expired") {
          where += ` AND EXISTS (
            SELECT 1 FROM blessboard.user_role_assignments a4
             WHERE a4.user_id = u.id AND a4.organization_id = $1
               AND (a4.status = 'expired' OR (a4.status = 'active' AND a4.expires_at IS NOT NULL AND a4.expires_at <= now()))
          )`;
        } else {
          where += ` AND EXISTS (
            SELECT 1 FROM blessboard.user_role_assignments a4
             WHERE a4.user_id = u.id AND a4.organization_id = $1 AND a4.status = 'revoked'
          )`;
        }
      } else if (statusFilter === "pending" || statusFilter === "invited") {
        where += ` AND u.status = 'invited'`;
      } else if (statusFilter === "inactive") {
        where += ` AND u.status IN ('inactive', 'suspended')`;
      } else if (statusFilter === "active") {
        where += ` AND u.status = 'active'`;
      }

      const stats = await loadStaffAccessStats(client, organizationId, churchId);
      const countR = await client.query(
        `SELECT COUNT(*)::int AS cnt FROM blessboard.users u WHERE ${where}`,
        params
      );
      const total = Number(countR.rows[0] && countR.rows[0].cnt) || 0;

      params.push(limit, offset);
      const limitIdx = params.length - 1;
      const offsetIdx = params.length;
      let orderBy = `lower(COALESCE(u.display_name, u.email_normalized, u.phone_normalized)) ASC`;
      if (search.phoneNormalized) {
        params.push(search.phoneNormalized);
        orderBy = `CASE WHEN u.phone_normalized = $${params.length} THEN 0 ELSE 1 END ASC, ${orderBy}`;
      }
      const r = await client.query(
        `SELECT u.id, u.email_display, u.email_normalized, u.display_name, u.status,
                u.created_at, u.phone_normalized, u.phone_display, u.last_login_at
           FROM blessboard.users u
          WHERE ${where}
          ORDER BY ${orderBy}
          LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        params
      );

      const users = [];
      for (const row of r.rows) {
        const assignments = await rbacRepo.listAssignmentsForUserOrg(
          client,
          row.id,
          organizationId
        );
        const legacy = await client.query(
          `SELECT ur.id, ur.role_key, ur.branch_id, ur.church_id, ur.status, ur.created_at,
                  b.display_name AS branch_display_name, b.branch_key
             FROM blessboard.user_roles ur
             LEFT JOIN blessboard.branches b ON b.id = ur.branch_id
            WHERE ur.user_id = $1 AND ur.organization_id = $2 AND ur.status = 'active'
              AND (ur.church_id IS NULL OR ur.church_id = $3)
            ORDER BY ur.created_at DESC`,
          [row.id, organizationId, churchId]
        );

        let activeRoles = [
          ...assignments
            .filter((a) => a.status === "active" && (!a.expiresAt || new Date(a.expiresAt) > new Date()))
            .map((a) => ({
              roleKey: a.roleKey,
              source: "rbac",
              scopeType: a.scopeType,
              sensitive: a.isSensitiveRole,
              expiresAt: a.expiresAt,
            })),
          ...legacy.rows.map((l) => ({
            roleKey: l.role_key,
            source: "legacy",
            scopeType: l.branch_id ? "branch" : "church",
            sensitive: true,
            expiresAt: null,
            branchDisplayName: l.branch_display_name,
          })),
        ];

        if (sensitivity === "sensitive") {
          activeRoles = activeRoles.filter((x) => x.sensitive);
        } else if (sensitivity === "highly_sensitive") {
          activeRoles = activeRoles.filter((x) =>
            HIGHLY_SENSITIVE_ROLE_KEYS.includes(x.roleKey)
          );
        } else if (sensitivity === "standard") {
          activeRoles = activeRoles.filter(
            (x) => !x.sensitive && !HIGHLY_SENSITIVE_ROLE_KEYS.includes(x.roleKey)
          );
        }

        const { maskBlessBoardPhone } = require("./phoneFirstIdentityHelpers");
        const displayName =
            row.display_name ||
            row.email_display ||
            row.phone_display ||
            row.email_normalized;
        const primaryRole = activeRoles[0] || null;
        const statusView = userStatusPresentation(row.status);
        users.push({
          id: row.id,
          emailDisplay: row.email_display || row.email_normalized,
          phoneDisplay: row.phone_display || row.phone_normalized || null,
          phoneMasked: row.phone_normalized
            ? maskBlessBoardPhone(row.phone_normalized)
            : null,
          displayName,
          initials: initialsFromName(displayName),
          status: row.status,
          statusKey: statusView.key,
          statusLabel: statusView.label,
          statusChip: statusView.chip,
          lastLoginAt: row.last_login_at || null,
          lastActiveLabel: formatRelativeTime(row.last_login_at) || "Never",
          roleSummary: primaryRole
            ? friendlyRoleLabel(primaryRole.roleKey)
            : "No role",
          roleExtraCount: Math.max(activeRoles.length - 1, 0),
          scopeSummary: summarizeScope(activeRoles),
          activeRoles: activeRoles.map((r) => ({
            ...r,
            displayName: friendlyRoleLabel(r.roleKey),
          })),
          hasLegacy: legacy.rows.length > 0,
          hasExpired: assignments.some(
            (a) =>
              a.status === "expired" ||
              (a.status === "active" && a.expiresAt && new Date(a.expiresAt) <= new Date())
          ),
          hasRevoked: assignments.some((a) => a.status === "revoked"),
        });
      }

      return { ok: true, status: STATUS.OK, users, total, limit, offset, stats };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      users: [],
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function getStaffAccessDetail(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const userId = String((input && input.userId) || "").trim();
  if (![organizationId, churchId, actorUserId, userId].every((x) => UUID_RE.test(x))) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }

  try {
    return await withClient(db, async (client) => {
      const authz = await authorize(client, {
        actor: { userId: actorUserId },
        permission: "roles.view",
        tenantContext: input.tenantContext,
        resourceContext: { organizationId, churchId },
      });
      if (!authz.allowed) {
        return { ok: false, status: STATUS.FORBIDDEN, reason: authz.reasonCode };
      }

      const userR = await client.query(
        `SELECT id, email_display, email_normalized, display_name, status, created_at,
                phone_display, phone_normalized, last_login_at
           FROM blessboard.users WHERE id = $1 LIMIT 1`,
        [userId]
      );
      const user = userR.rows[0];
      if (!user) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };

      // Conceal users with no org relationship.
      const linked = await client.query(
        `SELECT 1 WHERE EXISTS (
           SELECT 1 FROM blessboard.user_roles ur
            WHERE ur.user_id = $1 AND ur.organization_id = $2
         ) OR EXISTS (
           SELECT 1 FROM blessboard.user_role_assignments a
            WHERE a.user_id = $1 AND a.organization_id = $2
         )`,
        [userId, organizationId]
      );
      if (!linked.rowCount) {
        return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
      }

      const assignments = await rbacRepo.listAssignmentsForUserOrg(
        client,
        userId,
        organizationId
      );
      const now = new Date();
      const active = [];
      const expired = [];
      const revoked = [];
      for (const a of assignments) {
        const item = {
          ...a,
          displayName: friendlyRoleLabel(a.roleKey),
          sensitivityLabel: sensitivityLabel(a.roleKey, a.isSensitiveRole),
        };
        if (a.status === "revoked") revoked.push(item);
        else if (
          a.status === "expired" ||
          (a.status === "active" && a.expiresAt && new Date(a.expiresAt) <= now)
        ) {
          expired.push(item);
        } else if (a.status === "active") active.push(item);
      }

      const legacyR = await client.query(
        `SELECT ur.id, ur.role_key, ur.branch_id, ur.church_id, ur.status, ur.created_at,
                b.display_name AS branch_display_name, b.branch_key
           FROM blessboard.user_roles ur
           LEFT JOIN blessboard.branches b ON b.id = ur.branch_id
          WHERE ur.user_id = $1 AND ur.organization_id = $2 AND ur.status = 'active'
            AND (ur.church_id IS NULL OR ur.church_id = $3)
          ORDER BY ur.created_at DESC`,
        [userId, organizationId, churchId]
      );
      const legacyRoles = legacyR.rows.map((row) => ({
        id: row.id,
        roleKey: row.role_key,
        branchId: row.branch_id,
        churchId: row.church_id,
        status: row.status,
        createdAt: row.created_at,
        branchDisplayName: row.branch_display_name,
        branchKey: row.branch_key,
        label: "Legacy compatibility",
        displayName: friendlyRoleLabel(row.role_key),
        permissions: permissionsForLegacyRoleKey(row.role_key).slice(),
        scopeType: row.branch_id ? "branch" : row.role_key === "platform_admin" ? "platform" : "church",
      }));

      const events = await client.query(
        `SELECT e.id, e.assignment_id, e.event_key, e.previous_status, e.new_status,
                e.reason, e.metadata_json, e.created_at, e.actor_user_id
           FROM blessboard.user_role_assignment_events e
           JOIN blessboard.user_role_assignments a ON a.id = e.assignment_id
          WHERE a.user_id = $1 AND a.organization_id = $2
          ORDER BY e.created_at DESC
          LIMIT 100`,
        [userId, organizationId]
      );

      const effective = await listEffectivePermissions(client, {
        actor: { userId },
        tenantContext: input.tenantContext,
        resourceContext: { organizationId, churchId },
      });

      const grouped = {};
      for (const pk of effective.permissions || []) {
        const mod = moduleForPermission(pk);
        if (!grouped[mod]) grouped[mod] = [];
        let source = "rbac_role_assignment";
        let sourceRole = null;
        for (const a of active) {
          const keys = await rbacRepo.listPermissionKeysForRoleId(client, a.roleId);
          if (keys.includes(pk)) {
            source = "rbac_role_assignment";
            sourceRole = a.roleKey;
            break;
          }
        }
        for (const leg of legacyRoles) {
          if (leg.permissions.includes(pk)) {
            source = sourceRole ? "multiple_role_combination" : "legacy_compatibility";
            sourceRole = sourceRole || leg.roleKey;
          }
        }
        grouped[mod].push({
          permissionKey: pk,
          displayName: friendlyPermissionName(pk),
          module: mod,
          source,
          sourceRole,
          sensitivity: /export|approve|void|safeguarding|highly_confidential|assign_sensitive|revoke|bank_details/i.test(
            pk
          )
            ? "Sensitive"
            : "Standard",
        });
      }

      const { maskBlessBoardPhone } = require("./phoneFirstIdentityHelpers");
      const displayName =
        user.display_name || user.email_display || user.email_normalized;
      const statusView = userStatusPresentation(user.status);

      return {
        ok: true,
        status: STATUS.OK,
        user: {
          id: user.id,
          emailDisplay: user.email_display || user.email_normalized,
          phoneDisplay: user.phone_display || user.phone_normalized || null,
          phoneMasked: user.phone_normalized
            ? maskBlessBoardPhone(user.phone_normalized)
            : null,
          displayName,
          initials: initialsFromName(displayName),
          status: user.status,
          statusKey: statusView.key,
          statusLabel: statusView.label,
          statusChip: statusView.chip,
          createdAt: user.created_at,
          lastLoginAt: user.last_login_at || null,
          lastActiveLabel: formatRelativeTime(user.last_login_at) || "Never",
        },
        legacyRoles,
        activeAssignments: active,
        expiredAssignments: expired,
        revokedAssignments: revoked,
        history: events.rows.map((e) => ({
          id: e.id,
          assignmentId: e.assignment_id,
          eventKey: e.event_key,
          previousStatus: e.previous_status,
          newStatus: e.new_status,
          reason: e.reason,
          metadata: e.metadata_json,
          createdAt: e.created_at,
          actorUserId: e.actor_user_id,
        })),
        effectiveGrouped: grouped,
        sensitiveSummary: {
          hasFinance: (effective.permissions || []).some((p) =>
            p.startsWith("finance.") || p.startsWith("giving.")
          ),
          hasPastoral: (effective.permissions || []).some((p) => p.startsWith("pastoral_")),
          hasExport: (effective.permissions || []).some((p) => p.includes("export")),
          hasRoleAdmin: (effective.permissions || []).some((p) => p.startsWith("roles.")),
        },
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function listRoleCatalogue(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (![organizationId, churchId, actorUserId].every((x) => UUID_RE.test(x))) {
    return { ok: false, status: STATUS.INVALID_INPUT, roles: [], reason: "ids" };
  }
  try {
    return await withClient(db, async (client) => {
      const authz = await authorize(client, {
        actor: { userId: actorUserId },
        permission: "roles.view",
        tenantContext: input.tenantContext,
        resourceContext: { organizationId, churchId },
      });
      if (!authz.allowed) {
        return { ok: false, status: STATUS.FORBIDDEN, roles: [], reason: authz.reasonCode };
      }
      const roles = await client.query(
        `SELECT r.id, r.role_key, r.display_name, r.description, r.role_category,
                r.is_sensitive, r.is_active,
                (SELECT COUNT(*)::int FROM blessboard.user_role_assignments a
                  WHERE a.role_id = r.id AND a.organization_id = $1 AND a.status = 'active') AS assigned_count
           FROM blessboard.roles r
          WHERE r.is_active = true
            AND r.role_key NOT IN ('platform_administrator', 'visitor', 'member')
            AND r.role_key NOT LIKE 'activeclinic_%'
          ORDER BY r.role_category ASC, r.display_name ASC`,
        [organizationId]
      );
      const out = [];
      for (const row of roles.rows) {
        const perms = await rbacRepo.listPermissionKeysForRoleId(client, row.id);
        const groups = {};
        for (const pk of perms) {
          const mod = moduleForPermission(pk);
          if (!groups[mod]) groups[mod] = [];
          groups[mod].push(pk);
        }
        out.push({
          id: row.id,
          roleKey: row.role_key,
          displayName: row.display_name,
          description: row.description,
          roleCategory: row.role_category,
          isSensitive: row.is_sensitive,
          isActive: row.is_active,
          assignedCount: row.assigned_count,
          permissionCount: perms.length,
          scopeLabel:
            row.role_category === "branch" ||
            row.role_category === "ministry" ||
            row.role_category === "department"
              ? "Branch"
              : "Global",
          sensitivityLabel: sensitivityLabel(row.role_key, row.is_sensitive, perms),
          permissionGroups: groups,
          allowedScopeTypes: CHURCH_ASSIGNABLE_SCOPE_TYPES.slice(),
          readOnly: true,
        });
      }
      return { ok: true, status: STATUS.OK, roles: out };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      roles: [],
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function getRoleCatalogueDetail(db, input) {
  const roleKey = String((input && input.roleKey) || "").trim();
  const listed = await listRoleCatalogue(db, input);
  if (!listed.ok) return listed;
  const role = listed.roles.find((r) => r.roleKey === roleKey);
  if (!role) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
  return { ok: true, status: STATUS.OK, role };
}

async function listAccessAudit(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (![organizationId, churchId, actorUserId].every((x) => UUID_RE.test(x))) {
    return { ok: false, status: STATUS.INVALID_INPUT, events: [], reason: "ids" };
  }
  const limit = Math.min(Math.max(parseInt(String(input.limit || "50"), 10) || 50, 1), 100);
  try {
    return await withClient(db, async (client) => {
      const viewRoles = await authorize(client, {
        actor: { userId: actorUserId },
        permission: "roles.view",
        tenantContext: input.tenantContext,
        resourceContext: { organizationId, churchId },
      });
      const viewAudit = await authorize(client, {
        actor: { userId: actorUserId },
        permission: "audit.view",
        tenantContext: input.tenantContext,
        resourceContext: { organizationId, churchId },
      });
      if (!viewRoles.allowed && !viewAudit.allowed) {
        return { ok: false, status: STATUS.FORBIDDEN, events: [], reason: "denied" };
      }

      const assignmentEvents = await client.query(
        `SELECT e.id, e.event_key, e.reason, e.created_at, e.actor_user_id,
                e.metadata_json, a.user_id AS target_user_id, r.role_key, a.scope_type
           FROM blessboard.user_role_assignment_events e
           JOIN blessboard.user_role_assignments a ON a.id = e.assignment_id
           JOIN blessboard.roles r ON r.id = a.role_id
          WHERE e.organization_id = $1
            AND e.event_key IN (
              'rbac.assignment.created', 'rbac.assignment.revoked',
              'rbac.assignment.expired', 'rbac.assignment.updated'
            )
          ORDER BY e.created_at DESC
          LIMIT $2`,
        [organizationId, limit]
      );

      let platformEvents = { rows: [] };
      if (viewAudit.allowed) {
        platformEvents = await client.query(
          `SELECT id, action_key AS event_key, actor_user_id, entity_id, metadata_json, created_at
             FROM platform.audit_events
            WHERE organization_id = $1
              AND (
                action_key LIKE 'rbac.assignment.%'
                OR action_key = 'rbac.authorization.denied_sensitive'
              )
            ORDER BY created_at DESC
            LIMIT $2`,
          [organizationId, limit]
        );
      }

      const events = [
        ...assignmentEvents.rows.map((e) => ({
          id: e.id,
          eventKey: e.event_key,
          actorUserId: e.actor_user_id,
          targetUserId: e.target_user_id,
          roleKey: e.role_key,
          scopeType: e.scope_type,
          reason: e.reason,
          createdAt: e.created_at,
          source: "assignment_events",
        })),
        ...platformEvents.rows.map((e) => ({
          id: e.id,
          eventKey: e.event_key,
          actorUserId: e.actor_user_id,
          targetUserId: e.metadata_json && e.metadata_json.target_user_id,
          roleKey: e.metadata_json && e.metadata_json.role_key,
          scopeType: e.metadata_json && e.metadata_json.scope_type,
          reason: null,
          createdAt: e.created_at,
          source: "platform_audit",
        })),
      ]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit);

      return { ok: true, status: STATUS.OK, events };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      events: [],
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function listAssignableScopeOptions(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  if (!UUID_RE.test(organizationId) || !UUID_RE.test(churchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, options: {} };
  }
  try {
    return await withClient(db, async (client) => {
      const branches = await client.query(
        `SELECT id, branch_key, display_name FROM blessboard.branches
          WHERE church_id = $1 AND status = 'active' ORDER BY display_name`,
        [churchId]
      );
      const ministries = await client.query(
        `SELECT id, ministry_key AS resource_key, name AS display_name FROM blessboard.ministries
          WHERE church_id = $1 AND status IN ('published', 'active') ORDER BY name`,
        [churchId]
      ).catch(() => ({ rows: [] }));
      const departments = await client.query(
        `SELECT id, department_key AS resource_key, display_name FROM blessboard.departments
          WHERE church_id = $1 AND status = 'active' ORDER BY display_name`,
        [churchId]
      ).catch(() => ({ rows: [] }));
      const cells = await client.query(
        `SELECT id, cell_key AS resource_key, display_name FROM blessboard.cells
          WHERE church_id = $1 AND status = 'active' ORDER BY display_name`,
        [churchId]
      ).catch(() => ({ rows: [] }));
      const classes = await client.query(
        `SELECT id, cohort_key AS resource_key, display_name FROM blessboard.class_cohorts
          WHERE church_id = $1 AND status IN ('active', 'planned') ORDER BY display_name`,
        [churchId]
      ).catch(() => ({ rows: [] }));

      return {
        ok: true,
        status: STATUS.OK,
        options: {
          organisation: [{ id: organizationId, label: "Organisation-wide" }],
          church: [{ id: churchId, label: "Church-wide" }],
          branch: branches.rows.map((r) => ({
            id: r.id,
            label: r.display_name,
            key: r.branch_key,
          })),
          ministry: ministries.rows.map((r) => ({
            id: r.id,
            label: r.display_name,
            key: r.resource_key,
          })),
          department: departments.rows.map((r) => ({
            id: r.id,
            label: r.display_name,
            key: r.resource_key,
          })),
          cell: cells.rows.map((r) => ({
            id: r.id,
            label: r.display_name,
            key: r.resource_key,
          })),
          class: classes.rows.map((r) => ({
            id: r.id,
            label: r.display_name,
            key: r.resource_key,
          })),
        },
        scopeTypes: CHURCH_ASSIGNABLE_SCOPE_TYPES.slice(),
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      options: {},
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function findUserInOrganisation(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const identifier = String((input && (input.email || input.identifier || input.phone)) || "")
    .trim();
  if (!UUID_RE.test(organizationId) || !identifier) {
    return { ok: false, status: STATUS.INVALID_INPUT, user: null };
  }
  const {
    prepareIdentitySearchQuery,
  } = require("./phoneFirstIdentityHelpers");
  const search = prepareIdentitySearchQuery(identifier);
  const email = identifier.includes("@") ? identifier.toLowerCase() : "";
  try {
    return await withClient(db, async (client) => {
      let r;
      if (search.phoneNormalized) {
        r = await client.query(
          `SELECT u.id, u.email_display, u.email_normalized, u.display_name, u.status,
                  u.phone_normalized, u.phone_display
             FROM blessboard.users u
             JOIN blessboard.organization_staff_phones osp
               ON osp.user_id = u.id AND osp.organization_id = $2
            WHERE osp.phone_normalized = $1
            LIMIT 1`,
          [search.phoneNormalized, organizationId]
        );
      } else if (email) {
        r = await client.query(
          `SELECT u.id, u.email_display, u.email_normalized, u.display_name, u.status,
                  u.phone_normalized, u.phone_display
             FROM blessboard.users u
            WHERE u.email_normalized = $1
              AND (
                EXISTS (
                  SELECT 1 FROM blessboard.user_roles ur
                   WHERE ur.user_id = u.id AND ur.organization_id = $2
                )
                OR EXISTS (
                  SELECT 1 FROM blessboard.user_role_assignments a
                   WHERE a.user_id = u.id AND a.organization_id = $2
                )
              )
            LIMIT 1`,
          [email, organizationId]
        );
      } else {
        return { ok: false, status: STATUS.INVALID_INPUT, user: null };
      }
      const user = r.rows[0];
      if (!user) return { ok: false, status: STATUS.NOT_FOUND, user: null };
      const { maskBlessBoardPhone } = require("./phoneFirstIdentityHelpers");
      return {
        ok: true,
        status: STATUS.OK,
        user: {
          id: user.id,
          emailDisplay: user.email_display || user.email_normalized,
          phoneDisplay: user.phone_display || user.phone_normalized || null,
          phoneMasked: user.phone_normalized
            ? maskBlessBoardPhone(user.phone_normalized)
            : null,
          displayName: user.display_name,
          status: user.status,
        },
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      user: null,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

module.exports = {
  STATUS,
  PERMISSION_MODULES,
  listStaffAccess,
  getStaffAccessDetail,
  listRoleCatalogue,
  getRoleCatalogueDetail,
  listAccessAudit,
  listAssignableScopeOptions,
  findUserInOrganisation,
  sensitivityLabel,
  moduleForPermission,
  friendlyRoleLabel,
  initialsFromName,
  formatRelativeTime,
};
