"use strict";

/**
 * V2.04 Batch 7 — Stitch visual parity correction gates.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  H03_H06_CONTROL_AUDIT,
  H03_H06_WIRED,
  H03_H06_FUTURE,
  H03_H06_BLOCKERS,
  UNWIRED_STITCH_CONTROLS,
} = require("../src/activeclinic/website/activeClinicStitchWebsiteHub");
const {
  createPersonPresentation,
  PERSON_PRESENTATION_FIELDS,
} = require("../src/platform/website/presentation/personPresentation");
const { adaptDoctorToPersonPresentation } = require("../src/platform/website/presentation/adapters");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V2.04 AC Stitch Batch 7 visual parity", () => {
  it("public utility chrome + footer care use canonical facility/contact data hooks", () => {
    const util = read("views/activeclinic/partials/public-tenant-utility-bar.ejs");
    const header = read("views/activeclinic/partials/public-tenant-header.ejs");
    const footer = read("views/activeclinic/partials/public-tenant-footer.ejs");
    assert.match(header, /public-tenant-utility-bar/);
    assert.match(util, /data-ac-public-utility/);
    assert.match(util, /publicPhoneDisplay|headerPhone|publicHours|addressLine1/);
    assert.doesNotMatch(util, /0123 456 789|1800 999 111|Emergency: Dial 000/);
    assert.match(footer, /data-ac-footer-care/);
    assert.match(footer, /Immediate care/);
  });

  it("AC public shell loads Inter for Clinical Clarity", () => {
    const shell = read("views/activeclinic/layouts/public-shell.ejs");
    const tokens = read("public/activeclinic/ac-tokens.css");
    assert.match(shell, /fontFamily:\s*'inter'/);
    assert.match(tokens, /--acp-font:\s*Inter/);
    assert.doesNotMatch(shell, /public-sans/);
  });

  it("R04 directory toolbar + shared person directory card exist", () => {
    const doctors = read("views/activeclinic/tenant/doctors.ejs");
    const personCard = read("views/platform/website/components/person-card.ejs");
    assert.match(doctors, /data-ac-doctors-search/);
    assert.match(doctors, /data-ac-doctors-filter/);
    assert.match(doctors, /data-ac-doctors-sort/);
    assert.match(personCard, /gp-website-pc--person-directory/);
    assert.match(personCard, /data-gp-person-specialty/);
    assert.ok(PERSON_PRESENTATION_FIELDS.includes("metaLine"));
    const adapted = adaptDoctorToPersonPresentation({
      displayName: "Dr Example",
      public_title: "GP",
      subtitle: "Family Medicine",
      photoUrl: "/media/x.jpg",
      ctaUrl: "/clinics/demo/doctors/a",
      bookingUrl: "/clinics/demo/book?doctor=a",
    });
    assert.equal(adapted.ok, true);
    assert.equal(adapted.value.cta.label, "View Profile");
    assert.equal(adapted.value.secondaryCta.label, "Book Appointment");
    assert.equal(adapted.value.metaLine, null);
  });

  it("does not invent next-availability when domain omits it", () => {
    const result = createPersonPresentation({
      name: "Dr Example",
      subtitle: "Cardiology",
      mediaVariant: "portrait",
    });
    assert.equal(result.ok, true);
    assert.equal(result.value.metaLine, null);
  });

  it("E01/E02 shared editor chrome adds viewport controls without a second engine", () => {
    const chrome = read("views/platform/website-engine/editor-chrome.ejs");
    const js = read("public/platform/website-inline-edit.js");
    assert.match(chrome, /data-website-viewport="desktop"/);
    assert.match(chrome, /data-website-viewport="mobile"/);
    assert.match(js, /data-website-viewport/);
    assert.match(js, /SHARED_EDITOR_ENGINE_COUNT must remain 1/);
  });

  it("H01 hub exposes health/completeness and recent activity from truthful fields", () => {
    const hub = read("views/activeclinic/app/settings-website-content.ejs");
    assert.match(hub, /data-ac-website-health/);
    assert.match(hub, /data-ac-website-completeness/);
    assert.match(hub, /data-ac-website-activity/);
    assert.match(hub, /data-ac-stitch-future="audit_csv"/);
  });

  it("H03/H06 controls: zero blockers; wired + future classified", () => {
    assert.equal(H03_H06_BLOCKERS, 0);
    assert.ok(H03_H06_WIRED >= 4);
    assert.equal(H03_H06_FUTURE, UNWIRED_STITCH_CONTROLS);
    assert.equal(H03_H06_FUTURE, 10);
    for (const row of H03_H06_CONTROL_AUDIT) {
      assert.ok(["WIRE_EXISTING", "FUTURE_CAPABILITY", "BLOCKER"].includes(row.disposition));
    }
    const branding = read("views/activeclinic/app/website-cms-branding.ejs");
    const settings = read("views/activeclinic/app/website-cms-settings.ejs");
    assert.match(branding, /data-ac-stitch-disposition="FUTURE_CAPABILITY"/);
    assert.match(settings, /data-ac-stitch-disposition="FUTURE_CAPABILITY"/);
  });
});
