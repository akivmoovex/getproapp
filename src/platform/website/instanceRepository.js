"use strict";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "website_instance_not_found",
  SLUG_COLLISION: "slug_collision",
  DUPLICATE: "website_instance_exists",
  TENANT_MISMATCH: "tenant_mismatch",
});

function mapInstance(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    productCode: row.product_code,
    templateId: row.template_id,
    templateVersion: Number(row.template_version),
    slug: row.slug,
    status: row.status,
    scopeKind: row.scope_kind,
    scopeRef: row.scope_ref || null,
    publishedAt: row.published_at,
    lastEditorIdentityId: row.last_editor_identity_id,
    lastPublishedAt: row.last_published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lifecycleStatus: row.lifecycle_status || "provisional",
    publishPolicy: row.publish_policy || "REVIEW_BEFORE_PUBLISH",
    adapterMode: row.adapter_mode || "shared_engine",
    lifecycleReason: row.lifecycle_reason || null,
    lifecycleNotePublic: row.lifecycle_note_public || null,
    lifecycleNoteInternal: row.lifecycle_note_internal || null,
    lifecycleChangedAt: row.lifecycle_changed_at || null,
    lifecycleChangedBy: row.lifecycle_changed_by || null,
    previousLifecycleStatus: row.previous_lifecycle_status || null,
    editLocked: row.edit_locked === true,
    publishLocked: row.publish_locked === true,
  };
}

function normalizeSlug(raw) {
  const slug = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(slug)) return null;
  return slug;
}

async function findWebsiteInstanceById(db, instanceId, organizationId) {
  // Organization id is required. Lookup by instance id alone is an IDOR vector.
  if (!UUID_RE.test(String(instanceId || ""))) return null;
  if (!UUID_RE.test(String(organizationId || ""))) return null;
  const rows = await db.query(
    `SELECT * FROM platform.website_instances WHERE id = $1 AND organization_id = $2`,
    [instanceId, organizationId]
  );
  return mapInstance(rows.rows[0] || null);
}

async function findWebsiteInstanceByOrgProduct(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const productCode = String((input && input.productCode) || "").trim();
  if (!UUID_RE.test(organizationId) || !productCode) return null;
  const explicitScope = Boolean(input && Object.prototype.hasOwnProperty.call(input, "scopeRef"));
  if (!explicitScope) {
    const rows = await db.query(
      `SELECT * FROM platform.website_instances
        WHERE organization_id = $1
          AND product_code = $2
          AND status <> 'archived'
        ORDER BY CASE WHEN scope_ref IS NULL THEN 0 ELSE 1 END, created_at ASC
        LIMIT 1`,
      [organizationId, productCode]
    );
    return mapInstance(rows.rows[0] || null);
  }
  const scopeRef = input.scopeRef || null;
  const rows = await db.query(
    `SELECT * FROM platform.website_instances
      WHERE organization_id = $1
        AND product_code = $2
        AND COALESCE(scope_ref, '00000000-0000-0000-0000-000000000000'::uuid)
            = COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        AND status <> 'archived'
      LIMIT 1`,
    [organizationId, productCode, scopeRef]
  );
  return mapInstance(rows.rows[0] || null);
}

async function findWebsiteInstanceBySlug(db, productCode, slug) {
  const rows = await db.query(
    `SELECT * FROM platform.website_instances
      WHERE product_code = $1 AND slug = $2 AND status <> 'archived'
      LIMIT 1`,
    [productCode, slug]
  );
  return mapInstance(rows.rows[0] || null);
}

async function allocateUniqueSlug(db, productCode, desired) {
  let slug = normalizeSlug(desired);
  if (!slug) return { ok: false, code: RESULT.INVALID_INPUT, slug: null };
  for (let i = 0; i < 25; i += 1) {
    const candidate = i === 0 ? slug : `${slug.slice(0, 60)}-${i + 1}`.slice(0, 64);
    const existing = await findWebsiteInstanceBySlug(db, productCode, candidate);
    if (!existing) return { ok: true, slug: candidate };
  }
  return { ok: false, code: RESULT.SLUG_COLLISION, slug: null };
}

