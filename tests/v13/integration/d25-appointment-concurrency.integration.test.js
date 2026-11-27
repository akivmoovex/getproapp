"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { runGated } = require("./v13AuthorizedScenarios");

describe("D25 appointment persistence", () => {
  it("confirms Option C: assigned-staff non-overlap is the capacity rule", async (t) => {
    const result = await runGated(t, "APT-01-03", async () => {
      const fs = require("node:fs");
      const path = require("node:path");
      const { evaluateSlotCapacity } = require("../../../src/activeclinic/services/appointmentSchedulingRules");
      const capacity = evaluateSlotCapacity();
      assert.equal(capacity.ok, false);
      assert.equal(capacity.code, "BLOCKED_APPROVAL_REQUIRED");
      assert.equal(capacity.capacity, null);
      const source = fs.readFileSync(
        path.join(__dirname, "../../../src/activeclinic/services/activeClinicAppointmentService.js"),
        "utf8"
      );
      assert.equal(source.includes("slot_capacity"), false);
      assert.equal(source.includes("evaluateSlotCapacity"), false);
      // APT-01-03_OPTION_C_POLICY: assigned-staff non-overlap is the complete capacity rule; no separate slot-capacity integer exists
    });
    assert.ok(result === "PASS" || result === "NOT_RUN");
  });

  it("rejects same-staff overlap inside the appointment transaction", async (t) => {
    const result = await runGated(t, "D39-STAFF-OVERLAP-RACE", async () => {
      const fs = require("node:fs");
      const path = require("node:path");
      const source = fs.readFileSync(
        path.join(__dirname, "../../../src/activeclinic/services/activeClinicAppointmentService.js"),
        "utf8"
      );
      for (const name of ["createAppointment", "updateAppointment", "rescheduleAppointment"]) {
        const marker = `async function ${name}(`;
        const start = source.indexOf(marker);
        const next = source.indexOf("\nasync function ", start + marker.length);
        const body = source.slice(start, next === -1 ? source.length : next);
        const begin = body.indexOf('await client.query("BEGIN")');
        const lock = body.indexOf("lockStaffAppointmentScope");
        const write = body.search(/insertAppointment|updateAppointmentByOrgAndId/);
        assert.ok(begin >= 0 && lock > begin && write > lock, name);
      }
      assert.equal(source.includes("slot_capacity"), false);
    });
    assert.ok(result === "PASS" || result === "NOT_RUN");
  });

  it("lets one concurrent same-staff booking win and keeps other staff and the next interval", async (t) => {
    const result = await runGated(t, "D25-STAFF-CONCURRENCY", async (pool, connectionString) => {
      const assert = require("node:assert/strict");
      const { createAppointment } = require("../../../src/activeclinic/services/activeClinicAppointmentService");
      const { insertPatient } = require("../../../src/activeclinic/repositories/patientRepository");
      const { createStaffMember } = require("../../../src/activeclinic/services/activeClinicStaffService");
      const { createCatalogueService } = require("../../../src/activeclinic/website/clinicWebsiteCatalogueService");
      const { PERMISSIONS } = require("../../../src/platform/website/permissions");
      const { applyActiveClinicFixtures } = require("../fixtures/v13SyntheticFixtures");
      const identity = await pool.query(
        `SELECT current_database() AS db, inet_server_port() AS port,
                (SELECT database_name FROM platform.database_identity) AS identity_db`
      );
      assert.equal(identity.rows[0].db, "getpro_v13_e2e_g78d2301");
      assert.equal(Number(identity.rows[0].port), 55432);
      assert.equal(identity.rows[0].identity_db, "getpro_v13_e2e_g78d2301");
      const fixtures = await applyActiveClinicFixtures(pool, connectionString, process.env);
      const clinicA = fixtures.created[0];
      const clinicB = fixtures.created[1];
      const hco = (
        await pool.query(
          `SELECT id FROM activeclinic.healthcare_organizations WHERE organization_id = $1 LIMIT 1`,
          [clinicA.organizationId]
        )
      ).rows[0];
      const facility = (
        await pool.query(
          `SELECT id FROM activeclinic.facilities WHERE organization_id = $1 LIMIT 1`,
          [clinicA.organizationId]
        )
      ).rows[0];
      const staffRows = (
        await pool.query(
          `SELECT id FROM activeclinic.staff_members
            WHERE organization_id = $1
            ORDER BY created_at ASC`,
          [clinicA.organizationId]
        )
      ).rows;
      assert.ok(hco && facility && staffRows[0]);
      const actorId = staffRows[0].id;
      let otherStaffId = staffRows[1] && staffRows[1].id;
      if (!otherStaffId) {
        const stamp = Date.now();
        const createdStaff = await createStaffMember(pool, {
          organizationId: clinicA.organizationId,
          healthcareOrganizationId: hco.id,
          firstName: "Other",
          lastName: "Clinician",
          email: `g137-${stamp}@example.invalid`,
          phone: `+26096${String(stamp).slice(-7)}`,
          employmentType: "permanent",
          status: "active",
        });
        assert.equal(createdStaff.ok, true, createdStaff.code);
        otherStaffId = createdStaff.staffMember.id;
      }
      const catalogue = await createCatalogueService(pool, {
        organizationId: clinicA.organizationId,
        healthcareOrganizationId: hco.id,
        displayName: "V13 G137 Consultation",
        serviceKey: `g137${String(clinicA.organizationId).replace(/-/g, "").slice(0, 12)}`,
        defaultDurationMinutes: 30,
        grantedPermissions: [PERMISSIONS.EDIT],
        publicWebsiteVisible: false,
        publicBookable: false,
      });
      assert.equal(catalogue.ok, true, catalogue.code || catalogue.status);
      const patient = await insertPatient(pool, {
        organizationId: clinicA.organizationId,
        healthcareOrganizationId: hco.id,
        patientNumber: `AC-2026-${String(Date.now()).slice(-6)}`,
        firstName: "Slot",
        lastName: "Concurrency",
        sexAtRegistration: "unknown",
        countryCode: "ZM",
        status: "active",
        registrationStatus: "complete",
        createdByStaffId: actorId,
        updatedByStaffId: actorId,
      });
      const startsAt = "2026-12-02T09:00:00.000Z";
      const endsAt = "2026-12-02T09:30:00.000Z";
      const nextEnds = "2026-12-02T10:00:00.000Z";
      const booking = {
        organizationId: clinicA.organizationId,
        healthcareOrganizationId: hco.id,
        facilityId: facility.id,
        patientId: patient.id,
        serviceTypeId: catalogue.serviceId,
        actor: { staffMemberId: actorId },
        timezone: "Africa/Lusaka",
      };
      const raced = await Promise.all([
        createAppointment(pool, { ...booking, assignedStaffId: actorId, startsAt, endsAt }),
        createAppointment(pool, { ...booking, assignedStaffId: actorId, startsAt, endsAt }),
      ]);
      const wins = raced.filter((row) => row.ok);
      const losses = raced.filter((row) => !row.ok);
      assert.equal(wins.length, 1);
      assert.equal(losses.length, 1);
      assert.equal(losses[0].code, "appointment_collision");
      const owned = async () => Number((
        await pool.query(
          `SELECT count(*)::int AS n FROM activeclinic.appointments WHERE organization_id = $1`,
          [clinicA.organizationId]
        )
      ).rows[0].n);
      assert.equal(await owned(), 1);
      const retry = await createAppointment(pool, {
        ...booking,
        assignedStaffId: actorId,
        startsAt,
        endsAt,
      });
      assert.equal(retry.ok, false);
      assert.equal(retry.code, "appointment_collision");
      assert.equal(await owned(), 1);
      const adjacent = await createAppointment(pool, {
        ...booking,
        assignedStaffId: actorId,
        startsAt: endsAt,
        endsAt: nextEnds,
      });
      assert.equal(adjacent.ok, true, adjacent.code);
      const independent = await createAppointment(pool, {
        ...booking,
        assignedStaffId: otherStaffId,
        startsAt,
        endsAt,
      });
      assert.equal(independent.ok, true, independent.code);
      assert.equal(await owned(), 3);
      const cross = await createAppointment(pool, {
        ...booking,
        organizationId: clinicB.organizationId,
        assignedStaffId: actorId,
        startsAt: "2026-12-02T11:00:00.000Z",
        endsAt: "2026-12-02T11:30:00.000Z",
      });
      assert.equal(cross.ok, false);
      const otherClinic = Number((
        await pool.query(
          `SELECT count(*)::int AS n FROM activeclinic.appointments WHERE organization_id = $1`,
          [clinicB.organizationId]
        )
      ).rows[0].n);
      assert.equal(otherClinic, 0);
      assert.equal(await owned(), 3);
    });
    assert.ok(result === "PASS" || result === "NOT_RUN");
  });
});
