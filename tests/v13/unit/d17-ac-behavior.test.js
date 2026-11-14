"use strict";

/**
 * D17 ActiveClinic behavior. In-memory query doubles are not live AC-05 evidence
 * and are not database persistence.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  assignStaffRole,
  RESULT,
  RECEPTIONIST,
  CASHIER,
  ORGANIZATION_ADMIN,
} = require("../../../src/activeclinic/services/activeClinicAuthorizationService");
const {
  createAppointment,
  cancelAppointment,
  RESULT: APPOINTMENT,
} = require("../../../src/activeclinic/services/activeClinicAppointmentService");
const { getOtpWorkflow } = require("../../../src/platform/otp/otpWorkflows");

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "33333333-3333-4333-8333-333333333333";
const STAFF = "22222222-2222-4222-8222-222222222222";
const ROLE = "44444444-4444-4444-8444-444444444444";
const HCO = "55555555-5555-4555-8555-555555555555";

function staffDb(options) {
  const queries = [];
  return {
    queries,
    async query(sql, params) {
      const text = String(sql);
      queries.push(text);
      if (text.includes("activeclinic.staff_members")) {
        if (options.staff && params[1] === options.staff.organization_id) {
          return { rows: [options.staff] };
        }
        return { rows: [] };
      }
      if (text.includes("blessboard.roles")) {
        return { rows: options.role ? [options.role] : [] };
      }
      if (text.includes("INSERT INTO activeclinic.staff_role_assignments")) {
        return { rows: [{ id: ROLE, organization_id: params[0], staff_member_id: params[2], scope_type: params[4], status: "active" }] };
      }
      return { rows: [] };
    },
  };
}

const staffRow = {
  id: STAFF,
  organization_id: ORG,
  healthcare_organization_id: HCO,
  first_name: "Ada",
  last_name: "Nurse",
  display_name: "Ada Nurse",
  phone_normalized: "+260977123456",
  phone_display: "0977123456",
  employment_type: "full_time",
  status: "active",
};

describe("D17 ActiveClinic behavior", () => {
  it("denies a staff role change for the wrong clinic, a cashier organisation scope, and a missing role", async () => {
    const missing = await assignStaffRole(staffDb({}), {
      organizationId: OTHER,
      staffMemberId: STAFF,
      roleKey: RECEPTIONIST,
      scopeType: "facility",
      facilityId: "77777777-7777-4777-8777-777777777777",
    });
    assert.equal(missing.code, RESULT.STAFF_NOT_FOUND);

    const cashier = staffDb({
      staff: staffRow,
      role: { id: ROLE, role_key: CASHIER, role_category: "activeclinic", role_display_name: "Cashier" },
    });
    const orgScope = await assignStaffRole(cashier, {
      organizationId: ORG,
      staffMemberId: STAFF,
      roleKey: CASHIER,
      scopeType: "organisation",
    });
    assert.equal(orgScope.code, RESULT.INVALID_SCOPE);
    assert.equal(cashier.queries.some((sql) => sql.includes("INSERT INTO activeclinic.staff_role_assignments")), false);

    const receptionist = staffDb({
      staff: staffRow,
      role: { id: ROLE, role_key: RECEPTIONIST, role_category: "activeclinic" },
    });
    const noFacility = await assignStaffRole(receptionist, {
      organizationId: ORG,
      staffMemberId: STAFF,
      roleKey: RECEPTIONIST,
      scopeType: "facility",
      facilityId: "",
    });
    assert.equal(noFacility.code, RESULT.INVALID_SCOPE);

    const adminAtFacility = staffDb({
      staff: staffRow,
      role: { id: ROLE, role_key: ORGANIZATION_ADMIN, role_category: "activeclinic" },
    });
    const escalated = await assignStaffRole(adminAtFacility, {
      organizationId: ORG,
      staffMemberId: STAFF,
      roleKey: ORGANIZATION_ADMIN,
      scopeType: "facility",
      facilityId: "77777777-7777-4777-8777-777777777777",
    });
    assert.equal(escalated.code, RESULT.INVALID_SCOPE);

    const unknown = staffDb({ staff: staffRow, role: null });
    const badRole = await assignStaffRole(unknown, {
      organizationId: ORG,
      staffMemberId: STAFF,
      roleKey: "platform_administrator",
      scopeType: "organisation",
    });
    assert.equal(badRole.code, RESULT.INVALID_ROLE);
  });

  it("rejects an appointment before persistence when the request or the clock is invalid", async () => {
    const actor = { staffMemberId: STAFF };
    const missing = await createAppointment({
      async query() {
        throw new Error("query double must not run");
      },
    }, {
      organizationId: "not-a-uuid",
      healthcareOrganizationId: HCO,
      facilityId: "77777777-7777-4777-8777-777777777777",
      patientId: "88888888-8888-4888-8888-888888888888",
      serviceTypeId: "99999999-9999-4999-8999-999999999999",
      actor,
      startsAt: "2026-08-01T09:00:00.000Z",
    });
    assert.equal(missing.code, APPOINTMENT.INVALID_INPUT);

    const cancelled = await cancelAppointment({
      async query() {
        return { rows: [] };
      },
    }, {
      organizationId: ORG,
      appointmentId: "88888888-8888-4888-8888-888888888888",
      actor,
    });
    assert.equal(cancelled.ok, false);
    assert.equal(cancelled.code, APPOINTMENT.NOT_FOUND);
    assert.equal(getOtpWorkflow("activeclinic.patient_portal_activation").independentOfBooking, true);
    assert.equal(getOtpWorkflow("activeclinic.public_booking"), null);
    const routes = fs.readFileSync(
      path.join(__dirname, "../../../src/activeclinic/http/activeClinicAppRoutes.js"),
      "utf8"
    );
    const call = routes.slice(routes.indexOf("issueAuthenticatedSessionCookie"));
    assert.match(call, /otpWorkflow: "activeclinic.staff_login"/);
  });
});
