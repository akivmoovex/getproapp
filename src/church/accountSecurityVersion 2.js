"use strict";

/**
 * Centralized account security_version helpers for session revocation.
 *
 * On successful login the current integer is stamped into the session.
 * Authenticated middleware compares that stamp to the live DB value; a mismatch
 * destroys the session and forces re-authentication. Mutations that change
 * credentials, status, role or scope must bump the version in the same transaction.
 *
 * Never logs or stores passwords or session identifiers.
 */

const ACCOUNT_TABLES = Object.freeze({
  member: "public.church_members",
  branch_admin: "public.church_branch_admins",
  hq_admin: "public.church_hq_admins",
  ministry_leader: "public.church_ministry_leaders",
  platform_admin: "public.admin_users",
});

/** Tables that have an updated_at column to touch alongside security_version. */
const TABLES_WITH_UPDATED_AT = Object.freeze(
  new Set(["member", "branch_admin", "hq_admin", "ministry_leader"])
);

function normalizeSecurityVersion(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function stampSecurityVersion(payload, rowOrVersion, fallbackVersion) {
  let version = null;
  if (rowOrVersion != null && typeof rowOrVersion === "object") {
    if (rowOrVersion.security_version != null && rowOrVersion.security_version !== "") {
      version = normalizeSecurityVersion(rowOrVersion.security_version);
    }
  } else if (rowOrVersion != null && rowOrVersion !== "") {
    version = normalizeSecurityVersion(rowOrVersion);
  }
  if (version == null && fallbackVersion != null && fallbackVersion !== "") {
    version = normalizeSecurityVersion(fallbackVersion);
  }
  if (version == null) version = 1;
  return { ...(payload || {}), security_version: version };
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {keyof typeof ACCOUNT_TABLES} kind
 * @param {number} accountId
 * @returns {Promise<number>} new security_version
 */
async function bumpAccountSecurityVersion(db, kind, accountId) {
  const table = ACCOUNT_TABLES[kind];
  if (!table) throw new Error(`Unknown account kind: ${kind}`);
  const id = Number(accountId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("accountId is required to bump security_version.");
  }
  const sql = TABLES_WITH_UPDATED_AT.has(kind)
    ? `UPDATE ${table}
       SET security_version = security_version + 1, updated_at = now()
       WHERE id = $1
       RETURNING security_version`
    : `UPDATE ${table}
       SET security_version = security_version + 1
       WHERE id = $1
       RETURNING security_version`;
  const r = await db.query(sql, [id]);
  return normalizeSecurityVersion(r.rows[0] && r.rows[0].security_version);
}

/**
 * Bump security_version for every account belonging to an organization.
 * Used on organization suspension so all tenant sessions stop working.
 * Does not touch other organizations.
 * @returns {Promise<{ members: number, branchAdmins: number, hqAdmins: number, ministryLeaders: number }>}
 */
async function bumpOrganizationAccountSecurityVersions(db, organizationId) {
  const orgId = Number(organizationId);
  if (!Number.isFinite(orgId) || orgId <= 0) {
    throw new Error("organizationId is required for scoped session revocation.");
  }
  const members = await db.query(
    `UPDATE public.church_members
     SET security_version = security_version + 1, updated_at = now()
     WHERE organization_id = $1
     RETURNING id`,
    [orgId]
  );
  const branchAdmins = await db.query(
    `UPDATE public.church_branch_admins
     SET security_version = security_version + 1, updated_at = now()
     WHERE organization_id = $1
     RETURNING id`,
    [orgId]
  );
  const hqAdmins = await db.query(
    `UPDATE public.church_hq_admins
     SET security_version = security_version + 1, updated_at = now()
     WHERE organization_id = $1
     RETURNING id`,
    [orgId]
  );
  const ministryLeaders = await db.query(
    `UPDATE public.church_ministry_leaders
     SET security_version = security_version + 1, updated_at = now()
     WHERE organization_id = $1
     RETURNING id`,
    [orgId]
  );
  return {
    members: members.rowCount || 0,
    branchAdmins: branchAdmins.rowCount || 0,
    hqAdmins: hqAdmins.rowCount || 0,
    ministryLeaders: ministryLeaders.rowCount || 0,
  };
}

/**
 * Bump security_version for branch-scoped accounts only (members, branch admins, leaders).
 * HQ admins for the parent organization are intentionally left unchanged.
 */
async function bumpBranchAccountSecurityVersions(db, branchId) {
  const id = Number(branchId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("branchId is required for scoped session revocation.");
  }
  const members = await db.query(
    `UPDATE public.church_members
     SET security_version = security_version + 1, updated_at = now()
     WHERE branch_id = $1
     RETURNING id`,
    [id]
  );
  const branchAdmins = await db.query(
    `UPDATE public.church_branch_admins
     SET security_version = security_version + 1, updated_at = now()
     WHERE branch_id = $1
     RETURNING id`,
    [id]
  );
  const ministryLeaders = await db.query(
    `UPDATE public.church_ministry_leaders
     SET security_version = security_version + 1, updated_at = now()
     WHERE branch_id = $1
     RETURNING id`,
    [id]
  );
  return {
    members: members.rowCount || 0,
    branchAdmins: branchAdmins.rowCount || 0,
    ministryLeaders: ministryLeaders.rowCount || 0,
    hqAdmins: 0,
  };
}

/**
 * True when the session stamp matches the live DB version.
 * Missing session stamp is treated as a mismatch (force re-login).
 */
function sessionMatchesSecurityVersion(sessionPayload, dbRow) {
  if (!sessionPayload || !dbRow) return false;
  if (sessionPayload.security_version == null || sessionPayload.security_version === "") {
    return false;
  }
  const sessionVersion = normalizeSecurityVersion(sessionPayload.security_version);
  const dbVersion = normalizeSecurityVersion(dbRow.security_version);
  return sessionVersion === dbVersion;
}

/**
 * Destroy the Express session and clear auth state after a version mismatch.
 * Browser requests redirect to login; API/JSON requests get 401.
 */
function rejectStaleSecuritySession(req, res, opts = {}) {
  const loginPath = opts.loginPath || "/login";
  const clearFn = typeof opts.clearFn === "function" ? opts.clearFn : null;
  if (clearFn) {
    try {
      clearFn(req);
    } catch {
      /* ignore */
    }
  }

  const wantsJson =
    typeof opts.wantsJson === "function"
      ? opts.wantsJson(req)
      : !!(
          req.xhr ||
          (req.headers && String(req.headers.accept || "").includes("application/json")) ||
          (req.headers && String(req.headers["content-type"] || "").includes("application/json"))
        );

  if (!req.session || typeof req.session.destroy !== "function") {
    if (wantsJson) {
      return res.status(401).json({ ok: false, error: "Session expired. Please sign in again." });
    }
    return res.redirect(loginPath);
  }
  return req.session.destroy(() => {
    if (wantsJson) {
      return res.status(401).json({ ok: false, error: "Session expired. Please sign in again." });
    }
    return res.redirect(loginPath);
  });
}

module.exports = {
  ACCOUNT_TABLES,
  normalizeSecurityVersion,
  stampSecurityVersion,
  bumpAccountSecurityVersion,
  bumpOrganizationAccountSecurityVersions,
  bumpBranchAccountSecurityVersions,
  sessionMatchesSecurityVersion,
  rejectStaleSecuritySession,
};
