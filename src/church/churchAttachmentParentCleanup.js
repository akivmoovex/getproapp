"use strict";

/**
 * Parent-row deletion helpers that unlink church attachment files after DB delete.
 * Production routes archive (status change) and do not hard-delete parents.
 * These helpers exist for authorized hard-delete / test cleanup so cascade does not orphan files.
 */

const broadcastAttachmentsRepo = require("../db/pg/church/broadcastAttachmentsRepo");
const {
  unlinkStoredFilename,
  unlinkAnnouncementStoredFilename,
} = require("./hqBroadcastUploads");

function safeUnlinkAnnouncement(storedFilename) {
  try {
    unlinkAnnouncementStoredFilename(storedFilename);
    return true;
  } catch (err) {
    console.warn("[church] announcement attachment cleanup failed after parent delete", {
      code: err && err.code ? String(err.code) : "unknown",
    });
    return false;
  }
}

function safeUnlinkBroadcast(storedFilename) {
  try {
    unlinkStoredFilename(storedFilename);
    return true;
  } catch (err) {
    console.warn("[church] broadcast attachment cleanup failed after parent delete", {
      code: err && err.code ? String(err.code) : "unknown",
    });
    return false;
  }
}

/**
 * Load announcement attachments, delete the announcement row (cascade removes attachment rows),
 * then unlink stored files. Missing files are non-fatal.
 * @returns {Promise<{ deleted: boolean, attachmentCount: number, filesUnlinked: number }>}
 */
async function deleteAnnouncementWithAttachmentFiles(pool, announcementId, branchId) {
  const id = Number(announcementId);
  const bid = Number(branchId);
  if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(bid) || bid <= 0) {
    return { deleted: false, attachmentCount: 0, filesUnlinked: 0 };
  }

  const attachments = await broadcastAttachmentsRepo.listAttachmentsForAnnouncement(pool, id, bid);
  const r = await pool.query(
    `DELETE FROM public.church_announcements
     WHERE id = $1 AND branch_id = $2
     RETURNING id`,
    [id, bid]
  );
  if (!r.rows[0]) {
    return { deleted: false, attachmentCount: attachments.length, filesUnlinked: 0 };
  }

  let filesUnlinked = 0;
  for (const row of attachments) {
    if (row && row.stored_filename && safeUnlinkAnnouncement(row.stored_filename)) {
      filesUnlinked += 1;
    }
  }
  return { deleted: true, attachmentCount: attachments.length, filesUnlinked };
}

/**
 * Load broadcast attachments, delete the broadcast row (cascade removes attachment/target rows),
 * then unlink stored files. Missing files are non-fatal.
 * @returns {Promise<{ deleted: boolean, attachmentCount: number, filesUnlinked: number }>}
 */
async function deleteBroadcastWithAttachmentFiles(pool, broadcastId, organizationId) {
  const id = Number(broadcastId);
  const orgId = Number(organizationId);
  if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(orgId) || orgId <= 0) {
    return { deleted: false, attachmentCount: 0, filesUnlinked: 0 };
  }

  const attachments = await broadcastAttachmentsRepo.listAttachmentsForBroadcast(pool, id, orgId);
  const r = await pool.query(
    `DELETE FROM public.church_hq_broadcasts
     WHERE id = $1 AND organization_id = $2
     RETURNING id`,
    [id, orgId]
  );
  if (!r.rows[0]) {
    return { deleted: false, attachmentCount: attachments.length, filesUnlinked: 0 };
  }

  let filesUnlinked = 0;
  for (const row of attachments) {
    if (row && row.stored_filename && safeUnlinkBroadcast(row.stored_filename)) {
      filesUnlinked += 1;
    }
  }
  return { deleted: true, attachmentCount: attachments.length, filesUnlinked };
}

/**
 * Unlink files for attachment rows already loaded (e.g. after cascade delete elsewhere).
 */
function unlinkLoadedAnnouncementAttachmentFiles(attachments) {
  let filesUnlinked = 0;
  for (const row of attachments || []) {
    if (row && row.stored_filename && safeUnlinkAnnouncement(row.stored_filename)) {
      filesUnlinked += 1;
    }
  }
  return filesUnlinked;
}

function unlinkLoadedBroadcastAttachmentFiles(attachments) {
  let filesUnlinked = 0;
  for (const row of attachments || []) {
    if (row && row.stored_filename && safeUnlinkBroadcast(row.stored_filename)) {
      filesUnlinked += 1;
    }
  }
  return filesUnlinked;
}

module.exports = {
  deleteAnnouncementWithAttachmentFiles,
  deleteBroadcastWithAttachmentFiles,
  unlinkLoadedAnnouncementAttachmentFiles,
  unlinkLoadedBroadcastAttachmentFiles,
};
