"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  registerPatientWithGuestToken,
  linkGuestBookingToPatient,
  RESULT,
} = require("../../../src/activeclinic/services/activeClinicPatientPortalRegistrationService");
const { hashToken } = require("../../../src/activeclinic/services/activeClinicPublicBookingService");
const {
  assertPatientDoesNotRequirePortal,
} = require("../../../src/activeclinic/services/activeClinicPatientDomainService");

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const HCO_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ORG_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const HCO_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const IDENTITY = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PATIENT_B = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const BOOKING = "12121212-1212-4121-8121-121212121212";

function scopedDb(state) {
  return {
    async query(sql, params) {
      const text = String(sql).replace(/\s+/g, " ").trim();
      if (/^(insert|update|delete)\b/i.test(text)) state.writes.push(text);
      if (text.includes("FROM activeclinic.public_booking_access_tokens")) {
        const rows = state.tokens.filter((row) => row.token_hash === params[0]);
        return { rows, rowCount: rows.length };
      }
      if (text.includes("last_used_at")) return { rows: [], rowCount: 1 };
      if (text.includes("FROM activeclinic.patients")) {
        const rows = state.patients.filter(
          (row) => row.id === params[0] && row.organization_id === params[1]
        );
        return { rows, rowCount: rows.length };
      }
      if (text.includes("FROM activeclinic.public_booking_requests")) {
        state.bookingReads += 1;
        const org = params[1];
        const rows = state.bookings.filter(
          (row) => !org || row.organization_id === org
        );
        return { rows, rowCount: rows.length };
      }
      if (text.includes("UPDATE activeclinic.public_booking_requests")) {
        return { rows: [], rowCount: 0 };
      }
      throw new Error(`Unexpected SQL: ${text.slice(0, 180)}`);
    },
  };
}

function state() {
  const token = "d64-guest-token";
  return {
    token,
    writes: [],
    bookingReads: 0,
    tokens: [{
      id: "34343434-3434-4343-8343-343434343434",
      token_hash: hashToken(token),
      booking_request_id: BOOKING,
      organization_id: ORG_A,
      healthcare_organization_id: HCO_A,
      expires_at: "2999-01-01T00:00:00.000Z",
      revoked_at: null,
    }],
    bookings: [{
      id: BOOKING,
      request_number: "D64-1",
      organization_id: ORG_A,
      healthcare_organization_id: HCO_A,
      patient_id: null,
      portal_platform_identity_id: null,
      patient_link_status: "unlinked",
      facility_display_name: "Facility A",
    }],
    patients: [],
  };
}

describe("D64 patient identity isolation", () => {
  it("does not load another clinic's booking when the caller organization does not match", async () => {
    const current = state();
    const result = await registerPatientWithGuestToken(scopedDb(current), {
      guestToken: current.token,
      password: "portal-password",
      phone: "977000333",
      deploymentCode: "moovex-platform-testing",
      country: "ZM",
      organizationId: ORG_B,
      healthcareOrganizationId: HCO_B,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, RESULT.INVALID_TOKEN);
    assert.equal(current.writes.some((sql) => /insert/i.test(sql)), false);
    assert.equal(current.tokens[0].revoked_at, null);
  });

  it("rejects a missing clinic before the service reads the booking", async () => {
    const current = state();
    const result = await registerPatientWithGuestToken(scopedDb(current), {
      guestToken: current.token,
      password: "portal-password",
      phone: "977000333",
      deploymentCode: "moovex-platform-testing",
      country: "ZM",
    });
    assert.equal(result.code, RESULT.INVALID_INPUT);
    assert.equal(current.bookingReads, 1);
    assert.equal(current.tokens[0].revoked_at, null);
  });

  it("does not link a guest booking to a patient from another clinic", async () => {
    const current = state();
    const result = await linkGuestBookingToPatient(scopedDb(current), {
      guestToken: current.token,
      patientId: PATIENT_B,
      platformIdentityId: IDENTITY,
      organizationId: ORG_A,
      healthcareOrganizationId: HCO_A,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, RESULT.NO_MATCH);
    assert.equal(
      current.writes.some((sql) => sql.includes("public_booking_requests")),
      false
    );
  });

  it("keeps a staff-created patient free of a required portal", () => {
    assert.equal(assertPatientDoesNotRequirePortal({ status: "active" }).requiresPortal, false);
  });
});
