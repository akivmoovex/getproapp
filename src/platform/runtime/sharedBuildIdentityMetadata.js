"use strict";

/**
 * Shared deployment-level build identity metadata for Hostinger multi-hostname
 * workers that share one application tree but not one process.env.
 *
 * Hostinger injects hPanel env (including GETPRO_GIT_BRANCH) on the apex app
 * only; LiteSpeed spawns a separate lsnode worker per hostname (apex / BB / AC)
 * against the same hbuild directory. Subdomain workers therefore cannot see
 * apex env vars, but they can read a file under the shared app root.
 *
 * File: <appRoot>/.getpro/build-identity.json
 * Written when a worker that has GETPRO_GIT_BRANCH (or other env branch keys)
 * resolves identity; read by sibling workers that lack per-process env.
 */

const fs = require("fs");
const path = require("path");

const SHARED_DIR_NAME = ".getpro";
const SHARED_FILE_NAME = "build-identity.json";
const BRANCH_SOURCE = "shared.build-identity";

/**
 * @param {string} [appRoot]
 * @returns {string}
 */
function resolveSharedBuildIdentityPath(appRoot) {
  const root = appRoot || process.cwd();
  return path.join(root, SHARED_DIR_NAME, SHARED_FILE_NAME);
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
function normalizeBranchLocal(raw) {
  let s = String(raw == null ? "" : raw).trim();
  if (!s) return "";
  if (s.startsWith("refs/heads/")) s = s.slice("refs/heads/".length).trim();
  if (s.startsWith("refs/tags/")) s = s.slice("refs/tags/".length).trim();
  if (!s || /^HEAD$/i.test(s)) return "";
  return s;
}

/**
 * @param {{
 *   appRoot?: string,
 *   branch: string,
 *   gitShaShort?: string|null,
 *   environment?: string|null,
 *   deploymentCode?: string|null,
 *   writtenFrom?: string|null,
 * }} payload
 * @returns {{ ok: boolean, path: string, error?: string }}
 */
function writeSharedBuildIdentityMetadata(payload) {
  const branch = normalizeBranchLocal(payload && payload.branch);
  if (!branch) {
    return { ok: false, path: "", error: "empty_branch" };
  }
  const filePath = resolveSharedBuildIdentityPath(payload.appRoot);
  const dir = path.dirname(filePath);
  const body = {
    branch,
    gitShaShort: payload.gitShaShort
      ? String(payload.gitShaShort).trim().slice(0, 12)
      : null,
    environment: payload.environment ? String(payload.environment).trim() : null,
    deploymentCode: payload.deploymentCode
      ? String(payload.deploymentCode).trim()
      : null,
    writtenFrom: payload.writtenFrom
      ? String(payload.writtenFrom).trim()
      : "env",
    writtenAt: new Date().toISOString(),
  };
  try {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(body, null, 2)}\n`, "utf8");
    fs.renameSync(tmp, filePath);
    return { ok: true, path: filePath };
  } catch (err) {
    return {
      ok: false,
      path: filePath,
      error: err && err.message ? String(err.message).slice(0, 200) : "write_failed",
    };
  }
}

/**
 * @param {{
 *   appRoot?: string,
 *   expectedGitShaShort?: string|null,
 * }} [options]
 * @returns {{ branch: string, source: string, gitShaShort: string|null } | null}
 */
function readSharedBuildIdentityMetadata(options) {
  const opts = options || {};
  const filePath = resolveSharedBuildIdentityPath(opts.appRoot);
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const branch = normalizeBranchLocal(raw && raw.branch);
    if (!branch) return null;
    const fileSha = raw && raw.gitShaShort
      ? String(raw.gitShaShort).trim().slice(0, 12)
      : null;
    const expected = opts.expectedGitShaShort
      ? String(opts.expectedGitShaShort).trim().slice(0, 12)
      : null;
    // Ignore stale metadata from a previous deploy when SHA is known and differs.
    if (expected && fileSha && expected !== fileSha) return null;
    return {
      branch,
      source: BRANCH_SOURCE,
      gitShaShort: fileSha,
    };
  } catch {
    return null;
  }
}

module.exports = {
  SHARED_DIR_NAME,
  SHARED_FILE_NAME,
  BRANCH_SOURCE,
  resolveSharedBuildIdentityPath,
  writeSharedBuildIdentityMetadata,
  readSharedBuildIdentityMetadata,
};
