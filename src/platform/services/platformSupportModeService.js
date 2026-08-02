"use strict";

/**
 * Audited Platform Admin support mode — temporary scoped portal access.
 * Does not replace the PA session or create impersonation logins.
 */

const repo = require("../repositories/platformSupportContextRepository");
const { recordAuditEventSafe } = require("./auditEventService");
const { getPlatformDeploymentCode } = require("../config/platformDeploymentCode");
const { authorize } = require("../../blessboard/services/blessBoardRbacAuthorizationService");
const {
  hashToken,
  mintRawToken,
  MAX_AGE_SECONDS,
} = require("../http/supportContextCookie");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  LOOKUP_ERROR: "lookup_error",
});

const SUPPORT_TTL_MS = MAX_AGE_SECONDS * 1000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function deploymentCode(env) {
  const id = getPlatformDeploymentCode(env || process.env);
  return id && id.ok ? id.code : "blessboard-org-v5";
}

function normalizeReason(raw) {
  const reason = String(raw == null ? "" : raw).trim().replace(/\s+/g, " ");
  if (reason.length < 3 || reason.length > 500) return null;
  return reason;
}

function mapContextRow(row, extras) {
  if (!row) return null;
  return {
    id: String(row.id),
    deploymentCode: String(row.deployment_code),
    actorUserId: String(row.actor_user_id),
    organizationId: String(row.organization_id),
    churchId: String(row.church_id),
    branchId: row.branch_id != null ? String(row.branch_id) : null,
    supportType: String(row.support_type),
    reason: String(row.reason || ""),
    status: String(row.status),
    startedAt: row.started_at || null,
    expiresAt: row.expires_at || null,
    endedAt: row.ended_at || null,
    endReason: row.end_reason != null ? String(row.end_reason) : null,
    actorSessionId:
      row.actor_session_id != null ? String(row.actor_session_id) : null,
    ...(extras || {}),
  };
}

