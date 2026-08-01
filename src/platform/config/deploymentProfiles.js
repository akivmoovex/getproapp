"use strict";

/**
 * Authoritative deployment-profile registry.
 *
 * PLATFORM_DEPLOYMENT_CODE selects a profile. For authoritative profiles
 * (currently blessboard-org-v5), non-secret Hostinger settings are derived
 * from the profile so the permanent env surface can stay minimal.
 *
 * Legacy / unset PLATFORM_DEPLOYMENT_CODE keeps prior env-driven behaviour.
 * Unknown non-empty codes fail closed at startup.
 */

const {
  getPlatformDeploymentCode,
  DEPLOYMENT_CODE_PATTERN,
} = require("./platformDeploymentCode");

const RUNTIME_LEGACY = "legacy";
const RUNTIME_V5_FOUNDATION = "v5-foundation";

const PRODUCTION_SESSION_COOKIE = "getpro_sid";
const V5_SESSION_COOKIE = "blessboard_org_v5_sid";

const CODE_ORG_V5 = "blessboard-org-v5";
const CODE_COM_V4 = "blessboard-com-v4";

/**
 * @typedef {Readonly<{
 *   deploymentCode: string,
 *   deploymentEnvironment: "testing"|"production",
 *   runtimeMode: "legacy"|"v5-foundation",
 *   authoritative: boolean,
 *   canonicalDomain: string,
 *   publicOrigin: string,
 *   adminOrigin: string,
 *   apexDomains: readonly string[],
 *   churchHostDomain: string,
 *   sessionCookieName: string,
 *   expectedDatabaseEnvironment: "testing"|"production",
 *   jobsEnabled: boolean,
 *   trustProxy: number,
 *   listenHost: string,
 *   hostContextMode: "off"|"diagnostic",
 *   allowTestUsersByDefault: boolean,
 *   productionSessionCookieName: string,
 * }>} DeploymentProfile
 */

/** @type {Readonly<Record<string, DeploymentProfile>>} */
const DEPLOYMENT_PROFILES = Object.freeze({
  [CODE_ORG_V5]: Object.freeze({
    deploymentCode: CODE_ORG_V5,
    deploymentEnvironment: "testing",
    runtimeMode: RUNTIME_V5_FOUNDATION,
    authoritative: true,
    canonicalDomain: "blessboard.org",
    publicOrigin: "https://blessboard.org",
    adminOrigin: "https://blessboard.org",
    apexDomains: Object.freeze(["blessboard.org", "www.blessboard.org"]),
    churchHostDomain: "blessboard.org",
    sessionCookieName: V5_SESSION_COOKIE,
    expectedDatabaseEnvironment: "testing",
    jobsEnabled: false,
    trustProxy: 1,
    listenHost: "0.0.0.0",
    hostContextMode: "diagnostic",
    allowTestUsersByDefault: false,
    productionSessionCookieName: PRODUCTION_SESSION_COOKIE,
  }),
  // Known legacy code — not authoritative; preserves Hostinger env-driven V4 behaviour.
  [CODE_COM_V4]: Object.freeze({
    deploymentCode: CODE_COM_V4,
    deploymentEnvironment: "production",
    runtimeMode: RUNTIME_LEGACY,
    authoritative: false,
    canonicalDomain: "blessboard.com",
    publicOrigin: "https://blessboard.com",
    adminOrigin: "https://blessboard.com",
    apexDomains: Object.freeze([
      "blessboard.com",
      "www.blessboard.com",
      "blessboard.org",
      "www.blessboard.org",
    ]),
    churchHostDomain: "blessboard.com",
    sessionCookieName: PRODUCTION_SESSION_COOKIE,
    expectedDatabaseEnvironment: "production",
    jobsEnabled: true,
    trustProxy: 1,
    listenHost: "0.0.0.0",
    hostContextMode: "off",
    allowTestUsersByDefault: false,
    productionSessionCookieName: PRODUCTION_SESSION_COOKIE,
  }),
});

const JOBS_DISABLE = new Set(["0", "false", "no", "off"]);
const JOBS_ENABLE = new Set(["1", "true", "yes", "on"]);

let deprecationWarned = new Set();

