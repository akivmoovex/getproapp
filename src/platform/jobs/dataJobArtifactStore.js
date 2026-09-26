"use strict";

/**
 * Ephemeral artifact store for data-job download payloads.
 * Platform owns download handling; products never stream raw buffers themselves.
 * Process-local by design (no shared blob store required for Batch 1).
 */

const artifacts = new Map();
const TTL_MS = 60 * 60 * 1000;

function prune() {
  const now = Date.now();
  for (const [key, value] of artifacts.entries()) {
    if (!value || value.expiresAt <= now) artifacts.delete(key);
  }
}

function putArtifact(jobId, payload) {
  prune();
  const id = String(jobId || "").trim();
  if (!id) return null;
  const body = payload && typeof payload === "object" ? payload : {};
  artifacts.set(id, {
    contentType: body.contentType || "text/csv; charset=utf-8",
    filename: body.filename || "export.csv",
    body: body.body != null ? String(body.body) : "",
    organizationId: body.organizationId || null,
    expiresAt: Date.now() + TTL_MS,
  });
  return `memory:${id}`;
}

function getArtifact(jobId, organizationId) {
  prune();
  const id = String(jobId || "").trim();
  const row = artifacts.get(id);
  if (!row) return null;
  if (
    organizationId &&
    row.organizationId &&
    String(row.organizationId) !== String(organizationId)
  ) {
    return null;
  }
  return row;
}

function clearArtifacts() {
  artifacts.clear();
}

module.exports = {
  putArtifact,
  getArtifact,
  clearArtifacts,
};
