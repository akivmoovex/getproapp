"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Applies db/postgres/007_crm_csr_fifo.sql at startup (idempotent DDL).
 * @param {import("pg").Pool} pool
 */
async function ensureCrmCsrFifoSchema(pool) {
  const sqlPath = path.join(__dirname, "../../../db/postgres/007_crm_csr_fifo.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  await pool.query(sql);
}

module.exports = { ensureCrmCsrFifoSchema };
