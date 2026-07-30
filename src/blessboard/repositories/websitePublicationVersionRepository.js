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
    branchId: row.branch_id || null,
    versionNumber: Number(row.version_number),
    status: row.status,
    themeKey: row.theme_key,
    sourceType: row.source_type,
    sourceSubmissionId: row.source_submission_id,
    sourceVersionId: row.source_version_id || null,
    restorationReason: row.restoration_reason || null,
    restoredBy: row.restored_by || null,
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

/** List cards: omit heavy snapshot_json payload. */
const LIST_SELECT_SUMMARY = `
  SELECT
    v.id,
    v.organization_id,
    v.church_id,
    v.branch_id,
    v.version_number,
    v.status,
    v.theme_key,
    v.source_type,
    v.source_submission_id,
    v.source_version_id,
    v.restoration_reason,
    v.restored_by,
    '{}'::jsonb AS snapshot_json,
    v.change_summary_json,
    v.created_by,
    v.created_at,
    v.published_by,
    v.published_at,
    v.superseded_at,
    cu.display_name AS created_by_name,
    pu.display_name AS published_by_name
  FROM blessboard.website_publication_versions v
  LEFT JOIN blessboard.users cu ON cu.id = v.created_by
  LEFT JOIN blessboard.users pu ON pu.id = v.published_by
`;

/**
 * @param {string|null|undefined} branchId
 * @param {number} startIndex 1-based SQL param index for branch clause
 * @returns {{ sql: string, params: string[] }}
 */
function branchScopeFilter(branchId, startIndex) {
  if (branchId == null || branchId === "") {
    return { sql: "v.branch_id IS NULL", params: [] };
  }
  return { sql: `v.branch_id = $${startIndex}`, params: [String(branchId)] };
}

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
 * @param {string|null|undefined} [branchId] null = church-wide only; undefined = all scopes
 */
