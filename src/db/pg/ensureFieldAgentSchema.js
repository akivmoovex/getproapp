"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Applies db/postgres/002_field_agent.sql once at startup (idempotent DDL).
 * Production failures often come from applying only 000_full_schema.sql — field agent tables never created.
 * @param {import("pg").Pool} pool
 */
async function ensureFieldAgentSchema(pool) {
  const base = path.join(__dirname, "../../../db/postgres");
  const files = [
    "002_field_agent.sql",
    "014_field_agent_submission_statuses.sql",
    "043_field_agent_submission_info_feedback.sql",
    "044_field_agent_submission_website_listing_draft.sql",
    "046_field_agent_website_specialities_hours.sql",
    "047_field_agent_speciality_verification.sql",
  ];
  for (const f of files) {
    const sql = fs.readFileSync(path.join(base, f), "utf8");
    await pool.query(sql);
  }
}

module.exports = { ensureFieldAgentSchema };
