#!/usr/bin/env node
"use strict";

/**
 * Compare origin/V7 (or an explicit SHA) with public unified-testing /healthz.
 * GET only. No DB access. No production hosts. Does not print secrets.
 *
 *   npm run deploy:check-testing-sha
 *   node scripts/check-hosted-testing-sha.js --expected-sha 9dbea13a3f26
 *
 * Exit: 0 match, 3 deploy drift, 2 wrong profile/environment, 1 fetch/usage error.
 */

const http = require("http");
const https = require("https");
const { execFileSync } = require("child_process");
const { URL } = require("url");

const DEFAULT_HEALTHZ = Object.freeze([
  "https://activeclinic.pronline.org/healthz",
  "https://blessboard.pronline.org/healthz",
]);

const EXPECTED_DEPLOYMENT_CODE = "moovex-platform-testing";
const EXPECTED_ENVIRONMENT = "testing";
const SHA_LEN = 12;
const DEFAULT_TIMEOUT_MS = 15_000;

const PRODUCTION_HOSTNAMES = Object.freeze([
  "blessboard.com",
  "www.blessboard.com",
  "getproapp.org",
  "www.getproapp.org",
  "activeclinic.org",
  "www.activeclinic.org",
]);

const SECRET_SNIPPETS = Object.freeze([
  "postgres://",
  "postgresql://",
  "DATABASE_URL",
  "SESSION_SECRET",
  "password=",
  "access_token",
]);

function normalizeSha(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw || raw === "(unavailable)" || raw === "(ref-unavailable)") return "";
  return raw.slice(0, SHA_LEN);
}

function hostnameOf(urlString) {
  try {
    return new URL(urlString).hostname.toLowerCase();
  } catch (_err) {
    return "";
  }
}

function isProductionHostname(hostname) {
  const host = String(hostname || "").toLowerCase();
  return PRODUCTION_HOSTNAMES.includes(host);
}

function isAllowedTestingHostname(hostname, allowLocalhost) {
  const host = String(hostname || "").toLowerCase();
  if (allowLocalhost && (host === "127.0.0.1" || host === "localhost")) return true;
  return host === "pronline.org" || host.endsWith(".pronline.org");
}

function findSecretLeaks(payload) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  return SECRET_SNIPPETS.filter((snippet) => text.includes(snippet));
}

function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice() : [];
  const out = {
    expectedSha: "",
    urls: [],
    allowLocalhost: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    json: false,
    help: false,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      out.help = true;
    } else if (arg === "--json") {
      out.json = true;
    } else if (arg === "--allow-localhost") {
      out.allowLocalhost = true;
    } else if (arg === "--expected-sha") {
      out.expectedSha = String(args[i + 1] || "").trim();
      i += 1;
    } else if (arg === "--url") {
      out.urls.push(String(args[i + 1] || "").trim());
      i += 1;
    } else if (arg === "--timeout-ms") {
      out.timeoutMs = Number(args[i + 1]);
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function resolveExpectedSha(opts) {
  const explicit = normalizeSha(opts && opts.expectedSha);
  if (explicit) return explicit;
  const fromEnv = normalizeSha(process.env.GETPRO_EXPECTED_GIT_SHA);
  if (fromEnv) return fromEnv;
  try {
    const sha = execFileSync("git", ["rev-parse", "origin/V7"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return normalizeSha(sha);
  } catch (_err) {
    const sha = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return normalizeSha(sha);
  }
}

function fetchJson(urlString, timeoutMs, transport) {
  const fetchImpl = transport || defaultFetch;
  return fetchImpl(urlString, timeoutMs);
}

function defaultFetch(urlString, timeoutMs) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlString);
    const lib = parsed.protocol === "http:" ? http : https;
    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: `${parsed.pathname}${parsed.search}`,
        method: "GET",
        timeout: timeoutMs,
        headers: {
          Accept: "application/json",
          "User-Agent": "getpro-deploy-check-testing-sha",
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          resolve({
            status: res.statusCode || 0,
            raw,
          });
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error(`timeout after ${timeoutMs}ms`));
    });
    req.on("error", reject);
    req.end();
  });
}

function classifyHealthz(body, expectedSha) {
  if (!body || typeof body !== "object") return "INVALID_HEALTHZ";
  if (body.environment !== EXPECTED_ENVIRONMENT) return "WRONG_ENVIRONMENT";
  if (body.deploymentCode !== EXPECTED_DEPLOYMENT_CODE) return "WRONG_DEPLOYMENT_PROFILE";
  if (body.schemaCompatible !== true) return "SCHEMA_INCOMPATIBLE";
  const hostedSha = normalizeSha(body.gitSha);
  if (!hostedSha) return "GIT_SHA_UNAVAILABLE";
  if (hostedSha !== expectedSha) return "DEPLOY_DRIFT";
  return "OK";
}

