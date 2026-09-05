"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const V5_TO_V7_NAMESPACE = "a3f2c8d1-5e4b-4f9a-9c2d-7b6e5f4a3c2d";

function uuidFromNamespaceAndName(namespaceUuid, name) {
  const ns = Buffer.from(String(namespaceUuid).replace(/-/g, ""), "hex");
  if (ns.length !== 16) throw new Error("invalid_namespace_uuid");
  const hash = crypto.createHash("sha1").update(ns).update(String(name)).digest();
  const bytes = Buffer.from(hash.slice(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function mapKey(entityType, legacyId) {
  return `${entityType}:${legacyId}`;
}

function createIdMap(persistPath) {
  const memory = new Map();
  if (persistPath && fs.existsSync(persistPath)) {
    const raw = JSON.parse(fs.readFileSync(persistPath, "utf8"));
    for (const [k, v] of Object.entries(raw.entries || {})) memory.set(k, v);
  }
  return {
    remember(entityType, legacyId, targetId) {
      memory.set(mapKey(entityType, legacyId), String(targetId));
    },
    resolve(entityType, legacyId, fallbackNew = false) {
      const key = mapKey(entityType, legacyId);
      if (memory.has(key)) return memory.get(key);
      if (fallbackNew) {
        const uuid = uuidFromNamespaceAndName(V5_TO_V7_NAMESPACE, key);
        memory.set(key, uuid);
        return uuid;
      }
      return null;
    },
    has(entityType, legacyId) {
      return memory.has(mapKey(entityType, legacyId));
    },
    entries() {
      return Object.fromEntries(memory.entries());
    },
    save() {
      if (!persistPath) return;
      fs.mkdirSync(path.dirname(persistPath), { recursive: true });
      fs.writeFileSync(
        persistPath,
        JSON.stringify({ namespace: V5_TO_V7_NAMESPACE, entries: this.entries() }, null, 2)
      );
    },
  };
}

module.exports = {
  V5_TO_V7_NAMESPACE,
  createIdMap,
  mapKey,
  uuidFromNamespaceAndName,
};
