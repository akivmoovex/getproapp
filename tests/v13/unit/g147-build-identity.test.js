"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { getBuildIdentity } = require("../../../src/platform/runtime/buildIdentity");
const {
  CODE_MOOVEX_PLATFORM_TESTING,
} = require("../../../src/platform/config/deploymentProfiles");

describe("G147 hosted build identity", () => {
  it("keeps the env branch label and the deployed SHA as separate facts", () => {
    const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), "g147-identity-"));
    const previous = process.env.GETPRO_GIT_BRANCH;
    process.env.GETPRO_GIT_BRANCH = "V11";
    try {
      const id = getBuildIdentity({
        appRoot,
        env: {
          PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
          DEPLOYMENT_ENV: "testing",
          DATABASE_IDENTITY_ENV: "testing",
          NODE_ENV: "production",
          GETPRO_GIT_SHA: "155ada725926d83468fe47e82b87757d20adb097",
        },
      });
      assert.equal(id.branch, "V11");
      assert.equal(id.branchSource, "GETPRO_GIT_BRANCH");
      assert.equal(id.gitSha, "155ada725926d83468fe47e82b87757d20adb097");
      assert.equal(id.gitShaShort, "155ada725926");
      assert.equal(id.displayLabel, "V11 testing");
      assert.notEqual(id.branch, "V13");
    } finally {
      if (previous === undefined) delete process.env.GETPRO_GIT_BRANCH;
      else process.env.GETPRO_GIT_BRANCH = previous;
      fs.rmSync(appRoot, { recursive: true, force: true });
    }
  });
});
