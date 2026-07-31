"use strict";

/**
 * Per-branch website governance persistence (Prompt 7 Stage 1).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

const DEFAULTS = Object.freeze({
  allowLocalGivingMethods: false,
  branchPublishMode: "hq_approval",
  allowUrgentContactUpdates: false,
  allowHideOptionalPages: false,
  hideablePageKeys: Object.freeze([]),
  allowAccentTreatment: false,
  collectionPolicies: Object.freeze({}),
  lockedSettingKeys: Object.freeze([]),
});

const INIT_STATUS = Object.freeze({
  NOT_STARTED: "not_started",
  INITIALIZING: "initializing",
  COMPLETED: "completed",
  FAILED: "failed",
});

function mapRow(row) {
  if (!row) return null;
  return {
    branchId: row.branch_id,
    organizationId: row.organization_id,
    churchId: row.church_id,
    allowLocalGivingMethods: Boolean(row.allow_local_giving_methods),
    branchPublishMode: row.branch_publish_mode || DEFAULTS.branchPublishMode,
    allowUrgentContactUpdates: Boolean(row.allow_urgent_contact_updates),
    allowHideOptionalPages: Boolean(row.allow_hide_optional_pages),
    hideablePageKeys: Array.isArray(row.hideable_page_keys_json)
      ? row.hideable_page_keys_json.slice()
      : [],
    allowAccentTreatment: Boolean(row.allow_accent_treatment),
    collectionPolicies:
      row.collection_policies_json && typeof row.collection_policies_json === "object"
        ? row.collection_policies_json
        : {},
    lockedSettingKeys: Array.isArray(row.locked_setting_keys_json)
      ? row.locked_setting_keys_json.slice()
      : [],
    websiteInitializationStatus:
      row.website_initialization_status || INIT_STATUS.NOT_STARTED,
    initializedFromVersionId: row.initialized_from_version_id || null,
    initializedAt: row.initialized_at || null,
    initializationError: row.initialization_error || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/**
 * @param {{ query: Function }} db
 * @param {string} branchId
 */
async function findByBranchId(db, branchId) {
  if (!isUuid(branchId)) return null;
  const res = await db.query(
    `SELECT * FROM blessboard.branch_website_governance WHERE branch_id = $1 LIMIT 1`,
    [branchId]
  );
  return mapRow(res.rows[0] || null);
}

/**
 * Ensure a restrictive default row exists for a branch.
 * @param {{ query: Function }} db
 * @param {{
 *   branchId: string,
 *   organizationId: string,
 *   churchId: string,
 *   updatedBy?: string|null,
 * }} input
 */
async function ensureDefaults(db, input) {
  if (!isUuid(input.branchId) || !isUuid(input.organizationId) || !isUuid(input.churchId)) {
    return null;
  }
  const res = await db.query(
    `INSERT INTO blessboard.branch_website_governance (
       branch_id, organization_id, church_id,
       allow_local_giving_methods, branch_publish_mode,
       allow_urgent_contact_updates, allow_hide_optional_pages,
       hideable_page_keys_json, allow_accent_treatment,
       collection_policies_json, locked_setting_keys_json, updated_by
     ) VALUES (
       $1, $2, $3, false, 'hq_approval', false, false,
       '[]'::jsonb, false, '{}'::jsonb, '[]'::jsonb, $4
     )
     ON CONFLICT (branch_id) DO NOTHING
     RETURNING *`,
    [input.branchId, input.organizationId, input.churchId, input.updatedBy || null]
  );
  if (res.rows[0]) return mapRow(res.rows[0]);
  return findByBranchId(db, input.branchId);
}

/**
 * @param {{ query: Function }} db
 * @param {{
 *   branchId: string,
 *   organizationId: string,
 *   churchId: string,
 *   allowLocalGivingMethods?: boolean,
 *   branchPublishMode?: string,
 *   allowUrgentContactUpdates?: boolean,
 *   allowHideOptionalPages?: boolean,
 *   hideablePageKeys?: string[],
 *   allowAccentTreatment?: boolean,
 *   collectionPolicies?: object,
 *   lockedSettingKeys?: string[],
 *   updatedBy?: string|null,
 * }} input
 */
