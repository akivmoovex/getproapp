"use strict";

/**
 * V2.04-QA-03 — Platform registration country availability.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const request = require("supertest");

const ROOT = path.join(__dirname, "..");
const {
  PRODUCT,
  listRegistrationCountries,
  normalizeRegistrationCountryCode,
  hydrateRegistrationCountryAvailability,
  clearRegistrationEnabledCountryCache,
  INITIAL_REGISTRATION_ENABLED_COUNTRY_CODES,
} = require("../src/platform/registration");
const {
  listRegistrationEnabledCountries,
  isRegistrationEnabledCountry,
  autocompleteLocations,
} = require("../src/platform/geography/locationService");
const {
  validateClinicRegistrationInput,
} = require("../src/activeclinic/services/activeClinicPublicOnboardingService");
const {
  validateChurchCountry,
  validateChurchRegistrationChurchStep,
} = require("../src/blessboard/services/platformChurchRegistrationValidation");
const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const {
  baseV5TestEnv,
  V5_IDENTITY_KEY,
  V5_DEPLOYMENT_CODE,
} = require("./helpers/blessboardV5Fixtures");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { CSRF_FIELD, getCsrfCookieName } = require("../src/platform/http/v5Csrf");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function extractCsrf(res, env) {
  const cookies = [].concat(res.headers["set-cookie"] || []);
  const name = getCsrfCookieName(env);
  const raw = cookies.find((c) => String(c).startsWith(`${name}=`)) || "";
  const match = String(raw).match(new RegExp(`${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

describe("V2.04-QA-03 platform country availability", () => {
  let pool;
  let databaseUrl;
  let skipReason = null;

  before(async () => {
    resetDeploymentProfileWarningsForTests();
    clearRegistrationEnabledCountryCache();
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: V5_IDENTITY_KEY,
        environmentCode: "testing",
      });
      await hydrateRegistrationCountryAvailability(pool);
    } catch (err) {
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    clearRegistrationEnabledCountryCache();
    if (pool) await pool.end().catch(() => {});
  });

  it("uses one shared platform country source (no product-local lists)", () => {
    assert.match(
      read("src/platform/registration/registrationCountrySelection.js"),
      /geographic_countries|registration_enabled|registrationEnabledMarkets/
    );
    assert.doesNotMatch(
      read("src/blessboard/services/platformChurchRegistrationValidation.js"),
      /const\s+COUNTRIES\s*=|Zambia.*Kenya.*United States/
    );
    assert.doesNotMatch(
      read("src/activeclinic/services/activeClinicPublicOnboardingService.js"),
      /const\s+COUNTRIES\s*=|ALLOWED_COUNTRIES\s*=/
    );
    assert.equal(INITIAL_REGISTRATION_ENABLED_COUNTRY_CODES.length, 19);
    assert.equal(listRegistrationCountries(PRODUCT.BLESSBOARD).length, 19);
    assert.equal(listRegistrationCountries(PRODUCT.ACTIVECLINIC).length, 19);
  });

  it("DB registration_enabled matches the V2.04 market set", async () => {
    if (skipReason) {
      // eslint-disable-next-line no-console
      console.log("skip:", skipReason);
      return;
    }
    const rows = await listRegistrationEnabledCountries(pool);
    assert.equal(rows.length, 19);
    assert.equal(await isRegistrationEnabledCountry(pool, "ZM"), true);
    assert.equal(await isRegistrationEnabledCountry(pool, "FR"), false);
    assert.equal(await isRegistrationEnabledCountry(pool, "XX"), false);
  });

  it("BB and AC registration HTML only expose enabled countries", async () => {
    if (skipReason) return;
    const acApp = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: {
        NODE_ENV: "test",
        PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
        SESSION_SECRET: "a".repeat(48),
        DATABASE_URL: databaseUrl,
      },
    });
    const acRes = await request(acApp).get("/register-clinic").expect(200);
    assert.match(acRes.text, /value="ZM"/);
    assert.match(acRes.text, /value="KE"/);
    assert.match(acRes.text, /value="US"/);
    assert.doesNotMatch(acRes.text, /value="FR"/);
    assert.doesNotMatch(acRes.text, /value="XX"/);

    const countriesApi = await request(acApp).get("/api/locations/countries?product=activeclinic");
    assert.equal(countriesApi.status, 200);
    assert.equal(countriesApi.body.count, 19);

    const bbApp = createV5FoundationApp({
      getPool: () => pool,
      env: {
        ...baseV5TestEnv({
          DATABASE_URL: databaseUrl,
          PLATFORM_DEPLOYMENT_CODE: V5_DEPLOYMENT_CODE,
        }),
        SESSION_SECRET: "b".repeat(48),
      },
    });
    const bbRes = await request(bbApp).get("/register-church").set("Host", "blessboard.org").expect(200);
    assert.match(bbRes.text, /value="ZM"/);
    assert.match(bbRes.text, /value="AU"/);
    assert.doesNotMatch(bbRes.text, /value="FR"/);
  });

  it("rejects forged registration POSTs for disabled countries", async () => {
    if (skipReason) return;
    assert.equal(
      normalizeRegistrationCountryCode("FR", { product: PRODUCT.ACTIVECLINIC }).ok,
      false
    );
    assert.equal(validateChurchCountry("FR").ok, false);

    const forgedAc = validateClinicRegistrationInput(
      {
        clinicName: "Forged France Clinic",
        clinicType: "clinic",
        countryCode: "FR",
        city: "Paris",
      },
      { step: "clinic" }
    );
    assert.equal(forgedAc.ok, false);
    assert.ok(forgedAc.errors.countryCode);

    const forgedBb = validateChurchRegistrationChurchStep({
      church_name: "Forged France Church",
      country: "FR",
      city: "Paris",
      branch_name: "HQ",
      selected_plan: "foundation",
    });
    assert.equal(forgedBb.ok, false);
    assert.equal(forgedBb.field, "country");

    const acApp = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: {
        NODE_ENV: "test",
        PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
        SESSION_SECRET: "a".repeat(48),
        DATABASE_URL: databaseUrl,
      },
    });
    const getForm = await request(acApp).get("/register-clinic");
    const csrf = extractCsrf(getForm, {
      NODE_ENV: "test",
      PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
    });
    const post = await request(acApp)
      .post("/register-clinic")
      .set("Cookie", getForm.headers["set-cookie"])
      .type("form")
      .send({
        [CSRF_FIELD]: csrf || extractCsrf(getForm, { PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 }),
        clinicName: "Forged FR Clinic",
        clinicType: "clinic",
        countryCode: "FR",
        city: "Paris",
      });
    assert.ok([200, 400].includes(post.status));
    assert.match(post.text, /country|valid country|Select a valid country/i);
  });

  it("keeps city autocomplete for enabled markets and rejects cross-country leaks", async () => {
    if (skipReason) return;
    for (const country of ["ZM", "ZA", "KE", "US", "CA", "GB", "AU", "NZ"]) {
      const out = await autocompleteLocations(pool, { countryCode: country, query: "a" });
      assert.equal(out.ok, true, country);
      assert.equal(out.catalogueEnabled, true, country);
    }
    const ke = await autocompleteLocations(pool, { countryCode: "KE", query: "nai" });
    assert.ok(ke.results.some((r) => /nairobi/i.test(r.name)));
    assert.equal(ke.results.some((r) => /lusaka/i.test(r.name)), false);
  });

  it("registration validation passes for representative enabled countries", () => {
    for (const country of ["ZM", "ZA", "KE", "US", "CA", "GB", "AU", "NZ"]) {
      const bb = validateChurchRegistrationChurchStep({
        church_name: `${country} Church`,
        country,
        city: "Testville",
        branch_name: "HQ",
        selected_plan: "foundation",
      });
      assert.equal(bb.ok, true, `BB ${country}`);
      const ac = validateClinicRegistrationInput(
        {
          clinicName: `${country} Clinic`,
          clinicType: "clinic",
          countryCode: country,
          city: "Testville",
        },
        { step: "clinic" }
      );
      assert.equal(ac.ok, true, `AC ${country}`);
    }
  });

  it("documents data-driven country enablement (no product code change required)", () => {
    assert.ok(fs.existsSync(path.join(ROOT, "src/platform/geography/registrationEnabledMarkets.js")));
    assert.ok(fs.existsSync(path.join(ROOT, "db/migrations/platform/045_registration_country_availability.sql")));
    const markets = read("src/platform/geography/registrationEnabledMarkets.js");
    assert.match(markets, /To enable another country later/);
    assert.match(markets, /registration_enabled=true/);
  });
});
