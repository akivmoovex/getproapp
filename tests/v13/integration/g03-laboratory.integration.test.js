"use strict";

/**
 * G03 laboratory HTTP gate.
 * Unauthorized runs are skipped as NOT_RUN. They must not report PASS.
 */

const { describe, it } = require("node:test");
const { dbWritesAuthorized } = require("../helpers/v13DbWriteGate");
const { RESULTS } = require("../helpers/v13QaStatus");
const { runGated, runG03Laboratory } = require("./v13AuthorizedScenarios");

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
});
