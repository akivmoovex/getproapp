"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function createAuditStore(outputDir) {
  const runId = crypto.randomBytes(8).toString("hex");
  const startedAt = new Date().toISOString();
  const events = [];

  function record(entityType, stats) {
    events.push({
      at: new Date().toISOString(),
      entityType,
      sourceCount: stats.sourceCount ?? null,
      inserted: stats.inserted ?? 0,
      updated: stats.updated ?? 0,
      skipped: stats.skipped ?? 0,
      conflicted: stats.conflicted ?? 0,
      failed: stats.failed ?? 0,
      notes: stats.notes || null,
    });
  }

  function summary() {
    return {
      runId,
      startedAt,
      completedAt: new Date().toISOString(),
      events,
    };
  }

  function save(filename = "audit.json") {
    if (!outputDir) return summary();
    fs.mkdirSync(outputDir, { recursive: true });
    const payload = summary();
    fs.writeFileSync(path.join(outputDir, filename), JSON.stringify(payload, null, 2));
    return payload;
  }

  return { runId, record, summary, save };
}

module.exports = { createAuditStore };
