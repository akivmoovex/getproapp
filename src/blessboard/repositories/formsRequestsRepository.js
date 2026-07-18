"use strict";

/**
 * BlessBoard V5 resources / forms / member requests repository (SQL only).
 */

const RESOURCE_COLS = `id, church_id, branch_id, title, description, media_asset_id, audience, status,
  published_at, created_by_user_id, created_at, updated_at`;

const FORM_COLS = `id, church_id, branch_id, title, description, schema_json, status,
  published_at, created_by_user_id, created_at, updated_at`;

const SUBMISSION_COLS = `id, church_id, form_id, member_id, branch_id, answers_json, status,
  submitted_at, created_at, updated_at`;

const REQUEST_COLS = `id, church_id, branch_id, member_id, category, subject, message, status,
  media_asset_id, created_at, updated_at`;

const HISTORY_COLS = `id, church_id, request_id, from_status, to_status, note, member_visible,
  changed_by_user_id, created_at`;

function mapResource(row) {
  if (!row) return null;
  return {
    id: row.id,
    churchId: row.church_id,
    branchId: row.branch_id || null,
    title: row.title,
    description: row.description || null,
    mediaAssetId: row.media_asset_id || null,
    audience: row.audience,
    status: row.status,
    publishedAt: row.published_at || null,
    createdByUserId: row.created_by_user_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapForm(row) {
  if (!row) return null;
  return {
    id: row.id,
    churchId: row.church_id,
    branchId: row.branch_id || null,
    title: row.title,
    description: row.description || null,
    schema: row.schema_json,
    status: row.status,
    publishedAt: row.published_at || null,
    createdByUserId: row.created_by_user_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSubmission(row) {
  if (!row) return null;
  return {
    id: row.id,
    churchId: row.church_id,
    formId: row.form_id,
    memberId: row.member_id,
    branchId: row.branch_id,
    answers: row.answers_json,
    status: row.status,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    churchId: row.church_id,
    branchId: row.branch_id,
    memberId: row.member_id,
    category: row.category,
    subject: row.subject,
    message: row.message,
    status: row.status,
    mediaAssetId: row.media_asset_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapHistory(row) {
  if (!row) return null;
  return {
    id: row.id,
    churchId: row.church_id,
    requestId: row.request_id,
    fromStatus: row.from_status || null,
    toStatus: row.to_status,
    note: row.note || null,
    memberVisible: row.member_visible !== false,
    changedByUserId: row.changed_by_user_id || null,
    createdAt: row.created_at,
  };
}

async function findBranchScope(client, branchId) {
  const { rows } = await client.query(
    `SELECT id, church_id, status, branch_key, display_name
       FROM blessboard.branches WHERE id = $1`,
    [branchId]
  );
  return rows[0] || null;
}

async function findMediaMeta(client, mediaAssetId) {
  const { rows } = await client.query(
    `SELECT id, church_id, visibility, status, original_filename, mime_type
       FROM blessboard.media_assets WHERE id = $1`,
    [mediaAssetId]
  );
  return rows[0] || null;
}

// --- resources ---

async function findResourceById(client, id) {
  const { rows } = await client.query(
    `SELECT ${RESOURCE_COLS} FROM blessboard.resources WHERE id = $1`,
    [id]
  );
  return mapResource(rows[0] || null);
}

async function listResources(client, opts) {
  const params = [opts.churchId];
  let where = `church_id = $1`;
  if (opts.branchId) {
    params.push(opts.branchId);
    where += ` AND (branch_id IS NULL OR branch_id = $${params.length})`;
  } else if (opts.branchOnly) {
    params.push(opts.branchOnly);
    where += ` AND branch_id = $${params.length}`;
  }
  if (opts.status) {
    params.push(opts.status);
    where += ` AND status = $${params.length}`;
  }
  if (opts.audience) {
    params.push(opts.audience);
    where += ` AND (audience = $${params.length} OR audience = 'all')`;
  }
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);
  params.push(limit);
  const { rows } = await client.query(
    `SELECT ${RESOURCE_COLS}
       FROM blessboard.resources
      WHERE ${where}
      ORDER BY published_at DESC NULLS LAST, created_at DESC
      LIMIT $${params.length}`,
    params
  );
  return rows.map(mapResource);
}

async function insertResource(client, fields) {
  const { rows } = await client.query(
    `INSERT INTO blessboard.resources
       (church_id, branch_id, title, description, media_asset_id, audience, status, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7)
     RETURNING ${RESOURCE_COLS}`,
    [
      fields.churchId,
      fields.branchId || null,
      fields.title,
      fields.description || null,
      fields.mediaAssetId || null,
      fields.audience,
      fields.createdByUserId || null,
    ]
  );
  return mapResource(rows[0]);
}

async function updateResource(client, id, patch) {
  const { rows } = await client.query(
    `UPDATE blessboard.resources
        SET title = COALESCE($2, title),
            description = CASE WHEN $3::boolean THEN NULL ELSE COALESCE($4, description) END,
            media_asset_id = CASE WHEN $5::boolean THEN NULL ELSE COALESCE($6, media_asset_id) END,
            audience = COALESCE($7, audience),
            updated_at = now()
      WHERE id = $1 AND status = 'draft'
      RETURNING ${RESOURCE_COLS}`,
    [
      id,
      patch.title || null,
      patch.clearDescription === true,
      patch.description != null ? patch.description : null,
      patch.clearMedia === true,
      patch.mediaAssetId || null,
      patch.audience || null,
    ]
  );
  return mapResource(rows[0] || null);
}

async function updateResourceStatus(client, id, patch) {
  const { rows } = await client.query(
    `UPDATE blessboard.resources
        SET status = $2,
            published_at = COALESCE($3, published_at),
            updated_at = now()
      WHERE id = $1
      RETURNING ${RESOURCE_COLS}`,
    [id, patch.status, patch.publishedAt || null]
  );
  return mapResource(rows[0] || null);
}

// --- forms ---

async function findFormById(client, id) {
  const { rows } = await client.query(
    `SELECT ${FORM_COLS} FROM blessboard.forms WHERE id = $1`,
    [id]
  );
  return mapForm(rows[0] || null);
}

async function listForms(client, opts) {
  const params = [opts.churchId];
  let where = `church_id = $1`;
  if (opts.branchId) {
    params.push(opts.branchId);
    where += ` AND (branch_id IS NULL OR branch_id = $${params.length})`;
  } else if (opts.branchOnly) {
    params.push(opts.branchOnly);
    where += ` AND branch_id = $${params.length}`;
  }
  if (opts.status) {
    params.push(opts.status);
    where += ` AND status = $${params.length}`;
  }
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);
  params.push(limit);
  const { rows } = await client.query(
    `SELECT ${FORM_COLS}
       FROM blessboard.forms
      WHERE ${where}
      ORDER BY published_at DESC NULLS LAST, created_at DESC
      LIMIT $${params.length}`,
    params
  );
  return rows.map(mapForm);
}

async function insertForm(client, fields) {
  const { rows } = await client.query(
    `INSERT INTO blessboard.forms
       (church_id, branch_id, title, description, schema_json, status, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5::jsonb, 'draft', $6)
     RETURNING ${FORM_COLS}`,
    [
      fields.churchId,
      fields.branchId || null,
      fields.title,
      fields.description || null,
      JSON.stringify(fields.schema),
      fields.createdByUserId || null,
    ]
  );
  return mapForm(rows[0]);
}

async function updateForm(client, id, patch) {
  const { rows } = await client.query(
    `UPDATE blessboard.forms
        SET title = COALESCE($2, title),
            description = CASE WHEN $3::boolean THEN NULL ELSE COALESCE($4, description) END,
            schema_json = COALESCE($5::jsonb, schema_json),
            updated_at = now()
      WHERE id = $1 AND status = 'draft'
      RETURNING ${FORM_COLS}`,
    [
      id,
      patch.title || null,
      patch.clearDescription === true,
      patch.description != null ? patch.description : null,
      patch.schema ? JSON.stringify(patch.schema) : null,
    ]
  );
  return mapForm(rows[0] || null);
}

async function updateFormStatus(client, id, patch) {
  const { rows } = await client.query(
    `UPDATE blessboard.forms
        SET status = $2,
            published_at = COALESCE($3, published_at),
            updated_at = now()
      WHERE id = $1
      RETURNING ${FORM_COLS}`,
    [id, patch.status, patch.publishedAt || null]
  );
  return mapForm(rows[0] || null);
}

async function insertSubmission(client, fields) {
  const { rows } = await client.query(
    `INSERT INTO blessboard.form_submissions
       (church_id, form_id, member_id, branch_id, answers_json, status)
     VALUES ($1, $2, $3, $4, $5::jsonb, 'submitted')
     RETURNING ${SUBMISSION_COLS}`,
    [
      fields.churchId,
      fields.formId,
      fields.memberId,
      fields.branchId,
      JSON.stringify(fields.answers),
    ]
  );
  return mapSubmission(rows[0]);
}

async function findSubmissionById(client, id) {
  const { rows } = await client.query(
    `SELECT ${SUBMISSION_COLS} FROM blessboard.form_submissions WHERE id = $1`,
    [id]
  );
  return mapSubmission(rows[0] || null);
}

async function listSubmissions(client, opts) {
  const params = [opts.churchId];
  let where = `s.church_id = $1`;
  if (opts.formId) {
    params.push(opts.formId);
    where += ` AND s.form_id = $${params.length}`;
  }
  if (opts.memberId) {
    params.push(opts.memberId);
    where += ` AND s.member_id = $${params.length}`;
  }
  if (opts.branchId) {
    params.push(opts.branchId);
    where += ` AND s.branch_id = $${params.length}`;
  }
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);
  params.push(limit);
  const { rows } = await client.query(
    `SELECT s.id, s.church_id, s.form_id, s.member_id, s.branch_id, s.answers_json, s.status,
            s.submitted_at, s.created_at, s.updated_at, f.title AS form_title
       FROM blessboard.form_submissions s
       INNER JOIN blessboard.forms f ON f.id = s.form_id
      WHERE ${where}
      ORDER BY s.submitted_at DESC
      LIMIT $${params.length}`,
    params
  );
  return rows.map((row) => ({
    ...mapSubmission(row),
    formTitle: row.form_title,
  }));
}

// --- member requests ---

async function findRequestById(client, id) {
  const { rows } = await client.query(
    `SELECT ${REQUEST_COLS} FROM blessboard.member_requests WHERE id = $1`,
    [id]
  );
  return mapRequest(rows[0] || null);
}

async function listRequests(client, opts) {
  const params = [opts.churchId];
  let where = `church_id = $1`;
  if (opts.branchId) {
    params.push(opts.branchId);
    where += ` AND branch_id = $${params.length}`;
  }
  if (opts.memberId) {
    params.push(opts.memberId);
    where += ` AND member_id = $${params.length}`;
  }
  if (opts.status) {
    params.push(opts.status);
    where += ` AND status = $${params.length}`;
  }
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);
  params.push(limit);
  const { rows } = await client.query(
    `SELECT ${REQUEST_COLS}
       FROM blessboard.member_requests
      WHERE ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length}`,
    params
  );
  return rows.map(mapRequest);
}

async function insertRequest(client, fields) {
  const { rows } = await client.query(
    `INSERT INTO blessboard.member_requests
       (church_id, branch_id, member_id, category, subject, message, status, media_asset_id)
     VALUES ($1, $2, $3, $4, $5, $6, 'submitted', $7)
     RETURNING ${REQUEST_COLS}`,
    [
      fields.churchId,
      fields.branchId,
      fields.memberId,
      fields.category,
      fields.subject,
      fields.message,
      fields.mediaAssetId || null,
    ]
  );
  return mapRequest(rows[0]);
}

async function updateRequestStatus(client, id, status) {
  const { rows } = await client.query(
    `UPDATE blessboard.member_requests
        SET status = $2, updated_at = now()
      WHERE id = $1
      RETURNING ${REQUEST_COLS}`,
    [id, status]
  );
  return mapRequest(rows[0] || null);
}

async function insertRequestHistory(client, fields) {
  const { rows } = await client.query(
    `INSERT INTO blessboard.member_request_status_history
       (church_id, request_id, from_status, to_status, note, member_visible, changed_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${HISTORY_COLS}`,
    [
      fields.churchId,
      fields.requestId,
      fields.fromStatus || null,
      fields.toStatus,
      fields.note || null,
      fields.memberVisible !== false,
      fields.changedByUserId || null,
    ]
  );
  return mapHistory(rows[0]);
}

async function listRequestHistory(client, requestId, { memberVisibleOnly = false } = {}) {
  const params = [requestId];
  let where = `request_id = $1`;
  if (memberVisibleOnly) {
    where += ` AND member_visible = true`;
  }
  const { rows } = await client.query(
    `SELECT ${HISTORY_COLS}
       FROM blessboard.member_request_status_history
      WHERE ${where}
      ORDER BY created_at ASC`,
    params
  );
  return rows.map(mapHistory);
}

module.exports = {
  mapResource,
  mapForm,
  mapSubmission,
  mapRequest,
  mapHistory,
  findBranchScope,
  findMediaMeta,
  findResourceById,
  listResources,
  insertResource,
  updateResource,
  updateResourceStatus,
  findFormById,
  listForms,
  insertForm,
  updateForm,
  updateFormStatus,
  insertSubmission,
  findSubmissionById,
  listSubmissions,
  findRequestById,
  listRequests,
  insertRequest,
  updateRequestStatus,
  insertRequestHistory,
  listRequestHistory,
};
