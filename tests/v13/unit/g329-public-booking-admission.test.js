"use strict";

/**
 * G329 public booking admission. No database connection.
 * The enabled value appears only as a test input. It is not process configuration.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  ADMISSION_ENV,
  ADMISSION_VALUE,
  publicBookingAdmissionEnabled,
  publicBookingAdmissionDecision,
} = require("../../../src/activeclinic/services/publicBookingAdmission");
const { createConsultationBookingRequest, createProcedureBookingRequest } = require(
  "../../../src/activeclinic/services/activeClinicPublicBookingService"
);
const { createAppointment } = require(
  "../../../src/activeclinic/services/activeClinicAppointmentService"
);

const ROOT = path.join(__dirname, "../../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const testing = { DEPLOYMENT_ENV: "testing", PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing" };
const enabled = { ...testing, [ADMISSION_ENV]: ADMISSION_VALUE };
const clinicOn = { publicBookingEnabled: true };
const clinicOff = { publicBookingEnabled: false };

function silentDb() {
  let queries = 0;
  return {
    queries: () => queries,
    async query() {
      queries += 1;
      return { rows: [] };
    },
  };
}

describe("G329 public booking admission", () => {
  it("stays closed when the clinic flag is true and no platform value is set", () => {
    const decision = publicBookingAdmissionDecision(testing, clinicOn);
    assert.equal(publicBookingAdmissionEnabled(testing), false);
    assert.equal(publicBookingAdmissionEnabled({ ...testing, [ADMISSION_ENV]: "1" }), false);
    assert.equal(publicBookingAdmissionEnabled({ ...testing, [ADMISSION_ENV]: "true" }), false);
    assert.equal(decision.admitted, false);
    assert.equal(decision.reason, "platform_public_booking_disabled");
  });

  it("stays closed for a false clinic flag until a future non-production value is set", () => {
    assert.equal(publicBookingAdmissionDecision(testing, clinicOff).reason, "platform_public_booking_disabled");
    assert.equal(publicBookingAdmissionDecision(enabled, clinicOff).reason, "clinic_public_booking_disabled");
    assert.equal(publicBookingAdmissionDecision(enabled, clinicOn).admitted, true);
  });

  it("stays closed for a production deployment even when the value is present", () => {
    assert.equal(publicBookingAdmissionEnabled({
      ...enabled,
      DEPLOYMENT_ENV: "production",
    }), false);
    assert.equal(publicBookingAdmissionEnabled({
      ...enabled,
      NODE_ENV: "production",
      PLATFORM_DEPLOYMENT_CODE: "moovex-platform-production",
    }), false);
    assert.equal(publicBookingAdmissionEnabled({
      ...enabled,
      NODE_ENV: "production",
    }), true);
  });

  it("refuses direct consultation and procedure creation without a database query", async () => {
    const consultationDb = silentDb();
    const procedureDb = silentDb();
    const consultation = await createConsultationBookingRequest(consultationDb, {
      organizationId: "11111111-1111-4111-8111-111111111111",
      healthcareOrganizationId: "22222222-2222-4222-8222-222222222222",
      facilityId: "33333333-3333-4333-8333-333333333333",
      patientFirstName: "No",
      patientLastName: "Write",
      patientPhone: "+260977000329",
      env: testing,
    });
    const procedure = await createProcedureBookingRequest(procedureDb, {
      organizationId: "11111111-1111-4111-8111-111111111111",
      healthcareOrganizationId: "22222222-2222-4222-8222-222222222222",
      facilityId: "33333333-3333-4333-8333-333333333333",
      procedureId: "44444444-4444-4444-8444-444444444444",
      env: { ...testing, publicBookingEnabled: true },
    });
    assert.equal(consultation.ok, false);
    assert.equal(consultation.code, "booking_not_enabled");
    assert.equal(consultation.booking, null);
    assert.equal(procedure.ok, false);
    assert.equal(procedure.code, "booking_not_enabled");
    assert.equal(consultationDb.queries(), 0);
    assert.equal(procedureDb.queries(), 0);
  });

  it("keeps the HTTP guard in front of GET and POST and leaves staff scheduling on its own service", () => {
    const routes = read("src/activeclinic/http/activeClinicPublicBookingRoutes.js");
    const admission = read("src/activeclinic/services/publicBookingAdmission.js");
    const appointments = read("src/activeclinic/http/activeClinicAppointmentRoutes.js");
    const staffService = read("src/activeclinic/services/activeClinicAppointmentService.js");
    assert.match(routes, /app\.use\("\/clinics\/:clinicKey\/book"/);
    assert.match(routes, /publicBookingAdmissionEnabled\(env\)/);
    assert.match(routes, /publicBookingEnabled !== true/);
    assert.match(routes, /validateCsrf/);
    assert.match(admission, /Online booking is not currently offered/);
    assert.doesNotMatch(appointments, /publicBookingAdmission/);
    assert.doesNotMatch(staffService, /publicBookingAdmission/);
    assert.equal(typeof createAppointment, "function");
  });
});
