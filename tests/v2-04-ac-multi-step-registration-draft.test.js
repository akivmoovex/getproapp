"use strict";

/**
 * AC clinic registration multi-step draft persistence (platform form state).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD } = require("../src/platform/http/v5Csrf");

let pool;
let databaseUrl;
let skipReason = null;

function extractFormCsrf(html) {
  const m = String(html).match(/name="_csrf"[^>]*value="([^"]+)"/);
  return m ? m[1] : "";
}

function joinCookies(...responses) {
  const parts = [];
  for (const res of responses) {
    const raw = res && res.headers && res.headers["set-cookie"];
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const line of list) {
      parts.push(String(line).split(";")[0]);
    }
  }
  return parts.join("; ");
}

describe("AC multi-step registration draft persistence", () => {
  const env = {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
    SESSION_SECRET: "a".repeat(48),
  };

  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  function makeApp() {
    return createActiveClinicFoundationApp({
      getPool: () => pool,
      env: { ...env, DATABASE_URL: databaseUrl },
    });
  }

  const basePayload = {
    clinicName: "Persist Clinic",
    clinicType: "clinic",
    countryCode: "ZM",
    province: "Lusaka",
    city: "Lusaka",
    address: "1 Independence Ave",
  };

  it("14 clinic Step 1 → Step 2 preserves fields (including refresh without gpRegNav)", async () => {
    requireDb();
    const application = makeApp();
    const s1 = await request(application).get("/register-clinic");
    const csrf1 = extractFormCsrf(s1.text);
    const payload = {
      ...basePayload,
      clinicName: "Kitwe Persist Clinic",
      city: "Kitwe",
      province: "Copperbelt",
      contactEmail: "persist-ac@example.invalid",
      contactPhone: "+260970000199",
    };
    const next = await request(application)
      .post("/register-clinic")
      .set("Cookie", joinCookies(s1))
      .type("form")
      .send({ ...payload, action: "next-clinic", [CSRF_FIELD]: csrf1 });
    assert.equal(next.status, 303);
    assert.match(String(next.headers.location || ""), /step=administrator/);
    assert.ok(joinCookies(s1, next).includes("ac_reg_draft="));

    const s2 = await request(application)
      .get(String(next.headers.location).replace(/^https?:\/\/[^/]+/, "") || next.headers.location)
      .set("Cookie", joinCookies(s1, next));
    assert.equal(s2.status, 200);
    assert.match(s2.text, /Kitwe Persist Clinic|Kitwe/);

    const refresh = await request(application)
      .get("/register-clinic?step=administrator")
      .set("Cookie", joinCookies(s1, next));
    assert.equal(refresh.status, 200);
    assert.match(refresh.text, /Kitwe Persist Clinic|Kitwe/);
  });

  it("15 review/completion preserves full draft fields", async () => {
    requireDb();
    const application = makeApp();
    const s1 = await request(application).get("/register-clinic");
    const csrf1 = extractFormCsrf(s1.text);
    const payload = {
      ...basePayload,
      clinicName: "Review Persist Clinic",
      city: "Ndola",
      province: "Copperbelt",
      contactEmail: "review-persist@example.invalid",
      contactPhone: "+260970000198",
      contactName: "Review Contact",
      password: "clinic-admin-pass-12",
      passwordConfirm: "clinic-admin-pass-12",
    };
    const nextClinic = await request(application)
      .post("/register-clinic")
      .set("Cookie", joinCookies(s1))
      .type("form")
      .send({ ...payload, action: "next-clinic", [CSRF_FIELD]: csrf1 });
    assert.equal(nextClinic.status, 303);

    const adminPage = await request(application)
      .get(String(nextClinic.headers.location).replace(/^https?:\/\/[^/]+/, "") || nextClinic.headers.location)
      .set("Cookie", joinCookies(s1, nextClinic));
    assert.equal(adminPage.status, 200);
    const csrf2 = extractFormCsrf(adminPage.text);

    const nextAdmin = await request(application)
      .post("/register-clinic")
      .set("Cookie", joinCookies(s1, nextClinic, adminPage))
      .type("form")
      .send({ ...payload, action: "next-admin", [CSRF_FIELD]: csrf2 });
    assert.equal(nextAdmin.status, 303);
    assert.match(String(nextAdmin.headers.location || ""), /step=review/);

    const review = await request(application)
      .get(String(nextAdmin.headers.location).replace(/^https?:\/\/[^/]+/, "") || nextAdmin.headers.location)
      .set("Cookie", joinCookies(s1, nextClinic, adminPage, nextAdmin));
    assert.equal(review.status, 200);
    assert.match(review.text, /Review Persist Clinic/);
    assert.match(review.text, /Ndola/);
    assert.match(review.text, /review-persist@example\.invalid|Review Contact/);
  });
});
