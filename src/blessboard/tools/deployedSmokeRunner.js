"use strict";

/**
 * BlessBoard V5 read-only deployed smoke runner.
 * GET/HEAD only. No login POST, registration, uploads, or migrations.
 * Default target: testing/staging allowlisted hosts — not production.
 */

const http = require("http");
const https = require("https");
const { URL } = require("url");

const DEFAULT_TIMEOUT_MS = 15_000;

/** Hostnames treated as production / non-testing by default. */
const PRODUCTION_HOSTNAMES = Object.freeze([
  "getproapp.org",
  "www.getproapp.org",
  "blessboard.com",
  "www.blessboard.com",
]);

/** Apex hosts allowed without --allow-hostname. */
const DEFAULT_TESTING_APEX_HOSTS = Object.freeze(["blessboard.org", "www.blessboard.org"]);

/** Query keys redacted in reports. */
const SENSITIVE_QUERY_KEYS = Object.freeze([
  "tr",
  "code",
  "transfer",
  "token",
  "access_token",
  "refresh_token",
  "password",
  "passwd",
  "secret",
  "session",
  "sid",
  "csrf",
  "_csrf",
  "authorization",
  "api_key",
  "apikey",
  "key",
]);

const SECRET_PATTERNS = Object.freeze([
  { id: "database_url_env", re: /\bDATABASE_URL\b/ },
  { id: "getpro_database_url", re: /\bGETPRO_DATABASE_URL\b/ },
  { id: "postgres_url", re: /postgres(ql)?:\/\//i },
  { id: "mysql_url", re: /mysql:\/\//i },
  { id: "session_secret", re: /\bSESSION_SECRET\b/ },
  { id: "password_assignment", re: /\bpassword\s*[:=]\s*["']?[^\s"'<]{4,}/i },
  { id: "aws_key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "private_key_block", re: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/ },
  { id: "bearer_token", re: /\bBearer\s+[A-Za-z0-9._\-]{12,}/ },
]);

const INTERNAL_ERROR_PATTERNS = Object.freeze([
  { id: "internal_server_error", re: /\bInternal Server Error\b/i },
  { id: "stack_at_object", re: /\bat Object\.\w+/ },
  { id: "node_modules_stack", re: /\/node_modules\// },
  { id: "sequelize_error", re: /\bSequelize(Database)?Error\b/ },
  { id: "pg_error_detail", re: /\berror:\s+password authentication failed\b/i },
  { id: "unhandled_rejection", re: /\bUnhandledPromiseRejection\b/i },
]);

/** Security headers we look for (at least one required on HTML pages). */
const SECURITY_HEADER_CANDIDATES = Object.freeze([
  "referrer-policy",
  "x-content-type-options",
  "x-frame-options",
  "content-security-policy",
  "strict-transport-security",
]);

/**
 * @typedef {{
 *   id: string,
 *   ok: boolean,
 *   severity: 'pass' | 'fail' | 'warn' | 'skip',
 *   message: string,
 *   detail?: Record<string, unknown>,
 * }} SmokeFinding
 */

/**
 * @typedef {{
 *   method: 'GET' | 'HEAD',
 *   url: string,
 *   headers?: Record<string, string>,
 *   timeoutMs?: number,
 * }} SmokeRequest
 */

/**
 * @typedef {{
 *   status: number,
 *   headers: Record<string, string>,
 *   body: string,
 *   finalUrl?: string,
 * }} SmokeResponse
 */

/**
 * Redact sensitive query parameter values in a URL string for reports.
 * @param {string} urlString
 * @returns {string}
 */
function redactUrl(urlString) {
  if (!urlString || typeof urlString !== "string") return "";
  try {
    const u = new URL(urlString);
    for (const key of [...u.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEYS.includes(key.toLowerCase())) {
        u.searchParams.set(key, "REDACTED");
      }
    }
    return u.toString();
  } catch {
    return urlString.replace(/([?&](?:tr|code|transfer|token|password|secret|session|sid|csrf|_csrf)=)[^&]*/gi, "$1REDACTED");
  }
}

/**
 * @param {string} hostname
 * @returns {string}
 */
function normalizeHostname(hostname) {
  return String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
}

/**
 * @param {string} hostname
 */
function isLocalhostHostname(hostname) {
  const h = normalizeHostname(hostname);
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1";
}

/**
 * @param {string} hostname
 */
function isProductionHostname(hostname) {
  const h = normalizeHostname(hostname);
  return PRODUCTION_HOSTNAMES.includes(h);
}

/**
 * @param {string} hostname
 * @param {{ allowHostname?: string[] }} opts
 */
function isAllowedTestingHostname(hostname, opts = {}) {
  const h = normalizeHostname(hostname);
  if (DEFAULT_TESTING_APEX_HOSTS.includes(h)) return true;
  if (h.endsWith(".blessboard.org") && h !== "blessboard.org") return true;
  const first = h.split(".")[0] || "";
  if (/^(staging|stage|test|testing|qa|uat|preview|dev)([-.]|$)/i.test(first) && h.includes(".")) {
    return true;
  }
  const extras = (opts.allowHostname || []).map(normalizeHostname);
  return extras.includes(h);
}

/**
 * Validate target URL against safety policy.
 * @param {string} baseUrl
 * @param {{
 *   allowLocalhost?: boolean,
 *   allowHttp?: boolean,
 *   allowProductionHostname?: boolean,
 *   allowHostname?: string[],
 * }} [opts]
 * @returns {{ ok: boolean, hostname: string, origin: string, errors: string[] }}
 */
function validateBaseUrl(baseUrl, opts = {}) {
  /** @type {string[]} */
  const errors = [];
  if (!baseUrl || typeof baseUrl !== "string" || !baseUrl.trim()) {
    return { ok: false, hostname: "", origin: "", errors: ["--base-url is required"] };
  }
  let parsed;
  try {
    parsed = new URL(baseUrl.trim());
  } catch {
    return { ok: false, hostname: "", origin: "", errors: ["--base-url is not a valid URL"] };
  }
  if (parsed.username || parsed.password) {
    errors.push("base URL must not embed credentials");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    errors.push("base URL must use http or https");
  }
  if (parsed.protocol === "http:" && !opts.allowHttp && !isLocalhostHostname(parsed.hostname)) {
    errors.push("http is only allowed with --allow-http (or localhost with --allow-localhost)");
  }
  const hostname = normalizeHostname(parsed.hostname);
  if (isLocalhostHostname(hostname) && !opts.allowLocalhost) {
    errors.push("localhost is rejected unless --allow-localhost (for mock/local rehearsal only)");
  }
  if (isProductionHostname(hostname) && !opts.allowProductionHostname) {
    errors.push(
      `hostname ${hostname} is classified as production; pass --allow-production-hostname only under supervised override`
    );
  }
  if (
    !isLocalhostHostname(hostname) &&
    !isProductionHostname(hostname) &&
    !isAllowedTestingHostname(hostname, opts) &&
    !opts.allowProductionHostname
  ) {
    errors.push(
      `hostname ${hostname} is not on the testing/staging allowlist; pass --allow-hostname ${hostname} for supervised staging`
    );
  }
  const origin = `${parsed.protocol}//${parsed.host}`;
  return { ok: errors.length === 0, hostname, origin, errors };
}

/**
 * Default HTTP client (GET/HEAD only).
 * Uses node:http(s) so `Host` can be overridden (fetch forbids Host).
 * Does not follow redirects (manual) — status is the first response.
 * @param {SmokeRequest} req
 * @returns {Promise<SmokeResponse>}
 */
function defaultFetch(req) {
  const method = req.method === "HEAD" ? "HEAD" : "GET";
  if (method !== "GET" && method !== "HEAD") {
    return Promise.reject(new Error("deployed smoke allows GET/HEAD only"));
  }
  let parsed;
  try {
    parsed = new URL(req.url);
  } catch (err) {
    return Promise.reject(err);
  }
  const isHttps = parsed.protocol === "https:";
  const lib = isHttps ? https : http;
  const timeoutMs = req.timeoutMs || DEFAULT_TIMEOUT_MS;
  const headers = {
    Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
    "User-Agent": "BlessBoard-V5-DeployedSmoke/1.0 (+read-only)",
    Connection: "close",
    ...(req.headers || {}),
  };
  if (!headers.Host && !headers.host) {
    headers.Host = parsed.host;
  }

  return new Promise((resolve, reject) => {
    const request = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        /** @type {Record<string, string>} */
        const headerObj = {};
        for (const [key, value] of Object.entries(res.headers)) {
          if (value == null) continue;
          headerObj[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : String(value);
        }
        /** @type {Buffer[]} */
        const chunks = [];
        res.on("data", (chunk) => {
          if (method !== "HEAD") chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            headers: headerObj,
            body: method === "HEAD" ? "" : Buffer.concat(chunks).toString("utf8"),
            finalUrl: req.url,
          });
        });
      }
    );
    request.on("timeout", () => {
      request.destroy();
      const err = new Error("request timed out");
      err.name = "AbortError";
      reject(err);
    });
    request.on("error", reject);
    request.end();
  });
}

/**
 * @param {string} body
 * @returns {SmokeFinding[]}
 */
function findSecretLeaks(body) {
  /** @type {SmokeFinding[]} */
  const out = [];
  if (!body) return out;
  for (const pat of SECRET_PATTERNS) {
    if (pat.re.test(body)) {
      out.push({
        id: `secret:${pat.id}`,
        ok: false,
        severity: "fail",
        message: `Secret pattern detected: ${pat.id}`,
      });
    }
  }
  return out;
}

/**
 * @param {string} body
 * @returns {SmokeFinding[]}
 */
function findInternalErrors(body) {
  /** @type {SmokeFinding[]} */
  const out = [];
  if (!body) return out;
  for (const pat of INTERNAL_ERROR_PATTERNS) {
    if (pat.re.test(body)) {
      out.push({
        id: `error_text:${pat.id}`,
        ok: false,
        severity: "fail",
        message: `Internal error text detected: ${pat.id}`,
      });
    }
  }
  return out;
}

/**
 * @param {Record<string, string>} headers
 * @param {{ requireAny?: boolean }} [opts]
 * @returns {SmokeFinding}
 */
function checkSecurityHeaders(headers, opts = {}) {
  const present = SECURITY_HEADER_CANDIDATES.filter((h) => Boolean(headers[h]));
  const requireAny = opts.requireAny !== false;
  if (present.length === 0 && requireAny) {
    return {
      id: "security_headers",
      ok: false,
      severity: "fail",
      message: `Missing security headers (expected one of: ${SECURITY_HEADER_CANDIDATES.join(", ")})`,
      detail: { present },
    };
  }
  return {
    id: "security_headers",
    ok: true,
    severity: present.length ? "pass" : "warn",
    message: present.length
      ? `Security headers present: ${present.join(", ")}`
      : "No security headers asserted (relaxed)",
    detail: { present },
  };
}

/**
 * @param {string} html
 * @returns {string[]}
 */
function extractStaticAssetPaths(html) {
  if (!html) return [];
  const paths = new Set();
  const re = /(?:href|src)=["'](\/blessboard\/v5\/[^"']+\.(?:css|js)(?:\?[^"']*)?)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    paths.add(m[1].split("?")[0]);
  }
  return [...paths].slice(0, 4);
}

