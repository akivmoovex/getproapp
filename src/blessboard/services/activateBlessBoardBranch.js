"use strict";

/**
 * Activate (or reactivate) a BlessBoard branch with transactional max_branches enforcement.
 * Idempotent when the branch is already active. Never deletes siblings on plan limits.
 */

const {
  evaluateBranchCreateLimit,
  STATUS: ENTITLEMENT_STATUS,
} = require("../../platform/services/entitlementService");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  LIMIT_EXCEEDED: "limit_exceeded",
  SUBSCRIPTION_INACTIVE: "subscription_inactive",
  LOOKUP_ERROR: "lookup_error",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function activateBlessBoardBranch(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  if (!UUID_RE.test(churchId) || !UUID_RE.test(organizationId) || !UUID_RE.test(branchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, branch: null, reason: "scope" };
  }

  let client = null;
  let owned = false;
  try {
    if (db && typeof db.connect === "function" && typeof db.release !== "function") {
      client = await db.connect();
      owned = true;
    } else {
      client = db;
    }
    await client.query("BEGIN");
    const church = await client.query(
      `SELECT id, organization_id, status FROM blessboard.churches WHERE id = $1 FOR UPDATE`,
      [churchId]
    );
    if (!church.rows[0] || String(church.rows[0].organization_id) !== organizationId) {
      await client.query("ROLLBACK");
      return { ok: false, status: STATUS.NOT_FOUND, branch: null, reason: "church" };
    }
    const branchRes = await client.query(
      `SELECT id, church_id, branch_key, display_name, branch_type, status, is_primary
         FROM blessboard.branches
        WHERE id = $1 AND church_id = $2
        FOR UPDATE`,
      [branchId, churchId]
    );
    const branch = branchRes.rows[0];
    if (!branch) {
      await client.query("ROLLBACK");
      return { ok: false, status: STATUS.NOT_FOUND, branch: null, reason: "branch" };
    }
    if (String(branch.status) === "active") {
      await client.query("COMMIT");
      return { ok: true, status: STATUS.OK, branch, alreadyActive: true };
    }

    const gate = await evaluateBranchCreateLimit(client, {
      organizationId,
      productKey: input.productKey,
      at: input.at,
      excludeBranchId: branchId,
    });
    if (!gate.ok) {
      await client.query("ROLLBACK");
      const mapped =
        gate.status === ENTITLEMENT_STATUS.LIMIT_EXCEEDED
          ? STATUS.LIMIT_EXCEEDED
          : gate.status === ENTITLEMENT_STATUS.SUBSCRIPTION_INACTIVE
            ? STATUS.SUBSCRIPTION_INACTIVE
            : STATUS.FORBIDDEN;
      return {
        ok: false,
        status: mapped,
        branch: null,
        reason: gate.reason,
        current: gate.current,
        limit: gate.limit,
      };
    }

    const { rows } = await client.query(
      `UPDATE blessboard.branches
          SET status = 'active', updated_at = now()
        WHERE id = $1 AND church_id = $2
        RETURNING id, church_id, branch_key, display_name, branch_type, status, is_primary`,
      [branchId, churchId]
    );
    await client.query("COMMIT");
    return { ok: true, status: STATUS.OK, branch: rows[0], alreadyActive: false };
  } catch (err) {
    try {
      if (client) await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      branch: null,
      reason: err && err.message ? String(err.message) : "error",
    };
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

module.exports = {
  STATUS,
  activateBlessBoardBranch,
};
