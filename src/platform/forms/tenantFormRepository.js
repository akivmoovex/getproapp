"use strict";

const FORM_COLUMNS = `
  id, organization_id, product_code, form_key, title, description, category,
  schema_json, schema_version, status, access_mode, discoverable, public_token,
  published_at, unpublished_at, created_by_identity_id, updated_by_identity_id,
  created_at, updated_at, branch_id, facility_id, require_consent,
  linked_resource_type, linked_resource_id, registration_closed, max_submissions
`;

const SUBMISSION_COLUMNS = `
  id, form_id, organization_id, product_code, schema_version, answers_json,
  submitter_email, access_token_id, status, review_status, internal_notes,
  idempotency_key, consent_accepted_at, branch_id, facility_id,
  reviewed_by_identity_id, reviewed_at, status_history_json, submitted_at
`;

function mapForm(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    productCode: row.product_code,
    formKey: row.form_key,
    title: row.title,
    description: row.description,
    category: row.category,
    schemaJson: row.schema_json,
    schemaVersion: row.schema_version,
    status: row.status,
    accessMode: row.access_mode,
    discoverable: row.discoverable === true,
    publicToken: row.public_token,
    publishedAt: row.published_at,
    unpublishedAt: row.unpublished_at,
    createdByIdentityId: row.created_by_identity_id,
    updatedByIdentityId: row.updated_by_identity_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    branchId: row.branch_id || null,
    facilityId: row.facility_id || null,
    requireConsent: row.require_consent !== false,
    linkedResourceType: row.linked_resource_type || null,
    linkedResourceId: row.linked_resource_id || null,
    registrationClosed: row.registration_closed === true,
    maxSubmissions: row.max_submissions != null ? Number(row.max_submissions) : null,
  };
}

function mapSubmission(row, { includeInternalNotes } = {}) {
  if (!row) return null;
  const out = {
    id: row.id,
    formId: row.form_id,
    organizationId: row.organization_id,
    productCode: row.product_code,
    schemaVersion: row.schema_version,
    answersJson: row.answers_json,
    submitterEmail: row.submitter_email,
    accessTokenId: row.access_token_id,
    status: row.status,
    reviewStatus: row.review_status || row.status || "submitted",
    idempotencyKey: row.idempotency_key || null,
    consentAcceptedAt: row.consent_accepted_at || null,
    branchId: row.branch_id || null,
    facilityId: row.facility_id || null,
    reviewedByIdentityId: row.reviewed_by_identity_id || null,
    reviewedAt: row.reviewed_at || null,
    statusHistory: row.status_history_json || [],
    submittedAt: row.submitted_at,
  };
  if (includeInternalNotes) {
    out.internalNotes = row.internal_notes || null;
  }
  return out;
}

async function insertForm(client, row) {
  const result = await client.query(
    `INSERT INTO platform.tenant_forms (
       organization_id, product_code, form_key, title, description, category,
       schema_json, schema_version, status, access_mode, discoverable, public_token,
       created_by_identity_id, updated_by_identity_id,
       branch_id, facility_id, require_consent,
       linked_resource_type, linked_resource_id, registration_closed, max_submissions
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$13,
       $14,$15,COALESCE($16, true),$17,$18,COALESCE($19, false),$20
     )
     RETURNING ${FORM_COLUMNS}`,
    [
      row.organizationId,
      row.productCode,
      row.formKey,
      row.title,
      row.description,
      row.category,
      JSON.stringify(row.schemaJson),
      row.schemaVersion || 1,
      row.status || "draft",
      row.accessMode || "open_public",
      row.discoverable === true,
      row.publicToken,
      row.createdByIdentityId || null,
      row.branchId || null,
      row.facilityId || null,
      row.requireConsent !== false,
      row.linkedResourceType || null,
      row.linkedResourceId || null,
      row.registrationClosed === true,
      row.maxSubmissions != null ? row.maxSubmissions : null,
    ]
  );
  return mapForm(result.rows[0]);
}

