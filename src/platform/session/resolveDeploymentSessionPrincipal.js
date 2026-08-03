"use strict";

/**
 * Product-neutral deployment session principal resolution (AC-V6-07).
 */

const identityRepo = require("../repositories/platformIdentityRepository");
const {
  mapIdentity,
  isIdentityUsable,
} = require("../services/platformIdentityService");

const RESULT = Object.freeze({
  OK: "ok",
  MISSING_PRINCIPAL: "missing_principal",
  AMBIGUOUS_PRINCIPAL: "ambiguous_principal",
  BLESSBOARD_USER_NOT_FOUND: "blessboard_user_not_found",
  IDENTITY_NOT_FOUND: "identity_not_found",
  IDENTITY_DISABLED: "identity_disabled",
  PRODUCT_MISMATCH: "product_mismatch",
  INVALID_INPUT: "invalid_input",
});

const PRINCIPAL_TYPES = Object.freeze({
  BLESSBOARD_USER: "blessboard_user",
  LINKED: "linked",
  PLATFORM_IDENTITY: "platform_identity",
});

/**
 * @param {{ query: Function }} db
 * @param {{
 *   user_id?: string|null,
 *   platform_identity_id?: string|null,
 *   deployment_code?: string|null,
 * }} sessionRow
 * @param {{
 *   expectedProductCode?: string|null,
 *   deploymentApplicationCode?: string|null,
 *   requireActiveIdentity?: boolean,
 * }} [options]
 */
async function resolveDeploymentSessionPrincipal(db, sessionRow, options) {
  const opts = options || {};
  const userId =
    sessionRow && sessionRow.user_id != null && String(sessionRow.user_id).trim() !== ""
      ? String(sessionRow.user_id).trim()
      : null;
  const identityId =
    sessionRow &&
    sessionRow.platform_identity_id != null &&
    String(sessionRow.platform_identity_id).trim() !== ""
      ? String(sessionRow.platform_identity_id).trim()
      : null;

  if (!userId && !identityId) {
    return { ok: false, code: RESULT.MISSING_PRINCIPAL, principal: null };
  }

  const expectedProduct = opts.expectedProductCode
    ? String(opts.expectedProductCode).trim().toLowerCase()
    : null;
  const deploymentProduct = opts.deploymentApplicationCode
    ? String(opts.deploymentApplicationCode).trim().toLowerCase()
    : null;

  if (expectedProduct && deploymentProduct && expectedProduct !== deploymentProduct) {
    return { ok: false, code: RESULT.PRODUCT_MISMATCH, principal: null };
  }

  if (userId && identityId) {
    if (deploymentProduct === "activeclinic" || expectedProduct === "activeclinic") {
      return { ok: false, code: RESULT.PRODUCT_MISMATCH, principal: null };
    }
    const bbUser = await identityRepo.findBlessBoardUserById(db, userId);
    if (!bbUser) {
      return { ok: false, code: RESULT.BLESSBOARD_USER_NOT_FOUND, principal: null };
    }
    if (String(bbUser.platform_identity_id || "") !== identityId) {
      return { ok: false, code: RESULT.AMBIGUOUS_PRINCIPAL, principal: null };
    }
    const identityRow = await identityRepo.findIdentityById(db, identityId);
    if (!identityRow) {
      return { ok: false, code: RESULT.IDENTITY_NOT_FOUND, principal: null };
    }
    if (opts.requireActiveIdentity !== false && !isIdentityUsable(identityRow)) {
      return {
        ok: false,
        code: RESULT.IDENTITY_DISABLED,
        principal: null,
        platformIdentity: mapIdentity(identityRow),
      };
    }
    return {
      ok: true,
      code: RESULT.OK,
      principal: {
        principalType: PRINCIPAL_TYPES.LINKED,
        blessBoardUserId: userId,
        platformIdentityId: identityId,
        blessboardUser: {
          id: bbUser.id,
          status: bbUser.status,
          displayName: bbUser.display_name,
          emailNormalized: bbUser.email_normalized,
          platformIdentityId: bbUser.platform_identity_id,
        },
        platformIdentity: mapIdentity(identityRow),
      },
    };
  }

  if (userId) {
    if (deploymentProduct === "activeclinic" || expectedProduct === "activeclinic") {
      return { ok: false, code: RESULT.PRODUCT_MISMATCH, principal: null };
    }
    const bbUser = await identityRepo.findBlessBoardUserById(db, userId);
    if (!bbUser) {
      return { ok: false, code: RESULT.BLESSBOARD_USER_NOT_FOUND, principal: null };
    }
    let platformIdentity = null;
    if (bbUser.platform_identity_id) {
      const identityRow = await identityRepo.findIdentityById(
        db,
        bbUser.platform_identity_id
      );
      platformIdentity = mapIdentity(identityRow);
    }
    return {
      ok: true,
      code: RESULT.OK,
      principal: {
        principalType: PRINCIPAL_TYPES.BLESSBOARD_USER,
        blessBoardUserId: userId,
        platformIdentityId: bbUser.platform_identity_id || null,
        blessboardUser: {
          id: bbUser.id,
          status: bbUser.status,
          displayName: bbUser.display_name,
          emailNormalized: bbUser.email_normalized,
          platformIdentityId: bbUser.platform_identity_id,
        },
        platformIdentity,
      },
    };
  }

  // platform identity only (ActiveClinic path)
  if (
    expectedProduct === "blessboard" ||
    deploymentProduct === "blessboard" ||
    (deploymentProduct && deploymentProduct !== "activeclinic") ||
    (expectedProduct && expectedProduct !== "activeclinic")
  ) {
    return { ok: false, code: RESULT.PRODUCT_MISMATCH, principal: null };
  }
  const identityRow = await identityRepo.findIdentityById(db, identityId);
  if (!identityRow) {
    return { ok: false, code: RESULT.IDENTITY_NOT_FOUND, principal: null };
  }
  if (opts.requireActiveIdentity !== false && !isIdentityUsable(identityRow)) {
    return {
      ok: false,
      code: RESULT.IDENTITY_DISABLED,
      principal: null,
      platformIdentity: mapIdentity(identityRow),
    };
  }
  return {
    ok: true,
    code: RESULT.OK,
    principal: {
      principalType: PRINCIPAL_TYPES.PLATFORM_IDENTITY,
      blessBoardUserId: null,
      platformIdentityId: identityId,
      blessboardUser: null,
      platformIdentity: mapIdentity(identityRow),
    },
  };
}

module.exports = {
  RESULT,
  PRINCIPAL_TYPES,
  resolveDeploymentSessionPrincipal,
};
