"use strict";

const { describe, it } = require("node:test");
const { runGated, runPlatformOtp } = require("./v13AuthorizedScenarios");

describe("D16 shared platform OTP integration", () => {
  it("requires the challenge table before a second worker can verify the same code", async (t) => {
    await runGated(t, "OTP", runPlatformOtp);
  });
});
