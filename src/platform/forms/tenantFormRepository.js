"use strict";

const FORM_COLUMNS = `
  id, organization_id, product_code, form_key, title, description, category,
  schema_json, schema_version, status, access_mode, discoverable, public_token,
  published_at, unpublished_at, created_by_identity_id, updated_by_identity_id,
  created_at, updated_at
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
  };
}

async function insertForm(client, row) {
  const result = await client.query(
    `INSERT INTO platform.tenant_forms (
       organization_id, product_code, form_key, title, description, category,
       schema_json, schema_version, status, access_mode, discoverable, public_token,
       created_by_identity_id, updated_by_identity_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$13)
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
  const result = await client.query(
    `INSERT INTO platform.tenant_form_submissions (
       form_id, organization_id, product_code, schema_version, answers_json,
       submitter_email, access_token_id, status
     ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,'submitted')
     RETURNING id, form_id, organization_id, product_code, schema_version,
               answers_json, submitter_email, access_token_id, status, submitted_at`,
    [
      row.formId,
      row.organizationId,
      row.productCode,
      row.schemaVersion,
      JSON.stringify(row.answersJson),
      row.submitterEmail || null,
      row.accessTokenId || null,
    ]
  );
  const r = result.rows[0];
  return {
    id: r.id,
    formId: r.form_id,
    organizationId: r.organization_id,
    productCode: r.product_code,
    schemaVersion: r.schema_version,
    answersJson: r.answers_json,
    submitterEmail: r.submitter_email,
    accessTokenId: r.access_token_id,
    status: r.status,
    submittedAt: r.submitted_at,
  };
}

async function listSubmissions(client, { formId, organizationId, limit }) {
  const result = await client.query(
    `SELECT id, form_id, organization_id, product_code, schema_version,
            answers_json, submitter_email, access_token_id, status, submitted_at
       FROM platform.tenant_form_submissions
      WHERE form_id = $1 AND organization_id = $2
      ORDER BY submitted_at DESC
      LIMIT $3`,
    [formId, organizationId, Math.min(Math.max(Number(limit) || 50, 1), 200)]
  );
  return result.rows.map((r) => ({
    id: r.id,
    formId: r.form_id,
    organizationId: r.organization_id,
    productCode: r.product_code,
    schemaVersion: r.schema_version,
    answersJson: r.answers_json,
    submitterEmail: r.submitter_email,
    accessTokenId: r.access_token_id,
    status: r.status,
    submittedAt: r.submitted_at,
  }));
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
  listSubmissions,
};