async function createWebsiteInstance(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const productCode = String((input && input.productCode) || "").trim();
  const templateId = String((input && input.templateId) || "").trim();
  const templateVersion = Number(input.templateVersion) || 1;
  const scopeKind = String((input && input.scopeKind) || "tenant").trim();
  const scopeRef = input.scopeRef || null;
  const status = String((input && input.status) || "coming_soon").trim();
  if (!UUID_RE.test(organizationId) || !productCode || !templateId) {
    return { ok: false, code: RESULT.INVALID_INPUT, instance: null };
  }

  const existing = await findWebsiteInstanceByOrgProduct(db, {
    organizationId,
    productCode,
    scopeRef,
  });
  if (existing) {
    return { ok: true, code: RESULT.DUPLICATE, instance: existing, created: false };
  }

  const slugResult = await allocateUniqueSlug(db, productCode, input.slug || organizationId.slice(0, 8));
  if (!slugResult.ok) {
    return { ok: false, code: slugResult.code, instance: null };
  }

  try {
    const rows = await db.query(
      `INSERT INTO platform.website_instances (
         organization_id, product_code, template_id, template_version,
         slug, status, scope_kind, scope_ref,
         lifecycle_status, publish_policy, adapter_mode
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        organizationId,
        productCode,
        templateId,
        templateVersion,
        slugResult.slug,
        status,
        scopeKind,
        scopeRef,
        input.lifecycleStatus || "provisional",
        input.publishPolicy || "REVIEW_BEFORE_PUBLISH",
        input.adapterMode || "shared_engine",
      ]
    );
    return { ok: true, code: RESULT.OK, instance: mapInstance(rows.rows[0]), created: true };
  } catch (err) {
    if (err && err.code === "23505") {
      const raced = await findWebsiteInstanceByOrgProduct(db, {
        organizationId,
        productCode,
        scopeRef,
      });
      if (raced) return { ok: true, code: RESULT.DUPLICATE, instance: raced, created: false };
      return { ok: false, code: RESULT.SLUG_COLLISION, instance: null };
    }
    if (err && err.code === "23514") {
      return {
        ok: false,
        code: RESULT.INVALID_INPUT,
        instance: null,
        reason: String(err.message || "website_instances_check_constraint").slice(0, 180),
      };
    }
    throw err;
  }
}

async function updateWebsiteInstance(db, input) {
  const instance = await findWebsiteInstanceById(db, input.instanceId, input.organizationId);
  if (!instance) return { ok: false, code: RESULT.NOT_FOUND, instance: null };
  const status = input.status != null ? String(input.status) : instance.status;
  const templateVersion =
    input.templateVersion != null ? Number(input.templateVersion) : instance.templateVersion;
  const lastEditor = input.lastEditorIdentityId || instance.lastEditorIdentityId;
  const rows = await db.query(
    `UPDATE platform.website_instances
        SET status = $2,
            template_version = $3,
            last_editor_identity_id = $4,
            last_published_at = COALESCE($5, last_published_at),
            published_at = COALESCE($6, published_at),
            updated_at = now()
      WHERE id = $1 AND organization_id = $7
      RETURNING *`,
    [
      instance.id,
      status,
      templateVersion,
      lastEditor,
      input.lastPublishedAt || null,
      input.publishedAt || null,
      instance.organizationId,
    ]
  );
  return { ok: true, code: RESULT.OK, instance: mapInstance(rows.rows[0]) };
}

async function listWebsiteInstancesForOrganization(db, organizationId, productCode) {
  if (!UUID_RE.test(String(organizationId || ""))) return [];
  const params = [organizationId];
  let sql = `SELECT * FROM platform.website_instances WHERE organization_id = $1 AND status <> 'archived'`;
  if (productCode) {
    sql += ` AND product_code = $2`;
    params.push(productCode);
  }
  sql += ` ORDER BY created_at ASC`;
  const rows = await db.query(sql, params);
  return rows.rows.map(mapInstance);
}

async function listWebsiteInstancesByProduct(db, productCode) {
  const rows = await db.query(
    `SELECT * FROM platform.website_instances
      WHERE product_code = $1 AND status <> 'archived'
      ORDER BY created_at ASC`,
    [productCode]
  );
  return rows.rows.map(mapInstance);
}

module.exports = {
  RESULT,
  UUID_RE,
  mapInstance,
  normalizeSlug,
  findWebsiteInstanceById,
  findWebsiteInstanceByOrgProduct,
  findWebsiteInstanceBySlug,
  allocateUniqueSlug,
  createWebsiteInstance,
  updateWebsiteInstance,
  listWebsiteInstancesForOrganization,
  listWebsiteInstancesByProduct,
};
