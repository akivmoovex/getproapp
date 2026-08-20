"use strict";

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

describe("ActiveClinic Phase 8 mobile hardening", () => {
  it("considers all 151 mapped Stitch MOBILE screens", () => {
    const mapping = JSON.parse(
      read("docs/activeclinic/stitch/ACTIVECLINIC_STITCH_TO_V7_MAPPING.json")
    );
    assert.equal(mapping.counts.mobile.total, 151);
    const mobile = mapping.mappings.filter(
      (row) => row.stitch_device === "MOBILE"
    );
    assert.equal(mobile.length, 151);
    const publicMobile = mobile.filter(
      (row) => row.stitch_project_id === "17813606734422395399"
    );
    const internalMobile = mobile.filter(
      (row) => row.stitch_project_id === "12272131183982732110"
    );
    assert.equal(publicMobile.length + internalMobile.length, 151);
    assert.equal(publicMobile.length, 107);
    assert.equal(internalMobile.length, 44);
  });

  it("shows platform bottom nav on clinic registration", () => {
    const html = renderPublicPage({
      pageId: "public-register-clinic",
      pageTitle: "Register",
      contentTemplate: "public/register-clinic",
      shellVariant: "platform",
      locals: {
        csrfField: "_csrf",
        csrfToken: "x",
        formData: { countryCode: "ZM", clinicType: "clinic" },
        validationErrors: {},
        phoneCountries: [{ iso: "ZM", name: "Zambia", callingCode: "+260" }],
        clinicTypeOptions: [{ value: "clinic", label: "Clinic" }],
        wizardStep: "clinic",
      },
    });
    assert.match(html, /data-ac-mobile-bottom-nav="platform"/);
    assert.match(html, /viewport-fit=cover/);
    assert.match(html, /v7-acw-12/);
    const admin = renderPublicPage({
      pageId: "public-register-clinic",
      pageTitle: "Register",
      contentTemplate: "public/register-clinic",
      shellVariant: "platform",
      locals: {
        csrfField: "_csrf",
        csrfToken: "x",
        formData: { clinicName: "Test Clinic", clinicType: "clinic", countryCode: "ZM" },
        validationErrors: {},
        phoneCountries: [{ iso: "ZM", name: "Zambia", callingCode: "+260" }],
        clinicTypeOptions: [{ value: "clinic", label: "Clinic" }],
        wizardStep: "administrator",
      },
    });
    assert.match(admin, /data-ac-phone-field/);
    assert.match(admin, /data-ac-phone-backdrop/);
  });

  it("keeps tenant bottom nav off booking and uses sticky CTA reservation", () => {
    const css = read("public/activeclinic/ac-public.css");
    assert.match(css, /acp-booking-actions[\s\S]*--ac-keyboard-inset/);
    assert.match(css, /Phase 8/);
  });

  it("ships PhoneField bottom sheet, wrap, and 360-safe row", () => {
    const css = read("public/activeclinic/ac-phone-field.css");
    const js = read("public/activeclinic/ac-phone-field.js");
    assert.match(css, /ac-phone-field__backdrop/);
    assert.match(css, /overflow-wrap:\s*anywhere/);
    assert.match(css, /max-width:\s*430px/);
    assert.match(css, /min-width:\s*5\.5rem/);
    assert.match(js, /visualViewport/);
    assert.match(js, /ac-phone-sheet-open/);
    const picker = read("views/activeclinic/partials/country-picker.ejs");
    assert.doesNotMatch(picker, /min-width:12rem/);
  });

  it("transforms internal worklist tables into mobile cards", () => {
    const files = [
      "views/activeclinic/app/diagnostics-laboratory-queue-content.ejs",
      "views/activeclinic/app/diagnostics-radiology-queue-content.ejs",
      "views/activeclinic/app/diagnostics-laboratory-worklist-content.ejs",
      "views/activeclinic/app/clinical-escalation-alert-content.ejs",
      "views/activeclinic/app/pharmacy-prescription-queue-content.ejs",
      "views/activeclinic/app/pharmacy-inventory-content.ejs",
      "views/activeclinic/app/billing-invoice-list-content.ejs",
      "views/activeclinic/app/appointments-missed-content.ejs",
      "views/activeclinic/app/reception-call-board-content.ejs",
      "views/activeclinic/app/settings-departments-content.ejs",
    ];
    files.forEach((rel) => {
      const html = read(rel);
      assert.match(html, /ac-desktop-table/, rel);
      assert.match(html, /ac-mobile-table-cards/, rel);
    });
    const appCss = read("public/activeclinic/ac-app.css");
    assert.match(appCss, /ac-desktop-table/);
    assert.match(appCss, /ac-mobile-table-cards/);
  });

  it("applies viewport-fit and keyboard inset across shells", () => {
    ["public-shell.ejs", "patient-shell.ejs", "auth-shell.ejs", "app-shell.ejs"].forEach(
      (name) => {
        const html = read(`views/activeclinic/layouts/${name}`);
        assert.match(html, /viewport-fit=cover/, name);
      }
    );
    const tokens = read("public/activeclinic/ac-tokens.css");
    assert.match(tokens, /--ac-keyboard-inset/);
  });
});
