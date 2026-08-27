"use strict";

/**
 * Field-level website scope settings persistence (Prompt 7 Stage 1–2).
 * No active row = inherit. Reset deactivates the override without copying church values.
 */

const registry = require("../services/websiteSettingKeyRegistry");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

const INHERITANCE_STATE = Object.freeze({
  INHERIT: "inherit",
  OVERRIDE: "override",
  HIDDEN: "hidden",
  LOCKED: "locked",
});

const SETTING_KEYS = registry.SETTING_KEYS;
const STAGE2_SETTING_KEYS = registry.STAGE2_SETTING_KEYS;

function normalizeSettingKey(raw) {
  return registry.normalizeSettingKey(raw);
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    churchId: row.church_id,
    branchId: row.branch_id,
    settingKey: row.setting_key,
    inheritanceState: row.inheritance_state,
    valueJson: row.value_json && typeof row.value_json === "object" ? row.value_json : {},
    previousValueJson:
      row.previous_value_json && typeof row.previous_value_json === "object"
        ? row.previous_value_json
        : null,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/**
 * @param {{ query: Function }} db
 * @param {{ churchId: string, branchId: string, settingKey: string }} scope
 */
async function findActive(db, scope) {
  const settingKey = normalizeSettingKey(scope.settingKey);
  if (!isUuid(scope.churchId) || !isUuid(scope.branchId) || !settingKey) return null;
  const res = await db.query(
    `SELECT * FROM blessboard.website_scope_settings
      WHERE church_id = $1 AND branch_id = $2 AND setting_key = $3 AND is_active = true
      LIMIT 1`,
    [scope.churchId, scope.branchId, settingKey]
  );
  return mapRow(res.rows[0] || null);
}

/**
 * @param {{ query: Function }} db
 * @param {{ churchId: string, branchId: string }} scope
 */
async function listActiveForBranch(db, scope) {
  if (!isUuid(scope.churchId) || !isUuid(scope.branchId)) return [];
  const res = await db.query(
    `SELECT * FROM blessboard.website_scope_settings
      WHERE church_id = $1 AND branch_id = $2 AND is_active = true
      ORDER BY setting_key ASC`,
    [scope.churchId, scope.branchId]
  );
  return (res.rows || []).map(mapRow);
}

/**
 * Active overrides for one setting key across every branch of a church.
 * Used by sitemap generation, which must not issue a query per branch.
 *
 * @param {{ query: Function }} db
 * @param {{ churchId: string, settingKey: string }} scope
 */
async function listActiveForChurchByKey(db, scope) {
  const settingKey = normalizeSettingKey(scope && scope.settingKey);
  if (!isUuid(scope && scope.churchId) || !settingKey) return [];
  const res = await db.query(
    `SELECT * FROM blessboard.website_scope_settings
      WHERE church_id = $1 AND setting_key = $2 AND is_active = true`,
    [scope.churchId, settingKey]
  );
  return (res.rows || []).map(mapRow);
}

/**
 * Upsert an active override or hidden state. Never writes inheritance_state=inherit.
 * @param {{ query: Function }} db
 * @param {object} input
 */
async function upsertActive(db, input) {
  const settingKey = normalizeSettingKey(input.settingKey);
  if (
    !isUuid(input.organizationId) ||
    !isUuid(input.churchId) ||
    !isUuid(input.branchId) ||
    !settingKey
  ) {
    return null;
  }
  const state = input.inheritanceState === "hidden" ? "hidden" : "override";
  const valueJson =
    input.valueJson && typeof input.valueJson === "object" ? input.valueJson : {};
  const previous =
    input.previousValueJson && typeof input.previousValueJson === "object"
      ? input.previousValueJson
      : null;

  await db.query(
    `UPDATE blessboard.website_scope_settings
        SET is_active = false, updated_at = now(), updated_by = $4
      WHERE church_id = $1 AND branch_id = $2 AND setting_key = $3 AND is_active = true`,
    [input.churchId, input.branchId, settingKey, input.updatedBy || null]
  );

  const res = await db.query(
    `INSERT INTO blessboard.website_scope_settings (
       organization_id, church_id, branch_id, setting_key,
       inheritance_state, value_json, previous_value_json, is_active, updated_by
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, true, $8)
     RETURNING *`,
    [
      input.organizationId,
      input.churchId,
      input.branchId,
      settingKey,
      state,
      JSON.stringify(valueJson),
      previous == null ? null : JSON.stringify(previous),
      input.updatedBy || null,
    ]
  );
  return mapRow(res.rows[0]);
}

/**
 * Reset = deactivate active override so church default resumes immediately.
 * @param {{ query: Function }} db
 * @param {{ churchId: string, branchId: string, settingKey: string, updatedBy?: string|null }} input
 */
async function deactivateOverride(db, input) {
  const settingKey = normalizeSettingKey(input.settingKey);
  if (!isUuid(input.churchId) || !isUuid(input.branchId) || !settingKey) {
    return { ok: false, deactivated: 0 };
  }
  const res = await db.query(
    `UPDATE blessboard.website_scope_settings
        SET is_active = false, updated_at = now(), updated_by = $4
      WHERE church_id = $1 AND branch_id = $2 AND setting_key = $3 AND is_active = true
      RETURNING id`,
    [input.churchId, input.branchId, settingKey, input.updatedBy || null]
  );
  return { ok: true, deactivated: res.rowCount || 0 };
}

module.exports = {
  isUuid,
  SETTING_KEYS,
  STAGE2_SETTING_KEYS,
  INHERITANCE_STATE,
  normalizeSettingKey,
  mapRow,
  findActive,
  listActiveForBranch,
  listActiveForChurchByKey,
  upsertActive,
  deactivateOverride,
};
