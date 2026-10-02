"use strict";

/**
 * Shared tenant announcements repository (AN01–AN05).
 */

const ANN_COLS = `
  id, organization_id, product_code, title, body, status, timezone,
  starts_at, ends_at, published_at, unpublished_at, media_asset_ref, media_url,
  branch_id, facility_id, created_by_identity_id, updated_by_identity_id,
  created_at, updated_at
`;

function mapAnnouncement(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    productCode: row.product_code,
    title: row.title,
    body: row.body,
    status: row.status,
    timezone: row.timezone || "UTC",
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || null,
    publishedAt: row.published_at || null,
    unpublishedAt: row.unpublished_at || null,
    mediaAssetRef: row.media_asset_ref || null,
    mediaUrl: row.media_url || null,
    branchId: row.branch_id || null,
    facilityId: row.facility_id || null,
    createdByIdentityId: row.created_by_identity_id || null,
    updatedByIdentityId: row.updated_by_identity_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    announcementId: row.announcement_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    eventCode: row.event_code,
    summary: row.summary,
    actorIdentityId: row.actor_identity_id,
    createdAt: row.created_at,
  };
}

async function insertAnnouncement(client, row) {
  const { rows } = await client.query(
    `INSERT INTO platform.tenant_announcements (
       organization_id, product_code, title, body, status, timezone,
       starts_at, ends_at, published_at, media_asset_ref, media_url,
       branch_id, facility_id, created_by_identity_id, updated_by_identity_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)
     RETURNING ${ANN_COLS}`,
    [
      row.organizationId,
      row.productCode,
      row.title,
      row.body,
      row.status || "draft",
      row.timezone || "UTC",
      row.startsAt || null,
      row.endsAt || null,
      row.publishedAt || null,
      row.mediaAssetRef || null,
      row.mediaUrl || null,
      row.branchId || null,
      row.facilityId || null,
      row.createdByIdentityId || null,
    ]
  );
  return mapAnnouncement(rows[0]);
}

async function updateAnnouncement(client, input) {
  const { rows } = await client.query(
    `UPDATE platform.tenant_announcements SET
       title = COALESCE($4, title),
       body = COALESCE($5, body),
       status = COALESCE($6, status),
       timezone = COALESCE($7, timezone),
       starts_at = CASE WHEN $8::boolean THEN $9 ELSE starts_at END,
       ends_at = CASE WHEN $10::boolean THEN $11 ELSE ends_at END,
       published_at = CASE WHEN $12::boolean THEN $13 ELSE published_at END,
       unpublished_at = CASE WHEN $14::boolean THEN $15 ELSE unpublished_at END,
       media_asset_ref = CASE WHEN $16::boolean THEN $17 ELSE media_asset_ref END,
       media_url = CASE WHEN $18::boolean THEN $19 ELSE media_url END,
       updated_by_identity_id = $20,
       updated_at = now()
     WHERE id = $1 AND organization_id = $2 AND product_code = $3
     RETURNING ${ANN_COLS}`,
    [
      input.id,
      input.organizationId,
      input.productCode,
      input.title != null ? input.title : null,
      input.body != null ? input.body : null,
      input.status != null ? input.status : null,
      input.timezone != null ? input.timezone : null,
      input.setStartsAt === true,
      input.startsAt !== undefined ? input.startsAt : null,
      input.setEndsAt === true,
      input.endsAt !== undefined ? input.endsAt : null,
      input.setPublishedAt === true,
      input.publishedAt || null,
      input.setUnpublishedAt === true,
      input.unpublishedAt || null,
      input.setMediaAssetRef === true,
      input.mediaAssetRef !== undefined ? input.mediaAssetRef : null,
      input.setMediaUrl === true,
      input.mediaUrl !== undefined ? input.mediaUrl : null,
      input.updatedByIdentityId || null,
    ]
  );
  return mapAnnouncement(rows[0] || null);
}

async function getAnnouncementById(client, { id, organizationId, productCode }) {
  const { rows } = await client.query(
    `SELECT ${ANN_COLS} FROM platform.tenant_announcements
      WHERE id = $1 AND organization_id = $2 AND product_code = $3 LIMIT 1`,
    [id, organizationId, productCode]
  );
  return mapAnnouncement(rows[0] || null);
}

async function listAnnouncements(client, { organizationId, productCode, status, limit }) {
  const params = [organizationId, productCode];
  let sql = `SELECT ${ANN_COLS} FROM platform.tenant_announcements
              WHERE organization_id = $1 AND product_code = $2`;
  if (status) {
    params.push(status);
    sql += ` AND status = $${params.length}`;
  }
  params.push(Math.min(Number(limit) || 50, 200));
  sql += ` ORDER BY updated_at DESC LIMIT $${params.length}`;
  const { rows } = await client.query(sql, params);
  return rows.map(mapAnnouncement);
}

async function insertEvent(client, fields) {
  const { rows } = await client.query(
    `INSERT INTO platform.tenant_announcement_events (
       announcement_id, organization_id, product_code, from_status, to_status,
       event_code, summary, actor_identity_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, announcement_id, from_status, to_status, event_code, summary,
               actor_identity_id, created_at`,
    [
      fields.announcementId,
      fields.organizationId,
      fields.productCode,
      fields.fromStatus || null,
      fields.toStatus,
      fields.eventCode,
      fields.summary || null,
      fields.actorIdentityId || null,
    ]
  );
  return mapEvent(rows[0]);
}

async function listEvents(client, { announcementId, organizationId }) {
  const { rows } = await client.query(
    `SELECT id, announcement_id, from_status, to_status, event_code, summary,
            actor_identity_id, created_at
       FROM platform.tenant_announcement_events
      WHERE announcement_id = $1 AND organization_id = $2
      ORDER BY created_at ASC`,
    [announcementId, organizationId]
  );
  return rows.map(mapEvent);
}

module.exports = {
  insertAnnouncement,
  updateAnnouncement,
  getAnnouncementById,
  listAnnouncements,
  insertEvent,
  listEvents,
  mapAnnouncement,
};