async function updateForm(client, input) {
  const result = await client.query(
    `UPDATE platform.tenant_forms SET
       title = COALESCE($4, title),
       description = CASE WHEN $5::boolean THEN $6 ELSE description END,
       category = COALESCE($7, category),
       schema_json = COALESCE($8::jsonb, schema_json),
       schema_version = COALESCE($9, schema_version),
       status = COALESCE($10, status),
       access_mode = COALESCE($11, access_mode),
       discoverable = COALESCE($12, discoverable),
       published_at = CASE WHEN $13::boolean THEN $14 ELSE published_at END,
       unpublished_at = CASE WHEN $15::boolean THEN $16 ELSE unpublished_at END,
       updated_by_identity_id = $17,
       linked_resource_type = CASE WHEN $18::boolean THEN $19 ELSE linked_resource_type END,
       linked_resource_id = CASE WHEN $18::boolean THEN $20 ELSE linked_resource_id END,
       registration_closed = COALESCE($21, registration_closed),
       max_submissions = CASE WHEN $22::boolean THEN $23 ELSE max_submissions END,
       updated_at = now()
     WHERE id = $1
       AND organization_id = $2
       AND product_code = $3
     RETURNING ${FORM_COLUMNS}`,
    [
      input.id,
      input.organizationId,
      input.productCode,
      input.title != null ? input.title : null,
      input.clearDescription === true || input.description !== undefined,
      input.description != null ? input.description : null,
      input.category != null ? input.category : null,
      input.schemaJson != null ? JSON.stringify(input.schemaJson) : null,
      input.schemaVersion != null ? input.schemaVersion : null,
      input.status != null ? input.status : null,
      input.accessMode != null ? input.accessMode : null,
      input.discoverable != null ? input.discoverable === true : null,
      input.setPublishedAt === true,
      input.publishedAt || null,
      input.setUnpublishedAt === true,
      input.unpublishedAt || null,
      input.updatedByIdentityId || null,
      input.setLinkedResource === true,
      input.linkedResourceType != null ? input.linkedResourceType : null,
      input.linkedResourceId != null ? input.linkedResourceId : null,
      input.registrationClosed != null ? input.registrationClosed === true : null,
      input.setMaxSubmissions === true,
      input.maxSubmissions != null ? input.maxSubmissions : null,
    ]
  );
  return mapForm(result.rows[0] || null);
}

async function getFormById(client, { id, organizationId, productCode }) {
  const result = await client.query(
    `SELECT ${FORM_COLUMNS}
       FROM platform.tenant_forms
      WHERE id = $1
        AND organization_id = $2
        AND product_code = $3
      LIMIT 1`,
    [id, organizationId, productCode]
  );
  return mapForm(result.rows[0] || null);
}

async function getFormByPublicToken(client, { publicToken, productCode }) {
  const result = await client.query(
    `SELECT ${FORM_COLUMNS}
       FROM platform.tenant_forms
      WHERE public_token = $1
        AND product_code = $2
      LIMIT 1`,
    [publicToken, productCode]
  );
  return mapForm(result.rows[0] || null);
}

async function listForms(client, { organizationId, productCode, status }) {
  const params = [organizationId, productCode];
  let sql = `
    SELECT ${FORM_COLUMNS}
      FROM platform.tenant_forms
     WHERE organization_id = $1
       AND product_code = $2`;
  if (status) {
    params.push(status);
    sql += ` AND status = $${params.length}`;
  }
  sql += ` ORDER BY updated_at DESC, title ASC`;
  const result = await client.query(sql, params);
  return result.rows.map(mapForm);
}

async function insertVersion(client, row) {
  const result = await client.query(
    `INSERT INTO platform.tenant_form_versions (
       form_id, organization_id, schema_version, schema_json, access_mode, title,
       published_by_identity_id
     ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7)
     RETURNING id, form_id, organization_id, schema_version, schema_json, access_mode,
               title, published_at, published_by_identity_id`,
    [
      row.formId,
      row.organizationId,
      row.schemaVersion,
      JSON.stringify(row.schemaJson),
      row.accessMode,
      row.title,
      row.publishedByIdentityId || null,
    ]
  );
  const r = result.rows[0];
  return {
    id: r.id,
    formId: r.form_id,
    organizationId: r.organization_id,
    schemaVersion: r.schema_version,
    schemaJson: r.schema_json,
    accessMode: r.access_mode,
    title: r.title,
    publishedAt: r.published_at,
    publishedByIdentityId: r.published_by_identity_id,
  };
}

