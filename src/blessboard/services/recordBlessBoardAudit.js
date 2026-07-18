"use strict";

/**
 * BlessBoard-scoped helper to append platform.audit_events after important writes.
 */

const {
  recordAuditEventSafe,
} = require("../../platform/services/auditEventService");
const { getPlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");

async function resolveOrganizationId(client, churchId) {
  const { rows } = await client.query(
    `SELECT organization_id FROM blessboard.churches WHERE id = $1 LIMIT 1`,
    [churchId]
  );
  return rows[0] ? rows[0].organization_id : null;
}

/**
 * @param {{ query: Function, connect?: Function }} db
 * @param {object} input
 */
async function recordBlessBoardAudit(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  if (!churchId) {
    return { ok: false, reason: "church_id" };
  }

  let client = null;
  let owned = false;
  try {
    if (db && typeof db.connect === "function") {
      client = await db.connect();
      owned = true;
    } else {
      client = db;
    }
    const organizationId =
      input.organizationId || (await resolveOrganizationId(client, churchId));
    if (!organizationId) {
      return { ok: false, reason: "organization_id" };
    }
    const deploymentIdentity =
      input.deploymentCode ||
      (() => {
        const id = getPlatformDeploymentCode(input.env || process.env);
        return id && id.ok ? id.code : null;
      })() ||
      "blessboard-org-v5";
    return await recordAuditEventSafe(client, {
      deploymentCode: deploymentIdentity,
      organizationId,
      churchId,
      branchId: input.branchId || null,
      actorUserId: input.actorUserId || null,
      actionKey: input.actionKey,
      entityType: input.entityType,
      entityId: input.entityId || null,
      outcome: input.outcome || "success",
      metadata: input.metadata || {},
    });
  } catch {
    return { ok: false, reason: "audit_failed" };
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

module.exports = {
  recordBlessBoardAudit,
};
