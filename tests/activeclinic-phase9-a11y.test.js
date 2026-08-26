"use strict";

/**
 * ActiveClinic Phase 9 accessibility structure contracts (WCAG 2.2 AA).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  renderPublicPage,
} = require("../src/activeclinic/http/renderActiveClinicPublic");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("ActiveClinic Phase 9 accessibility", () => {
  it("shells expose skip links, main landmarks, lang, and a11y script", () => {
    const shells = [
      ["views/activeclinic/layouts/public-shell.ejs", "ac-public-skip", 'id="ac-public-main"'],
      ["views/activeclinic/layouts/patient-shell.ejs", "ac-patient-skip", 'id="ac-patient-main"'],
      ["views/activeclinic/layouts/auth-shell.ejs", "ac-auth-skip", 'href="#ac-auth-main"'],
      ["views/activeclinic/layouts/app-shell.ejs", "ac-skip", 'id="ac-main"'],
    ];
    shells.forEach(function (row) {
      const html = read(row[0]);
      assert.match(html, /lang="en"/, row[0]);
      assert.match(html, new RegExp(row[1]), row[0]);
      assert.match(html, new RegExp(row[2]), row[0]);
      assert.match(html, /ac-a11y\.js/, row[0]);
    });
    assert.match(read("src/activeclinic/http/renderActiveClinicPublic.js"), /v7-wave1-p1/);
    assert.match(read("src/activeclinic/http/renderActiveClinicPatient.js"), /v7-wave1-pt1/);
    assert.match(read("src/activeclinic/http/renderActiveClinicAuth.js"), /v7-v1-login-1/);
    assert.match(
      read("src/activeclinic/services/buildActiveClinicShellViewModel.js"),
      /v7-wave2a-1/
    );
  });

  it("PhoneField associates labels, required, errors, and uses a dialog picker", () => {
    const field = read("views/activeclinic/partials/phone-field.ejs");
    assert.match(field, /aria-required="true"/);
    assert.match(field, /aria-describedby=/);
    assert.match(field, /role="dialog"/);
    assert.match(field, /role="listbox"/);
    assert.match(field, /aria-haspopup="dialog"/);
    assert.match(field, /span class="ac-sr-only"> required/);
    const js = read("public/activeclinic/ac-phone-field.js");
    assert.match(js, /trapOpenPopover|trapTab/);
    const css = read("public/activeclinic/ac-phone-field.css");
    assert.match(css, /:focus-visible/);
    assert.doesNotMatch(css, /outline:\s*none/);
  });

  it("public registration associates field errors and loading", () => {
    const html = renderPublicPage({
      pageId: "public-register-clinic",
      pageTitle: "Register",
      contentTemplate: "public/register-clinic",
      shellVariant: "platform",
      locals: {
        csrfToken: "x",
        formData: { countryCode: "ZM", clinicType: "clinic" },
        formState: "validation_error",
        validationErrors: { clinicName: "Enter a clinic name" },
        phoneCountries: [{ iso: "ZM", name: "Zambia", callingCode: "+260" }],
        clinicTypeOptions: [{ value: "clinic", label: "Clinic" }],
        wizardStep: "clinic",
      },
    });
    assert.match(html, /aria-describedby="clinicName-error"/);
    assert.match(html, /id="clinicName-error"/);
    assert.match(html, /data-ac-loading="1"/);
    assert.match(html, /aria-current="step"/);
    assert.match(html, /data-ac-public-chrome="mf-register"/);
    const admin = renderPublicPage({
      pageId: "public-register-clinic",
      pageTitle: "Register",
      contentTemplate: "public/register-clinic",
      shellVariant: "platform",
      locals: {
        csrfToken: "x",
        formData: { clinicName: "Test Clinic", clinicType: "clinic", countryCode: "ZM" },
        formState: "form",
        validationErrors: {},
        phoneCountries: [{ iso: "ZM", name: "Zambia", callingCode: "+260" }],
        clinicTypeOptions: [{ value: "clinic", label: "Clinic" }],
        wizardStep: "administrator",
      },
    });
    assert.match(admin, /role="dialog"/);
  });

  it("booking progress is announced on mobile and marks the current step", () => {
    const progress = read("views/activeclinic/partials/booking-wizard-progress.ejs");
    assert.doesNotMatch(progress, /ac-booking-progress__compact" aria-hidden="true"/);
    assert.match(progress, /aria-current="step"/);
    const consult = read("views/activeclinic/booking/consultation-patient.ejs");
    assert.match(consult, /aria-describedby="patientFirstName-error"/);
    assert.match(consult, /data-ac-loading="1"/);
  });

  it("drawers and a11y helper trap focus and scope table headers", () => {
    const a11y = read("public/activeclinic/ac-a11y.js");
    assert.match(a11y, /trapTab/);
    assert.match(a11y, /scope", "col"/);
    assert.match(a11y, /form\[data-ac-loading\]/);
    const pub = read("public/activeclinic/ac-public.js");
    assert.match(pub, /trapTab/);
    const shell = read("public/activeclinic/ac-shell-nav.js");
    assert.match(shell, /Tab/);
  });

  it("status and muted text meet AA contrast intent", () => {
    const tokens = read("public/activeclinic/ac-tokens.css");
    assert.match(tokens, /--acp-muted:\s*#3e494a/);
    const app = read("public/activeclinic/ac-app.css");
    assert.match(app, /--ac-muted:\s*#434653/);
    assert.match(app, /input:focus-visible/);
    assert.match(app, /Status uses visible text plus colour/);
  });

  it("diagnostic forms do not use orphan labels for static text", () => {
    assert.doesNotMatch(
      read("views/activeclinic/app/diagnostics-specimen-collection-content.ejs"),
      /<label>Request/
    );
    assert.match(
      read("views/activeclinic/app/diagnostics-enter-laboratory-result-content.ejs"),
      /label for="components"/
    );
  });

  it("tenant header marks the current clinic page and pharmacy/billing forms announce loading", () => {
    const header = read("views/activeclinic/partials/public-tenant-header.ejs");
    assert.match(header, /tenantCurrent/);
    assert.match(header, /tenantCurrent\(item\.key\)/);
    assert.match(read("views/activeclinic/layouts/auth-shell.ejs"), /Skip to content/);
    assert.match(
      read("views/activeclinic/app/pharmacy-dispense-content.ejs"),
      /data-ac-loading="1"/
    );
    assert.match(
      read("views/activeclinic/app/billing-arrangement-form-content.ejs"),
      /data-ac-loading="1"/
    );
    assert.match(
      read("views/activeclinic/app/appointment-form-content.ejs"),
      /data-ac-loading="1"/
    );
    assert.match(read("views/activeclinic/patient/security.ejs"), /aria-required="true"/);
  });
});
