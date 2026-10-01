"use strict";

/**
 * Shared platform build identity — deployed Git branch, SHA, and environment.
 *
 * Single source for BlessBoard and ActiveClinic UI labels and safe diagnostics.
 * Branch is never hard-coded as V9/V10/V4 in application constants; it comes from
 * deployment metadata (preferred) or a safe Git lookup.
 *
 * Authoritative branch: live `process.env.GETPRO_GIT_BRANCH` when present.
 * Hostinger hPanel env changes require a worker restart/redeploy before the
 * running Node process can observe the new value (no in-process hot reload).
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const { getDeploymentEnvMode } = require("../config/deploymentEnv");
const { resolveDeploymentConfiguration } = require("../config/deploymentProfiles");
const { readGitShaShort } = require("../../startup/startupProcessMarker");

const UNKNOWN_BRANCH = "UNKNOWN";

/** Explicit deployment/build metadata, preferred over repository Git. */
const BRANCH_ENV_KEYS = Object.freeze([
  "GETPRO_GIT_BRANCH",
  "GIT_BRANCH",
  "GITHUB_REF_NAME",
  "VERCEL_GIT_COMMIT_REF",
  "HOSTINGER_GIT_BRANCH",
  "DEPLOYMENT_BRANCH",
]);

const SHA_ENV_KEYS = Object.freeze([
  "GETPRO_GIT_SHA",
  "GIT_SHA",
  "COMMIT_SHA",
]);

/**
 * @param {unknown} raw
 * @returns {string}
 */
function normalizeBranch(raw) {
  let s = String(raw == null ? "" : raw).trim();
  if (!s) return "";
  if (s.startsWith("refs/heads/")) s = s.slice("refs/heads/".length).trim();
  if (s.startsWith("refs/tags/")) s = s.slice("refs/tags/".length).trim();
  if (!s || /^HEAD$/i.test(s)) return "";
  return s;
}

/**
 * Authoritative branch from live process.env.GETPRO_GIT_BRANCH when set.
 * Hostinger injects panel env at worker start — a running process cannot see a
 * newly added panel variable until restart/redeploy. When the key is present on
 * the live process, it always wins over a stale opts.env snapshot.
 * @returns {{ branch: string, source: string } | null}
 */
function resolveAuthoritativeGitBranchFromProcessEnv() {
  const branch = normalizeBranch(process.env.GETPRO_GIT_BRANCH);
  if (branch) return { branch, source: "GETPRO_GIT_BRANCH" };
  return null;
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ branch: string, source: string } | null}
 */
function resolveBranchFromEnv(env) {
  const authoritative = resolveAuthoritativeGitBranchFromProcessEnv();
  if (authoritative) return authoritative;

  const source = env || process.env;
  for (const key of BRANCH_ENV_KEYS) {
    // GETPRO_GIT_BRANCH already checked on live process.env above.
    if (key === "GETPRO_GIT_BRANCH" && source === process.env) continue;
    const branch = normalizeBranch(source[key]);
    if (branch) return { branch, source: key };
  }
  return null;
}

/**
 * Safe Git branch lookup — never invents V9/V10. Detached HEAD → null.
 * @param {string} [appRoot]
 * @returns {{ branch: string, source: string } | null}
 */
