"use strict";

/**
 * D150 persistence regressions.
 * Default result is NOT_RUN. This file must not be executed without
 * GETPRO_V13_ALLOW_DB_WRITES=1 and GETPRO_V13_DB_STAGES_AUTHORIZED=1.
 * D150 does not run it.
 */

const { describe, it } = require("node:test");
const { dbWritesAuthorized } = require("../helpers/v13DbWriteGate");
const { RESULTS } = require("../helpers/v13QaStatus");
const assert = require("node:assert/strict");
const { runGated } = require("./v13AuthorizedScenarios");
const { runG224Laboratory, runG229Radiology } = require("./d05RegressionRunners");

function gate(t, name) {
  if (dbWritesAuthorized()) return true;
  t.diagnostic(`V13_RESULT=${RESULTS.NOT_RUN}`);
  t.skip(`NOT_RUN: ${name} waits for disposable database authorization`);
  return false;
}

describe("D150 disposable persistence", () => {
  it("D25 persists one assigned-staff overlap winner and rolls the other back", async (t) => {
    if (!gate(t, "D25")) return;
    const result = await runGated(t, "D150-D25", async (pool, connectionString) => {
      const { createAppointment } = require("../../../src/activeclinic/services/activeClinicAppointmentService");
      const { insertPatient } = require("../../../src/activeclinic/repositories/patientRepository");
      const { applyActiveClinicFixtures } = require("../fixtures/v13SyntheticFixtures");
      const identity = await pool.query(
        "SELECT current_database() AS db, inet_server_port()::text AS port"
      );
      assert.equal(identity.rows[0].port, "55432");
      assert.equal(String(identity.rows[0].db).includes("postgres"), false);
      const fixtures = await applyActiveClinicFixtures(pool, connectionString, process.env);
      const clinic = fixtures.created[0];
      const hco = (await pool.query(
        "SELECT id FROM activeclinic.healthcare_organizations WHERE organization_id = $1 LIMIT 1",
        [clinic.organizationId]
      )).rows[0];
      const facility = (await pool.query(
        "SELECT id FROM activeclinic.facilities WHERE organization_id = $1 LIMIT 1",
        [clinic.organizationId]
      )).rows[0];
      const staff = (await pool.query(
        "SELECT id FROM activeclinic.staff_members WHERE organization_id = $1 ORDER BY created_at ASC LIMIT 1",
        [clinic.organizationId]
      )).rows[0];
      assert.ok(hco && facility && staff);
      const patient = await insertPatient(pool, {
        organizationId: clinic.organizationId,
        healthcareOrganizationId: hco.id,
        patientNumber: `AC-D150-${String(Date.now()).slice(-6)}`,
        firstName: "Race",
        lastName: "Guard",
        sexAtRegistration: "unknown",
        countryCode: "ZM",
        status: "active",
        registrationStatus: "complete",
        createdByStaffId: staff.id,
        updatedByStaffId: staff.id,
      });
      const startsAt = "2026-12-03T09:00:00.000Z";
      const endsAt = "2026-12-03T09:30:00.000Z";
      const booking = {
        organizationId: clinic.organizationId,
        healthcareOrganizationId: hco.id,
        facilityId: facility.id,
        patientId: patient.id,
        assignedStaffId: staff.id,
        actor: { staffMemberId: staff.id },
        timezone: "Africa/Lusaka",
        startsAt,
        endsAt,
      };
      const raced = await Promise.all([
        createAppointment(pool, booking),
        createAppointment(pool, booking),
      ]);
      assert.equal(raced.filter((row) => row.ok).length, 1);
      assert.equal(raced.filter((row) => row.code === "appointment_collision").length, 1);
      const stored = await pool.query(
        "SELECT count(*)::int AS n FROM activeclinic.appointments WHERE organization_id = $1 AND starts_at = $2",
        [clinic.organizationId, startsAt]
      );
      assert.equal(stored.rows[0].n, 1);
    });
    if (result !== RESULTS.PASS) throw new Error(`D25 authorized run did not pass (${result})`);
  });

  it("G224 persists a laboratory result and reads the same component back", async (t) => {
    if (!gate(t, "G224")) return;
    const result = await runGated(t, "G224", runG224Laboratory);
    if (result !== RESULTS.PASS) throw new Error(`G224 authorized run did not pass (${result})`);
  });

  it("G229 persists a radiology report and reads findings back", async (t) => {
    if (!gate(t, "G229")) return;
    const result = await runGated(t, "G229", runG229Radiology);
    if (result !== RESULTS.PASS) throw new Error(`G229 authorized run did not pass (${result})`);
  });
});
