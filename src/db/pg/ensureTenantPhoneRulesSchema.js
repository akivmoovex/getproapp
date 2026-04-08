"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Applies db/postgres/003_tenant_phone_rules.sql at startup (idempotent DDL + zm/demo seeds).
 * Production DBs created before this migration lack phone_* columns on public.tenants — Join Us and
 * phoneRulesService would error on SELECT. See ensureFieldAgentSchema / ensureContentLocaleSchema.
 * @param {import("pg").Pool} pool
 */
async function ensureTenantPhoneRulesSchema(pool) {
  const sqlPath = path.join(__dirname, "../../../db/postgres/003_tenant_phone_rules.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  await pool.query(sql);
}

module.exports = { ensureTenantPhoneRulesSchema };
