"use strict";

/**
 * Read-only BlessBoard branch queries for HQ shell (UUID church scope).
 */

/**
 * Active branches for a church UUID — one efficient list query.
 * @param {{ query: Function }} client
 * @param {string} churchId
 */
async function listActiveBranchesByChurchId(client, churchId) {
  const r = await client.query(
    `SELECT branch_key, display_name, branch_type, is_primary, status
       FROM blessboard.branches
      WHERE church_id = $1
        AND status = 'active'
      ORDER BY
        CASE WHEN branch_type = 'hq' THEN 0 ELSE 1 END,
        CASE WHEN is_primary THEN 0 ELSE 1 END,
        display_name ASC`,
    [churchId]
  );
  return r.rows;
}

/**
 * Lookup by church UUID + normalized branch key (may be inactive).
 * @param {{ query: Function }} client
 * @param {string} churchId
 * @param {string} branchKey
 */
async function findBranchByChurchIdAndKey(client, churchId, branchKey) {
  const r = await client.query(
    `SELECT id, church_id, branch_key, display_name, branch_type, is_primary, status
       FROM blessboard.branches
      WHERE church_id = $1
        AND branch_key = $2
      LIMIT 1`,
    [churchId, branchKey]
  );
  return r.rows[0] || null;
}

module.exports = {
  listActiveBranchesByChurchId,
  findBranchByChurchIdAndKey,
};
