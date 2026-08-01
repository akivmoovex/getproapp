"use strict";

/**
 * Controlled blessboard.branches.branch_key rename for testing tenants only.
 * Temporarily disables the immutability trigger after identity + uniqueness checks.
 */

const { checkDatabaseIdentity } = require("../../../db/scripts/lib/databaseIdentity");
const { normalizeBranchKey } = require("./branchKey");
const { recordBlessBoardAudit } = require("./recordBlessBoardAudit");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  CONFLICT: "conflict",
  REFUSED_ENVIRONMENT: "refused_environment",
  LOOKUP_ERROR: "lookup_error",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EXPECTED_IDENTITY_KEY = "blessboard-platform-v5";

async function withClient(db, fn) {
  let client = null;
  let owned = false;
  try {
    if (db && typeof db.connect === "function" && typeof db.release !== "function") {
      client = await db.connect();
      owned = true;
    } else {
      client = db;
    }
    return await fn(client);
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

/**
 * @param {{ query: Function, connect?: Function }} db
 * @param {{
 *   organizationId: string,
 *   churchId: string,
 *   branchId: string,
 *   fromKey: string,
 *   toKey: string,
 *   displayName?: string|null,
 *   actorUserId?: string|null,
 *   expectedIdentityKey?: string,
 * }} input
 */
async function renameBlessBoardBranchKey(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const fromKey = String((input && input.fromKey) || "")
    .trim()
    .toLowerCase();
  const toNorm = normalizeBranchKey(input && input.toKey);
  const displayName =
    input && input.displayName != null && String(input.displayName).trim()
      ? String(input.displayName).trim().slice(0, 200)
      : null;
  const actorUserId =
    input && input.actorUserId != null && String(input.actorUserId).trim()
      ? String(input.actorUserId).trim()
      : null;
  const expectedIdentityKey = String(
    (input && input.expectedIdentityKey) || EXPECTED_IDENTITY_KEY
  ).trim();

  if (!UUID_RE.test(organizationId) || !UUID_RE.test(churchId) || !UUID_RE.test(branchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "scope" };
  }
  if (!fromKey) return { ok: false, status: STATUS.INVALID_INPUT, reason: "from_key" };
  if (!toNorm.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: toNorm.reason || "to_key" };
  }
  const toKey = toNorm.key;
  if (fromKey === toKey) {
    return { ok: true, status: STATUS.OK, alreadyRenamed: true, branchKey: toKey, branchId };
  }

  try {
    return await withClient(db, async (client) => {
      const identity = await checkDatabaseIdentity(client, {
        identityKey: expectedIdentityKey,
      });
      if (!identity.ok || !identity.row) {
        return {
          ok: false,
          status: STATUS.REFUSED_ENVIRONMENT,
          reason: identity.code || "identity_check_failed",
        };
      }
      if (String(identity.row.environment_code || "").toLowerCase() !== "testing") {
        return {
          ok: false,
          status: STATUS.REFUSED_ENVIRONMENT,
          reason: "environment_not_testing",
        };
      }

      await client.query("BEGIN");
      try {
        const orgRes = await client.query(
          `SELECT id, data_environment FROM platform.organizations WHERE id = $1 FOR UPDATE`,
          [organizationId]
        );
        const org = orgRes.rows[0];
        if (!org) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, reason: "organization" };
        }
        if (String(org.data_environment || "").toLowerCase() !== "testing") {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.REFUSED_ENVIRONMENT,
            reason: "organization_not_testing",
          };
        }

        const branchRes = await client.query(
          `SELECT b.id, b.church_id, b.branch_key, b.display_name, b.branch_type, b.status, b.is_primary
             FROM blessboard.branches b
             INNER JOIN blessboard.churches c ON c.id = b.church_id
            WHERE b.id = $1 AND b.church_id = $2 AND c.organization_id = $3
            FOR UPDATE OF b`,
          [branchId, churchId, organizationId]
        );
        const branch = branchRes.rows[0];
        if (!branch) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, reason: "branch" };
        }
        if (String(branch.branch_key) !== fromKey) {
          if (String(branch.branch_key) === toKey) {
            await client.query("ROLLBACK");
            return {
              ok: true,
              status: STATUS.OK,
              alreadyRenamed: true,
              branchId,
              branchKey: toKey,
            };
          }
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.CONFLICT,
            reason: "from_key_mismatch",
            currentKey: branch.branch_key,
          };
        }

        const taken = await client.query(
          `SELECT id FROM blessboard.branches
            WHERE church_id = $1 AND branch_key = $2 AND id <> $3
            LIMIT 1`,
          [churchId, toKey, branchId]
        );
        if (taken.rows[0]) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.CONFLICT,
            reason: "branch_key_taken",
            conflictingBranchId: taken.rows[0].id,
          };
        }

        await client.query(
          `ALTER TABLE blessboard.branches DISABLE TRIGGER branches_branch_key_immutable`
        );

        const nextDisplay = displayName || branch.display_name;
        const { rows } = await client.query(
          `UPDATE blessboard.branches
              SET branch_key = $2,
                  display_name = $3,
                  updated_at = now()
            WHERE id = $1 AND church_id = $4
            RETURNING id, church_id, branch_key, display_name, branch_type, status, is_primary`,
          [branchId, toKey, nextDisplay, churchId]
        );

        await client.query(
          `ALTER TABLE blessboard.branches ENABLE TRIGGER branches_branch_key_immutable`
        );

        try {
          await recordBlessBoardAudit(client, {
            churchId,
            organizationId,
            branchId,
            actorUserId,
            actionKey: "branch.key_renamed",
            entityType: "branch",
            entityId: branchId,
            outcome: "success",
            metadata: {
              from_key: fromKey,
              to_key: toKey,
              display_name: nextDisplay,
              testing_only: true,
            },
          });
        } catch {
          /* never block rename on audit */
        }

        await client.query("COMMIT");
        return {
          ok: true,
          status: STATUS.OK,
          alreadyRenamed: false,
          branchId,
          branchKey: toKey,
          previousBranchKey: fromKey,
          branch: rows[0],
        };
      } catch (err) {
        try {
          await client.query(
            `ALTER TABLE blessboard.branches ENABLE TRIGGER branches_branch_key_immutable`
          );
        } catch {
          /* ignore */
        }
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      }
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message).slice(0, 200) : "error",
    };
  }
}

module.exports = {
  STATUS,
  EXPECTED_IDENTITY_KEY,
  renameBlessBoardBranchKey,
};