async function listVersions(client, { formId, organizationId }) {
  const result = await client.query(
    `SELECT id, form_id, organization_id, schema_version, schema_json, access_mode,
            title, published_at, published_by_identity_id
       FROM platform.tenant_form_versions
      WHERE form_id = $1 AND organization_id = $2
      ORDER BY schema_version DESC`,
    [formId, organizationId]
  );
  return result.rows.map((r) => ({
    id: r.id,
    formId: r.form_id,
    organizationId: r.organization_id,
    schemaVersion: r.schema_version,
    schemaJson: r.schema_json,
    accessMode: r.access_mode,
    title: r.title,
    publishedAt: r.published_at,
    publishedByIdentityId: r.published_by_identity_id,
  }));
}

async function insertAccessToken(client, row) {
  const result = await client.query(
    `INSERT INTO platform.tenant_form_access_tokens (
       form_id, organization_id, email_normalized, token_hash, expires_at,
       created_by_identity_id
     ) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (form_id, email_normalized) DO UPDATE SET
       token_hash = EXCLUDED.token_hash,
       expires_at = EXCLUDED.expires_at,
       used_at = NULL,
       revoked_at = NULL,
       created_by_identity_id = EXCLUDED.created_by_identity_id,
       created_at = now()
     RETURNING id, form_id, organization_id, email_normalized, token_hash,
               expires_at, used_at, revoked_at, created_at`,
    [
      row.formId,
      row.organizationId,
      row.emailNormalized,
      row.tokenHash,
      row.expiresAt || null,
      row.createdByIdentityId || null,
    ]
  );
  const r = result.rows[0];
  return {
    id: r.id,
    formId: r.form_id,
    organizationId: r.organization_id,
    emailNormalized: r.email_normalized,
    tokenHash: r.token_hash,
    expiresAt: r.expires_at,
    usedAt: r.used_at,
    revokedAt: r.revoked_at,
    createdAt: r.created_at,
  };
}

async function findAccessTokenByHash(client, { formId, tokenHash }) {
  const result = await client.query(
    `SELECT id, form_id, organization_id, email_normalized, token_hash,
            expires_at, used_at, revoked_at, created_at
       FROM platform.tenant_form_access_tokens
      WHERE form_id = $1
        AND token_hash = $2
        AND revoked_at IS NULL
      LIMIT 1`,
    [formId, tokenHash]
  );
  const r = result.rows[0];
  if (!r) return null;
  return {
    id: r.id,
    formId: r.form_id,
    organizationId: r.organization_id,
    emailNormalized: r.email_normalized,
    tokenHash: r.token_hash,
    expiresAt: r.expires_at,
    usedAt: r.used_at,
    revokedAt: r.revoked_at,
    createdAt: r.created_at,
  };
}

async function markAccessTokenUsed(client, { id, organizationId }) {
  await client.query(
    `UPDATE platform.tenant_form_access_tokens
        SET used_at = now()
      WHERE id = $1 AND organization_id = $2 AND used_at IS NULL`,
    [id, organizationId]
  );
}

async function insertSubmission(client, row) {
  const history = [
    {
      at: new Date().toISOString(),
      to: "submitted",
      by: null,
      note: "public_submit",
    },
  ];
  const result = await client.query(
    `INSERT INTO platform.tenant_form_submissions (
       form_id, organization_id, product_code, schema_version, answers_json,
       submitter_email, access_token_id, status, review_status, idempotency_key,
       consent_accepted_at, branch_id, facility_id, status_history_json
     ) VALUES (
       $1,$2,$3,$4,$5::jsonb,$6,$7,'submitted','submitted',$8,$9,$10,$11,$12::jsonb
     )
     RETURNING ${SUBMISSION_COLUMNS}`,
    [
      row.formId,
      row.organizationId,
      row.productCode,
      row.schemaVersion,
      JSON.stringify(row.answersJson),
      row.submitterEmail || null,
      row.accessTokenId || null,
      row.idempotencyKey || null,
      row.consentAcceptedAt || null,
      row.branchId || null,
      row.facilityId || null,
      JSON.stringify(history),
    ]
  );
  return mapSubmission(result.rows[0], { includeInternalNotes: false });
}

