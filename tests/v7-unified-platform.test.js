"use strict";

/**
 * V7 unified multi-product platform foundation tests.
 * No production DB / Hostinger / DNS — pure registry + in-process HTTP checks.
 */

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  PRODUCT_REGISTRY,
  BUSINESS_PRODUCT_CODES,
  getProduct,
  resolveProductOrError,
} = require("../src/platform/config/productRegistry");
const {
  DEPLOYMENT_PROFILES,
  DEPLOYMENT_CODE_ALIASES,
  LEGACY_DEPLOYMENT_MIGRATION,
  CODE_COM_PRODUCTION,
  CODE_ORG_STAGING,
  CODE_BLESSBOARD_PRONLINE_TESTING,
  CODE_BLESSBOARD_ORG_LEGACY_REDIRECT,
  CODE_ACTIVECLINIC_ORG_V6,
  CODE_ACTIVECLINIC_ORG_PRODUCTION,
  CODE_ACTIVECLINIC_PRONLINE_TESTING,
  CODE_GETPROAPP_ORG_PRODUCTION,
  CODE_GETPRO_PRONLINE_TESTING,
  CODE_NETRAZ_ORG_PRODUCTION,
  CODE_NETRAZ_PRONLINE_TESTING,
  CODE_ORG_V5,
  CODE_COM_V4,
  resolveDeploymentConfiguration,
  resolveDeploymentProfileOrError,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const {
  DOMAIN_MATRIX,
  HOSTINGER_DEPLOYMENT_CODES,
  TESTING_NAMESPACE,
} = require("../src/platform/config/domainMatrix");
const {
  resolveProductBootstrapTarget,
  isRoutePackAllowed,
  getForeignProductRouteMarkers,
} = require("../src/platform/http/productBootstrap");
const {
  registerBlessBoardRoutes,
  registerActiveClinicRoutes,
  registerGetProRoutes,
  registerNgoRoutes,
} = require("../src/platform/http/productRouteBootstrap");
const {
  createLegacyDomainRedirectApp,
  buildRedirectLocation,
} = require("../src/platform/http/legacyDomainRedirectServer");
const {
  createGetProFoundationApp,
} = require("../src/getpro/http/getproFoundationServer");
const {
  createNgoFoundationApp,
} = require("../src/ngo/http/ngoFoundationServer");
const {
  PLATFORM_DEFAULT_COUNTRY,
  resolveDefaultCountry,
  resolveDeploymentDefaultCountry,
  normalizePhoneNumber,
} = require("../src/platform/services/phoneNumberService");
const {
  buildPlatformPhoneFieldLocals,
} = require("../src/platform/services/platformPhoneFieldLocals");
const fs = require("fs");
const path = require("path");

const CANONICAL_EIGHT = [
  CODE_COM_PRODUCTION,
  CODE_BLESSBOARD_PRONLINE_TESTING,
  CODE_ACTIVECLINIC_ORG_PRODUCTION,
  CODE_ACTIVECLINIC_PRONLINE_TESTING,
  CODE_GETPROAPP_ORG_PRODUCTION,
  CODE_GETPRO_PRONLINE_TESTING,
  CODE_NETRAZ_ORG_PRODUCTION,
  CODE_NETRAZ_PRONLINE_TESTING,
];

function withEnv(overrides, fn) {
  const keys = new Set([
    "PLATFORM_DEPLOYMENT_CODE",
    "DEPLOYMENT_ENV",
    "EXPECTED_DATABASE_ENV",
    "NODE_ENV",
    "SESSION_SECRET",
    "DATABASE_URL",
    ...Object.keys(overrides),
  ]);
  const prev = {};
  for (const key of keys) {
    prev[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  const restore = () => {
    for (const key of keys) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  };
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result.finally(restore);
    }
    restore();
    return result;
  } catch (err) {
    restore();
    throw err;
  }
}

describe("V7 product registry", () => {
  it("registers four business products including ngo branded Netraz", () => {
    assert.deepEqual([...BUSINESS_PRODUCT_CODES].sort(), [
      "activeclinic",
      "blessboard",
      "getpro",
      "ngo",
    ]);
    assert.equal(getProduct("blessboard").brandName, "BlessBoard");
    assert.equal(getProduct("activeclinic").brandName, "ActiveClinic");
    assert.equal(getProduct("getpro").brandName, "GetPro");
    assert.equal(getProduct("ngo").brandName, "Netraz");
    assert.equal(getProduct("ngo").productCode, "ngo");
    assert.equal(getProduct("ngo").canonicalDomainHint, "netraz.org");
    assert.equal(PRODUCT_REGISTRY.ngo.routeModule, "ngo");
    assert.equal(PRODUCT_REGISTRY.getpro.routeModule, "getpro");
    assert.equal(resolveProductOrError("netraz").ok, false);
  });
});

describe("V7 deployment resolution", () => {
  beforeEach(() => resetDeploymentProfileWarningsForTests());

  it("resolves each canonical deployment to product/environment/domain", () => {
    const expected = {
      [CODE_COM_PRODUCTION]: ["blessboard", "production", "blessboard.com"],
      [CODE_BLESSBOARD_PRONLINE_TESTING]: [
        "blessboard",
        "testing",
        "blessboard.pronline.org",
      ],
      [CODE_ACTIVECLINIC_ORG_PRODUCTION]: [
        "activeclinic",
        "production",
        "activeclinic.org",
      ],
      [CODE_ACTIVECLINIC_PRONLINE_TESTING]: [
        "activeclinic",
        "testing",
        "activeclinic.pronline.org",
      ],
      [CODE_GETPROAPP_ORG_PRODUCTION]: ["getpro", "production", "getproapp.org"],
      [CODE_GETPRO_PRONLINE_TESTING]: [
        "getpro",
        "testing",
        "getpro.pronline.org",
      ],
      [CODE_NETRAZ_ORG_PRODUCTION]: ["ngo", "production", "netraz.org"],
      [CODE_NETRAZ_PRONLINE_TESTING]: ["ngo", "testing", "netraz.pronline.org"],
    };
    for (const code of CANONICAL_EIGHT) {
      withEnv({ PLATFORM_DEPLOYMENT_CODE: code }, () => {
        const d = resolveDeploymentConfiguration();
        const [product, environment, domain] = expected[code];
        assert.equal(d.productCode, product, code);
        assert.equal(d.environment, environment, code);
        assert.equal(d.canonicalDomain, domain, code);
        assert.equal(d.authoritative, true, code);
        assert.ok(d.defaultCountry === "ZM" || d.defaultCountry, code);
      });
    }
  });

  it("unknown deployment code fails safely", () => {
    const r = resolveDeploymentProfileOrError({
      PLATFORM_DEPLOYMENT_CODE: "not-a-real-v7-profile",
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "unknown_deployment_code");
    assert.match(r.message, /Startup intentionally blocked/);
  });

  it("maps legacy aliases predictably", () => {
    assert.equal(DEPLOYMENT_CODE_ALIASES[CODE_ORG_V5], CODE_ORG_STAGING);
    assert.equal(DEPLOYMENT_CODE_ALIASES[CODE_COM_V4], CODE_COM_PRODUCTION);
    const r = resolveDeploymentProfileOrError({
      PLATFORM_DEPLOYMENT_CODE: CODE_ORG_V5,
    });
    assert.equal(r.ok, true);
    assert.equal(r.aliased, true);
    assert.equal(r.profile.deploymentCode, CODE_ORG_STAGING);
  });

  it("documents legacy migration table with evidence", () => {
    assert.ok(LEGACY_DEPLOYMENT_MIGRATION.length >= 4);
    assert.ok(
      LEGACY_DEPLOYMENT_MIGRATION.some((row) => row.legacyProfile === "activeclinic-org-v6")
    );
    assert.ok(DEPLOYMENT_PROFILES[CODE_ACTIVECLINIC_ORG_V6].profileStatus === "legacy");
    assert.equal(
      DEPLOYMENT_PROFILES[CODE_ORG_STAGING].replacementCode,
      CODE_BLESSBOARD_PRONLINE_TESTING
    );
  });

  it("Hostinger table includes preferred moovex platform codes", () => {
    assert.ok(HOSTINGER_DEPLOYMENT_CODES.length >= 8);
    assert.ok(
      HOSTINGER_DEPLOYMENT_CODES.some((row) => row.deploymentCode === "moovex-platform-testing")
    );
    assert.equal(TESTING_NAMESPACE, "pronline.org");
    assert.ok(DOMAIN_MATRIX.some((row) => row.domain === "funsong.org"));
    assert.ok(
      DOMAIN_MATRIX.some(
        (row) => row.domain === "blessboard.org" && row.type === "legacy-redirect"
      )
    );
  });
});

describe("V7 product bootstrap + route isolation", () => {
  beforeEach(() => resetDeploymentProfileWarningsForTests());

  it("bootstrap targets match products", () => {
    withEnv({ PLATFORM_DEPLOYMENT_CODE: CODE_COM_PRODUCTION }, () => {
      assert.equal(resolveProductBootstrapTarget().target, "blessboard");
    });
    withEnv({ PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_PRONLINE_TESTING }, () => {
      assert.equal(resolveProductBootstrapTarget().target, "activeclinic");
    });
    withEnv({ PLATFORM_DEPLOYMENT_CODE: CODE_GETPRO_PRONLINE_TESTING }, () => {
      assert.equal(resolveProductBootstrapTarget().target, "getpro");
    });
    withEnv({ PLATFORM_DEPLOYMENT_CODE: CODE_NETRAZ_ORG_PRODUCTION }, () => {
      assert.equal(resolveProductBootstrapTarget().target, "ngo");
    });
    withEnv({ PLATFORM_DEPLOYMENT_CODE: CODE_BLESSBOARD_ORG_LEGACY_REDIRECT }, () => {
      assert.equal(resolveProductBootstrapTarget().target, "legacy-redirect");
    });
  });

  it("route pack allowlist is product-strict", () => {
    assert.equal(isRoutePackAllowed("blessboard", "blessboard"), true);
    assert.equal(isRoutePackAllowed("blessboard", "activeclinic"), false);
    assert.equal(isRoutePackAllowed("activeclinic", "blessboard"), false);
    assert.equal(isRoutePackAllowed("getpro", "ngo"), false);
    assert.equal(isRoutePackAllowed("ngo", "platform"), true);
  });

  it("refuses foreign route registrars", () => {
    withEnv({ PLATFORM_DEPLOYMENT_CODE: CODE_COM_PRODUCTION }, () => {
      assert.throws(() => registerActiveClinicRoutes({}, { env: process.env }));
      assert.throws(() => registerGetProRoutes({}, { env: process.env }));
      assert.throws(() => registerNgoRoutes({}, { env: process.env }));
      assert.doesNotThrow(() => registerBlessBoardRoutes({}, { env: process.env }));
    });
    withEnv({ PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 }, () => {
      assert.throws(() => registerBlessBoardRoutes({}, { env: process.env }));
      assert.doesNotThrow(() => registerActiveClinicRoutes({}, { env: process.env }));
    });
  });

  it("GetPro foundation does not expose BlessBoard/AC/NGO markers", async () => {
    await withEnv({ PLATFORM_DEPLOYMENT_CODE: CODE_GETPRO_PRONLINE_TESTING }, async () => {
      const app = createGetProFoundationApp({ env: process.env });
      const health = await request(app).get("/healthz");
      assert.equal(health.status, 200);
      assert.equal(health.body.product, "getpro");
      for (const pathName of ["/hq", "/register-church", "/patients", "/__ac", "/__ngo"]) {
        const res = await request(app).get(pathName);
        assert.equal(res.status, 404, pathName);
        assert.equal(res.body.code, "product_route_isolated");
      }
    });
  });

  it("Netraz foundation isolates foreign product routes", async () => {
    await withEnv({ PLATFORM_DEPLOYMENT_CODE: CODE_NETRAZ_PRONLINE_TESTING }, async () => {
      const app = createNgoFoundationApp({ env: process.env });
      const health = await request(app).get("/healthz");
      assert.equal(health.status, 200);
      assert.equal(health.body.product, "ngo");
      assert.equal(health.body.brand, "Netraz");
      for (const pathName of ["/hq", "/patients", "/pharmacy", "/leads", "/__getpro"]) {
        const res = await request(app).get(pathName);
        assert.equal(res.status, 404, pathName);
      }
    });
  });

  it("foreign markers lists exclude own product", () => {
    const foreignBb = getForeignProductRouteMarkers("blessboard");
    assert.ok(foreignBb.includes("/patients"));
    assert.ok(!foreignBb.includes("/register-church"));
  });

  it("rejects creating GetPro app under BlessBoard deployment", () => {
    withEnv({ PLATFORM_DEPLOYMENT_CODE: CODE_COM_PRODUCTION }, () => {
      assert.throws(() => createGetProFoundationApp({ env: process.env }));
    });
  });

  it("rejects creating Netraz app under ActiveClinic deployment", () => {
    withEnv({ PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 }, () => {
      assert.throws(() => createNgoFoundationApp({ env: process.env }));
    });
  });
});

describe("V7 blessboard.org redirect support (inactive on Hostinger)", () => {
  it("builds path-preserving redirect locations", () => {
    const fakeReq = { originalUrl: "/register-church?x=1" };
    assert.equal(
      buildRedirectLocation("https://blessboard.com", fakeReq),
      "https://blessboard.com/register-church?x=1"
    );
  });

  it("legacy-redirect app returns 301 to blessboard.com", async () => {
    await withEnv(
      { PLATFORM_DEPLOYMENT_CODE: CODE_BLESSBOARD_ORG_LEGACY_REDIRECT },
      async () => {
        const app = createLegacyDomainRedirectApp({ env: process.env });
        const res = await request(app).get("/register-church");
        assert.equal(res.status, 301);
        assert.equal(res.headers.location, "https://blessboard.com/register-church");
        const health = await request(app).get("/healthz");
        assert.equal(health.status, 200);
        assert.equal(health.body.mode, "legacy-redirect");
      }
    );
  });
});

describe("V7 shared phone foundation", () => {
  beforeEach(() => resetDeploymentProfileWarningsForTests());

  it("defaults to ZM and normalizes E.164 for Zambia", () => {
    assert.equal(PLATFORM_DEFAULT_COUNTRY, "ZM");
    const parsed = normalizePhoneNumber({
      phoneCountry: "ZM",
      phoneNational: "971234567",
      validationMode: "relaxed",
    });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.e164, "+260971234567");
  });

  it("deployment default country resolves from profile", () => {
    withEnv({ PLATFORM_DEPLOYMENT_CODE: CODE_NETRAZ_PRONLINE_TESTING }, () => {
      assert.equal(resolveDeploymentDefaultCountry(), "ZM");
      assert.equal(
        resolveDefaultCountry({
          selectedCountry: "KE",
          deploymentDefaultCountry: "ZM",
        }),
        "KE"
      );
    });
  });

  it("platform PhoneField partial exists", () => {
    const partial = path.join(
      __dirname,
      "../views/platform/partials/phone-field.ejs"
    );
    assert.ok(fs.existsSync(partial));
    const locals = buildPlatformPhoneFieldLocals({});
    assert.equal(locals.defaultCountry, "ZM");
    assert.ok(Array.isArray(locals.countries));
    assert.ok(locals.countries.some((c) => c.iso === "ZM"));
  });
});

describe("V7 DB identity posture (fail-closed contract)", () => {
  it("production profile expects production DB environment", () => {
    withEnv({ PLATFORM_DEPLOYMENT_CODE: CODE_COM_PRODUCTION }, () => {
      const d = resolveDeploymentConfiguration();
      assert.equal(d.expectedDatabaseEnvironment, "production");
      assert.notEqual(d.expectedDatabaseEnvironment, "testing");
    });
  });

  it("testing profile expects testing DB environment", () => {
    withEnv({ PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_PRONLINE_TESTING }, () => {
      const d = resolveDeploymentConfiguration();
      assert.equal(d.expectedDatabaseEnvironment, "testing");
      assert.notEqual(d.environment, "production");
    });
  });
});
