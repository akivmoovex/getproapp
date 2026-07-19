"use strict";

/**
 * Shared parent-scope checks for V4→V5 transforms.
 * Never invent parent UUIDs for unmapped legacy FKs (orphan fail-closed).
 */

const { quarantine } = require("./helpers");

/**
 * @param {object} idMap
 * @param {string} legacyTable
 * @param {string|number|null|undefined} legacyId
 * @param {string} reason
 * @param {object} row
 * @returns {{ ok: true, id: string } | { ok: false, result: object }}
 */
function requireMappedParent(idMap, legacyTable, legacyId, reason, row) {
  if (legacyId == null || legacyId === "") {
    return { ok: false, result: quarantine(reason, row) };
  }
  if (!idMap || typeof idMap.has !== "function" || !idMap.has(legacyTable, legacyId)) {
    return { ok: false, result: quarantine(reason, row) };
  }
  return { ok: true, id: idMap.resolve(legacyTable, legacyId) };
}

module.exports = {
  requireMappedParent,
};
