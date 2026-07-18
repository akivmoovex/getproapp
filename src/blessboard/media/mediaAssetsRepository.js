"use strict";

/**
 * blessboard.media_assets metadata repository (no binary data).
 */

/**
 * @param {object} row
 */
function mapAsset(row) {
  if (!row) return null;
  return {
    id: row.id,
    churchId: row.church_id,
    branchId: row.branch_id,
    uploadedByUserId: row.uploaded_by_user_id,
    storageBucket: row.storage_bucket,
    storageKey: row.storage_key,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    sha256: row.sha256,
    visibility: row.visibility,
    status: row.status,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
  };
}

const ASSET_COLS = `id, church_id, branch_id, uploaded_by_user_id, storage_bucket, storage_key,
                    original_filename, mime_type, size_bytes, sha256, visibility, status,
                    created_at, archived_at`;

/**
 * @param {{ query: Function }} db
 * @param {string} id
 */
async function findMediaAssetById(db, id) {
  const { rows } = await db.query(
    `SELECT ${ASSET_COLS} FROM blessboard.media_assets WHERE id = $1`,
    [id]
  );
  return mapAsset(rows[0] || null);
}

/**
 * Active asset with same content hash within a church (dedupe).
 * @param {{ query: Function }} db
 * @param {{ churchId: string, sha256: string }} input
 */
async function findActiveByChurchSha256(db, input) {
  const { rows } = await db.query(
    `SELECT ${ASSET_COLS}
       FROM blessboard.media_assets
      WHERE church_id = $1
        AND sha256 = $2
        AND status = 'active'
      ORDER BY created_at ASC
      LIMIT 1`,
    [input.churchId, input.sha256]
  );
  return mapAsset(rows[0] || null);
}

/**
 * @param {{ query: Function }} db
 * @param {object} input
 */
async function insertMediaAsset(db, input) {
  const { rows } = await db.query(
    `INSERT INTO blessboard.media_assets
       (church_id, branch_id, uploaded_by_user_id, storage_bucket, storage_key,
        original_filename, mime_type, size_bytes, sha256, visibility, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active')
     RETURNING ${ASSET_COLS}`,
    [
      input.churchId,
      input.branchId || null,
      input.uploadedByUserId,
      input.storageBucket,
      input.storageKey,
      input.originalFilename,
      input.mimeType,
      input.sizeBytes,
      input.sha256,
      input.visibility,
    ]
  );
  return mapAsset(rows[0]);
}

/**
 * @param {{ query: Function }} db
 * @param {{ id: string, churchId: string }} input
 */
async function archiveMediaAsset(db, input) {
  const { rows } = await db.query(
    `UPDATE blessboard.media_assets
        SET status = 'archived',
            archived_at = now()
      WHERE id = $1
        AND church_id = $2
        AND status = 'active'
      RETURNING ${ASSET_COLS}`,
    [input.id, input.churchId]
  );
  return mapAsset(rows[0] || null);
}

module.exports = {
  mapAsset,
  findMediaAssetById,
  findActiveByChurchSha256,
  insertMediaAsset,
  archiveMediaAsset,
};