async function upsert(db, input) {
  if (!isUuid(input.branchId) || !isUuid(input.organizationId) || !isUuid(input.churchId)) {
    return null;
  }
  const mode =
    input.branchPublishMode === "trusted_direct" ? "trusted_direct" : "hq_approval";
  const res = await db.query(
    `INSERT INTO blessboard.branch_website_governance (
       branch_id, organization_id, church_id,
       allow_local_giving_methods, branch_publish_mode,
       allow_urgent_contact_updates, allow_hide_optional_pages,
       hideable_page_keys_json, allow_accent_treatment,
       collection_policies_json, locked_setting_keys_json, updated_by, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb, $11::jsonb, $12, now()
     )
     ON CONFLICT (branch_id) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       church_id = EXCLUDED.church_id,
       allow_local_giving_methods = EXCLUDED.allow_local_giving_methods,
       branch_publish_mode = EXCLUDED.branch_publish_mode,
       allow_urgent_contact_updates = EXCLUDED.allow_urgent_contact_updates,
       allow_hide_optional_pages = EXCLUDED.allow_hide_optional_pages,
       hideable_page_keys_json = EXCLUDED.hideable_page_keys_json,
       allow_accent_treatment = EXCLUDED.allow_accent_treatment,
       collection_policies_json = EXCLUDED.collection_policies_json,
       locked_setting_keys_json = EXCLUDED.locked_setting_keys_json,
       updated_by = EXCLUDED.updated_by,
       updated_at = now()
     RETURNING *`,
    [
      input.branchId,
      input.organizationId,
      input.churchId,
      Boolean(input.allowLocalGivingMethods),
      mode,
      Boolean(input.allowUrgentContactUpdates),
      Boolean(input.allowHideOptionalPages),
      JSON.stringify(input.hideablePageKeys || []),
      Boolean(input.allowAccentTreatment),
      JSON.stringify(input.collectionPolicies || {}),
      JSON.stringify(input.lockedSettingKeys || []),
      input.updatedBy || null,
    ]
  );
  return mapRow(res.rows[0]);
}

/**
 * Update branch website initialization lifecycle fields only.
 * @param {{ query: Function }} db
 * @param {{
 *   branchId: string,
 *   websiteInitializationStatus: string,
 *   initializedFromVersionId?: string|null,
 *   initializedAt?: string|Date|null,
 *   initializationError?: string|null,
 *   updatedBy?: string|null,
 * }} input
 */
async function updateInitialization(db, input) {
  if (!isUuid(input.branchId)) return null;
  const status = String(input.websiteInitializationStatus || "").trim();
  if (
    status !== INIT_STATUS.NOT_STARTED &&
    status !== INIT_STATUS.INITIALIZING &&
    status !== INIT_STATUS.COMPLETED &&
    status !== INIT_STATUS.FAILED
  ) {
    return null;
  }
  const errorText =
    input.initializationError == null
      ? null
      : String(input.initializationError).trim().slice(0, 500) || null;
  const fromVersion =
    input.initializedFromVersionId != null && isUuid(input.initializedFromVersionId)
      ? input.initializedFromVersionId
      : null;
  const res = await db.query(
    `UPDATE blessboard.branch_website_governance
        SET website_initialization_status = $2,
            initialized_from_version_id = CASE
              WHEN $2 = 'completed' THEN COALESCE($3::uuid, initialized_from_version_id)
              WHEN $2 = 'not_started' THEN NULL
              ELSE initialized_from_version_id
            END,
            initialized_at = CASE
              WHEN $2 = 'completed' THEN COALESCE($4::timestamptz, now())
              WHEN $2 = 'not_started' THEN NULL
              ELSE initialized_at
            END,
            initialization_error = CASE
              WHEN $2 = 'failed' THEN $5
              WHEN $2 = 'completed' THEN NULL
              WHEN $2 = 'initializing' THEN NULL
              ELSE initialization_error
            END,
            updated_by = COALESCE($6, updated_by),
            updated_at = now()
      WHERE branch_id = $1
      RETURNING *`,
    [
      input.branchId,
      status,
      fromVersion,
      input.initializedAt != null ? input.initializedAt : null,
      errorText,
      input.updatedBy || null,
    ]
  );
  return mapRow(res.rows[0] || null);
}

module.exports = {
  isUuid,
  DEFAULTS,
  INIT_STATUS,
  mapRow,
  findByBranchId,
  ensureDefaults,
  upsert,
  updateInitialization,
};
