"use strict";

/**
 * Compatibility adapter for BlessBoard auth objects.
 * Existing unlinked users remain valid; linked users expose optional platform fields.
 * Does not alter password ownership or session creation.
 */

const repo = require("../../platform/repositories/platformIdentityRepository");
const {
  mapIdentity,
  isIdentityUsable,
} = require("../../platform/services/platformIdentityService");
const {
  mapLink,
} = require("../../platform/services/identityProductProfileService");

/**
 * @param {object|null} userRow — blessboard.users row (snake_case or already mapped)
 */
function baseBlessBoardUser(userRow) {
  if (!userRow) return null;
  return {
    id: userRow.id,
    emailNormalized: userRow.email_normalized ?? userRow.emailNormalized ?? null,
    phoneNormalized: userRow.phone_normalized ?? userRow.phoneNormalized ?? null,
    phoneVerifiedAt: userRow.phone_verified_at ?? userRow.phoneVerifiedAt ?? null,
    status: userRow.status,
    displayName: userRow.display_name ?? userRow.displayName ?? null,
    platformIdentityId:
      userRow.platform_identity_id ?? userRow.platformIdentityId ?? null,
    // passwordHash intentionally omitted from public adapter shape
    hasPasswordHash: Boolean(userRow.password_hash ?? userRow.passwordHash),
    createdAt: userRow.created_at ?? userRow.createdAt ?? null,
    updatedAt: userRow.updated_at ?? userRow.updatedAt ?? null,
    lastLoginAt: userRow.last_login_at ?? userRow.lastLoginAt ?? null,
  };
}

/**
 * Enrich a BlessBoard user with optional platform identity metadata.
 *
 * @param {{ query: Function }} db
 * @param {object} userRow
 */
async function adaptBlessBoardAuthUser(db, userRow) {
  const user = baseBlessBoardUser(userRow);
  if (!user) {
    return {
      user: null,
      platformIdentity: null,
      platformUserId: null,
      linkedProducts: [],
    };
  }

  if (!user.platformIdentityId) {
    return {
      user,
      platformIdentity: null,
      platformUserId: null,
      linkedProducts: [],
    };
  }

  const identityRow = await repo.findIdentityById(db, user.platformIdentityId);
  const links = await repo.listProductProfilesByIdentity(db, user.platformIdentityId);

  return {
    user,
    platformIdentity: mapIdentity(identityRow),
    platformUserId: user.platformIdentityId,
    linkedProducts: links
      .filter((row) => row.status === "active")
      .map((row) => ({
        productKey: row.product_key,
        profileType: row.profile_type,
        productProfileId: row.product_profile_id,
        status: row.status,
      })),
    identityUsable: isIdentityUsable(identityRow),
    productProfileLinks: links.map(mapLink),
  };
}

/**
 * Resolve session principal during the compatibility period.
 * Delegates to the shared platform resolver; preserves `{ kind }` for older callers.
 *
 * @param {{ query: Function }} db
 * @param {{ user_id?: string|null, platform_identity_id?: string|null, deployment_code?: string|null }} sessionRow
 * @param {{ expectedProductCode?: string|null, deploymentApplicationCode?: string|null }} [options]
 */
async function resolveSessionPrincipal(db, sessionRow, options) {
  const {
    resolveDeploymentSessionPrincipal,
  } = require("../../platform/session/resolveDeploymentSessionPrincipal");
  const resolved = await resolveDeploymentSessionPrincipal(db, sessionRow || {}, options || {});
  if (!resolved.ok || !resolved.principal) {
    return { ok: false, code: resolved.code || "missing_principal", principal: null };
  }
  const p = resolved.principal;
  return {
    ok: true,
    code: "ok",
    principal: {
      kind: p.principalType,
      principalType: p.principalType,
      blessBoardUserId: p.blessBoardUserId,
      platformIdentityId: p.platformIdentityId,
      blessboardUser: p.blessboardUser || null,
      platformIdentity: p.platformIdentity || null,
    },
  };
}

module.exports = {
  baseBlessBoardUser,
  adaptBlessBoardAuthUser,
  resolveSessionPrincipal,
};
