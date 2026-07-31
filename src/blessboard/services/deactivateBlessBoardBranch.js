"use strict";

/**
 * Deactivate a BlessBoard branch (status → inactive).
 *
 * Safety for website-mode transitions (multi_site → single_site):
 * - Does not delete branch-scoped CMS, drafts, submissions, versions, governance, or audit.
 * - Does not merge branch content into church-wide HQ content.
 * - Does not rewrite public pages; single-site routing redirects handle discovery.
 */

const {
  detectWebsiteModeTransition,
} = require("./websiteModeTransition");
const { recordBlessBoardAudit } = require("./recordBlessBoardAudit");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  LOOKUP_ERROR: "lookup_error",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @param {{ query: Function, connect?: Function }} db
 * @param {{
 *   churchId: string,
 *   organizationId: string,
 *   branchId: string,
 *   actorUserId?: string|null,
 * }} input
 */
async function deactivateBlessBoardBranch(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const actorUserId =
    input && input.actorUserId != null && String(input.actorUserId).trim()
      ? String(input.actorUserId).trim()
      : null;

  if (!UUID_RE.test(churchId) || !UUID_RE.test(organizationId) || !UUID_RE.test(branchId)) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      branch: null,
      websiteModeTransition: null,
      reason: "scope",
    };
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
      return {
        ok: false,
        status: STATUS.NOT_FOUND,
        branch: null,
        websiteModeTransition: null,
        reason: "church",
      };
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
      return {
        ok: false,
        status: STATUS.NOT_FOUND,
        branch: null,
        websiteModeTransition: null,
        reason: "branch",
      };
    }

    const countRes = await client.query(
      `SELECT COUNT(*)::int AS n
         FROM blessboard.branches
        WHERE church_id = $1 AND status = 'active'`,
      [churchId]
    );
    const previousActiveCount = Number(countRes.rows[0].n || 0);

    if (String(branch.status) !== "active") {
      await client.query("COMMIT");
      const transition = detectWebsiteModeTransition({
        previousActiveCount,
        nextActiveCount: previousActiveCount,
      });
      return {
        ok: true,
        status: STATUS.OK,
        branch,
        alreadyInactive: true,
        previousActiveCount,
        nextActiveCount: previousActiveCount,
        websiteModeTransition: transition,
        contentPreserved: true,
      };
    }

    // Product safety: keep at least the HQ/primary campus active for church continuity.
    if (Boolean(branch.is_primary) || String(branch.branch_type) === "hq") {
      await client.query("ROLLBACK");
      return {
        ok: false,
        status: STATUS.FORBIDDEN,
        branch: null,
        websiteModeTransition: null,
        reason: "primary_or_hq",
        message: "The HQ / primary branch cannot be deactivated.",
      };
    }

    const { rows } = await client.query(
      `UPDATE blessboard.branches
          SET status = 'inactive', updated_at = now()
        WHERE id = $1 AND church_id = $2
        RETURNING id, church_id, branch_key, display_name, branch_type, status, is_primary`,
      [branchId, churchId]
    );
    const nextActiveCount = Math.max(0, previousActiveCount - 1);
    const transition = detectWebsiteModeTransition({
      previousActiveCount,
      nextActiveCount,
    });

    try {
      await recordBlessBoardAudit(client, {
        churchId,
        organizationId,
        branchId,
        actorUserId,
        actionKey: "branch.deactivated",
        entityType: "branch",
        entityId: branchId,
        outcome: "success",
        metadata: {
          branch_key: branch.branch_key,
          previous_active_count: previousActiveCount,
          next_active_count: nextActiveCount,
          website_mode_transition: transition.kind,
          content_preserved: true,
        },
      });
    } catch {
      /* never block deactivate on audit */
    }

    await client.query("COMMIT");
    return {
      ok: true,
      status: STATUS.OK,
      branch: rows[0],
      alreadyInactive: false,
      previousActiveCount,
      nextActiveCount,
      websiteModeTransition: transition,
      contentPreserved: true,
    };
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
      websiteModeTransition: null,
      reason: err && err.message ? String(err.message) : "error",
    };
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

module.exports = {
  STATUS,
  deactivateBlessBoardBranch,
};
