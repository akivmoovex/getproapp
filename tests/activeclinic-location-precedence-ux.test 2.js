"use strict";

/**
 * ActiveClinic location precedence UX:
 * facility address is authoritative; location.address is a supplemental directions note.
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  registerActiveClinicWebsiteTemplate,
  ACTIVECLINIC_WEBSITE_KEYS,
} = require("../src/activeclinic/website/activeClinicWebsiteTemplate");
const {
  COVERAGE,
} = require("../src/activeclinic/website/activeClinicWebsiteEditorCoverage");

const ROOT = path.join(__dirname, "..");
const VIEWS = path.join(ROOT, "views");
const LOCATION_VIEW = path.join(VIEWS, "activeclinic/tenant/location.ejs");
const HOME_VIEW = path.join(VIEWS, "activeclinic/tenant/home.ejs");
const FOOTER_VIEW = path.join(VIEWS, "activeclinic/partials/public-tenant-footer.ejs");

function render(viewPath, locals) {
  return ejs.render(fs.readFileSync(viewPath, "utf8"), locals, {
    filename: viewPath,
    root: VIEWS,
    views: [VIEWS, path.join(VIEWS, "activeclinic")],
  });
}

function clinicWithFacilityAndNote(overrides = {}) {
  return {
    clinicKey: "qa-location-clinic",
    publicName: "QA Location Clinic",
    facilities: [
      {
        facilityKey: "main",
        displayName: "Main campus",
        isPrimary: true,
        addressLine1: "100 Independence Avenue",
        addressLine2: null,
        city: "Lusaka",
        district: null,
        province: "Lusaka",
        postalCode: null,
        phoneDisplay: null,
        emailDisplay: null,
        publicHours: null,
      },
    ],
    locationEyebrow: "Visit us",
    locationPageTitle: "Location & hours",
    locationIntro: "Come see us.",
    locationAddressOverlay: "Blue gate opposite the filling station",
    locationDirectionsNote: "Blue gate opposite the filling station",
    locationHoursOverlay: null,
    ...overrides,
  };
}

describe("ActiveClinic location precedence UX", () => {
  it("keeps location.address as directions note in template schema", () => {
    registerActiveClinicWebsiteTemplate();
    assert.match(
      String(ACTIVECLINIC_WEBSITE_KEYS["location.address"].description || ""),
      /directions|landmark/i
    );
    assert.doesNotMatch(
      String(ACTIVECLINIC_WEBSITE_KEYS["location.address"].description || ""),
      /Marketing address overlay/
    );
  });

  it("coverage labels the field as Landmark / Directions", () => {
    const row = COVERAGE.find((r) => r.contentKey === "location.address");
    assert.ok(row);
    assert.match(row.section, /Landmark|Directions/i);
    assert.doesNotMatch(row.section, /Address overlay/i);
  });

  it("public location page shows facility address and directions note together", () => {
    const html = render(LOCATION_VIEW, {
      clinic: clinicWithFacilityAndNote(),
      websiteEdit: false,
    });
    assert.match(html, /data-ac-facility-address="1"/);
    assert.match(html, /100 Independence Avenue/);
    assert.match(html, /data-ac-location-note="1"/);
    assert.match(html, /Directions/);
    assert.match(html, /Blue gate opposite the filling station/);
    assert.doesNotMatch(html, /Website location overlay/);
  });

  it("does not use directions note as a facility address substitute", () => {
    const html = render(LOCATION_VIEW, {
      clinic: clinicWithFacilityAndNote({
        facilities: [
          {
            facilityKey: "main",
            displayName: "Main campus",
            isPrimary: true,
            addressLine1: null,
            city: null,
            phoneDisplay: null,
            emailDisplay: null,
            publicHours: null,
          },
        ],
      }),
      websiteEdit: false,
    });
    assert.match(html, /data-ac-facility-address-missing="1"/);
    assert.match(html, /Address not configured/);
    assert.match(html, /data-ac-location-note="1"/);
    assert.match(html, /Blue gate opposite the filling station/);
    assert.doesNotMatch(
      html,
      /data-ac-facility-address="1"[^>]*>\s*Blue gate opposite the filling station/
    );
  });

  it("editor labels the field as Landmark / Directions with authority help", () => {
    const html = render(LOCATION_VIEW, {
      clinic: clinicWithFacilityAndNote(),
      websiteEdit: true,
    });
    assert.match(html, /Landmark \/ Directions/);
    assert.match(html, /does not replace/i);
    assert.match(html, /Facility address from Operations stays authoritative/i);
    assert.match(html, /data-website-key="location\.address"/);
    assert.match(html, /data-website-label="Landmark \/ Directions"/);
  });

  it("home and footer keep facility address authoritative", () => {
    const clinic = clinicWithFacilityAndNote();
    const home = render(HOME_VIEW, { clinic, websiteEdit: false });
    assert.match(home, /data-ac-facility-address="1"/);
    assert.match(home, /100 Independence Avenue/);
    assert.match(home, /data-ac-location-note="1"/);
    assert.match(home, /Blue gate opposite the filling station/);

    const footer = render(FOOTER_VIEW, { clinic, websiteEdit: false });
    assert.match(footer, /data-ac-facility-address="1"/);
    assert.match(footer, /100 Independence Avenue/);
    assert.doesNotMatch(footer, /Blue gate opposite the filling station/);
    assert.doesNotMatch(footer, /data-website-key="location\.address"/);
  });
});
