"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Applies db/postgres/011_companies_directory_flags.sql at startup (idempotent DDL).
 * @param {import("pg").Pool} pool
 */
async function ensureCompaniesDirectoryFlagsSchema(pool) {
  const sqlPath = path.join(__dirname, "../../../db/postgres/011_companies_directory_flags.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  await pool.query(sql);
}

module.exports = { ensureCompaniesDirectoryFlagsSchema };
