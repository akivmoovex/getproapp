"use strict";

/**
 * ActiveClinic V6 deployment foundation — product registry, profile, CSRF isolation.
 */

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");

const {
  APPLICATION_CODES,
  isValidApplicationCode,
  resolveProductOrError,
  getProduct,
} = require("../src/platform/config/productRegistry");
const {
  CODE_COM_PRODUCTION,
  CODE_ORG_STAGING,
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_COM,
  COOKIE_ORG,
  COOKIE_ACTIVECLINIC_ORG,
  CSRF_COOKIE_ORG,
  CSRF_COOKIE_ACTIVECLINIC_ORG,
  DEPLOYMENT_PROFILES,
  getDeploymentProfile,
  hasAuthoritativeDeploymentProfile,
  resolveDeploymentConfiguration,
  resolveDeploymentProfileOrError,
  validateAuthoritativeProfileCompatibility,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const { isV5FoundationMode } = require("../src/platform/config/v5FoundationMode");
const {
  CSRF_COOKIE,
  getCsrfCookieName,
  issueCsrfToken,
  setCsrfCookie,
  validateCsrf,
  CSRF_FIELD,
} = require("../src/platform/http/v5Csrf");
const { getV5SessionCookieName } = require("../src/platform/session/v5SessionCookie");
const {
  resolveRuntimeProductCode,
  registerActiveClinicRoutes,
} = require("../src/platform/http/productRouteBootstrap");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");

const PROFILE_KEYS = [
  "PLATFORM_DEPLOYMENT_CODE",
  "DEPLOYMENT_ENV",
  "EXPECTED_DATABASE_ENV",
  "BLESSBOARD_CANONICAL_DOMAIN",
  "BLESSBOARD_APEX_DOMAINS",
  "BLESSBOARD_PUBLIC_URL",
  "BLESSBOARD_ADMIN_URL",
  "CHURCH_HOST_DOMAIN",
  "SESSION_COOKIE_NAME",
  "CSRF_COOKIE_NAME",
  "BASE_DOMAIN",
  "NODE_ENV",
  "SESSION_SECRET",
  "DATABASE_URL",
];

function withEnv(overrides, fn) {
  const keys = new Set([...PROFILE_KEYS, ...Object.keys(overrides)]);
  const prev = {};
  for (const key of keys) {
    prev[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      process.env[key] = overrides[key];
    }
  }
  try {
    return fn();
  } finally {
    for (const key of keys) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

const MINIMAL_AC = Object.freeze({
  NODE_ENV: "production",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://ac-user:ac-pass@127.0.0.1:5432/activeclinic_testing",
  SESSION_SECRET: "a".repeat(40),
});

describe("productRegistry", () => {
  it("accepts activeclinic as application/product code", () => {
    assert.equal(isValidApplicationCode("activeclinic"), true);
    assert.ok(APPLICATION_CODES.includes("activeclinic"));
    const r = resolveProductOrError("activeclinic");
    assert.equal(r.ok, true);
    assert.equal(r.product.displayName, "ActiveClinic");
    assert.equal(r.product.routeModule, "activeclinic");
  });

  it("rejects unknown product codes", () => {
    const r = resolveProductOrError("not-a-product");
    assert.equal(r.ok, false);
    assert.equal(r.code, "unknown_product_code");
  });

  it("preserves blessboard product", () => {
    assert.equal(getProduct("blessboard").displayName, "BlessBoard");
  });
});

describe("activeclinic-org-v6 deployment profile", () => {
  beforeEach(() => resetDeploymentProfileWarningsForTests());

  it("resolves activeclinic product with isolated cookies", () => {
    const p = DEPLOYMENT_PROFILES[CODE_ACTIVECLINIC_ORG_V6];
    assert.equal(p.productCode, "activeclinic");
    assert.equal(p.canonicalDomain, "activeclinic.org");
    assert.equal(p.deploymentEnvironment, "testing");
    assert.equal(p.expectedDatabaseEnvironment, "testing");
    assert.equal(p.sessionCookieName, COOKIE_ACTIVECLINIC_ORG);
    assert.equal(p.csrfCookieName, CSRF_COOKIE_ACTIVECLINIC_ORG);
    assert.equal(p.jobsEnabled, false);
    assert.equal(p.runtimeMode, "v5-foundation");
  });

  it("pairs activeclinic.org with activeclinic-org-v6", () => {
    withEnv(MINIMAL_AC, () => {
      const deployment = resolveDeploymentConfiguration();
      assert.equal(deployment.code, CODE_ACTIVECLINIC_ORG_V6);
      assert.equal(deployment.productCode, "activeclinic");
      assert.equal(deployment.canonicalDomain, "activeclinic.org");
      assert.equal(deployment.sessionCookieName, "activeclinic_org_sid");
      assert.equal(deployment.csrfCookieName, "activeclinic_org_csrf");
      assert.equal(isV5FoundationMode(), true);
      assert.equal(resolveRuntimeProductCode(), "activeclinic");
      assert.equal(getV5SessionCookieName(), "activeclinic_org_sid");
      assert.equal(getCsrfCookieName(), "activeclinic_org_csrf");
    });
  });

  it("rejects incorrect domain/profile pairing", () => {
    withEnv(
      {
        ...MINIMAL_AC,
        BASE_DOMAIN: "blessboard.org",
      },
      () => {
        const r = validateAuthoritativeProfileCompatibility();
        assert.equal(r.ok, false);
        assert.equal(r.code, "base_domain_conflict");
      }
    );
  });

  it("rejects BlessBoard session cookie on ActiveClinic profile", () => {
    withEnv(
      {
        ...MINIMAL_AC,
        SESSION_COOKIE_NAME: COOKIE_ORG,
      },
      () => {
        const r = validateAuthoritativeProfileCompatibility();
        assert.equal(r.ok, false);
        assert.equal(r.code, "session_cookie_conflict");
      }
    );
  });

  it("rejects BlessBoard CSRF cookie override on ActiveClinic profile", () => {
    withEnv(
      {
        ...MINIMAL_AC,
        CSRF_COOKIE_NAME: CSRF_COOKIE_ORG,
      },
      () => {
        const r = validateAuthoritativeProfileCompatibility();
        assert.equal(r.ok, false);
        assert.equal(r.code, "csrf_cookie_conflict");
      }
    );
  });

  it("unknown deployment still fails closed", () => {
    const r = resolveDeploymentProfileOrError({
      PLATFORM_DEPLOYMENT_CODE: "not-a-real-profile",
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "unknown_deployment_code");
  });
});

describe("BlessBoard cookie isolation preserved", () => {
  beforeEach(() => resetDeploymentProfileWarningsForTests());

  it("keeps BlessBoard session and CSRF cookie names unchanged", () => {
    withEnv(
      {
        NODE_ENV: "production",
        PLATFORM_DEPLOYMENT_CODE: CODE_ORG_STAGING,
        DATABASE_URL: "postgres://u:p@127.0.0.1:5432/bb",
        SESSION_SECRET: "s".repeat(40),
      },
      () => {
        const deployment = resolveDeploymentConfiguration();
        assert.equal(deployment.productCode, "blessboard");
        assert.equal(deployment.sessionCookieName, COOKIE_ORG);
        assert.equal(deployment.csrfCookieName, CSRF_COOKIE_ORG);
        assert.equal(getCsrfCookieName(), "blessboard_org_csrf");
        assert.equal(CSRF_COOKIE, "blessboard_org_csrf");
        assert.equal(getV5SessionCookieName(), COOKIE_ORG);
      }
    );

    withEnv(
      {
        NODE_ENV: "production",
        PLATFORM_DEPLOYMENT_CODE: CODE_COM_PRODUCTION,
        DATABASE_URL: "postgres://u:p@127.0.0.1:5432/bb",
        SESSION_SECRET: "p".repeat(40),
      },
      () => {
        const deployment = resolveDeploymentConfiguration();
        assert.equal(deployment.sessionCookieName, COOKIE_COM);
        assert.equal(deployment.csrfCookieName, CSRF_COOKIE_ORG);
        assert.equal(getCsrfCookieName(), "blessboard_org_csrf");
      }
    );
  });
});

describe("ActiveClinic CSRF parameterization", () => {
  beforeEach(() => resetDeploymentProfileWarningsForTests());

  it("sets and validates ActiveClinic CSRF cookie name", async () => {
    const prev = {};
    for (const key of Object.keys(MINIMAL_AC)) {
      prev[key] = process.env[key];
      process.env[key] = MINIMAL_AC[key];
    }
    try {
      const app = express();
      app.use((req, res, next) => {
        req.cookies = {};
        const header = req.headers.cookie || "";
        for (const part of String(header).split(";")) {
          const idx = part.indexOf("=");
          if (idx <= 0) continue;
          req.cookies[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
        }
        next();
      });
      app.get("/issue", (req, res) => {
        const token = issueCsrfToken();
        setCsrfCookie(res, token, { secure: false });
        res.json({ token, cookieName: getCsrfCookieName() });
      });
      app.post("/check", express.urlencoded({ extended: false }), (req, res) => {
        const ok = validateCsrf(req, req.body && req.body[CSRF_FIELD]);
        res.status(ok ? 200 : 403).json({ ok });
      });

      const issued = await request(app).get("/issue");
      assert.equal(issued.body.cookieName, "activeclinic_org_csrf");
      const setCookie = String(issued.headers["set-cookie"] || "");
      assert.match(setCookie, /activeclinic_org_csrf=/);
      assert.doesNotMatch(setCookie, /blessboard_org_csrf=/);

      const ok = await request(app)
        .post("/check")
        .set("Cookie", `activeclinic_org_csrf=${issued.body.token}`)
        .type("form")
        .send({ [CSRF_FIELD]: issued.body.token });
      assert.equal(ok.status, 200);

      const wrong = await request(app)
        .post("/check")
        .set("Cookie", `blessboard_org_csrf=${issued.body.token}`)
        .type("form")
        .send({ [CSRF_FIELD]: issued.body.token });
      assert.equal(wrong.status, 403);
    } finally {
      for (const key of Object.keys(MINIMAL_AC)) {
        if (prev[key] === undefined) delete process.env[key];
        else process.env[key] = prev[key];
      }
    }
  });
});

describe("ActiveClinic foundation stub app", () => {
  beforeEach(() => resetDeploymentProfileWarningsForTests());

  it("serves healthz and stub home without BlessBoard routers", async () => {
    const prev = {};
    for (const key of Object.keys(MINIMAL_AC)) {
      prev[key] = process.env[key];
      process.env[key] = MINIMAL_AC[key];
    }
    try {
      const app = createActiveClinicFoundationApp({
        env: process.env,
        getPool: () => ({
          query: async () => ({ rows: [] }),
        }),
      });
      const health = await request(app).get("/healthz");
      assert.equal(health.status, 200);
      assert.equal(health.body.product, "activeclinic");
      assert.equal(health.body.csrfCookie, "activeclinic_org_csrf");
      assert.equal(health.body.sessionCookie, "activeclinic_org_sid");

      const home = await request(app).get("/");
      assert.equal(home.status, 200);
      assert.match(home.text, /ActiveClinic/);
      assert.match(home.text, /data-ac-page="foundation-stub"/);
      const setCookie = String(home.headers["set-cookie"] || "");
      assert.match(setCookie, /activeclinic_org_csrf=/);
    } finally {
      for (const key of Object.keys(MINIMAL_AC)) {
        if (prev[key] === undefined) delete process.env[key];
        else process.env[key] = prev[key];
      }
    }
  });

  it("registerActiveClinicRoutes mounts GET / only", () => {
    const app = express();
    const result = registerActiveClinicRoutes(app, {});
    assert.equal(result.registered, "activeclinic");
    assert.deepEqual(result.routes, ["GET /"]);
  });
});
