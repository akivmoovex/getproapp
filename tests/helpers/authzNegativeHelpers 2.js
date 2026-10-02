"use strict";

/**
 * Reusable negative-test helpers for RBAC / tenant isolation suites.
 */

const assert = require("node:assert/strict");

/**
 * Assert a response is an isolation denial (401/403/404 or login redirect).
 * @param {{ status: number, headers?: object, text?: string }} res
 * @param {string} [label]
 */
function expectIsolationDenied(res, label) {
  const status = Number(res && res.status);
  const location = String(
    (res && res.headers && (res.headers.location || res.headers.Location)) || ""
  );
  const loginRedirect =
    (status === 302 || status === 303) && /\/login/i.test(location);
  assert.ok(
    [401, 403, 404].includes(status) || loginRedirect,
    `${label || "request"} expected 401/403/404 or login redirect, got ${status} ${location}`
  );
  return true;
}

/**
 * Build a forged tenant body for privilege-escalation probes.
 * @param {object} [overrides]
 */
function forgeTenantBody(overrides) {
  return {
    organizationId: "00000000-0000-4000-8000-000000000099",
    churchId: "00000000-0000-4000-8000-000000000098",
    branchId: "00000000-0000-4000-8000-000000000097",
    facilityId: "00000000-0000-4000-8000-000000000096",
    organization_id: "00000000-0000-4000-8000-000000000099",
    facility_id: "00000000-0000-4000-8000-000000000096",
    ...(overrides || {}),
  };
}

/**
 * Permission matrix cell helper.
 * @param {Record<string, boolean|string>} matrix role → allow/deny
 * @param {string} role
 * @param {boolean} actualAllowed
 * @param {string} [cellLabel]
 */
function assertMatrixCell(matrix, role, actualAllowed, cellLabel) {
  const expected = matrix[role];
  if (expected === undefined) {
    throw new Error(`Unknown matrix role ${role} for ${cellLabel || "cell"}`);
  }
  const shouldAllow = expected === true || expected === "Allow" || expected === "allow";
  assert.equal(
    Boolean(actualAllowed),
    shouldAllow,
    `${cellLabel || "matrix"} role=${role} expected ${shouldAllow ? "allow" : "deny"} got ${actualAllowed}`
  );
}

/**
 * Compact BB × AC cross-product expectations used by V8 shared suites.
 */
const CROSS_PRODUCT_MATRIX = Object.freeze({
  blessboard_cookie_on_activeclinic: "Deny",
  activeclinic_cookie_on_blessboard: "Deny",
  forged_organization_id: "Deny",
  forged_church_id: "Deny",
  forged_branch_id: "Deny",
  forged_facility_id: "Deny",
});

/**
 * Representative BlessBoard permission matrix (server-side catalogue keys).
 * Cells are role → whether the role's legacy/compat grant typically allows.
 */
const BB_PERMISSION_MATRIX = Object.freeze({
  "website.publish": Object.freeze({
    visitor: false,
    member: false,
    website_editor: false,
    branch_admin: true,
    church_hq_admin: true,
    platform_admin: true,
  }),
  "website.edit": Object.freeze({
    visitor: false,
    member: false,
    website_editor: true,
    branch_admin: true,
    church_hq_admin: true,
    platform_admin: true,
  }),
  "finance.transactions.view": Object.freeze({
    visitor: false,
    member: false,
    website_editor: false,
    branch_admin: false,
    church_hq_admin: false,
    platform_admin: false,
  }),
});

/**
 * Representative ActiveClinic permission matrix (role catalogue keys).
 */
const AC_PERMISSION_MATRIX = Object.freeze({
  "activeclinic.patient.view": Object.freeze({
    activeclinic_receptionist: true,
    activeclinic_clinician: true,
    activeclinic_cashier: false,
    activeclinic_website_editor: false,
    activeclinic_organization_admin: true,
  }),
  "activeclinic.billing.refund": Object.freeze({
    activeclinic_cashier: false,
    activeclinic_billing_officer: false,
    activeclinic_finance_supervisor: true,
    activeclinic_organization_admin: false,
  }),
  "website.publish": Object.freeze({
    activeclinic_website_editor: false,
    activeclinic_network_admin: false,
    activeclinic_organization_admin: true,
  }),
});

module.exports = {
  expectIsolationDenied,
  forgeTenantBody,
  assertMatrixCell,
  CROSS_PRODUCT_MATRIX,
  BB_PERMISSION_MATRIX,
  AC_PERMISSION_MATRIX,
};
