#!/usr/bin/env node
"use strict";

/**
 * Optional hosted V8 smoke runner.
 * Read-only HTTP checks against neuniversity.org hosts. Never migrates or deletes data.
 *
 * Usage:
 *   V8_SMOKE_BASE_BB=https://blessboard.neuniversity.org \
 *   V8_SMOKE_BASE_AC=https://activeclinic.neuniversity.org \
 *   npm run test:v8:hosted-smoke
 *
 * Exit codes:
 *   0 PASS
 *   2 SKIP / not configured (infrastructure not ready)
 *   1 FAIL
 */

const https = require("https");
const http = require("http");

function envUrl(name) {
  const raw = String(process.env[name] || "").trim().replace(/\/$/, "");
  return raw || "";
}

function fetchJson(url) {
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
        resolve({ status: res.statusCode || 0, json, body: body.slice(0, 400) });
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

async function checkHealth(label, base) {
  const url = `${base}/healthz`;
  const res = await fetchJson(url);
  if (res.status !== 200 || !res.json || res.json.ok !== true) {
    return {
      ok: false,
      label,
      message: `healthz status=${res.status} body=${res.body}`,
    };
  }
  const platformLine = res.json.platformLine;
  const deploymentCode = res.json.deploymentCode;
  if (platformLine && platformLine !== "v8") {
    return {
      ok: false,
      label,
      message: `expected platformLine=v8 got ${JSON.stringify(platformLine)}`,
    };
  }
  if (
    deploymentCode &&
    deploymentCode !== "moovex-platform-v8-testing"
  ) {
    return {
      ok: false,
      label,
      message: `expected deploymentCode=moovex-platform-v8-testing got ${JSON.stringify(deploymentCode)}`,
    };
  }
  return {
    ok: true,
    label,
    gitSha: res.json.gitSha || null,
    deploymentCode: deploymentCode || null,
    platformLine: platformLine || null,
  };
}

async function main() {
  const bb = envUrl("V8_SMOKE_BASE_BB");
  const ac = envUrl("V8_SMOKE_BASE_AC");
  if (!bb && !ac) {
    // eslint-disable-next-line no-console
    console.log(
      "[v8-hosted-smoke] SKIP — set V8_SMOKE_BASE_BB and/or V8_SMOKE_BASE_AC " +
        "(e.g. https://blessboard.neuniversity.org). Infrastructure not ready."
    );
    return 2;
  }

  const targets = [];
  if (bb) targets.push({ label: "blessboard", base: bb });
  if (ac) targets.push({ label: "activeclinic", base: ac });

  const results = [];
  for (const t of targets) {
    try {
      // eslint-disable-next-line no-await-in-loop
      results.push(await checkHealth(t.label, t.base));
    } catch (err) {
      results.push({
        ok: false,
        label: t.label,
        message: err && err.message ? err.message : String(err),
      });
    }
  }

  let failed = 0;
  for (const r of results) {
    if (r.ok) {
      // eslint-disable-next-line no-console
      console.log(
        `[v8-hosted-smoke] PASS ${r.label} deployment=${r.deploymentCode} ` +
          `platformLine=${r.platformLine} gitSha=${r.gitSha}`
      );
    } else {
      failed += 1;
      // eslint-disable-next-line no-console
      console.error(`[v8-hosted-smoke] FAIL ${r.label}: ${r.message}`);
    }
  }
  return failed ? 1 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[v8-hosted-smoke]", err && err.message ? err.message : err);
    process.exitCode = 1;
  });
