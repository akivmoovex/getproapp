"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  registerPatientWithPhoneMatch,
  registerPatientWithGuestToken,
  linkGuestBookingToPatient,
  RESULT,
} = require("../../../src/activeclinic/services/activeClinicPatientPortalRegistrationService");
const {
  verifyBookingAccessToken,
} = require("../../../src/activeclinic/services/activeClinicPublicBookingLookupService");
const { hashToken } = require("../../../src/activeclinic/services/activeClinicPublicBookingService");
const {
  assertPatientDoesNotRequirePortal,
  PORTAL_ACCESS_STATUS,
} = require("../../../src/activeclinic/services/activeClinicPatientDomainService");
const {
  normalizeActiveClinicPhone,
} = require("../../../src/activeclinic/services/normalizeActiveClinicContact");

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const HCO_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ORG_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const HCO_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const IDENTITY = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PATIENT = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const BOOKING = "12121212-1212-4121-8121-121212121212";
const TOKEN_ROW = "34343434-3434-4343-8343-343434343434";

function memoryDb(state) {
  const seen = [];
  return {
    seen,
    async query(sql, params) {
      const text = String(sql).replace(/\s+/g, " ").trim();
      seen.push(text);
      if (/^(insert|update|delete|truncate|drop|alter|create)\b/i.test(text)) {
        state.writes.push(text);
      }
      if (text.includes("FROM platform.identities")) {
        return { rows: state.identities, rowCount: state.identities.length };
      }
      if (text.includes("FROM activeclinic.patients")) {
        const sameOrg = params[1] === ORG_A && params[2] === HCO_A;
        const rows = sameOrg ? state.patients : [];
        return { rows, rowCount: rows.length };
      }
      if (text.includes("FROM activeclinic.public_booking_access_tokens")) {
        const rows = state.tokens.filter((row) => row.token_hash === params[0]);
        return { rows, rowCount: rows.length };
      }
      if (text.includes("last_used_at")) {
        return { rows: [], rowCount: 1 };
      }
      if (text.includes("FROM activeclinic.public_booking_requests")) {
        return { rows: state.bookings, rowCount: state.bookings.length };
      }
      throw new Error(`Unexpected SQL: ${text.slice(0, 160)}`);
    },
  };
}

function baseState() {
  return { identities: [], patients: [], tokens: [], bookings: [], writes: [] };
}

function phoneInput(extra) {
  return {
    phone: "977000333",
    password: "portal-password",
    firstName: "Pat",
    lastName: "Ient",
    deploymentCode: "moovex-platform-testing",
    organizationId: ORG_A,
    healthcareOrganizationId: HCO_A,
    country: "ZM",
    ...extra,
  };
}