async function findSubmissionByIdempotency(client, { formId, idempotencyKey }) {
  if (!idempotencyKey) return null;
  const result = await client.query(
    `SELECT ${SUBMISSION_COLUMNS}
       FROM platform.tenant_form_submissions
      WHERE form_id = $1 AND idempotency_key = $2
      LIMIT 1`,
    [formId, idempotencyKey]
  );
  return mapSubmission(result.rows[0] || null, { includeInternalNotes: false });
}

async function getSubmissionById(
  client,
  { id, organizationId, formId, includeInternalNotes, branchId, facilityId }
) {
  const params = [id, organizationId];
  let sql = `
    SELECT ${SUBMISSION_COLUMNS}
      FROM platform.tenant_form_submissions
     WHERE id = $1 AND organization_id = $2`;
  if (formId) {
    params.push(formId);
    sql += ` AND form_id = $${params.length}`;
  }
  if (branchId) {
    params.push(branchId);
    sql += ` AND branch_id = $${params.length}`;
  }
  if (facilityId) {
    params.push(facilityId);
    sql += ` AND facility_id = $${params.length}`;
  }
  sql += ` LIMIT 1`;
  const result = await client.query(sql, params);
  return mapSubmission(result.rows[0] || null, {
    includeInternalNotes: includeInternalNotes === true,
  });
}

async function listSubmissions(
  client,
  {
    formId,
    organizationId,
    limit,
    reviewStatus,
    branchId,
    facilityId,
    includeInternalNotes,
  }
) {
  const params = [formId, organizationId];
  let sql = `
    SELECT ${SUBMISSION_COLUMNS}
      FROM platform.tenant_form_submissions
     WHERE form_id = $1 AND organization_id = $2`;
  if (reviewStatus) {
    params.push(reviewStatus);
    sql += ` AND review_status = $${params.length}`;
  }
  if (branchId) {
    params.push(branchId);
    sql += ` AND branch_id = $${params.length}`;
  }
  if (facilityId) {
    params.push(facilityId);
    sql += ` AND facility_id = $${params.length}`;
  }
  params.push(Math.min(Math.max(Number(limit) || 50, 1), 200));
  sql += ` ORDER BY submitted_at DESC LIMIT $${params.length}`;
  const result = await client.query(sql, params);
  return result.rows.map((r) =>
    mapSubmission(r, { includeInternalNotes: includeInternalNotes === true })
  );
}

async function updateSubmissionReview(client, row) {
  const result = await client.query(
    `UPDATE platform.tenant_form_submissions SET
       review_status = $4,
       status = CASE WHEN $4 = 'closed' THEN 'archived' ELSE 'submitted' END,
       internal_notes = CASE WHEN $5::boolean THEN $6 ELSE internal_notes END,
       reviewed_by_identity_id = $7,
       reviewed_at = now(),
       status_history_json = COALESCE(status_history_json, '[]'::jsonb) || $8::jsonb
     WHERE id = $1
       AND organization_id = $2
       AND form_id = $3
     RETURNING ${SUBMISSION_COLUMNS}`,
    [
      row.id,
      row.organizationId,
      row.formId,
      row.reviewStatus,
      row.setInternalNotes === true,
      row.internalNotes != null ? row.internalNotes : null,
      row.reviewedByIdentityId || null,
      JSON.stringify([row.historyEntry || {}]),
    ]
  );
  return mapSubmission(result.rows[0] || null, { includeInternalNotes: true });
}

async function hitSubmissionRateLimit(client, { formId, bucketKey, maxHits, windowMs }) {
  const windowStart = new Date(Date.now() - windowMs);
  const existing = await client.query(
    `SELECT id, hit_count, window_started_at
       FROM platform.tenant_form_submission_rate_limits
      WHERE form_id = $1 AND bucket_key = $2
      LIMIT 1`,
    [formId, bucketKey]
  );
  if (!existing.rows[0]) {
    await client.query(
      `INSERT INTO platform.tenant_form_submission_rate_limits (form_id, bucket_key, hit_count)
       VALUES ($1, $2, 1)
       ON CONFLICT (form_id, bucket_key) DO UPDATE SET
         hit_count = platform.tenant_form_submission_rate_limits.hit_count + 1,
         window_started_at = CASE
           WHEN platform.tenant_form_submission_rate_limits.window_started_at < $3
             THEN now()
           ELSE platform.tenant_form_submission_rate_limits.window_started_at
         END`,
      [formId, bucketKey, windowStart]
    );
    return { ok: true, limited: false };
  }
  const row = existing.rows[0];
  const started = new Date(row.window_started_at);
  if (started < windowStart) {
    await client.query(
      `UPDATE platform.tenant_form_submission_rate_limits
          SET hit_count = 1, window_started_at = now()
        WHERE id = $1`,
      [row.id]
    );
    return { ok: true, limited: false };
  }
  if (row.hit_count >= maxHits) {
    return { ok: true, limited: true };
  }
  await client.query(
    `UPDATE platform.tenant_form_submission_rate_limits
        SET hit_count = hit_count + 1
      WHERE id = $1`,
    [row.id]
  );
  return { ok: true, limited: false };
}

