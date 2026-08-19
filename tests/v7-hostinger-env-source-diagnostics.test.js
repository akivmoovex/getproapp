"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

const {
  parseDatabaseUrlFingerprint,
  fingerprintEffectiveDatabaseUrl,
} = require("../src/startup/databaseUrlFingerprint");
const {
  isPlatformRuntimeDiagnosticsEndpointAllowed,
  buildPlatformRuntimeSnapshot,
} = require("../src/startup/platformRuntimeSnapshot");
const {
  resetBootstrapForTests,
  runBootstrap,
} = require("../src/startup/bootstrap");
const {
  createMoovexPlatformRuntimeApp,
} = require("../src/platform/http/moovexPlatformRuntimeServer");
const {
  CODE_MOOVEX_PLATFORM_TESTING,
} = require("../src/platform/config/canonicalDeploymentProfiles");

test("parseDatabaseUrlFingerprint: extracts host/port/db without secrets", () => {
  const fp = parseDatabaseUrlFingerprint(
    "postgres://user:s3cret@db.exoelhlxvstevtwbldyc.supabase.co:5432/postgres?sslmode=require"
  );
  assert.equal(fp.ok, true);
  assert.equal(fp.protocol, "postgres");
  assert.equal(fp.hostname, "db.exoelhlxvstevtwbldyc.supabase.co");
  assert.equal(fp.port, "5432");
  assert.equal(fp.database, "postgres");
  const serialized = JSON.stringify(fp);
  assert.equal(serialized.includes("s3cret"), false);
  assert.equal(serialized.includes("user"), false);
});

test("fingerprintEffectiveDatabaseUrl: DATABASE_URL wins over GETPRO", () => {
  const r = fingerprintEffectiveDatabaseUrl({
    DATABASE_URL: "postgres://a:b@aws-0-pooler.supabase.com:6543/postgres",
    GETPRO_DATABASE_URL: "postgres://a:b@old.example.com:5432/postgres",
  });
  assert.equal(r.sourceVar, "DATABASE_URL");
  assert.equal(r.fingerprint.hostname, "aws-0-pooler.supabase.com");
});

test("platform runtime endpoint allowed only for testing (fail-closed in production)", () => {
  assert.equal(
    isPlatformRuntimeDiagnosticsEndpointAllowed({
      DEPLOYMENT_ENV: "testing",
      NODE_ENV: "production",
    }),
    true
  );
  assert.equal(
    isPlatformRuntimeDiagnosticsEndpointAllowed({
      DEPLOYMENT_ENV: "production",
      NODE_ENV: "production",
    }),
    false
  );
  assert.equal(
    isPlatformRuntimeDiagnosticsEndpointAllowed({
      NODE_ENV: "production",
    }),
    false
  );
});

test("buildPlatformRuntimeSnapshot: never includes secrets", () => {
  const snap = buildPlatformRuntimeSnapshot({
    NODE_ENV: "production",
    DEPLOYMENT_ENV: "testing",
    PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
    DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
    DATABASE_IDENTITY_ENV: "testing",
    DATABASE_URL: "postgres://user:password@aws-0-xpcpv.pooler.supabase.com:5432/postgres",
    SESSION_SECRET: "super-secret-session",
  });
  const json = JSON.stringify(snap);
  assert.equal(json.includes("password"), false);
  assert.equal(json.includes("super-secret"), false);
  assert.equal(json.includes("postgres://"), false);
  assert.equal(snap.databaseHost, "aws-0-xpcpv.pooler.supabase.com");
  assert.equal(snap.deploymentCode, CODE_MOOVEX_PLATFORM_TESTING);
  assert.equal("gitSha" in snap, true);
  assert.equal("schemaCompatible" in snap, true);
  assert.equal(snap.schemaCompatible, null);
});

test("buildPlatformRuntimeSnapshot: includes schema compatibility from boot without secrets", () => {
  const snap = buildPlatformRuntimeSnapshot(
    {
      NODE_ENV: "production",
      DEPLOYMENT_ENV: "testing",
      PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
      DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
      DATABASE_IDENTITY_ENV: "testing",
      DATABASE_URL: "postgres://user:password@aws-0-xpcpv.pooler.supabase.com:5432/postgres",
      SESSION_SECRET: "super-secret-session",
      GETPRO_GIT_SHA: "0509e3035a8de3908b3b81dec4de0c03d88bd290",
    },
    {
      boot: {
        schemaCompatibility: {
          compatible: true,
          code: "ok",
          missing: [],
        },
      },
    }
  );
  const json = JSON.stringify(snap);
  assert.equal(json.includes("password"), false);
  assert.equal(json.includes("super-secret"), false);
  assert.equal(typeof snap.gitSha, "string");
  assert.ok(snap.gitSha.length >= 7);
  assert.equal(snap.schemaCompatible, true);
  assert.equal(snap.schemaCompatibility.compatible, true);
  assert.deepEqual(snap.schemaCompatibility.missing, []);
});

