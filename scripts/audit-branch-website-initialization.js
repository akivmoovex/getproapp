#!/usr/bin/env node
"use strict";

/**
 * Read-only audit of branch website initialization state.
 * Does not print confidential page content, payment details, or credentials.
 *
 * Usage:
 *   node scripts/audit-branch-website-initialization.js
 *
 * Requires DATABASE_URL (or default pool env used by the app).
 */

const { Pool } = require("pg");

async function main() {
  const connectionString = process.env.DATABASE_URL || process.env.BLESSBOARD_DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is required");
    process.exit(2);
  }

  const pool = new Pool({ connectionString });
  try {
    const totalBranches = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM blessboard.branches b
         INNER JOIN blessboard.churches c ON c.id = b.church_id
         INNER JOIN platform.organizations o ON o.id = c.organization_id
        WHERE b.status = 'active'`
    );

    let initRows = { rows: [] };
    try {
      initRows = await pool.query(
        `SELECT
           COALESCE(g.website_initialization_status, 'not_started') AS status,
           COUNT(*)::int AS n
         FROM blessboard.branches b
         INNER JOIN blessboard.churches c ON c.id = b.church_id
         LEFT JOIN blessboard.branch_website_governance g ON g.branch_id = b.id
        WHERE b.status = 'active'
        GROUP BY 1
        ORDER BY 1`
      );
    } catch (err) {
      console.error(
        "Governance/init columns unavailable:",
        err && err.code ? err.code : err.message
      );
      process.exit(1);
    }

    const partial = await pool.query(
      `SELECT COUNT(DISTINCT b.id)::int AS n
         FROM blessboard.branches b
         LEFT JOIN blessboard.branch_website_governance g ON g.branch_id = b.id
         LEFT JOIN blessboard.public_pages p
           ON p.church_id = b.church_id
          AND p.branch_id = b.id
          AND p.status = 'published'
        WHERE b.status = 'active'
          AND COALESCE(g.website_initialization_status, 'not_started') <> 'completed'
          AND p.id IS NOT NULL`
    );

    const liveFallback = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM blessboard.branches b
         LEFT JOIN blessboard.branch_website_governance g ON g.branch_id = b.id
        WHERE b.status = 'active'
          AND COALESCE(g.website_initialization_status, 'not_started') <> 'completed'
          AND NOT EXISTS (
            SELECT 1 FROM blessboard.public_pages p
             WHERE p.church_id = b.church_id
               AND p.branch_id = b.id
               AND p.status = 'published'
          )`
    );

    const byStatus = {};
    for (const row of initRows.rows) {
      byStatus[row.status] = row.n;
    }

    const report = {
      total_active_branches: totalBranches.rows[0].n,
      initialized_websites: byStatus.completed || 0,
      uninitialized_websites:
        (byStatus.not_started || 0) + (byStatus.initializing || 0),
      failed_initializations: byStatus.failed || 0,
      partially_edited_websites: partial.rows[0].n,
      using_live_hq_fallback: liveFallback.rows[0].n,
      by_status: byStatus,
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
