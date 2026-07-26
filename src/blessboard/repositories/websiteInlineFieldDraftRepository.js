"use strict";

/**
 * Repository for Phase 7 inline field drafts (draft-while-live overlays).
 */

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    churchId: row.church_id,
    branchId: row.branch_id,
    pageKey: row.page_key,
    sectionKey: row.section_key,
    fieldKey: row.field_key,
    previousValue: row.previous_value,
    newValue: row.new_value,
    editorUserId: row.editor_user_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{
 *   churchId: string,
 *   branchId?: string|null,
 *   pageKey?: string|null,
 *   status?: string,
 * }} opts
 */
async function listDrafts(db, opts) {
  const params = [opts.churchId];
  let where = `church_id = $1 AND status = $${params.push(opts.status || "draft")}`;
  if (opts.branchId === null) {
    where += ` AND branch_id IS NULL`;
  } else if (opts.branchId) {
    params.push(opts.branchId);
    where += ` AND branch_id = $${params.length}`;
  }
  if (opts.pageKey) {
    params.push(opts.pageKey);
    where += ` AND page_key = $${params.length}`;
  }
  const result = await db.query(
    `SELECT id, organization_id, church_id, branch_id, page_key, section_key, field_key,
            previous_value, new_value, editor_user_id, status, created_at, updated_at
       FROM blessboard.website_inline_field_drafts
      WHERE ${where}
      ORDER BY updated_at DESC`,
    params
  );
  return result.rows.map(mapRow);
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{ churchId: string, branchId?: string|null }} opts
 */
async function countDrafts(db, opts) {
  const params = [opts.churchId];
  let where = `church_id = $1 AND status = 'draft'`;
  if (opts.branchId === null) {
    where += ` AND branch_id IS NULL`;
  } else if (opts.branchId) {
    params.push(opts.branchId);
    where += ` AND branch_id = $${params.length}`;
  }
  const result = await db.query(
    `SELECT COUNT(*)::int AS n FROM blessboard.website_inline_field_drafts WHERE ${where}`,
    params
  );
  return result.rows[0] ? Number(result.rows[0].n) : 0;
}

/**
 * Upsert an active draft for a field (unique on church/branch/page/section/field while draft).
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {object} input
 */
async function upsertDraft(db, input) {
  const result = await db.query(
    `INSERT INTO blessboard.website_inline_field_drafts (
       organization_id, church_id, branch_id, page_key, section_key, field_key,
       previous_value, new_value, editor_user_id, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft')
     ON CONFLICT (church_id, branch_id, page_key, section_key, field_key, status)
       WHERE status = 'draft'
     DO UPDATE SET
       previous_value = COALESCE(blessboard.website_inline_field_drafts.previous_value, EXCLUDED.previous_value),
       new_value = EXCLUDED.new_value,
       editor_user_id = EXCLUDED.editor_user_id,
       updated_at = now()
     RETURNING id, organization_id, church_id, branch_id, page_key, section_key, field_key,
               previous_value, new_value, editor_user_id, status, created_at, updated_at`,
    [
      input.organizationId,
      input.churchId,
      input.branchId || null,
      input.pageKey,
      input.sectionKey,
      input.fieldKey,
      input.previousValue,
      input.newValue,
      input.editorUserId,
    ]
  );
  return mapRow(result.rows[0]);
}

/**
 * PostgreSQL UNIQUE NULLS NOT DISTINCT may not support partial ON CONFLICT WHERE in all versions.
 * Fallback upsert without partial predicate.
 */
