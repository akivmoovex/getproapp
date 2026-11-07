"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { runTestable } = require("../combinedNightlyCoordinator");

const good = {
  source: { sha: "1c79bd77bd76a968fe69aff678e0380e2a5be463", tree: "2ab57811f443dfe32e04b95a48b0c7567b1b6815" },
  database: { bb: "bb_d122c_foundation_qa_2158z", ac: "d120_ac_foundation_qa_2143z" },
  network: { bb: "d57a-20261031-1455z-bb-internal", ac: "d57a-20261031-1455z-ac-internal" },
  credentials: { bb: true, ac: true },
};

test("T01 rejects incorrect source identity", () => assert.throws(() => runTestable({ ...good, source: { sha: "wrong", tree: good.source.tree } })));
test("T02 rejects incorrect database identity", () => assert.throws(() => runTestable({ ...good, database: { bb: null, ac: good.database.ac } })));
test("T03 rejects incorrect Docker network", () => assert.throws(() => runTestable({ ...good, network: { bb: "wrong", ac: good.network.ac } })));
test("T04 rejects missing credentials", () => assert.throws(() => runTestable({ ...good, credentials: { bb: false, ac: true } })));
test("T05 prevents concurrent execution", () => assert.equal(runTestable({ ...good, locked: true }).exitCode, 3));
test("T06 continues AC after ordinary BB failure", () => {
  const ran = [];
  const result = runTestable({ ...good, runStage: (name) => { ran.push(name); return { exitCode: name === "bb" ? 1 : 0 }; } });
  assert.deepEqual(ran, ["bb", "ac"]);
  assert.equal(result.exitCode, 1);
});
test("T07 aborts on cross-product isolation violation", () => assert.throws(() => runTestable({ ...good, isolationViolation: true })));
test("T08 records timeout as a failed run-owned stage", () => {
  const result = runTestable({ ...good, runStage: () => ({ exitCode: 124, timedOut: true }) });
  assert.equal(result.exitCode, 1);
  assert.equal(result.report.bb.timedOut, true);
});
test("T09 preserves independent reports on failure", () => {
  let saved;
  const result = runTestable({ ...good, runStage: (name) => ({ exitCode: name === "bb" ? 1 : 0 }), writeReport: (report) => { saved = report; } });
  assert.equal(result.exitCode, 1);
  assert.equal(saved.ac.exitCode, 0);
});
test("T10 returns zero when BB and AC pass", () => assert.equal(runTestable(good).exitCode, 0));
