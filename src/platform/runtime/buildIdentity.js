"use strict";

/**
 * Shared platform build identity — deployed Git branch, SHA, and environment.
 *
 * Single source for BlessBoard and ActiveClinic UI labels and safe diagnostics.
 * Branch is never hard-coded as V9/V10/V4 in application constants; it comes from
 * deployment metadata (preferred) or a safe Git lookup.
 *
 * Authority order (Hostinger-aware):
 * 1. explicit GETPRO_GIT_BRANCH (live process.env) when present
 * 2. other explicit env branch keys (GIT_BRANCH, GITHUB_REF_NAME, …)
 * 3. shared deployment build-identity metadata file under app root
 *    (`.getpro/build-identity.json`) — seeds subdomain lsnode workers that
 *    share the Hostinger hbuild tree but do not receive apex hPanel env
 * 4. git branch if genuinely available (attached HEAD)
 * 5. UNKNOWN only if no authoritative source exists
 *
 * Hostinger constraint: subdomains do not have separate env configuration.
 * Only the apex Node app receives GETPRO_GIT_BRANCH. Separate per-hostname
 * lsnode workers must share identity via the filesystem metadata file.
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const { getDeploymentEnvMode } = require("../config/deploymentEnv");
const { resolveDeploymentConfiguration } = require("../config/deploymentProfiles");
const { readGitShaShort } = require("../../startup/startupProcessMarker");
const {
  BRANCH_SOURCE: SHARED_BRANCH_SOURCE,
  writeSharedBuildIdentityMetadata,
  readSharedBuildIdentityMetadata,
} = require("./sharedBuildIdentityMetadata");

const UNKNOWN_BRANCH = "UNKNOWN";

/**
 * Same app root as bootstrap (`src/startup/bootstrap.js` → repo root). Prefer this
 * over `process.cwd()` so Hostinger lsnode workers resolve the shared metadata
 * file under the common hbuild tree even if cwd differs.
 * @returns {string}
 */
function resolveDefaultAppRoot() {
  return path.join(__dirname, "..", "..", "..");
}

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
 * Persist env-resolved branch into shared metadata so sibling hostname workers
 * (BB/AC subdomains) can read the same deployment identity.
 * @param {{
 *   appRoot?: string,
 *   branch: string,
 *   source: string,
 *   gitShaShort?: string|null,
 *   environment?: string|null,
 *   deploymentCode?: string|null,
 * }} payload
 */
function persistSharedBuildIdentityFromResolvedEnv(payload) {
  if (!payload || !payload.branch) return;
  // Only seed shared metadata from explicit env (not from git or shared itself).
  if (!payload.source || payload.source === "unknown") return;
  if (payload.source === SHARED_BRANCH_SOURCE) return;
  if (String(payload.source).startsWith("git.")) return;
  writeSharedBuildIdentityMetadata({
    appRoot: payload.appRoot,
    branch: payload.branch,
    gitShaShort: payload.gitShaShort || null,
    environment: payload.environment || null,
    deploymentCode: payload.deploymentCode || null,
    writtenFrom: payload.source,
  });
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
  const appRoot = opts.appRoot || resolveDefaultAppRoot();
  const deployment = resolveDeploymentConfiguration(env);
  const environment = getDeploymentEnvMode(env);
  const deploymentCode =
    (deployment && deployment.code) ||
    String(env.PLATFORM_DEPLOYMENT_CODE || "").trim() ||
    null;

  const shaResolved = resolveGitShaFull({ ...opts, appRoot });
  let gitSha = shaResolved.gitSha;
  let gitShaShort = null;
  if (gitSha) {
    gitShaShort = gitSha.slice(0, 12);
  } else {
    const short = readGitShaShort(appRoot);
    if (short && !/unavailable/i.test(short)) {
      gitShaShort = short.slice(0, 12);
      gitSha = gitShaShort;
    }
  }

  const fromEnv = resolveBranchFromEnv(env);
  if (fromEnv) {
    persistSharedBuildIdentityFromResolvedEnv({
      appRoot,
      branch: fromEnv.branch,
      source: fromEnv.source,
      gitShaShort,
      environment,
      deploymentCode,
    });
  }

  const fromShared = fromEnv
    ? null
    : readSharedBuildIdentityMetadata({
        appRoot,
        expectedGitShaShort: gitShaShort,
      });
  const fromGit = fromEnv || fromShared ? null : resolveBranchFromGit(appRoot);
  const branchResolved = fromEnv || fromShared || fromGit;
  const branch = branchResolved ? branchResolved.branch : UNKNOWN_BRANCH;
  const branchSource = branchResolved ? branchResolved.source : "unknown";

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
 * Bootstrap hook: when this worker has GETPRO_GIT_BRANCH (typically apex),
 * seed the shared metadata file for sibling hostname workers.
 * @param {{ appRoot?: string, env?: NodeJS.ProcessEnv }} [options]
 */
function seedSharedBuildIdentityFromEnv(options) {
  const opts = options || {};
  getBuildIdentity({
    ...opts,
    appRoot: opts.appRoot || resolveDefaultAppRoot(),
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
  resolveDefaultAppRoot,
  resolveAuthoritativeGitBranchFromProcessEnv,
  resolveBranchFromEnv,
  resolveBranchFromGit,
  resolveGitShaFull,
  getBuildIdentity,
  seedSharedBuildIdentityFromEnv,
  persistSharedBuildIdentityFromResolvedEnv,
  toPublicBuildIdentityDiagnostics,
};
