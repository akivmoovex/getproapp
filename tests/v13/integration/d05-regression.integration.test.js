"use strict";

/**
 * D05 remaining HTTP regressions.
 * Unauthorized runs are skipped as NOT_RUN. They must not report PASS.
 */

const { describe, it } = require("node:test");
const { dbWritesAuthorized } = require("../helpers/v13DbWriteGate");
const { RESULTS } = require("../helpers/v13QaStatus");
const { resolveDisposableConnectionString } = require("../helpers/v13CiDatabaseGuard");
const { runGated } = require("./v13AuthorizedScenarios");
const {
  runAcWeb08,
  runAcWeb09,
  runAcRec02,
  runAcRec03,
  runAcPub01,
  runBbWeb08,
  runBbWeb09,
  runBbWeb10,
  runBbAnn02,
} = require("./d05RegressionRunners");

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

describe("D05 remaining HTTP regressions", () => {
  it("AC-WEB-08 website section is drafted, previewed, published, and isolated", async (t) => {
    await runOrNotRun(t, "AC-WEB-08", runAcWeb08);
  });

  it("AC-WEB-09 selected clinic theme is previewed, published, and rejects a church theme", async (t) => {
    await runOrNotRun(t, "AC-WEB-09", runAcWeb09);
  });

  it("AC-REC-02 walk-in uses a clinic service point and stays in that clinic", async (t) => {
    await runOrNotRun(t, "AC-REC-02", runAcRec02);
  });

  it("AC-REC-03 clinical staff record heart rate and an unauthorized session cannot change it", async (t) => {
    await runOrNotRun(t, "AC-REC-03", runAcRec03);
  });

  it("AC-PUB-01 public booking stays disabled until a clinic enables it", async (t) => {
    await runOrNotRun(t, "AC-PUB-01", runAcPub01);
  });

  it("BB-WEB-08 church theme is previewed, published, and rejects a clinic theme", async (t) => {
    await runOrNotRun(t, "BB-WEB-08", runBbWeb08);
  });

  it("BB-WEB-09 sermon draft stays private and the published sermon is isolated", async (t) => {
    await runOrNotRun(t, "BB-WEB-09", runBbWeb09);
  });

  it("BB-WEB-10 event draft stays private and the published event is isolated", async (t) => {
    await runOrNotRun(t, "BB-WEB-10", runBbWeb10);
  });

  it("BB-ANN-02 announcement attachment is saved, published, rejected when invalid, and isolated", async (t) => {
    await runOrNotRun(t, "BB-ANN-02", runBbAnn02);
  });
});
