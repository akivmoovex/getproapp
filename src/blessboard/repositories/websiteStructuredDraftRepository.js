"use strict";

/**
 * Repository for Phase 7 Stage 5 structured website drafts.
 */

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    churchId: row.church_id,
    branchId: row.branch_id,
    draftKind: row.draft_kind,
    pageKey: row.page_key,
    sectionKey: row.section_key,
    entityKey: row.entity_key,
    op: row.op,
    payload: row.payload || {},
    previousPayload: row.previous_payload,
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
 *   draftKind?: string|null,
 *   pageKey?: string|null,
 *   status?: string,
 * }} opts
 */
async function listStructuredDrafts(db, opts) {
  const params = [opts.churchId];
  let where = `church_id = $1 AND status = $${params.push(opts.status || "draft")}`;
  if (opts.branchId === null) {
    where += ` AND branch_id IS NULL`;
  } else if (opts.branchId) {
    params.push(opts.branchId);
    where += ` AND branch_id = $${params.length}`;
  }
  if (opts.draftKind) {
    params.push(opts.draftKind);
    where += ` AND draft_kind = $${params.length}`;
  }
  if (opts.pageKey) {
    params.push(opts.pageKey);
    where += ` AND (page_key = $${params.length} OR page_key IS NULL)`;
  }
  const result = await db.query(
    `SELECT id, organization_id, church_id, branch_id, draft_kind, page_key, section_key,
            entity_key, op, payload, previous_payload, editor_user_id, status,
            created_at, updated_at
       FROM blessboard.website_structured_drafts
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
async function countStructuredDrafts(db, opts) {
  const params = [opts.churchId];
  let where = `church_id = $1 AND status = 'draft'`;
  if (opts.branchId === null) {
    where += ` AND branch_id IS NULL`;
  } else if (opts.branchId) {
    params.push(opts.branchId);
    where += ` AND branch_id = $${params.length}`;
  }
  const result = await db.query(
    `SELECT COUNT(*)::int AS n FROM blessboard.website_structured_drafts WHERE ${where}`,
    params
  );
  return result.rows[0] ? Number(result.rows[0].n) : 0;
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {object} input
 */
async function upsertStructuredDraft(db, input) {
  const existing = await db.query(
    `SELECT id, previous_payload FROM blessboard.website_structured_drafts
      WHERE church_id = $1
        AND status = 'draft'
        AND draft_kind = $2
        AND entity_key = $3
        AND COALESCE(page_key, '') = COALESCE($4, '')
        AND COALESCE(section_key, '') = COALESCE($5, '')
        AND (($6::uuid IS NULL AND branch_id IS NULL) OR branch_id = $6::uuid)
      LIMIT 1`,
    [
      input.churchId,
      input.draftKind,
      input.entityKey,
      input.pageKey || null,
      input.sectionKey || null,
      input.branchId || null,
    ]
  );

  if (existing.rows[0]) {
    const result = await db.query(
      `UPDATE blessboard.website_structured_drafts
          SET op = $2,
              payload = $3::jsonb,
              previous_payload = COALESCE(previous_payload, $4::jsonb),
              editor_user_id = $5,
              updated_at = now()
        WHERE id = $1
        RETURNING id, organization_id, church_id, branch_id, draft_kind, page_key, section_key,
                  entity_key, op, payload, previous_payload, editor_user_id, status,
                  created_at, updated_at`,
      [
        existing.rows[0].id,
        input.op || "upsert",
        JSON.stringify(input.payload || {}),
        input.previousPayload != null ? JSON.stringify(input.previousPayload) : null,
        input.editorUserId,
      ]
    );
    return mapRow(result.rows[0]);
  }

  const result = await db.query(
    `INSERT INTO blessboard.website_structured_drafts (
       organization_id, church_id, branch_id, draft_kind, page_key, section_key,
       entity_key, op, payload, previous_payload, editor_user_id, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,'draft')
     RETURNING id, organization_id, church_id, branch_id, draft_kind, page_key, section_key,
               entity_key, op, payload, previous_payload, editor_user_id, status,
               created_at, updated_at`,
    [
      input.organizationId,
      input.churchId,
      input.branchId || null,
      input.draftKind,
      input.pageKey || null,
      input.sectionKey || null,
      input.entityKey,
      input.op || "upsert",
      JSON.stringify(input.payload || {}),
      input.previousPayload != null ? JSON.stringify(input.previousPayload) : null,
      input.editorUserId,
    ]
  );
  return mapRow(result.rows[0]);
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{ id: string, churchId: string }} opts
 */
async function discardStructuredDraft(db, opts) {
  const result = await db.query(
    `UPDATE blessboard.website_structured_drafts
        SET status = 'discarded', updated_at = now()
      WHERE id = $1 AND church_id = $2 AND status = 'draft'
      RETURNING id`,
    [opts.id, opts.churchId]
  );
  return Boolean(result.rows[0]);
}

/**
 * Discard by identity keys (cancel without knowing draft id).
 */
async function discardStructuredDraftByKey(db, opts) {
  const result = await db.query(
    `UPDATE blessboard.website_structured_drafts
        SET status = 'discarded', updated_at = now()
      WHERE church_id = $1
        AND status = 'draft'
        AND draft_kind = $2
        AND entity_key = $3
        AND COALESCE(page_key, '') = COALESCE($4, '')
        AND COALESCE(section_key, '') = COALESCE($5, '')
        AND (($6::uuid IS NULL AND branch_id IS NULL) OR branch_id = $6::uuid)
      RETURNING id`,
    [
      opts.churchId,
      opts.draftKind,
      opts.entityKey,
      opts.pageKey || null,
      opts.sectionKey || null,
      opts.branchId || null,
    ]
  );
  return result.rowCount > 0;
}

/**
 * Mark all active structured drafts in scope as applied.
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{ churchId: string, branchId?: string|null, organizationId?: string }} opts
 */
async function markAllStructuredDraftsApplied(db, opts) {
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
    `UPDATE blessboard.website_structured_drafts
        SET status = 'applied', updated_at = now()
      WHERE ${where}
      RETURNING id`,
    params
  );
  return result.rowCount || 0;
}

/**
 * Discard all active structured drafts in scope.
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{ churchId: string, branchId?: string|null, organizationId?: string }} opts
 */
async function discardAllStructuredDrafts(db, opts) {
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
    `UPDATE blessboard.website_structured_drafts
        SET status = 'discarded', updated_at = now()
      WHERE ${where}
      RETURNING id`,
    params
  );
  return result.rowCount || 0;
}

module.exports = {
  listStructuredDrafts,
  countStructuredDrafts,
  upsertStructuredDraft,
  discardStructuredDraft,
  discardStructuredDraftByKey,
  markAllStructuredDraftsApplied,
  discardAllStructuredDrafts,
};
