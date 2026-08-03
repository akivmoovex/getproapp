"use strict";

/**
 * Create a deployment-scoped V5 session row (token hash only).
 * BlessBoard legacy writer: requires userId. Optional platformIdentityId for linked dual-write.
 */

const {
  createBlessBoardSession,
  RESULT,
} = require("./createDeploymentSession");

/**
 * @param {{ query: Function }} client
 * @param {{
 *   deploymentCode: string,
 *   userId: string,
 *   platformIdentityId?: string | null,
 *   organizationId?: string | null,
 *   churchId?: string | null,
 *   branchId?: string | null,
 *   ip?: string | null,
 *   userAgent?: string | null,
 * }} fields
 */
async function createV5Session(client, fields) {
  const userId = String((fields && fields.userId) || "").trim();
  if (!userId) {
    return { ok: false, code: "invalid_user" };
  }

  const created = await createBlessBoardSession(client, {
    deploymentCode: fields.deploymentCode,
    userId,
    platformIdentityId: fields.platformIdentityId || null,
    organizationId: fields.organizationId,
    churchId: fields.churchId,
    branchId: fields.branchId,
    ip: fields.ip,
    userAgent: fields.userAgent,
  });

  if (!created.ok) {
    return { ok: false, code: created.code };
  }

  return {
    ok: true,
    rawToken: created.rawToken,
    session: created.session,
  };
}

module.exports = {
  createV5Session,
  RESULT,
};
