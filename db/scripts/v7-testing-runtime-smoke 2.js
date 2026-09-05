#!/usr/bin/env node
"use strict";

/**
 * Local smoke of the unified V7 testing runtime against the testing database.
 * Does not listen on a public port. Does not print credentials.
 *
 * Usage:
 *   GETPRO_SKIP_DOTENV=1 SESSION_SECRET='…' \
 *     scripts/local/run-with-blessboard-env.sh testing \
 *     node db/scripts/v7-testing-runtime-smoke.js
 */

const request = require("supertest");
const { Pool } = require("pg");
const { requireDatabaseUrl } = require("./lib/databaseUrl");
const { buildFoundationPoolConfig } = require("./lib/foundationPool");
const { checkDatabaseIdentity } = require("./lib/databaseIdentity");
const {
  assertV7RuntimeSchemaCompatibilityOrExit,
} = require("../../src/platform/schema/v7RuntimeSchemaCompatibility");
const {
  createMoovexPlatformRuntimeApp,
  buildDefaultProductApps,
} = require("../../src/platform/http/moovexPlatformRuntimeServer");
const {
  CODE_MOOVEX_PLATFORM_TESTING,
} = require("../../src/platform/config/canonicalDeploymentProfiles");

const EXPECTED_KEY = "moovex-platform-v7";
const EXPECTED_ENV = "testing";
const AC_HOST = "activeclinic.pronline.org";
const BB_HOST = "blessboard.pronline.org";
const APEX_HOST = "pronline.org";

async function main() {
  const env = process.env;
  if (String(env.PLATFORM_DEPLOYMENT_CODE || "") !== CODE_MOOVEX_PLATFORM_TESTING) {
    // eslint-disable-next-line no-console
    console.error("[v7-testing-runtime-smoke] PLATFORM_DEPLOYMENT_CODE must be moovex-platform-testing.");
    process.exit(2);
  }
  if (!String(env.SESSION_SECRET || "").trim()) {
    env.SESSION_SECRET = "local-v7-testing-smoke-secret-not-for-hosted";
  }

  const pool = new Pool(buildFoundationPoolConfig(requireDatabaseUrl(), { max: 4 }));
  let exited = null;
  try {
    const identity = await checkDatabaseIdentity(pool, { identityKey: EXPECTED_KEY });
    if (!identity.ok || String(identity.row.environment_code || "").toLowerCase() !== EXPECTED_ENV) {
      // eslint-disable-next-line no-console
      console.error("[v7-testing-runtime-smoke] identity is not moovex-platform-v7/testing.");
      process.exit(2);
    }

    const schemaCompatibility = await assertV7RuntimeSchemaCompatibilityOrExit(pool, {
      env,
      exit: (code) => {
        exited = code;
      },
    });
    if (exited != null) {
      // eslint-disable-next-line no-console
      console.error("[v7-testing-runtime-smoke] schema compatibility refused startup.");
      process.exit(exited || 1);
    }
    if (schemaCompatibility.compatible !== true) {
      // eslint-disable-next-line no-console
      console.error("[v7-testing-runtime-smoke] schemaCompatibility is not compatible.");
      process.exit(3);
    }

    const app = createMoovexPlatformRuntimeApp({
      env,
      getPool: () => pool,
      productApps: buildDefaultProductApps({ env, getPool: () => pool }),
      boot: { schemaCompatibility },
    });

    const health = await request(app).get("/healthz").set("Host", AC_HOST);
    const acHome = await request(app).get("/").set("Host", AC_HOST);
    const bbHome = await request(app).get("/").set("Host", BB_HOST);
    const acLogin = await request(app).get("/login").set("Host", AC_HOST);
    const bbLogin = await request(app).get("/login").set("Host", BB_HOST);
    const acRegister = await request(app).get("/register-clinic").set("Host", AC_HOST);
    const bbRegister = await request(app).get("/register-church").set("Host", BB_HOST);
    const acOnBb = await request(app).get("/register-clinic").set("Host", BB_HOST);
    const bbOnAc = await request(app).get("/register-church").set("Host", AC_HOST);
    const apex = await request(app).get("/").set("Host", APEX_HOST);

    const acText = String(acHome.text || "");
    const bbText = String(bbHome.text || "");
    const report = {
      ok: true,
      identity_key: identity.row.identity_key,
      environment_code: identity.row.environment_code,
      schemaCompatibility: {
        compatible: schemaCompatibility.compatible === true,
        code: schemaCompatibility.code,
        missing: schemaCompatibility.missing || [],
      },
      health: {
        status: health.status,
        compatible: health.body && health.body.schemaCompatible,
        deploymentCode: health.body && health.body.deploymentCode,
        mode: health.body && health.body.mode,
      },
      activeclinic: {
        home: acHome.status,
        login: acLogin.status,
        register: acRegister.status,
        productHint: /activeclinic|ActiveClinic|clinic/i.test(acText),
        blessboardBleed: /data-brand="blessboard"|BlessBoard Church/i.test(acText),
      },
      blessboard: {
        home: bbHome.status,
        login: bbLogin.status,
        register: bbRegister.status,
        productHint: /blessboard|BlessBoard|church/i.test(bbText),
        activeclinicBleed: /data-brand="activeclinic"|ActiveClinic/i.test(bbText) &&
          !/Powered by/i.test(bbText),
      },
      isolation: {
        registerClinicOnBlessBoard: acOnBb.status,
        registerChurchOnActiveClinic: bbOnAc.status,
        apex: apex.status,
      },
    };

    const fail =
      health.status !== 200 ||
      health.body.schemaCompatible !== true ||
      health.body.deploymentCode !== CODE_MOOVEX_PLATFORM_TESTING ||
      acHome.status >= 500 ||
      bbHome.status >= 500 ||
      acLogin.status >= 500 ||
      bbLogin.status >= 500 ||
      acRegister.status >= 500 ||
      bbRegister.status >= 500 ||
      acHome.status === 301 ||
      bbHome.status === 301;
    report.ok = !fail;
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 4);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[v7-testing-runtime-smoke] ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
