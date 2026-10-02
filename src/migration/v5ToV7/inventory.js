"use strict";

function shouldExcludeOrgKey(churchKey, runConfig) {
  const key = String(churchKey || "").trim().toLowerCase();
  if (!key) return true;
  if ((runConfig.excludeOrgKeys || []).includes(key)) return true;
  for (const re of runConfig.excludeOrgKeyPatterns || []) {
    if (re.test(key)) return true;
  }
  return false;
}

async function tableExists(pool, qualifiedName) {
  const [schema, table] = String(qualifiedName).split(".");
  const r = await pool.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = $1 AND table_name = $2`,
    [schema, table]
  );
  return r.rowCount > 0;
}

async function countTable(pool, qualifiedName, whereSql = "", params = []) {
  if (!(await tableExists(pool, qualifiedName))) return { exists: false, count: 0 };
  const r = await pool.query(`SELECT COUNT(*)::int AS n FROM ${qualifiedName} ${whereSql}`, params);
  return { exists: true, count: Number(r.rows[0].n) };
}

async function inventoryBlessBoard(pool, runConfig) {
  const churches = await pool.query(
    `SELECT church_key, status, data_environment
       FROM blessboard.churches
      ORDER BY church_key`
  );
  const included = churches.rows.filter((r) => !shouldExcludeOrgKey(r.church_key, runConfig));
  const excluded = churches.rows.length - included.length;

  const counts = {};
  const tables = [
    ["churches", "blessboard.churches"],
    ["branches", "blessboard.branches"],
    ["users", "blessboard.users"],
    ["user_role_assignments", "blessboard.user_role_assignments"],
    ["public_pages", "blessboard.public_pages"],
    ["page_sections", "blessboard.page_sections"],
    ["media_assets", "blessboard.media_assets"],
    ["organizations", "platform.organizations"],
    ["identities", "platform.identities"],
    ["identity_product_profiles", "platform.identity_product_profiles"],
    ["website_instances", "platform.website_instances"],
  ];
  for (const [key, table] of tables) {
    counts[key] = await countTable(pool, table);
  }

  const hashStats = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE password_hash ~ '^\\$2[aby]\\$')::int AS bcrypt_count,
       COUNT(*) FILTER (WHERE password_hash IS NULL OR password_hash !~ '^\\$2[aby]\\$')::int AS non_bcrypt_count
     FROM blessboard.users
     WHERE status = 'active'`
  );

  return {
    churches: { total: churches.rows.length, included: included.length, excluded },
    counts,
    passwordHashes: hashStats.rows[0] || { total: 0, bcrypt_count: 0, non_bcrypt_count: 0 },
    includedChurchKeys: included.map((r) => r.church_key),
  };
}

async function inventoryActiveClinic(pool, runConfig) {
  const exists = await tableExists(pool, "activeclinic.healthcare_organizations");
  if (!exists) {
    return { available: false, counts: {} };
  }
  const orgs = await pool.query(
    `SELECT o.organization_key, h.website_published
       FROM activeclinic.healthcare_organizations h
       JOIN platform.organizations o ON o.id = h.organization_id
      ORDER BY o.organization_key`
  );
  const included = orgs.rows.filter((r) => !shouldExcludeOrgKey(r.organization_key, runConfig));

  const tables = [
    ["healthcare_organizations", "activeclinic.healthcare_organizations"],
    ["facilities", "activeclinic.facilities"],
    ["staff_members", "activeclinic.staff_members"],
    ["patients", "activeclinic.patients"],
    ["appointments", "activeclinic.appointments"],
    ["appointment_service_types", "activeclinic.appointment_service_types"],
    ["website_instances", "platform.website_instances"],
    ["website_media", "platform.website_media"],
    ["identities", "platform.identities"],
  ];
  const counts = {};
  for (const [key, table] of tables) {
    counts[key] = await countTable(pool, table);
  }

  return {
    available: true,
    organizations: { total: orgs.rows.length, included: included.length },
    counts,
    scope: {
      MUST_MIGRATE: ["healthcare_organizations", "facilities", "staff_members", "website"],
      OPTIONAL_FOR_V1: ["appointment_service_types", "booking_configuration"],
      EXCLUDE: runConfig.excludeOrgKeys,
    },
  };
}

async function detectLocalMediaRoot() {
  const fs = require("fs");
  const path = require("path");
  const root = path.resolve(process.cwd(), "data/uploads/blessboard-v5-media");
  if (!fs.existsSync(root)) {
    return { present: false, objectCount: 0, path: root };
  }
  let count = 0;
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else count += 1;
    }
  };
  walk(root);
  return { present: true, objectCount: count, path: root };
}

module.exports = {
  shouldExcludeOrgKey,
  inventoryBlessBoard,
  inventoryActiveClinic,
  detectLocalMediaRoot,
  tableExists,
  countTable,
};
