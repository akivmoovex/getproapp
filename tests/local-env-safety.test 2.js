"use strict";

/**
 * Local environment safety — leftover production-shaped repo-root `.env`
 * must not become the silent default for local/dev/test processes.
 * Never asserts secret values or live production connectivity.
 */

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const {
  assessRepoDotenvMerge,
  loadRepoDotenvIfSafe,
  shouldFailClosedHttpStart,
  productionIdentityReasons,
  peekDotenvFile,
} = require("../src/startup/localEnvSafety");
const { foundationDatabaseUrl } = require("./helpers/foundationDb");

const SECRET_URL = "postgres://unit:s3cret-do-not-log@db.example-prod.example/postgres";
const ROOT = path.join(__dirname, "..");
const WRAPPER = path.join(ROOT, "scripts/local/run-with-blessboard-env.sh");

function lastJsonObject(text) {
  const lines = String(text || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].startsWith("{") && lines[i].endsWith("}")) {
      return JSON.parse(lines[i]);
    }
  }
  throw new Error("no JSON object in process output");
}

function writeTempEnv(contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "getpro-env-safety-"));
  const envPath = path.join(dir, ".env");
  fs.writeFileSync(envPath, contents, "utf8");
  return { dir, envPath };
}

function rmTemp(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

function isolatedSpawnEnv(extra) {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME || "",
    TMPDIR: process.env.TMPDIR || os.tmpdir(),
    ...extra,
  };
}