function isExpiredRow(row, now) {
  if (!row || !row.expires_at) return true;
  const exp =
    row.expires_at instanceof Date
      ? row.expires_at.getTime()
      : Date.parse(String(row.expires_at));
  return !Number.isFinite(exp) || exp <= now.getTime();
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

async function resolveOrganizationTarget(db, organizationKeyOrId) {
  const raw = String(organizationKeyOrId || "").trim();
  if (!raw) return null;
  if (UUID_RE.test(raw)) {
    const r = await db.query(
      `SELECT o.id, o.organization_key, o.display_name, c.id AS church_id,
              c.church_key, c.display_name AS church_name
         FROM platform.organizations o
         INNER JOIN blessboard.churches c ON c.organization_id = o.id
        WHERE o.id = $1
        ORDER BY c.created_at ASC
        LIMIT 1`,
      [raw]
    );
    return r.rows[0] || null;
  }
  const key = raw.toLowerCase().slice(0, 64);
  const r = await db.query(
    `SELECT o.id, o.organization_key, o.display_name, c.id AS church_id,
            c.church_key, c.display_name AS church_name
       FROM platform.organizations o
       INNER JOIN blessboard.churches c ON c.organization_id = o.id
      WHERE o.organization_key = $1
      ORDER BY c.created_at ASC
      LIMIT 1`,
    [key]
  );
  return r.rows[0] || null;
}

async function resolveBranchTarget(db, organizationId, churchId, branchKeyOrId) {
  const raw = String(branchKeyOrId || "").trim();
  if (!raw) return null;
  if (UUID_RE.test(raw)) {
    const r = await db.query(
      `SELECT b.id, b.branch_key, b.display_name, b.church_id, b.status
         FROM blessboard.branches b
        WHERE b.id = $1
          AND b.church_id = $2
          AND b.status = 'active'
        LIMIT 1`,
      [raw, churchId]
    );
    return r.rows[0] || null;
  }
  const key = raw.toLowerCase().slice(0, 64);
  const r = await db.query(
    `SELECT b.id, b.branch_key, b.display_name, b.church_id, b.status
       FROM blessboard.branches b
       INNER JOIN blessboard.churches c ON c.id = b.church_id
      WHERE c.organization_id = $1
        AND b.church_id = $2
        AND b.branch_key = $3
        AND b.status = 'active'
      LIMIT 1`,
    [organizationId, churchId, key]
  );
  return r.rows[0] || null;
}

async function loadDisplayNames(db, context) {
  const org = await db.query(
    `SELECT organization_key, display_name FROM platform.organizations WHERE id = $1 LIMIT 1`,
    [context.organizationId]
  );
  const church = await db.query(
    `SELECT church_key, display_name FROM blessboard.churches WHERE id = $1 LIMIT 1`,
    [context.churchId]
  );
  let branch = null;
  if (context.branchId) {
    const br = await db.query(
      `SELECT branch_key, display_name FROM blessboard.branches WHERE id = $1 LIMIT 1`,
      [context.branchId]
    );
    branch = br.rows[0] || null;
  }
  return {
    organizationKey: org.rows[0] ? String(org.rows[0].organization_key) : null,
    organizationName: org.rows[0] ? String(org.rows[0].display_name) : null,
    churchKey: church.rows[0] ? String(church.rows[0].church_key) : null,
    churchName: church.rows[0] ? String(church.rows[0].display_name) : null,
    branchKey: branch ? String(branch.branch_key) : null,
    branchName: branch ? String(branch.display_name) : null,
  };
}

async function findPrimaryHostname(db, organizationId) {
  const r = await db.query(
    `SELECT hostname
       FROM platform.domains
      WHERE organization_id = $1
        AND status = 'active'
      ORDER BY is_primary DESC, created_at ASC
      LIMIT 1`,
    [organizationId]
  );
  return r.rows[0] ? String(r.rows[0].hostname) : null;
}

async function expireIfNeeded(db, row, env) {
  const now = new Date();
  if (!row || row.status !== "active") return { row, expired: false };
  if (!isExpiredRow(row, now)) return { row, expired: false };
  const ended = await repo.endSupportContext(db, {
    id: row.id,
    status: "expired",
    endReason: "ttl_elapsed",
  });
  const mapped = mapContextRow(ended || row, { status: "expired" });
  await recordAuditEventSafe(db, {
    deploymentCode: deploymentCode(env),
    organizationId: String(row.organization_id),
    churchId: String(row.church_id),
    branchId: row.branch_id || null,
    actorUserId: String(row.actor_user_id),
    actionKey: "platform.support.expired",
    entityType: "support_context",
    entityId: String(row.id),
    outcome: "success",
    metadata: {
      source: "platform_admin",
      actor_type: "platform_admin",
      category: String(row.support_type || ""),
    },
  });
  return { row: mapped, expired: true };
}

async function startHqSupport(db, input) {
  const gate = await assertPlatformPermission(
    db,
    input.actorUserId,
    "platform.support.enter_hq"
  );
  if (!gate.ok) {
    return { ok: false, status: gate.status, reason: gate.reason, context: null };
  }
  const reason = normalizeReason(input.reason);
  if (!reason) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "reason_required", context: null };
  }
  const org = await resolveOrganizationTarget(db, input.organizationKeyOrId);
  if (!org) {
    return { ok: false, status: STATUS.NOT_FOUND, reason: "organization_not_found", context: null };
  }

  try {
    await repo.endActiveForActor(db, {
      actorUserId: input.actorUserId,
      status: "ended",
      endReason: "superseded",
    });
    const rawToken = mintRawToken();
    const row = await repo.insertSupportContext(db, {
      deploymentCode: deploymentCode(input.env),
      actorUserId: input.actorUserId,
      organizationId: org.id,
      churchId: org.church_id,
      branchId: null,
      supportType: "hq",
      reason,
      contextTokenHash: hashToken(rawToken),
      ttlSeconds: Math.floor(SUPPORT_TTL_MS / 1000),
      actorSessionId: input.actorSessionId || null,
    });
    const names = await loadDisplayNames(db, mapContextRow(row));
    const hostname = await findPrimaryHostname(db, org.id);
    const context = mapContextRow(row, { ...names, portalPath: "/hq", hostname });

    await recordAuditEventSafe(db, {
      deploymentCode: deploymentCode(input.env),
      organizationId: String(org.id),
      churchId: String(org.church_id),
      actorUserId: input.actorUserId,
      actionKey: "platform.support.started",
      entityType: "support_context",
      entityId: context.id,
      outcome: "success",
      metadata: {
        source: "platform_admin",
        actor_type: "platform_admin",
        category: "hq",
      },
    });
    await recordAuditEventSafe(db, {
      deploymentCode: deploymentCode(input.env),
      organizationId: String(org.id),
      churchId: String(org.church_id),
      actorUserId: input.actorUserId,
      actionKey: "platform.support.hq_opened",
      entityType: "support_context",
      entityId: context.id,
      outcome: "success",
      metadata: {
        source: "platform_admin",
        actor_type: "platform_admin",
        category: "hq",
      },
    });

    return {
      ok: true,
      status: STATUS.OK,
      context,
      rawToken,
      redirectPath: "/hq",
    };
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message).slice(0, 120) : "lookup",
      context: null,
    };
  }
}

