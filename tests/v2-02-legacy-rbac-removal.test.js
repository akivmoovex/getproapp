"use strict";

/**
 * Static guard: authorization decision surfaces must not use legacy RBAC.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

/** Core authorization decision modules (must be legacy-free). */
const AUTH_SURFACES = Object.freeze([
  "src/blessboard/repositories/blessBoardAuthorizationRepository.js",
  "src/blessboard/services/authorizeBlessBoardTenantAccess.js",
  "src/blessboard/services/blessBoardRbacAuthorizationService.js",
  "src/blessboard/services/blessBoardLastAdminGuard.js",
  "src/blessboard/services/establishBlessBoardSession.js",
  "src/blessboard/http/tenantLoginHelpers.js",
  "src/blessboard/http/requireBlessBoardPermission.js",
  "src/blessboard/http/requireBlessBoardTenantRole.js",
  "src/blessboard/http/loadBlessBoardAuthorizationContext.js",
  "src/platform/rbac/platformAdminAuthorization.js",
  "src/platform/rbac/sharedAuthzDecision.js",
  "src/platform/http/websiteGovernanceAccess.js",
  "src/activeclinic/services/activeClinicLoginEligibility.js",
]);

const FORBIDDEN_IN_AUTH_SURFACES = Object.freeze([
  /FROM\s+blessboard\.user_roles/i,
  /INSERT\s+INTO\s+blessboard\.user_roles/i,
  /require\(["'].*legacyCompatibilityPermissions["']\)/,
  /roleKey\s*===\s*["']platform_admin["']/,
  /roleKey\s*===\s*["']church_hq_admin["']/,
  /roleKey\s*===\s*["']branch_admin["']/,
]);

describe("V2.02 legacy RBAC removal — authorization surfaces", () => {
  it("core auth modules have zero legacy user_roles / role-name auth patterns", () => {
    const hits = [];
    for (const rel of AUTH_SURFACES) {
      const full = path.join(ROOT, rel);
      assert.ok(fs.existsSync(full), `missing ${rel}`);
      const text = fs.readFileSync(full, "utf8");
      for (const re of FORBIDDEN_IN_AUTH_SURFACES) {
        if (re.test(text)) {
          hits.push({ file: rel, pattern: String(re) });
        }
      }
    }
    assert.deepEqual(hits, [], JSON.stringify(hits, null, 2));
  });

  it("listActiveAuthorizationRoles reads catalogue assignments", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "src/blessboard/repositories/blessBoardAuthorizationRepository.js"),
      "utf8"
    );
    assert.match(src, /user_role_assignments/);
    assert.equal(/FROM\s+blessboard\.user_roles/i.test(src), false);
  });

  it("legacyCompatibilityPermissions is a no-op stub", () => {
    const {
      LEGACY_BUNDLES,
      mapLegacyRolesToPermissionGrants,
      permissionsForLegacyRoleKey,
    } = require("../src/blessboard/rbac/legacyCompatibilityPermissions");
    assert.deepEqual(Object.keys(LEGACY_BUNDLES), []);
    assert.deepEqual(mapLegacyRolesToPermissionGrants([{ roleKey: "platform_admin" }]), []);
    assert.deepEqual(permissionsForLegacyRoleKey("church_hq_admin"), []);
  });

  it("authorizeBlessBoardTenantAccess evaluates catalogue role keys only", () => {
    const {
      evaluateRoleGrants,
    } = require("../src/blessboard/services/authorizeBlessBoardTenantAccess");
    const org = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const church = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const branch = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const legacyOnly = evaluateRoleGrants(
      [
        {
          roleKey: "church_hq_admin",
          organizationId: org,
          churchId: church,
          branchId: null,
        },
      ],
      { organizationId: org, churchId: church, branchId: branch },
      { branchBelongsToChurch: true }
    );
    assert.equal(legacyOnly.length, 0);

    const catalogue = evaluateRoleGrants(
      [
        {
          roleKey: "organisation_administrator",
          organizationId: org,
          churchId: church,
          branchId: null,
        },
      ],
      { organizationId: org, churchId: church, branchId: branch },
      { branchBelongsToChurch: true }
    );
    assert.equal(catalogue.length, 1);
    assert.equal(catalogue[0].roleKey, "organisation_administrator");
  });
});
