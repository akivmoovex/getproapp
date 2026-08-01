"use strict";

/**
 * Controlled organization_key / church_key rename for testing tenants only.
 *
 * Keys are normally immutable via DB triggers. This service temporarily disables
 * those triggers inside a single transaction after verifying:
 * - platform.database_identity.environment_code === testing
 * - organization.data_environment === testing
 * - new key is unused
 *
 * Never use against production identity databases.
 */

const { checkDatabaseIdentity } = require("../../../db/scripts/lib/databaseIdentity");
const { normalizeOrganizationKey } = require("./organizationKey");
const { recordBlessBoardAudit } = require("./recordBlessBoardAudit");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  CONFLICT: "conflict",
  FORBIDDEN: "forbidden",
  REFUSED_ENVIRONMENT: "refused_environment",
  LOOKUP_ERROR: "lookup_error",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EXPECTED_IDENTITY_KEY = "blessboard-platform-v5";

/**
 * @param {{ query: Function, connect?: Function }} db
 * @param {Function} fn
 */
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
 *   fromKey: string,
 *   toKey: string,
 *   displayName?: string,
 *   hostname?: string|null,
 *   actorUserId?: string|null,
 *   expectedIdentityKey?: string,
 * }} input
 */
async function renameBlessBoardOrganizationKey(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const fromKeyRaw = String((input && input.fromKey) || "")
    .trim()
    .toLowerCase();
  const toKeyNorm = normalizeOrganizationKey(input && input.toKey);
  const displayName =
    input && input.displayName != null && String(input.displayName).trim()
      ? String(input.displayName).trim().slice(0, 200)
      : null;
  const hostname =
    input && input.hostname != null && String(input.hostname).trim()
      ? String(input.hostname).trim().toLowerCase().slice(0, 253)
      : null;
  const actorUserId =
    input && input.actorUserId != null && String(input.actorUserId).trim()
      ? String(input.actorUserId).trim()
      : null;
  const expectedIdentityKey = String(
    (input && input.expectedIdentityKey) || EXPECTED_IDENTITY_KEY
  ).trim();

  if (!UUID_RE.test(organizationId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "organization_id" };
  }
  if (!fromKeyRaw) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "from_key" };
  }
  if (!toKeyNorm.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: toKeyNorm.reason || "to_key" };
  }
  const toKey = toKeyNorm.key;
  if (fromKeyRaw === toKey) {
    return { ok: true, status: STATUS.OK, alreadyRenamed: true, organizationKey: toKey };
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
          message: identity.message || "Database identity check failed.",
        };
      }
      if (String(identity.row.environment_code || "").toLowerCase() !== "testing") {
        return {
          ok: false,
          status: STATUS.REFUSED_ENVIRONMENT,
          reason: "environment_not_testing",
          message: "Organization key rename is allowed only on testing identity databases.",
        };
      }

      await client.query("BEGIN");
      try {
        const orgRes = await client.query(
          `SELECT id, organization_key, display_name, status, data_environment
             FROM platform.organizations
            WHERE id = $1
            FOR UPDATE`,
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
        if (String(org.organization_key) !== fromKeyRaw) {
          if (String(org.organization_key) === toKey) {
            await client.query("ROLLBACK");
            return {
              ok: true,
              status: STATUS.OK,
              alreadyRenamed: true,
              organizationId,
              organizationKey: toKey,
            };
          }
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.CONFLICT,
            reason: "from_key_mismatch",
            currentKey: org.organization_key,
          };
        }

        const taken = await client.query(
          `SELECT id, organization_key FROM platform.organizations
            WHERE organization_key = $1 AND id <> $2 LIMIT 1`,
          [toKey, organizationId]
        );
        if (taken.rows[0]) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.CONFLICT,
            reason: "organization_key_taken",
            conflictingOrganizationId: taken.rows[0].id,
          };
        }

        const churchTaken = await client.query(
          `SELECT id FROM blessboard.churches WHERE church_key = $1 AND organization_id <> $2 LIMIT 1`,
          [toKey, organizationId]
        );
        if (churchTaken.rows[0]) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.CONFLICT,
            reason: "church_key_taken",
            conflictingChurchId: churchTaken.rows[0].id,
          };
        }

        if (hostname) {
          const hostTaken = await client.query(
            `SELECT id, organization_id FROM platform.domains
              WHERE lower(hostname) = $1 AND organization_id <> $2 LIMIT 1`,
            [hostname, organizationId]
          );
          if (hostTaken.rows[0]) {
            await client.query("ROLLBACK");
            return {
              ok: false,
              status: STATUS.CONFLICT,
              reason: "hostname_taken",
              conflictingDomainId: hostTaken.rows[0].id,
            };
          }
        }

        // Temporarily disable immutability triggers for this controlled testing rename.
        await client.query(
          `ALTER TABLE platform.organizations DISABLE TRIGGER organizations_organization_key_immutable`
        );
        await client.query(
          `ALTER TABLE blessboard.churches DISABLE TRIGGER churches_church_key_immutable`
        );

        const nextDisplay = displayName || org.display_name;
        await client.query(
          `UPDATE platform.organizations
              SET organization_key = $2,
                  display_name = $3,
                  updated_at = now()
            WHERE id = $1`,
          [organizationId, toKey, nextDisplay]
        );

        const churchRes = await client.query(
          `UPDATE blessboard.churches
              SET church_key = $2,
                  display_name = $3,
                  updated_at = now()
            WHERE organization_id = $1
            RETURNING id, church_key, display_name`,
          [organizationId, toKey, nextDisplay]
        );
        const church = churchRes.rows[0] || null;

        await client.query(
          `UPDATE platform.organization_products
              SET product_tenant_key = $2,
                  updated_at = now()
            WHERE organization_id = $1
              AND product_tenant_key = $3`,
          [organizationId, toKey, fromKeyRaw]
        );

        if (hostname) {
          await client.query(
            `UPDATE platform.domains
                SET hostname = $2,
                    updated_at = now()
              WHERE organization_id = $1
                AND is_primary = true`,
            [organizationId, hostname]
          );
        }

        if (church && displayName) {
          await client.query(
            `UPDATE blessboard.church_settings
                SET public_name = $2,
                    updated_at = now()
              WHERE church_id = $1`,
            [church.id, displayName]
          );
        }

        await client.query(
          `ALTER TABLE platform.organizations ENABLE TRIGGER organizations_organization_key_immutable`
        );
        await client.query(
          `ALTER TABLE blessboard.churches ENABLE TRIGGER churches_church_key_immutable`
        );

        try {
          await recordBlessBoardAudit(client, {
            churchId: church ? church.id : null,
            organizationId,
            branchId: null,
            actorUserId,
            actionKey: "organization.key_renamed",
            entityType: "organization",
            entityId: organizationId,
            outcome: "success",
            metadata: {
              from_key: fromKeyRaw,
              to_key: toKey,
              display_name: nextDisplay,
              hostname: hostname || undefined,
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
          organizationId,
          organizationKey: toKey,
          previousOrganizationKey: fromKeyRaw,
          churchId: church ? church.id : null,
          churchKey: church ? church.church_key : null,
          displayName: nextDisplay,
          hostname: hostname || null,
        };
      } catch (err) {
        try {
          await client.query(
            `ALTER TABLE platform.organizations ENABLE TRIGGER organizations_organization_key_immutable`
          );
        } catch {
          /* ignore */
        }
        try {
          await client.query(
            `ALTER TABLE blessboard.churches ENABLE TRIGGER churches_church_key_immutable`
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
  renameBlessBoardOrganizationKey,
};
