"use strict";

const { describe, it } = require("node:test");
const { runGated, runBb03 } = require("./v13AuthorizedScenarios");

describe("BB-03 events integration", () => {
  it("persists one event and rejects an end time before the start and a foreign branch", async (t) => {
    await runGated(t, "BB-03", runBb03);
  });
});
