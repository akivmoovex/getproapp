"use strict";

const { describe, it } = require("node:test");
const { runGated, runAcAuth } = require("./v13AuthorizedScenarios");

describe("D16 ActiveClinic auth integration", () => {
  it("denies an organisation-scoped receptionist, stores one appointment, and rejects the collision and the other clinic", async (t) => {
    await runGated(t, "AC-05", runAcAuth);
  });
});
