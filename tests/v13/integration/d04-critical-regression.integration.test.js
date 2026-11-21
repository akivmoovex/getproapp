"use strict";

/**
 * D04 critical HTTP regressions.
 * Unauthorized runs are skipped as NOT_RUN. They must not report PASS.
 */

const { describe, it } = require("node:test");
const { dbWritesAuthorized } = require("../helpers/v13DbWriteGate");
const { RESULTS } = require("../helpers/v13QaStatus");
const { resolveDisposableConnectionString } = require("../helpers/v13CiDatabaseGuard");
const { runGated } = require("./v13AuthorizedScenarios");
const {
  runAcAuth04,
  runBbAuth04,
  runBbMem02,
  runAcReg01,
  runBbReg07,
  runBbMem01,
  runBbAnn01,
} = require("./d04CriticalRegressionRunners");

async function runOrNotRun(t, bugId, runner) {
  if (!dbWritesAuthorized()) {
    t.diagnostic(`V13_RESULT=${RESULTS.NOT_RUN}`);
    t.skip(`NOT_RUN: ${bugId} HTTP regression waits for disposable database authorization`);
    return;
  }
  resolveDisposableConnectionString(process.env);
  const result = await runGated(t, bugId, runner);
  if (result !== RESULTS.PASS) {
    throw new Error(`${bugId}: authorized run did not pass (${result})`);
  }
}

describe("D04 critical HTTP regressions", () => {
  it("AC-AUTH-04 forgot password uses the testing outbox and signs in", async (t) => {
    await runOrNotRun(t, "AC-AUTH-04", runAcAuth04);
  });

  it("BB-AUTH-04 member recovery uses the testing OTP and signs in", async (t) => {
    await runOrNotRun(t, "BB-AUTH-04", runBbAuth04);
  });

  it("BB-MEM-02 real HQ member shell accepts only a paired CSRF token", async (t) => {
    await runOrNotRun(t, "BB-MEM-02", runBbMem02);
  });

  it("AC-REG-01 duplicate clinic phone denies a mismatched password and allows credential reuse", async (t) => {
    await runOrNotRun(t, "AC-REG-01", runAcReg01);
  });

  it("BB-REG-07 duplicate church phone keeps a single normalized registration", async (t) => {
    await runOrNotRun(t, "BB-REG-07", runBbReg07);
  });

  it("BB-MEM-01 member form shows mandatory fields and completes registration", async (t) => {
    await runOrNotRun(t, "BB-MEM-01", runBbMem01);
  });

  it("BB-ANN-01 published announcement is visible only on that church public page", async (t) => {
    await runOrNotRun(t, "BB-ANN-01", runBbAnn01);
  });
});
