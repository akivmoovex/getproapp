"use strict";

const fs = require("fs");
const path = require("path");

/**
 * @param {import("pg").Pool} pool
 */
async function ensureFieldAgentPayRunsSchema(pool) {
  const base = path.join(__dirname, "../../../db/postgres");
  await pool.query(fs.readFileSync(path.join(base, "020_field_agent_pay_runs.sql"), "utf8"));
  await pool.query(fs.readFileSync(path.join(base, "021_field_agent_pay_runs_lock_approve.sql"), "utf8"));
  await pool.query(fs.readFileSync(path.join(base, "022_field_agent_pay_runs_paid_export.sql"), "utf8"));
  await pool.query(fs.readFileSync(path.join(base, "023_field_agent_pay_run_disputes.sql"), "utf8"));
  await pool.query(fs.readFileSync(path.join(base, "024_field_agent_pay_run_adjustments.sql"), "utf8"));
  await pool.query(fs.readFileSync(path.join(base, "025_field_agent_pay_run_items_carry_forward.sql"), "utf8"));
  await pool.query(fs.readFileSync(path.join(base, "029_field_agent_pay_run_payments.sql"), "utf8"));
}

module.exports = { ensureFieldAgentPayRunsSchema };
