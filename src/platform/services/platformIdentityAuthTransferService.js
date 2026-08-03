"use strict";

/**
 * ActiveClinic auth-transfer abstraction (AC-V6-07).
 * Platform-identity principal; no blessboard.users dependency.
 * Does not deliver tokens via email/SMS/WhatsApp — fixtures and future login only.
 */

const {
  generateSessionToken,
  hashSessionToken,
} = require("../session/sessionToken");
const repo = require("../repositories/authTransferRepository");
const {
  createPlatformIdentitySession,
} = require("../session/createDeploymentSession");
const identityRepo = require("../repositories/platformIdentityRepository");
const { isIdentityUsable } = require("./platformIdentityService");
const {
  STATUS,
  TRANSFER_TTL_MS,
  transferExpiresAt,
  normalizeHostname,
  loadAuthTransferByRawToken,
  mapTransfer: mapBlessBoardTransfer,
} = require("./authTransferService");

const PURPOSE_ACTIVECLINIC_LOGIN = "activeclinic_login";

/**
 * @param {object} row
 */
function mapTransfer(row) {
  const base = mapBlessBoardTransfer(row);
  if (!base) return null;
  return {
    ...base,
    platformIdentityId: row.platform_identity_id || null,
  };
}

/**
 * Create a pending ActiveClinic transfer (no principal until authenticated).
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{
 *   deploymentCode: string,
 *   hostname: string,
 *   organizationId: string,
 *   returnPath?: string | null,
 * }} input
 */
