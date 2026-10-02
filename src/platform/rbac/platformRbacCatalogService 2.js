"use strict";

/**
 * Platform RBAC catalogue service — role lookup + product/category validation.
 * Does not grant permissions or change login eligibility.
 */

const {
  RBAC_PRODUCT,
  PRODUCT_ROLE_CATEGORIES,
  ALL_ROLE_CATEGORIES,
  ROLE_KEY_RE,
  PERMISSION_KEY_RE,
  PATIENT_CREATE_ALLOWED_ROLE_KEYS,
  PATIENT_CREATE_PERMISSION_KEY,
} = require("./platformRbacConstants");
const catalogRepo = require("./platformRbacCatalogRepository");

const LOOKUP_STATUS = Object.freeze({
  OK: "ok",
  MISSING: "missing",
  INACTIVE: "inactive",
  INVALID_KEY: "invalid_key",
  PRODUCT_MISMATCH: "product_mismatch",
  DUPLICATE_REQUEST: "duplicate_request",
});

/**
 * @param {string} product
 * @returns {string[]|null}
 */
function categoriesForProduct(product) {
  const key = String(product || "").trim().toLowerCase();
  if (!key) return null;
  return PRODUCT_ROLE_CATEGORIES[key] || null;
}

/**
 * @param {string} roleCategory
 * @param {string} product
 */
function roleCategoryAllowedForProduct(roleCategory, product) {
  const allowed = categoriesForProduct(product);
  if (!allowed) return false;
  return allowed.includes(String(roleCategory || ""));
}

/**
 * Infer product affinity from role category / key prefix.
 * @param {{ roleCategory?: string, roleKey?: string }} role
 */
function inferProductForRole(role) {
  const category = role && role.roleCategory;
  if (category === "activeclinic") return RBAC_PRODUCT.ACTIVECLINIC;
  if (category === "platform") return RBAC_PRODUCT.PLATFORM;
  if (category && ALL_ROLE_CATEGORIES.includes(category)) {
    return RBAC_PRODUCT.BLESSBOARD;
  }
  const key = String((role && role.roleKey) || "");
  if (key.startsWith("activeclinic_")) return RBAC_PRODUCT.ACTIVECLINIC;
  if (key === "platform_administrator" || key.startsWith("platform_")) {
    return RBAC_PRODUCT.PLATFORM;
  }
  return null;
}

/**
 * @param {{ query: Function }} client
 * @param {string} roleKey
 * @param {{
 *   product?: string,
 *   activeOnly?: boolean,
 * }} [opts]
 */
async function lookupRole(client, roleKey, opts) {
  const o = opts || {};
  const key = String(roleKey || "").trim();
  if (!key || !ROLE_KEY_RE.test(key)) {
    return {
      status: LOOKUP_STATUS.INVALID_KEY,
      role: null,
      roleKey: key || null,
      reason: "invalid_role_key",
    };
  }

  const role = await catalogRepo.findRoleByKey(client, key, {
    activeOnly: false,
  });
  if (!role) {
    return {
      status: LOOKUP_STATUS.MISSING,
      role: null,
      roleKey: key,
      reason: "role_not_found",
    };
  }
  if (o.activeOnly === true && !role.isActive) {
    return {
      status: LOOKUP_STATUS.INACTIVE,
      role,
      roleKey: key,
      reason: "role_inactive",
    };
  }
  if (o.product) {
    const product = String(o.product).trim().toLowerCase();
    if (product !== RBAC_PRODUCT.SHARED) {
      if (!roleCategoryAllowedForProduct(role.roleCategory, product)) {
        return {
          status: LOOKUP_STATUS.PRODUCT_MISMATCH,
          role,
          roleKey: key,
          reason: "role_product_mismatch",
          expectedProduct: product,
          inferredProduct: inferProductForRole(role),
        };
      }
    }
  }
  return {
    status: LOOKUP_STATUS.OK,
    role,
    roleKey: key,
    reason: null,
    inferredProduct: inferProductForRole(role),
  };
}

/**
 * Lookup many role keys; reports duplicates in the request and missing keys.
 * @param {{ query: Function }} client
 * @param {string[]} roleKeys
 * @param {{ product?: string, activeOnly?: boolean }} [opts]
 */
