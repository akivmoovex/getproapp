"use strict";

/**
 * BlessBoard V5 tenant login transfer services (hash-only; single-use; ≤5 minutes).
 */

const pathPosix = require("path").posix;
const {
  generateSessionToken,
  hashSessionToken,
} = require("../session/sessionToken");
const repo = require("../repositories/authTransferRepository");
const { createV5Session } = require("../session/createV5Session");
const {
  authorizeBlessBoardTenantAccess,
  STATUS: AUTHZ_STATUS,
} = require("../../blessboard/services/authorizeBlessBoardTenantAccess");

const PURPOSE_TENANT_LOGIN = "tenant_login";
const TRANSFER_TTL_MS = 5 * 60 * 1000;

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  INVALID_TRANSFER: "invalid_transfer",
  EXPIRED: "expired",
  CONSUMED: "consumed",
  HOSTNAME_MISMATCH: "hostname_mismatch",
  DEPLOYMENT_MISMATCH: "deployment_mismatch",
  UNAUTHORIZED: "unauthorized",
  LOOKUP_ERROR: "lookup_error",
  NOT_READY: "not_ready",
});

/**
 * @param {Date} [from]
 */
function transferExpiresAt(from) {
  const base = from || new Date();
  return new Date(base.getTime() + TRANSFER_TTL_MS);
}

/**
 * @param {unknown} host
 */
function normalizeHostname(host) {
  return String(host || "")
    .trim()
    .toLowerCase()
    .split(":")[0];
}

/**
 * @param {unknown} path
 * @returns {string | null}
 */
function sanitizeReturnPath(path) {
  const s = String(path == null ? "" : path).trim();
  if (!s) return null;
  if (!s.startsWith("/") || s.startsWith("//")) return null;
  if (/[\s\\?]/.test(s)) return null;

  let decoded = s;
  try {
    decoded = decodeURIComponent(s);
  } catch {
    return null;
  }
  if (decoded.includes("\\") || decoded.includes("\0")) return null;

  const pathOnly = decoded.split("#")[0].split("?")[0];
  if (!pathOnly.startsWith("/") || pathOnly.startsWith("//")) return null;

  // Collapse . / .. safely; reject escapes outside a single rooted path.
  const normalized = pathPosix.normalize(pathOnly);
  if (!normalized.startsWith("/") || normalized.startsWith("//")) return null;
  if (normalized.includes("..")) return null;

  // Align with platform.auth_transfers return_path CHECK + member portal next.
  if (
    !/^\/(hq|branch-admin|member|account)(\/|$)/.test(normalized) &&
    normalized !== "/account"
  ) {
    return null;
  }
  if (normalized.length > 200) return null;
  return normalized;
}

/**
 * Create a pending transfer (user_id null) for apex login.
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{
 *   deploymentCode: string,
 *   hostname: string,
 *   organizationId: string,
 *   churchId: string,
 *   branchId?: string | null,
 *   returnPath?: string | null,
 * }} input
 */
