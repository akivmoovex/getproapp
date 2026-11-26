"use strict";

const { describe, it } = require("node:test");
const { runGated } = require("./v13AuthorizedScenarios");
const { RESULTS } = require("../helpers/v13QaStatus");
const { runCommunityPostgresPersistence } = require("./g308CommunityPostgresPersistence");

describe("community benefits persistence", () => {
  it("persists membership, QR, attribution, Model B preview, and settlement refusal on disposable PostgreSQL", async (t) => {
    const result = await runGated(t, "COMMUNITY", async (pool) => {
      await runCommunityPostgresPersistence(pool);
    });
    if (result !== RESULTS.PASS && result !== RESULTS.NOT_RUN) {
      throw new Error(`community benefits persistence did not pass (${result})`);
    }
  });
});
