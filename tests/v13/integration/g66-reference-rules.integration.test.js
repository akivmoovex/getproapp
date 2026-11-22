"use strict";

/**
 * G66 reference-rule and migration readiness gate.
 * Unauthorized runs are skipped as NOT_RUN. They must not report PASS.
 * An authorized run fails closed while migration 043 or 044 is absent.
 */

const { describe, it } = require("node:test");
const { dbWritesAuthorized } = require("../helpers/v13DbWriteGate");
const { RESULTS } = require("../helpers/v13QaStatus");
const { runGated, runG66ReferenceRules } = require("./v13AuthorizedScenarios");

describe("G66 reference rules HTTP", () => {
  it("refuses to treat unapplied reference-rule storage as ready", async (t) => {
    if (!dbWritesAuthorized()) {
      t.diagnostic(`V13_RESULT=${RESULTS.NOT_RUN}`);
      t.skip("NOT_RUN: reference-rule persistence waits for disposable database authorization");
      return;
    }
    const result = await runGated(t, "G66", runG66ReferenceRules);
    if (result !== RESULTS.PASS) {
      throw new Error(`G66 authorized run did not pass (${result})`);
    }
  });
});
