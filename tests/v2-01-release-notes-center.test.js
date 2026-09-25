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
} = require("../src/platform/release-notes/releaseNotesService");

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
    assert.equal(cm.qaStatus, "LOCAL QA PASS");
    const about = v.features.find((f) => f.id === "F-2.01-ABOUT-01");
    assert.equal(about.qaStatus, "HOSTED QA PASS");
  });

  it("filters by product and preserves BB vs AC tests", () => {
    const bb = filterCatalog({ version: "2.01", product: "BlessBoard" })[0];
    assert.ok(bb.qaChecklist.every((t) => t.product === "BlessBoard"));
    const ac = filterCatalog({ version: "2.01", product: "ActiveClinic" })[0];
    assert.ok(ac.qaChecklist.every((t) => t.product === "ActiveClinic"));
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
