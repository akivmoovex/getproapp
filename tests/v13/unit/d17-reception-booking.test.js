"use strict";

/**
 * D17 — ActiveClinic reception, vitals, and disabled public booking.
 * Database-free. Does not check in a patient, save an observation, or open booking.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const ejs = require("ejs");

const {
  validateVitalObservationInput,
  formatVitalDisplay,
  VITAL_OBSERVATION_TYPES,
} = require("../../../src/activeclinic/services/activeClinicClinicalService");
const {
  validateServicePointInput,
  SERVICE_POINT_TYPES,
} = require("../../../src/activeclinic/services/activeClinicReceptionService");

const ROOT = path.join(__dirname, "../../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("D17 reception and booking", () => {
  it("renders a stored heart rate of 72 as 72 bpm and rejects unsupported measurements", () => {
    assert.equal(formatVitalDisplay("72.00", "bpm"), "72 bpm");
    assert.equal(formatVitalDisplay("36.60", "C"), "36.6 C");
    assert.deepEqual(
      [...VITAL_OBSERVATION_TYPES],
      [
        "blood_pressure",
        "heart_rate",
        "respiratory_rate",
        "temperature",
        "oxygen_saturation",
        "weight",
        "height",
        "bmi",
        "other",
      ]
    );
    assert.equal(VITAL_OBSERVATION_TYPES.includes("pain_score"), false);

    const saved = validateVitalObservationInput({
      observationType: "heart_rate",
      valueNumeric: "72",
      unit: "bpm",
    });
    assert.equal(saved.ok, true);
    assert.equal(saved.valueNumeric, 72);
    assert.equal(
      validateVitalObservationInput({ observationType: "heart_rate" }).ok,
      false
    );
    assert.equal(
      validateVitalObservationInput({ observationType: "pain_score", valueNumeric: 4 }).ok,
      false
    );

    const templatePath = path.join(ROOT, "views/activeclinic/app/vital-signs-entry-content.ejs");
    const html = ejs.render(
      fs.readFileSync(templatePath, "utf8"),
      {
        pageData: {
          vitals: {
            encounter: { id: "enc-1", patientDisplayName: "Ada", patientNumber: "AC-2026-000001" },
            observations: [
              {
                observationType: "heart_rate",
                valueNumeric: "72.00",
                unit: "bpm",
                observedAt: "2026-01-01T00:00:00.000Z",
                recordedByStaffDisplayName: "Nurse",
              },
            ],
            values: {},
          },
        },
        shell: { csrf: { field: "_csrf", token: "token" } },
      },
      { filename: templatePath }
    );
    assert.match(html, /72 bpm/);
    assert.equal(html.includes("72.00 bpm"), false);
    assert.match(html, /name="observation_type"/);
    assert.match(html, /value="heart_rate"/);

    const clinical = read("src/activeclinic/services/activeClinicClinicalService.js");
    assert.match(clinical, /AND e\.facility_id = \$2/);
    assert.match(clinical, /AND e\.organization_id = \$3/);
    assert.match(clinical, /AND v\.organization_id = \$2/);
    assert.match(clinical, /AND v\.facility_id = \$3/);
    assert.match(clinical, /permissionKey: PERM\.TRIAGE/);
  });

  it("keeps walk-in service points inside the signed-in facility and reads the name back", () => {
    const walkIn = read("views/activeclinic/app/reception-walk-in-content.ejs");
    assert.match(walkIn, /data-ac-form="reception-walk-in"/);
    assert.match(walkIn, /name="service_point_id"/);
    assert.match(walkIn, /<option value="<%= sp\.id %>"/);
    assert.match(walkIn, /data-ac-form="reception-service-point"/);
    assert.match(read("views/activeclinic/app/reception-queue-detail-content.ejs"), /e\.servicePoint\.displayName/);

    const routes = read("src/activeclinic/http/activeClinicReceptionRoutes.js");
    assert.match(routes, /Patient not found\./);
    assert.match(routes, /Service point is unavailable\./);
    assert.match(routes, /organizationId: auth\.organization\.id/);
    assert.match(routes, /facilityId: auth\.selectedFacility\.id/);
    assert.match(routes, /permissionKey: PERM\.CHECK_IN/);

    const ownFacility = "11111111-1111-4111-8111-111111111111";
    const otherFacility = "22222222-2222-4222-8222-222222222222";
    const saved = validateServicePointInput({
      displayName: "Walk-in desk",
      serviceType: "general",
      facilityId: ownFacility,
      organizationId: "33333333-3333-4333-8333-333333333333",
    });
    assert.equal(saved.ok, true);
    assert.equal(saved.servicePointKey, "walk-in-desk");
    assert.equal(SERVICE_POINT_TYPES.includes("general"), true);
    assert.equal(
      validateServicePointInput({
        displayName: "Other clinic desk",
        facilityId: ownFacility,
        requestedFacilityId: otherFacility,
        organizationId: "33333333-3333-4333-8333-333333333333",
      }).code,
      "access_denied"
    );
  });

  it("keeps public booking disabled and leaves coupons deferred", () => {
    const booking = read("src/activeclinic/http/activeClinicPublicBookingRoutes.js");
    const unavailable = read("views/activeclinic/tenant/clinic-unavailable.ejs");
    const migration = read("db/migrations/activeclinic/019_public_website_and_booking.sql");
    assert.match(booking, /publicBookingEnabled !== true/);
    assert.match(booking, /Online booking is not enabled for this clinic yet/);
    assert.match(booking, /does not take live bookings/);
    assert.match(booking, /Booking not available/);
    assert.match(unavailable, /pageLead/);
    assert.equal(/coupon/i.test(unavailable), false);
    assert.equal(/name="coupon"/i.test(booking), false);
    assert.match(migration, /public_booking_enabled BOOLEAN NOT NULL DEFAULT false/);
    assert.match(
      read("src/activeclinic/services/activeClinicPublicVisibilityService.js"),
      /public_booking_enabled === true/
    );
  });
});
