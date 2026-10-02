"use strict";

/**
 * Deployed smoke runner tests — mock HTTP only; never hits real Hostinger/production.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const {
  redactUrl,
  validateBaseUrl,
  isProductionHostname,
  isAllowedTestingHostname,
  findSecretLeaks,
  findInternalErrors,
  checkSecurityHeaders,
  extractStaticAssetPaths,
  runDeployedSmoke,
  formatHumanReport,
  parseSmokeArgs,
  PRODUCTION_HOSTNAMES,
} = require("../src/blessboard/tools/deployedSmokeRunner");

const FIXTURES = path.join(__dirname, "fixtures", "deployed-smoke");
const CLI = path.join(__dirname, "..", "scripts", "smoke-v5-deployed.js");

function readFixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), "utf8");
}

/**
 * @param {(req: http.IncomingMessage, res: http.ServerResponse) => void} handler
 * @returns {Promise<{ server: http.Server, baseUrl: string, port: number }>}
 */
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

const SEC_HEADERS = {
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

/**
 * Happy-path mock deployment.
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
function mockHappyHandler(req, res) {
  const host = String(req.headers.host || "").split(":")[0].toLowerCase();
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const pathName = url.pathname;

  const send = (status, body, headers = {}) => {
    res.writeHead(status, {
      "content-type": typeof body === "string" && body.trimStart().startsWith("{") ? "application/json" : "text/html; charset=utf-8",
      ...SEC_HEADERS,
      ...headers,
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(body);
  };

  if (host.startsWith("unknown-") || host === "unknown.blessboard.org") {
    send(404, "<!DOCTYPE html><html><body><h1>Church not found</h1><p>BlessBoard</p></body></html>");
    return;
  }

  if (host.includes("diagnostic") || host.includes("tenant")) {
    if (pathName === "/login") {
      res.writeHead(302, { location: "https://blessboard.org/login?tr=REDACTED", ...SEC_HEADERS });
      res.end();
      return;
    }
    send(200, "<!DOCTYPE html><html><body><h1>Demo Church</h1><p>BlessBoard tenant</p></body></html>");
    return;
  }

  if (pathName === "/healthz") {
    send(200, readFixture("healthz.json"));
    return;
  }
  if (pathName === "/login") {
    send(200, readFixture("apex-login.html"));
    return;
  }
  if (pathName === "/account" || pathName === "/admin") {
    res.writeHead(302, { location: "/login", ...SEC_HEADERS });
    res.end();
    return;
  }
  if (pathName.startsWith("/blessboard/v5/")) {
    send(200, pathName.endsWith(".css") ? "/* css */" : "/* js */", {
      "content-type": pathName.endsWith(".css") ? "text/css" : "application/javascript",
    });
    return;
  }
  if (["/", "/features", "/pricing", "/directory", "/register-church"].includes(pathName)) {
    const home = readFixture("apex-home.html");
    const body =
      pathName === "/"
        ? home
        : home
            .replace("<h1>BlessBoard</h1>", `<h1>BlessBoard ${pathName.slice(1)}</h1>`)
            .replace("Church platform", `${pathName} feature pricing directory register church`);
    send(200, body);
    return;
  }
  send(404, "<html><body>not found BlessBoard</body></html>");
}

describe("deployed smoke — policy helpers", () => {
  it("redacts sensitive query values", () => {
    const out = redactUrl("https://blessboard.org/login?tr=SECRET&next=/hq&token=abc");
    assert.match(out, /tr=REDACTED/);
    assert.match(out, /token=REDACTED/);
    assert.match(out, /next=%2Fhq|next=\/hq/);
    assert.doesNotMatch(out, /SECRET|token=abc/);
  });

  it("requires base URL and rejects production hosts by default", () => {
    assert.equal(validateBaseUrl("").ok, false);
    assert.equal(validateBaseUrl("https://getproapp.org").ok, false);
    assert.ok(validateBaseUrl("https://getproapp.org").errors.some((e) => /production/i.test(e)));
    assert.equal(validateBaseUrl("https://blessboard.com").ok, false);
    assert.equal(
      validateBaseUrl("https://getproapp.org", { allowProductionHostname: true }).ok,
      true
    );
  });

  it("rejects localhost without override; allows with override", () => {
    assert.equal(validateBaseUrl("http://127.0.0.1:9").ok, false);
    assert.equal(validateBaseUrl("http://127.0.0.1:9", { allowLocalhost: true }).ok, true);
  });

  it("allows testing apex and tenant suffixes", () => {
    assert.equal(isAllowedTestingHostname("blessboard.org"), true);
    assert.equal(isAllowedTestingHostname("diagnostic.blessboard.org"), true);
    assert.equal(isAllowedTestingHostname("staging.example.com"), true);
    assert.equal(isAllowedTestingHostname("evil.example.com"), false);
    assert.equal(isProductionHostname("getproapp.org"), true);
    assert.ok(PRODUCTION_HOSTNAMES.includes("blessboard.com"));
  });

  it("detects secrets and internal error text without needing network", () => {
    const bad = readFixture("bad-leak.html");
    assert.ok(findSecretLeaks(bad).length >= 1);
    assert.ok(findInternalErrors(bad).length >= 1);
    assert.equal(findSecretLeaks(readFixture("apex-home.html")).length, 0);
  });

  it("extracts static assets and checks security headers", () => {
    const assets = extractStaticAssetPaths(readFixture("apex-home.html"));
    assert.ok(assets.some((p) => p.includes("apex.css")));
    assert.equal(checkSecurityHeaders({}).ok, false);
    assert.equal(checkSecurityHeaders({ "referrer-policy": "no-referrer" }).ok, true);
  });

  it("parseSmokeArgs reads flags", () => {
    const parsed = parseSmokeArgs([
      "node",
      "cli",
      "--base-url",
      "https://blessboard.org",
      "--tenant-host",
      "diagnostic.blessboard.org",
      "--allow-hostname",
      "qa.example.com",
      "--json",
    ]);
    assert.equal(parsed.baseUrl, "https://blessboard.org");
    assert.equal(parsed.tenantHost, "diagnostic.blessboard.org");
    assert.deepEqual(parsed.allowHostname, ["qa.example.com"]);
    assert.equal(parsed.json, true);
  });
});

