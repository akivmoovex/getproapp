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
const OTHER = "99999999-9999-4999-8999-999999999999";
const BOOKING = "12121212-1212-4121-8121-121212121212";
const TOKEN_ROW = "34343434-3434-4343-8343-343434343434";

function memoryDb(state) {
  return {
    async query(sql, params) {
      const text = String(sql).replace(/\s+/g, " ").trim();
      if (/^(insert|update|delete)\b/i.test(text)) state.writes.push(text);
      if (text.includes("FROM activeclinic.public_booking_access_tokens")) {
        const rows = state.tokens.filter((row) => row.token_hash === params[0]);
        return { rows, rowCount: rows.length };
      }
      if (text.includes("last_used_at")) return { rows: [], rowCount: 1 };
      if (text.includes("FROM activeclinic.public_booking_requests")) {
        return { rows: state.bookings, rowCount: state.bookings.length };
      }
      if (text.includes("UPDATE activeclinic.public_booking_requests")) {
        return { rows: [], rowCount: state.claimRowCount };
      }
      throw new Error(`Unexpected SQL: ${text.slice(0, 180)}`);
    },
  };
}

function validState(bookingExtra) {
  const token = "d38-guest-token";
  return {
    token,
    writes: [],
    claimRowCount: 1,
    tokens: [{
      id: TOKEN_ROW,
      token_hash: hashToken(token),
      booking_request_id: BOOKING,
      organization_id: ORG_A,
      healthcare_organization_id: HCO_A,
      expires_at: "2999-01-01T00:00:00.000Z",
      revoked_at: null,
    }],
    bookings: [{
      id: BOOKING,
      request_number: "D38-1",
      organization_id: ORG_A,
      healthcare_organization_id: HCO_A,
      patient_id: null,
      portal_platform_identity_id: null,
      patient_link_status: "unlinked",
      facility_display_name: "Facility A",
      ...bookingExtra,
    }],
  };
}

describe("D38 identity and portal contracts", () => {
  it("keeps a staff-created patient free of a required portal", () => {
    const decision = assertPatientDoesNotRequirePortal({ status: "active" });
    assert.equal(decision.requiresPortal, false);
  });

  it("rejects a guest token presented on another clinic before an identity is created", async () => {
    const state = validState();
    const result = await registerPatientWithGuestToken(memoryDb(state), {
      guestToken: state.token,
      password: "portal-password",
      phone: "977000333",
      deploymentCode: "moovex-platform-testing",
      country: "ZM",
      organizationId: ORG_B,
      healthcareOrganizationId: HCO_B,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, RESULT.INVALID_TOKEN);
    assert.equal(state.writes.some((sql) => sql.includes("platform.identities")), false);
    assert.equal(state.tokens[0].revoked_at, null);
  });

  it("rejects a second activation of a booking that already has a portal owner", async () => {
    const state = validState({ portal_platform_identity_id: OTHER });
    const result = await registerPatientWithGuestToken(memoryDb(state), {
      guestToken: state.token,
      password: "portal-password",
      phone: "977000444",
      deploymentCode: "moovex-platform-testing",
      country: "ZM",
      organizationId: ORG_A,
      healthcareOrganizationId: HCO_A,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "link_conflict");
    assert.equal(state.writes.some((sql) => /insert/i.test(sql)), false);
  });

  it("returns the existing link when the same portal identity repeats the guest token", async () => {
    const state = validState({ portal_platform_identity_id: IDENTITY });
    const result = await linkGuestBookingToPatient(memoryDb(state), {
      guestToken: state.token,
      platformIdentityId: IDENTITY,
      organizationId: ORG_A,
      healthcareOrganizationId: HCO_A,
    });
    assert.equal(result.ok, true);
    assert.equal(result.code, RESULT.OK);
    assert.equal(state.writes.some((sql) => sql.includes("public_booking_requests")), false);
  });

  it("does not claim a booking when the conditional update loses the race", async () => {
    const state = validState();
    state.claimRowCount = 0;
    const result = await linkGuestBookingToPatient(memoryDb(state), {
      guestToken: state.token,
      platformIdentityId: IDENTITY,
      organizationId: ORG_A,
      healthcareOrganizationId: HCO_A,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "link_conflict");
    assert.equal(state.writes.filter((sql) => /insert/i.test(sql)).length, 0);
  });
});
