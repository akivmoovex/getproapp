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

module.exports = {
  assertWebsiteInstanceScope,
  authorizeWebsiteInstance,
};
