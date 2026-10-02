"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { connectionFingerprint } = require("./config");

function buildConnectionPairFingerprint(config) {
  return {
    bbSource: connectionFingerprint(config.bbSourceUrl),
    acSource: config.acSourceExplicit ? connectionFingerprint(config.acSourceUrl) : null,
    target: connectionFingerprint(config.targetUrl),
    sourceIdentity: config.sourceIdentity,
    targetIdentity: config.targetIdentity,
    sourceEnvironment: config.sourceEnvironment,
    targetEnvironment: config.targetEnvironment,
  };
}

function fingerprintHash(pair) {
  return crypto.createHash("sha256").update(JSON.stringify(pair)).digest("hex");
}

function resolveStateDir(explicitDir, root) {
  const fromEnv = process.env.V7_MIGRATION_STATE_DIR;
  if (explicitDir) return path.resolve(String(explicitDir));
  if (fromEnv && String(fromEnv).trim()) return path.resolve(String(fromEnv).trim());
  return path.join(root || process.cwd(), "tmp", "v5-to-v7-migration");
}

function manifestPath(stateDir) {
  return path.join(stateDir, "state", "manifest.json");
}

function loadManifest(stateDir) {
  const p = manifestPath(stateDir);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function saveManifest(stateDir, manifest) {
  const dir = path.join(stateDir, "state");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(manifestPath(stateDir), JSON.stringify(manifest, null, 2));
}

function assertManifestMatches(config, stateDir) {
  const manifest = loadManifest(stateDir);
  if (!manifest) return { ok: true, manifest: null };
  const currentHash = fingerprintHash(buildConnectionPairFingerprint(config));
  if (manifest.connectionPairHash !== currentHash) {
    return {
      ok: false,
      code: "state_fingerprint_mismatch",
      message:
        "Migration state directory was created for a different source/target pair. Use a fresh state dir or the original database pair.",
    };
  }
  return { ok: true, manifest };
}

function ensureManifest(stateDir, audit, config) {
  const gate = assertManifestMatches(config, stateDir);
  if (!gate.ok) {
    const err = new Error(gate.message);
    err.code = gate.code;
    throw err;
  }
  if (gate.manifest) return gate.manifest;
  const pair = buildConnectionPairFingerprint(config);
  const manifest = {
    migrationRunId: audit.runId,
    connectionPairHash: fingerprintHash(pair),
    connectionPair: pair,
    createdAt: new Date().toISOString(),
  };
  saveManifest(stateDir, manifest);
  return manifest;
}

module.exports = {
  buildConnectionPairFingerprint,
  fingerprintHash,
  resolveStateDir,
  loadManifest,
  saveManifest,
  assertManifestMatches,
  ensureManifest,
};