async function createActiveClinicLoginTransferRequest(db, input) {
  const deploymentCode = String((input && input.deploymentCode) || "")
    .trim()
    .toLowerCase();
  const hostname = normalizeHostname(input && input.hostname);
  const organizationId = String((input && input.organizationId) || "").trim();
  // return_path CHECK is BlessBoard-shaped; AC uses null until product paths are migrated.
  const returnPath = null;

  if (!deploymentCode || !hostname || !organizationId) {
    return { ok: false, status: STATUS.INVALID_INPUT, rawToken: null, transfer: null };
  }

  let client = null;
  let owned = false;
  try {
    if (typeof db.connect === "function") {
      client = await db.connect();
      owned = true;
    } else {
      client = db;
    }

    const deployment = await client.query(
      `SELECT deployment_code, application_code, status
         FROM platform.deployments
        WHERE deployment_code = $1
        LIMIT 1`,
      [deploymentCode]
    );
    const dep = deployment.rows[0];
    if (!dep || dep.status !== "active") {
      return { ok: false, status: STATUS.INVALID_INPUT, rawToken: null, transfer: null };
    }
    if (String(dep.application_code || "").toLowerCase() !== "activeclinic") {
      return { ok: false, status: STATUS.DEPLOYMENT_MISMATCH, rawToken: null, transfer: null };
    }

    const { rawToken, tokenHash } = generateSessionToken();
    const row = await repo.insertAuthTransfer(client, {
      transferTokenHash: tokenHash,
      deploymentCode,
      requestedHostname: hostname,
      organizationId,
      churchId: null,
      branchId: null,
      purpose: PURPOSE_ACTIVECLINIC_LOGIN,
      returnPath,
      expiresAt: transferExpiresAt(),
    });
    if (!row) {
      return { ok: false, status: STATUS.LOOKUP_ERROR, rawToken: null, transfer: null };
    }
    return {
      ok: true,
      status: STATUS.OK,
      rawToken,
      transfer: mapTransfer(row),
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, rawToken: null, transfer: null };
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

/**
 * Attach platform identity after successful AC authentication (future login).
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{
 *   rawRequestToken: string,
 *   deploymentCode: string,
 *   platformIdentityId: string,
 * }} input
 */
async function issueActiveClinicLoginRedeemCode(db, input) {
  const deploymentCode = String((input && input.deploymentCode) || "")
    .trim()
    .toLowerCase();
  const platformIdentityId = String((input && input.platformIdentityId) || "").trim();
  const rawRequestToken = String((input && input.rawRequestToken) || "");

  if (!deploymentCode || !platformIdentityId || !rawRequestToken) {
    return { ok: false, status: STATUS.INVALID_INPUT, rawToken: null, transfer: null };
  }

  let client = null;
  let owned = false;
  try {
    if (typeof db.connect === "function") {
      client = await db.connect();
      owned = true;
    } else {
      client = db;
    }

    await client.query("BEGIN");
    const loaded = await loadAuthTransferByRawToken(client, {
      rawToken: rawRequestToken,
      deploymentCode,
    });
    if (!loaded.ok || !loaded.transfer) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        status: loaded.status || STATUS.INVALID_TRANSFER,
        rawToken: null,
        transfer: null,
      };
    }
    if (loaded.transfer.purpose !== PURPOSE_ACTIVECLINIC_LOGIN) {
      await client.query("ROLLBACK");
      return { ok: false, status: STATUS.DEPLOYMENT_MISMATCH, rawToken: null, transfer: null };
    }
    if (loaded.transfer.userId || loaded.transfer.platformIdentityId) {
      await client.query("ROLLBACK");
      return { ok: false, status: STATUS.INVALID_TRANSFER, rawToken: null, transfer: null };
    }

    const identity = await identityRepo.findIdentityById(client, platformIdentityId);
    if (!identity || !isIdentityUsable(identity)) {
      await client.query("ROLLBACK");
      return { ok: false, status: STATUS.UNAUTHORIZED, rawToken: null, transfer: null };
    }

    const { rawToken, tokenHash } = generateSessionToken();
    const updated = await repo.markAuthTransferAuthenticatedPlatformIdentity(client, {
      id: loaded.transfer.id,
      expectedHash: loaded.tokenHash,
      newTokenHash: tokenHash,
      platformIdentityId,
      expiresAt: transferExpiresAt(),
    });
    if (!updated) {
      await client.query("ROLLBACK");
      return { ok: false, status: STATUS.INVALID_TRANSFER, rawToken: null, transfer: null };
    }
    await client.query("COMMIT");
    return {
      ok: true,
      status: STATUS.OK,
      rawToken,
      transfer: mapTransfer(updated),
    };
  } catch {
    try {
      if (client) await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    return { ok: false, status: STATUS.LOOKUP_ERROR, rawToken: null, transfer: null };
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

/**
 * Redeem ActiveClinic transfer → platform-identity deployment session.
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{
 *   rawToken: string,
 *   deploymentCode: string,
 *   hostname: string,
 *   organizationId: string,
 *   ip?: string | null,
 *   userAgent?: string | null,
 * }} input
 */
async function redeemActiveClinicLoginTransfer(db, input) {
  const deploymentCode = String((input && input.deploymentCode) || "")
    .trim()
    .toLowerCase();
  const hostname = normalizeHostname(input && input.hostname);
  const organizationId = String((input && input.organizationId) || "").trim();
  const rawToken = String((input && input.rawToken) || "");

  if (!deploymentCode || !hostname || !organizationId || !rawToken) {
    return { ok: false, status: STATUS.INVALID_INPUT, rawSessionToken: null, transfer: null };
  }

  let client = null;
  let owned = false;
  try {
    if (typeof db.connect === "function") {
      client = await db.connect();
      owned = true;
    } else {
      client = db;
    }

    await client.query("BEGIN");
    const tokenHash = hashSessionToken(rawToken);
    const existing = await repo.findAuthTransferByHash(client, tokenHash);
    if (!existing) {
      await client.query("ROLLBACK");
      return { ok: false, status: STATUS.INVALID_TRANSFER, rawSessionToken: null, transfer: null };
    }
    if (String(existing.purpose) !== PURPOSE_ACTIVECLINIC_LOGIN) {
      await client.query("ROLLBACK");
      return { ok: false, status: STATUS.DEPLOYMENT_MISMATCH, rawSessionToken: null, transfer: null };
    }
    if (String(existing.deployment_code) !== deploymentCode) {
      await client.query("ROLLBACK");
      return { ok: false, status: STATUS.DEPLOYMENT_MISMATCH, rawSessionToken: null, transfer: null };
    }
    if (normalizeHostname(existing.requested_hostname) !== hostname) {
      await client.query("ROLLBACK");
      return { ok: false, status: STATUS.HOSTNAME_MISMATCH, rawSessionToken: null, transfer: null };
    }
    if (existing.consumed_at) {
      await client.query("ROLLBACK");
      return { ok: false, status: STATUS.CONSUMED, rawSessionToken: null, transfer: null };
    }
    if (new Date(existing.expires_at).getTime() <= Date.now()) {
      await client.query("ROLLBACK");
      return { ok: false, status: STATUS.EXPIRED, rawSessionToken: null, transfer: null };
    }
    if (!existing.platform_identity_id || existing.user_id) {
      await client.query("ROLLBACK");
      return { ok: false, status: STATUS.NOT_READY, rawSessionToken: null, transfer: null };
    }
    // Organization may be a placeholder from multi-org selection; caller must
    // have revalidated eligibility. Bind the selected organization before consume.
    if (String(existing.organization_id) !== organizationId) {
      const updatedOrg = await client.query(
        `UPDATE platform.auth_transfers
            SET organization_id = $2
          WHERE id = $1
            AND platform_identity_id IS NOT NULL
            AND user_id IS NULL
            AND consumed_at IS NULL
            AND expires_at > now()
            AND purpose = 'activeclinic_login'
          RETURNING id`,
        [existing.id, organizationId]
      );
      if (!updatedOrg.rowCount) {
        await client.query("ROLLBACK");
        return { ok: false, status: STATUS.HOSTNAME_MISMATCH, rawSessionToken: null, transfer: null };
      }
    }

    const consumed = await repo.consumePlatformIdentityAuthTransfer(client, {
      id: existing.id,
      expectedHash: tokenHash,
      hostname,
      deploymentCode,
    });
    if (!consumed) {
      await client.query("ROLLBACK");
      return { ok: false, status: STATUS.INVALID_TRANSFER, rawSessionToken: null, transfer: null };
    }

    const session = await createPlatformIdentitySession(client, {
      deploymentCode,
      platformIdentityId: consumed.platform_identity_id,
      organizationId: consumed.organization_id,
      ip: input.ip || null,
      userAgent: input.userAgent || null,
    });
    if (!session.ok) {
      await client.query("ROLLBACK");
      return { ok: false, status: STATUS.LOOKUP_ERROR, rawSessionToken: null, transfer: null };
    }

    await client.query("COMMIT");
    return {
      ok: true,
      status: STATUS.OK,
      rawSessionToken: session.rawToken,
      transfer: mapTransfer(consumed),
      returnPath: null,
      principalType: "platform_identity",
    };
  } catch {
    try {
      if (client) await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    return { ok: false, status: STATUS.LOOKUP_ERROR, rawSessionToken: null, transfer: null };
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

module.exports = {
  PURPOSE_ACTIVECLINIC_LOGIN,
  TRANSFER_TTL_MS,
  STATUS,
  mapTransfer,
  createActiveClinicLoginTransferRequest,
  issueActiveClinicLoginRedeemCode,
  redeemActiveClinicLoginTransfer,
};
