"use strict";

const { describe, it } = require("node:test");
const { runGated, runBb01 } = require("./v13AuthorizedScenarios");

describe("BB-01 homepage sections integration", () => {
  it("creates, isolates, and rolls back a homepage section on a disposable database", async (t) => {
    await runGated(t, "BB-01", runBb01);
  });
});
