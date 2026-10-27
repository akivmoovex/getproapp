"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { getPgPool } = require("../src/db/pg");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");

const configured =
  process.env.V211_QA137_RUN_REAL === "1" &&
  /127\.0\.0\.1:5432\/getpro_v211_qa_disposable_03(?:\?|$)/.test(process.env.DATABASE_URL || "") &&
  /127\.0\.0\.1:5432\/getpro_v211_qa_disposable_03(?:\?|$)/.test(process.env.TEST_DATABASE_URL || "");

test("BB-10 HTTP registration form is served in the tenant context", { skip: !configured }, async () => {
  const app = createV5FoundationApp({
    getPool: () => getPgPool(),
    env: {
      NODE_ENV: "test",
      DEPLOYMENT_ENV: "testing",
      DEPLOYMENT_ENV: "testing",
      PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
      BASE_DOMAIN: "blessboard.org",
      BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    },
    log: () => {},
  });
  const response = await request(app)
    .get("/register")
    .set("Host", "qa75-91225-1792873862949.blessboard.org")
    .redirects(0);
  assert.ok([200, 302, 303].includes(response.status), `unexpected registration status ${response.status}`);
});

test("BB-10 HTTP negative CSRF cases", { skip: !configured }, async () => {
  const pool = getPgPool();
  const session = await createV5Session(pool, {
    deploymentCode: "blessboard-org-staging",
    userId: "c5f6be25-565b-49a4-8ec4-671e8a478b3f",
    organizationId: "1046c4ab-54ee-4d3b-980a-0a7f1e227468",
    churchId: "ffc2fb59-b7cd-4cb7-8dd7-69663f7fbb30",
  });
  assert.equal(session.ok, true);
  const app = createV5FoundationApp({ getPool: () => pool, env: { NODE_ENV: "test", DEPLOYMENT_ENV: "testing", PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging", BASE_DOMAIN: "blessboard.org", BLESSBOARD_TENANT_ROUTING_MODE: "authoritative" }, log: () => {} });
  const response = await request(app)
    .post("/register")
    .set("Host", "qa75-91225-1792873862949.blessboard.org")
    .set("Cookie", `${DEFAULT_V5_COOKIE}=${session.rawToken}`)
    .type("form")
    .send({ _csrf: "invalid", full_name: "QA143 Invalid", email: "qa143-invalid@example.test" });
  assert.ok([400, 403].includes(response.status), `unexpected CSRF status ${response.status}`);
});
