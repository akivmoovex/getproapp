"use strict";

/**
 * Create a BlessBoard campus/branch with transactional entitlement limit enforcement.
 * Does not delete existing branches on plan downgrade — only blocks new creates over limit.
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
  CONFLICT: "conflict",
  LOOKUP_ERROR: "lookup_error",
});

const BRANCH_KEY_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function createBlessBoardBranch(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const branchKey = String((input && input.branchKey) || "")
    .trim()
    .toLowerCase();
  const displayName = String((input && input.displayName) || "").trim();
  if (!UUID_RE.test(churchId) || !UUID_RE.test(organizationId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, branch: null, reason: "scope" };
  }
  if (!BRANCH_KEY_RE.test(branchKey) || !displayName || displayName.length > 200) {
    return { ok: false, status: STATUS.INVALID_INPUT, branch: null, reason: "branch" };
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
    const gate = await evaluateBranchCreateLimit(client, {
      organizationId,
      productKey: input.productKey,
      at: input.at,
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
      `INSERT INTO blessboard.branches
         (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
       VALUES ($1, $2, $3, 'branch', 'active', false, COALESCE($4, 'UTC'), $5)
       RETURNING id, church_id, branch_key, display_name, branch_type, status, is_primary`,
      [
        churchId,
        branchKey,
        displayName,
        input.timezone || null,
        input.countryCode || null,
      ]
    );
    await client.query("COMMIT");
    return { ok: true, status: STATUS.OK, branch: rows[0] };
  } catch (err) {
    try {
      if (client) await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    const msg = err && err.message ? String(err.message) : "";
    if (/unique|duplicate/i.test(msg)) {
      return { ok: false, status: STATUS.CONFLICT, branch: null, reason: "duplicate" };
    }
    return { ok: false, status: STATUS.LOOKUP_ERROR, branch: null, reason: msg };
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

module.exports = {
  STATUS,
  createBlessBoardBranch,
};
