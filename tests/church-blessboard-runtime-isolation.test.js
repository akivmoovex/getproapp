"use strict";

/**
 * BlessBoard V5 runtime-resource isolation: cookie, upload root, jobs switch, diagnostics.
 */

const path = require("path");
const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { spawnSync } = require("child_process");

const {
  getSessionCookieName,
  getUploadRoot,
  getUploadRootLogLabel,
  areBlessBoardJobsEnabled,
  getDeploymentEnv,
  getBlessBoardCanonicalDomain,
  DEFAULT_SESSION_COOKIE_NAME,
} = require("../src/church/blessBoardEnv");
const { shouldRunBlessBoardScheduledJob } = require("../src/startup/blessBoardJobsGate");
const { logBlessBoardRuntimeIsolationDiagnostics } = require("../src/startup/blessBoardRuntimeDiagnostics");
const { blessboardCanonicalRedirect } = require("../src/church/blessboardCanonicalRedirect");

const ENV_KEYS = [
  "SESSION_COOKIE_NAME",
  "UPLOAD_ROOT",
  "BLESSBOARD_JOBS_ENABLED",
  "DEPLOYMENT_ENV",
  "BLESSBOARD_CANONICAL_DOMAIN",
  "CHURCH_HOST_DOMAIN",
  "BLESSBOARD_CANONICAL_REDIRECT",
];

async function withEnv(overrides, fn) {
  const prev = {};
  for (const key of ENV_KEYS) prev[key] = process.env[key];
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const key of ENV_KEYS) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

test("V4 defaults: cookie getpro_sid, jobs enabled, default upload root", () => {
  withEnv(
    {
      SESSION_COOKIE_NAME: undefined,
      UPLOAD_ROOT: undefined,
      BLESSBOARD_JOBS_ENABLED: undefined,
      DEPLOYMENT_ENV: undefined,
      BLESSBOARD_CANONICAL_DOMAIN: undefined,
    },
    () => {
      assert.equal(getSessionCookieName(), DEFAULT_SESSION_COOKIE_NAME);
      assert.equal(getSessionCookieName(), "getpro_sid");
      assert.equal(areBlessBoardJobsEnabled(), true);
      assert.ok(getUploadRoot().endsWith(path.join("data", "uploads")));
      assert.equal(getBlessBoardCanonicalDomain(), "blessboard.com");
    }
  );
});

test("separate cookie configuration: blessboard_org_sid", () => {
  withEnv({ SESSION_COOKIE_NAME: "blessboard_org_sid" }, () => {
    assert.equal(getSessionCookieName(), "blessboard_org_sid");
  });
});

test("separate upload root via UPLOAD_ROOT", () => {
  const custom = path.join(path.sep, "tmp", "v5-runtime-uploads");
  withEnv({ UPLOAD_ROOT: custom }, () => {
    assert.equal(getUploadRoot(), path.resolve(custom));
  });
});

test("upload root log label redacts home directories", () => {
  withEnv({ UPLOAD_ROOT: "/home/u549637099/domains/blessboard.org/uploads" }, () => {
    const label = getUploadRootLogLabel();
    assert.match(label, /\/home\/\*\*\*/);
    assert.doesNotMatch(label, /u549637099/);
  });
});

test("jobs disabled when BLESSBOARD_JOBS_ENABLED=false", () => {
  withEnv({ BLESSBOARD_JOBS_ENABLED: "false" }, () => {
    assert.equal(areBlessBoardJobsEnabled(), false);
    assert.equal(shouldRunBlessBoardScheduledJob("unit-test-job"), false);
  });
});

test("jobs disabled for 0 / no / off", () => {
  for (const v of ["0", "no", "off", "FALSE"]) {
    withEnv({ BLESSBOARD_JOBS_ENABLED: v }, () => {
      assert.equal(areBlessBoardJobsEnabled(), false, v);
    });
  }
});

test("jobs enabled by default and when explicitly true", () => {
  withEnv({ BLESSBOARD_JOBS_ENABLED: undefined }, () => {
    assert.equal(areBlessBoardJobsEnabled(), true);
    assert.equal(shouldRunBlessBoardScheduledJob("unit-test-job"), true);
  });
  withEnv({ BLESSBOARD_JOBS_ENABLED: "1" }, () => {
    assert.equal(areBlessBoardJobsEnabled(), true);
  });
  withEnv({ BLESSBOARD_JOBS_ENABLED: "true" }, () => {
    assert.equal(areBlessBoardJobsEnabled(), true);
  });
});

test("cron script skips when jobs disabled (exit 0, no DB work)", () => {
  const scriptPath = path.join(__dirname, "../scripts/run-church-scheduled-report-jobs.js");
  const result = spawnSync(process.execPath, [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      BLESSBOARD_JOBS_ENABLED: "0",
      DATABASE_URL: "postgres://should-not-connect:secret@127.0.0.1:1/nope",
      GETPRO_DATABASE_URL: undefined,
      NODE_ENV: "development",
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /BLESSBOARD_JOBS_ENABLED=false/);
  assert.match(result.stdout, /scheduled-report-jobs/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /secret@|should-not-connect/);
});

test("ordinary application routes unaffected when jobs disabled", async () => {
  await withEnv(
    {
      BLESSBOARD_JOBS_ENABLED: "0",
      BLESSBOARD_CANONICAL_REDIRECT: "0",
      BLESSBOARD_CANONICAL_DOMAIN: "blessboard.com",
    },
    async () => {
      assert.equal(areBlessBoardJobsEnabled(), false);
      const app = express();
      app.use(blessboardCanonicalRedirect);
      app.get("/", (req, res) => res.status(200).type("text").send("home-ok"));
      app.get("/features", (req, res) => res.status(200).type("text").send("features-ok"));
      const home = await request(app)
        .get("/")
        .set("Host", "blessboard.com")
        .set("X-Forwarded-Proto", "https");
      const features = await request(app)
        .get("/features")
        .set("Host", "blessboard.com")
        .set("X-Forwarded-Proto", "https");
      assert.equal(home.status, 200);
      assert.equal(home.text, "home-ok");
      assert.equal(features.status, 200);
      assert.equal(features.text, "features-ok");
    }
  );
});

test("runtime diagnostics log safe fields without secrets", () => {
  const logs = [];
  const orig = console.log;
  console.log = (...args) => logs.push(args.join(" "));
  try {
    withEnv(
      {
        DEPLOYMENT_ENV: "testing",
        BLESSBOARD_CANONICAL_DOMAIN: "blessboard.org",
        SESSION_COOKIE_NAME: "blessboard_org_sid",
        UPLOAD_ROOT: "/home/secretuser/v5-uploads",
        BLESSBOARD_JOBS_ENABLED: "0",
      },
      () => {
        logBlessBoardRuntimeIsolationDiagnostics();
      }
    );
  } finally {
    console.log = orig;
  }
  const text = logs.join("\n");
  assert.match(text, /deployment environment: testing/);
  assert.match(text, /canonical domain: blessboard\.org/);
  assert.match(text, /session cookie name: blessboard_org_sid/);
  assert.match(text, /scheduled jobs enabled: no/);
  assert.match(text, /upload root:/);
  assert.doesNotMatch(text, /secretuser/);
  assert.match(text, /\/home\/\*\*\*/);
});

test("getDeploymentEnv reflects DEPLOYMENT_ENV", () => {
  withEnv({ DEPLOYMENT_ENV: "testing" }, () => {
    assert.equal(getDeploymentEnv(), "testing");
  });
});