function envTrim(source, name) {
  const v = source[name];
  if (v == null) return "";
  let s = String(v).trim();
  if (s.includes(",")) return s;
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function normalizeHost(host) {
  return String(host || "")
    .toLowerCase()
    .trim()
    .split(":")[0];
}

function stripWrappingQuotes(value) {
  let s = String(value || "").trim();
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function parseApexList(raw) {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((part) => normalizeHost(stripWrappingQuotes(part)))
    .filter(Boolean);
}

function apexSetsEqual(a, b) {
  if (a.length !== b.length) return false;
  const left = new Set(a.map(normalizeHost));
  const right = new Set(b.map(normalizeHost));
  if (left.size !== right.size) return false;
  for (const h of left) {
    if (!right.has(h)) return false;
  }
  return true;
}

function warnOnce(key, message, warnFn) {
  if (deprecationWarned.has(key)) return;
  deprecationWarned.add(key);
  const out = typeof warnFn === "function" ? warnFn : (msg) => console.warn(msg);
  out(message);
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {DeploymentProfile|null}
 */
function getDeploymentProfile(env) {
  const source = env || process.env;
  const deploy = getPlatformDeploymentCode(source);
  if (!deploy.ok || !deploy.code) return null;
  return DEPLOYMENT_PROFILES[deploy.code] || null;
}

/**
 * True when an authoritative profile is active and DEPLOYMENT_ENV is compatible
 * (unset or matches profile). Conflicting DEPLOYMENT_ENV disables derivation so
 * startup validation can fail closed without partially applying profile domains.
 * @param {NodeJS.ProcessEnv} [env]
 */
function hasAuthoritativeDeploymentProfile(env) {
  const source = env || process.env;
  const profile = getDeploymentProfile(source);
  if (!profile || !profile.authoritative) return false;
  const depEnv = String(source.DEPLOYMENT_ENV || "")
    .trim()
    .toLowerCase();
  if (depEnv && depEnv !== profile.deploymentEnvironment) return false;
  return true;
}

/**
 * @param {string} key
 * @param {NodeJS.ProcessEnv} [env]
 */
function getDeploymentSetting(key, env) {
  if (!hasAuthoritativeDeploymentProfile(env)) return undefined;
  const profile = getDeploymentProfile(env);
  if (!profile) return undefined;
  if (!Object.prototype.hasOwnProperty.call(profile, key)) return undefined;
  return profile[key];
}

/**
 * Domain config object for BlessBoard helpers.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{
 *   canonicalDomain: string,
 *   publicOrigin: string,
 *   adminOrigin: string,
 *   apexDomains: string[],
 *   churchHostDomain: string,
 * }|null}
 */
function getAuthoritativeDomainConfig(env) {
  if (!hasAuthoritativeDeploymentProfile(env)) return null;
  const profile = getDeploymentProfile(env);
  if (!profile || !profile.authoritative) return null;
  return {
    canonicalDomain: profile.canonicalDomain,
    publicOrigin: profile.publicOrigin,
    adminOrigin: profile.adminOrigin,
    apexDomains: profile.apexDomains.slice(),
    churchHostDomain: profile.churchHostDomain,
  };
}

/**
 * Fail closed when PLATFORM_DEPLOYMENT_CODE is set but not in the registry
 * (or has an invalid format).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ ok: true, profile: DeploymentProfile|null } | { ok: false, code: string, message: string }}
 */
function resolveDeploymentProfileOrError(env) {
  const source = env || process.env;
  const raw = String(source.PLATFORM_DEPLOYMENT_CODE || "")
    .trim()
    .toLowerCase();
  if (!raw) {
    return { ok: true, profile: null };
  }
  if (!DEPLOYMENT_CODE_PATTERN.test(raw)) {
    return {
      ok: false,
      code: "invalid_deployment_code",
      message:
        `PLATFORM_DEPLOYMENT_CODE=${JSON.stringify(raw)} is not a valid kebab-case deployment code. ` +
        `Known codes: ${Object.keys(DEPLOYMENT_PROFILES).join(", ")}.`,
    };
  }
  const profile = DEPLOYMENT_PROFILES[raw];
  if (!profile) {
    return {
      ok: false,
      code: "unknown_deployment_code",
      message:
        `PLATFORM_DEPLOYMENT_CODE=${JSON.stringify(raw)} is not a registered deployment profile. ` +
        `Known codes: ${Object.keys(DEPLOYMENT_PROFILES).join(", ")}. Refusing to start.`,
    };
  }
  return { ok: true, profile };
}

/**
 * Validate legacy env overrides against an authoritative profile.
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ warnFn?: (msg: string) => void }} [opts]
 * @returns {{ ok: true, warnings: string[] } | { ok: false, code: string, message: string, warnings: string[] }}
 */
function validateAuthoritativeProfileCompatibility(env, opts = {}) {
  const source = env || process.env;
  const resolved = resolveDeploymentProfileOrError(source);
  if (!resolved.ok) {
    return { ok: false, code: resolved.code, message: resolved.message, warnings: [] };
  }
  const profile = resolved.profile;
  if (!profile || !profile.authoritative) {
    return { ok: true, warnings: [] };
  }

  const warnings = [];
  const warnFn = opts.warnFn;

  function noteMatch(varName, displayValue) {
    const msg =
      `[blessboard] DEPRECATED: ${varName}=${displayValue} matches deployment profile ` +
      `${profile.deploymentCode}; this Hostinger variable is no longer required and may be removed.`;
    warnings.push(msg);
    warnOnce(`match:${profile.deploymentCode}:${varName}`, msg, warnFn);
  }

  // DEPLOYMENT_ENV
  {
    const raw = envTrim(source, "DEPLOYMENT_ENV").toLowerCase();
    if (raw) {
      if (raw !== profile.deploymentEnvironment) {
        return {
          ok: false,
          code: "deployment_env_conflict",
          message:
            `DEPLOYMENT_ENV=${JSON.stringify(raw)} conflicts with profile ${profile.deploymentCode} ` +
            `(expected ${profile.deploymentEnvironment}). Refusing to start.`,
          warnings,
        };
      }
      noteMatch("DEPLOYMENT_ENV", raw);
    }
  }

  // EXPECTED_DATABASE_ENV
  {
    const raw = envTrim(source, "EXPECTED_DATABASE_ENV").toLowerCase();
    if (raw) {
      if (raw !== profile.expectedDatabaseEnvironment) {
        return {
          ok: false,
          code: "expected_database_env_conflict",
          message:
            `EXPECTED_DATABASE_ENV=${JSON.stringify(raw)} conflicts with profile ${profile.deploymentCode} ` +
            `(expected ${profile.expectedDatabaseEnvironment}). Refusing to start.`,
          warnings,
        };
      }
      noteMatch("EXPECTED_DATABASE_ENV", raw);
    }
  }

  // BLESSBOARD_CANONICAL_DOMAIN
  {
    const raw = normalizeHost(envTrim(source, "BLESSBOARD_CANONICAL_DOMAIN"));
    if (raw) {
      if (raw !== profile.canonicalDomain) {
        return {
          ok: false,
          code: "canonical_domain_conflict",
          message:
            `BLESSBOARD_CANONICAL_DOMAIN=${JSON.stringify(raw)} conflicts with profile ` +
            `${profile.deploymentCode} (expected ${profile.canonicalDomain}). Refusing to start.`,
          warnings,
        };
      }
      noteMatch("BLESSBOARD_CANONICAL_DOMAIN", raw);
    }
  }

  // BLESSBOARD_APEX_DOMAINS
  {
    const raw = envTrim(source, "BLESSBOARD_APEX_DOMAINS");
    if (raw) {
      const list = parseApexList(raw);
      const hasForeignCom = list.some(
        (h) => h === "blessboard.com" || h === "www.blessboard.com"
      );
      if (hasForeignCom || !apexSetsEqual(list, profile.apexDomains.slice())) {
        // Foreign .com is always fatal for org-v5; any mismatch vs profile is fatal for security isolation.
        return {
          ok: false,
          code: "apex_domains_conflict",
          message:
            `BLESSBOARD_APEX_DOMAINS conflicts with profile ${profile.deploymentCode} ` +
            `(expected ${profile.apexDomains.join(",")}; got ${list.join(",") || "(empty)"}). ` +
            "Refusing to start.",
          warnings,
        };
      }
      noteMatch("BLESSBOARD_APEX_DOMAINS", list.join(","));
    }
  }

  // CHURCH_HOST_DOMAIN
  {
    const raw = normalizeHost(envTrim(source, "CHURCH_HOST_DOMAIN"));
    if (raw) {
      if (raw !== profile.churchHostDomain) {
        return {
          ok: false,
          code: "church_host_domain_conflict",
          message:
            `CHURCH_HOST_DOMAIN=${JSON.stringify(raw)} conflicts with profile ${profile.deploymentCode} ` +
            `(expected ${profile.churchHostDomain}). Refusing to start.`,
          warnings,
        };
      }
      noteMatch("CHURCH_HOST_DOMAIN", raw);
    }
  }

  // BLESSBOARD_PUBLIC_URL / ADMIN_URL — security if wrong host; warn if match
  {
    const pub = envTrim(source, "BLESSBOARD_PUBLIC_URL").replace(/\/$/, "");
    if (pub) {
      if (pub.toLowerCase() !== profile.publicOrigin.toLowerCase()) {
        return {
          ok: false,
          code: "public_url_conflict",
          message:
            `BLESSBOARD_PUBLIC_URL conflicts with profile ${profile.deploymentCode} ` +
            `(expected ${profile.publicOrigin}). Refusing to start.`,
          warnings,
        };
      }
      noteMatch("BLESSBOARD_PUBLIC_URL", pub);
    }
    const admin = envTrim(source, "BLESSBOARD_ADMIN_URL").replace(/\/$/, "");
    if (admin) {
      if (admin.toLowerCase() !== profile.adminOrigin.toLowerCase()) {
        return {
          ok: false,
          code: "admin_url_conflict",
          message:
            `BLESSBOARD_ADMIN_URL conflicts with profile ${profile.deploymentCode} ` +
            `(expected ${profile.adminOrigin}). Refusing to start.`,
          warnings,
        };
      }
      noteMatch("BLESSBOARD_ADMIN_URL", admin);
    }
  }

  // SESSION_COOKIE_NAME
  {
    const raw = envTrim(source, "SESSION_COOKIE_NAME");
    if (raw) {
      if (raw === profile.productionSessionCookieName) {
        return {
          ok: false,
          code: "session_cookie_conflict",
          message:
            `SESSION_COOKIE_NAME=${JSON.stringify(raw)} equals the production cookie name and conflicts ` +
            `with profile ${profile.deploymentCode} (expected ${profile.sessionCookieName}). Refusing to start.`,
          warnings,
        };
      }
      if (raw !== profile.sessionCookieName) {
        return {
          ok: false,
          code: "session_cookie_conflict",
          message:
            `SESSION_COOKIE_NAME=${JSON.stringify(raw)} conflicts with profile ${profile.deploymentCode} ` +
            `(expected ${profile.sessionCookieName}). Refusing to start.`,
          warnings,
        };
      }
      noteMatch("SESSION_COOKIE_NAME", raw);
    }
  }

  // BLESSBOARD_JOBS_ENABLED
  {
    const raw = envTrim(source, "BLESSBOARD_JOBS_ENABLED").toLowerCase();
    if (raw) {
      if (JOBS_ENABLE.has(raw)) {
        return {
          ok: false,
          code: "jobs_enabled_conflict",
          message:
            `BLESSBOARD_JOBS_ENABLED=${JSON.stringify(raw)} is not allowed for profile ${profile.deploymentCode}. ` +
            "Scheduled jobs must remain disabled. Refusing to start.",
          warnings,
        };
      }
      if (JOBS_DISABLE.has(raw)) {
        noteMatch("BLESSBOARD_JOBS_ENABLED", raw);
      } else {
        return {
          ok: false,
          code: "jobs_enabled_invalid",
          message:
            `BLESSBOARD_JOBS_ENABLED=${JSON.stringify(raw)} is unsupported for profile ${profile.deploymentCode}. ` +
            "Omit the variable (jobs stay disabled) or set 0/false. Refusing to start.",
          warnings,
        };
      }
    }
  }

  // PLATFORM_HOST_CONTEXT_MODE — non-security: warn on match or soft mismatch
  {
    const raw = envTrim(source, "PLATFORM_HOST_CONTEXT_MODE").toLowerCase();
    if (raw) {
      if (raw === profile.hostContextMode) {
        noteMatch("PLATFORM_HOST_CONTEXT_MODE", raw);
      } else if (raw === "off" || raw === "diagnostic") {
        const msg =
          `[blessboard] DEPRECATED: PLATFORM_HOST_CONTEXT_MODE=${raw} differs from profile ` +
          `${profile.deploymentCode} default (${profile.hostContextMode}); profile default will be used. ` +
          "Remove this Hostinger variable.";
        warnings.push(msg);
        warnOnce(`soft:${profile.deploymentCode}:PLATFORM_HOST_CONTEXT_MODE`, msg, warnFn);
      } else {
        const msg =
          `[blessboard] WARN: PLATFORM_HOST_CONTEXT_MODE=${JSON.stringify(raw)} is unsupported; ` +
          `using profile default ${profile.hostContextMode}.`;
        warnings.push(msg);
        warnOnce(`soft-invalid:${profile.deploymentCode}:PLATFORM_HOST_CONTEXT_MODE`, msg, warnFn);
      }
    }
  }

  // TRUST_PROXY / HOST — advanced overrides only
  {
    const raw = envTrim(source, "TRUST_PROXY");
    if (raw) {
      if (raw === "0" || raw.toLowerCase() === "false") {
        const msg =
          `[blessboard] WARN: TRUST_PROXY=${raw} overrides profile default ${profile.trustProxy} ` +
          `(advanced). Behind Hostinger/nginx this usually breaks client IP and HTTPS detection.`;
        warnings.push(msg);
        warnOnce(`soft:${profile.deploymentCode}:TRUST_PROXY`, msg, warnFn);
      } else {
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) {
          return {
            ok: false,
            code: "trust_proxy_invalid",
            message: `TRUST_PROXY=${JSON.stringify(raw)} is malformed. Use a non-negative number or omit for profile default.`,
            warnings,
          };
        }
        if (n === profile.trustProxy) {
          noteMatch("TRUST_PROXY", raw);
        } else {
          const msg =
            `[blessboard] WARN: TRUST_PROXY=${raw} overrides profile default ${profile.trustProxy} (advanced).`;
          warnings.push(msg);
          warnOnce(`soft-override:${profile.deploymentCode}:TRUST_PROXY`, msg, warnFn);
        }
      }
    }
  }
  {
    const raw = envTrim(source, "HOST");
    if (raw) {
      if (raw === profile.listenHost) {
        noteMatch("HOST", raw);
      } else {
        const msg =
          `[blessboard] WARN: HOST=${raw} overrides profile listenHost ${profile.listenHost} (advanced).`;
        warnings.push(msg);
        warnOnce(`soft:${profile.deploymentCode}:HOST`, msg, warnFn);
      }
    }
  }

  return { ok: true, warnings };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ warnFn?: Function, errorFn?: Function, exit?: Function }} [opts]
 */
function assertDeploymentProfileOrExit(env, opts = {}) {
  const source = env || process.env;
  const result = validateAuthoritativeProfileCompatibility(source, {
    warnFn: opts.warnFn,
  });
  if (result.ok) return result;
  const out = typeof opts.errorFn === "function" ? opts.errorFn : (msg) => console.error(msg);
  out(`[blessboard] FATAL: ${result.message}`);
  const exit = typeof opts.exit === "function" ? opts.exit : (code) => process.exit(code);
  exit(1);
  return result;
}

/**
 * Effective trust proxy setting (profile default with optional override).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {false|number}
 */
function resolveTrustProxy(env) {
  const source = env || process.env;
  const raw = envTrim(source, "TRUST_PROXY");
  if (raw === "0" || raw.toLowerCase() === "false") return false;
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  if (hasAuthoritativeDeploymentProfile(source)) {
    return getDeploymentProfile(source).trustProxy;
  }
  // Legacy default matches server.legacy / httpBootstrap
  return 1;
}

/**
 * Listen host bind address.
 * @param {NodeJS.ProcessEnv} [env]
 */
function resolveListenHost(env) {
  const source = env || process.env;
  const raw = envTrim(source, "HOST");
  if (raw) return raw;
  if (hasAuthoritativeDeploymentProfile(source)) {
    return getDeploymentProfile(source).listenHost;
  }
  return "0.0.0.0";
}

/** Test helper */
function resetDeploymentProfileWarningsForTests() {
  deprecationWarned = new Set();
}

module.exports = {
  DEPLOYMENT_PROFILES,
  RUNTIME_LEGACY,
  RUNTIME_V5_FOUNDATION,
  CODE_ORG_V5,
  CODE_COM_V4,
  PRODUCTION_SESSION_COOKIE,
  V5_SESSION_COOKIE,
  getDeploymentProfile,
  hasAuthoritativeDeploymentProfile,
  requireDeploymentProfile: getDeploymentProfile,
  getDeploymentSetting,
  getAuthoritativeDomainConfig,
  resolveDeploymentProfileOrError,
  validateAuthoritativeProfileCompatibility,
  assertDeploymentProfileOrExit,
  resolveTrustProxy,
  resolveListenHost,
  resetDeploymentProfileWarningsForTests,
};