async function startBranchSupport(db, input) {
  const gate = await assertPlatformPermission(
    db,
    input.actorUserId,
    "platform.support.enter_branch"
  );
  if (!gate.ok) {
    return { ok: false, status: gate.status, reason: gate.reason, context: null };
  }
  const reason = normalizeReason(input.reason);
  if (!reason) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "reason_required", context: null };
  }
  const org = await resolveOrganizationTarget(db, input.organizationKeyOrId);
  if (!org) {
    return { ok: false, status: STATUS.NOT_FOUND, reason: "organization_not_found", context: null };
  }
  const branch = await resolveBranchTarget(
    db,
    org.id,
    org.church_id,
    input.branchKeyOrId
  );
  if (!branch) {
    return { ok: false, status: STATUS.NOT_FOUND, reason: "branch_not_found", context: null };
  }

  try {
    await repo.endActiveForActor(db, {
      actorUserId: input.actorUserId,
      status: "ended",
      endReason: "superseded",
    });
    const rawToken = mintRawToken();
    const row = await repo.insertSupportContext(db, {
      deploymentCode: deploymentCode(input.env),
      actorUserId: input.actorUserId,
      organizationId: org.id,
      churchId: org.church_id,
      branchId: branch.id,
      supportType: "branch",
      reason,
      contextTokenHash: hashToken(rawToken),
      ttlSeconds: Math.floor(SUPPORT_TTL_MS / 1000),
      actorSessionId: input.actorSessionId || null,
    });
    const names = await loadDisplayNames(db, mapContextRow(row));
    const hostname = await findPrimaryHostname(db, org.id);
    const context = mapContextRow(row, {
      ...names,
      portalPath: "/branch-admin",
      hostname,
    });

    await recordAuditEventSafe(db, {
      deploymentCode: deploymentCode(input.env),
      organizationId: String(org.id),
      churchId: String(org.church_id),
      branchId: String(branch.id),
      actorUserId: input.actorUserId,
      actionKey: "platform.support.started",
      entityType: "support_context",
      entityId: context.id,
      outcome: "success",
      metadata: {
        source: "platform_admin",
        actor_type: "platform_admin",
        category: "branch",
        branch_key: String(branch.branch_key || ""),
      },
    });
    await recordAuditEventSafe(db, {
      deploymentCode: deploymentCode(input.env),
      organizationId: String(org.id),
      churchId: String(org.church_id),
      branchId: String(branch.id),
      actorUserId: input.actorUserId,
      actionKey: "platform.support.branch_opened",
      entityType: "support_context",
      entityId: context.id,
      outcome: "success",
      metadata: {
        source: "platform_admin",
        actor_type: "platform_admin",
        category: "branch",
        branch_key: String(branch.branch_key || ""),
      },
    });

    return {
      ok: true,
      status: STATUS.OK,
      context,
      rawToken,
      redirectPath: "/branch-admin",
    };
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message).slice(0, 120) : "lookup",
      context: null,
    };
  }
}

async function exitSupport(db, input) {
  const gate = await assertPlatformPermission(
    db,
    input.actorUserId,
    "platform.support.exit"
  );
  if (!gate.ok) {
    return { ok: false, status: gate.status, reason: gate.reason, context: null };
  }

  try {
    let row = null;
    if (input.rawToken) {
      row = await repo.findActiveByTokenHash(db, hashToken(input.rawToken));
    }
    if (!row) {
      row = await repo.findActiveByActor(db, input.actorUserId);
    }
    if (!row) {
      return { ok: true, status: STATUS.OK, context: null, alreadyEnded: true };
    }
    if (String(row.actor_user_id) !== String(input.actorUserId)) {
      return { ok: false, status: STATUS.FORBIDDEN, reason: "actor_mismatch", context: null };
    }
    const expired = await expireIfNeeded(db, row, input.env);
    if (expired.expired) {
      return { ok: true, status: STATUS.OK, context: expired.row, alreadyEnded: true };
    }
    const ended = await repo.endSupportContext(db, {
      id: row.id,
      status: "ended",
      endReason: "manual_exit",
    });
    const context = mapContextRow(ended || row);
    await recordAuditEventSafe(db, {
      deploymentCode: deploymentCode(input.env),
      organizationId: String(row.organization_id),
      churchId: String(row.church_id),
      branchId: row.branch_id || null,
      actorUserId: input.actorUserId,
      actionKey: "platform.support.ended",
      entityType: "support_context",
      entityId: String(row.id),
      outcome: "success",
      metadata: {
        source: "platform_admin",
        actor_type: "platform_admin",
        category: String(row.support_type || ""),
        reason_code: "manual_exit",
      },
    });
    return { ok: true, status: STATUS.OK, context, alreadyEnded: false };
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message).slice(0, 120) : "lookup",
      context: null,
    };
  }
}

