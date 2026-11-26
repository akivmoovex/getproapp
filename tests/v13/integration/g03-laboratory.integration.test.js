"use strict";

/**
 * G03 laboratory HTTP gate.
 * Unauthorized runs are skipped as NOT_RUN. They must not report PASS.
 */

const { describe, it } = require("node:test");
const { dbWritesAuthorized } = require("../helpers/v13DbWriteGate");
const { RESULTS } = require("../helpers/v13QaStatus");
const { runGated, runG03Laboratory } = require("./v13AuthorizedScenarios");
const { runG224Laboratory } = require("./d05RegressionRunners");

describe("G03 laboratory HTTP", () => {
  it("denies a laboratory request that is outside the organization", async (t) => {
    if (!dbWritesAuthorized()) {
      t.diagnostic(`V13_RESULT=${RESULTS.NOT_RUN}`);
      t.skip("NOT_RUN: laboratory HTTP waits for disposable database authorization");
      return;
    }
    const result = await runGated(t, "G03", runG03Laboratory);
    if (result !== RESULTS.PASS) {
      throw new Error(`G03 authorized run did not pass (${result})`);
    }
  });

  it("records a received specimen, verifies it with a second staff member, and reads it back", async (t) => {
    if (!dbWritesAuthorized()) {
      t.diagnostic(`V13_RESULT=${RESULTS.NOT_RUN}`);
      t.skip("NOT_RUN: laboratory result HTTP waits for disposable database authorization");
      return;
    }
    const result = await runGated(t, "G224", runG224Laboratory);
    if (result !== RESULTS.PASS) {
      throw new Error(`G224 authorized run did not pass (${result})`);
    }
  });
});
