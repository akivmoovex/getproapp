"use strict";

const { describe, it } = require("node:test");
const { runGated, runBb24 } = require("./v13AuthorizedScenarios");

describe("BB-24 public directory integration", () => {
  it("stores the enquiry on the resolved church and ignores a posted church id", async (t) => {
    await runGated(t, "BB-24", runBb24);
  });
});
