"use strict";

/**
 * G05 records HTTP gate.
 * Unauthorized runs are skipped as NOT_RUN. They must not report PASS.
 */

const { describe, it } = require("node:test");
const { dbWritesAuthorized } = require("../helpers/v13DbWriteGate");
const { RESULTS } = require("../helpers/v13QaStatus");
const { runGated, runG05Records } = require("./v13AuthorizedScenarios");

describe("G05 records HTTP", () => {
  it("refuses paper destruction without writing a record", async (t) => {
    if (!dbWritesAuthorized()) {
      t.diagnostic(`V13_RESULT=${RESULTS.NOT_RUN}`);
      t.skip("NOT_RUN: records HTTP waits for disposable database authorization");
      return;
    }
    const result = await runGated(t, "G05", runG05Records);
    if (result !== RESULTS.PASS) {
      throw new Error(`G05 authorized run did not pass (${result})`);
    }
  });
});