describe("assessRepoDotenvMerge", () => {
  it("skips repo .env when the process is already production", () => {
    const r = assessRepoDotenvMerge({
      processEnv: { NODE_ENV: "production" },
      parsedFile: { NODE_ENV: "production", DATABASE_URL: SECRET_URL },
    });
    assert.equal(r.action, "skip_repo_dotenv_production_process");
    assert.equal(r.ok, true);
    assert.equal(r.message, undefined);
  });

  it("refuses leftover production NODE_ENV in repo .env for a local process", () => {
    const r = assessRepoDotenvMerge({
      processEnv: {},
      parsedFile: { NODE_ENV: "production", DATABASE_URL: SECRET_URL },
    });
    assert.equal(r.ok, false);
    assert.equal(r.action, "refuse_merge");
    assert.equal(r.code, "repo_dotenv_production_identity");
    assert.ok(r.reasons.includes("NODE_ENV=production"));
    assert.match(r.message, /will not load it/);
    assert.doesNotMatch(r.message, /s3cret/);
    assert.doesNotMatch(r.message, /postgres:\/\//i);
    assert.doesNotMatch(r.message, /example-prod/);
  });

  it("refuses production DEPLOYMENT_ENV / identity / deployment code", () => {
    const a = assessRepoDotenvMerge({
      processEnv: { NODE_ENV: "development" },
      parsedFile: { DEPLOYMENT_ENV: "production" },
    });
    assert.equal(a.action, "refuse_merge");
    const b = assessRepoDotenvMerge({
      processEnv: { NODE_ENV: "development" },
      parsedFile: { DATABASE_IDENTITY_ENV: "production" },
    });
    assert.equal(b.action, "refuse_merge");
    const c = assessRepoDotenvMerge({
      processEnv: { NODE_ENV: "development" },
      parsedFile: { PLATFORM_DEPLOYMENT_CODE: "blessboard-com-production" },
    });
    assert.equal(c.action, "refuse_merge");
  });

  it("allows a development-shaped local .env", () => {
    const r = assessRepoDotenvMerge({
      processEnv: {},
      parsedFile: {
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://localhost:5432/getpro_dev",
        DEPLOYMENT_ENV: "testing",
      },
    });
    assert.equal(r.ok, true);
    assert.equal(r.action, "merge");
    assert.equal(r.code, "safe_local");
  });

  it("productionIdentityReasons never includes connection strings", () => {
    const reasons = productionIdentityReasons({
      NODE_ENV: "production",
      DATABASE_URL: SECRET_URL,
    });
    assert.deepEqual(reasons, ["NODE_ENV=production"]);
    assert.equal(reasons.join(" ").includes("s3cret"), false);
  });
});

describe("loadRepoDotenvIfSafe", () => {
  const prev = {};
  const KEYS = ["NODE_ENV", "DATABASE_URL", "GETPRO_DATABASE_URL", "GETPRO_SKIP_DOTENV", "SESSION_SECRET"];

  beforeEach(() => {
    for (const k of KEYS) prev[k] = process.env[k];
    delete process.env.NODE_ENV;
    delete process.env.DATABASE_URL;
    delete process.env.GETPRO_DATABASE_URL;
    delete process.env.GETPRO_SKIP_DOTENV;
    delete process.env.SESSION_SECRET;
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  it("does not apply production-shaped leftover .env", () => {
    const { dir, envPath } = writeTempEnv(
      `NODE_ENV=production\nDATABASE_URL=${SECRET_URL}\nSESSION_SECRET=unit-secret-value\n`
    );
    try {
      const r = loadRepoDotenvIfSafe(envPath, process.env);
      assert.equal(r.assessment.action, "refuse_merge");
      assert.equal(r.loaded, false);
      assert.equal(r.skipped, true);
      assert.equal(process.env.DATABASE_URL, undefined);
      assert.equal(process.env.NODE_ENV, undefined);
      assert.equal(process.env.SESSION_SECRET, undefined);
      assert.doesNotMatch(JSON.stringify(r.assessment), /s3cret/);
      assert.doesNotMatch(JSON.stringify(r.assessment), /unit-secret-value/);
    } finally {
      rmTemp(dir);
    }
  });

  it("merges development-shaped .env for local processes", () => {
    const { dir, envPath } = writeTempEnv(
      "NODE_ENV=development\nDATABASE_URL=postgresql://localhost:5432/getpro_dev_safe\n"
    );
    try {
      const r = loadRepoDotenvIfSafe(envPath, process.env);
      assert.equal(r.assessment.action, "merge");
      assert.equal(r.loaded, true);
      assert.equal(process.env.NODE_ENV, "development");
      assert.equal(process.env.DATABASE_URL, "postgresql://localhost:5432/getpro_dev_safe");
    } finally {
      rmTemp(dir);
    }
  });

  it("does not override an existing process DATABASE_URL when merging", () => {
    process.env.DATABASE_URL = "postgresql://localhost:5432/already_set";
    const { dir, envPath } = writeTempEnv(
      "NODE_ENV=development\nDATABASE_URL=postgresql://localhost:5432/from_file\n"
    );
    try {
      const r = loadRepoDotenvIfSafe(envPath, process.env);
      assert.equal(r.loaded, true);
      assert.equal(process.env.DATABASE_URL, "postgresql://localhost:5432/already_set");
    } finally {
      rmTemp(dir);
    }
  });
});

describe("shouldFailClosedHttpStart", () => {
  it("fails closed when leftover production .env was refused and no DB URL is set", () => {
    const boot = {
      repoDotenvSafety: { action: "refuse_merge", code: "repo_dotenv_production_identity" },
    };
    assert.equal(shouldFailClosedHttpStart(boot, {}), true);
    assert.equal(
      shouldFailClosedHttpStart(boot, { DATABASE_URL: "postgresql://localhost:5432/explicit" }),
      false
    );
  });

  it("does not block Hostinger-style production bootstrap", () => {
    const boot = {
      repoDotenvSafety: { action: "skip_repo_dotenv_production_process", code: "production_process" },
    };
    assert.equal(
      shouldFailClosedHttpStart(boot, {
        NODE_ENV: "production",
        DATABASE_URL: "postgres://hostinger-injected/db",
      }),
      false
    );
  });
});

describe("foundation tests stay on isolated local databases", () => {
  it("foundation helper URLs are localhost", () => {
    const url = foundationDatabaseUrl("blessboard_ft_unit");
    assert.match(url, /^postgresql:\/\/localhost:5432\/blessboard_ft_unit$/);
    assert.doesNotMatch(url, /supabase/i);
  });
});

describe("rehearsal / named local loader isolation", () => {
  it("wrapper loads only .env.<name>.local and never sources repo-root .env", () => {
    const src = fs.readFileSync(WRAPPER, "utf8");
    assert.match(src, /Does not load repo-root \.env/);
    assert.match(src, /ENV_BASENAME="\.env\.\$\{ENV_NAME\}\.local"/);
    assert.doesNotMatch(src, /source ["']\$\{REPO_ROOT\}\/\.env["']/);
    assert.match(src, /source "\$ENV_REAL"/);
  });

  it("gitignores named local env files including rehearsal", () => {
    const check = spawnSync(
      "git",
      ["check-ignore", "-v", ".env.testing.local", ".env.production.local", ".env.rehearsal.local", ".env"],
      { cwd: ROOT, encoding: "utf8" }
    );
    assert.equal(check.status, 0);
    assert.match(check.stdout || "", /\.env\.testing\.local/);
    assert.match(check.stdout || "", /\.env\.production\.local/);
    assert.match(check.stdout || "", /\.env\.rehearsal\.local/);
    assert.match(check.stdout || "", /\.env\b/);
  });
});

describe("bootstrap + leftover production .env (spawn isolated)", () => {
  it("unset NODE_ENV does not adopt leftover production repo-root .env", () => {
    const r = spawnSync(
      process.execPath,
      [
        "-e",
        `
          const { resetBootstrapForTests, runBootstrap } = require('./src/startup/bootstrap');
          const { peekDotenvFile, productionIdentityReasons } = require('./src/startup/localEnvSafety');
          resetBootstrapForTests();
          const b = runBootstrap();
          const parsed = peekDotenvFile(b.envPath) || {};
          const leftoverProd = productionIdentityReasons(parsed).length > 0;
          const url = process.env.DATABASE_URL || '';
          let host = '';
          try { host = new URL(url.replace(/^postgresql:/i, 'postgres:')).hostname || ''; } catch (_) {}
          const out = {
            leftoverProd,
            action: b.repoDotenvSafety && b.repoDotenvSafety.action,
            code: b.repoDotenvSafety && b.repoDotenvSafety.code,
            dotenvKeyCount: b.dotenvKeyCount,
            nodeEnv: process.env.NODE_ENV || '',
            hasUrl: Boolean(url),
            hostIsSupabase: /supabase\\.com$/i.test(host),
          };
          process.stdout.write(JSON.stringify(out));
        `,
      ],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: isolatedSpawnEnv({}),
      }
    );
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stdout + r.stderr, /postgres:\/\/[^/\s]+:[^@\s]+@/i);
    const out = lastJsonObject(r.stdout);
    if (out.leftoverProd) {
      assert.equal(out.action, "refuse_merge");
      assert.equal(out.code, "repo_dotenv_production_identity");
      assert.equal(out.dotenvKeyCount, 0);
      assert.equal(out.nodeEnv, "");
      assert.equal(out.hasUrl, false);
      assert.equal(out.hostIsSupabase, false);
    } else {
      assert.notEqual(out.nodeEnv, "production");
      assert.equal(out.hostIsSupabase, false);
    }
  });

  it("NODE_ENV=production does not merge repo-root .env (Hostinger path)", () => {
    const r = spawnSync(
      process.execPath,
      [
        "-e",
        `
          process.env.NODE_ENV = 'production';
          const { resetBootstrapForTests, runBootstrap } = require('./src/startup/bootstrap');
          resetBootstrapForTests();
          const b = runBootstrap();
          const url = process.env.DATABASE_URL || '';
          let host = '';
          try { host = new URL(url.replace(/^postgresql:/i, 'postgres:')).hostname || ''; } catch (_) {}
          const out = {
            skipDotenv: b.skipDotenv,
            dotenvSkippedForProduction: b.dotenvSkippedForProduction,
            dotenvKeyCount: b.dotenvKeyCount,
            action: b.repoDotenvSafety && b.repoDotenvSafety.action,
            hasUrl: Boolean(url),
            hostIsSupabase: /supabase\\.com$/i.test(host),
          };
          process.stdout.write(JSON.stringify(out));
        `,
      ],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: isolatedSpawnEnv({ NODE_ENV: "production" }),
      }
    );
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stdout + r.stderr, /postgres:\/\/[^/\s]+:[^@\s]+@/i);
    const out = lastJsonObject(r.stdout);
    assert.equal(out.skipDotenv, true);
    assert.equal(out.dotenvSkippedForProduction, true);
    assert.equal(out.dotenvKeyCount, 0);
    assert.equal(out.action, "skip_repo_dotenv_production_process");
    assert.equal(out.hasUrl, false);
    assert.equal(out.hostIsSupabase, false);
  });
});

describe("HTTP fail-closed spawn", () => {
  it("server.js exits before listening when leftover production .env is the only config", () => {
    const leftover = peekDotenvFile(path.join(ROOT, ".env"));
    if (!leftover || productionIdentityReasons(leftover).length === 0) {
      assert.ok(true, "skip: no leftover production-shaped repo-root .env");
      return;
    }
    const r = spawnSync(process.execPath, ["server.js"], {
      cwd: ROOT,
      encoding: "utf8",
      env: isolatedSpawnEnv({ GETPRO_DB_MISSING_EXIT_DELAY_MS: "0" }),
      timeout: 15000,
    });
    assert.notEqual(r.status, 0);
    const text = `${r.stdout || ""}\n${r.stderr || ""}`;
    assert.match(text, /repo-root \.env declares production identity/);
    assert.doesNotMatch(text, /postgres:\/\/[^/\s]+:[^@\s]+@/i);
    assert.doesNotMatch(text, /Listening|server listening/i);
  });
});