describe("deployed smoke — mock HTTP (no real deployment)", { concurrency: 1 }, () => {
  /** @type {{ server: http.Server, baseUrl: string }} */
  let mock;

  before(async () => {
    mock = await listen(mockHappyHandler);
  });

  after(async () => {
    await closeServer(mock.server);
  });

  it("passes against happy mock with tenant host", async () => {
    const report = await runDeployedSmoke({
      baseUrl: mock.baseUrl,
      tenantHost: "diagnostic.blessboard.org",
      unknownHost: "unknown.blessboard.org",
      allowLocalhost: true,
      allowHttp: true,
    });
    assert.equal(report.ok, true, formatHumanReport(report));
    assert.equal(report.mode, "read-only");
    assert.ok(report.summary.fail === 0);
    assert.ok(report.checks.every((c) => c.request.method === "GET" || c.request.method === "HEAD"));
    assert.doesNotMatch(JSON.stringify(report), /tr=[^R]|password=|SECRET/);
  });

  it("fails when HTML leaks secrets / stack traces (fetchFn mock)", async () => {
    const health = readFixture("healthz.json");
    const bad = readFixture("bad-leak.html");
    const report = await runDeployedSmoke({
      baseUrl: "https://blessboard.org",
      skipStaticAssets: true,
      fetchFn: async (req) => {
        const pathName = new URL(req.url).pathname;
        if (pathName === "/healthz") {
          return {
            status: 200,
            headers: { ...SEC_HEADERS, "content-type": "application/json" },
            body: health,
          };
        }
        if (pathName === "/account" || pathName === "/admin") {
          return { status: 302, headers: { location: "/login", ...SEC_HEADERS }, body: "" };
        }
        return {
          status: 200,
          headers: { ...SEC_HEADERS, "content-type": "text/html" },
          body: bad,
        };
      },
    });
    assert.equal(report.ok, false);
    assert.ok(report.findings.some((f) => /secret:|error_text:/.test(f.id)));
    assert.doesNotMatch(JSON.stringify(report), /postgres:\/\/user:secret/);
  });

  it("aborts before HTTP when production host blocked", async () => {
    const report = await runDeployedSmoke({
      baseUrl: "https://getproapp.org",
      fetchFn: async () => {
        throw new Error("should not fetch");
      },
    });
    assert.equal(report.ok, false);
    assert.equal(report.aborted, true);
    assert.ok(report.findings.some((f) => f.id === "policy:base_url"));
  });

  it("CLI help / missing base-url / production gate", () => {
    const help = spawnSync(process.execPath, [CLI, "--help"], { encoding: "utf8" });
    assert.equal(help.status, 0);
    assert.match(help.stderr, /base-url/);

    const missing = spawnSync(process.execPath, [CLI], { encoding: "utf8" });
    assert.equal(missing.status, 2);

    const prod = spawnSync(
      process.execPath,
      [CLI, "--base-url", "https://getproapp.org", "--json"],
      { encoding: "utf8", timeout: 5000 }
    );
    assert.equal(prod.status, 1);
    const prodJson = JSON.parse(prod.stdout);
    assert.equal(prodJson.ok, false);
    assert.equal(prodJson.aborted, true);
  });

  it("CLI against mock via async spawn (event loop stays free)", async () => {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          CLI,
          "--base-url",
          mock.baseUrl,
          "--allow-localhost",
          "--allow-http",
          "--tenant-host",
          "diagnostic.blessboard.org",
          "--unknown-host",
          "unknown.blessboard.org",
          "--json",
        ],
        { stdio: ["ignore", "pipe", "pipe"] }
      );
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error("CLI mock smoke timed out"));
      }, 15000);
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      });
    });
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.tool, "smoke:v5:deployed");
  });
});