/**
 * @param {SmokeResponse} res
 * @param {{ expectStatus?: number | number[], markers?: RegExp[], label: string, checkHeaders?: boolean }} spec
 * @returns {SmokeFinding[]}
 */
function evaluateResponse(res, spec) {
  /** @type {SmokeFinding[]} */
  const findings = [];
  const expected = Array.isArray(spec.expectStatus) ? spec.expectStatus : [spec.expectStatus ?? 200];
  const statusOk = expected.includes(res.status);
  findings.push({
    id: `${spec.label}:status`,
    ok: statusOk,
    severity: statusOk ? "pass" : "fail",
    message: statusOk
      ? `status ${res.status}`
      : `expected status ${expected.join("|")}, got ${res.status}`,
    detail: { status: res.status, expected },
  });
  for (const marker of spec.markers || []) {
    const hit = marker.test(res.body || "");
    findings.push({
      id: `${spec.label}:marker`,
      ok: hit,
      severity: hit ? "pass" : "fail",
      message: hit ? `marker matched ${marker}` : `missing marker ${marker}`,
    });
  }
  if (spec.checkHeaders) {
    findings.push(checkSecurityHeaders(res.headers || {}));
  }
  findings.push(...findSecretLeaks(res.body || "").map((f) => ({ ...f, id: `${spec.label}:${f.id}` })));
  findings.push(...findInternalErrors(res.body || "").map((f) => ({ ...f, id: `${spec.label}:${f.id}` })));
  return findings;
}

