"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Applies companies DDL at startup (idempotent).
 * @param {import("pg").Pool} pool
 */
async function ensureCompaniesDirectoryFlagsSchema(pool) {
  const base = path.join(__dirname, "../../../db/postgres");
  for (const f of [
    "011_companies_directory_flags.sql",
    "015_companies_field_agent_linkage.sql",
    "045_companies_listing_disabled.sql",
    "048_companies_established_year.sql",
  ]) {
    const sql = fs.readFileSync(path.join(base, f), "utf8");
    await pool.query(sql);
  }
}

module.exports = { ensureCompaniesDirectoryFlagsSchema };