describe("D24 patient portal security", () => {
  it("does not require a portal for a staff-created patient", () => {
    const decision = assertPatientDoesNotRequirePortal({ status: "active" });
    assert.equal(decision.requiresPortal, false);
    assert.equal(decision.portalAccessStatus, PORTAL_ACCESS_STATUS.NONE);
  });

  it("normalizes a Zambia mobile number and rejects a short number", () => {
    const ok = normalizeActiveClinicPhone("977000333", { country: "ZM" });
    assert.equal(ok.ok, true);
    assert.match(ok.normalized, /^\+260/);
    const bad = normalizeActiveClinicPhone("123", { country: "ZM" });
    assert.equal(bad.ok, false);
  });

  it("rejects weak, incomplete, and invalid-phone registration before a query", async () => {
    const db = { async query() { throw new Error("query"); } };
    const weak = await registerPatientWithPhoneMatch(db, phoneInput({ password: "short" }));
    assert.equal(weak.code, RESULT.WEAK_PASSWORD);
    const incomplete = await registerPatientWithPhoneMatch(db, { phone: "", password: "" });
    assert.equal(incomplete.code, RESULT.INVALID_INPUT);
    const phone = await registerPatientWithPhoneMatch(db, phoneInput({ phone: "123" }));
    assert.equal(phone.ok, false);
    assert.notEqual(phone.code, RESULT.OK);
  });

  it("denies an existing identity, no match, ambiguity, another tenant, a linked patient, and a name mismatch", async () => {
    const state = baseState();
    state.identities = [{ id: IDENTITY }];
    let result = await registerPatientWithPhoneMatch(memoryDb(state), phoneInput());
    assert.equal(result.code, RESULT.IDENTITY_EXISTS);

    state.identities = [];
    result = await registerPatientWithPhoneMatch(memoryDb(state), phoneInput());
    assert.equal(result.code, RESULT.NO_MATCH);

    state.patients = [
      { id: PATIENT, platform_identity_id: null, first_name: "Pat", last_name: "Ient", status: "active" },
      { id: IDENTITY, platform_identity_id: null, first_name: "Pat", last_name: "Ient", status: "active" },
    ];
    result = await registerPatientWithPhoneMatch(memoryDb(state), phoneInput());
    assert.equal(result.code, RESULT.AMBIGUOUS_MATCH);

    result = await registerPatientWithPhoneMatch(memoryDb(state), phoneInput({
      organizationId: ORG_B,
      healthcareOrganizationId: HCO_B,
    }));
    assert.equal(result.code, RESULT.NO_MATCH);

    state.patients = [
      { id: PATIENT, platform_identity_id: IDENTITY, first_name: "Pat", last_name: "Ient", status: "active" },
    ];
    result = await registerPatientWithPhoneMatch(memoryDb(state), phoneInput());
    assert.equal(result.code, RESULT.PATIENT_ALREADY_LINKED);

    state.patients = [
      { id: PATIENT, platform_identity_id: null, first_name: "Other", last_name: "Person", status: "active" },
    ];
    result = await registerPatientWithPhoneMatch(memoryDb(state), phoneInput());
    assert.equal(result.code, RESULT.NO_MATCH);
    assert.equal(result.message, "name_mismatch");
    assert.equal(state.writes.length, 0);
  });

  it("does not require a national ID to reach the phone match decision", async () => {
    const state = baseState();
    const result = await registerPatientWithPhoneMatch(memoryDb(state), phoneInput());
    assert.equal(result.code, RESULT.NO_MATCH);
    assert.equal(Object.hasOwn(phoneInput(), "nationalId"), false);
  });

  it("denies an expired, revoked, or unknown guest token before linking", async () => {
    const token = "d24-guest-token";
    const tokenHash = hashToken(token);
    const expired = baseState();
    expired.tokens = [{
      id: TOKEN_ROW,
      token_hash: tokenHash,
      booking_request_id: BOOKING,
      expires_at: "2000-01-01T00:00:00.000Z",
      revoked_at: null,
    }];
    const expiredResult = await registerPatientWithGuestToken(memoryDb(expired), {
      guestToken: token,
      password: "portal-password",
      phone: "977000333",
      deploymentCode: "moovex-platform-testing",
      country: "ZM",
    });
    assert.equal(expiredResult.code, RESULT.INVALID_TOKEN);
    assert.equal(expired.writes.length, 0);

    const direct = await verifyBookingAccessToken(memoryDb(expired), { token });
    assert.equal(direct.code, "token_expired");

    const revoked = baseState();
    revoked.tokens = [{
      id: TOKEN_ROW,
      token_hash: tokenHash,
      booking_request_id: BOOKING,
      expires_at: "2999-01-01T00:00:00.000Z",
      revoked_at: "2026-01-01T00:00:00.000Z",
    }];
    const revokedDirect = await verifyBookingAccessToken(memoryDb(revoked), { token });
    assert.equal(revokedDirect.code, "token_revoked");
    assert.equal(revoked.writes.length, 0);

    const unknown = await verifyBookingAccessToken(memoryDb(baseState()), { token });
    assert.equal(unknown.code, "token_invalid");
  });

  it("denies a guest booking owned by another organization", async () => {
    const token = "d24-guest-token";
    const state = baseState();
    state.tokens = [{
      id: TOKEN_ROW,
      token_hash: hashToken(token),
      booking_request_id: BOOKING,
      organization_id: ORG_A,
      healthcare_organization_id: HCO_A,
      expires_at: "2999-01-01T00:00:00.000Z",
      revoked_at: null,
    }];
    state.bookings = [{
      id: BOOKING,
      request_number: "D24-1",
      organization_id: ORG_A,
      healthcare_organization_id: HCO_A,
      portal_platform_identity_id: null,
      patient_link_status: "unlinked",
      facility_display_name: "Facility A",
    }];
    const result = await linkGuestBookingToPatient(memoryDb(state), {
      guestToken: token,
      platformIdentityId: IDENTITY,
      organizationId: ORG_B,
      healthcareOrganizationId: HCO_B,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, RESULT.INVALID_TOKEN);
    assert.equal(state.writes.some((sql) => sql.includes("public_booking_requests")), false);
  });

  it("does not consume a valid booking token after it has been read", async () => {
    const token = "d24-guest-token";
    const state = baseState();
    state.tokens = [{
      id: TOKEN_ROW,
      token_hash: hashToken(token),
      booking_request_id: BOOKING,
      organization_id: ORG_A,
      healthcare_organization_id: HCO_A,
      expires_at: "2999-01-01T00:00:00.000Z",
      revoked_at: null,
    }];
    state.bookings = [{
      id: BOOKING,
      request_number: "D24-1",
      facility_display_name: "Facility A",
    }];
    const db = memoryDb(state);
    const first = await verifyBookingAccessToken(db, { token });
    const second = await verifyBookingAccessToken(db, { token });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(state.tokens[0].revoked_at, null);
  });
});
