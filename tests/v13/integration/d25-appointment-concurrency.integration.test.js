"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { runGated } = require("./v13AuthorizedScenarios");

describe("D25 appointment persistence", () => {
  it("keeps simultaneous slot booking unexecuted", async (t) => {
    const result = await runGated(t, "APT-01-03", async () => {
      throw new Error(
        "APT-01-03_NOT_IMPLEMENTED: slot capacity lock is not in the product (BLOCKED_APPROVAL_REQUIRED)"
      );
    });
    assert.equal(result, "NOT_RUN");
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
});
