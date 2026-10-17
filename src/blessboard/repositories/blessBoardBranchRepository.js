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
    `SELECT id, branch_key, display_name, branch_type, is_primary, status
       FROM blessboard.branches
      WHERE church_id = $1
        AND status IN ('active', 'inactive')
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

/**
 * Active branch by UUID scoped to a church (website scope resolution).
 * @param {{ query: Function }} client
 * @param {string} branchId
 * @param {string} churchId
 */
async function findActiveBranchByIdForChurch(client, branchId, churchId) {
  const r = await client.query(
    `SELECT id, church_id, branch_key, display_name, branch_type, is_primary, status
       FROM blessboard.branches
      WHERE id = $1
        AND church_id = $2
        AND status = 'active'
      LIMIT 1`,
    [branchId, churchId]
  );
  return r.rows[0] || null;
}

/**
 * Read the explicit branch service-times policy, scoped to the owning church
 * and (when supplied) organization.
 */
async function getBranchServiceTimesMode(client, branchId, churchId, organizationId) {
  const r = await client.query(
    `SELECT b.service_times_mode
       FROM blessboard.branches b
       JOIN blessboard.churches c ON c.id = b.church_id
      WHERE b.id = $1
        AND b.church_id = $2
        AND ($3::uuid IS NULL OR c.organization_id = $3::uuid)
      LIMIT 1`,
    [branchId, churchId, organizationId || null]
  );
  return r.rows[0] ? r.rows[0].service_times_mode || "inherit" : null;
}

/**
 * Set the explicit branch service-times policy, preserving tenant scope.
 */
async function setBranchServiceTimesMode(client, input) {
  const branchId = String(input && input.branchId || "").trim();
  const churchId = String(input && input.churchId || "").trim();
  const organizationId = input && input.organizationId ? String(input.organizationId).trim() : null;
  const mode = String(input && input.mode || "").trim().toLowerCase();
  const r = await client.query(
    `UPDATE blessboard.branches b
        SET service_times_mode = $1,
            updated_at = now()
       FROM blessboard.churches c
      WHERE b.id = $2
        AND b.church_id = c.id
        AND b.church_id = $3
        AND ($4::uuid IS NULL OR c.organization_id = $4::uuid)
      RETURNING b.service_times_mode`,
    [mode, branchId, churchId, organizationId]
  );
  return r.rows[0] || null;
}

module.exports = {
  listActiveBranchesByChurchId,
  findBranchByChurchIdAndKey,
  findActiveBranchByIdForChurch,
  getBranchServiceTimesMode,
  setBranchServiceTimesMode,
};
