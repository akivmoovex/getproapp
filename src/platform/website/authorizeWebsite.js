"use strict";

const { hasWebsitePermission, PERMISSIONS } = require("./permissions");
const instanceRepo = require("./instanceRepository");

async function authorizeWebsiteInstance(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const instance = await instanceRepo.findWebsiteInstanceById(db, input.instanceId, organizationId);
  if (!instance) return { ok: false, code: "website_instance_not_found" };
  if (instance.organizationId !== organizationId) return { ok: false, code: "tenant_mismatch" };
  const needed = input.permission || PERMISSIONS.VIEW;
  if (!hasWebsitePermission(input.grantedPermissions || [], needed)) {
    return { ok: false, code: "forbidden", instance };
  }
  return { ok: true, instance };
}

module.exports = {
  authorizeWebsiteInstance,
};
