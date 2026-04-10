"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Applies db/postgres/004_content_pages_eula_kind.sql (eula kind in CHECK constraint).
 * @param {import("pg").Pool} pool
 */
async function ensureEulaKindSchema(pool) {
  const sqlPath = path.join(__dirname, "../../../db/postgres/004_content_pages_eula_kind.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  await pool.query(sql);
}

module.exports = { ensureEulaKindSchema };
