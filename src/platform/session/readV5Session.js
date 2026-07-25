"use strict";

/**
 * Read and optionally touch a V5 deployment-scoped session.
 */

const { hashSessionToken, LAST_SEEN_MIN_INTERVAL_MS } = require("./sessionToken");

/**
 * @param {{ query: Function }} client
 * @param {{ rawToken: string, deploymentCode: string, touch?: boolean }} opts
 */
async function readV5Session(client, opts) {
  const rawToken = String(opts.rawToken || "");
  const deploymentCode = String(opts.deploymentCode || "")
    .trim()
    .toLowerCase();
  if (!rawToken || !deploymentCode) {
    return { ok: false, code: "unauthenticated", session: null };
  }

  const tokenHash = hashSessionToken(rawToken);
  const found = await client.query(
    `SELECT s.id, s.deployment_code, s.user_id, s.organization_id, s.church_id, s.branch_id,
            s.created_at, s.last_seen_at, s.expires_at, s.revoked_at,
            u.email_normalized, u.display_name, u.status AS user_status
       FROM platform.deployment_sessions s
       JOIN blessboard.users u ON u.id = s.user_id
      WHERE s.session_token_hash = $1
      LIMIT 1`,
    [tokenHash]
  );
  const row = found.rows[0];
  if (!row) {
    return { ok: false, code: "unauthenticated", session: null };
  }
  if (String(row.deployment_code) !== deploymentCode) {
    return { ok: false, code: "deployment_mismatch", session: null };
  }
  if (row.revoked_at) {
    return { ok: false, code: "revoked", session: null };
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return { ok: false, code: "expired", session: null };
  }
  if (String(row.user_status) !== "active") {
    return { ok: false, code: "inactive_user", session: null };
  }

  // Touch is best-effort. Never fail an otherwise-valid session when last_seen
  // cannot be updated (pool blips must not force a login redirect).
  if (opts.touch) {
    try {
      const lastSeenMs = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
      const lastSeenValid = Number.isFinite(lastSeenMs) && lastSeenMs > 0;
      if (!lastSeenValid || Date.now() - lastSeenMs >= LAST_SEEN_MIN_INTERVAL_MS) {
        await client.query(
          `UPDATE platform.deployment_sessions
              SET last_seen_at = now()
            WHERE id = $1 AND revoked_at IS NULL`,
          [row.id]
        );
        row.last_seen_at = new Date();
      }
    } catch {
      /* ignore touch failures */
    }
  }

  return {
    ok: true,
    code: "ok",
    session: {
      id: row.id,
      deploymentCode: row.deployment_code,
      userId: row.user_id,
      organizationId: row.organization_id,
      churchId: row.church_id,
      branchId: row.branch_id,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      expiresAt: row.expires_at,
      user: {
        id: row.user_id,
        emailNormalized: row.email_normalized,
        displayName: row.display_name,
        status: row.user_status,
      },
    },
  };
}

module.exports = {
  readV5Session,
};
