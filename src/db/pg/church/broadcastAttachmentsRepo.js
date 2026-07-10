"use strict";

/**
 * HQ broadcast and branch announcement file attachments.
 * Stores relative stored_filename only — never absolute server paths.
 */

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_ITEM = 5;

async function listAttachmentsForBroadcast(pool, broadcastId, organizationId) {
  const r = await pool.query(
    `SELECT id, organization_id, broadcast_id, original_filename, stored_filename,
            mime_type, file_size, COALESCE(download_count, 0)::int AS download_count,
            created_by_hq_admin_id, created_at
     FROM public.church_hq_broadcast_attachments
     WHERE broadcast_id = $1 AND organization_id = $2
     ORDER BY id ASC`,
    [broadcastId, organizationId]
  );
  return r.rows;
}

async function listAttachmentsForAnnouncement(pool, announcementId, branchId) {
  const r = await pool.query(
    `SELECT id, organization_id, branch_id, announcement_id, original_filename, stored_filename,
            mime_type, file_size, created_by_admin_id, created_at
     FROM public.church_announcement_attachments
     WHERE announcement_id = $1 AND branch_id = $2
     ORDER BY id ASC`,
    [announcementId, branchId]
  );
  return r.rows;
}

async function countAttachmentsForBroadcast(pool, broadcastId, organizationId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM public.church_hq_broadcast_attachments
     WHERE broadcast_id = $1 AND organization_id = $2`,
    [broadcastId, organizationId]
  );
  return r.rows[0] ? r.rows[0].count : 0;
}

async function countAttachmentsForAnnouncement(pool, announcementId, branchId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM public.church_announcement_attachments
     WHERE announcement_id = $1 AND branch_id = $2`,
    [announcementId, branchId]
  );
  return r.rows[0] ? r.rows[0].count : 0;
}

/**
 * @param {object} fields
 * @returns {Promise<object>}
 */
async function createBroadcastAttachment(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_hq_broadcast_attachments (
       organization_id, broadcast_id, original_filename, stored_filename,
       mime_type, file_size, created_by_hq_admin_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      fields.organization_id,
      fields.broadcast_id,
      fields.original_filename,
      fields.stored_filename,
      fields.mime_type,
      fields.file_size,
      fields.created_by_hq_admin_id || null,
    ]
  );
  return r.rows[0];
}

/**
 * @param {object} fields
 * @returns {Promise<object>}
 */
async function createAnnouncementAttachment(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_announcement_attachments (
       organization_id, branch_id, announcement_id, original_filename, stored_filename,
       mime_type, file_size, created_by_admin_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.announcement_id,
      fields.original_filename,
      fields.stored_filename,
      fields.mime_type,
      fields.file_size,
      fields.created_by_admin_id || null,
    ]
  );
  return r.rows[0];
}

async function findBroadcastAttachmentById(pool, attachmentId, organizationId) {
  const r = await pool.query(
    `SELECT *
     FROM public.church_hq_broadcast_attachments
     WHERE id = $1 AND organization_id = $2
     LIMIT 1`,
    [attachmentId, organizationId]
  );
  return r.rows[0] ?? null;
}

async function findAnnouncementAttachmentById(pool, attachmentId, branchId) {
  const r = await pool.query(
    `SELECT *
     FROM public.church_announcement_attachments
     WHERE id = $1 AND branch_id = $2
     LIMIT 1`,
    [attachmentId, branchId]
  );
  return r.rows[0] ?? null;
}

async function deleteBroadcastAttachment(pool, attachmentId, organizationId) {
  const r = await pool.query(
    `DELETE FROM public.church_hq_broadcast_attachments
     WHERE id = $1 AND organization_id = $2
     RETURNING id, stored_filename`,
    [attachmentId, organizationId]
  );
  return r.rows[0] ?? null;
}

async function deleteAnnouncementAttachment(pool, attachmentId, branchId) {
  const r = await pool.query(
    `DELETE FROM public.church_announcement_attachments
     WHERE id = $1 AND branch_id = $2
     RETURNING id, stored_filename`,
    [attachmentId, branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * Increment member download counter for an HQ broadcast attachment.
 * @returns {Promise<object | null>}
 */
async function incrementBroadcastAttachmentDownloadCount(pool, attachmentId, organizationId) {
  const r = await pool.query(
    `UPDATE public.church_hq_broadcast_attachments
     SET download_count = COALESCE(download_count, 0) + 1
     WHERE id = $1 AND organization_id = $2
     RETURNING id, download_count`,
    [attachmentId, organizationId]
  );
  return r.rows[0] ?? null;
}

/**
 * Sum of member download counts for all attachments on a broadcast.
 * @returns {Promise<number>}
 */
async function sumDownloadCountsForBroadcast(pool, broadcastId, organizationId) {
  const r = await pool.query(
    `SELECT COALESCE(SUM(COALESCE(download_count, 0)), 0)::int AS total
     FROM public.church_hq_broadcast_attachments
     WHERE broadcast_id = $1 AND organization_id = $2`,
    [broadcastId, organizationId]
  );
  return r.rows[0] ? r.rows[0].total : 0;
}

module.exports = {
  ALLOWED_MIME_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_ITEM,
  listAttachmentsForBroadcast,
  listAttachmentsForAnnouncement,
  countAttachmentsForBroadcast,
  countAttachmentsForAnnouncement,
  createBroadcastAttachment,
  createAnnouncementAttachment,
  findBroadcastAttachmentById,
  findAnnouncementAttachmentById,
  deleteBroadcastAttachment,
  deleteAnnouncementAttachment,
  incrementBroadcastAttachmentDownloadCount,
  sumDownloadCountsForBroadcast,
};
