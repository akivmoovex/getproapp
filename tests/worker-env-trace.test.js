"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildWorkerLabel, snapshotEnvPresenceYesNo } = require("../src/startup/workerEnvTrace");

test("buildWorkerLabel: lsnode prefix for LiteSpeed entry", () => {
  assert.match(buildWorkerLabel("/usr/local/lsws/fcgi-bin/lsnode.js"), /^lsnode:\d+$/);
});

test("snapshotEnvPresenceYesNo: reflects env (no values)", () => {
  const prev = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgres://x/y";
  try {
    const s = snapshotEnvPresenceYesNo();
    assert.equal(s.DATABASE_URL, "yes");
  } finally {
    if (prev !== undefined) process.env.DATABASE_URL = prev;
    else delete process.env.DATABASE_URL;
  }
});
