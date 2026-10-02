"use strict";

/**
 * Deterministic identity classification for public BlessBoard self-registration.
 * Does not send ordinary uniqueness or existing-account cases to Platform Admin review.
 */

const authRepo = require("../repositories/blessBoardAuthRepository");
const {
  normalizeChurchDisplayNameForUniqueness,
  resolveCountryCodeForUniqueness,
} = require("./normalizeChurchIdentity");

const IDENTITY_KIND = Object.freeze({
  FRESH: "fresh",
  ORPHAN_USER: "orphan_user",
  SAME_CHURCH: "same_church",
  OTHER_CHURCH: "other_church",
  SUSPENDED: "suspended",
});

const EXISTING_ACCOUNT_MESSAGE =
  "An account with this email already exists. Sign in to continue to your church workspace.";

const SUSPENDED_STATUSES = new Set(["suspended", "disabled", "blocked", "inactive", "locked"]);

function normalizeEmail(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase();
}

/**
 * @param {object|null|undefined} user
 */
function isSuspendedUser(user) {
  if (!user || !user.id) return false;
  return SUSPENDED_STATUSES.has(String(user.status || "").trim().toLowerCase());
}

/**
 * @param {{ query: Function }} db
 * @param {{
 *   email?: string|null,
 *   churchName?: string|null,
 *   country?: string|null,
 *   organizationKey?: string|null,
 *   applicationOrganizationId?: string|null,
 * }} opts
 */
async function classifyBlessBoardRegistrationIdentity(db, opts = {}) {
  const email = normalizeEmail(opts.email);
  if (!email || !db || typeof db.query !== "function") {
    return { kind: IDENTITY_KIND.FRESH, user: null, organizationId: null };
  }

  const user = await authRepo.findUserByEmail(db, email);
  if (!user || !user.id) {
    return { kind: IDENTITY_KIND.FRESH, user: null, organizationId: null };
  }
  if (isSuspendedUser(user)) {
    return { kind: IDENTITY_KIND.SUSPENDED, user, organizationId: null };
  }

  const roles = await authRepo.listActiveRolesForUser(db, user.id);
  const orgIds = [];
  for (const role of roles) {
    const id = role && role.organization_id ? String(role.organization_id) : "";
    if (id && !orgIds.includes(id)) orgIds.push(id);
  }
  if (orgIds.length === 0) {
    return { kind: IDENTITY_KIND.ORPHAN_USER, user, organizationId: null };
  }

  const requestedOrgId = opts.applicationOrganizationId
    ? String(opts.applicationOrganizationId)
    : "";
  if (requestedOrgId && orgIds.includes(requestedOrgId)) {
    return { kind: IDENTITY_KIND.SAME_CHURCH, user, organizationId: requestedOrgId };
  }

  const requestedKey = String(opts.organizationKey || "")
    .trim()
    .toLowerCase();
  const wantedName = normalizeChurchDisplayNameForUniqueness(opts.churchName);
  const wantedCountry = resolveCountryCodeForUniqueness(opts.country);

  const churches = await db.query(
    `SELECT c.organization_id, c.display_name, c.country_code, o.organization_key
       FROM blessboard.churches c
       JOIN platform.organizations o ON o.id = c.organization_id
      WHERE c.organization_id = ANY($1::uuid[])`,
    [orgIds]
  );
  for (const row of churches.rows) {
    const orgId = String(row.organization_id);
    const key = String(row.organization_key || "")
      .trim()
      .toLowerCase();
    if (requestedKey && key === requestedKey) {
      return { kind: IDENTITY_KIND.SAME_CHURCH, user, organizationId: orgId };
    }
    const rowName = normalizeChurchDisplayNameForUniqueness(row.display_name);
    const rowCountry = resolveCountryCodeForUniqueness(row.country_code);
    if (wantedName && rowName === wantedName && (!wantedCountry || !rowCountry || wantedCountry === rowCountry)) {
      return { kind: IDENTITY_KIND.SAME_CHURCH, user, organizationId: orgId };
    }
  }

  return { kind: IDENTITY_KIND.OTHER_CHURCH, user, organizationId: orgIds[0] };
}

/**
 * @param {{ query: Function }} db
 * @param {string} organizationId
 */
async function findLatestApplicationForOrganization(db, organizationId) {
  const orgId = String(organizationId || "").trim();
  if (!orgId || !db || typeof db.query !== "function") return null;
  const r = await db.query(
    `SELECT *
       FROM blessboard.platform_church_registration_applications
      WHERE organization_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 1`,
    [orgId]
  );
  return r.rows[0] || null;
}

module.exports = {
  IDENTITY_KIND,
  EXISTING_ACCOUNT_MESSAGE,
  classifyBlessBoardRegistrationIdentity,
  findLatestApplicationForOrganization,
  isSuspendedUser,
};
