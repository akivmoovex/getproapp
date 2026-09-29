"use strict";

/**
 * Shared media folders for the website engine.
 *
 * Folders live in platform.media_folders and are keyed by organization, which
 * is the one tenant key both products share: ActiveClinic media is already
 * organization-scoped, and a BlessBoard church maps 1:1 to an organization via
 * blessboard.churches.organization_id.
 *
 * Assignment is a nullable folder_id on the existing asset row, so NULL means
 * "Unfiled", no asset storage is rewritten, and deleting a folder returns its
 * assets to Unfiled (ON DELETE SET NULL) rather than deleting them.
 *
 * Folders are flat by design — there is no parent_id and no cross-tenant
 * sharing.
 */

const RESULT = Object.freeze({
  INVALID_INPUT: "invalid_input",
  FOLDER_NOT_FOUND: "folder_not_found",
  MEDIA_NOT_FOUND: "media_not_found",
  NAME_TAKEN: "folder_name_taken",
  TENANT_MISMATCH: "tenant_mismatch",
  LIMIT_REACHED: "folder_limit_reached",
  UNSUPPORTED_PRODUCT: "unsupported_product",
});

const MAX_NAME_LENGTH = 80;
const MAX_FOLDERS_PER_ORGANIZATION = 100;

/** Unfiled is a view, not a row: it is every asset with folder_id IS NULL. */
const UNFILED_KEY = "unfiled";
const ALL_KEY = "all";

/**
 * Asset tables are whitelisted per product. Table and column names are only
 * ever read from this frozen map, never built from caller input.
 */
const PRODUCT_SOURCES = Object.freeze({
  activeclinic: Object.freeze({
    table: "platform.website_media",
    scopeColumn: "organization_id",
  }),
  blessboard: Object.freeze({
    table: "blessboard.media_assets",
    scopeColumn: "church_id",
  }),
});

