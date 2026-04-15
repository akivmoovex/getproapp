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
  await pool.query(fs.readFileSync(path.join(base, "030_field_agent_pay_run_payments_metadata.sql"), "utf8"));
  await pool.query(fs.readFileSync(path.join(base, "031_field_agent_pay_run_payments_unique_linkage.sql"), "utf8"));
  await pool.query(fs.readFileSync(path.join(base, "032_field_agent_pay_run_payments_ledger_checks.sql"), "utf8"));
  await pool.query(fs.readFileSync(path.join(base, "033_field_agent_pay_run_status_history.sql"), "utf8"));
  await pool.query(fs.readFileSync(path.join(base, "035_field_agent_pay_runs_soft_close.sql"), "utf8"));
  await pool.query(fs.readFileSync(path.join(base, "036_accounting_periods.sql"), "utf8"));
  await pool.query(fs.readFileSync(path.join(base, "037_finance_override_events.sql"), "utf8"));
  await pool.query(fs.readFileSync(path.join(base, "038_field_agent_pay_runs_payout_approval.sql"), "utf8"));
  await pool.query(fs.readFileSync(path.join(base, "039_field_agent_payout_batches.sql"), "utf8"));
  await pool.query(fs.readFileSync(path.join(base, "040_field_agent_payout_completion.sql"), "utf8"));
  await pool.query(fs.readFileSync(path.join(base, "041_field_agent_bank_reconciliation_flags.sql"), "utf8"));
  await pool.query(fs.readFileSync(path.join(base, "042_field_agent_payout_finance_audit.sql"), "utf8"));
}

module.exports = { ensureFieldAgentPayRunsSchema };
