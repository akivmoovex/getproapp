"use strict";

/**
 * Explicit deployment session writer with transitional principals (AC-V6-07).
 * BlessBoard legacy path remains via createBlessBoardSession / createV5Session wrapper.
 */

const {
  generateSessionToken,
  sessionExpiresAt,
  sha256Hex,
} = require("./sessionToken");
const identityRepo = require("../repositories/platformIdentityRepository");
const { isIdentityUsable } = require("../services/platformIdentityService");
const {
  deploymentAllowsPlatformIdentityPrincipal,
  deploymentAllowsBlessBoardPrincipal,
} = require("./deploymentApplicationCompatibility");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  INVALID_DEPLOYMENT: "invalid_deployment",
  DEPLOYMENT_NOT_FOUND: "deployment_not_found",
  INACTIVE_DEPLOYMENT: "inactive_deployment",
  CONFLICTING_PRINCIPAL: "conflicting_principal",
  MISSING_PRINCIPAL: "missing_principal",
  IDENTITY_DISABLED: "identity_disabled",
  PRODUCT_MISMATCH: "product_mismatch",
  INVALID_BLESSBOARD_ONLY: "activeclinic_rejects_blessboard_only",
});

/**
 * @param {{ query: Function }} client
 * @param {string} deploymentCode
 */
async function loadActiveDeployment(client, deploymentCode) {
  const deployment = await client.query(
    `SELECT deployment_code, status, application_code
       FROM platform.deployments
      WHERE deployment_code = $1
      LIMIT 1`,
    [deploymentCode]
  );
  return deployment.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {{
 *   deploymentCode: string,
 *   principalType: 'blessboard_user'|'linked'|'platform_identity',
 *   blessboardUserId?: string|null,
 *   platformIdentityId?: string|null,
 *   organizationId?: string|null,
 *   churchId?: string|null,
 *   branchId?: string|null,
 *   ip?: string|null,
 *   userAgent?: string|null,
 * }} fields
 */
async function createDeploymentSession(client, fields) {
  const deploymentCode = String(fields.deploymentCode || "")
    .trim()
    .toLowerCase();
  const principalType = String(fields.principalType || "")
    .trim()
    .toLowerCase();
  const blessboardUserId =
    fields.blessboardUserId != null && String(fields.blessboardUserId).trim() !== ""
      ? String(fields.blessboardUserId).trim()
      : null;
  const platformIdentityId =
    fields.platformIdentityId != null &&
    String(fields.platformIdentityId).trim() !== ""
      ? String(fields.platformIdentityId).trim()
      : null;

  if (!deploymentCode) {
    return { ok: false, code: RESULT.INVALID_DEPLOYMENT };
  }
  if (!["blessboard_user", "linked", "platform_identity"].includes(principalType)) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const deployment = await loadActiveDeployment(client, deploymentCode);
  if (!deployment) {
    return { ok: false, code: RESULT.DEPLOYMENT_NOT_FOUND };
  }
  if (deployment.status !== "active") {
    return { ok: false, code: RESULT.INACTIVE_DEPLOYMENT };
  }

  const applicationCode = String(deployment.application_code || "").toLowerCase();

  if (principalType === "platform_identity") {
    if (!platformIdentityId || blessboardUserId) {
      return { ok: false, code: RESULT.CONFLICTING_PRINCIPAL };
    }
    if (!deploymentAllowsPlatformIdentityPrincipal(applicationCode)) {
      return { ok: false, code: RESULT.PRODUCT_MISMATCH };
    }
    const identity = await identityRepo.findIdentityById(client, platformIdentityId);
    if (!identity || !isIdentityUsable(identity)) {
      return { ok: false, code: RESULT.IDENTITY_DISABLED };
    }
  } else if (principalType === "blessboard_user") {
    if (!blessboardUserId || platformIdentityId) {
      return { ok: false, code: RESULT.CONFLICTING_PRINCIPAL };
    }
    if (!deploymentAllowsBlessBoardPrincipal(applicationCode)) {
      return { ok: false, code: RESULT.INVALID_BLESSBOARD_ONLY };
    }
  } else if (principalType === "linked") {
    if (!blessboardUserId || !platformIdentityId) {
      return { ok: false, code: RESULT.MISSING_PRINCIPAL };
    }
    if (!deploymentAllowsBlessBoardPrincipal(applicationCode)) {
      return { ok: false, code: RESULT.PRODUCT_MISMATCH };
    }
    const bbUser = await identityRepo.findBlessBoardUserById(client, blessboardUserId);
    if (!bbUser || String(bbUser.platform_identity_id || "") !== platformIdentityId) {
      return { ok: false, code: RESULT.CONFLICTING_PRINCIPAL };
    }
    const identity = await identityRepo.findIdentityById(client, platformIdentityId);
    if (!identity || !isIdentityUsable(identity)) {
      return { ok: false, code: RESULT.IDENTITY_DISABLED };
    }
  }

  if (!blessboardUserId && !platformIdentityId) {
    return { ok: false, code: RESULT.MISSING_PRINCIPAL };
  }

  const { rawToken, tokenHash } = generateSessionToken();
  const expiresAt = sessionExpiresAt();
  const ipHash = fields.ip ? sha256Hex(fields.ip) : null;
  const uaHash = fields.userAgent ? sha256Hex(fields.userAgent) : null;
  const contextJson =
    fields.contextJson && typeof fields.contextJson === "object" && !Array.isArray(fields.contextJson)
      ? fields.contextJson
      : {};

  const inserted = await client.query(
    `INSERT INTO platform.deployment_sessions
       (session_token_hash, deployment_code, user_id, platform_identity_id,
        organization_id, church_id, branch_id, expires_at, ip_hash, user_agent_hash,
        context_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
     RETURNING id, deployment_code, user_id, platform_identity_id, organization_id,
               church_id, branch_id, created_at, last_seen_at, expires_at, revoked_at,
               context_json`,
    [
      tokenHash,
      deploymentCode,
      blessboardUserId,
      platformIdentityId,
      fields.organizationId || null,
      fields.churchId || null,
      fields.branchId || null,
      expiresAt.toISOString(),
      ipHash,
      uaHash,
      JSON.stringify(contextJson),
    ]
  );

  return {
    ok: true,
    code: RESULT.OK,
    rawToken,
    session: inserted.rows[0],
    principalType,
    applicationCode,
    audit: {
      event: "deployment_session_created",
      principalType,
      product: applicationCode,
      deployment: deploymentCode,
      hasBlessBoardUser: Boolean(blessboardUserId),
      hasPlatformIdentity: Boolean(platformIdentityId),
    },
  };
}

/**
 * BlessBoard-compatible helper (legacy principal; optional linked identity).
 */
async function createBlessBoardSession(client, fields) {
  const platformIdentityId =
    fields.platformIdentityId != null && String(fields.platformIdentityId).trim() !== ""
      ? String(fields.platformIdentityId).trim()
      : null;
  return createDeploymentSession(client, {
    ...fields,
    principalType: platformIdentityId ? "linked" : "blessboard_user",
    blessboardUserId: fields.userId || fields.blessboardUserId,
    platformIdentityId,
  });
}

/**
 * ActiveClinic platform-identity session (no blessboard.users).
 */
async function createPlatformIdentitySession(client, fields) {
  return createDeploymentSession(client, {
    ...fields,
    principalType: "platform_identity",
    blessboardUserId: null,
    platformIdentityId: fields.platformIdentityId,
    churchId: null,
    branchId: null,
  });
}

module.exports = {
  RESULT,
  createDeploymentSession,
  createBlessBoardSession,
  createPlatformIdentitySession,
};