async function getSupportStatus(db, input) {
  const gate = await assertPlatformPermission(
    db,
    input.actorUserId,
    "platform.support.view_status"
  );
  if (!gate.ok) {
    return { ok: false, status: gate.status, reason: gate.reason, context: null };
  }
  try {
    let row = null;
    if (input.rawToken) {
      row = await repo.findActiveByTokenHash(db, hashToken(input.rawToken));
    }
    if (!row || String(row.actor_user_id) !== String(input.actorUserId)) {
      row = await repo.findActiveByActor(db, input.actorUserId);
    }
    if (!row) {
      return { ok: true, status: STATUS.OK, active: false, context: null };
    }
    const expired = await expireIfNeeded(db, row, input.env);
    if (expired.expired) {
      return { ok: true, status: STATUS.OK, active: false, context: expired.row };
    }
    const names = await loadDisplayNames(db, mapContextRow(row));
    return {
      ok: true,
      status: STATUS.OK,
      active: true,
      context: mapContextRow(row, names),
    };
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message).slice(0, 120) : "lookup",
      context: null,
    };
  }
}

/**
 * Resolve active support context for middleware (expiry checked inline).
 */
async function resolveActiveSupportContext(db, { rawToken, actorUserId, env }) {
  if (!rawToken || !actorUserId) {
    return { ok: true, active: false, context: null, expired: false };
  }
  try {
    const row = await repo.findActiveByTokenHash(db, hashToken(rawToken));
    if (!row) {
      return { ok: true, active: false, context: null, expired: false };
    }
    if (String(row.actor_user_id) !== String(actorUserId)) {
      return { ok: true, active: false, context: null, expired: false };
    }
    const expired = await expireIfNeeded(db, row, env);
    if (expired.expired) {
      return { ok: true, active: false, context: expired.row, expired: true };
    }
    const names = await loadDisplayNames(db, mapContextRow(row));
    return {
      ok: true,
      active: true,
      context: mapContextRow(row, names),
      expired: false,
    };
  } catch (err) {
    return {
      ok: false,
      active: false,
      context: null,
      expired: false,
      reason: err && err.message ? String(err.message).slice(0, 120) : "lookup",
    };
  }
}

function supportMatchesTenant(context, tenant, portalKind) {
  if (!context || !tenant || tenant.resolved !== true) return false;
  if (String(context.organizationId) !== String(tenant.organization.id)) return false;
  if (String(context.churchId) !== String(tenant.church.id)) return false;
  if (portalKind === "hq") {
    return context.supportType === "hq";
  }
  if (portalKind === "branch") {
    if (context.supportType !== "branch" || !context.branchId) return false;
    const branchId =
      tenant.primaryBranch && tenant.primaryBranch.id
        ? String(tenant.primaryBranch.id)
        : null;
    return branchId && String(context.branchId) === branchId;
  }
  return false;
}

function actorHasPlatformAdminRole(req) {
  const roles =
    (req.blessBoardAuthorizationContext &&
      req.blessBoardAuthorizationContext.effectiveRoles) ||
    [];
  if (roles.some((r) => r && r.roleKey === "platform_admin")) return true;
  const sessionRoles =
    req.v5Session &&
    req.v5Session.session &&
    Array.isArray(req.v5Session.session.roleKeys)
      ? req.v5Session.session.roleKeys
      : [];
  return sessionRoles.includes("platform_admin");
}

module.exports = {
  STATUS,
  SUPPORT_TTL_MS,
  normalizeReason,
  startHqSupport,
  startBranchSupport,
  exitSupport,
  getSupportStatus,
  resolveActiveSupportContext,
  supportMatchesTenant,
  actorHasPlatformAdminRole,
  resolveOrganizationTarget,
  resolveBranchTarget,
  hashToken,
  mintRawToken,
};
