"use strict";

/**
 * Checkpoint store for extract cursors and batch progress (local JSON only).
 */

const fs = require("fs");
const path = require("path");

/**
 * @param {string} [persistPath]
 */
function createCheckpointStore(persistPath) {
  /** @type {Record<string, object>} */
  let data = {};

  if (persistPath && fs.existsSync(persistPath)) {
    data = JSON.parse(fs.readFileSync(persistPath, "utf8"));
  }

  return {
    get(entity) {
      return data[entity] || null;
    },

    save(entity, checkpoint) {
      data[entity] = {
        ...checkpoint,
        updatedAt: new Date().toISOString(),
      };
      if (!persistPath) return;
      const dir = path.dirname(persistPath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(persistPath, JSON.stringify(data, null, 2));
    },

    all() {
      return { ...data };
    },
  };
}

module.exports = {
  createCheckpointStore,
};
