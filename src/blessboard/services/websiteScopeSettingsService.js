"use strict";

/**
 * Field-level website scope inheritance (Prompt 7 Stage 1–2).
 * Stage 2: typed validation via registry; explicit audit action keys.
 */

const scopeRepo = require("../repositories/websiteScopeSettingsRepository");
const registry = require("./websiteSettingKeyRegistry");
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
  UNKNOWN_KEY: "unknown_key",
  LOOKUP_ERROR: "lookup_error",
});

const INHERITANCE_STATE = scopeRepo.INHERITANCE_STATE;
const SETTING_KEYS = scopeRepo.SETTING_KEYS;
const STAGE2_SETTING_KEYS = scopeRepo.STAGE2_SETTING_KEYS;

const AUDIT = Object.freeze({
  OVERRIDDEN: "branch_website_setting_overridden",
  RESET: "branch_website_setting_reset",
  HIDDEN: "branch_website_setting_hidden",
  UNHIDDEN: "branch_website_setting_unhidden",
});

/**
 * @param {string} settingKey
 * @param {object|null} activeRow
 * @param {string[]} lockedKeys
 * @param {boolean} hideAllowed
 */
function classifyFieldState(settingKey, activeRow, lockedKeys, hideAllowed) {
  const key = String(settingKey || (activeRow && activeRow.settingKey) || "");
  const def = registry.getKeyDef(key);
  if ((key && Array.isArray(lockedKeys) && lockedKeys.includes(key)) || (def && def.readOnly)) {
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

async function resolveWebsiteScopeField(db, input) {
  const settingKey = scopeRepo.normalizeSettingKey(input.settingKey);
  if (!settingKey) {
    return {
      ok: false,
      status: STATUS.UNKNOWN_KEY,
      state: null,
      value: null,
    };
  }

  const check = await assertBranchBelongsToOrg(db, input);
  if (!check.ok) {
    return { ok: false, status: check.status, state: null, value: null };
  }

  try {
    const gov = await getBranchWebsiteGovernance(db, input);
    const lockedKeys =
      gov.ok && gov.effective ? gov.effective.lockedSettingKeys.slice() : [];
    if (!lockedKeys.includes("presentation.parent_church_label")) {
      lockedKeys.push("presentation.parent_church_label");
    }
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
        value: registry.fromValueJson(active.valueJson),
        source: "branch_override",
        resettable: true,
      };
    }
    if (state === INHERITANCE_STATE.LOCKED && active && active.isActive) {
      return {
        ok: true,
        status: STATUS.OK,
        state,
        value: registry.fromValueJson(active.valueJson),
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
 * Write a typed override (or empty → reset).
 * @param {{ query: Function }} db
 * @param {object} input
 */
async function setWebsiteScopeOverride(db, input) {
  const settingKey = scopeRepo.normalizeSettingKey(input.settingKey);
  if (!settingKey) {
    return { ok: false, status: STATUS.UNKNOWN_KEY, row: null, message: "Unsupported setting key." };
  }

  const def = registry.getKeyDef(settingKey);
  if (def && def.readOnly) {
    return { ok: false, status: STATUS.LOCKED, row: null, message: "Setting is read-only." };
  }
  if (def && def.hqOnly && !input.allowGovernanceControlled) {
    return {
      ok: false,
      status: STATUS.FORBIDDEN,
      row: null,
      message: "Setting requires HQ governance permission.",
    };
  }

  const check = await assertBranchBelongsToOrg(db, input);
  if (!check.ok) return { ok: false, status: check.status, row: null };

  const gov = await getBranchWebsiteGovernance(db, input);
  const lockedKeys =
    gov.ok && gov.effective ? gov.effective.lockedSettingKeys.slice() : [];
  if (!lockedKeys.includes("presentation.parent_church_label")) {
    lockedKeys.push("presentation.parent_church_label");
  }
  if (lockedKeys.includes(settingKey)) {
    return { ok: false, status: STATUS.LOCKED, row: null };
  }

  if (settingKey === "presentation.accent_key") {
    const allowAccent =
      gov.ok && gov.effective ? Boolean(gov.effective.allowAccentTreatment) : false;
    if (!allowAccent) {
      return { ok: false, status: STATUS.FORBIDDEN, row: null, message: "Accent not permitted." };
    }
  }

  const hideRequested = input.inheritanceState === "hidden";
  if (hideRequested) {
    const hideAllowed =
      gov.ok && gov.effective ? Boolean(gov.effective.allowHideOptionalPages) : false;
    if (!hideAllowed) return { ok: false, status: STATUS.FORBIDDEN, row: null };
    if (def && def.hideable === false) {
      return { ok: false, status: STATUS.FORBIDDEN, row: null, message: "Field cannot be hidden." };
    }
  }

  const validated = hideRequested
    ? { ok: true, value: null }
    : (() => {
        if (def && def.group === "legacy") {
          const blob =
            input.valueJson && typeof input.valueJson === "object"
              ? input.valueJson
              : input.value != null
                ? { value: input.value }
                : {};
          return { ok: true, value: blob, legacyBlob: true };
        }
        return registry.validateSettingValue(
          settingKey,
          input.value != null ? input.value : input.valueJson
        );
      })();

  if (!validated.ok) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      row: null,
      reason: validated.reason,
      message: validated.message || "Invalid value.",
    };
  }

  // Empty normalized value → reset rather than store a blank override.
  if (!hideRequested && !validated.legacyBlob && validated.value == null) {
    return resetWebsiteScopeField(db, input);
  }

  try {
    const previous = await scopeRepo.findActive(db, {
      churchId: input.churchId,
      branchId: input.branchId,
      settingKey,
    });
    const previousState = previous
      ? previous.inheritanceState
      : INHERITANCE_STATE.INHERIT;
    const previousValue = previous ? registry.fromValueJson(previous.valueJson) : null;

    const storedJson = hideRequested
      ? {}
      : validated.legacyBlob
        ? validated.value
        : registry.toValueJson(validated.value);

    const row = await scopeRepo.upsertActive(db, {
      organizationId: input.organizationId,
      churchId: input.churchId,
      branchId: input.branchId,
      settingKey,
      inheritanceState: hideRequested ? "hidden" : "override",
      valueJson: storedJson,
      previousValueJson: previous
        ? previous.valueJson
        : previousValue != null
          ? registry.toValueJson(previousValue)
          : null,
      updatedBy: input.updatedBy || input.actorUserId || null,
    });

    if (input.actorUserId) {
      await recordBlessBoardAudit(db, {
        organizationId: input.organizationId,
        churchId: input.churchId,
        branchId: input.branchId,
        actorUserId: input.actorUserId,
        actionKey: hideRequested ? AUDIT.HIDDEN : AUDIT.OVERRIDDEN,
        entityType: "website_scope_settings",
        entityId: row && row.id,
        metadata: {
          setting_key: settingKey,
          previous_state: previousState,
          previous_value: previousValue,
          new_state: hideRequested ? "hidden" : "override",
          new_value: hideRequested
            ? null
            : validated.legacyBlob
              ? validated.value
              : validated.value,
        },
      });
    }
    return {
      ok: true,
      status: STATUS.OK,
      row,
      value: validated.legacyBlob ? validated.value : validated.value,
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, row: null };
  }
}

async function resetWebsiteScopeField(db, input) {
  const settingKey = scopeRepo.normalizeSettingKey(input.settingKey);
  if (!settingKey) {
    return { ok: false, status: STATUS.UNKNOWN_KEY, deactivated: 0 };
  }

  const check = await assertBranchBelongsToOrg(db, input);
  if (!check.ok) return { ok: false, status: check.status, deactivated: 0 };

  const gov = await getBranchWebsiteGovernance(db, input);
  const lockedKeys =
    gov.ok && gov.effective ? gov.effective.lockedSettingKeys.slice() : [];
  if (!lockedKeys.includes("presentation.parent_church_label")) {
    lockedKeys.push("presentation.parent_church_label");
  }
  if (lockedKeys.includes(settingKey)) {
    return { ok: false, status: STATUS.LOCKED, deactivated: 0 };
  }

  try {
    const previous = await scopeRepo.findActive(db, {
      churchId: input.churchId,
      branchId: input.branchId,
      settingKey,
    });
    const previousState = previous
      ? previous.inheritanceState
      : INHERITANCE_STATE.INHERIT;
    const previousValue = previous ? registry.fromValueJson(previous.valueJson) : null;
    const wasHidden = previous && previous.inheritanceState === "hidden";

    const result = await scopeRepo.deactivateOverride(db, {
      churchId: input.churchId,
      branchId: input.branchId,
      settingKey,
      updatedBy: input.updatedBy || input.actorUserId || null,
    });

    if (input.actorUserId && result.deactivated > 0) {
      await recordBlessBoardAudit(db, {
        organizationId: input.organizationId,
        churchId: input.churchId,
        branchId: input.branchId,
        actorUserId: input.actorUserId,
        actionKey: wasHidden ? AUDIT.UNHIDDEN : AUDIT.RESET,
        entityType: "website_scope_settings",
        entityId: previous && previous.id,
        metadata: {
          setting_key: settingKey,
          previous_state: previousState,
          previous_value: previousValue,
          new_state: "inherit",
          new_value: null,
          deactivated: result.deactivated,
        },
      });
    }
    return { ok: true, status: STATUS.OK, deactivated: result.deactivated };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, deactivated: 0 };
  }
}

/**
 * Hide a field where governance permits.
 */
async function hideWebsiteScopeField(db, input) {
  return setWebsiteScopeOverride(db, {
    ...input,
    inheritanceState: "hidden",
    value: null,
  });
}

async function listWebsiteScopeFieldStates(db, input) {
  const check = await assertBranchBelongsToOrg(db, input);
  if (!check.ok) return { ok: false, status: check.status, fields: [] };

  try {
    const gov = await getBranchWebsiteGovernance(db, input);
    const lockedKeys =
      gov.ok && gov.effective ? gov.effective.lockedSettingKeys.slice() : [];
    if (!lockedKeys.includes("presentation.parent_church_label")) {
      lockedKeys.push("presentation.parent_church_label");
    }
    const hideAllowed =
      gov.ok && gov.effective ? Boolean(gov.effective.allowHideOptionalPages) : false;
    const activeRows = await scopeRepo.listActiveForBranch(db, {
      churchId: input.churchId,
      branchId: input.branchId,
    });
    const byKey = new Map(activeRows.map((r) => [r.settingKey, r]));
    const keys =
      Array.isArray(input.settingKeys) && input.settingKeys.length
        ? input.settingKeys.map(scopeRepo.normalizeSettingKey).filter(Boolean)
        : STAGE2_SETTING_KEYS.slice();

    const fields = keys.map((settingKey) => {
      const row = byKey.get(settingKey) || null;
      const state = classifyFieldState(settingKey, row, lockedKeys, hideAllowed);
      return {
        settingKey,
        state,
        resettable: state === INHERITANCE_STATE.OVERRIDE || state === INHERITANCE_STATE.HIDDEN,
        locked: state === INHERITANCE_STATE.LOCKED,
        value: row && state !== INHERITANCE_STATE.INHERIT ? registry.fromValueJson(row.valueJson) : null,
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
  AUDIT,
  INHERITANCE_STATE,
  SETTING_KEYS,
  STAGE2_SETTING_KEYS,
  classifyFieldState,
  resolveWebsiteScopeField,
  setWebsiteScopeOverride,
  resetWebsiteScopeField,
  hideWebsiteScopeField,
  listWebsiteScopeFieldStates,
  isKnownSettingKey: registry.isKnownSettingKey,
};
