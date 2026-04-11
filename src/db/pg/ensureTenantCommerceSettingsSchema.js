"use strict";

const fs = require("fs");
const path = require("path");

/**
 * @param {import("pg").Pool} pool
 */
async function ensureTenantCommerceSettingsSchema(pool) {
  const sqlPath = path.join(__dirname, "../../../db/postgres/010_tenant_commerce_settings.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  await pool.query(sql);
}

module.exports = { ensureTenantCommerceSettingsSchema };
