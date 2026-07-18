"use strict";

/**
 * Deterministic UUID mapping for legacy integer (or string) PKs.
 * Uses UUID v5 so re-runs produce the same V5 IDs without a database round-trip.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

/** Fixed namespace UUID for BlessBoard V4→V5 migrations (documentation constant). */
const V4_TO_V5_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

function uuidFromNamespaceAndName(namespaceUuid, name) {
  const ns = Buffer.from(String(namespaceUuid).replace(/-/g, ""), "hex");
  if (ns.length !== 16) {
    throw new Error("invalid_namespace_uuid");
  }
  const hash = crypto.createHash("sha1").update(ns).update(String(name)).digest();
  const bytes = Buffer.from(hash.slice(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

function mapKey(legacyTable, legacyId) {
  return `${legacyTable}:${legacyId}`;
}

/**
 * @param {string} [persistPath]
 */
function createIdMap(persistPath) {
  /** @type {Map<string, string>} */
  const memory = new Map();

  if (persistPath && fs.existsSync(persistPath)) {
    const raw = JSON.parse(fs.readFileSync(persistPath, "utf8"));
    for (const [k, v] of Object.entries(raw.entries || {})) {
      memory.set(k, v);
    }
  }

  return {
    /**
     * @param {string} legacyTable
     * @param {string|number} legacyId
     * @param {string} [v5Table]
     */
    resolve(legacyTable, legacyId, v5Table) {
      const key = mapKey(legacyTable, legacyId);
      if (memory.has(key)) return memory.get(key);
      const uuid = uuidFromNamespaceAndName(
        V4_TO_V5_NAMESPACE,
        v5Table ? `${v5Table}|${key}` : key
      );
      memory.set(key, uuid);
      return uuid;
    },

    has(legacyTable, legacyId) {
      return memory.has(mapKey(legacyTable, legacyId));
    },

    entries() {
      return Object.fromEntries(memory.entries());
    },

    save() {
      if (!persistPath) return;
      const dir = path.dirname(persistPath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        persistPath,
        JSON.stringify({ namespace: V4_TO_V5_NAMESPACE, entries: this.entries() }, null, 2)
      );
    },
  };
}

module.exports = {
  V4_TO_V5_NAMESPACE,
  uuidFromNamespaceAndName,
  createIdMap,
  mapKey,
};