async function createTenantLoginTransferRequest(db, input) {
  const deploymentCode = String((input && input.deploymentCode) || "")
    .trim()
    .toLowerCase();
  const hostname = normalizeHostname(input && input.hostname);
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const branchId =
    input && input.branchId != null && String(input.branchId).trim() !== ""
      ? String(input.branchId).trim()
      : null;
  const returnPath = sanitizeReturnPath(input && input.returnPath);

  if (!deploymentCode || !hostname || !organizationId || !churchId) {
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

    const { rawToken, tokenHash } = generateSessionToken();
    const row = await repo.insertAuthTransfer(client, {
      transferTokenHash: tokenHash,
      deploymentCode,
      requestedHostname: hostname,
      organizationId,
      churchId,
      branchId,
      purpose: PURPOSE_TENANT_LOGIN,
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
 * Load a pending or redeemable transfer by raw token (never logs the token).
 * @param {{ query: Function }} db
 * @param {{ rawToken: string, deploymentCode?: string | null }} input
 */
async function loadAuthTransferByRawToken(db, input) {
  const rawToken = String((input && input.rawToken) || "");
  if (!rawToken) {
    return { ok: false, status: STATUS.INVALID_TRANSFER, transfer: null };
  }
  try {
    const tokenHash = hashSessionToken(rawToken);
    const row = await repo.findAuthTransferByHash(db, tokenHash);
    if (!row) {
      return { ok: false, status: STATUS.INVALID_TRANSFER, transfer: null };
    }
    if (input.deploymentCode) {
      const code = String(input.deploymentCode).trim().toLowerCase();
      if (String(row.deployment_code) !== code) {
        return { ok: false, status: STATUS.DEPLOYMENT_MISMATCH, transfer: null };
      }
    }
    if (row.consumed_at) {
      return { ok: false, status: STATUS.CONSUMED, transfer: mapTransfer(row) };
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return { ok: false, status: STATUS.EXPIRED, transfer: mapTransfer(row) };
    }
    return { ok: true, status: STATUS.OK, transfer: mapTransfer(row), tokenHash };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, transfer: null };
  }
}

/**
 * After apex password auth: authorize against transfer tenant UUIDs, rotate to redeem code.
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{
 *   rawRequestToken: string,
 *   deploymentCode: string,
 *   userId: string,
 *   tenant: object,
 * }} input
 */
async function issueTenantLoginRedeemCode(db, input) {
  const deploymentCode = String((input && input.deploymentCode) || "")
    .trim()
    .toLowerCase();
  const userId = String((input && input.userId) || "").trim();
  const rawRequestToken = String((input && input.rawRequestToken) || "");
  const tenant = input && input.tenant;

  if (!deploymentCode || !userId || !rawRequestToken || !tenant) {
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
      return { ok: false, status: loaded.status || STATUS.INVALID_TRANSFER, rawToken: null, transfer: null };
    }
    if (loaded.transfer.userId) {
      await client.query("ROLLBACK");
      return { ok: false, status: STATUS.INVALID_TRANSFER, rawToken: null, transfer: null };
    }

    const t = loaded.transfer;
    if (
      String(tenant.organization && tenant.organization.id) !== String(t.organizationId) ||
      String(tenant.church && tenant.church.id) !== String(t.churchId)
    ) {
      await client.query("ROLLBACK");
      return { ok: false, status: STATUS.INVALID_TRANSFER, rawToken: null, transfer: null };
    }

    const authzTenant = tenantFromTransfer(t);
    const authz = await authorizeBlessBoardTenantAccess(client, {
      userId,
      tenant: authzTenant,
      branchId: t.branchId,
    });
    if (!authz.ok) {
      await client.query("ROLLBACK");
      if (authz.status === AUTHZ_STATUS.LOOKUP_ERROR) {
        return { ok: false, status: STATUS.LOOKUP_ERROR, rawToken: null, transfer: null };
      }
      return { ok: false, status: STATUS.UNAUTHORIZED, rawToken: null, transfer: null };
    }

    const { rawToken, tokenHash } = generateSessionToken();
    const updated = await repo.markAuthTransferAuthenticated(client, {
      id: t.id,
      expectedHash: loaded.tokenHash,
      newTokenHash: tokenHash,
      userId,
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
 * Redeem transfer on the tenant host: consume + create host-only session.
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{
 *   rawToken: string,
 *   deploymentCode: string,
 *   hostname: string,
 *   organizationId: string,
 *   churchId: string,
 *   branchId?: string | null,
 *   ip?: string | null,
 *   userAgent?: string | null,
 * }} input
 */
async function redeemTenantLoginTransfer(db, input) {
  const deploymentCode = String((input && input.deploymentCode) || "")
    .trim()
    .toLowerCase();
  const hostname = normalizeHostname(input && input.hostname);
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const branchId =
    input && input.branchId != null && String(input.branchId).trim() !== ""
      ? String(input.branchId).trim()
      : null;
  const rawToken = String((input && input.rawToken) || "");

  if (!deploymentCode || !hostname || !organizationId || !churchId || !rawToken) {
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
    if (!existing.user_id) {
      await client.query("ROLLBACK");
      return { ok: false, status: STATUS.NOT_READY, rawSessionToken: null, transfer: null };
    }
    if (
      String(existing.organization_id) !== organizationId ||
      String(existing.church_id) !== churchId ||
      (branchId && existing.branch_id && String(existing.branch_id) !== branchId)
    ) {
      await client.query("ROLLBACK");
      return { ok: false, status: STATUS.HOSTNAME_MISMATCH, rawSessionToken: null, transfer: null };
    }

    const consumed = await repo.consumeAuthTransfer(client, {
      id: existing.id,
      expectedHash: tokenHash,
      hostname,
      deploymentCode,
    });
    if (!consumed) {
      await client.query("ROLLBACK");
      return { ok: false, status: STATUS.INVALID_TRANSFER, rawSessionToken: null, transfer: null };
    }

    const session = await createV5Session(client, {
      deploymentCode,
      userId: consumed.user_id,
      organizationId: consumed.organization_id,
      churchId: consumed.church_id,
      branchId: consumed.branch_id,
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
      returnPath: sanitizeReturnPath(consumed.return_path) || null,
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

/**
 * @param {object} row
 */
function mapTransfer(row) {
  if (!row) return null;
  return {
    id: row.id,
    deploymentCode: row.deployment_code,
    requestedHostname: row.requested_hostname,
    organizationId: row.organization_id,
    churchId: row.church_id,
    branchId: row.branch_id,
    userId: row.user_id,
    purpose: row.purpose,
    returnPath: row.return_path,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
  };
}

/**
 * Build a minimal tenant object from a transfer row for authorization.
 * @param {object} transfer
 */
function tenantFromTransfer(transfer) {
  if (!transfer) return null;
  return {
    resolved: true,
    organization: { id: transfer.organizationId },
    church: { id: transfer.churchId },
    hqBranch: transfer.branchId ? { id: transfer.branchId } : null,
    primaryBranch: transfer.branchId ? { id: transfer.branchId } : null,
  };
}

module.exports = {
  PURPOSE_TENANT_LOGIN,
  TRANSFER_TTL_MS,
  STATUS,
  transferExpiresAt,
  normalizeHostname,
  sanitizeReturnPath,
  createTenantLoginTransferRequest,
  loadAuthTransferByRawToken,
  issueTenantLoginRedeemCode,
  redeemTenantLoginTransfer,
  tenantFromTransfer,
  mapTransfer,
};
