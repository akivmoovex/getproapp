"use strict";

/**
 * fieldAgentAuthedPostLimiter: separate bucket from login/signup; burst behavior in an isolated subprocess
 * so the in-memory store is not shared with the rest of the test suite.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("child_process");
const path = require("path");

test("fieldAgentAuthedPostLimiter: JSON 429 after exceeding cap (subprocess)", () => {
  const root = path.join(__dirname, "..");
  const authRatePath = path.join(root, "src", "middleware", "authRateLimit.js");
  const script = `
    process.env.GETPRO_FIELD_AGENT_AUTHED_POST_RATE_MAX = "2";
    const express = require("express");
    const request = require("supertest");
    const { fieldAgentAuthedPostLimiter } = require(${JSON.stringify(authRatePath)});
    const app = express();
    app.use(express.json());
    app.post("/field-agent/api/ping", fieldAgentAuthedPostLimiter, (req, res) => res.json({ ok: true }));
    (async () => {
      const agent = request(app);
      const r1 = await agent.post("/field-agent/api/ping").set("Content-Type", "application/json").send({});
      const r2 = await agent.post("/field-agent/api/ping").set("Content-Type", "application/json").send({});
      const r3 = await agent.post("/field-agent/api/ping").set("Content-Type", "application/json").send({});
      if (r1.status !== 200 || r2.status !== 200) process.exit(10);
      if (r3.status !== 429) process.exit(11);
      let j;
      try { j = JSON.parse(r3.text || "{}"); } catch (e) { process.exit(12); }
      if (j.ok !== false || !j.error) process.exit(13);
      process.exit(0);
    })().catch(() => process.exit(14));
  `;
  const res = spawnSync(process.execPath, ["-e", script], {
    encoding: "utf8",
    cwd: root,
  });
  assert.equal(res.status, 0, res.stderr || res.stdout || "burst subprocess failed");
});

test("fieldAgentAuthedPostLimiter: text 429 for non-API path without JSON Accept (subprocess)", () => {
  const root = path.join(__dirname, "..");
  const authRatePath = path.join(root, "src", "middleware", "authRateLimit.js");
  const script = `
    process.env.GETPRO_FIELD_AGENT_AUTHED_POST_RATE_MAX = "2";
    const express = require("express");
    const request = require("supertest");
    const { fieldAgentAuthedPostLimiter } = require(${JSON.stringify(authRatePath)});
    const app = express();
    app.use(express.urlencoded({ extended: true }));
    app.post("/field-agent/call-me-back", fieldAgentAuthedPostLimiter, (req, res) => res.send("ok"));
    (async () => {
      const agent = request(app);
      await agent.post("/field-agent/call-me-back").type("form").send({ x: "1" });
      await agent.post("/field-agent/call-me-back").type("form").send({ x: "1" });
      const r3 = await agent.post("/field-agent/call-me-back").type("form").send({ x: "1" });
      if (r3.status !== 429) process.exit(20);
      if (!String(r3.text || "").includes("Too many")) process.exit(21);
      process.exit(0);
    })().catch(() => process.exit(22));
  `;
  const res = spawnSync(process.execPath, ["-e", script], {
    encoding: "utf8",
    cwd: root,
  });
  assert.equal(res.status, 0, res.stderr || res.stdout || "text 429 subprocess failed");
});
