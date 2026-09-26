"use strict";

/**
 * V2.01 Release Notes Center — route, filter, auth, and catalog tests.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  CODE_MOOVEX_PLATFORM_V8_TESTING,
  CODE_MOOVEX_PLATFORM_TESTING,
  MOOVEX_PLATFORM_IDENTITY_KEY,
} = require("../src/platform/config/deploymentProfiles");
const {
  createMoovexPlatformRuntimeApp,
} = require("../src/platform/http/moovexPlatformRuntimeServer");
const {
  VERSION_ORDER,
  listVersions,
  getVersion,
  filterCatalog,
  sanitizeForAudience,
  isReleaseNotesCenterAllowed,
  canAccessInternalReleaseNotes,
  canAccessInternalReleaseNotesViaToken,
  resolveReleaseNotesInternalAccess,
} = require("../src/platform/release-notes/releaseNotesService");
const {
  tryHandleReleaseNotesRequest,
  createReleaseNotesMiddleware,
} = require("../src/platform/release-notes/attachReleaseNotesRoutes");
const express = require("express");

const V8_ENV = Object.freeze({
  NODE_ENV: "production",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_V8_TESTING,
  BASE_DOMAIN: "neuniversity.org",
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "v8-release-notes-session-secret-0123456789abcdef",
  DATABASE_IDENTITY_EXPECTED: MOOVEX_PLATFORM_IDENTITY_KEY,
  DATABASE_IDENTITY_ENV: "testing",
  RELEASE_NOTES_INTERNAL_TOKEN: "rnc-internal-test-token",
});

const PROD_ENV = Object.freeze({
  ...V8_ENV,
  DEPLOYMENT_ENV: "production",
  PLATFORM_DEPLOYMENT_CODE: "moovex-platform-production",
});

function hubApp(env) {
  return createMoovexPlatformRuntimeApp({
    env,
    productApps: {
      blessboard: (req, res) => res.status(200).type("text").send("bb"),
      activeclinic: (req, res) => res.status(200).type("text").send("ac"),
    },
  });
}

describe("release notes catalog", () => {
  it("lists all six versions", () => {
    assert.deepEqual(VERSION_ORDER, ["1.0", "1.1", "1.2", "1.3", "2.0", "2.01"]);
    assert.equal(listVersions().length, 6);
  });

  it("marks 1.1 and 1.2 documentation gaps", () => {
    assert.match(getVersion("1.1").qaVerification, /DOCUMENTATION PENDING/);
    assert.match(getVersion("1.2").qaVerification, /DOCUMENTATION PENDING/);
  });

  it("does not invent full release PASS for 2.01", () => {
    const v = getVersion("2.01");
    assert.ok(!/FULL RELEASE PASS|RELEASED TO PRODUCTION/i.test(v.qaVerification));
    const cm = v.features.find((f) => f.id === "F-2.01-CM-TOOLBAR-01");
    assert.equal(cm.qaStatus, "HOSTED QA PASS");
    const about = v.features.find((f) => f.id === "F-2.01-ABOUT-01");
    assert.equal(about.qaStatus, "HOSTED QA PASS");
    const finalQa = v.features.find((f) => f.id === "F-2.01-EDITOR-FINAL-01");
    assert.equal(finalQa.qaStatus, "HOSTED QA PASS");
    const p2 = v.features.find((f) => f.id === "F-2.01-P2-GAPS-01");
    assert.equal(p2.qaStatus, "HOSTED QA PASS");
    assert.match(v.pendingDevelopment.join(" "), /facility websites|NOT SUPPORTED/i);
  });

  it("filters by product and includes Shared with BB/AC", () => {
    const bb = filterCatalog({ version: "2.01", product: "BlessBoard" })[0];
    assert.ok(
      bb.qaChecklist.every(
        (t) => t.product === "BlessBoard" || t.product === "Shared GetPro Platform"
      )
    );
    assert.ok(bb.features.some((f) => f.id === "F-2.01-BB-INLINE-01"));
    assert.ok(bb.features.some((f) => f.id === "F-2.01-EDITOR-FINAL-01"));
    const ac = filterCatalog({ version: "2.01", product: "ActiveClinic" })[0];
    assert.ok(
      ac.qaChecklist.every(
        (t) => t.product === "ActiveClinic" || t.product === "Shared GetPro Platform"
      )
    );
    assert.ok(!ac.features.some((f) => f.id === "F-2.01-BB-INLINE-01"));
  });

  it("sanitizes public share by withholding internal evidence", () => {
    const publicView = sanitizeForAudience(getVersion("2.01"), {
      includeInternal: false,
    });
    assert.equal(publicView.audience, "public");
    assert.equal(publicView.documentationGaps.length, 0);
    assert.ok(
      publicView.qaChecklist.every((t) =>
        /withheld/i.test(t.evidence)
      )
    );
  });

  it("allows internal only with token", () => {
    assert.equal(isReleaseNotesCenterAllowed(V8_ENV), true);
    assert.equal(isReleaseNotesCenterAllowed(PROD_ENV), false);
    const req = {
      query: { internal_token: "rnc-internal-test-token" },
      get() {
        return "";
      },
    };
    assert.equal(canAccessInternalReleaseNotes(req, V8_ENV), true);
    assert.equal(
      canAccessInternalReleaseNotes({ query: {}, get() { return ""; } }, V8_ENV),
      false
    );
  });
});

describe("release notes routes on V8 hub", () => {
  it("serves overview with all versions", async () => {
    const app = hubApp(V8_ENV);
    const res = await request(app)
      .get("/release-notes")
      .set("Host", "neuniversity.org");
    assert.equal(res.status, 200);
    assert.match(res.text, /Release Notes/);
    assert.match(res.text, /Version 1\.0/);
    assert.match(res.text, /Version 2\.01/);
    assert.match(res.text, /DOCUMENTATION PENDING/);
  });

  it("serves version-specific routes", async () => {
    const app = hubApp(V8_ENV);
    for (const version of VERSION_ORDER) {
      const res = await request(app)
        .get(`/release-notes/${version}`)
        .set("Host", "neuniversity.org");
      assert.equal(res.status, 200, version);
      assert.match(res.text, new RegExp(`Version ${version}`));
    }
  });

  it("serves bugs, qa, share panels", async () => {
    const app = hubApp(V8_ENV);
    for (const panel of ["bugs", "qa", "share"]) {
      const res = await request(app)
        .get(`/release-notes/2.01/${panel}`)
        .set("Host", "neuniversity.org");
      assert.equal(res.status, 200, panel);
    }
    assert.match(
      (
        await request(app)
          .get("/release-notes/2.01/share")
          .set("Host", "neuniversity.org")
      ).text,
      /sanitized summary/i
    );
  });

  it("applies product filter on version page", async () => {
    const app = hubApp(V8_ENV);
    const res = await request(app)
      .get("/release-notes/2.01")
      .query({ product: "Infrastructure" })
      .set("Host", "neuniversity.org");
    assert.equal(res.status, 200);
    assert.match(res.text, /Hostinger/);
  });

  it("serves CSS asset", async () => {
    const app = hubApp(V8_ENV);
    const res = await request(app)
      .get("/platform/release-notes-center.css")
      .set("Host", "neuniversity.org");
    assert.equal(res.status, 200);
    assert.match(res.text, /rnc-body/);
  });

  it("refuses production deployment env", async () => {
    assert.equal(isReleaseNotesCenterAllowed(PROD_ENV), false);
  });

  it("returns 404 JSON for unknown hub paths still", async () => {
    const app = hubApp(V8_ENV);
    const res = await request(app)
      .get("/not-a-real-hub-path")
      .set("Host", "neuniversity.org");
    assert.equal(res.status, 404);
    assert.equal(res.body.code, "platform_qa_hub_only");
  });

  it("hub home links to Release Notes Center", async () => {
    const app = hubApp(V8_ENV);
    const res = await request(app).get("/").set("Host", "neuniversity.org");
    assert.equal(res.status, 200);
    assert.match(res.text, /href="\/release-notes"/);
  });

  it("unknown version returns not found page", async () => {
    const app = hubApp(V8_ENV);
    const res = await request(app)
      .get("/release-notes/9.9")
      .set("Host", "neuniversity.org");
    assert.equal(res.status, 404);
    assert.match(res.text, /Unknown release version/);
  });
});

describe("release notes V7 hub still available in testing", () => {
  it("serves release notes on V7 testing hub host", async () => {
    const env = {
      NODE_ENV: "production",
      DEPLOYMENT_ENV: "testing",
      PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
      BASE_DOMAIN: "pronline.org",
      DATABASE_URL: "postgres://unused/local",
      SESSION_SECRET: "v7-release-notes-session-secret-0123456789abcdef",
      DATABASE_IDENTITY_EXPECTED: MOOVEX_PLATFORM_IDENTITY_KEY,
      DATABASE_IDENTITY_ENV: "testing",
    };
    const app = hubApp(env);
    const res = await request(app)
      .get("/release-notes/1.3")
      .set("Host", "pronline.org");
    assert.equal(res.status, 200);
    assert.match(res.text, /Version 1\.3/);
  });
});

describe("release notes platform_admin session access", () => {
  it("token path remains supported (header)", async () => {
    const req = {
      query: {},
      get(name) {
        return String(name).toLowerCase() === "x-release-notes-internal-token"
          ? "rnc-internal-test-token"
          : "";
      },
    };
    assert.equal(canAccessInternalReleaseNotesViaToken(req, V8_ENV), true);
    const access = await resolveReleaseNotesInternalAccess(req, V8_ENV, {});
    assert.equal(access.allowed, true);
    assert.equal(access.via, "token");
  });

  it("platformAdminAuthorized unlocks internal without token", async () => {
    const envNoToken = { ...V8_ENV, RELEASE_NOTES_INTERNAL_TOKEN: "" };
    const req = { query: {}, get() { return ""; }, v5Session: null };
    const denied = await resolveReleaseNotesInternalAccess(req, envNoToken, {});
    assert.equal(denied.allowed, false);
    const allowed = await resolveReleaseNotesInternalAccess(req, envNoToken, {
      platformAdminAuthorized: true,
    });
    assert.equal(allowed.allowed, true);
    assert.equal(allowed.via, "platform_admin_session");
  });

  it("ordinary tenant session without platform_admin stays public", async () => {
    const envNoToken = { ...V8_ENV, RELEASE_NOTES_INTERNAL_TOKEN: "" };
    const req = {
      query: {},
      get() { return ""; },
      v5Session: {
        authenticated: true,
        session: { userId: "00000000-0000-4000-8000-000000000099" },
      },
    };
    const access = await resolveReleaseNotesInternalAccess(req, envNoToken, {
      getPool: () => ({
        async query(sql) {
          // Simulate active user who is church_hq_admin only (no platform_admin).
          if (/FROM blessboard\.users/i.test(sql) || /status/i.test(sql)) {
            return { rows: [{ id: req.v5Session.session.userId, status: "active" }] };
          }
          return { rows: [{ role_key: "church_hq_admin", roleKey: "church_hq_admin" }] };
        },
      }),
    });
    // Repository maps columns — if lookup fails closed, also public. Either way not internal via tenant role.
    assert.equal(access.allowed, false);
  });

  it("HTTP handler exposes Evidence only when platformAdminAuthorized", async () => {
    const envNoToken = {
      ...V8_ENV,
      RELEASE_NOTES_INTERNAL_TOKEN: "",
    };
    const app = express();
    app.use(async (req, res, next) => {
      try {
        const handled = await tryHandleReleaseNotesRequest(req, res, {
          env: envNoToken,
          platformAdminAuthorized: req.get("x-test-platform-admin") === "1",
        });
        if (!handled) res.status(404).end();
      } catch (err) {
        next(err);
      }
    });

    const publicRes = await request(app).get("/release-notes/2.01/qa");
    assert.equal(publicRes.status, 200);
    assert.equal(publicRes.text.includes("<th>Evidence</th>"), false);
    assert.match(publicRes.text, /data-audience="public"/);

    const adminRes = await request(app)
      .get("/release-notes/2.01/qa")
      .set("X-Test-Platform-Admin", "1");
    assert.equal(adminRes.status, 200);
    assert.match(adminRes.text, /<th>Evidence<\/th>/);
    assert.match(adminRes.text, /data-audience="internal"/);
    assert.match(adminRes.text, /docs\/qa\/V2_01_/);
  });

  it("apex middleware skips non-apex hosts", async () => {
    const app = express();
    app.use(
      createReleaseNotesMiddleware({
        env: V8_ENV,
        isApexHost: () => false,
        getPool: () => null,
      })
    );
    app.get("/release-notes", (req, res) => res.status(299).send("fallback"));
    const res = await request(app).get("/release-notes");
    assert.equal(res.status, 299);
  });

  it("share panel stays sanitized even when platform admin authorized", async () => {
    const app = express();
    app.use(async (req, res) => {
      await tryHandleReleaseNotesRequest(req, res, {
        env: V8_ENV,
        platformAdminAuthorized: true,
      });
    });
    const res = await request(app).get("/release-notes/2.01/share");
    assert.equal(res.status, 200);
    assert.match(res.text, /sanitized summary/i);
    assert.match(res.text, /data-audience="public"/);
  });
});

describe("release notes product hosts", () => {
  it("defaults BlessBoard product context from host", async () => {
    const app = express();
    app.use(async (req, res) => {
      await tryHandleReleaseNotesRequest(req, res, { env: V8_ENV });
    });
    const res = await request(app)
      .get("/release-notes/2.01")
      .set("Host", "blessboard.neuniversity.org");
    assert.equal(res.status, 200);
    assert.match(res.text, /BlessBoard Release Notes/);
    assert.match(res.text, /Shared website editor/);
    assert.match(res.text, /F-2\.01-BB-INLINE-01/);
    assert.doesNotMatch(res.text, /F-2\.01-INFRA-PKGA-01/);
  });

  it("defaults ActiveClinic product context from host", async () => {
    const app = express();
    app.use(async (req, res) => {
      await tryHandleReleaseNotesRequest(req, res, { env: V8_ENV });
    });
    const res = await request(app)
      .get("/release-notes")
      .set("Host", "activeclinic.neuniversity.org");
    assert.equal(res.status, 200);
    assert.match(res.text, /ActiveClinic Release Notes/);
  });

  it("all_products=1 clears host default", async () => {
    const app = express();
    app.use(async (req, res) => {
      await tryHandleReleaseNotesRequest(req, res, { env: V8_ENV });
    });
    const res = await request(app)
      .get("/release-notes/2.01")
      .query({ all_products: "1" })
      .set("Host", "blessboard.neuniversity.org");
    assert.equal(res.status, 200);
    assert.match(res.text, /Hostinger/);
  });

  it("ActiveClinic foundation serves /release-notes", async () => {
    const {
      createActiveClinicFoundationApp,
    } = require("../src/activeclinic/http/activeClinicFoundationServer");
    const app = createActiveClinicFoundationApp({
      env: V8_ENV,
      getPool: () => null,
      allowPlatformRuntimeChild: true,
    });
    const res = await request(app)
      .get("/release-notes")
      .set("Host", "activeclinic.neuniversity.org");
    assert.equal(res.status, 200);
    assert.match(res.text, /Release Notes/);
  });
});
