"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createMemoryCommunityStore } = require("../../../src/activeclinic/communityBenefits/memoryStore");
const { registerCommunityBenefitsRoutes } = require("../../../src/activeclinic/communityBenefits/routes");
const service = require("../../../src/activeclinic/communityBenefits/communityBenefitsService");

const CLINIC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function appFor(store) {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  registerCommunityBenefitsRoutes(app, {
    env: { NODE_ENV: "test", GETPRO_AC_COMMUNITY_BENEFITS_ENABLED: "1" },
    store,
    allowTestActor: true,
    clinics: [{ id: CLINIC, name: "Clinic A" }],
  });
  return app;
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function request(server, method, path, { body, headers } = {}) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const http = require("http");
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path,
      method,
      headers: { "content-type": "application/x-www-form-urlencoded", ...(headers || {}) },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

describe("community benefits HTTP routes", () => {
  it("stays hidden when the flag is off and refuses a missing token, a bad code, and a posted ledger", async () => {
    const hidden = express();
    registerCommunityBenefitsRoutes(hidden, { env: { NODE_ENV: "test" }, store: createMemoryCommunityStore() });
    const hiddenServer = await listen(hidden);
    const closed = await request(hiddenServer, "GET", "/app/reception/community-check-in");
    assert.equal(closed.status, 404);
    hiddenServer.close();

    const store = createMemoryCommunityStore();
    const person = service.addPerson(store, { displayName: "Ada Member" }).person;
    service.requestEnrollment(store, { personId: person.id });
    service.recordConsent(store, { personId: person.id, noticeVersion: "notice-1" });
    service.verifyIdentity(store, { personId: person.id, method: "staff_document" });
    service.activateMembership(store, { personId: person.id });
    const pass = service.issuePass(store, { personId: person.id });
    const server = await listen(appFor(store));
    const actor = JSON.stringify({
      staffId: "staff-1", role: "reception", clinicId: CLINIC, clinicName: "Clinic A", facilityId: "fac-a",
    });
    const page = await request(server, "GET", "/app/reception/community-check-in", {
      headers: { "x-community-test-actor": actor },
    });
    assert.equal(page.status, 200);
    assert.match(page.body, /Community Check-in/);
    const csrf = page.body.match(/name="csrf" value="([^"]+)"/)[1];
    const denied = await request(server, "POST", "/app/reception/community-check-in", {
      body: `csrf=${csrf}&pass_code=not-a-code&clinic_id=${CLINIC}&action=preview`,
    });
    assert.equal(denied.status, 401);
    const bad = await request(server, "POST", "/app/reception/community-check-in", {
      headers: { "x-community-test-actor": actor },
      body: `csrf=${csrf}&pass_code=not-a-code&clinic_id=${CLINIC}&action=preview`,
    });
    assert.equal(bad.status, 400);
    assert.match(bad.body, /invalid, expired, or revoked/);
    const fresh = await request(server, "GET", "/app/reception/community-check-in", {
      headers: { "x-community-test-actor": actor },
    });
    const next = fresh.body.match(/name="csrf" value="([^"]+)"/)[1];
    const shown = await request(server, "POST", "/app/reception/community-check-in", {
      headers: { "x-community-test-actor": actor },
      body: `csrf=${next}&pass_code=${encodeURIComponent(pass.token)}&clinic_id=${CLINIC}&action=preview&amount_minor=100000`,
    });
    assert.equal(shown.status, 200);
    assert.match(shown.body, /No community discount is applied/);
    assert.equal(shown.body.includes("Clinic A private note"), false);
    assert.equal(store.ledger.length, 0);
    server.close();
  });
});
