"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Applies db/postgres/006_intake_deal_fields.sql at startup (idempotent DDL).
 * @param {import("pg").Pool} pool
 */
async function ensureIntakeDealSchema(pool) {
  const sqlPath = path.join(__dirname, "../../../db/postgres/006_intake_deal_fields.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  await pool.query(sql);
}

module.exports = { ensureIntakeDealSchema };