async function lookupRoles(client, roleKeys, opts) {
  const requested = Array.isArray(roleKeys) ? roleKeys.map((k) => String(k || "").trim()) : [];
  const seen = new Map();
  const duplicateKeys = [];
  for (const key of requested) {
    if (!key) continue;
    const count = (seen.get(key) || 0) + 1;
    seen.set(key, count);
    if (count === 2) duplicateKeys.push(key);
  }
  const uniqueKeys = [...seen.keys()];
  const results = [];
  for (const key of uniqueKeys) {
    results.push(await lookupRole(client, key, opts));
  }
  return {
    results,
    found: results.filter((r) => r.status === LOOKUP_STATUS.OK).map((r) => r.role),
    missing: results.filter((r) => r.status === LOOKUP_STATUS.MISSING).map((r) => r.roleKey),
    inactive: results.filter((r) => r.status === LOOKUP_STATUS.INACTIVE).map((r) => r.roleKey),
    productMismatch: results
      .filter((r) => r.status === LOOKUP_STATUS.PRODUCT_MISMATCH)
      .map((r) => r.roleKey),
    invalid: results.filter((r) => r.status === LOOKUP_STATUS.INVALID_KEY).map((r) => r.roleKey),
    duplicateRequestKeys: duplicateKeys,
    hasDuplicates: duplicateKeys.length > 0,
  };
}

/**
 * @param {{ query: Function }} client
 * @param {string} permissionKey
 * @param {{ activeOnly?: boolean }} [opts]
 */
async function lookupPermission(client, permissionKey, opts) {
  const key = String(permissionKey || "").trim();
  if (!key || !PERMISSION_KEY_RE.test(key)) {
    return {
      status: LOOKUP_STATUS.INVALID_KEY,
      permission: null,
      permissionKey: key || null,
      reason: "invalid_permission_key",
    };
  }
  const permission = await catalogRepo.findPermissionByKey(client, key, {
    activeOnly: false,
  });
  if (!permission) {
    return {
      status: LOOKUP_STATUS.MISSING,
      permission: null,
      permissionKey: key,
      reason: "permission_not_found",
    };
  }
  if (opts && opts.activeOnly === true && !permission.isActive) {
    return {
      status: LOOKUP_STATUS.INACTIVE,
      permission,
      permissionKey: key,
      reason: "permission_inactive",
    };
  }
  return {
    status: LOOKUP_STATUS.OK,
    permission,
    permissionKey: key,
    reason: null,
  };
}

/**
 * Policy helper for V8-002 — does not mutate catalogue.
 * @param {string} roleKey
 */
function roleMayHoldPatientCreate(roleKey) {
  return PATIENT_CREATE_ALLOWED_ROLE_KEYS.includes(String(roleKey || "").trim());
}

/**
 * @param {string[]} permissionKeys
 * @param {string} roleKey
 */
function assertPatientCreatePolicy(permissionKeys, roleKey) {
  const keys = Array.isArray(permissionKeys) ? permissionKeys : [];
  const hasCreate = keys.includes(PATIENT_CREATE_PERMISSION_KEY);
  if (!hasCreate) {
    return { ok: true, violation: null };
  }
  if (roleMayHoldPatientCreate(roleKey)) {
    return { ok: true, violation: null };
  }
  return {
    ok: false,
    violation: "patient_create_role_family_denied",
    roleKey: String(roleKey || ""),
    permissionKey: PATIENT_CREATE_PERMISSION_KEY,
  };
}

/**
 * Catalogue integrity: list ActiveClinic roles that currently hold patient.create.
 * @param {{ query: Function }} db
 * @returns {Promise<{ ok: boolean, roleKeys: string[], violations: string[] }>}
 */
async function auditActiveClinicPatientCreateGrants(db) {
  if (!db || typeof db.query !== "function") {
    return { ok: false, roleKeys: [], violations: ["pool_unavailable"] };
  }
  try {
    const r = await db.query(
      `SELECT r.role_key
         FROM blessboard.roles r
         JOIN blessboard.role_permissions rp ON rp.role_id = r.id
         JOIN blessboard.permissions p ON p.id = rp.permission_id
        WHERE r.role_category = 'activeclinic'
          AND p.permission_key = $1
        ORDER BY r.role_key`,
      [PATIENT_CREATE_PERMISSION_KEY]
    );
    const roleKeys = r.rows.map((row) => String(row.role_key));
    const allowed = new Set(PATIENT_CREATE_ALLOWED_ROLE_KEYS);
    const violations = roleKeys.filter((k) => !allowed.has(k));
    const missing = PATIENT_CREATE_ALLOWED_ROLE_KEYS.filter(
      (k) => !roleKeys.includes(k)
    );
    return {
      ok: violations.length === 0 && missing.length === 0,
      roleKeys,
      violations,
      missing,
    };
  } catch (err) {
    return {
      ok: false,
      roleKeys: [],
      violations: [err && err.message ? String(err.message) : "lookup_error"],
      missing: [],
    };
  }
}

module.exports = {
  LOOKUP_STATUS,
  categoriesForProduct,
  roleCategoryAllowedForProduct,
  inferProductForRole,
  lookupRole,
  lookupRoles,
  lookupPermission,
  roleMayHoldPatientCreate,
  assertPatientCreatePolicy,
  auditActiveClinicPatientCreateGrants,
};
