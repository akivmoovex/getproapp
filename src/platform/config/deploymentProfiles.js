"use strict";

/**
 * Unified deployment-profile registry (V7 multi-product platform).
 *
 * Official Hostinger apps use the same env KEYS; only VALUES differ via
 * PLATFORM_DEPLOYMENT_CODE. Authoritative profiles derive product, domains,
 * deployment env, cookies, jobs, trust proxy, and listen host.
 *
 * Unknown non-empty codes fail closed. Unset code keeps legacy env-driven
 * behaviour for non-profiled / transitional hosts (historic GetPro).
 */

const {
  DEPLOYMENT_CODE_PATTERN,
} = require("./platformDeploymentCode");
const {
  resolveProductOrError,
  isValidApplicationCode,
} = require("./productRegistry");
const catalogue = require("./canonicalDeploymentProfiles");

const RUNTIME_LEGACY = "legacy";
const RUNTIME_PRODUCTION = "production";
const RUNTIME_V5_FOUNDATION = catalogue.RUNTIME_V5_FOUNDATION;
const RUNTIME_LEGACY_REDIRECT = catalogue.RUNTIME_LEGACY_REDIRECT;

const CODE_COM_PRODUCTION = catalogue.CODE_COM_PRODUCTION;
const CODE_ORG_STAGING = catalogue.CODE_ORG_STAGING;
const CODE_BLESSBOARD_PRONLINE_TESTING = catalogue.CODE_BLESSBOARD_PRONLINE_TESTING;
const CODE_BLESSBOARD_ORG_LEGACY_REDIRECT =
  catalogue.CODE_BLESSBOARD_ORG_LEGACY_REDIRECT;
const CODE_ACTIVECLINIC_ORG_V6 = catalogue.CODE_ACTIVECLINIC_ORG_V6;
const CODE_ACTIVECLINIC_ORG_PRODUCTION = catalogue.CODE_ACTIVECLINIC_ORG_PRODUCTION;
const CODE_ACTIVECLINIC_PRONLINE_TESTING =
  catalogue.CODE_ACTIVECLINIC_PRONLINE_TESTING;
const CODE_GETPROAPP_ORG_PRODUCTION = catalogue.CODE_GETPROAPP_ORG_PRODUCTION;
const CODE_GETPRO_PRONLINE_TESTING = catalogue.CODE_GETPRO_PRONLINE_TESTING;
const CODE_NETRAZ_ORG_PRODUCTION = catalogue.CODE_NETRAZ_ORG_PRODUCTION;
const CODE_NETRAZ_PRONLINE_TESTING = catalogue.CODE_NETRAZ_PRONLINE_TESTING;
const CODE_MOOVEX_ORG_PRODUCTION = catalogue.CODE_MOOVEX_ORG_PRODUCTION;
const CODE_MOOVEX_PLATFORM_TESTING = catalogue.CODE_MOOVEX_PLATFORM_TESTING;
const CODE_MOOVEX_PLATFORM_PRODUCTION = catalogue.CODE_MOOVEX_PLATFORM_PRODUCTION;
const MOOVEX_PLATFORM_IDENTITY_KEY = catalogue.MOOVEX_PLATFORM_IDENTITY_KEY;
/** @deprecated Prefer CODE_ORG_STAGING */
const CODE_ORG_V5 = catalogue.CODE_ORG_V5;
/** @deprecated Prefer CODE_COM_PRODUCTION */
const CODE_COM_V4 = catalogue.CODE_COM_V4;

const COOKIE_COM = catalogue.COOKIE_COM;
const COOKIE_ORG = catalogue.COOKIE_ORG;
const COOKIE_ACTIVECLINIC_ORG = catalogue.COOKIE_ACTIVECLINIC_ORG;
const CSRF_COOKIE_COM = catalogue.CSRF_COOKIE_COM;
const CSRF_COOKIE_ORG = catalogue.CSRF_COOKIE_ORG;
const CSRF_COOKIE_ACTIVECLINIC_ORG = catalogue.CSRF_COOKIE_ACTIVECLINIC_ORG;
/** @deprecated legacy express-session default */
const PRODUCTION_SESSION_COOKIE = "getpro_sid";
/** @deprecated alias of COOKIE_ORG */
const V5_SESSION_COOKIE = COOKIE_ORG;

const REQUIRED_HOSTINGER_KEYS = Object.freeze([
  "NODE_ENV",
  "PLATFORM_DEPLOYMENT_CODE",
  "DATABASE_URL",
  "SESSION_SECRET",
]);

