"use strict";

const { hasWebsitePermission, PERMISSIONS } = require("./permissions");
const instanceRepo = require("./instanceRepository");

function assertWebsiteInstanceScope(instance, input) {
  if (!instance) return { ok: false, code: "website_instance_not_found" };
  const organizationId = String((input && input.organizationId) || "");
  if (organizationId && instance.organizationId !== organizationId) {
    return { ok: false, code: "tenant_mismatch" };
  }
  const expectedProductCode = String((input && input.expectedProductCode) || "").trim();
  if (expectedProductCode && instance.productCode !== expectedProductCode) {
    return { ok: false, code: "tenant_mismatch" };
  }
  return { ok: true, instance };
}

async function authorizeWebsiteInstance(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const instance = await instanceRepo.findWebsiteInstanceById(db, input.instanceId, organizationId);
  const scoped = assertWebsiteInstanceScope(instance, input);
  if (!scoped.ok) return scoped;
  const needed = input.permission || PERMISSIONS.VIEW;
  if (!hasWebsitePermission(input.grantedPermissions || [], needed)) {
    return { ok: false, code: "forbidden", instance };
  }
  return { ok: true, instance };
}

/**
 * Canonical combined authorization for a shared website lifecycle action:
 * loads the instance, asserts tenancy and product scope, then checks permission.
 *
 * Lifecycle services must call this instead of re-deriving the same decision, so
 * a service cannot acquire an instance without having been asked who the actor is.
 *
 * Permission enforcement is **opt-in by supplying `grantedPermissions`**. A caller
 * that omits it gets tenancy and scope only, which is the long-standing contract
 * for products whose authorization lives in route middleware (BlessBoard). Supply
 * the actor's grants and the same call additionally enforces them. This is the
 * pattern `unpublishWebsite` already used; it is generalized here so every
 * lifecycle op enforces identically rather than each inventing its own check.
 *
 * `authorizeWebsiteInstance` differs deliberately: it always requires a grant and
 * fails closed on an omitted list, so it is unsuitable for the opt-in callers.
 *
 * @param {{ query: Function }} db
 * @param {{
 *   organizationId: string,
 *   instanceId: string,
 *   expectedProductCode?: string,
 *   grantedPermissions?: string[],
 *   permission?: string,
 *   anyPermission?: string[],
 * }} input
 * @returns {Promise<{ok: true, instance: object} | {ok: false, code: string, instance: object|null}>}
 */
async function authorizeWebsiteAction(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const instance = await instanceRepo.findWebsiteInstanceById(db, input.instanceId, organizationId);
  const scoped = assertWebsiteInstanceScope(instance, input);
  if (!scoped.ok) return { ok: false, code: scoped.code, instance: null };

  if (Array.isArray(input.grantedPermissions)) {
    const accepted =
      Array.isArray(input.anyPermission) && input.anyPermission.length
        ? input.anyPermission
        : [input.permission || PERMISSIONS.VIEW];
    const allowed = accepted.some((permission) =>
      hasWebsitePermission(input.grantedPermissions, permission)
    );
    if (!allowed) return { ok: false, code: "forbidden", instance };
  }

  return { ok: true, instance };
}

module.exports = {
  assertWebsiteInstanceScope,
  authorizeWebsiteInstance,
  authorizeWebsiteAction,
};
