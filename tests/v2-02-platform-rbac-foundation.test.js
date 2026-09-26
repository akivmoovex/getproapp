"use strict";

/**
 * V2.02 platform RBAC foundation — catalogue, effective permissions, audit primitives.
 * No BB login or AC route behavior changes.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  RBAC_PRODUCT,
  ROLE_CATEGORY,
  PATIENT_CREATE_ALLOWED_ROLE_KEYS,
  PATIENT_CREATE_PERMISSION_KEY,
  CATALOGUE_SCHEMA,
  RBAC_ASSIGNMENT_EVENT,
  LOOKUP_STATUS,
  categoriesForProduct,
  roleCategoryAllowedForProduct,
  inferProductForRole,
  lookupRole,
  lookupRoles,
  lookupPermission,
  roleMayHoldPatientCreate,
  assertPatientCreatePolicy,
  resolveEffectivePermissionKeys,
  unionPermissionKeys,
  hasPermissionKey,
  buildAssignmentAuditEvent,
  recordAssignmentAudit,
  findCatalogueRoleByKey,
  listPermissionKeysForRoleIds,
} = require("../src/platform/rbac");

const bbRbacRepo = require("../src/blessboard/repositories/blessBoardRbacRepository");

const ROLE_WE = {
  id: "11111111-1111-4111-8111-111111111111",
  role_key: "website_editor",
  display_name: "Website Editor",
  description: null,
  role_category: "website",
  is_system: true,
  is_sensitive: false,
  is_active: true,
};

const ROLE_AC_RECEPTION = {
  id: "22222222-2222-4222-8222-222222222222",
  role_key: "activeclinic_receptionist",
  display_name: "Receptionist",
  description: null,
  role_category: "activeclinic",
  is_system: true,
  is_sensitive: false,
  is_active: true,
};

const ROLE_AC_ORG = {
  id: "33333333-3333-4333-8333-333333333333",
  role_key: "activeclinic_organization_admin",
  display_name: "Org Admin",
  description: null,
  role_category: "activeclinic",
  is_system: true,
  is_sensitive: true,
  is_active: true,
};

const ROLE_INACTIVE = {
  id: "44444444-4444-4444-8444-444444444444",
  role_key: "visitor",
  display_name: "Visitor",
  description: null,
  role_category: "visitor",
  is_system: true,
  is_sensitive: false,
  is_active: false,
};

const PERM_EDIT = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  permission_key: "website.edit",
  resource_key: "website",
  action_key: "edit",
  display_name: "Edit website",
  description: null,
  sensitivity: "standard",
  is_system: true,
  is_active: true,
};

const PERM_CREATE = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  permission_key: "activeclinic.patient.create",
  resource_key: "activeclinic",
  action_key: "create",
  display_name: "Create patient",
  description: null,
  sensitivity: "sensitive",
  is_system: true,
  is_active: true,
};

function createCatalogClient(seed) {
  const roles = [...(seed.roles || [])];
  const permissions = [...(seed.permissions || [])];
  /** @type {Map<string, string[]>} */
  const rolePerms = new Map(Object.entries(seed.rolePermissions || {}));
  const inserts = [];

  return {
    inserts,
    async query(sql, params) {
      const text = String(sql).replace(/\s+/g, " ");

      if (text.includes("FROM blessboard.roles") && text.includes("WHERE role_key = $1")) {
        const key = params[0];
        const activeOnly = text.includes("is_active = true");
        let row = roles.find((r) => r.role_key === key);
        if (row && activeOnly && !row.is_active) row = null;
        return { rows: row ? [row] : [] };
      }

      if (text.includes("FROM blessboard.roles") && text.includes("WHERE id = $1")) {
        const row = roles.find((r) => r.id === params[0]);
        return { rows: row ? [row] : [] };
      }

      if (text.includes("FROM blessboard.roles") && text.includes("ORDER BY role_category")) {
        let rows = roles.slice();
        if (text.includes("is_active = true")) {
          rows = rows.filter((r) => r.is_active);
        }
        if (text.includes("role_category = ANY")) {
          const cats = params[0];
          rows = rows.filter((r) => cats.includes(r.role_category));
        }
        if (text.includes("role_key = ANY")) {
          const keys = params[params.length - 1];
          rows = rows.filter((r) => keys.includes(r.role_key));
        }
        rows.sort((a, b) =>
          `${a.role_category}:${a.role_key}`.localeCompare(`${b.role_category}:${b.role_key}`)
        );
        return { rows };
      }

      if (text.includes("FROM blessboard.permissions") && text.includes("permission_key = $1")) {
        const key = params[0];
        const activeOnly = text.includes("is_active = true");
        let row = permissions.find((p) => p.permission_key === key);
        if (row && activeOnly && !row.is_active) row = null;
        return { rows: row ? [row] : [] };
      }

      if (text.includes("role_permissions") && text.includes("ANY($1::uuid[])")) {
        const ids = params[0] || [];
        const keys = new Set();
        for (const id of ids) {
          for (const k of rolePerms.get(id) || []) keys.add(k);
        }
        return {
          rows: [...keys].sort().map((permission_key) => ({ permission_key })),
        };
      }

      if (text.includes("role_permissions") && text.includes("rp.role_id = $1")) {
        const keys = rolePerms.get(params[0]) || [];
        return {
          rows: keys.sort().map((permission_key) => ({ permission_key })),
        };
      }

      if (text.includes("INSERT INTO blessboard.user_role_assignment_events")) {
        const row = {
          id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          created_at: new Date().toISOString(),
        };
        inserts.push({ sql: text, params, row });
        return { rows: [row] };
      }

      throw new Error(`Unexpected SQL in mock catalogue client: ${text.slice(0, 180)}`);
    },
  };
}

