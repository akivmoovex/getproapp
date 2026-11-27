"use strict";

/**
 * D159 persistence journeys.
 * Default result is NOT_RUN. D159 does not execute this file.
 */

const { describe, it } = require("node:test");
const { dbWritesAuthorized } = require("../helpers/v13DbWriteGate");
const { RESULTS } = require("../helpers/v13QaStatus");
const { runGated, runBb06, runInv01 } = require("./v13AuthorizedScenarios");

function gate(t, name) {
  if (dbWritesAuthorized()) return true;
  t.diagnostic(`V13_RESULT=${RESULTS.NOT_RUN}`);
  t.skip(`NOT_RUN: ${name} waits for disposable database authorization`);
  return false;
}

describe("D159 disposable member and invitation persistence", () => {
  it("BB-06 reads a member back after the authorized write", async (t) => {
    if (!gate(t, "BB-06")) return;
    await runGated(t, "D159-BB-06", (pool, connectionString, env) => runBb06(pool, connectionString, env));
  });

  it("INV-01 accepts one synthetic invitation and rejects a second use", async (t) => {
    if (!gate(t, "INV-01")) return;
    await runGated(t, "D159-INV-01", (pool, connectionString, env) => runInv01(pool, connectionString, env));
  });
});
