"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "../../..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function jsFiles(dir, acc) {
  for (const name of fs.readdirSync(dir)) {
    if (name.includes(" 2.")) continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) jsFiles(full, acc);
    else if (name.endsWith(".js")) acc.push(full);
  }
  return acc;
}

describe("D34 documents and operations contract", () => {
  it("DOC-01-02 and RET-01-01 have no quarantine or legal hold on clinical documents", () => {
    const documents = read("src/activeclinic/services/activeClinicClinicalDocumentService.js");
    assert.equal(/quarantine|legal_hold|page_count|sha256/.test(documents), false);
    assert.match(documents, /bodyText: row.body_text/);
  });

  it("OPS-02-01 keeps the offline route as a page and not a writer", () => {
    const routes = read("src/activeclinic/http/activeClinicAppRoutes.js");
    const start = routes.indexOf('app.get("/app/offline"');
    const slice = routes.slice(start, start + 500);
    assert.match(slice, /status\(503\)/);
    assert.doesNotMatch(slice, /INSERT|BEGIN/);
    assert.equal(fs.existsSync(path.join(ROOT, "src/platform/ops/restoreTenant.js")), false);
  });

  it("BBF-01-02 does not let BlessBoard source read clinical patient rows", () => {
    const files = jsFiles(path.join(ROOT, "src/blessboard"), []);
    const hits = files.filter((file) => read(path.relative(ROOT, file)).includes("activeclinic.patients"));
    assert.equal(hits.length, 0);
  });

  it("JUF-01-02 and SEC-02-03 stay absent", () => {
    const demo = read("src/activeclinic/services/activeClinicDemoClinicSpec.js");
    const access = read("src/activeclinic/services/activeClinicAccessManagementService.js");
    assert.doesNotMatch(demo, /signingEnabled|patientDisplay|twoScreen/);
    assert.doesNotMatch(access, /breakGlass|break_glass/);
  });
});