describe("V2.02 platform RBAC foundation — constants / validation", () => {
  it("keeps catalogue physical schema as blessboard until Phase F", () => {
    assert.equal(CATALOGUE_SCHEMA, "blessboard");
  });

  it("maps products to role categories without mixing AC into BB", () => {
    assert.ok(categoriesForProduct(RBAC_PRODUCT.BLESSBOARD).includes(ROLE_CATEGORY.WEBSITE));
    assert.ok(!categoriesForProduct(RBAC_PRODUCT.BLESSBOARD).includes(ROLE_CATEGORY.ACTIVECLINIC));
    assert.deepEqual(categoriesForProduct(RBAC_PRODUCT.ACTIVECLINIC), [
      ROLE_CATEGORY.ACTIVECLINIC,
    ]);
    assert.equal(
      roleCategoryAllowedForProduct(ROLE_CATEGORY.ACTIVECLINIC, RBAC_PRODUCT.BLESSBOARD),
      false
    );
    assert.equal(
      roleCategoryAllowedForProduct(ROLE_CATEGORY.WEBSITE, RBAC_PRODUCT.BLESSBOARD),
      true
    );
  });

  it("encodes V2.02 patient.create role families (reception/clinical/management)", () => {
    assert.ok(PATIENT_CREATE_ALLOWED_ROLE_KEYS.includes("activeclinic_receptionist"));
    assert.ok(PATIENT_CREATE_ALLOWED_ROLE_KEYS.includes("activeclinic_clinic_manager"));
    assert.ok(PATIENT_CREATE_ALLOWED_ROLE_KEYS.includes("activeclinic_medical_records_officer"));
    assert.ok(PATIENT_CREATE_ALLOWED_ROLE_KEYS.includes("activeclinic_organization_admin"));
    assert.ok(PATIENT_CREATE_ALLOWED_ROLE_KEYS.includes("activeclinic_network_admin"));
    assert.equal(roleMayHoldPatientCreate("activeclinic_organization_admin"), true);
    assert.equal(roleMayHoldPatientCreate("activeclinic_facility_admin"), false);
    assert.equal(roleMayHoldPatientCreate("activeclinic_billing_officer"), false);
    assert.equal(
      assertPatientCreatePolicy([PATIENT_CREATE_PERMISSION_KEY], "activeclinic_organization_admin")
        .ok,
      true
    );
    assert.equal(
      assertPatientCreatePolicy([PATIENT_CREATE_PERMISSION_KEY], "activeclinic_receptionist").ok,
      true
    );
    assert.equal(
      assertPatientCreatePolicy([PATIENT_CREATE_PERMISSION_KEY], "activeclinic_website_editor").ok,
      false
    );
  });
});