function exitCodeForClassifications(classifications) {
  if (classifications.includes("WRONG_ENVIRONMENT") || classifications.includes("WRONG_DEPLOYMENT_PROFILE")) {
    return 2;
  }
  if (classifications.some((code) => code !== "OK")) return 3;
  return 0;
}

async function checkHostedTestingSha(opts) {
  const options = opts || {};
  const expectedSha = resolveExpectedSha(options);
  if (!expectedSha) {
    throw new Error("Could not resolve expected git SHA.");
  }
  const urls = (options.urls && options.urls.length ? options.urls : DEFAULT_HEALTHZ).slice();
  const hosts = [];
  for (const url of urls) {
    const hostname = hostnameOf(url);
    if (!hostname) {
      throw new Error(`Invalid URL: ${url}`);
    }
    if (isProductionHostname(hostname)) {
      throw new Error(`Refusing production hostname: ${hostname}`);
    }
    if (!isAllowedTestingHostname(hostname, options.allowLocalhost === true)) {
      throw new Error(`Hostname not allowed for testing deploy check: ${hostname}`);
    }
    const response = await fetchJson(url, options.timeoutMs || DEFAULT_TIMEOUT_MS, options.fetch);
    const leaks = findSecretLeaks(response.raw);
    if (leaks.length) {
      throw new Error(`Healthz leaked sensitive fields at ${hostname}`);
    }
    let body = null;
    try {
      body = JSON.parse(response.raw);
    } catch (_err) {
      body = null;
    }
    const classification = body
      ? classifyHealthz(body, expectedSha)
      : "INVALID_HEALTHZ";
    hosts.push({
      url,
      hostname,
      httpStatus: response.status,
      gitSha: body && body.gitSha ? normalizeSha(body.gitSha) : null,
      environment: body && body.environment ? body.environment : null,
      deploymentCode: body && body.deploymentCode ? body.deploymentCode : null,
      schemaCompatible: body && typeof body.schemaCompatible === "boolean"
        ? body.schemaCompatible
        : null,
      classification,
    });
  }
  const classifications = hosts.map((row) => row.classification);
  const drift = hosts.some((row) => row.classification === "DEPLOY_DRIFT");
  return {
    ok: classifications.every((code) => code === "OK") && hosts.every((row) => row.httpStatus === 200),
    expectedSha,
    branch: "V7",
    drift,
    hosts,
    exitCode: hosts.some((row) => row.httpStatus !== 200)
      ? 1
      : exitCodeForClassifications(classifications),
  };
}

function printUsage() {
  process.stderr.write(`Usage:
  npm run deploy:check-testing-sha
  node scripts/check-hosted-testing-sha.js [--expected-sha <sha>] [--url <healthz>]...

Options:
  --expected-sha <sha>   Compare against this SHA (default: origin/V7)
  --url <healthz>        Healthz URL (repeatable; default: ActiveClinic + BlessBoard testing)
  --allow-localhost      Permit 127.0.0.1 / localhost (tests only)
  --timeout-ms <n>       Per-request timeout (default 15000)
  --json                 JSON only
  --help
`);
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    printUsage();
    return 0;
  }
  const report = await checkHostedTestingSha({
    expectedSha: args.expectedSha,
    urls: args.urls,
    allowLocalhost: args.allowLocalhost,
    timeoutMs: Number.isFinite(args.timeoutMs) ? args.timeoutMs : DEFAULT_TIMEOUT_MS,
  });
  const payload = JSON.stringify(report, null, 2);
  if (args.json) {
    process.stdout.write(`${payload}\n`);
  } else {
    process.stdout.write(
      `expectedSha=${report.expectedSha} drift=${report.drift} ok=${report.ok}\n`
    );
    for (const host of report.hosts) {
      process.stdout.write(
        `${host.hostname} gitSha=${host.gitSha || "(none)"} ` +
          `env=${host.environment || "(none)"} ` +
          `deployment=${host.deploymentCode || "(none)"} ` +
          `schemaCompatible=${host.schemaCompatible} ` +
          `status=${host.classification}\n`
      );
    }
    process.stdout.write(`${payload}\n`);
  }
  return report.ok ? 0 : report.exitCode || 1;
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exit(code);
    })
    .catch((err) => {
      process.stderr.write(`[deploy:check-testing-sha] ${err.message}\n`);
      process.exit(1);
    });
}

module.exports = {
  DEFAULT_HEALTHZ,
  EXPECTED_DEPLOYMENT_CODE,
  EXPECTED_ENVIRONMENT,
  normalizeSha,
  parseArgs,
  resolveExpectedSha,
  classifyHealthz,
  checkHostedTestingSha,
  isProductionHostname,
  isAllowedTestingHostname,
  findSecretLeaks,
  main,
};
