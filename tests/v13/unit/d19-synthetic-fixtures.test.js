"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildBlessBoardFixturePlan,
  buildActiveClinicFixturePlan,
  buildV213RegressionFixturePlan,
  assertSyntheticPlan,
  applyBlessBoardFixtures,
  applyActiveClinicFixtures,
  SYNTHETIC_PASSWORD,
} = require("../fixtures/v13SyntheticFixtures");
const { resolveOtpActivation } = require("../../../src/platform/otp/otpActivation");

describe("D19 synthetic fixtures", () => {
  it("builds the same BlessBoard and ActiveClinic plans twice", () => {
    const bb = assertSyntheticPlan(buildBlessBoardFixturePlan());
    const ac = assertSyntheticPlan(buildActiveClinicFixturePlan());
    assert.deepEqual(bb, buildBlessBoardFixturePlan());
    assert.deepEqual(ac, buildActiveClinicFixturePlan());
    assert.equal(bb.churches.length, 2);
    assert.notEqual(bb.churches[0].key, bb.churches[1].key);
    assert.equal(ac.clinics.length, 2);
    assert.equal(ac.denial.route, "/app/billing");
    assert.equal(ac.denial.roleKey, "activeclinic_receptionist");
    assert.notEqual(SYNTHETIC_PASSWORD, "1234");
    for (const church of bb.churches) {
      assert.match(church.admin.email, /@v13d19\.example$/);
      assert.match(church.member.email, /@v13d19\.example$/);
      assert.equal(church.staffInvite.roleKey, "ministry_leader");
    }
  });

  it("defines the regression fixture plan without persisting it", () => {
    const plan = assertSyntheticPlan(buildV213RegressionFixturePlan());
    assert.equal(plan.persisted, false);
    assert.equal(plan.createsDatabaseRecords, false);
    assert.equal(plan.requestedDatabaseName, "getpro_v13_e2e_regression213101");
    assert.equal(plan.blessboard.administrator.roleKey, "church_hq_admin");
    assert.equal(plan.blessboard.member.otpProvider, "test");
    assert.equal(plan.blessboard.member.exposeCodeOnPage, false);
    assert.equal(plan.activeclinic.receptionist.departmentKey, "reception");
    assert.equal(plan.activeclinic.receptionist.roleKey, "activeclinic_receptionist");
    assert.equal(plan.activeclinic.clinician.roleKey, "activeclinic_clinician");
    assert.equal(plan.activeclinic.clinician.departmentKey, "opd");
    assert.equal(plan.activeclinic.clinicalDepartment.key, "opd");
    assert.equal(plan.activeclinic.servicePoint.acceptsWalkIn, true);
    assert.equal(plan.activeclinic.servicePoint.facilityKey, "v13d19-facility-a");
    assert.notEqual(plan.activeclinic.clinic.key, plan.activeclinic.otherClinic.key);
    assert.notEqual(plan.blessboard.church.key, plan.blessboard.otherChurch.key);
    assert.equal(plan.blessboard.invitation.tokenExposed, false);
    assert.equal(plan.blessboard.member.otpProvider, "test");
    assert.match(plan.blessboard.publicHost, /\.local\.test$/);
    assert.equal(plan.activeclinic.walkInService.servicePointRequired, true);
    assert.equal(plan.activeclinic.recovery.liveEmail, false);
    assert.equal(plan.activeclinic.theme.key, "ac.family-wellness-mint");
    assert.equal(plan.blessboard.theme.key, "bb.community");
    assert.match(plan.blessboard.publicRoutes.announcements, /^\//);
    assert.match(plan.activeclinic.publicRoutes.book, /^\//);
  });

  it("refuses fixture apply before any database call", async () => {
    let queries = 0;
    const db = {
      query() {
        queries += 1;
        throw new Error("query called");
      },
    };
    await assert.rejects(
      () => applyBlessBoardFixtures(db, "postgres://127.0.0.1/getpro_v13_int_abcdef", {}),
      /V13_FIXTURE_HOLD/
    );
    await assert.rejects(
      () => applyActiveClinicFixtures(db, "postgres://127.0.0.1/getpro_v13_int_abcdef", {}),
      /V13_FIXTURE_HOLD/
    );
    assert.equal(queries, 0);
  });

  it("keeps a production OTP override blocked", () => {
    const blocked = resolveOtpActivation(
      { NODE_ENV: "production", DEPLOYMENT_ENV: "production" },
      "ACTIVE"
    );
    assert.equal(blocked.status, "BLOCKED");
    assert.equal(blocked.reasons.includes("migration_not_applied"), true);
  });
});
