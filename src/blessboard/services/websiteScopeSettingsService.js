"use strict";

/**
 * Field-level website scope inheritance (Prompt 7 Stage 1 foundation).
 * resolve: branch override → church default → platform fallback (caller supplies defaults).
 * Reset deactivates override; does not copy church values into the branch row.
 */

const scopeRepo = require("../repositories/websiteScopeSettingsRepository");
const {
  assertBranchBelongsToOrg,
  getBranchWebsiteGovernance,
} = require("./branchWebsiteGovernanceService");
const { recordBlessBoardAudit } = require("./recordBlessBoardAudit");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  LOCKED: "locked",
  LOOKUP_ERROR: "lookup_error",
});

const { INHERITANCE_STATE, SETTING_KEYS } = scopeRepo;

/**
 * @param {string} settingKey
 * @param {object|null} activeRow
 * @param {string[]} lockedKeys
 * @param {boolean} hideAllowed
 */
function classifyFieldState(settingKey, activeRow, lockedKeys, hideAllowed) {
  const key = String(settingKey || (activeRow && activeRow.settingKey) || "");
  if (key && Array.isArray(lockedKeys) && lockedKeys.includes(key)) {
    return INHERITANCE_STATE.LOCKED;
  }
  if (!activeRow || !activeRow.isActive) {
    return INHERITANCE_STATE.INHERIT;
  }
  if (activeRow.inheritanceState === "hidden") {
    return hideAllowed ? INHERITANCE_STATE.HIDDEN : INHERITANCE_STATE.OVERRIDE;
  }
  return INHERITANCE_STATE.OVERRIDE;
}

/**
 * Resolve one field for a branch with inheritance metadata.
 * @param {{ query: Function }} db
 * @param {{
 *   organizationId: string,
 *   churchId: string,
 *   branchId: string,
 *   settingKey: string,
 *   churchDefault?: *,
 *   platformFallback?: *,
 * }} input
 */
async function resolveWebsiteScopeField(db, input) {
  const settingKey = scopeRepo.normalizeSettingKey(input.settingKey);
  if (!settingKey) {
    return { ok: false, status: STATUS.INVALID_INPUT, state: null, value: null };
  }

  const check = await assertBranchBelongsToOrg(db, input);
  if (!check.ok) {
    return { ok: false, status: check.status, state: null, value: null };
  }

  try {
    const gov = await getBranchWebsiteGovernance(db, input);
    const lockedKeys =
      gov.ok && gov.effective ? gov.effective.lockedSettingKeys : [];
    const hideAllowed =
      gov.ok && gov.effective ? Boolean(gov.effective.allowHideOptionalPages) : false;

    const active = await scopeRepo.findActive(db, {
      churchId: input.churchId,
      branchId: input.branchId,
      settingKey,
    });
    const state = classifyFieldState(settingKey, active, lockedKeys, hideAllowed);

    if (state === INHERITANCE_STATE.HIDDEN) {
      return {
        ok: true,
        status: STATUS.OK,
        state,
        value: null,
        source: "hidden",
        resettable: true,
      };
    }
    if (state === INHERITANCE_STATE.OVERRIDE) {
      return {
        ok: true,
        status: STATUS.OK,
        state,
        value: active.valueJson,
        source: "branch_override",
        resettable: state !== INHERITANCE_STATE.LOCKED,
      };
    }
    if (state === INHERITANCE_STATE.LOCKED && active && active.isActive) {
      return {
        ok: true,
        status: STATUS.OK,
        state,
        value: active.valueJson,
        source: "locked",
        resettable: false,
      };
    }

    const churchDefault = input.churchDefault !== undefined ? input.churchDefault : null;
    if (churchDefault != null) {
      return {
        ok: true,
        status: STATUS.OK,
        state: INHERITANCE_STATE.INHERIT,
        value: churchDefault,
        source: "church_default",
        resettable: false,
      };
    }
    return {
      ok: true,
      status: STATUS.OK,
      state: INHERITANCE_STATE.INHERIT,
      value: input.platformFallback !== undefined ? input.platformFallback : null,
      source: "platform_fallback",
      resettable: false,
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, state: null, value: null };
  }
}

/**
 * @param {{ query: Function }} db
 * @param {object} input
 */
