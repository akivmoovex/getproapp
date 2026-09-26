"use strict";

/**
 * PC09 — platform ops UI primitives architecture guard.
 * Product themes stay separate; gp-ops is structural only.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const GP_OPS_PARTIALS = [
  "gp-ops-table.ejs",
  "gp-ops-filter-bar.ejs",
  "gp-ops-pagination.ejs",
  "gp-ops-status-badge.ejs",
  "gp-ops-status-tabs.ejs",
  "gp-ops-empty-state.ejs",
  "gp-ops-card.ejs",
  "gp-ops-timeline.ejs",
];

describe("PC09 platform ops UI primitives", () => {
  it("ships gp-ops CSS, partials, and fetch helper", () => {
    assert.ok(fs.existsSync(path.join(ROOT, "public/platform/gp-ops-shared.css")));
    assert.ok(fs.existsSync(path.join(ROOT, "public/platform/gp-ops-fetch.js")));
    for (const name of GP_OPS_PARTIALS) {
      assert.ok(
        fs.existsSync(path.join(ROOT, "views/platform/partials", name)),
        `missing partial ${name}`
      );
    }
    const fetchJs = read("public/platform/gp-ops-fetch.js");
    assert.match(fetchJs, /GpOpsFetch/);
    assert.match(fetchJs, /csrfToken/);
    assert.match(fetchJs, /fetchJson/);
    assert.doesNotMatch(fetchJs, /#6C5CE7|Sacred Modernity|ac-app-body/i);
  });

  it("gp-ops defaults stay product-neutral (no BB violet / baked AC Stitch)", () => {
    const css = read("public/platform/gp-ops-shared.css");
    assert.match(css, /Structural only/);
    assert.match(css, /--gp-ops-primary:\s*#2563eb/);
    assert.doesNotMatch(css, /--gp-ops-primary:\s*#6C5CE7/i);
    assert.doesNotMatch(css, /Hanken Grotesk/);
    assert.doesNotMatch(css, /font-family:\s*Inter/);
    assert.match(css, /--gp-ops-radius:\s*0\.5rem/);
  });

  it("AC staff shell loads gp-ops then AC tokens; BB shells do not mount gp-ops CSS", () => {
    const acShell = read("views/activeclinic/layouts/app-shell.ejs");
    const gpIdx = acShell.indexOf("gp-ops-shared.css");
    const tokenIdx = acShell.indexOf("ac-app-tokens.css");
    assert.ok(gpIdx > 0 && tokenIdx > gpIdx);
    assert.match(acShell, /gp-ops-fetch\.js/);
    assert.match(acShell, /website-media-field\.js/);

    const bbHq = read("views/blessboard/v5/partials/hq-shell-start.ejs");
    const bbPublic = read("views/blessboard/v5/partials/tenant-public-shell-start.ejs");
    assert.doesNotMatch(bbHq, /gp-ops-shared\.css/);
    assert.doesNotMatch(bbPublic, /gp-ops-shared\.css/);
    assert.doesNotMatch(bbHq, /ac-app-tokens\.css/);
    assert.doesNotMatch(bbPublic, /ac-app\.css/);
  });

  it("shared media field adopts GpOpsFetch with local CSRF fallback", () => {
    const js = read("public/platform/website-media-field.js");
    assert.match(js, /GpOpsFetch/);
    assert.match(js, /appendCsrf|csrfHeaders/);
    assert.match(js, /meta\[name="csrf-token"\]/);
  });

  it("on-touch screens use gp-ops filter/table/empty without removing product tokens", () => {
    const rooms = read("views/activeclinic/app/rooms-list-content.ejs");
    assert.match(rooms, /gp-ops-filter-bar/);
    assert.match(rooms, /gp-ops-table/);
    assert.match(rooms, /ac-badge--room-/);
    assert.match(rooms, /data-ac-stitch="ACN27"/);

    const lowStock = read("views/activeclinic/app/pharmacy-low-stock-content.ejs");
    assert.match(lowStock, /gp-ops-empty-state/);
    assert.match(lowStock, /gp-ops-table/);
    assert.match(lowStock, /ac-table/);

    const pharmacy = read("views/activeclinic/app/pharmacy-prescription-queue-content.ejs");
    assert.match(pharmacy, /gp-ops-filter-bar/);
    assert.match(pharmacy, /gp-ops-status-badge/);
  });

  it("Stitch-sensitive patient/appointment filters retain product grid chrome", () => {
    const patients = read("views/activeclinic/app/patients-list-content.ejs");
    const appointments = read("views/activeclinic/app/appointments-list-content.ejs");
    assert.match(patients, /ac-filter-bar__grid--patients/);
    assert.match(appointments, /ac-filter-bar__grid--appointments/);
    assert.match(patients, /gp-ops-status-badge/);
    assert.match(appointments, /gp-ops-status-badge/);
  });

  it("BB design-system paths remain product-owned", () => {
    assert.ok(fs.existsSync(path.join(ROOT, "public/blessboard/v5/design-system.css")));
    const ds = read("public/blessboard/v5/design-system.css");
    assert.match(ds, /bb-ds-/);
    assert.doesNotMatch(ds, /\.gp-ops-table\s*\{/);
  });
});
