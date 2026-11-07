"use strict";

const assert = require("assert");
const test = require("node:test");
const { main } = require("../dailyQaMasterRunner");

function execute(stages, mkdir, remove) {
  return main({ ...(mkdir ? { mkdir } : {}), ...(remove ? { remove } : {}), runStage: (label) => stages[label] });
}

test("M01 offline stage executes", () => {
  const r = execute({ offline: { exitCode: 0 }, browser: { exitCode: 0 } });
  assert.equal(r.report.offline.exitCode, 0);
});
test("M02 browser stage executes", () => {
  const r = execute({ offline: { exitCode: 0 }, browser: { exitCode: 0 } });
  assert.equal(r.report.browser.exitCode, 0);
});
test("M03 offline failure preserves browser execution", () => {
  const r = execute({ offline: { exitCode: 1 }, browser: { exitCode: 0 } });
  assert.equal(r.report.browser.exitCode, 0);
});
test("M04 browser failure preserves offline result", () => {
  const r = execute({ offline: { exitCode: 0 }, browser: { exitCode: 1 } });
  assert.equal(r.report.offline.exitCode, 0);
});
test("M05 lock prevents duplicate run", () => {
  const original = require("fs").mkdirSync;
  let calls = 0;
  const r = execute({ offline: { exitCode: 0 }, browser: { exitCode: 0 } }, (...args) => {
    calls += 1;
    if (calls === 2) { const e = new Error(); e.code = "EEXIST"; throw e; }
    return original(...args);
  });
  assert.equal(r.exitCode, 3);
});
test("M06 failed stage returns failure", () => {
  assert.equal(execute({ offline: { exitCode: 2 }, browser: { exitCode: 0 } }).exitCode, 1);
});
test("M07 timeout result is preserved", () => {
  const r = execute({ offline: { exitCode: 124, timedOut: true }, browser: { exitCode: 0 } });
  assert.equal(r.report.offline.timedOut, true);
});
test("M08 partial failure has combined failure", () => {
  assert.equal(execute({ offline: { exitCode: 1 }, browser: { exitCode: 1 } }).status, "FAIL");
});
test("M09 both stages pass", () => {
  assert.equal(execute({ offline: { exitCode: 0 }, browser: { exitCode: 0 } }).status, "PASS");
});
test("M10 report is written before return", () => {
  let writes = 0;
  const original = require("fs").writeFileSync;
  require("fs").writeFileSync = () => { writes += 1; };
  try { execute({ offline: { exitCode: 0 }, browser: { exitCode: 0 } }); } finally { require("fs").writeFileSync = original; }
  assert.ok(writes >= 1);
});
