"use strict";

/**
 * Hosted testing SHA checker — mock HTTP only; never hits real Hostinger/production.
 */

const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("path");
const { spawn } = require("node:child_process");

const {
  normalizeSha,
  classifyHealthz,
  checkHostedTestingSha,
  isProductionHostname,
  parseArgs,
  EXPECTED_DEPLOYMENT_CODE,
  EXPECTED_ENVIRONMENT,
} = require("../scripts/check-hosted-testing-sha");

const CLI = path.join(__dirname, "..", "scripts", "check-hosted-testing-sha.js");
const EXPECTED = "9dbea13a3f26";

function listen(handler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("failed to bind"));
        return;
      }
      resolve({
        server,
        port: addr.port,
        baseUrl: `http://127.0.0.1:${addr.port}`,
      });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function healthzHandler(overrides) {
  const body = {
    ok: true,
    mode: "moovex-platform-runtime",
    deploymentCode: EXPECTED_DEPLOYMENT_CODE,
    environment: EXPECTED_ENVIRONMENT,
    gitSha: EXPECTED,
    schemaCompatible: true,
    ...overrides,
  };
  return (req, res) => {
    if (req.url !== "/healthz") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
}

describe("v7 hosted testing SHA checker", () => {
  const servers = [];

  after(async () => {
    await Promise.all(servers.map((server) => closeServer(server)));
  });

  it("normalizes SHAs to 12 hex chars", () => {
    assert.equal(normalizeSha("9dbea13a3f266f0f131799fac37f72d456fbff82"), EXPECTED);
    assert.equal(normalizeSha("  9DBEA13A3F26  "), EXPECTED);
  });

  it("classifies drift vs wrong profile vs compatible", () => {
    assert.equal(
      classifyHealthz(
        {
          environment: "testing",
          deploymentCode: EXPECTED_DEPLOYMENT_CODE,
          schemaCompatible: true,
          gitSha: EXPECTED,
        },
        EXPECTED
      ),
      "OK"
    );
    assert.equal(
      classifyHealthz(
        {
          environment: "testing",
          deploymentCode: EXPECTED_DEPLOYMENT_CODE,
          schemaCompatible: true,
          gitSha: "a6f22944048e",
        },
        EXPECTED
      ),
      "DEPLOY_DRIFT"
    );
    assert.equal(
      classifyHealthz(
        {
          environment: "production",
          deploymentCode: EXPECTED_DEPLOYMENT_CODE,
          schemaCompatible: true,
          gitSha: EXPECTED,
        },
        EXPECTED
      ),
      "WRONG_ENVIRONMENT"
    );
    assert.equal(
      classifyHealthz(
        {
          environment: "testing",
          deploymentCode: "moovex-platform-production",
          schemaCompatible: true,
          gitSha: EXPECTED,
        },
        EXPECTED
      ),
      "WRONG_DEPLOYMENT_PROFILE"
    );
  });

  it("refuses production hostnames", () => {
    assert.equal(isProductionHostname("blessboard.com"), true);
    assert.equal(isProductionHostname("activeclinic.pronline.org"), false);
  });

  it("reports match against mock testing healthz", async () => {
    const { server, baseUrl } = await listen(healthzHandler({}));
    servers.push(server);
    const report = await checkHostedTestingSha({
      expectedSha: EXPECTED,
      urls: [`${baseUrl}/healthz`],
      allowLocalhost: true,
    });
    assert.equal(report.ok, true);
    assert.equal(report.drift, false);
    assert.equal(report.expectedSha, EXPECTED);
    assert.equal(report.hosts[0].classification, "OK");
    assert.equal(report.exitCode, 0);
  });

  it("reports deploy drift without treating it as a production hit", async () => {
    const { server, baseUrl } = await listen(healthzHandler({ gitSha: "a6f22944048e" }));
    servers.push(server);
    const report = await checkHostedTestingSha({
      expectedSha: EXPECTED,
      urls: [`${baseUrl}/healthz`],
      allowLocalhost: true,
    });
    assert.equal(report.ok, false);
    assert.equal(report.drift, true);
    assert.equal(report.hosts[0].classification, "DEPLOY_DRIFT");
    assert.equal(report.exitCode, 3);
  });

  it("CLI exits 3 on drift and 0 on match", async () => {
    const match = await listen(healthzHandler({}));
    const drift = await listen(healthzHandler({ gitSha: "a6f22944048e" }));
    servers.push(match.server, drift.server);

    function runCli(url) {
      return new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [
            CLI,
            "--expected-sha",
            EXPECTED,
            "--url",
            url,
            "--allow-localhost",
            "--timeout-ms",
            "3000",
            "--json",
          ],
          { stdio: ["ignore", "pipe", "pipe"] }
        );
        let stdout = "";
        let stderr = "";
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
          stdout += chunk;
        });
        child.stderr.on("data", (chunk) => {
          stderr += chunk;
        });
        child.on("error", reject);
        child.on("close", (status) => {
          resolve({ status, stdout, stderr });
        });
      });
    }

    const okRun = await runCli(`${match.baseUrl}/healthz`);
    assert.equal(okRun.status, 0, okRun.stderr);
    const okBody = JSON.parse(okRun.stdout);
    assert.equal(okBody.ok, true);

    const driftRun = await runCli(`${drift.baseUrl}/healthz`);
    assert.equal(driftRun.status, 3, driftRun.stderr);
    const driftBody = JSON.parse(driftRun.stdout);
    assert.equal(driftBody.drift, true);
  });

  it("parses expected SHA and urls", () => {
    const parsed = parseArgs([
      "--expected-sha",
      EXPECTED,
      "--url",
      "https://activeclinic.pronline.org/healthz",
      "--json",
    ]);
    assert.equal(parsed.expectedSha, EXPECTED);
    assert.equal(parsed.urls.length, 1);
    assert.equal(parsed.json, true);
  });
});
