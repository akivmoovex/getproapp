"use strict";

/**
 * Phase3 website publication version snapshots.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

function mapVersion(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    churchId: row.church_id,
    versionNumber: Number(row.version_number),
    status: row.status,
    themeKey: row.theme_key,
    sourceType: row.source_type,
    sourceSubmissionId: row.source_submission_id,
    snapshot: row.snapshot_json || {},
    changeSummary: row.change_summary_json || {},
    createdBy: row.created_by,
    createdByName: row.created_by_name || null,
    createdAt: row.created_at,
    publishedBy: row.published_by,
    publishedByName: row.published_by_name || null,
    publishedAt: row.published_at,
    supersededAt: row.superseded_at,
  };
}

const LIST_SELECT = `
  SELECT
    v.*,
    cu.display_name AS created_by_name,
    pu.display_name AS published_by_name
  FROM blessboard.website_publication_versions v
  LEFT JOIN blessboard.users cu ON cu.id = v.created_by
  LEFT JOIN blessboard.users pu ON pu.id = v.published_by
`;

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {string} organizationId
 */
async function getNextVersionNumber(db, organizationId) {
  if (!isUuid(organizationId)) return 1;
  const res = await db.query(
    `SELECT COALESCE(MAX(version_number), 0)::int + 1 AS n
       FROM blessboard.website_publication_versions
      WHERE organization_id = $1`,
    [organizationId]
  );
  return Number(res.rows[0] && res.rows[0].n) || 1;
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {string} organizationId
 */
async function supersedePublishedVersions(db, organizationId) {
  if (!isUuid(organizationId)) return 0;
  const res = await db.query(
    `UPDATE blessboard.website_publication_versions
        SET status = 'superseded',
            superseded_at = now()
      WHERE organization_id = $1
        AND status = 'published'
      RETURNING id`,
    [organizationId]
  );
  return res.rowCount || 0;
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {object} input
 */
async function insertPublishedVersion(db, input) {
  const res = await db.query(
    `INSERT INTO blessboard.website_publication_versions (
       organization_id, church_id, version_number, status, theme_key, source_type,
       source_submission_id, snapshot_json, change_summary_json,
       created_by, published_by, published_at
     ) VALUES (
       $1, $2, $3, 'published', $4, $5,
       $6, $7::jsonb, $8::jsonb,
       $9, $10, $11::timestamptz
     )
     RETURNING *`,
    [
      input.organizationId,
      input.churchId,
      input.versionNumber,
      input.themeKey || null,
      input.sourceType || "hq_edit",
      input.sourceSubmissionId || null,
      JSON.stringify(input.snapshot || {}),
      JSON.stringify(input.changeSummary || {}),
      input.createdBy || input.publishedBy || null,
      input.publishedBy || null,
      input.publishedAt || new Date().toISOString(),
    ]
  );
  return mapVersion(res.rows[0]);
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{
 *   organizationId: string,
 *   status?: string|null,
 *   publishedBy?: string|null,
 *   themeKey?: string|null,
 *   from?: string|null,
 *   to?: string|null,
 *   limit?: number,
 *   offset?: number,
 * }} filters
 */
async function listVersions(db, filters) {
  const organizationId = filters && filters.organizationId;
  if (!isUuid(organizationId)) return { items: [], total: 0 };

  const where = ["v.organization_id = $1"];
  const params = [organizationId];
  let i = 2;

  if (filters.status) {
    where.push(`v.status = $${i}`);
    params.push(String(filters.status));
    i += 1;
  }
  if (filters.publishedBy && isUuid(filters.publishedBy)) {
    where.push(`v.published_by = $${i}`);
    params.push(filters.publishedBy);
    i += 1;
  }
  if (filters.themeKey) {
    where.push(`v.theme_key = $${i}`);
    params.push(String(filters.themeKey).slice(0, 80));
    i += 1;
  }
  if (filters.from) {
    where.push(`v.published_at >= $${i}::timestamptz`);
    params.push(filters.from);
    i += 1;
  }
  if (filters.to) {
    where.push(`v.published_at < ($${i}::date + INTERVAL '1 day')`);
    params.push(filters.to);
    i += 1;
  }

  const whereSql = where.join(" AND ");
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 100);
  const offset = Math.max(Number(filters.offset) || 0, 0);

  const countRes = await db.query(
    `SELECT COUNT(*)::int AS n
       FROM blessboard.website_publication_versions v
      WHERE ${whereSql}`,
    params
  );
  const listRes = await db.query(
    `${LIST_SELECT}
      WHERE ${whereSql}
      ORDER BY v.version_number DESC
      LIMIT $${i} OFFSET $${i + 1}`,
    params.concat([limit, offset])
  );

  return {
    items: (listRes.rows || []).map(mapVersion),
    total: countRes.rows[0] ? Number(countRes.rows[0].n) : 0,
  };
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {string} organizationId
 * @param {string} versionId
 */
async function getVersionByOrgAndId(db, organizationId, versionId) {
  if (!isUuid(organizationId) || !isUuid(versionId)) return null;
  const res = await db.query(
    `${LIST_SELECT}
      WHERE v.organization_id = $1 AND v.id = $2
      LIMIT 1`,
    [organizationId, versionId]
  );
  return mapVersion(res.rows[0] || null);
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {string} organizationId
 */
async function getCurrentPublishedVersion(db, organizationId) {
  if (!isUuid(organizationId)) return null;
  const res = await db.query(
    `${LIST_SELECT}
      WHERE v.organization_id = $1 AND v.status = 'published'
      ORDER BY v.version_number DESC
      LIMIT 1`,
    [organizationId]
  );
  return mapVersion(res.rows[0] || null);
}

/**
 * Distinct publishers for filter dropdown.
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {string} organizationId
 */
async function listPublishers(db, organizationId) {
  if (!isUuid(organizationId)) return [];
  const res = await db.query(
    `SELECT DISTINCT u.id, u.display_name
       FROM blessboard.website_publication_versions v
       INNER JOIN blessboard.users u ON u.id = v.published_by
      WHERE v.organization_id = $1
      ORDER BY u.display_name ASC`,
    [organizationId]
  );
  return (res.rows || []).map((r) => ({ id: r.id, displayName: r.display_name }));
}

/**
 * Distinct theme keys.
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {string} organizationId
 */
async function listThemeKeys(db, organizationId) {
  if (!isUuid(organizationId)) return [];
  const res = await db.query(
    `SELECT DISTINCT theme_key
       FROM blessboard.website_publication_versions
      WHERE organization_id = $1
        AND theme_key IS NOT NULL
      ORDER BY theme_key ASC`,
    [organizationId]
  );
  return (res.rows || []).map((r) => r.theme_key);
}

module.exports = {
  isUuid,
  getNextVersionNumber,
  supersedePublishedVersions,
  insertPublishedVersion,
  listVersions,
  getVersionByOrgAndId,
  getCurrentPublishedVersion,
  listPublishers,
  listThemeKeys,
};
