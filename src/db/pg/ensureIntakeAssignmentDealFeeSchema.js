"use strict";

const fs = require("fs");
const path = require("path");

/**
 * @param {import("pg").Pool} pool
 */
async function ensureIntakeAssignmentDealFeeSchema(pool) {
  const sqlPath = path.join(__dirname, "../../../db/postgres/008_intake_assignment_deal_fee.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  await pool.query(sql);
}

module.exports = { ensureIntakeAssignmentDealFeeSchema };
