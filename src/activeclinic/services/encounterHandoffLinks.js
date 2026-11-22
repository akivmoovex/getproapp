"use strict";

/**
 * Department links already enforced by their own routes.
 * Shown on an encounter only when the current staff member holds the permission.
 */

const HANDOFF = Object.freeze({
  reception: {
    permission: "activeclinic.reception.view",
    href: "/app/reception",
  },
  pharmacy: {
    permission: "activeclinic.pharmacy.view",
    href: "/app/pharmacy",
  },
  billing: {
    permission: "activeclinic.billing.view",
    href: "/app/billing",
  },
  laboratory: {
    permissions: ["activeclinic.lab.view", "activeclinic.diagnostics.view"],
    href: "/app/diagnostics/laboratory/queue",
  },
});

function handoffPermissionKeys() {
  const keys = [];
  for (const spec of Object.values(HANDOFF)) {
    if (spec.permissions) keys.push(...spec.permissions);
    else keys.push(spec.permission);
  }
  return keys;
}

function selectEncounterHandoffLinks(grantedPermissions) {
  const granted = new Set(grantedPermissions || []);
  const links = {};
  for (const [key, spec] of Object.entries(HANDOFF)) {
    const keys = spec.permissions || [spec.permission];
    if (keys.some((permission) => granted.has(permission))) {
      links[key] = spec.href;
    }
  }
  return links;
}

module.exports = {
  HANDOFF,
  handoffPermissionKeys,
  selectEncounterHandoffLinks,
};
