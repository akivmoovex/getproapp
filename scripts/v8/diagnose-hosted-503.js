#!/usr/bin/env node
"use strict";

/**
 * V8 P0 hosted 503 diagnostic (read-only).
 * Classifies Hostinger edge vs application responses for neuniversity hosts.
 * Never prints secrets; never mutates DB or Hostinger config.
 *
 * Usage:
 *   node scripts/v8/diagnose-hosted-503.js
 *   V8_DIAG_BB=https://blessboard.neuniversity.org \
 *   V8_DIAG_AC=https://activeclinic.neuniversity.org \
 *   node scripts/v8/diagnose-hosted-503.js
 *
 * Exit:
 *   0 — both hosts application-healthy (deploymentCode v8-testing)
 *   3 — Hostinger edge / no upstream (hosting action required)
 *   1 — other failure
 */

const https = require("https");
const http = require("http");
const {
  classifyHostingerHttpResponse,
  isSharedV8DeploymentUnavailable,
} = require("../../src/platform/ops/hostingerUpstreamProbe");

function base(name, fallback) {
  return String(process.env[name] || fallback || "")
    .trim()
    .replace(/\/$/, "");
}

function fetchRaw(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https:") ? https : http;
    const req = lib.get(url, { timeout: 15000 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try {
          json = JSON.parse(body);
        } catch {
          json = null;
        }
        resolve({
          status: res.statusCode || 0,
          headers: res.headers || {},
          json,
          body: body.slice(0, 800),
        });
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

async function probe(label, root) {
  const healthUrl = `${root}/healthz`;
  const homeUrl = `${root}/`;
  const health = await fetchRaw(healthUrl);
  const home = await fetchRaw(homeUrl);
  const healthClass = classifyHostingerHttpResponse({
    status: health.status,
    headers: health.headers,
    body: health.body,
  });
  const homeClass = classifyHostingerHttpResponse({
    status: home.status,
    headers: home.headers,
    body: home.body,
  });
  return {
    label,
    root,
    health: {
      status: health.status,
      classification: healthClass,
      deploymentCode: health.json && health.json.deploymentCode,
      platformLine: health.json && health.json.platformLine,
      gitSha: health.json && health.json.gitSha,
      expectedIdentityKey: health.json && health.json.expectedIdentityKey,
      expectedDatabaseEnvironment:
        health.json && health.json.expectedDatabaseEnvironment,
    },
    home: {
      status: home.status,
      classification: homeClass,
    },
  };
}

function printProbe(p) {
  // eslint-disable-next-line no-console
  console.log(`\n=== ${p.label} (${p.root}) ===`);
  // eslint-disable-next-line no-console
  console.log(
    `home HTTP ${p.home.status} → ${p.home.classification.code} (${p.home.classification.layer})`
  );
  // eslint-disable-next-line no-console
  console.log(
    `healthz HTTP ${p.health.status} → ${p.health.classification.code} (${p.health.classification.layer})`
  );
  if (p.health.classification.evidence.length) {
    // eslint-disable-next-line no-console
    console.log(`evidence: ${p.health.classification.evidence.join("; ")}`);
  }
  if (p.health.gitSha) {
    // eslint-disable-next-line no-console
    console.log(
      `app: deployment=${p.health.deploymentCode} platformLine=${p.health.platformLine} ` +
        `gitSha=${p.health.gitSha} identity=${p.health.expectedIdentityKey}/${p.health.expectedDatabaseEnvironment}`
    );
  }
}

async function main() {
  const bb = base("V8_DIAG_BB", "https://blessboard.neuniversity.org");
  const ac = base("V8_DIAG_AC", "https://activeclinic.neuniversity.org");
  // eslint-disable-next-line no-console
  console.log("[v8-diagnose-503] probing V8 hosts (read-only)");

  const results = [];
  for (const t of [
    { label: "blessboard", root: bb },
    { label: "activeclinic", root: ac },
  ]) {
    try {
      // eslint-disable-next-line no-await-in-loop
      results.push(await probe(t.label, t.root));
    } catch (err) {
      results.push({
        label: t.label,
        root: t.root,
        error: err && err.message ? err.message : String(err),
        home: {
          status: 0,
          classification: {
            layer: "unknown",
            code: "PROBE_ERROR",
            evidence: [],
          },
        },
        health: {
          status: 0,
          classification: {
            layer: "unknown",
            code: "PROBE_ERROR",
            evidence: [],
          },
        },
      });
    }
  }

  for (const p of results) printProbe(p);

  const healthy = results.every(
    (p) =>
      p.home.status === 200 &&
      p.health.status === 200 &&
      p.health.deploymentCode === "moovex-platform-v8-testing" &&
      p.health.platformLine === "v8"
  );
  if (healthy) {
    // eslint-disable-next-line no-console
    console.log("\n[v8-diagnose-503] PASS — both V8 hosts application-healthy");
    return 0;
  }

  if (
    isSharedV8DeploymentUnavailable(
      results[0].health.classification,
      results[1].health.classification
    ) ||
    isSharedV8DeploymentUnavailable(
      results[0].home.classification,
      results[1].home.classification
    )
  ) {
    // eslint-disable-next-line no-console
    console.log(
      "\n[v8-diagnose-503] ROOT_CAUSE_CLASS=HOSTINGER_EDGE_NO_UPSTREAM\n" +
        "Confirmed from public HTTP evidence: hCDN stock 503 HTML without Node upstream markers.\n" +
        "Cannot read Hostinger app logs from this environment — hPanel access required.\n" +
        "Manual action: create/bind/start V8 Node.js app on branch V8 for both neuniversity hosts.\n" +
        "See docs/releases/V8_P0_503_ROOT_CAUSE_AND_FIX.md"
    );
    return 3;
  }

  // eslint-disable-next-line no-console
  console.log("\n[v8-diagnose-503] FAIL — see classifications above");
  return 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[v8-diagnose-503]", err && err.message ? err.message : err);
    process.exitCode = 1;
  });
