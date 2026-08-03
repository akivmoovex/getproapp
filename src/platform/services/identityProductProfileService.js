"use strict";

/**
 * Link platform identities to product-specific profiles.
 * Linking does not grant organization or product access.
 */

const repo = require("../repositories/platformIdentityRepository");
const {
  isValidApplicationCode,
} = require("../config/productRegistry");
const {
  resolvePlatformIdentity,
  RESULT: IDENTITY_RESULT,
  isIdentityUsable,
  mapIdentity,
} = require("./platformIdentityService");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  INVALID_PRODUCT: "invalid_product",
  IDENTITY_NOT_FOUND: "identity_not_found",
  IDENTITY_DISABLED: "identity_disabled",
  PROFILE_NOT_FOUND: "product_profile_not_found",
  DUPLICATE_LINK: "duplicate_product_link",
  PROFILE_ALREADY_LINKED: "product_profile_already_linked",
  LINK_CONFLICT: "link_conflict",
  NOT_SUPPORTED: "profile_type_not_supported",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PROFILE_TYPES = Object.freeze({
  blessboard: "blessboard_user",
  activeclinic: "activeclinic_staff",
});

function mapLink(row) {
  if (!row) return null;
  return {
    id: row.id,
    identityId: row.identity_id,
    productKey: row.product_key,
    profileType: row.profile_type,
    productProfileId: row.product_profile_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * @param {{ query: Function }} db
 * @param {{ productKey: string, productProfileId: string }} input
 */
async function assertProductProfileExists(db, input) {
  const productKey = String(input.productKey || "").trim().toLowerCase();
  const productProfileId = String(input.productProfileId || "").trim();
  if (!UUID_RE.test(productProfileId)) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  if (productKey === "blessboard") {
    const user = await repo.findBlessBoardUserById(db, productProfileId);
    if (!user) return { ok: false, code: RESULT.PROFILE_NOT_FOUND };
    return { ok: true, code: RESULT.OK, blessBoardUser: user };
  }

  if (productKey === "activeclinic") {
    const staff = await db.query(
      `SELECT id FROM activeclinic.staff_members WHERE id = $1 LIMIT 1`,
      [productProfileId]
    );
    if (!staff.rows[0]) return { ok: false, code: RESULT.PROFILE_NOT_FOUND };
    return { ok: true, code: RESULT.OK, blessBoardUser: null };
  }

  return { ok: false, code: RESULT.INVALID_PRODUCT };
}

/**
 * @param {{ query: Function }} db
 * @param {{
 *   identityId: string,
 *   productKey: string,
 *   productProfileId: string,
 *   allowDisabledIdentity?: boolean,
 * }} input
 */
async function linkIdentityToProductProfile(db, input) {
  const identityId = String((input && input.identityId) || "").trim();
  const productKey = String((input && input.productKey) || "")
    .trim()
    .toLowerCase();
  const productProfileId = String((input && input.productProfileId) || "").trim();

  if (!identityId || !UUID_RE.test(identityId) || !productProfileId) {
    return { ok: false, code: RESULT.INVALID_INPUT, link: null };
  }
  if (!isValidApplicationCode(productKey) || !PROFILE_TYPES[productKey]) {
    return { ok: false, code: RESULT.INVALID_PRODUCT, link: null };
  }

  const identityRow = await repo.findIdentityById(db, identityId);
  if (!identityRow) {
    return { ok: false, code: RESULT.IDENTITY_NOT_FOUND, link: null };
  }
  if (!input.allowDisabledIdentity && !isIdentityUsable(identityRow)) {
    return { ok: false, code: RESULT.IDENTITY_DISABLED, link: null };
  }

  const profileCheck = await assertProductProfileExists(db, {
    productKey,
    productProfileId,
  });
  if (!profileCheck.ok) {
    return { ok: false, code: profileCheck.code, link: null };
  }

  const existingForIdentity = await repo.findProductProfile(db, {
    identityId,
    productKey,
  });
  if (existingForIdentity) {
    if (
      existingForIdentity.product_profile_id === productProfileId &&
      existingForIdentity.status === "active"
    ) {
      return { ok: true, code: RESULT.OK, link: mapLink(existingForIdentity) };
    }
    // BlessBoard: one active profile per identity. ActiveClinic: multi-org allowed.
    if (productKey === "blessboard") {
      return { ok: false, code: RESULT.DUPLICATE_LINK, link: mapLink(existingForIdentity) };
    }
  }

  if (productKey === "activeclinic") {
    const existingExact = await repo.findProductProfileByProductProfile(db, {
      productKey,
      productProfileId,
    });
    if (existingExact && existingExact.status === "active") {
      if (existingExact.identity_id === identityId) {
        return { ok: true, code: RESULT.OK, link: mapLink(existingExact) };
      }
      return {
        ok: false,
        code: RESULT.PROFILE_ALREADY_LINKED,
        link: mapLink(existingExact),
      };
    }
  } else {
    const existingForProfile = await repo.findProductProfileByProductProfile(db, {
      productKey,
      productProfileId,
    });
    if (existingForProfile) {
      if (existingForProfile.identity_id === identityId) {
        return { ok: true, code: RESULT.OK, link: mapLink(existingForProfile) };
      }
      return {
        ok: false,
        code: RESULT.PROFILE_ALREADY_LINKED,
        link: mapLink(existingForProfile),
      };
    }
  }

  if (productKey === "blessboard") {
    const bbUser = profileCheck.blessBoardUser;
    if (bbUser.platform_identity_id && bbUser.platform_identity_id !== identityId) {
      return { ok: false, code: RESULT.LINK_CONFLICT, link: null };
    }
  }

  // Pool has connect(); PoolClient has release(). Never call connect() on a client.
  const client =
    typeof db.connect === "function" && typeof db.release !== "function"
      ? await db.connect()
      : null;
  const q = client || db;

  try {
    if (client) await client.query("BEGIN");

    const linkRow = await repo.insertProductProfile(q, {
      identityId,
      productKey,
      profileType: PROFILE_TYPES[productKey],
      productProfileId,
      status: "active",
    });

    if (productKey === "blessboard") {
      const updated = await repo.setBlessBoardUserPlatformIdentity(q, {
        userId: productProfileId,
        identityId,
      });
      if (!updated) {
        if (client) await client.query("ROLLBACK");
        return { ok: false, code: RESULT.LINK_CONFLICT, link: null };
      }
    }

    if (client) await client.query("COMMIT");
    return { ok: true, code: RESULT.OK, link: mapLink(linkRow) };
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    const msg = err && err.message ? String(err.message) : "";
    if (/identity_product_profiles_identity_product_uidx/i.test(msg)) {
      return { ok: false, code: RESULT.DUPLICATE_LINK, link: null };
    }
    if (/identity_product_profiles_product_profile_uidx/i.test(msg)) {
      return { ok: false, code: RESULT.PROFILE_ALREADY_LINKED, link: null };
    }
    if (/users_platform_identity_id_uidx/i.test(msg)) {
      return { ok: false, code: RESULT.LINK_CONFLICT, link: null };
    }
    throw err;
  } finally {
    if (client) client.release();
  }
}

/**
 * @param {{ query: Function }} db
 * @param {{ identityId: string }} input
 */
async function listProductProfilesForIdentity(db, input) {
  const resolved = await resolvePlatformIdentity(db, {
    identityId: input.identityId,
    requireActive: false,
  });
  if (!resolved.ok && resolved.code === IDENTITY_RESULT.NOT_FOUND) {
    return { ok: false, code: RESULT.IDENTITY_NOT_FOUND, links: [] };
  }
  if (!resolved.ok && resolved.code === IDENTITY_RESULT.INVALID_INPUT) {
    return { ok: false, code: RESULT.INVALID_INPUT, links: [] };
  }
  const rows = await repo.listProductProfilesByIdentity(db, input.identityId);
  return { ok: true, code: RESULT.OK, links: rows.map(mapLink), identity: resolved.identity };
}

/**
 * @param {{ query: Function }} db
 * @param {{ identityId: string, productKey: string }} input
 */
async function resolveProductProfileForIdentity(db, input) {
  const identityId = String((input && input.identityId) || "").trim();
  const productKey = String((input && input.productKey) || "")
    .trim()
    .toLowerCase();
  if (!identityId || !productKey) {
    return { ok: false, code: RESULT.INVALID_INPUT, link: null };
  }
  if (!isValidApplicationCode(productKey)) {
    return { ok: false, code: RESULT.INVALID_PRODUCT, link: null };
  }
  const row = await repo.findProductProfile(db, { identityId, productKey });
  if (!row || row.status !== "active") {
    return { ok: false, code: RESULT.PROFILE_NOT_FOUND, link: null };
  }
  return { ok: true, code: RESULT.OK, link: mapLink(row) };
}

/**
 * Soft-unlink by revoking the product profile row (does not delete identity).
 * BlessBoard convenience FK is cleared when unlinking BlessBoard.
 * For ActiveClinic multi-org, pass productProfileId to target one staff profile.
 *
 * @param {{ query: Function }} db
 * @param {{ identityId: string, productKey: string, productProfileId?: string }} input
 */
async function unlinkIdentityProductProfile(db, input) {
  const identityId = String((input && input.identityId) || "").trim();
  const productKey = String((input && input.productKey) || "")
    .trim()
    .toLowerCase();
  const productProfileId =
    input && input.productProfileId != null
      ? String(input.productProfileId).trim()
      : "";
  if (!identityId || !productKey) {
    return { ok: false, code: RESULT.INVALID_INPUT, link: null };
  }

  let existing = null;
  if (productProfileId) {
    existing = await repo.findProductProfileByProductProfile(db, {
      productKey,
      productProfileId,
    });
    if (existing && existing.identity_id !== identityId) {
      return { ok: false, code: RESULT.PROFILE_NOT_FOUND, link: null };
    }
  } else {
    existing = await repo.findProductProfile(db, { identityId, productKey });
  }
  if (!existing) {
    return { ok: false, code: RESULT.PROFILE_NOT_FOUND, link: null };
  }

  // Pool has connect(); PoolClient has release(). Never call connect() on a client.
  const client =
    typeof db.connect === "function" && typeof db.release !== "function"
      ? await db.connect()
      : null;
  const q = client || db;
  try {
    if (client) await client.query("BEGIN");
    const updated = await repo.updateProductProfileStatus(q, existing.id, "revoked");
    if (productKey === "blessboard") {
      await repo.clearBlessBoardUserPlatformIdentity(q, identityId);
    }
    if (client) await client.query("COMMIT");
    return { ok: true, code: RESULT.OK, link: mapLink(updated) };
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    if (client) client.release();
  }
}

module.exports = {
  RESULT,
  PROFILE_TYPES,
  mapLink,
  linkIdentityToProductProfile,
  listProductProfilesForIdentity,
  resolveProductProfileForIdentity,
  unlinkIdentityProductProfile,
  mapIdentity,
};