async function listFormsCrossTenant(client, { productCode, limit }) {
  const params = [];
  let sql = `
    SELECT f.id, f.organization_id, f.product_code, f.form_key, f.title, f.status,
           f.access_mode, f.discoverable, f.schema_version, f.updated_at,
           o.organization_key, o.display_name AS organization_name,
           (
             SELECT count(*)::int FROM platform.tenant_form_submissions s
              WHERE s.form_id = f.id
           ) AS submission_count
      FROM platform.tenant_forms f
      JOIN platform.organizations o ON o.id = f.organization_id
     WHERE 1=1`;
  if (productCode) {
    params.push(productCode);
    sql += ` AND f.product_code = $${params.length}`;
  }
  params.push(Math.min(Math.max(Number(limit) || 100, 1), 500));
  sql += ` ORDER BY f.updated_at DESC LIMIT $${params.length}`;
  const result = await client.query(sql, params);
  return result.rows.map((r) => ({
    id: r.id,
    organizationId: r.organization_id,
    organizationKey: r.organization_key,
    organizationName: r.organization_name,
    productCode: r.product_code,
    formKey: r.form_key,
    title: r.title,
    status: r.status,
    accessMode: r.access_mode,
    discoverable: r.discoverable === true,
    schemaVersion: r.schema_version,
    submissionCount: r.submission_count,
    updatedAt: r.updated_at,
  }));
}

async function findOpenSubmissionByEmail(client, { formId, email }) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;
  const result = await client.query(
    `SELECT ${SUBMISSION_COLUMNS}
       FROM platform.tenant_form_submissions
      WHERE form_id = $1
        AND lower(submitter_email) = $2
        AND review_status IN ('submitted', 'in_review', 'accepted')
      LIMIT 1`,
    [formId, normalized]
  );
  return mapSubmission(result.rows[0] || null, { includeInternalNotes: false });
}

async function countOpenSubmissions(client, { formId }) {
  const result = await client.query(
    `SELECT count(*)::int AS c
       FROM platform.tenant_form_submissions
      WHERE form_id = $1
        AND review_status IN ('submitted', 'in_review', 'accepted')`,
    [formId]
  );
  return result.rows[0] ? Number(result.rows[0].c) : 0;
}

async function getPublishedFormByLinkedResource(client, {
  organizationId,
  productCode,
  linkedResourceType,
  linkedResourceId,
}) {
  const result = await client.query(
    `SELECT ${FORM_COLUMNS}
       FROM platform.tenant_forms
      WHERE organization_id = $1
        AND product_code = $2
        AND linked_resource_type = $3
        AND linked_resource_id = $4
        AND status = 'published'
      ORDER BY published_at DESC NULLS LAST
      LIMIT 1`,
    [organizationId, productCode, linkedResourceType, linkedResourceId]
  );
  return mapForm(result.rows[0] || null);
}

module.exports = {
  insertForm,
  updateForm,
  getFormById,
  getFormByPublicToken,
  listForms,
  insertVersion,
  listVersions,
  insertAccessToken,
  findAccessTokenByHash,
  markAccessTokenUsed,
  insertSubmission,
  findSubmissionByIdempotency,
  findOpenSubmissionByEmail,
  countOpenSubmissions,
  getPublishedFormByLinkedResource,
  getSubmissionById,
  listSubmissions,
  updateSubmissionReview,
  hitSubmissionRateLimit,
  listFormsCrossTenant,
};
