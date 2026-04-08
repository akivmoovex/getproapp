"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Applies db/postgres/003_content_pages_locale.sql (locale column + unique index).
 * @param {import("pg").Pool} pool
 */
async function ensureContentLocaleSchema(pool) {
  const sqlPath = path.join(__dirname, "../../../db/postgres/003_content_pages_locale.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  await pool.query(sql);
}

module.exports = { ensureContentLocaleSchema };
