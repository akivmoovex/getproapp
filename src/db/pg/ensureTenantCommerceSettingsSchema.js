"use strict";

const fs = require("fs");
const path = require("path");

/**
 * @param {import("pg").Pool} pool
 */
async function ensureTenantCommerceSettingsSchema(pool) {
  const base = path.join(__dirname, "../../../db/postgres");
  const files = [
    "010_tenant_commerce_settings.sql",
    "013_tenant_commerce_currency_display.sql",
    "016_tenant_commerce_field_agent_sp_commission.sql",
    "017_tenant_commerce_field_agent_ec_commission.sql",
    "018_tenant_commerce_field_agent_sp_high_rating_bonus.sql",
    "019_tenant_commerce_field_agent_sp_rating_thresholds.sql",
  ];
  for (const f of files) {
    const sql = fs.readFileSync(path.join(base, f), "utf8");
    await pool.query(sql);
  }
}

module.exports = { ensureTenantCommerceSettingsSchema };
