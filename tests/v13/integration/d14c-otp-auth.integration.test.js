"use strict";

const { describe, it } = require("node:test");
const { runGated, runD14cOtp } = require("./v13AuthorizedScenarios");

describe("D14C OTP authentication integration", () => {
  it("keeps production activation blocked and requires a shared challenge row", async (t) => {
    await runGated(t, "D14C", runD14cOtp);
  });
});