test("createMoovexPlatformRuntimeApp: /__platform/runtime gated", async () => {
  const app = createMoovexPlatformRuntimeApp({
    env: {
      NODE_ENV: "production",
      DEPLOYMENT_ENV: "testing",
      PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
      DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
      DATABASE_IDENTITY_ENV: "testing",
      DATABASE_URL: "postgres://u:p@host.example:5432/db",
      SESSION_SECRET: "x",
    },
    productApps: {},
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  try {
    const port = server.address().port;
    const res = await fetch(`http://127.0.0.1:${port}/__platform/runtime`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.databaseHost, "host.example");
    assert.equal(JSON.stringify(body).includes("postgres://"), false);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("createMoovexPlatformRuntimeApp: /__platform/runtime 404 when production DEPLOYMENT_ENV", async () => {
  const app = createMoovexPlatformRuntimeApp({
    env: {
      NODE_ENV: "production",
      DEPLOYMENT_ENV: "production",
      PLATFORM_DEPLOYMENT_CODE: "moovex-platform-production",
      DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
      DATABASE_IDENTITY_ENV: "production",
      DATABASE_URL: "postgres://u:p@host.example:5432/db",
      SESSION_SECRET: "x",
    },
    productApps: {},
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  try {
    const port = server.address().port;
    const res = await fetch(`http://127.0.0.1:${port}/__platform/runtime`);
    assert.equal(res.status, 404);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("bootstrap: pre_file snapshot precedes early .env.production fill; host DATABASE_URL not overwritten", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "getpro-env-diag-"));
  const envFile = path.join(dir, ".env.production");
  fs.writeFileSync(
    envFile,
    [
      "DATABASE_URL=postgres://fileuser:filepass@from-file.supabase.co:5432/postgres",
      "DBURL_TEST=from-file",
      "PLATFORM_DEPLOYMENT_CODE=moovex-platform-testing",
      "DEPLOYMENT_ENV=testing",
      "SESSION_SECRET=file-session",
      "BASE_DOMAIN=pronline.org",
      "",
    ].join("\n"),
    "utf8"
  );

  const prev = {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    GETPRO_DATABASE_URL: process.env.GETPRO_DATABASE_URL,
    DBURL_TEST: process.env.DBURL_TEST,
    PLATFORM_DEPLOYMENT_CODE: process.env.PLATFORM_DEPLOYMENT_CODE,
    DEPLOYMENT_ENV: process.env.DEPLOYMENT_ENV,
    SESSION_SECRET: process.env.SESSION_SECRET,
    BASE_DOMAIN: process.env.BASE_DOMAIN,
    GETPRO_PRODUCTION_ENV_FILE_FALLBACK: process.env.GETPRO_PRODUCTION_ENV_FILE_FALLBACK,
    GETPRO_SKIP_DOTENV: process.env.GETPRO_SKIP_DOTENV,
  };

  try {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL =
      "postgres://hostuser:hostpass@db.exoelhlxvstevtwbldyc.supabase.co:5432/postgres";
    delete process.env.GETPRO_DATABASE_URL;
    delete process.env.DBURL_TEST;
    delete process.env.PLATFORM_DEPLOYMENT_CODE;
    delete process.env.DEPLOYMENT_ENV;
    process.env.SESSION_SECRET = "host-session";
    process.env.BASE_DOMAIN = "pronline.org";
    process.env.GETPRO_PRODUCTION_ENV_FILE_FALLBACK = envFile;

    resetBootstrapForTests();
    const boot = runBootstrap();

    assert.equal(boot.envPresencePreFile.DATABASE_URL, "yes");
    assert.equal(boot.envPresencePreFile.DBURL_TEST, "no");
    assert.equal(boot.envPresencePreFile.PLATFORM_DEPLOYMENT_CODE, "no");
    assert.equal(boot.earlyProductionEnvLoaded, true);
    assert.ok(boot.earlyProductionFilledKeys.includes("DBURL_TEST"));
    assert.ok(boot.earlyProductionFilledKeys.includes("PLATFORM_DEPLOYMENT_CODE"));
    assert.equal(boot.dbProvenance.kind, "host");
    assert.match(
      process.env.DATABASE_URL,
      /db\.exoelhlxvstevtwbldyc\.supabase\.co/
    );
    assert.equal(process.env.DBURL_TEST, "from-file");
    assert.equal(process.env.PLATFORM_DEPLOYMENT_CODE, "moovex-platform-testing");
    assert.equal(boot.productionFileMergeSkipped, true);
  } finally {
    resetBootstrapForTests();
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_err) {
      /* ignore */
    }
  }
});
