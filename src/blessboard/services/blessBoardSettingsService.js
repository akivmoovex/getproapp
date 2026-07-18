"use strict";

/**
 * BlessBoard V5 church/branch settings services.
 * Idempotent initialize (not called at app startup). Updates are transactional.
 */

const repo = require("../repositories/blessBoardSettingsRepository");
const {
  validateChurchSettingsInput,
  validateBranchSettingsInput,
} = require("./settingsValidation");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  LOOKUP_ERROR: "lookup_error",
});

/**
 * @param {{ connect?: Function, query?: Function }} db
 * @param {(client: object) => Promise<*>} fn
 */
async function withClient(db, fn) {
  let client = null;
  let owned = false;
  try {
    if (db && typeof db.connect === "function") {
      client = await db.connect();
      owned = true;
    } else {
      client = db;
    }
    return await fn(client);
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

/**
 * Ensure a church_settings row exists (idempotent). Safe to call repeatedly.
 * @param {{ connect?: Function, query?: Function }} db
 * @param {string} churchId
 */
async function ensureChurchSettingsInitialized(db, churchId) {
  const id = String(churchId || "").trim();
  if (!id) return { ok: false, status: STATUS.INVALID_INPUT, settings: null };
  try {
    return await withClient(db, async (client) => {
      const displayName = await repo.findChurchDisplayName(client, id);
      if (!displayName) {
        return { ok: false, status: STATUS.NOT_FOUND, settings: null };
      }
      const settings = await repo.ensureChurchSettingsRow(client, {
        churchId: id,
        publicName: displayName,
      });
      if (!settings) {
        return { ok: false, status: STATUS.LOOKUP_ERROR, settings: null };
      }
      return { ok: true, status: STATUS.OK, settings };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, settings: null };
  }
}

/**
 * @param {{ connect?: Function, query?: Function }} db
 * @param {string} branchId
 */
async function ensureBranchSettingsInitialized(db, branchId) {
  const id = String(branchId || "").trim();
  if (!id) return { ok: false, status: STATUS.INVALID_INPUT, settings: null };
  try {
    return await withClient(db, async (client) => {
      const displayName = await repo.findBranchDisplayName(client, id);
      if (!displayName) {
        return { ok: false, status: STATUS.NOT_FOUND, settings: null };
      }
      const settings = await repo.ensureBranchSettingsRow(client, {
        branchId: id,
        publicName: displayName,
      });
      if (!settings) {
        return { ok: false, status: STATUS.LOOKUP_ERROR, settings: null };
      }
      return { ok: true, status: STATUS.OK, settings };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, settings: null };
  }
}

/**
 * Load church settings, initializing defaults if missing.
 * @param {{ connect?: Function, query?: Function }} db
 * @param {string} churchId
 */
async function getChurchSettings(db, churchId) {
  return ensureChurchSettingsInitialized(db, churchId);
}

/**
 * @param {{ connect?: Function, query?: Function }} db
 * @param {string} branchId
 */
async function getBranchSettings(db, branchId) {
  return ensureBranchSettingsInitialized(db, branchId);
}

/**
 * @param {{ connect?: Function, query?: Function }} db
 * @param {string} churchId
 * @param {object} input
 */
async function updateChurchSettings(db, churchId, input) {
  const id = String(churchId || "").trim();
  if (!id) return { ok: false, status: STATUS.INVALID_INPUT, settings: null, reason: "church_id" };

  const validated = validateChurchSettingsInput(input);
  if (!validated.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, settings: null, reason: validated.reason };
  }

  let client = null;
  let owned = false;
  try {
    if (typeof db.connect === "function") {
      client = await db.connect();
      owned = true;
    } else {
      client = db;
    }
    await client.query("BEGIN");
    const displayName = await repo.findChurchDisplayName(client, id);
    if (!displayName) {
      await client.query("ROLLBACK");
      return { ok: false, status: STATUS.NOT_FOUND, settings: null };
    }
    const settings = await repo.upsertChurchSettings(client, id, validated.value);
    if (!settings) {
      await client.query("ROLLBACK");
      return { ok: false, status: STATUS.LOOKUP_ERROR, settings: null };
    }
    await client.query("COMMIT");
    try {
      const { recordBlessBoardAudit } = require("./recordBlessBoardAudit");
      await recordBlessBoardAudit(db, {
        churchId: id,
        actorUserId: input && input.actorUserId,
        actionKey: "settings.church.update",
        entityType: "church_settings",
        entityId: id,
        outcome: "success",
        metadata: { status: "updated" },
      });
    } catch {
      /* audit must not fail settings write */
    }
    return { ok: true, status: STATUS.OK, settings };
  } catch (err) {
    try {
      if (client) await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    const code = err && err.code ? String(err.code) : "";
    if (code === "23514") {
      return { ok: false, status: STATUS.INVALID_INPUT, settings: null, reason: "constraint" };
    }
    return { ok: false, status: STATUS.LOOKUP_ERROR, settings: null };
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

/**
 * @param {{ connect?: Function, query?: Function }} db
 * @param {string} branchId
 * @param {object} input
 */
async function updateBranchSettings(db, branchId, input) {
  const id = String(branchId || "").trim();
  if (!id) return { ok: false, status: STATUS.INVALID_INPUT, settings: null, reason: "branch_id" };

  const validated = validateBranchSettingsInput(input);
  if (!validated.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, settings: null, reason: validated.reason };
  }

  let client = null;
  let owned = false;
  try {
    if (typeof db.connect === "function") {
      client = await db.connect();
      owned = true;
    } else {
      client = db;
    }
    await client.query("BEGIN");
    const displayName = await repo.findBranchDisplayName(client, id);
    if (!displayName) {
      await client.query("ROLLBACK");
      return { ok: false, status: STATUS.NOT_FOUND, settings: null };
    }
    const settings = await repo.upsertBranchSettings(client, id, validated.value);
    if (!settings) {
      await client.query("ROLLBACK");
      return { ok: false, status: STATUS.LOOKUP_ERROR, settings: null };
    }
    await client.query("COMMIT");
    return { ok: true, status: STATUS.OK, settings };
  } catch (err) {
    try {
      if (client) await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    const code = err && err.code ? String(err.code) : "";
    if (code === "23514") {
      return { ok: false, status: STATUS.INVALID_INPUT, settings: null, reason: "constraint" };
    }
    return { ok: false, status: STATUS.LOOKUP_ERROR, settings: null };
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

module.exports = {
  STATUS,
  ensureChurchSettingsInitialized,
  ensureBranchSettingsInitialized,
  getChurchSettings,
  getBranchSettings,
  updateChurchSettings,
  updateBranchSettings,
};