describe("V2.02 platform RBAC foundation — catalogue reads", () => {
  it("looks up roles and permissions by key", async () => {
    const client = createCatalogClient({
      roles: [ROLE_WE, ROLE_AC_RECEPTION],
      permissions: [PERM_EDIT, PERM_CREATE],
    });
    const role = await findCatalogueRoleByKey(client, "website_editor");
    assert.equal(role.roleKey, "website_editor");
    assert.equal(inferProductForRole(role), RBAC_PRODUCT.BLESSBOARD);

    const ok = await lookupRole(client, "website_editor", {
      product: RBAC_PRODUCT.BLESSBOARD,
    });
    assert.equal(ok.status, LOOKUP_STATUS.OK);

    const mismatch = await lookupRole(client, "activeclinic_receptionist", {
      product: RBAC_PRODUCT.BLESSBOARD,
    });
    assert.equal(mismatch.status, LOOKUP_STATUS.PRODUCT_MISMATCH);

    const perm = await lookupPermission(client, "website.edit");
    assert.equal(perm.status, LOOKUP_STATUS.OK);
    assert.equal(perm.permission.permissionKey, "website.edit");
  });

  it("handles missing, inactive, invalid, and duplicate role keys", async () => {
    const client = createCatalogClient({
      roles: [ROLE_WE, ROLE_INACTIVE],
    });
    const missing = await lookupRole(client, "does_not_exist_role");
    assert.equal(missing.status, LOOKUP_STATUS.MISSING);

    const invalid = await lookupRole(client, "BAD ROLE");
    assert.equal(invalid.status, LOOKUP_STATUS.INVALID_KEY);

    const inactive = await lookupRole(client, "visitor", { activeOnly: true });
    assert.equal(inactive.status, LOOKUP_STATUS.INACTIVE);

    const batch = await lookupRoles(client, [
      "website_editor",
      "website_editor",
      "missing_role_x",
    ]);
    assert.equal(batch.hasDuplicates, true);
    assert.deepEqual(batch.duplicateRequestKeys, ["website_editor"]);
    assert.deepEqual(batch.missing, ["missing_role_x"]);
    assert.equal(batch.found.length, 1);
  });
});

describe("V2.02 platform RBAC foundation — permission resolution", () => {
  it("unions permission keys across roles and reports unresolved keys", async () => {
    const client = createCatalogClient({
      roles: [ROLE_WE, ROLE_AC_RECEPTION, ROLE_AC_ORG],
      rolePermissions: {
        [ROLE_WE.id]: ["website.edit", "website.view"],
        [ROLE_AC_RECEPTION.id]: ["activeclinic.patient.create", "activeclinic.access"],
        [ROLE_AC_ORG.id]: ["activeclinic.organization.manage", "activeclinic.access"],
      },
    });

    assert.deepEqual(unionPermissionKeys(["a", "b"], ["b", "c"]), ["a", "b", "c"]);
    assert.equal(hasPermissionKey(["website.edit"], "website.edit"), true);

    const resolved = await resolveEffectivePermissionKeys(client, {
      roleKeys: ["website_editor", "activeclinic_receptionist", "missing_role"],
      product: RBAC_PRODUCT.SHARED,
    });
    assert.ok(resolved.hasPermission("website.edit"));
    assert.ok(resolved.hasPermission("activeclinic.patient.create"));
    assert.deepEqual(resolved.missingRoleKeys, ["missing_role"]);

    const keys = await listPermissionKeysForRoleIds(client, [ROLE_WE.id, ROLE_AC_ORG.id]);
    assert.ok(keys.includes("website.edit"));
    assert.ok(keys.includes("activeclinic.organization.manage"));
    assert.ok(!keys.includes("activeclinic.patient.create"));
  });

  it("allows AC org admin patient.create when catalogue grants it", async () => {
    const client = createCatalogClient({
      roles: [ROLE_AC_ORG],
      rolePermissions: {
        [ROLE_AC_ORG.id]: [
          "activeclinic.organization.manage",
          PATIENT_CREATE_PERMISSION_KEY,
        ],
      },
    });
    const resolved = await resolveEffectivePermissionKeys(client, {
      roleKeys: ["activeclinic_organization_admin"],
      product: RBAC_PRODUCT.ACTIVECLINIC,
    });
    assert.equal(resolved.hasPermission(PATIENT_CREATE_PERMISSION_KEY), true);
  });
});

