"use strict";

/**
 * Shared permission-based actor gate for migrated BlessBoard services.
 * Final allow/deny uses authorize(); admin mode uses organisation.settings.manage
 * as church-wide signal (HQ/platform compatibility), not as a substitute for
 * module permissions.
 */

const {
  authorize,
  listEffectivePermissions,
} = require("./blessBoardRbacAuthorizationService");

/**
 * @param {{ query: Function }} client
 * @param {{
 *   actorUserId: string,
 *   tenant: object,
 *   permission: string,
 *   branchId?: string|null,
 *   resourceContext?: object,
 * }} input
 */
async function requireActorPermission(client, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const permission = String((input && input.permission) || "").trim();
  const tenant = input && input.tenant;
  if (!actorUserId || !permission || !tenant || tenant.resolved !== true) {
    return { ok: false, allowed: false, reason: "invalid_input", mode: null };
  }

  const resourceContext = {
    organizationId: tenant.organization.id,
    churchId: tenant.church.id,
    branchId:
      input.branchId != null
        ? input.branchId
        : tenant.primaryBranch && tenant.primaryBranch.id
          ? tenant.primaryBranch.id
          : null,
    ...(input.resourceContext || {}),
  };

  const authz = await authorize(client, {
    actor: { userId: actorUserId },
    permission,
    tenantContext: tenant,
    resourceContext,
  });

  if (!authz.allowed) {
    return {
      ok: false,
      allowed: false,
      reason: authz.reasonCode || "denied",
      mode: null,
      permission,
    };
  }

  const hqSignal = await authorize(client, {
    actor: { userId: actorUserId },
    permission: "organisation.settings.manage",
    tenantContext: tenant,
    resourceContext: {
      organizationId: tenant.organization.id,
      churchId: tenant.church.id,
      branchId: null,
    },
  });

  return {
    ok: true,
    allowed: true,
    reason: null,
    mode: hqSignal.allowed ? "hq" : "branch",
    permission,
  };
}

/**
 * @param {{ query: Function }} client
 * @param {{
 *   actorUserId: string,
 *   tenant: object,
 *   branchId?: string|null,
 * }} input
 */
async function listActorPermissions(client, input) {
  const tenant = input && input.tenant;
  if (!tenant || tenant.resolved !== true) {
    return { ok: false, permissions: [] };
  }
  const result = await listEffectivePermissions(client, {
    actor: { userId: input.actorUserId },
    tenantContext: tenant,
    resourceContext: {
      organizationId: tenant.organization.id,
      churchId: tenant.church.id,
      branchId: input.branchId || null,
    },
  });
  return { ok: true, permissions: result.permissions || [] };
}

module.exports = {
  requireActorPermission,
  listActorPermissions,
};