async function supersedePublishedVersions(db, organizationId, branchId) {
  if (!isUuid(organizationId)) return 0;
  if (branchId === undefined) {
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
  if (branchId == null || branchId === "") {
    const res = await db.query(
      `UPDATE blessboard.website_publication_versions
          SET status = 'superseded',
              superseded_at = now()
        WHERE organization_id = $1
          AND branch_id IS NULL
          AND status = 'published'
        RETURNING id`,
      [organizationId]
    );
    return res.rowCount || 0;
  }
  if (!isUuid(branchId)) return 0;
  const res = await db.query(
    `UPDATE blessboard.website_publication_versions
        SET status = 'superseded',
            superseded_at = now()
      WHERE organization_id = $1
        AND branch_id = $2
        AND status = 'published'
      RETURNING id`,
    [organizationId, branchId]
  );
  return res.rowCount || 0;
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {object} input
 */
async function insertPublishedVersion(db, input) {
  const sourceType = input.sourceType || "hq_edit";
  const isRestore = sourceType === "content_restoration";
  const branchId =
    input.branchId != null && String(input.branchId).trim()
      ? String(input.branchId).trim()
      : null;
  const res = await db.query(
    `INSERT INTO blessboard.website_publication_versions (
       organization_id, church_id, branch_id, version_number, status, theme_key, source_type,
       source_submission_id, source_version_id, restoration_reason, restored_by,
       snapshot_json, change_summary_json,
       created_by, published_by, published_at
     ) VALUES (
       $1, $2, $3, $4, 'published', $5, $6,
       $7, $8, $9, $10,
       $11::jsonb, $12::jsonb,
       $13, $14, $15::timestamptz
     )
     RETURNING *`,
    [
      input.organizationId,
      input.churchId,
      branchId,
      input.versionNumber,
      input.themeKey || null,
      sourceType,
      input.sourceSubmissionId || null,
      isRestore ? input.sourceVersionId || null : null,
      isRestore ? input.restorationReason || null : null,
      isRestore ? input.restoredBy || input.publishedBy || null : null,
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
 *   branchId?: string|null,
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

  if (Object.prototype.hasOwnProperty.call(filters, "branchId")) {
    const scope = branchScopeFilter(filters.branchId, i);
    where.push(scope.sql);
    for (const p of scope.params) {
      params.push(p);
      i += 1;
    }
  }

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
 * @param {string|null|undefined} [branchId] null/omit = church-wide published version
 */
async function getCurrentPublishedVersion(db, organizationId, branchId) {
  if (!isUuid(organizationId)) return null;
  const scope = branchScopeFilter(branchId == null ? null : branchId, 2);
  const res = await db.query(
    `${LIST_SELECT}
      WHERE v.organization_id = $1
        AND v.status = 'published'
        AND ${scope.sql}
      ORDER BY v.version_number DESC
      LIMIT 1`,
    [organizationId].concat(scope.params)
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

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {string} organizationId
 * @param {string} versionIdA
 * @param {string} versionIdB
 */
async function loadVersionPair(db, organizationId, versionIdA, versionIdB) {
  if (!isUuid(organizationId) || !isUuid(versionIdA) || !isUuid(versionIdB)) {
    return { a: null, b: null };
  }
  const [a, b] = await Promise.all([
    getVersionByOrgAndId(db, organizationId, versionIdA),
    getVersionByOrgAndId(db, organizationId, versionIdB),
  ]);
  return { a, b };
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {string} organizationId
 * @param {number} beforeVersionNumber
 */
async function loadPreviousPublishedVersion(db, organizationId, beforeVersionNumber) {
  if (!isUuid(organizationId) || !Number.isFinite(Number(beforeVersionNumber))) return null;
  const res = await db.query(
    `${LIST_SELECT}
      WHERE v.organization_id = $1
        AND v.version_number < $2
        AND v.status IN ('published', 'superseded')
      ORDER BY v.version_number DESC
      LIMIT 1`,
    [organizationId, Number(beforeVersionNumber)]
  );
  return mapVersion(res.rows[0] || null);
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {object} input
 */
async function insertDraftRestorationVersion(db, input) {
  const branchId =
    input.branchId != null && String(input.branchId).trim()
      ? String(input.branchId).trim()
      : null;
  const res = await db.query(
    `INSERT INTO blessboard.website_publication_versions (
       organization_id, church_id, branch_id, version_number, status, theme_key, source_type,
       source_submission_id, source_version_id, restoration_reason, restored_by,
       snapshot_json, change_summary_json, created_by
     ) VALUES (
       $1, $2, $3, $4, 'draft', $5, 'content_restoration',
       NULL, $6, $7, $8,
       $9::jsonb, $10::jsonb, $8
     )
     RETURNING *`,
    [
      input.organizationId,
      input.churchId,
      branchId,
      input.versionNumber,
      input.themeKey || null,
      input.sourceVersionId,
      input.restorationReason,
      input.restoredBy,
      JSON.stringify(input.snapshot || {}),
      JSON.stringify(input.changeSummary || {}),
    ]
  );
  return mapVersion(res.rows[0]);
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {string} organizationId
 * @param {string|null|undefined} [branchId] null/omit = church-wide draft restoration
 */
async function getLatestDraftRestoration(db, organizationId, branchId) {
  if (!isUuid(organizationId)) return null;
  const scope = branchScopeFilter(branchId == null ? null : branchId, 2);
  const res = await db.query(
    `${LIST_SELECT}
      WHERE v.organization_id = $1
        AND v.status = 'draft'
        AND v.source_type = 'content_restoration'
        AND ${scope.sql}
      ORDER BY v.created_at DESC
      LIMIT 1`,
    [organizationId].concat(scope.params)
  );
  return mapVersion(res.rows[0] || null);
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {string} organizationId
 * @param {string} versionId
 */
async function archiveDraftVersion(db, organizationId, versionId) {
  if (!isUuid(organizationId) || !isUuid(versionId)) return null;
  const res = await db.query(
    `UPDATE blessboard.website_publication_versions
        SET status = 'archived'
      WHERE organization_id = $1
        AND id = $2
        AND status = 'draft'
      RETURNING *`,
    [organizationId, versionId]
  );
  return mapVersion(res.rows[0] || null);
}

/**
 * Publishing history derived from version records.
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{
 *   organizationId: string,
 *   branchId?: string|null,
 *   sourceType?: string|null,
 *   publishedBy?: string|null,
 *   themeKey?: string|null,
 *   from?: string|null,
 *   to?: string|null,
 *   limit?: number,
 * }} filters
 */
async function listPublishingHistory(db, filters) {
  const organizationId = filters && filters.organizationId;
  if (!isUuid(organizationId)) return { items: [], total: 0 };

  const where = [
    "v.organization_id = $1",
    "v.status IN ('published', 'superseded')",
    "v.published_at IS NOT NULL",
  ];
  const params = [organizationId];
  let i = 2;

  if (Object.prototype.hasOwnProperty.call(filters, "branchId")) {
    const scope = branchScopeFilter(filters.branchId, i);
    where.push(scope.sql);
    for (const p of scope.params) {
      params.push(p);
      i += 1;
    }
  }

  if (filters.sourceType) {
    where.push(`v.source_type = $${i}`);
    params.push(String(filters.sourceType));
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
  const countRes = await db.query(
    `SELECT COUNT(*)::int AS n
       FROM blessboard.website_publication_versions v
      WHERE ${whereSql}`,
    params
  );
  const listRes = await db.query(
    `${LIST_SELECT}
      WHERE ${whereSql}
      ORDER BY v.published_at DESC, v.version_number DESC
      LIMIT $${i}`,
    params.concat([limit])
  );
  return {
    items: (listRes.rows || []).map(mapVersion),
    total: countRes.rows[0] ? Number(countRes.rows[0].n) : 0,
  };
}

/**
 * Current live publication without loading full snapshot JSON.
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {string} organizationId
 * @param {string|null|undefined} [branchId] null/omit = church-wide
 */
async function loadCurrentWebsitePublication(db, organizationId, branchId) {
  if (!isUuid(organizationId)) return null;
  const scope = branchScopeFilter(branchId == null ? null : branchId, 2);
  const res = await db.query(
    `${LIST_SELECT_SUMMARY}
      WHERE v.organization_id = $1
        AND v.status = 'published'
        AND ${scope.sql}
      ORDER BY v.published_at DESC NULLS LAST, v.version_number DESC
      LIMIT 1`,
    [organizationId].concat(scope.params)
  );
  return mapVersion(res.rows[0] || null);
}

/**
 * Recent published/superseded publications (newest first), summary fields only.
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{ organizationId: string, branchId?: string|null, limit?: number, excludeId?: string|null }} filters
 */
async function listRecentWebsitePublications(db, filters) {
  const organizationId = filters && filters.organizationId;
  if (!isUuid(organizationId)) return { items: [], total: 0 };
  const limit = Math.min(Math.max(Number(filters.limit) || 6, 1), 20);
  const params = [organizationId];
  let where = `
    v.organization_id = $1
    AND v.status IN ('published', 'superseded')
    AND v.published_at IS NOT NULL`;
  if (Object.prototype.hasOwnProperty.call(filters, "branchId")) {
    const scope = branchScopeFilter(filters.branchId, params.length + 1);
    where += ` AND ${scope.sql}`;
    for (const p of scope.params) params.push(p);
  }
  if (filters.excludeId && isUuid(filters.excludeId)) {
    params.push(filters.excludeId);
    where += ` AND v.id <> $${params.length}`;
  }
  const countRes = await db.query(
    `SELECT COUNT(*)::int AS n
       FROM blessboard.website_publication_versions v
      WHERE ${where}`,
    params
  );
  const listRes = await db.query(
    `${LIST_SELECT_SUMMARY}
      WHERE ${where}
      ORDER BY v.published_at DESC, v.version_number DESC
      LIMIT $${params.length + 1}`,
    params.concat([limit])
  );
  return {
    items: (listRes.rows || []).map(mapVersion),
    total: countRes.rows[0] ? Number(countRes.rows[0].n) : 0,
  };
}

/**
 * Full publication for historical preview (includes snapshot).
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {string} organizationId
 * @param {string} publicationId
 */
async function loadHistoricalPublicationPreview(db, organizationId, publicationId) {
  return getVersionByOrgAndId(db, organizationId, publicationId);
}

/**
 * Previous published website relative to current (summary only).
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {string} organizationId
 * @param {string|null|undefined} [branchId]
 */
async function loadPreviousWebsitePublication(db, organizationId, branchId) {
  const current = await loadCurrentWebsitePublication(db, organizationId, branchId);
  if (!current) return null;
  const listed = await listRecentWebsitePublications(db, {
    organizationId,
    branchId: branchId == null ? null : branchId,
    limit: 1,
    excludeId: current.id,
  });
  return (listed.items && listed.items[0]) || null;
}

module.exports = {
  isUuid,
  getNextVersionNumber,
  supersedePublishedVersions,
  insertPublishedVersion,
  insertDraftRestorationVersion,
  listVersions,
  getVersionByOrgAndId,
  getCurrentPublishedVersion,
  loadVersionPair,
  loadPreviousPublishedVersion,
  getLatestDraftRestoration,
  archiveDraftVersion,
  listPublishingHistory,
  listPublishers,
  listThemeKeys,
  listRecentWebsitePublications,
  loadCurrentWebsitePublication,
  loadPreviousWebsitePublication,
  loadHistoricalPublicationPreview,
};