describe("V2.02 platform RBAC foundation — BB / AC compatibility", () => {
  it("BB repository catalogue helpers match platform catalogue reads", async () => {
    const client = createCatalogClient({
      roles: [ROLE_WE],
      permissions: [PERM_EDIT],
      rolePermissions: {
        [ROLE_WE.id]: ["website.edit"],
      },
    });
    const viaPlatform = await findCatalogueRoleByKey(client, "website_editor");
    const viaBb = await bbRbacRepo.findRoleByKey(client, "website_editor");
    assert.deepEqual(viaBb, viaPlatform);

    const keysPlatform = await listPermissionKeysForRoleIds(client, [ROLE_WE.id]);
    const keysBb = await bbRbacRepo.listPermissionKeysForRoleIds(client, [ROLE_WE.id]);
    assert.deepEqual(keysBb, keysPlatform);
  });

  it("AC product filter accepts AC roles and rejects BB website roles", async () => {
    const client = createCatalogClient({
      roles: [ROLE_WE, ROLE_AC_RECEPTION],
    });
    const acOk = await lookupRole(client, "activeclinic_receptionist", {
      product: RBAC_PRODUCT.ACTIVECLINIC,
    });
    assert.equal(acOk.status, LOOKUP_STATUS.OK);
    const bbDenied = await lookupRole(client, "website_editor", {
      product: RBAC_PRODUCT.ACTIVECLINIC,
    });
    assert.equal(bbDenied.status, LOOKUP_STATUS.PRODUCT_MISMATCH);
  });
});

describe("V2.02 platform RBAC foundation — assignment audit primitives", () => {
  it("builds and persists BlessBoard assignment audit events", async () => {
    const client = createCatalogClient({ roles: [] });
    const bad = buildAssignmentAuditEvent({ eventKey: "nope" });
    assert.equal(bad.ok, false);

    const built = buildAssignmentAuditEvent({
      product: RBAC_PRODUCT.BLESSBOARD,
      eventKey: RBAC_ASSIGNMENT_EVENT.CREATED,
      assignmentId: "55555555-5555-4555-8555-555555555555",
      organizationId: "66666666-6666-4666-8666-666666666666",
      actorUserId: "77777777-7777-4777-8777-777777777777",
      newStatus: "active",
      roleKey: "website_editor",
    });
    assert.equal(built.ok, true);

    const recorded = await recordAssignmentAudit(client, built.event);
    assert.equal(recorded.ok, true);
    assert.ok(recorded.row.id);
    assert.equal(client.inserts.length, 1);
  });

  it("AC assignment audit returns payload without inventing grants", async () => {
    const client = createCatalogClient({ roles: [] });
    const recorded = await recordAssignmentAudit(client, {
      product: RBAC_PRODUCT.ACTIVECLINIC,
      eventKey: RBAC_ASSIGNMENT_EVENT.CREATED,
      assignmentId: "55555555-5555-4555-8555-555555555555",
      organizationId: "66666666-6666-4666-8666-666666666666",
      roleKey: "activeclinic_receptionist",
      newStatus: "active",
    });
    assert.equal(recorded.ok, true);
    assert.equal(recorded.persisted, false);
    assert.equal(recorded.note, "activeclinic_assignment_audit_payload_only");
    assert.equal(client.inserts.length, 0);
  });
});