function sourceFor(product) {
  const key = String(product || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(PRODUCT_SOURCES, key)
    ? PRODUCT_SOURCES[key]
    : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidOrNull(value) {
  const raw = String(value == null ? "" : value).trim();
  return UUID_RE.test(raw) ? raw : null;
}

/**
 * Collapse whitespace and reject control characters, matching the DB checks.
 * @param {unknown} value
 * @returns {string} normalized name, or "" when unusable
 */
function normalizeFolderName(value) {
  const raw = String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "";
  return raw.slice(0, MAX_NAME_LENGTH);
}

function mapFolder(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Resolve the organization that owns a product-side scope id.
 * ActiveClinic scopes by organization already; BlessBoard scopes by church.
 *
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{ product: string, scopeId: string }} input
 * @returns {Promise<{ ok: boolean, code?: string, organizationId?: string }>}
 */
async function resolveOrganizationId(db, input) {
  const source = sourceFor(input && input.product);
  if (!source) return { ok: false, code: RESULT.UNSUPPORTED_PRODUCT };
  const scopeId = uuidOrNull(input && input.scopeId);
  if (!scopeId) return { ok: false, code: RESULT.INVALID_INPUT };

  if (source.scopeColumn === "organization_id") {
    return { ok: true, organizationId: scopeId };
  }

  const { rows } = await db.query(
    `SELECT organization_id FROM blessboard.churches WHERE id = $1`,
    [scopeId]
  );
  if (!rows.length) return { ok: false, code: RESULT.TENANT_MISMATCH };
  return { ok: true, organizationId: rows[0].organization_id };
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{ organizationId: string }} input
 */
async function listFolders(db, input) {
  const organizationId = uuidOrNull(input && input.organizationId);
  if (!organizationId) return { ok: false, code: RESULT.INVALID_INPUT, folders: [] };
  const { rows } = await db.query(
    `SELECT * FROM platform.media_folders
      WHERE organization_id = $1
      ORDER BY name ASC`,
    [organizationId]
  );
  return { ok: true, folders: rows.map(mapFolder) };
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{ organizationId: string, folderId: string }} input
 */
async function getFolder(db, input) {
  const organizationId = uuidOrNull(input && input.organizationId);
  const folderId = uuidOrNull(input && input.folderId);
  if (!organizationId || !folderId) {
    return { ok: false, code: RESULT.INVALID_INPUT, folder: null };
  }
  const { rows } = await db.query(
    `SELECT * FROM platform.media_folders WHERE id = $1 AND organization_id = $2`,
    [folderId, organizationId]
  );
  if (!rows.length) return { ok: false, code: RESULT.FOLDER_NOT_FOUND, folder: null };
  return { ok: true, folder: mapFolder(rows[0]) };
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{ organizationId: string, name: unknown, actorIdentityId?: string|null }} input
 */
async function createFolder(db, input) {
  const organizationId = uuidOrNull(input && input.organizationId);
  const name = normalizeFolderName(input && input.name);
  if (!organizationId || !name) {
    return { ok: false, code: RESULT.INVALID_INPUT, folder: null };
  }

  const counted = await db.query(
    `SELECT count(*)::int AS total FROM platform.media_folders WHERE organization_id = $1`,
    [organizationId]
  );
  if (counted.rows[0].total >= MAX_FOLDERS_PER_ORGANIZATION) {
    return { ok: false, code: RESULT.LIMIT_REACHED, folder: null };
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO platform.media_folders (organization_id, name, created_by_identity_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [organizationId, name, uuidOrNull(input && input.actorIdentityId)]
    );
    return { ok: true, folder: mapFolder(rows[0]) };
  } catch (err) {
    // Unique violation on (organization_id, lower(name)).
    if (err && err.code === "23505") {
      return { ok: false, code: RESULT.NAME_TAKEN, folder: null };
    }
    throw err;
  }
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{ organizationId: string, folderId: string, name: unknown }} input
 */
async function renameFolder(db, input) {
  const organizationId = uuidOrNull(input && input.organizationId);
  const folderId = uuidOrNull(input && input.folderId);
  const name = normalizeFolderName(input && input.name);
  if (!organizationId || !folderId || !name) {
    return { ok: false, code: RESULT.INVALID_INPUT, folder: null };
  }

  try {
    const { rows } = await db.query(
      `UPDATE platform.media_folders
          SET name = $3, updated_at = now()
        WHERE id = $1 AND organization_id = $2
        RETURNING *`,
      [folderId, organizationId, name]
    );
    if (!rows.length) return { ok: false, code: RESULT.FOLDER_NOT_FOUND, folder: null };
    return { ok: true, folder: mapFolder(rows[0]) };
  } catch (err) {
    if (err && err.code === "23505") {
      return { ok: false, code: RESULT.NAME_TAKEN, folder: null };
    }
    throw err;
  }
}

/**
 * Delete a folder. Assets are never deleted: the folder_id foreign keys are
 * ON DELETE SET NULL, so filed assets return to Unfiled.
 *
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{ organizationId: string, folderId: string }} input
 */
async function deleteFolder(db, input) {
  const organizationId = uuidOrNull(input && input.organizationId);
  const folderId = uuidOrNull(input && input.folderId);
  if (!organizationId || !folderId) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }
  const { rows } = await db.query(
    `DELETE FROM platform.media_folders
      WHERE id = $1 AND organization_id = $2
      RETURNING id`,
    [folderId, organizationId]
  );
  if (!rows.length) return { ok: false, code: RESULT.FOLDER_NOT_FOUND };
  return { ok: true, folderId: rows[0].id };
}

/**
 * File one asset into a folder, or into Unfiled when folderId is null.
 *
 * The UPDATE is constrained by the product's own tenant column, and the folder
 * is verified to belong to the same organization before the write. The database
 * triggers enforce the same rule independently.
 *
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{ product: string, scopeId: string, mediaId: string, folderId: string|null }} input
 */
async function moveMediaToFolder(db, input) {
  const source = sourceFor(input && input.product);
  if (!source) return { ok: false, code: RESULT.UNSUPPORTED_PRODUCT };

  const scopeId = uuidOrNull(input && input.scopeId);
  const mediaId = uuidOrNull(input && input.mediaId);
  if (!scopeId || !mediaId) return { ok: false, code: RESULT.INVALID_INPUT };

  const rawFolder = input && input.folderId;
  const wantsUnfiled =
    rawFolder == null || rawFolder === "" || String(rawFolder).trim().toLowerCase() === UNFILED_KEY;
  const folderId = wantsUnfiled ? null : uuidOrNull(rawFolder);
  if (!wantsUnfiled && !folderId) return { ok: false, code: RESULT.INVALID_INPUT };

  if (folderId) {
    const resolved = await resolveOrganizationId(db, {
      product: input.product,
      scopeId,
    });
    if (!resolved.ok) return { ok: false, code: resolved.code };
    const folder = await getFolder(db, {
      organizationId: resolved.organizationId,
      folderId,
    });
    if (!folder.ok) {
      // A folder owned by another tenant is reported as not found, so the
      // response cannot be used to probe for other tenants' folder ids.
      return { ok: false, code: RESULT.FOLDER_NOT_FOUND };
    }
  }

  const { rows } = await db.query(
    `UPDATE ${source.table}
        SET folder_id = $3
      WHERE id = $1 AND ${source.scopeColumn} = $2
      RETURNING id, folder_id`,
    [mediaId, scopeId, folderId]
  );
  if (!rows.length) return { ok: false, code: RESULT.MEDIA_NOT_FOUND };
  return { ok: true, mediaId: rows[0].id, folderId: rows[0].folder_id };
}

/**
 * Active asset counts per folder, plus the Unfiled and All totals, for the
 * folder chips in the shared library UI.
 *
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{ product: string, scopeId: string }} input
 */
async function folderCounts(db, input) {
  const source = sourceFor(input && input.product);
  if (!source) return { ok: false, code: RESULT.UNSUPPORTED_PRODUCT, counts: {} };
  const scopeId = uuidOrNull(input && input.scopeId);
  if (!scopeId) return { ok: false, code: RESULT.INVALID_INPUT, counts: {} };

  const { rows } = await db.query(
    `SELECT folder_id, count(*)::int AS total
       FROM ${source.table}
      WHERE ${source.scopeColumn} = $1 AND status = 'active'
      GROUP BY folder_id`,
    [scopeId]
  );

  const counts = { [ALL_KEY]: 0, [UNFILED_KEY]: 0 };
  for (const row of rows) {
    counts[ALL_KEY] += row.total;
    if (row.folder_id == null) counts[UNFILED_KEY] += row.total;
    else counts[row.folder_id] = row.total;
  }
  return { ok: true, counts };
}

/**
 * Everything a product route needs to render the folder rail in one call.
 *
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{ product: string, scopeId: string, organizationId?: string }} input
 */
async function loadFolderContext(db, input) {
  const resolved = await resolveOrganizationId(db, input);
  if (!resolved.ok) return { ok: false, code: resolved.code, folders: [], counts: {} };
  const [listed, counted] = await Promise.all([
    listFolders(db, { organizationId: resolved.organizationId }),
    folderCounts(db, input),
  ]);
  return {
    ok: true,
    organizationId: resolved.organizationId,
    folders: listed.folders || [],
    counts: counted.counts || {},
  };
}

module.exports = {
  RESULT,
  MAX_NAME_LENGTH,
  MAX_FOLDERS_PER_ORGANIZATION,
  UNFILED_KEY,
  ALL_KEY,
  PRODUCT_SOURCES,
  normalizeFolderName,
  resolveOrganizationId,
  listFolders,
  getFolder,
  createFolder,
  renameFolder,
  deleteFolder,
  moveMediaToFolder,
  folderCounts,
  loadFolderContext,
};
