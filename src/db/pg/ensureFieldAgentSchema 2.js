"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Applies db/postgres/002_field_agent.sql once at startup (idempotent DDL).
 * Production failures often come from applying only 000_full_schema.sql — field agent tables never created.
 * @param {import("pg").Pool} pool
 */
async function ensureFieldAgentSchema(pool) {
  const sqlPath = path.join(__dirname, "../../../db/postgres/002_field_agent.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  await pool.query(sql);
}

module.exports = { ensureFieldAgentSchema };
