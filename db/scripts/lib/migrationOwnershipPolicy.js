"use strict";

/**
 * Platform schema / migration ownership policy (PC06).
 *
 * Historical migration files are frozen — never rename/delete/reorder for cosmetics.
 * This module documents exceptions and guards future placements.
 */

const fs = require("fs");
const path = require("path");

const MIGRATIONS_ROOT = path.join(__dirname, "..", "..", "migrations");

/**
 * Frozen historical exceptions (relative to db/migrations/).
 * Do not add entries for organizational preference — only for already-applied history
 * or explicitly approved dual-write transition files.
 */
const HISTORICAL_EXCEPTIONS = Object.freeze([
  // ActiveClinic RBAC catalogue seeds historically shipped under the BlessBoard
  // migrator module because the shared catalogue tables live in blessboard.*.
  // Forward: new AC permission/role changes → db/migrations/activeclinic/.
  "blessboard/077_activeclinic_rbac_catalogue.sql",
  "blessboard/078_activeclinic_staff_lifecycle_permissions.sql",
  "blessboard/079_activeclinic_facility_admin_assign_access.sql",
  "blessboard/080_activeclinic_patient_permissions.sql",
  "blessboard/081_activeclinic_appointment_permissions.sql",
  "blessboard/082_activeclinic_reception_permissions.sql",
  "blessboard/083_activeclinic_clinical_permissions.sql",
  "blessboard/084_activeclinic_clinical_extra_permissions.sql",
  "blessboard/085_activeclinic_pharmacy_permissions.sql",
  "blessboard/086_activeclinic_diagnostics_permissions.sql",
  "blessboard/087_activeclinic_billing_permissions.sql",
  "blessboard/088_activeclinic_rbac_role_catalogue.sql",
  "blessboard/089_activeclinic_diagnostics_modality_split.sql",
  "blessboard/090_activeclinic_department_permissions.sql",
  "blessboard/091_activeclinic_patient_quick_register.sql",
  "blessboard/092_activeclinic_patient_registration_rbac_hardening.sql",
  "blessboard/115_activeclinic_patient_create_v202_alignment.sql",
  "blessboard/118_activeclinic_management_data_permissions.sql",

  // Website permission rows that also grant ActiveClinic roles — still BB module
  // because they primarily extend the shared website permission catalogue.
  "blessboard/093_website_engine_permissions.sql",
  "blessboard/095_website_org_admin_publish.sql",

  // AC.org public contact form table. Filename/table use "platform_" but the
  // object lives in activeclinic.* and is product-scoped. Not moved (applied).
  "activeclinic/035_platform_contact_inquiries.sql",
]);

const FUTURE_RULES = Object.freeze({
  moduleOrder: ["platform", "blessboard", "activeclinic", "getpro", "ngo"],
  summary: [
    "New platform-neutral schema → db/migrations/platform/ (prefer platform.* tables).",
    "New BlessBoard-only schema → db/migrations/blessboard/ (blessboard.*).",
    "New ActiveClinic-only schema → db/migrations/activeclinic/ (activeclinic.*).",
    "New ActiveClinic RBAC catalogue grants → db/migrations/activeclinic/ even when DML targets blessboard.permissions/roles.",
    "Do not use platform_ table/filename prefixes for product-owned objects.",
    "Cross-schema FKs to platform.identities / platform.organizations from product tables are allowed and expected.",
    "Platform migrations may include a product name in the filename when extending platform.* catalogues (application_code, identity profile types, etc.).",
    "Never rename, delete, or reorder already-applied migrations for organization alone.",
    "Never mutate production to relocate historical objects.",
  ],
});

/** Filename patterns that imply cross-product placement and need an allowlist entry. */
const CROSS_PRODUCT_FILENAME_RE = Object.freeze({
  // AC RBAC seeds historically lived under the BB migrator module.
  blessboard: /activeclinic/i,
  // Product tables must not use platform_ prefixes going forward.
  activeclinic: /(?:^|_)platform_/i,
  // Platform migrations may name a product when extending platform.*
  // catalogues/constraints (e.g. application_code, identity profile types).
  // Those are not ownership violations.
});

function listMigrationRelPaths() {
  const out = [];
  for (const mod of FUTURE_RULES.moduleOrder) {
    const dir = path.join(MIGRATIONS_ROOT, mod);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".sql") || name.includes(" 2.")) continue;
      out.push(`${mod}/${name}`);
    }
  }
  return out.sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

function classifyCrossProductFilename(relPath) {
  const [mod, filename] = relPath.split("/");
  const re = CROSS_PRODUCT_FILENAME_RE[mod];
  if (!re || !re.test(filename)) return null;
  return { module: mod, filename, reason: `filename suggests cross-product ownership (${mod}/${filename})` };
}

/**
 * Scan disk for cross-product filename placements not covered by the historical allowlist.
 * @returns {{ orphans: Array<object>, missingAllowlistEntries: string[] }}
 */
function auditMigrationOwnership() {
  const allow = new Set(HISTORICAL_EXCEPTIONS);
  const onDisk = listMigrationRelPaths();
  const orphans = [];
  for (const rel of onDisk) {
    const hit = classifyCrossProductFilename(rel);
    if (!hit) continue;
    if (allow.has(rel)) continue;
    orphans.push({ ...hit, path: rel });
  }
  const missingAllowlistEntries = HISTORICAL_EXCEPTIONS.filter((rel) => !onDisk.includes(rel));
  return { orphans, missingAllowlistEntries, onDiskCount: onDisk.length };
}

function describeHistoricalException(relPath) {
  if (relPath === "activeclinic/035_platform_contact_inquiries.sql") {
    return {
      path: relPath,
      class: "misnamed_product_table",
      justification:
        "Creates activeclinic.platform_contact_inquiries for ActiveClinic.org public contact. Applied; keep in place. Forward contact storage for platform-neutral use goes under platform migrations/schema.",
    };
  }
  if (relPath.startsWith("blessboard/") && /activeclinic/i.test(relPath)) {
    return {
      path: relPath,
      class: "ac_rbac_catalogue_under_bb_module",
      justification:
        "Seeds/updates ActiveClinic roles/permissions in blessboard.* catalogue tables. Historical BB-module placement; forward AC RBAC changes use activeclinic migrations.",
    };
  }
  if (relPath === "blessboard/093_website_engine_permissions.sql" || relPath === "blessboard/095_website_org_admin_publish.sql") {
    return {
      path: relPath,
      class: "shared_website_permissions_with_ac_grants",
      justification:
        "Primarily shared website permission catalogue under BB module; also grants selected ActiveClinic roles. Left in place as applied history.",
    };
  }
  return {
    path: relPath,
    class: "historical_exception",
    justification: "Documented frozen exception — do not relocate.",
  };
}

module.exports = {
  HISTORICAL_EXCEPTIONS,
  FUTURE_RULES,
  CROSS_PRODUCT_FILENAME_RE,
  MIGRATIONS_ROOT,
  listMigrationRelPaths,
  classifyCrossProductFilename,
  auditMigrationOwnership,
  describeHistoricalException,
};
