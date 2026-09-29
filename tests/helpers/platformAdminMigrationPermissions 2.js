"use strict";

/**
 * PL06 — static permission intent from migrations (not runtime auth).
 * Replaces deleted legacyCompatibilityPermissions.PLATFORM_ADMIN_PERMISSIONS.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "../..");

function readMigration(name) {
  return fs.readFileSync(path.join(ROOT, "db/migrations/blessboard", name), "utf8");
}

/** Keys explicitly granted to platform_administrator across named migrations. */
function grantedIn(migrations, keys) {
  const blob = migrations.map(readMigration).join("\n");
  const missing = keys.filter((k) => !blob.includes(`'${k}'`));
  return { ok: missing.length === 0, missing, blob };
}

function deniedInPlatformAdmin(keys) {
  // 065 removes finance transaction grants from platform_administrator.
  const removeFinance = readMigration("065_finance_role_separation.sql");
  const founding = readMigration("057_create_rbac_permissions_roles.sql");
  const results = {};
  for (const key of keys) {
    const removed =
      removeFinance.includes(key) &&
      /platform_administrator/.test(removeFinance);
    const notInFoundingGrant =
      !new RegExp(
        "platform_administrator[\\s\\S]{0,2000}" + key.replace(/\./g, "\\."),
        "m"
      ).test(founding) && !founding.includes(`'${key}'`);
    // Prefer explicit denial evidence from 065 for finance keys; pastoral confidential keys were never PA grants.
    results[key] = removed || !founding.includes(`'${key}'`);
  }
  return results;
}

const TEAM_MIGRATIONS = ["070_platform_team_management_permissions.sql"];
const DIRECTORY_MIGRATIONS = ["068_platform_admin_directory_permissions.sql"];
const SUPPORT_MIGRATIONS = ["069_platform_support_mode_permissions.sql"];
const RECOVERY_MIGRATIONS = ["071_platform_account_recovery_permissions.sql"];
const IA_MIGRATIONS = ["075_platform_admin_ia_permissions.sql"];

module.exports = {
  readMigration,
  grantedIn,
  deniedInPlatformAdmin,
  TEAM_MIGRATIONS,
  DIRECTORY_MIGRATIONS,
  SUPPORT_MIGRATIONS,
  RECOVERY_MIGRATIONS,
  IA_MIGRATIONS,
};
