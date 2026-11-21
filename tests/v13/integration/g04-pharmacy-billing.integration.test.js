"use strict";

/**
 * G04 pharmacy and billing HTTP gate.
 * Unauthorized runs are skipped as NOT_RUN. They must not report PASS.
 */

const { describe, it } = require("node:test");
const { dbWritesAuthorized } = require("../helpers/v13DbWriteGate");
const { RESULTS } = require("../helpers/v13QaStatus");
const { runGated, runG04PharmacyBilling } = require("./v13AuthorizedScenarios");

describe("G04 pharmacy and billing HTTP", () => {
  it("denies a dispense for a staff member outside the organization", async (t) => {
    if (!dbWritesAuthorized()) {
      t.diagnostic(`V13_RESULT=${RESULTS.NOT_RUN}`);
      t.skip("NOT_RUN: pharmacy HTTP waits for disposable database authorization");
      return;
    }
    const result = await runGated(t, "G04", runG04PharmacyBilling);
    if (result !== RESULTS.PASS) {
      throw new Error(`G04 authorized run did not pass (${result})`);
    }
  });
});
