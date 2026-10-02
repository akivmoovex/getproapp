"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const fs = require("fs");
const path = require("path");

const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  STATE,
  buildFullPageState,
  buildInlineState,
} = require("../src/activeclinic/services/activeClinicStateTaxonomy");
const {
  renderAccessStatePage,
} = require("../src/activeclinic/http/renderActiveClinicAccessState");

describe("ActiveClinic Pass5 shared states + missing coverage", () => {
  it("taxonomy includes offline/loading/success presets", () => {
    const offline = buildFullPageState(STATE.OFFLINE);
    assert.equal(offline.pageId, "offline");
    assert.match(offline.heading, /offline/i);

    const loading = buildFullPageState(STATE.LOADING);
    assert.equal(loading.stateKey, STATE.LOADING);

    const inline = buildInlineState({
      stateKey: STATE.EMPTY,
      title: "No clinics",
      marker: "clinics",
      primaryAction: { href: "/clinics", label: "Browse" },
    });
    assert.equal(inline.marker, "clinics");
    assert.equal(inline.primaryAction.href, "/clinics");
  });

  it("shared loading/success partials exist", () => {
    const root = path.join(__dirname, "..", "views", "activeclinic", "partials");
    assert.ok(fs.existsSync(path.join(root, "ac-loading-state.ejs")));
    assert.ok(fs.existsSync(path.join(root, "ac-success-state.ejs")));
    assert.ok(fs.existsSync(path.join(root, "acp-shared-state.ejs")));
  });

  it("access-state offline HTML renders safely", () => {
    const html = renderAccessStatePage({
      stateKey: STATE.OFFLINE,
      pageId: "offline",
      csrfToken: "t",
      csrfField: "_csrf",
    });
    assert.match(html, /data-ac-page="offline"/);
    assert.match(html, /You appear to be offline/i);
    assert.doesNotMatch(html, /at Object\.|Error: ENOENT|stack trace/i);
  });

  it("GET /app/offline returns shared offline presentation", async () => {
    const app = createActiveClinicFoundationApp({
      getPool: () => null,
      env: {
        ...process.env,
        PLATFORM_DEPLOYMENT_CODE: "activeclinic-org-v6",
        NODE_ENV: "test",
      },
    });
    const res = await request(app).get("/app/offline").set("Host", "activeclinic.org");
    assert.equal(res.status, 503);
    assert.match(res.text, /data-ac-page="offline"/);
  });

  it("matrix has zero MISSING_IMPLEMENTATION after Pass5", () => {
    const matrix = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "..", "docs", "activeclinic", "stitch", "ACTIVECLINIC_V7_VISUAL_PARITY_MATRIX.json"),
        "utf8"
      )
    );
    const missing = matrix.screens.filter((s) => s.status === "MISSING_IMPLEMENTATION");
    assert.equal(missing.length, 0);
    assert.ok(matrix.pass5);
    assert.equal(matrix.pass5.afterMissing, 0);
    assert.ok(matrix.pass5.dispositions.FUNCTIONAL_BACKEND_GAP >= 1);
  });

  it("tenant privacy/terms/patient-information templates exist", () => {
    const tenant = path.join(__dirname, "..", "views", "activeclinic", "tenant");
    assert.ok(fs.existsSync(path.join(tenant, "privacy.ejs")));
    assert.ok(fs.existsSync(path.join(tenant, "terms.ejs")));
    assert.ok(fs.existsSync(path.join(tenant, "patient-information.ejs")));
    assert.ok(
      fs.existsSync(
        path.join(__dirname, "..", "views", "activeclinic", "patient", "data-boundaries.ejs")
      )
    );
  });

  it("clinical diagnosis and nursing-intake GET routes are registered", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "activeclinic", "http", "activeClinicClinicalRoutes.js"),
      "utf8"
    );
    assert.match(src, /app\.get\(\s*"\/app\/clinical\/encounter\/:encounterId\/diagnosis"/);
    assert.match(src, /app\.get\(\s*"\/app\/clinical\/encounter\/:encounterId\/nursing-intake"/);
  });
});
