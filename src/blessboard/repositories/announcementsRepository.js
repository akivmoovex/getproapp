"use strict";

/**
 * BlessBoard V5 announcements repository (SQL only; callers own transactions).
 */

const ANNOUNCEMENT_COLS = `id, church_id, branch_id, title, body, status,
  is_pinned, is_featured, featured_until, action_url, action_label,
  published_at, created_by_user_id, created_at, updated_at`;

/**
 * @param {object|null} row
 */
function mapAnnouncement(row) {
  if (!row) return null;
  return {
    id: row.id,
    churchId: row.church_id,
    branchId: row.branch_id,
    title: row.title,
    body: row.body,
    status: row.status,
    isPinned: Boolean(row.is_pinned),
    isFeatured: Boolean(row.is_featured),
    featuredUntil: row.featured_until || null,
    actionUrl: row.action_url || null,
    actionLabel: row.action_label || null,
    publishedAt: row.published_at || null,
    createdByUserId: row.created_by_user_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * @param {object|null} row
 */
function mapAudience(row) {
  if (!row) return null;
  return {
    id: row.id,
    announcementId: row.announcement_id,
    audienceKey: row.audience_key,
    createdAt: row.created_at,
  };
}

/**
 * @param {object|null} row
 */
function mapRead(row) {
  if (!row) return null;
  return {
    id: row.id,
    churchId: row.church_id,
    announcementId: row.announcement_id,
    memberId: row.member_id,
    firstSeenAt: row.first_seen_at,
    readAt: row.read_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * @param {object|null} row
 */
function mapAttachment(row) {
  if (!row) return null;
  return {
    id: row.id,
    announcementId: row.announcement_id,
    mediaAssetId: row.media_asset_id,
    sortOrder: Number(row.sort_order),
    createdAt: row.created_at,
    originalFilename: row.original_filename || null,
    mimeType: row.mime_type || null,
    mediaStatus: row.media_status || null,
  };
}

/**
 * @param {{ query: Function }} client
 * @param {string} id
 */
async function findAnnouncementById(client, id) {
  const { rows } = await client.query(
    `SELECT ${ANNOUNCEMENT_COLS}
       FROM blessboard.announcements
      WHERE id = $1`,
    [id]
  );
  return mapAnnouncement(rows[0] || null);
}

/**
 * @param {{ query: Function }} client
 * @param {{
 *   churchId: string,
 *   branchId?: string|null,
 *   status?: string|null,
 *   limit?: number,
 *   offset?: number,
 * }} opts
 */
async function listAnnouncements(client, opts) {
  const params = [opts.churchId];
  let where = `church_id = $1`;
  if (opts.branchId === null) {
    where += ` AND branch_id IS NULL`;
  } else if (opts.branchId) {
    params.push(opts.branchId);
    where += ` AND branch_id = $${params.length}`;
  }
  if (opts.status) {
    params.push(opts.status);
    where += ` AND status = $${params.length}`;
  }
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 100);
  const offset = Math.max(Number(opts.offset) || 0, 0);
  params.push(limit, offset);
  const { rows } = await client.query(
    `SELECT ${ANNOUNCEMENT_COLS}
       FROM blessboard.announcements
      WHERE ${where}
      ORDER BY is_pinned DESC, published_at DESC NULLS LAST, updated_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows.map(mapAnnouncement);
}

/**
 * Member feed: published + members audience + church-wide or matching branch.
 * @param {{ query: Function }} client
 * @param {{ churchId: string, branchId: string, memberId: string, limit?: number, offset?: number }} opts
 */
async function listMemberAnnouncements(client, opts) {
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 100);
  const offset = Math.max(Number(opts.offset) || 0, 0);
  const { rows } = await client.query(
    `SELECT a.id, a.church_id, a.branch_id, a.title, a.body, a.status,
            a.is_pinned, a.is_featured, a.featured_until, a.action_url, a.action_label,
            a.published_at, a.created_by_user_id, a.created_at, a.updated_at,
            r.first_seen_at AS read_first_seen_at,
            r.read_at AS read_read_at
       FROM blessboard.announcements a
       INNER JOIN blessboard.announcement_audiences aud
         ON aud.announcement_id = a.id AND aud.audience_key = 'members'
       LEFT JOIN blessboard.announcement_reads r
         ON r.announcement_id = a.id AND r.member_id = $3
      WHERE a.church_id = $1
        AND a.status = 'published'
        AND (a.branch_id IS NULL OR a.branch_id = $2)
      ORDER BY a.is_pinned DESC, a.published_at DESC NULLS LAST, a.created_at DESC
      LIMIT $4 OFFSET $5`,
    [opts.churchId, opts.branchId, opts.memberId, limit, offset]
  );
  return rows.map((row) => ({
    ...mapAnnouncement(row),
    firstSeenAt: row.read_first_seen_at || null,
    readAt: row.read_read_at || null,
    isUnread: !row.read_read_at,
  }));
}

/**
 * @param {{ query: Function }} client
 * @param {object} fields
 */
async function insertAnnouncement(client, fields) {
  const { rows } = await client.query(
    `INSERT INTO blessboard.announcements
       (church_id, branch_id, title, body, status, is_pinned, is_featured,
        featured_until, action_url, action_label, published_at, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING ${ANNOUNCEMENT_COLS}`,
    [
      fields.churchId,
      fields.branchId,
      fields.title,
      fields.body,
      fields.status || "draft",
      Boolean(fields.isPinned),
      Boolean(fields.isFeatured),
      fields.featuredUntil || null,
      fields.actionUrl || null,
      fields.actionLabel || null,
      fields.publishedAt || null,
      fields.createdByUserId || null,
    ]
  );
  return mapAnnouncement(rows[0]);
}

/**
 * @param {{ query: Function }} client
 * @param {string} id
 * @param {object} patch
 * @returns {Promise<{ item: object|null, conflict: boolean }>}
 */
async function updateAnnouncement(client, id, patch) {
  const params = [
    id,
    patch.title != null ? patch.title : null,
    patch.body != null ? patch.body : null,
    patch.status != null ? patch.status : null,
    patch.isPinned != null ? Boolean(patch.isPinned) : null,
    patch.isFeatured != null ? Boolean(patch.isFeatured) : null,
    patch.featuredUntil !== undefined ? patch.featuredUntil : null,
    patch.clearFeaturedUntil === true,
    patch.actionUrl !== undefined ? patch.actionUrl : null,
    patch.clearAction === true,
    patch.actionLabel !== undefined ? patch.actionLabel : null,
    patch.publishedAt !== undefined ? patch.publishedAt : null,
    patch.setPublishedAtNow === true,
  ];
  let where = "id = $1";
  if (patch.expectedUpdatedAt != null) {
    params.push(patch.expectedUpdatedAt);
    where += ` AND date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $${params.length}::timestamptz)`;
  }
  const { rows } = await client.query(
    `UPDATE blessboard.announcements
        SET title = COALESCE($2, title),
            body = COALESCE($3, body),
            status = COALESCE($4, status),
            is_pinned = COALESCE($5, is_pinned),
            is_featured = COALESCE($6, is_featured),
            featured_until = CASE
              WHEN $8::boolean THEN NULL
              WHEN $7::timestamptz IS NOT NULL THEN $7::timestamptz
              ELSE featured_until
            END,
            action_url = CASE
              WHEN $10::boolean THEN NULL
              WHEN $9::text IS NOT NULL THEN $9
              ELSE action_url
            END,
            action_label = CASE
              WHEN $10::boolean THEN NULL
              WHEN $11::text IS NOT NULL THEN $11
              ELSE action_label
            END,
            published_at = CASE
              WHEN $13::boolean THEN COALESCE(published_at, now())
              WHEN $12::timestamptz IS NOT NULL THEN $12::timestamptz
              ELSE published_at
            END,
            updated_at = now()
      WHERE ${where}
      RETURNING ${ANNOUNCEMENT_COLS}`,
    params
  );
  if (rows[0]) return { item: mapAnnouncement(rows[0]), conflict: false };
  if (patch.expectedUpdatedAt != null) {
    const existing = await findAnnouncementById(client, id);
    if (existing) return { item: null, conflict: true };
  }
  return { item: null, conflict: false };
}

/**
 * @param {{ query: Function }} client
 * @param {string} announcementId
 */
async function listAudiences(client, announcementId) {
  const { rows } = await client.query(
    `SELECT id, announcement_id, audience_key, created_at
       FROM blessboard.announcement_audiences
      WHERE announcement_id = $1
      ORDER BY audience_key ASC`,
    [announcementId]
  );
  return rows.map(mapAudience);
}

/**
 * Replace audience set for an announcement.
 * @param {{ query: Function }} client
 * @param {string} announcementId
 * @param {string[]} audienceKeys
 */
async function replaceAudiences(client, announcementId, audienceKeys) {
  await client.query(
    `DELETE FROM blessboard.announcement_audiences WHERE announcement_id = $1`,
    [announcementId]
  );
  const unique = [...new Set((audienceKeys || []).map((k) => String(k)))];
  const out = [];
  for (const key of unique) {
    const { rows } = await client.query(
      `INSERT INTO blessboard.announcement_audiences (announcement_id, audience_key)
       VALUES ($1, $2)
       RETURNING id, announcement_id, audience_key, created_at`,
      [announcementId, key]
    );
    out.push(mapAudience(rows[0]));
  }
  return out;
}

/**
 * @param {{ query: Function }} client
 * @param {string} announcementId
 */
async function listAttachments(client, announcementId) {
  const { rows } = await client.query(
    `SELECT att.id, att.announcement_id, att.media_asset_id, att.sort_order, att.created_at,
            m.original_filename, m.mime_type, m.status AS media_status
       FROM blessboard.announcement_attachments att
       INNER JOIN blessboard.media_assets m ON m.id = att.media_asset_id
      WHERE att.announcement_id = $1
      ORDER BY att.sort_order ASC, att.created_at ASC`,
    [announcementId]
  );
  return rows.map(mapAttachment);
}

/**
 * @param {{ query: Function }} client
 * @param {{ announcementId: string, mediaAssetId: string, sortOrder?: number }} fields
 */
async function insertAttachment(client, fields) {
  const { rows } = await client.query(
    `INSERT INTO blessboard.announcement_attachments
       (announcement_id, media_asset_id, sort_order)
     VALUES ($1, $2, $3)
     RETURNING id, announcement_id, media_asset_id, sort_order, created_at`,
    [fields.announcementId, fields.mediaAssetId, fields.sortOrder != null ? fields.sortOrder : 0]
  );
  return mapAttachment(rows[0]);
}

/**
 * @param {{ query: Function }} client
 * @param {{ announcementId: string, attachmentId: string }} input
 */
async function deleteAttachment(client, input) {
  const { rowCount } = await client.query(
    `DELETE FROM blessboard.announcement_attachments
      WHERE id = $1 AND announcement_id = $2`,
    [input.attachmentId, input.announcementId]
  );
  return rowCount > 0;
}

/**
 * Upsert first_seen / mark read.
 * @param {{ query: Function }} client
 * @param {{ churchId: string, announcementId: string, memberId: string, markRead?: boolean }} input
 */
async function upsertAnnouncementRead(client, input) {
  const markRead = input.markRead !== false;
  const { rows } = await client.query(
    `INSERT INTO blessboard.announcement_reads
       (church_id, announcement_id, member_id, first_seen_at, read_at)
     VALUES ($1, $2, $3, now(), CASE WHEN $4 THEN now() ELSE NULL END)
     ON CONFLICT (member_id, announcement_id)
     DO UPDATE SET
       first_seen_at = COALESCE(blessboard.announcement_reads.first_seen_at, now()),
       read_at = CASE
         WHEN $4 THEN COALESCE(blessboard.announcement_reads.read_at, now())
         ELSE blessboard.announcement_reads.read_at
       END,
       updated_at = now()
     RETURNING id, church_id, announcement_id, member_id, first_seen_at, read_at, created_at, updated_at`,
    [input.churchId, input.announcementId, input.memberId, markRead]
  );
  return mapRead(rows[0]);
}

/**
 * Eligible active members for delivery count (members audience).
 * Church-wide: any active membership in church. Branch: active membership on that branch.
 * @param {{ query: Function }} client
 * @param {{ churchId: string, branchId: string|null }} opts
 */
async function countEligibleMembers(client, opts) {
  if (opts.branchId) {
    const { rows } = await client.query(
      `SELECT COUNT(DISTINCT m.id)::int AS n
         FROM blessboard.members m
         INNER JOIN blessboard.member_branch_memberships mb
           ON mb.member_id = m.id
        WHERE m.church_id = $1
          AND m.status = 'active'
          AND mb.branch_id = $2
          AND mb.membership_status = 'active'`,
      [opts.churchId, opts.branchId]
    );
    return Number(rows[0] && rows[0].n) || 0;
  }
  const { rows } = await client.query(
    `SELECT COUNT(DISTINCT m.id)::int AS n
       FROM blessboard.members m
       INNER JOIN blessboard.member_branch_memberships mb
         ON mb.member_id = m.id
      WHERE m.church_id = $1
        AND m.status = 'active'
        AND mb.membership_status = 'active'`,
    [opts.churchId]
  );
  return Number(rows[0] && rows[0].n) || 0;
}

/**
 * @param {{ query: Function }} client
 * @param {string} announcementId
 */
async function countReads(client, announcementId) {
  const { rows } = await client.query(
    `SELECT
        COUNT(*) FILTER (WHERE first_seen_at IS NOT NULL)::int AS seen_count,
        COUNT(*) FILTER (WHERE read_at IS NOT NULL)::int AS read_count
       FROM blessboard.announcement_reads
      WHERE announcement_id = $1`,
    [announcementId]
  );
  return {
    seenCount: Number(rows[0] && rows[0].seen_count) || 0,
    readCount: Number(rows[0] && rows[0].read_count) || 0,
  };
}

/**
 * @param {{ query: Function }} client
 * @param {string} churchId
 */
async function findChurchStatus(client, churchId) {
  const { rows } = await client.query(
    `SELECT id, status FROM blessboard.churches WHERE id = $1`,
    [churchId]
  );
  return rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {string} branchId
 */
async function findBranchScope(client, branchId) {
  const { rows } = await client.query(
    `SELECT id, church_id, status, branch_key, display_name
       FROM blessboard.branches
      WHERE id = $1`,
    [branchId]
  );
  return rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {string} mediaAssetId
 */
async function findMediaAssetMeta(client, mediaAssetId) {
  const { rows } = await client.query(
    `SELECT id, church_id, status
       FROM blessboard.media_assets
      WHERE id = $1`,
    [mediaAssetId]
  );
  return rows[0] || null;
}

module.exports = {
  mapAnnouncement,
  mapAudience,
  mapRead,
  mapAttachment,
  findAnnouncementById,
  listAnnouncements,
  listMemberAnnouncements,
  insertAnnouncement,
  updateAnnouncement,
  listAudiences,
  replaceAudiences,
  listAttachments,
  insertAttachment,
  deleteAttachment,
  upsertAnnouncementRead,
  countEligibleMembers,
  countReads,
  findChurchStatus,
  findBranchScope,
  findMediaAssetMeta,
};