const OPTIONAL_HOSTINGER_KEYS = Object.freeze(["GETPRO_PG_SSL", "PORT"]);

/** @type {Readonly<Record<string, object>>} */
const DEPLOYMENT_PROFILES = catalogue.CANONICAL_DEPLOYMENT_PROFILES;

const LEGACY_DEPLOYMENT_MIGRATION = catalogue.LEGACY_DEPLOYMENT_MIGRATION;

/** Deprecated PLATFORM_DEPLOYMENT_CODE values → registered profile code */
const DEPLOYMENT_CODE_ALIASES = Object.freeze({
  [CODE_ORG_V5]: CODE_ORG_STAGING,
  [CODE_COM_V4]: CODE_COM_PRODUCTION,
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
 * Resolve raw PLATFORM_DEPLOYMENT_CODE (including aliases) to a registered profile.
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ warnFn?: Function }} [opts]
 * @returns {{ ok: true, profile: DeploymentProfile|null, requestedCode: string|null, aliased: boolean } | { ok: false, code: string, message: string }}
 */
function resolveDeploymentProfileOrError(env, opts = {}) {
  const source = env || process.env;
  const raw = String(source.PLATFORM_DEPLOYMENT_CODE || "")
    .trim()
    .toLowerCase();
  if (!raw) {
    return { ok: true, profile: null, requestedCode: null, aliased: false };
  }
  const knownCodes = Object.keys(DEPLOYMENT_PROFILES).join(", ");
  if (!DEPLOYMENT_CODE_PATTERN.test(raw)) {
    return {
      ok: false,
      code: "invalid_deployment_code",
      message:
        `PLATFORM_DEPLOYMENT_CODE=${JSON.stringify(raw)} is not a valid kebab-case deployment code. ` +
        `Known codes: ${knownCodes}. ` +
        `Fix Hostinger PLATFORM_DEPLOYMENT_CODE to a known code. Startup intentionally blocked.`,
    };
  }
  const aliasTarget = DEPLOYMENT_CODE_ALIASES[raw];
  const canonical = aliasTarget || raw;
  const profile = DEPLOYMENT_PROFILES[canonical];
  if (!profile) {
    return {
      ok: false,
      code: "unknown_deployment_code",
      message:
        `PLATFORM_DEPLOYMENT_CODE=${JSON.stringify(raw)} is not a registered deployment profile. ` +
        `Known codes: ${knownCodes}. ` +
        `Fix Hostinger PLATFORM_DEPLOYMENT_CODE to one of the known codes ` +
        `(e.g. ActiveClinic testing: ${CODE_ACTIVECLINIC_PRONLINE_TESTING} or legacy ${CODE_ACTIVECLINIC_ORG_V6}). ` +
        `Startup intentionally blocked.`,
    };
  }
  if (aliasTarget) {
    warnOnce(
      `alias:${raw}`,
      `[blessboard] DEPRECATED: PLATFORM_DEPLOYMENT_CODE=${raw} is an alias for ${canonical}; ` +
        `update Hostinger to PLATFORM_DEPLOYMENT_CODE=${canonical}.`,
      opts.warnFn
    );
  }
  return { ok: true, profile, requestedCode: raw, aliased: Boolean(aliasTarget) };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {DeploymentProfile|null}
 */
function getDeploymentProfile(env) {
  const resolved = resolveDeploymentProfileOrError(env);
  if (!resolved.ok) return null;
  return resolved.profile;
}

/**
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
 * Identical required Hostinger keys for every official BlessBoard profile.
 * @param {string} [deploymentCode]
 * @returns {readonly string[]}
 */
function requiredHostingerKeys(deploymentCode) {
  void deploymentCode;
  return REQUIRED_HOSTINGER_KEYS;
}

/**
 * @param {string} [deploymentCode]
 * @returns {readonly string[]}
 */
function optionalHostingerKeys(deploymentCode) {
  void deploymentCode;
  return OPTIONAL_HOSTINGER_KEYS;
}

/**
 * Normalized deployment configuration consumed by startup / domain / session / jobs.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{
 *   code: string|null,
 *   environment: string|null,
 *   runtimeMode: string|null,
 *   authoritative: boolean,
 *   canonicalDomain: string|null,
 *   publicOrigin: string|null,
 *   adminOrigin: string|null,
 *   apexDomains: string[],
 *   churchHostDomain: string|null,
 *   sessionCookieName: string|null,
 *   expectedDatabaseEnvironment: string|null,
 *   jobsEnabled: boolean|null,
 *   trustProxy: number|false,
 *   listenHost: string,
 *   hostContextMode: string|null,
 *   profile: DeploymentProfile|null,
 * }}
 */
function resolveDeploymentConfiguration(env) {
  const source = env || process.env;
  const profile = hasAuthoritativeDeploymentProfile(source)
    ? getDeploymentProfile(source)
    : null;
  const trustProxy = resolveTrustProxy(source);
  const listenHost = resolveListenHost(source);
  if (!profile) {
    return {
      code: null,
      environment: null,
      runtimeMode: null,
      authoritative: false,
      productCode: null,
      brand: null,
      siteType: null,
      productSelection: null,
      expectedIdentityKey: null,
      canonicalDomain: null,
      publicOrigin: null,
      adminOrigin: null,
      apexDomains: [],
      churchHostDomain: null,
      sessionCookieName: null,
      csrfCookieName: null,
      expectedDatabaseEnvironment: null,
      jobsEnabled: null,
      trustProxy,
      listenHost,
      hostContextMode: null,
      brandSubtitle: null,
      brandSubtitleVariant: null,
      defaultCountry: null,
      redirectTargetOrigin: null,
      profile: null,
    };
  }
  return {
    code: profile.deploymentCode,
    environment: profile.deploymentEnvironment,
    runtimeMode: profile.runtimeMode,
    authoritative: true,
    productCode: profile.productCode,
    brand: profile.brand || null,
    siteType: profile.siteType || "product",
    productSelection: profile.productSelection || "profile",
    expectedIdentityKey: profile.expectedIdentityKey || null,
    canonicalDomain: profile.canonicalDomain,
    publicOrigin: profile.publicOrigin,
    adminOrigin: profile.adminOrigin,
    apexDomains: profile.apexDomains.slice(),
    churchHostDomain: profile.churchHostDomain,
    sessionCookieName: profile.sessionCookieName,
    csrfCookieName: profile.csrfCookieName,
    expectedDatabaseEnvironment: profile.expectedDatabaseEnvironment,
    jobsEnabled: profile.jobsEnabled,
    trustProxy,
    listenHost,
    hostContextMode: profile.hostContextMode,
    brandSubtitle: profile.brandSubtitle || null,
    brandSubtitleVariant: profile.brandSubtitleVariant || null,
    defaultCountry: profile.defaultCountry || "ZM",
    redirectTargetOrigin: profile.redirectTargetOrigin || null,
    profile,
  };
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
 * @param {NodeJS.ProcessEnv} [env]
 */
function getAuthoritativeDomainConfig(env) {
  if (!hasAuthoritativeDeploymentProfile(env)) return null;
  const profile = getDeploymentProfile(env);
  if (!profile) return null;
  return {
    canonicalDomain: profile.canonicalDomain,
    publicOrigin: profile.publicOrigin,
    adminOrigin: profile.adminOrigin,
    apexDomains: profile.apexDomains.slice(),
    churchHostDomain: profile.churchHostDomain,
  };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ warnFn?: (msg: string) => void }} [opts]
 */
function validateAuthoritativeProfileCompatibility(env, opts = {}) {
  const source = env || process.env;
  const resolved = resolveDeploymentProfileOrError(source, opts);
  if (!resolved.ok) {
    return { ok: false, code: resolved.code, message: resolved.message, warnings: [] };
  }
  const profile = resolved.profile;
  if (!profile || !profile.authoritative) {
    return { ok: true, warnings: [] };
  }

  const productResolved = resolveProductOrError(profile.productCode);
  if (!productResolved.ok) {
    return {
      ok: false,
      code: productResolved.code,
      message: productResolved.message,
      warnings: [],
    };
  }
  if (!isValidApplicationCode(profile.productCode)) {
    return {
      ok: false,
      code: "unknown_product_code",
      message:
        `Deployment profile ${profile.deploymentCode} has invalid productCode=` +
        `${JSON.stringify(profile.productCode)}.`,
      warnings: [],
    };
  }
  if (!profile.sessionCookieName || !profile.csrfCookieName) {
    return {
      ok: false,
      code: "missing_cookie_names",
      message:
        `Deployment profile ${profile.deploymentCode} is missing sessionCookieName or csrfCookieName.`,
      warnings: [],
    };
  }
  if (productResolved.product.productCode !== profile.productCode) {
    return {
      ok: false,
      code: "deployment_product_mismatch",
      message:
        `Deployment profile ${profile.deploymentCode} product mismatch ` +
        `(profile=${profile.productCode}).`,
      warnings: [],
    };
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

  {
    const raw = envTrim(source, "BLESSBOARD_APEX_DOMAINS");
    if (raw) {
      const list = parseApexList(raw);
      const foreign = profile.foreignTlds || [];
      const hasForeign = list.some((h) => foreign.includes(h));
      if (hasForeign || !apexSetsEqual(list, profile.apexDomains.slice())) {
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

  {
    const raw = envTrim(source, "SESSION_COOKIE_NAME");
    if (raw) {
      const foreignCookies = new Set(catalogue.ALL_SESSION_COOKIE_NAMES);
      foreignCookies.delete(profile.sessionCookieName);
      if (foreignCookies.has(raw) || raw !== profile.sessionCookieName) {
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

  {
    const raw = envTrim(source, "CSRF_COOKIE_NAME");
    if (raw) {
      const foreignCsrf = new Set(catalogue.ALL_CSRF_COOKIE_NAMES);
      foreignCsrf.delete(profile.csrfCookieName);
      if (foreignCsrf.has(raw) || raw !== profile.csrfCookieName) {
        return {
          ok: false,
          code: "csrf_cookie_conflict",
          message:
            `CSRF_COOKIE_NAME=${JSON.stringify(raw)} conflicts with profile ${profile.deploymentCode} ` +
            `(expected ${profile.csrfCookieName}). Refusing to start.`,
          warnings,
        };
      }
      noteMatch("CSRF_COOKIE_NAME", raw);
    }
  }

  {
    const raw = envTrim(source, "BLESSBOARD_JOBS_ENABLED").toLowerCase();
    if (raw) {
      if (!JOBS_ENABLE.has(raw) && !JOBS_DISABLE.has(raw)) {
        return {
          ok: false,
          code: "jobs_enabled_invalid",
          message:
            `BLESSBOARD_JOBS_ENABLED=${JSON.stringify(raw)} is unsupported for profile ${profile.deploymentCode}.`,
          warnings,
        };
      }
      const enabled = JOBS_ENABLE.has(raw);
      if (profile.jobsEnabled === false && enabled) {
        return {
          ok: false,
          code: "jobs_enabled_conflict",
          message:
            `BLESSBOARD_JOBS_ENABLED=${JSON.stringify(raw)} is not allowed for profile ${profile.deploymentCode}. ` +
            "Scheduled jobs must remain disabled on staging. Refusing to start.",
          warnings,
        };
      }
      if (profile.jobsEnabled === true && !enabled) {
        const msg =
          `[blessboard] WARN: BLESSBOARD_JOBS_ENABLED=${raw} disables jobs on production profile ` +
          `${profile.deploymentCode} (emergency override). Prefer removing this variable; profile default is enabled.`;
        warnings.push(msg);
        warnOnce(`jobs-override:${profile.deploymentCode}`, msg, warnFn);
      } else if (enabled === profile.jobsEnabled) {
        noteMatch("BLESSBOARD_JOBS_ENABLED", raw);
      }
    }
  }

  {
    const raw = envTrim(source, "PLATFORM_HOST_CONTEXT_MODE").toLowerCase();
    if (raw) {
      if (raw === profile.hostContextMode) {
        noteMatch("PLATFORM_HOST_CONTEXT_MODE", raw);
      } else if (raw === "off" || raw === "diagnostic") {
        const msg =
          `[blessboard] DEPRECATED: PLATFORM_HOST_CONTEXT_MODE=${raw} differs from profile ` +
          `${profile.deploymentCode} default (${profile.hostContextMode}); profile default will be used.`;
        warnings.push(msg);
        warnOnce(`soft:${profile.deploymentCode}:PLATFORM_HOST_CONTEXT_MODE`, msg, warnFn);
      } else {
        const msg =
          `[blessboard] WARN: PLATFORM_HOST_CONTEXT_MODE=${JSON.stringify(raw)} unsupported; ` +
          `using profile default ${profile.hostContextMode}.`;
        warnings.push(msg);
        warnOnce(`soft-invalid:${profile.deploymentCode}:PLATFORM_HOST_CONTEXT_MODE`, msg, warnFn);
      }
    }
  }

  {
    const raw = envTrim(source, "TRUST_PROXY");
    if (raw) {
      if (raw === "0" || raw.toLowerCase() === "false") {
        const msg =
          `[blessboard] WARN: TRUST_PROXY=${raw} overrides profile default ${profile.trustProxy} (advanced).`;
        warnings.push(msg);
        warnOnce(`soft:${profile.deploymentCode}:TRUST_PROXY`, msg, warnFn);
      } else {
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) {
          return {
            ok: false,
            code: "trust_proxy_invalid",
            message: `TRUST_PROXY=${JSON.stringify(raw)} is malformed.`,
            warnings,
          };
        }
        if (n === profile.trustProxy) noteMatch("TRUST_PROXY", raw);
        else {
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
      if (raw === profile.listenHost) noteMatch("HOST", raw);
      else {
        const msg =
          `[blessboard] WARN: HOST=${raw} overrides profile listenHost ${profile.listenHost} (advanced).`;
        warnings.push(msg);
        warnOnce(`soft:${profile.deploymentCode}:HOST`, msg, warnFn);
      }
    }
  }

  {
    const raw = normalizeHost(envTrim(source, "BASE_DOMAIN"));
    if (raw) {
      if (raw === profile.canonicalDomain) {
        noteMatch("BASE_DOMAIN", raw);
      } else {
        return {
          ok: false,
          code: "base_domain_conflict",
          message:
            `BASE_DOMAIN=${JSON.stringify(raw)} conflicts with profile ${profile.deploymentCode} ` +
            `(expected ${profile.canonicalDomain}). Refusing to start.`,
          warnings,
        };
      }
    }
  }

  return { ok: true, warnings };
}

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
  return 1;
}

function resolveListenHost(env) {
  const source = env || process.env;
  const raw = envTrim(source, "HOST");
  if (raw) return raw;
  if (hasAuthoritativeDeploymentProfile(source)) {
    return getDeploymentProfile(source).listenHost;
  }
  return "0.0.0.0";
}

/**
 * Effective jobs flag for an authoritative profile (honors emergency production disable).
 * @param {NodeJS.ProcessEnv} [env]
 */
function resolveJobsEnabled(env) {
  const source = env || process.env;
  if (!hasAuthoritativeDeploymentProfile(source)) return null;
  const profile = getDeploymentProfile(source);
  const raw = envTrim(source, "BLESSBOARD_JOBS_ENABLED").toLowerCase();
  if (profile.jobsEnabled === false) return false;
  if (raw && JOBS_DISABLE.has(raw)) return false;
  return true;
}

function resetDeploymentProfileWarningsForTests() {
  deprecationWarned = new Set();
}

module.exports = {
  DEPLOYMENT_PROFILES,
  DEPLOYMENT_CODE_ALIASES,
  LEGACY_DEPLOYMENT_MIGRATION,
  RUNTIME_LEGACY,
  RUNTIME_PRODUCTION,
  RUNTIME_V5_FOUNDATION,
  RUNTIME_LEGACY_REDIRECT,
  CODE_COM_PRODUCTION,
  CODE_ORG_STAGING,
  CODE_BLESSBOARD_PRONLINE_TESTING,
  CODE_BLESSBOARD_ORG_LEGACY_REDIRECT,
  CODE_ACTIVECLINIC_ORG_V6,
  CODE_ACTIVECLINIC_ORG_PRODUCTION,
  CODE_ACTIVECLINIC_PRONLINE_TESTING,
  CODE_GETPROAPP_ORG_PRODUCTION,
  CODE_GETPRO_PRONLINE_TESTING,
  CODE_NETRAZ_ORG_PRODUCTION,
  CODE_NETRAZ_PRONLINE_TESTING,
  CODE_MOOVEX_ORG_PRODUCTION,
  CODE_MOOVEX_PLATFORM_TESTING,
  CODE_MOOVEX_PLATFORM_PRODUCTION,
  MOOVEX_PLATFORM_IDENTITY_KEY,
  CODE_ORG_V5,
  CODE_COM_V4,
  COOKIE_COM,
  COOKIE_ORG,
  COOKIE_ACTIVECLINIC_ORG,
  CSRF_COOKIE_COM,
  CSRF_COOKIE_ORG,
  CSRF_COOKIE_ACTIVECLINIC_ORG,
  PRODUCTION_SESSION_COOKIE,
  V5_SESSION_COOKIE,
  REQUIRED_HOSTINGER_KEYS,
  OPTIONAL_HOSTINGER_KEYS,
  requiredHostingerKeys,
  optionalHostingerKeys,
  getDeploymentProfile,
  hasAuthoritativeDeploymentProfile,
  requireDeploymentProfile: getDeploymentProfile,
  getDeploymentSetting,
  getAuthoritativeDomainConfig,
  resolveDeploymentConfiguration,
  resolveDeploymentProfileOrError,
  validateAuthoritativeProfileCompatibility,
  assertDeploymentProfileOrExit,
  resolveTrustProxy,
  resolveListenHost,
  resolveJobsEnabled,
  resetDeploymentProfileWarningsForTests,
};