async function upsertDraftCompat(db, input) {
  const existing = await db.query(
    `SELECT id FROM blessboard.website_inline_field_drafts
      WHERE church_id = $1
        AND status = 'draft'
        AND page_key = $2
        AND section_key = $3
        AND field_key = $4
        AND (($5::uuid IS NULL AND branch_id IS NULL) OR branch_id = $5::uuid)
      LIMIT 1`,
    [input.churchId, input.pageKey, input.sectionKey, input.fieldKey, input.branchId || null]
  );
  if (existing.rows[0]) {
    const result = await db.query(
      `UPDATE blessboard.website_inline_field_drafts
          SET previous_value = COALESCE(previous_value, $2),
              new_value = $3,
              editor_user_id = $4,
              updated_at = now()
        WHERE id = $1
        RETURNING id, organization_id, church_id, branch_id, page_key, section_key, field_key,
                  previous_value, new_value, editor_user_id, status, created_at, updated_at`,
      [existing.rows[0].id, input.previousValue, input.newValue, input.editorUserId]
    );
    return mapRow(result.rows[0]);
  }
  const result = await db.query(
    `INSERT INTO blessboard.website_inline_field_drafts (
       organization_id, church_id, branch_id, page_key, section_key, field_key,
       previous_value, new_value, editor_user_id, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft')
     RETURNING id, organization_id, church_id, branch_id, page_key, section_key, field_key,
               previous_value, new_value, editor_user_id, status, created_at, updated_at`,
    [
      input.organizationId,
      input.churchId,
      input.branchId || null,
      input.pageKey,
      input.sectionKey,
      input.fieldKey,
      input.previousValue,
      input.newValue,
      input.editorUserId,
    ]
  );
  return mapRow(result.rows[0]);
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{ id: string, churchId: string }} opts
 */
async function discardDraft(db, opts) {
  const result = await db.query(
    `UPDATE blessboard.website_inline_field_drafts
        SET status = 'discarded', updated_at = now()
      WHERE id = $1 AND church_id = $2 AND status = 'draft'
      RETURNING id`,
    [opts.id, opts.churchId]
  );
  return Boolean(result.rows[0]);
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{
 *   churchId: string,
 *   branchId?: string|null,
 *   pageKey: string,
 *   sectionKey: string,
 *   fieldKey: string,
 * }} opts
 */
async function findActiveDraft(db, opts) {
  const result = await db.query(
    `SELECT id, organization_id, church_id, branch_id, page_key, section_key, field_key,
            previous_value, new_value, editor_user_id, status, created_at, updated_at
       FROM blessboard.website_inline_field_drafts
      WHERE church_id = $1
        AND status = 'draft'
        AND page_key = $2
        AND section_key = $3
        AND field_key = $4
        AND (($5::uuid IS NULL AND branch_id IS NULL) OR branch_id = $5::uuid)
      LIMIT 1`,
    [opts.churchId, opts.pageKey, opts.sectionKey, opts.fieldKey, opts.branchId || null]
  );
  return mapRow(result.rows[0] || null);
}

/**
 * Mark all active drafts in scope as applied.
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{ churchId: string, branchId?: string|null, organizationId?: string }} opts
 */
async function markAllDraftsApplied(db, opts) {
  const params = [opts.churchId];
  let where = `church_id = $1 AND status = 'draft'`;
  if (opts.organizationId) {
    params.push(opts.organizationId);
    where += ` AND organization_id = $${params.length}`;
  }
  if (opts.branchId === null) {
    where += ` AND branch_id IS NULL`;
  } else if (opts.branchId) {
    params.push(opts.branchId);
    where += ` AND branch_id = $${params.length}`;
  }
  const result = await db.query(
    `UPDATE blessboard.website_inline_field_drafts
        SET status = 'applied', updated_at = now()
      WHERE ${where}
      RETURNING id`,
    params
  );
  return result.rowCount || 0;
}

/**
 * Discard all active drafts in scope (unpublished overlays only).
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{ churchId: string, branchId?: string|null, organizationId?: string }} opts
 */
async function discardAllDrafts(db, opts) {
  const params = [opts.churchId];
  let where = `church_id = $1 AND status = 'draft'`;
  if (opts.organizationId) {
    params.push(opts.organizationId);
    where += ` AND organization_id = $${params.length}`;
  }
  if (opts.branchId === null) {
    where += ` AND branch_id IS NULL`;
  } else if (opts.branchId) {
    params.push(opts.branchId);
    where += ` AND branch_id = $${params.length}`;
  }
  const result = await db.query(
    `UPDATE blessboard.website_inline_field_drafts
        SET status = 'discarded', updated_at = now()
      WHERE ${where}
      RETURNING id`,
    params
  );
  return result.rowCount || 0;
}

module.exports = {
  isUuid,
  listDrafts,
  countDrafts,
  upsertDraft,
  upsertDraftCompat,
  discardDraft,
  findActiveDraft,
  markAllDraftsApplied,
  discardAllDrafts,
};
