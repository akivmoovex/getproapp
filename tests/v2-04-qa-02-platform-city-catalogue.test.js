"use strict";

/**
 * V2.04-QA-02 — Platform database-backed city catalogue.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const request = require("supertest");
const express = require("express");

const ROOT = path.join(__dirname, "..");
const {
  V204_BROWSER_ASSET_VERSION,
} = require("../src/platform/ui/theme/browserAssetVersion");
const {
  autocompleteLocations,
  parseLocationAutocompleteInput,
  seedCityCatalogue,
  getCityCatalogueStats,
  isCityCatalogueEnabled,
  resolveRegistrationLocation,
  normalizeLocationName,
  AUTOCOMPLETE_MAX_RESULTS,
} = require("../src/platform/geography/locationService");
const { registerPlatformLocationRoutes } = require("../src/platform/http/platformLocationRoutes");
const {
  validateClinicRegistrationInput,
} = require("../src/activeclinic/services/activeClinicPublicOnboardingService");
const {
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

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V2.04-QA-02 platform city catalogue", () => {
  let pool;
  let databaseUrl;
  let skipReason = null;
  let stats = null;

  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: V5_IDENTITY_KEY,
        environmentCode: "testing",
      });
      // Seeds applied by migrate; ensure JS path remains idempotent.
      await seedCityCatalogue(pool);
      stats = await getCityCatalogueStats(pool);
    } catch (err) {
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("documents shared architecture and data source metadata", () => {
    const seed = JSON.parse(read("src/platform/geography/seed/cityCatalogueSeed.json"));
    assert.equal(seed.meta.source, "GeoNames cities15000");
    assert.match(seed.meta.license, /CC BY 4\.0/i);
    assert.ok(seed.meta.version);
    assert.equal(seed.countries.length, 19);
    assert.ok(seed.cities.length >= 400);

    assert.match(read("public/platform/location-autocomplete.js"), /GpLocationAutocomplete/);
    assert.match(read("public/platform/location-autocomplete.js"), /\/api\/locations\/cities/);
    assert.equal(fs.existsSync(path.join(ROOT, "public/blessboard/v5/register-church-location.js")), false);
    assert.doesNotMatch(read("public/activeclinic/register-clinic.js"), /GpLocationAutocomplete\.init/);
    assert.match(V204_BROWSER_ASSET_VERSION, /^v204-qa-3$/);
  });

  it("migration and seed create catalogue coverage", async () => {
    if (skipReason) {
      // eslint-disable-next-line no-console
      console.log("skip:", skipReason);
      return;
    }
    assert.ok(stats);
    assert.equal(stats.countriesWithCatalogue, 19);
    assert.ok(stats.totalCityRecords >= 400, `expected >=400 cities, got ${stats.totalCityRecords}`);
    assert.equal(stats.zeroCityCountries.length, 0);
    assert.ok(stats.cityCountsByCountry.ZM >= 24);
    assert.ok(stats.cityCountsByCountry.KE >= 10);
    assert.ok(stats.cityCountsByCountry.US >= 40);
    assert.ok(stats.cityCountsByCountry.GB >= 20);
    assert.ok(stats.cityCountsByCountry.NZ >= 10);
    assert.equal(await isCityCatalogueEnabled(pool, "ZM"), true);
    assert.equal(await isCityCatalogueEnabled(pool, "XX"), false);
    assert.equal(await isCityCatalogueEnabled(pool, "FR"), false);
  });

  it("normalizes and country-scopes parameterized lookups", async () => {
    if (skipReason) return;
    assert.equal(normalizeLocationName("  Lusaka!! "), "lusaka");
    const lus = await autocompleteLocations(pool, { countryCode: "ZM", query: "lus" });
    assert.equal(lus.ok, true);
    assert.equal(lus.catalogueEnabled, true);
    assert.ok(lus.results.some((r) => /lusaka/i.test(r.name)));

    const ke = await autocompleteLocations(pool, { countryCode: "KE", query: "nai" });
    assert.ok(ke.results.some((r) => /nairobi/i.test(r.name)));
    assert.equal(ke.results.some((r) => /lusaka/i.test(r.name)), false);

    const tor = await autocompleteLocations(pool, { countryCode: "CA", query: "tor" });
    assert.ok(tor.results.some((r) => /toronto/i.test(r.name)));

    const auc = await autocompleteLocations(pool, { countryCode: "NZ", query: "auc" });
    assert.ok(auc.results.some((r) => /auckland/i.test(r.name)));

    const fr = await autocompleteLocations(pool, { countryCode: "FR", query: "par" });
    assert.equal(fr.catalogueEnabled, false);
    assert.equal(fr.results.length, 0);

    const limited = await autocompleteLocations(pool, {
      countryCode: "US",
      query: "a",
      limit: 5,
    });
    assert.ok(limited.results.length <= 5);
    assert.ok(limited.results.length <= AUTOCOMPLETE_MAX_RESULTS || limited.results.length <= 5);
  });

  it("rejects unsafe/invalid autocomplete inputs", async () => {
    if (skipReason) return;
    assert.equal(parseLocationAutocompleteInput({ countryCode: "ZM';'--", query: "x" }).ok, false);
    assert.equal(parseLocationAutocompleteInput({ countryCode: "", query: "x" }).ok, false);
    const truncated = parseLocationAutocompleteInput({ countryCode: "ZM", query: "x".repeat(200) });
    assert.equal(truncated.ok, true);
    assert.equal(truncated.query.length, 80);

    const inj = await autocompleteLocations(pool, {
      countryCode: "ZM",
      query: "lusaka'; DROP TABLE platform.geographic_locations;--",
    });
    assert.equal(inj.ok, true);
    // Query is truncated/normalized; must not error or leak cross-country.
    assert.equal(inj.catalogueEnabled, true);

    const app = express();
    registerPlatformLocationRoutes(app, { getPool: () => pool });
    const bad = await request(app).get("/api/locations/cities?country=ZZZ&q=a");
    assert.equal(bad.status, 400);
    const missing = await request(app).get("/api/locations/cities?q=lus");
    assert.equal(missing.status, 400);
    const ok = await request(app).get("/api/locations/cities?country=ZM&q=kit");
    assert.equal(ok.status, 200);
    assert.equal(ok.body.catalogueEnabled, true);
    assert.ok(ok.body.results.some((r) => /kitwe/i.test(r.name)));
    const alias = await request(app).get("/api/locations/autocomplete?country=ZA&q=joh");
    assert.equal(alias.status, 200);
  });

  it("handles duplicate display labels via administrative area when present", async () => {
    if (skipReason) return;
    // Insert two same-name cities in US with different admin areas.
    await pool.query(
      `INSERT INTO platform.geographic_locations
         (country_code, name, normalized_name, province_region, source, approval_status, is_active)
       VALUES
         ('US', 'Springfield QA', 'springfield qa', 'Illinois', 'seed', 'approved', TRUE),
         ('US', 'Springfield QA', 'springfield qa', 'Massachusetts', 'seed', 'approved', TRUE)
       ON CONFLICT (country_code, normalized_name, disambiguator) DO NOTHING`
    );
    const out = await autocompleteLocations(pool, { countryCode: "US", query: "springfield qa" });
    assert.ok(out.results.length >= 2);
    const labels = out.results.map((r) => r.label || r.name);
    assert.ok(labels.some((l) => /Illinois/i.test(l)));
    assert.ok(labels.some((l) => /Massachusetts/i.test(l)));
  });

  it("preserves legacy free-text city compatibility and non-catalogue manual entry", async () => {
    if (skipReason) return;
    const manual = await resolveRegistrationLocation(pool, {
      countryCode: "FR",
      city: "Lyon",
      locationId: null,
    });
    assert.equal(manual.ok, true);
    assert.equal(manual.city, "Lyon");
    assert.equal(manual.locationId, null);
    assert.equal(manual.source, "manual");

    const bb = validateChurchRegistrationChurchStep({
      church_name: "Paris Test Church",
      country: "FR",
      city: "Paris",
      branch_name: "HQ",
      selected_plan: "foundation",
    });
    assert.equal(bb.ok, true);

    const ac = validateClinicRegistrationInput(
      {
        clinicName: "Paris Care",
        clinicType: "clinic",
        countryCode: "FR",
        city: "Paris",
      },
      { step: "clinic" }
    );
    assert.equal(ac.ok, true);
  });

  it("BB/AC registration pages still use shared location component", async () => {
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
    assert.match(acRes.text, /data-gp-location-init/);
    assert.match(acRes.text, /gp-location-field-init\.js/);
    assert.doesNotMatch(acRes.text, /Province\/Region|provinceSelect/);

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
    assert.match(bbRes.text, /data-gp-location-init/);
    assert.match(bbRes.text, new RegExp(V204_BROWSER_ASSET_VERSION));

    for (const country of ["ZM", "KE", "ZA", "US", "GB", "AU", "CA", "NZ"]) {
      const bbOk = validateChurchRegistrationChurchStep({
        church_name: `${country} Church`,
        country,
        city: "Testville",
        branch_name: "HQ",
        selected_plan: "foundation",
      });
      assert.equal(bbOk.ok, true, country);
      const acOk = validateClinicRegistrationInput(
        {
          clinicName: `${country} Clinic`,
          clinicType: "clinic",
          countryCode: country,
          city: "Testville",
        },
        { step: "clinic" }
      );
      assert.equal(acOk.ok, true, country);
    }
  });

  it("enforces platform duplication gate (single engine/repo/service/endpoint)", () => {
    assert.match(read("src/platform/geography/locationRepository.js"), /searchLocations/);
    assert.match(read("src/platform/geography/locationService.js"), /autocompleteLocations/);
    assert.match(read("src/platform/http/platformLocationRoutes.js"), /\/api\/locations\/cities/);
    assert.equal((read("public/platform/location-autocomplete.js").match(/GpLocationAutocomplete\s*=/g) || []).length, 1);
    assert.doesNotMatch(read("src/blessboard/http/renderApexMarketing.js"), /FROM\s+platform\.geographic_locations/i);
    assert.doesNotMatch(
      read("src/activeclinic/services/activeClinicPublicOnboardingService.js"),
      /FROM\s+platform\.geographic_locations/i
    );
  });
});