async function setWebsiteScopeOverride(db, input) {
  const settingKey = scopeRepo.normalizeSettingKey(input.settingKey);
  if (!settingKey) return { ok: false, status: STATUS.INVALID_INPUT, row: null };

  const check = await assertBranchBelongsToOrg(db, input);
  if (!check.ok) return { ok: false, status: check.status, row: null };

  const gov = await getBranchWebsiteGovernance(db, input);
  const lockedKeys =
    gov.ok && gov.effective ? gov.effective.lockedSettingKeys : [];
  if (lockedKeys.includes(settingKey)) {
    return { ok: false, status: STATUS.LOCKED, row: null };
  }
  if (input.inheritanceState === "hidden") {
    const hideAllowed =
      gov.ok && gov.effective ? Boolean(gov.effective.allowHideOptionalPages) : false;
    if (!hideAllowed) return { ok: false, status: STATUS.FORBIDDEN, row: null };
  }

  try {
    const row = await scopeRepo.upsertActive(db, {
      organizationId: input.organizationId,
      churchId: input.churchId,
      branchId: input.branchId,
      settingKey,
      inheritanceState: input.inheritanceState === "hidden" ? "hidden" : "override",
      valueJson: input.valueJson || {},
      previousValueJson: input.previousValueJson || null,
      updatedBy: input.updatedBy || null,
    });
    if (input.actorUserId) {
      await recordBlessBoardAudit(db, {
        organizationId: input.organizationId,
        churchId: input.churchId,
        branchId: input.branchId,
        actorUserId: input.actorUserId,
        actionKey: "website_scope_settings.override",
        entityType: "website_scope_settings",
        entityId: row && row.id,
        metadata: { settingKey, inheritanceState: row && row.inheritanceState },
      });
    }
    return { ok: true, status: STATUS.OK, row };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, row: null };
  }
}

/**
 * Reset field override → inherit church default immediately.
 */
async function resetWebsiteScopeField(db, input) {
  const settingKey = scopeRepo.normalizeSettingKey(input.settingKey);
  if (!settingKey) return { ok: false, status: STATUS.INVALID_INPUT, deactivated: 0 };

  const check = await assertBranchBelongsToOrg(db, input);
  if (!check.ok) return { ok: false, status: check.status, deactivated: 0 };

  const gov = await getBranchWebsiteGovernance(db, input);
  const lockedKeys =
    gov.ok && gov.effective ? gov.effective.lockedSettingKeys : [];
  if (lockedKeys.includes(settingKey)) {
    return { ok: false, status: STATUS.LOCKED, deactivated: 0 };
  }

  try {
    const result = await scopeRepo.deactivateOverride(db, {
      churchId: input.churchId,
      branchId: input.branchId,
      settingKey,
      updatedBy: input.updatedBy || null,
    });
    if (input.actorUserId) {
      await recordBlessBoardAudit(db, {
        organizationId: input.organizationId,
        churchId: input.churchId,
        branchId: input.branchId,
        actorUserId: input.actorUserId,
        actionKey: "website_scope_settings.reset",
        entityType: "website_scope_settings",
        entityId: null,
        metadata: { settingKey, deactivated: result.deactivated },
      });
    }
    return { ok: true, status: STATUS.OK, deactivated: result.deactivated };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, deactivated: 0 };
  }
}

/**
 * Editor-facing states for known setting keys (Stage 3 will render these).
 */
async function listWebsiteScopeFieldStates(db, input) {
  const check = await assertBranchBelongsToOrg(db, input);
  if (!check.ok) return { ok: false, status: check.status, fields: [] };

  try {
    const gov = await getBranchWebsiteGovernance(db, input);
    const lockedKeys =
      gov.ok && gov.effective ? gov.effective.lockedSettingKeys : [];
    const hideAllowed =
      gov.ok && gov.effective ? Boolean(gov.effective.allowHideOptionalPages) : false;
    const activeRows = await scopeRepo.listActiveForBranch(db, {
      churchId: input.churchId,
      branchId: input.branchId,
    });
    const byKey = new Map(activeRows.map((r) => [r.settingKey, r]));
    const keys = Array.isArray(input.settingKeys) && input.settingKeys.length
      ? input.settingKeys.map(scopeRepo.normalizeSettingKey).filter(Boolean)
      : SETTING_KEYS.slice();

    const fields = keys.map((settingKey) => {
      const row = byKey.get(settingKey) || null;
      const state = classifyFieldState(settingKey, row, lockedKeys, hideAllowed);
      return {
        settingKey,
        state,
        resettable: state === INHERITANCE_STATE.OVERRIDE || state === INHERITANCE_STATE.HIDDEN,
        locked: state === INHERITANCE_STATE.LOCKED,
        valueJson: row && state !== INHERITANCE_STATE.INHERIT ? row.valueJson : null,
      };
    });
    return { ok: true, status: STATUS.OK, fields };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, fields: [] };
  }
}

module.exports = {
  STATUS,
  INHERITANCE_STATE,
  SETTING_KEYS,
  classifyFieldState,
  resolveWebsiteScopeField,
  setWebsiteScopeOverride,
  resetWebsiteScopeField,
  listWebsiteScopeFieldStates,
  // re-export for tests / callers that only need the catalog
  isKnownSettingKey: (key) => SETTING_KEYS.includes(scopeRepo.normalizeSettingKey(key)),
};