/**
 * @param {{
 *   baseUrl: string,
 *   tenantHost?: string | null,
 *   unknownHost?: string,
 *   allowLocalhost?: boolean,
 *   allowHttp?: boolean,
 *   allowProductionHostname?: boolean,
 *   allowHostname?: string[],
 *   fetchFn?: (req: SmokeRequest) => Promise<SmokeResponse>,
 *   timeoutMs?: number,
 *   skipStaticAssets?: boolean,
 * }} options
 */
async function runDeployedSmoke(options) {
  const gate = validateBaseUrl(options.baseUrl, {
    allowLocalhost: options.allowLocalhost,
    allowHttp: options.allowHttp,
    allowProductionHostname: options.allowProductionHostname,
    allowHostname: options.allowHostname,
  });
  /** @type {SmokeFinding[]} */
  const findings = [];
  /** @type {{ id: string, request: { method: string, url: string, hostHeader?: string }, status?: number }[]} */
  const checks = [];

  if (!gate.ok) {
    for (const err of gate.errors) {
      findings.push({
        id: "policy:base_url",
        ok: false,
        severity: "fail",
        message: err,
      });
    }
    return buildReport({
      ok: false,
      baseUrl: redactUrl(options.baseUrl),
      origin: gate.origin,
      hostname: gate.hostname,
      tenantHost: options.tenantHost || null,
      findings,
      checks,
      aborted: true,
    });
  }

  if (options.tenantHost) {
    const th = normalizeHostname(options.tenantHost);
    if (isProductionHostname(th) && !options.allowProductionHostname) {
      findings.push({
        id: "policy:tenant_host",
        ok: false,
        severity: "fail",
        message: `tenant host ${th} is classified as production`,
      });
      return buildReport({
        ok: false,
        baseUrl: redactUrl(options.baseUrl),
        origin: gate.origin,
        hostname: gate.hostname,
        tenantHost: th,
        findings,
        checks,
        aborted: true,
      });
    }
    if (
      !isLocalhostHostname(th) &&
      !isAllowedTestingHostname(th, { allowHostname: options.allowHostname }) &&
      !options.allowProductionHostname
    ) {
      findings.push({
        id: "policy:tenant_host",
        ok: false,
        severity: "fail",
        message: `tenant host ${th} is not on the testing allowlist; use --allow-hostname`,
      });
      return buildReport({
        ok: false,
        baseUrl: redactUrl(options.baseUrl),
        origin: gate.origin,
        hostname: gate.hostname,
        tenantHost: th,
        findings,
        checks,
        aborted: true,
      });
    }
  }

  const fetchFn = options.fetchFn || defaultFetch;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const origin = gate.origin;

  /**
   * @param {string} id
   * @param {string} path
   * @param {{ host?: string, markers?: RegExp[], expectStatus?: number | number[], checkHeaders?: boolean, method?: 'GET' | 'HEAD' }} [spec]
   */
  async function doCheck(id, path, spec = {}) {
    const method = spec.method || "GET";
    const url = `${origin}${path.startsWith("/") ? path : `/${path}`}`;
    const headers = {};
    if (spec.host) headers.Host = spec.host;
    const req = { method, url, headers, timeoutMs };
    checks.push({
      id,
      request: { method, url: redactUrl(url), hostHeader: spec.host || undefined },
    });
    let res;
    try {
      res = await fetchFn(req);
    } catch (err) {
      const message = err && err.name === "AbortError" ? "request timed out" : String(err && err.message ? err.message : err);
      findings.push({
        id: `${id}:transport`,
        ok: false,
        severity: "fail",
        message,
      });
      return null;
    }
    checks[checks.length - 1].status = res.status;
    findings.push(
      ...evaluateResponse(res, {
        label: id,
        expectStatus: spec.expectStatus,
        markers: spec.markers,
        checkHeaders: spec.checkHeaders,
      })
    );
    return res;
  }

  // 1. Health
  const health = await doCheck("healthz", "/healthz", {
    expectStatus: 200,
    markers: [/"ok"\s*:\s*true/, /v5-foundation|"mode"\s*:\s*"v5/i],
    checkHeaders: false,
  });

  // 2. Apex pages
  const apexHome = await doCheck("apex_home", "/", {
    expectStatus: 200,
    markers: [/BlessBoard/i, /Powered by GetPro|powered_by_getpro|getpro/i],
    checkHeaders: true,
  });
  await doCheck("apex_features", "/features", {
    expectStatus: 200,
    markers: [/BlessBoard|feature/i],
    checkHeaders: true,
  });
  await doCheck("apex_pricing", "/pricing", {
    expectStatus: 200,
    markers: [/BlessBoard|pric/i],
    checkHeaders: true,
  });
  await doCheck("apex_directory", "/directory", {
    expectStatus: 200,
    markers: [/BlessBoard|director/i],
    checkHeaders: true,
  });
  await doCheck("apex_register_church", "/register-church", {
    expectStatus: 200,
    markers: [/BlessBoard|church|register|application|pending/i],
    checkHeaders: true,
  });
  await doCheck("apex_login", "/login", {
    expectStatus: 200,
    markers: [/login|sign in|password|email/i],
    checkHeaders: true,
  });

  // 3. Protected unauthenticated (redirect / deny — not 200 privileged shell)
  await doCheck("unauth_account", "/account", {
    expectStatus: [301, 302, 303, 307, 308, 401, 403],
  });
  await doCheck("unauth_admin", "/admin", {
    expectStatus: [301, 302, 303, 307, 308, 401, 403, 503],
  });

  // 4. Tenant host (optional)
  if (options.tenantHost) {
    await doCheck("tenant_home", "/", {
      host: normalizeHostname(options.tenantHost),
      expectStatus: 200,
      markers: [/BlessBoard|church|html/i],
      checkHeaders: true,
    });
    await doCheck("tenant_login_redirect", "/login", {
      host: normalizeHostname(options.tenantHost),
      expectStatus: [200, 301, 302, 303, 307, 308],
    });
  } else {
    findings.push({
      id: "tenant_home",
      ok: true,
      severity: "skip",
      message: "skipped (no --tenant-host)",
    });
  }

  // 5. Unknown host
  const unknownHost =
    options.unknownHost ||
    `unknown-smoke-${Date.now()}.blessboard.org`;
  await doCheck("unknown_host", "/", {
    host: normalizeHostname(unknownHost),
    expectStatus: [200, 404],
    markers: [/BlessBoard|not found|church|html/i],
  });

  // 6. Static assets from apex home
  if (!options.skipStaticAssets && apexHome && apexHome.body) {
    const assets = extractStaticAssetPaths(apexHome.body);
    if (assets.length === 0) {
      findings.push({
        id: "static_assets",
        ok: false,
        severity: "fail",
        message: "no /blessboard/v5/*.css|js assets found in apex home HTML",
      });
    } else {
      for (const assetPath of assets.slice(0, 2)) {
        await doCheck(`static:${assetPath}`, assetPath, {
          expectStatus: 200,
          method: "GET",
        });
      }
    }
  }

  // Soft note if health body missing (already covered)
  void health;

  const failed = findings.filter((f) => f.severity === "fail");
  return buildReport({
    ok: failed.length === 0,
    baseUrl: redactUrl(options.baseUrl),
    origin,
    hostname: gate.hostname,
    tenantHost: options.tenantHost ? normalizeHostname(options.tenantHost) : null,
    findings,
    checks,
    aborted: false,
  });
}

/**
 * @param {{
 *   ok: boolean,
 *   baseUrl: string,
 *   origin: string,
 *   hostname: string,
 *   tenantHost: string | null,
 *   findings: SmokeFinding[],
 *   checks: object[],
 *   aborted: boolean,
 * }} partial
 */
function buildReport(partial) {
  const summary = {
    pass: partial.findings.filter((f) => f.severity === "pass").length,
    fail: partial.findings.filter((f) => f.severity === "fail").length,
    warn: partial.findings.filter((f) => f.severity === "warn").length,
    skip: partial.findings.filter((f) => f.severity === "skip").length,
  };
  return {
    ok: partial.ok,
    tool: "smoke:v5:deployed",
    mode: "read-only",
    methodsAllowed: ["GET", "HEAD"],
    generatedAt: new Date().toISOString(),
    target: {
      baseUrl: partial.baseUrl,
      origin: partial.origin,
      hostname: partial.hostname,
      tenantHost: partial.tenantHost,
    },
    aborted: partial.aborted,
    summary,
    checks: partial.checks,
    findings: partial.findings,
  };
}

/**
 * @param {ReturnType<typeof buildReport>} report
 * @returns {string}
 */
function formatHumanReport(report) {
  const lines = [];
  lines.push(`BlessBoard V5 deployed smoke (${report.mode})`);
  lines.push(`Result: ${report.ok ? "PASS" : "FAIL"}`);
  lines.push(`Target: ${report.target.baseUrl}`);
  if (report.target.tenantHost) lines.push(`Tenant Host: ${report.target.tenantHost}`);
  lines.push(
    `Summary: pass=${report.summary.pass} fail=${report.summary.fail} warn=${report.summary.warn} skip=${report.summary.skip}`
  );
  lines.push("");
  for (const f of report.findings) {
    const mark = f.severity === "pass" ? "✓" : f.severity === "fail" ? "✗" : f.severity === "skip" ? "·" : "!";
    lines.push(`${mark} [${f.severity}] ${f.id}: ${f.message}`);
  }
  lines.push("");
  lines.push("HTTP checks (redacted URLs):");
  for (const c of report.checks) {
    lines.push(
      `  - ${c.id}: ${c.request.method} ${c.request.url}${c.request.hostHeader ? ` Host=${c.request.hostHeader}` : ""} → ${c.status ?? "n/a"}`
    );
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Parse CLI argv into options (no network).
 * @param {string[]} argv
 */
function parseSmokeArgs(argv) {
  const args = argv.slice(2);
  /** @type {Record<string, unknown>} */
  const out = {
    allowHostname: /** @type {string[]} */ ([]),
  };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    const take = () => {
      i += 1;
      return args[i];
    };
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--base-url") out.baseUrl = take();
    else if (a === "--tenant-host") out.tenantHost = take();
    else if (a === "--unknown-host") out.unknownHost = take();
    else if (a === "--json") out.json = true;
    else if (a === "--allow-localhost") out.allowLocalhost = true;
    else if (a === "--allow-http") out.allowHttp = true;
    else if (a === "--allow-production-hostname") out.allowProductionHostname = true;
    else if (a === "--allow-hostname") {
      /** @type {string[]} */ (out.allowHostname).push(String(take() || ""));
    } else if (a === "--timeout-ms") out.timeoutMs = Number(take());
    else if (a === "--skip-static-assets") out.skipStaticAssets = true;
    else out.unknown = a;
  }
  return out;
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  PRODUCTION_HOSTNAMES,
  DEFAULT_TESTING_APEX_HOSTS,
  SENSITIVE_QUERY_KEYS,
  SECRET_PATTERNS,
  INTERNAL_ERROR_PATTERNS,
  SECURITY_HEADER_CANDIDATES,
  redactUrl,
  normalizeHostname,
  isLocalhostHostname,
  isProductionHostname,
  isAllowedTestingHostname,
  validateBaseUrl,
  defaultFetch,
  findSecretLeaks,
  findInternalErrors,
  checkSecurityHeaders,
  extractStaticAssetPaths,
  evaluateResponse,
  runDeployedSmoke,
  formatHumanReport,
  parseSmokeArgs,
  buildReport,
};