function resolveBranchFromGit(appRoot) {
  const root = appRoot || process.cwd();
  try {
    const headPath = path.join(root, ".git", "HEAD");
    if (!fs.existsSync(headPath)) return null;
    const head = fs.readFileSync(headPath, "utf8").trim();
    if (head.startsWith("ref:")) {
      const ref = head.slice(4).trim();
      const match = /^refs\/heads\/(.+)$/.exec(ref);
      if (match && match[1]) {
        const branch = normalizeBranch(match[1]);
        if (branch) return { branch, source: "git.head-ref" };
      }
      return null;
    }
    // Detached HEAD (raw SHA) — cannot infer branch name.
    return null;
  } catch {
    /* fall through */
  }

  try {
    if (!fs.existsSync(path.join(root, ".git"))) return null;
    const out = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: root,
      timeout: 800,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    const branch = normalizeBranch(out);
    if (branch) return { branch, source: "git.abbrev-ref" };
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Full SHA from the same authoritative sources as /healthz (env then .git).
 * @param {{ appRoot?: string, env?: NodeJS.ProcessEnv }} [options]
 * @returns {{ gitSha: string|null, source: string }}
 */
function resolveGitShaFull(options) {
  const opts = options || {};
  const env = opts.env || process.env;
  for (const key of SHA_ENV_KEYS) {
    const raw = String(env[key] || "").trim();
    if (raw) return { gitSha: raw, source: key };
  }

  const root = opts.appRoot || process.cwd();
  try {
    const headPath = path.join(root, ".git", "HEAD");
    if (!fs.existsSync(headPath)) {
      return { gitSha: null, source: "unavailable" };
    }
    const head = fs.readFileSync(headPath, "utf8").trim();
    if (head.startsWith("ref:")) {
      const ref = head.slice(4).trim();
      const refPath = path.join(root, ".git", ref);
      if (fs.existsSync(refPath)) {
        const sha = fs.readFileSync(refPath, "utf8").trim();
        if (sha) return { gitSha: sha, source: "git.ref" };
      }
      return { gitSha: null, source: "unavailable" };
    }
    if (head) return { gitSha: head, source: "git.detached" };
  } catch {
    /* ignore */
  }
  return { gitSha: null, source: "unavailable" };
}

/**
 * @param {{
 *   appRoot?: string,
 *   env?: NodeJS.ProcessEnv,
 * }} [options]
 * @returns {{
 *   branch: string,
 *   branchSource: string,
 *   gitSha: string|null,
 *   gitShaShort: string|null,
 *   environment: "testing"|"production",
 *   deploymentCode: string|null,
 *   displayLabel: string,
 * }}
 */
function getBuildIdentity(options) {
  const opts = options || {};
  const env = opts.env || process.env;
  const deployment = resolveDeploymentConfiguration(env);
  const environment = getDeploymentEnvMode(env);
  const deploymentCode =
    (deployment && deployment.code) ||
    String(env.PLATFORM_DEPLOYMENT_CODE || "").trim() ||
    null;

  const fromEnv = resolveBranchFromEnv(env);
  const fromGit = fromEnv ? null : resolveBranchFromGit(opts.appRoot);
  const branchResolved = fromEnv || fromGit;
  const branch = branchResolved ? branchResolved.branch : UNKNOWN_BRANCH;
  const branchSource = branchResolved ? branchResolved.source : "unknown";

  const shaResolved = resolveGitShaFull(opts);
  let gitSha = shaResolved.gitSha;
  let gitShaShort = null;
  if (gitSha) {
    gitShaShort = gitSha.slice(0, 12);
  } else {
    const short = readGitShaShort(opts.appRoot);
    if (short && !/unavailable/i.test(short)) {
      gitShaShort = short.slice(0, 12);
      gitSha = gitShaShort;
    }
  }

  const displayLabel = `${branch} ${environment}`;

  return Object.freeze({
    branch,
    branchSource,
    gitSha,
    gitShaShort,
    environment,
    deploymentCode,
    displayLabel,
  });
}

/**
 * Public-safe slice for /healthz and similar endpoints (no secrets).
 * @param {ReturnType<typeof getBuildIdentity>} [identity]
 * @param {{ appRoot?: string, env?: NodeJS.ProcessEnv }} [options]
 */
function toPublicBuildIdentityDiagnostics(identity, options) {
  const id = identity || getBuildIdentity(options);
  return {
    branch: id.branch,
    gitSha: id.gitShaShort || id.gitSha || null,
    environment: id.environment,
    deploymentCode: id.deploymentCode,
    displayLabel: id.displayLabel,
  };
}

module.exports = {
  UNKNOWN_BRANCH,
  BRANCH_ENV_KEYS,
  SHA_ENV_KEYS,
  normalizeBranch,
  resolveAuthoritativeGitBranchFromProcessEnv,
  resolveBranchFromEnv,
  resolveBranchFromGit,
  resolveGitShaFull,
  getBuildIdentity,
  toPublicBuildIdentityDiagnostics,
};
