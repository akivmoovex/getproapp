"use strict";

/**
 * V2.04-QA-01 — Shared registration location (Country + City autocomplete).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const request = require("supertest");

const ROOT = path.join(__dirname, "..");
const {
  V204_BROWSER_ASSET_VERSION,
} = require("../src/platform/ui/theme/browserAssetVersion");
const {
  isProvinceRegionVisibleInRegistration,
  isProvinceRegionRequiredInRegistration,
  REGISTRATION_VISIBLE_LOCATION_FIELDS,
  registrationLocation,
  PRODUCT,
  usesZambiaProvinceSelect,
} = require("../src/platform/registration");
const {
  parseLocationAutocompleteInput,
  autocompleteLocations,
  resolveRegistrationLocation,
  validateProvinceForCountry,
} = require("../src/platform/geography/locationService");
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
const {
  createV5FoundationApp,
} = require("../src/platform/http/v5FoundationServer");
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

function countMatches(src, re) {
  return (String(src).match(re) || []).length;
}

describe("V2.04-QA-01 shared registration location", () => {
  let pool;
  let databaseUrl;
  let skipReason = null;

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
    } catch (err) {
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("documents registration location contract and hides province in registration", () => {
    assert.deepEqual(REGISTRATION_VISIBLE_LOCATION_FIELDS, ["country", "city"]);
    assert.equal(isProvinceRegionVisibleInRegistration(), false);
    assert.equal(isProvinceRegionRequiredInRegistration(), false);
    assert.equal(usesZambiaProvinceSelect(PRODUCT.ACTIVECLINIC, "ZM"), false);
    assert.equal(usesZambiaProvinceSelect(PRODUCT.BLESSBOARD, "ZM"), false);
    assert.equal(typeof registrationLocation.resolveRegistrationLocation, "function");
    assert.equal(typeof registrationLocation.autocompleteLocations, "function");
  });

  it("keeps a single shared city autocomplete engine (no product engines)", () => {
    const engine = read("public/platform/location-autocomplete.js");
    assert.match(engine, /GpLocationAutocomplete/);
    assert.match(engine, /clearCityOnCountryChange|invalidateCityForCountryChange/);
    assert.doesNotMatch(engine, /acw-location-option/);
    assert.doesNotMatch(engine, /#6[cC]5[cC][eE]7|#006068/);

    assert.equal(fs.existsSync(path.join(ROOT, "public/blessboard/v5/register-church-location.js")), false);

    const acInit = read("public/activeclinic/register-clinic.js");
    assert.doesNotMatch(acInit, /GpLocationAutocomplete\.init/);
    assert.doesNotMatch(acInit, /fetch\s*\(\s*["']\/api\/locations\/autocomplete/);

    const bbEngineCount = countMatches(
      engine + read("public/platform/gp-location-field-init.js"),
      /GpLocationAutocomplete\s*=/
    );
    assert.equal(bbEngineCount, 1);

    const acCss = read("public/activeclinic/acw-platform.css");
    assert.doesNotMatch(acCss, /\.acw-location-listbox\s*\{/);
    assert.doesNotMatch(acCss, /\.acw-location-option\s*\{/);

    const sharedCss = read("public/platform/location-autocomplete.css");
    assert.doesNotMatch(sharedCss, /#6[cC]5[cC][eE]7|#006068/);
    assert.match(sharedCss, /--color-brand-primary-light|--color-link|--card-bg/);
  });

  it("BB and AC registration templates consume the shared gp-location field", () => {
    const bb = read("views/blessboard/v5/apex/register-church.ejs");
    assert.match(bb, /gp-location-field/);
    assert.match(bb, /register_country/);
    assert.match(bb, /register_city/);
    assert.doesNotMatch(bb, /Province\s*\/\s*Region|provinceSelect/);

    const ac = read("views/activeclinic/public/register-clinic.ejs");
    assert.match(ac, /gp-location-field/);
    assert.match(ac, /include\(['"]\.\.\/\.\.\/platform\/partials\/gp-location-field/);
    assert.match(ac, /countryCode/);
    assert.match(ac, /gp-location-field-init\.js/);
    assert.doesNotMatch(ac, /provinceSelect|data-ac-province-field|Province\/Region/);
    assert.doesNotMatch(ac, /data-ac-city-listbox|acw-location-listbox/);

    const partial = read("views/platform/partials/gp-location-field.ejs");
    assert.match(partial, /data-gp-location-init="1"/);
    assert.match(partial, /data-gp-location-clear-on-country="1"/);
  });

  it("wires location assets through V204_BROWSER_ASSET_VERSION", () => {
    assert.match(V204_BROWSER_ASSET_VERSION, /^v204-/);
    const bbStart = read("views/blessboard/v5/partials/apex-shell-start.ejs");
    const bbEnd = read("views/blessboard/v5/partials/apex-shell-end.ejs");
    assert.match(bbStart, /location-autocomplete\.css\?v=<%= bbAssetV %>/);
    assert.match(bbEnd, /location-autocomplete\.js\?v=<%= bbAssetVEnd %>/);
    assert.match(bbEnd, /gp-location-field-init\.js\?v=<%= bbAssetVEnd %>/);
    assert.doesNotMatch(bbEnd, /register-church-location\.js/);

    const acShell = read("views/activeclinic/layouts/public-shell.ejs");
    assert.match(acShell, /location-autocomplete\.css\?v=<%= assetVersion %>/);
    const acReg = read("views/activeclinic/public/register-clinic.ejs");
    assert.match(acReg, /location-autocomplete\.js\?v=<%= typeof assetVersion/);
    assert.doesNotMatch(acReg, /location-autocomplete\.js\?v=1"/);
  });

  it("validates Country + City without requiring province for BB and AC", () => {
    const bbOk = validateChurchRegistrationChurchStep({
      church_name: "Grace Chapel QA",
      country: "ZM",
      city: "Lusaka",
      branch_name: "HQ",
      selected_plan: "foundation",
    });
    assert.equal(bbOk.ok, true, bbOk.error || "bb ok");

    const bbMissingCity = validateChurchRegistrationChurchStep({
      church_name: "Grace Chapel QA",
      country: "ZM",
      city: "",
      branch_name: "HQ",
      selected_plan: "foundation",
    });
    assert.equal(bbMissingCity.ok, false);
    assert.equal(bbMissingCity.field, "city");

    const acOk = validateClinicRegistrationInput(
      {
        clinicName: "Lusaka Care Clinic",
        clinicType: "clinic",
        countryCode: "ZM",
        city: "Lusaka",
      },
      { step: "clinic" }
    );
    assert.equal(acOk.ok, true);
    assert.equal(acOk.normalized.province, null);
    assert.equal(acOk.normalized.city, "Lusaka");

    const acNoProvince = validateClinicRegistrationInput(
      {
        clinicName: "Kitwe Care",
        clinicType: "clinic",
        countryCode: "ZM",
        city: "Kitwe",
        province: "",
      },
      { step: "clinic" }
    );
    assert.equal(acNoProvince.ok, true);

    const acMissingCity = validateClinicRegistrationInput(
      {
        clinicName: "No City Clinic",
        clinicType: "clinic",
        countryCode: "ZM",
      },
      { step: "clinic" }
    );
    assert.equal(acMissingCity.ok, false);
    assert.ok(acMissingCity.errors.city);

    const acMissingCountry = validateClinicRegistrationInput(
      {
        clinicName: "No Country Clinic",
        clinicType: "clinic",
        countryCode: "",
        city: "Lusaka",
      },
      { step: "clinic" }
    );
    assert.equal(acMissingCountry.ok, false);
    assert.ok(acMissingCountry.errors.countryCode);

    // Invalid province still rejected when supplied; empty is fine.
    assert.equal(validateProvinceForCountry("ZM", "").ok, true);
    assert.equal(validateProvinceForCountry("ZM", "NotAProvince").ok, false);
  });

  it("country-aware autocomplete and locationId resolution (Zambia)", async () => {
    if (skipReason) {
      // eslint-disable-next-line no-console
      console.log("skip:", skipReason);
      return;
    }

    const parsedBad = parseLocationAutocompleteInput({ countryCode: "ZZZ", query: "Lu" });
    assert.equal(parsedBad.ok, false);

    const zm = await autocompleteLocations(pool, { countryCode: "ZM", query: "Lus" });
    assert.equal(zm.ok, true);
    assert.ok(zm.results.some((r) => /lusaka/i.test(r.name)));

    const ke = await autocompleteLocations(pool, { countryCode: "KE", query: "Lus" });
    assert.equal(ke.ok, true);
    assert.equal(
      ke.results.some((r) => /lusaka/i.test(r.name)),
      false,
      "Zambia city must not appear under Kenya"
    );

    const lusaka = zm.results.find((r) => /lusaka/i.test(r.name));
    assert.ok(lusaka && lusaka.id);

    const resolved = await resolveRegistrationLocation(pool, {
      countryCode: "ZM",
      locationId: lusaka.id,
      city: "Wrong",
    });
    assert.equal(resolved.ok, true);
    assert.match(resolved.city, /Lusaka/i);

    const wrongCountry = await resolveRegistrationLocation(pool, {
      countryCode: "KE",
      locationId: lusaka.id,
      city: "Lusaka",
    });
    assert.equal(wrongCountry.ok, false);
  });

  it("serves BB and AC registration HTML with shared location markup", async () => {
    if (skipReason) {
      // eslint-disable-next-line no-console
      console.log("skip:", skipReason);
      return;
    }

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
    assert.match(acRes.text, /location-autocomplete\.js\?v=/);
    assert.match(acRes.text, /gp-location-field-init\.js\?v=/);
    assert.match(acRes.text, new RegExp(V204_BROWSER_ASSET_VERSION));
    assert.doesNotMatch(acRes.text, /provinceSelect|Province\/Region/);
    assert.match(acRes.text, /name="countryCode"/);
    assert.match(acRes.text, /name="city"/);

    const bbEnv = {
      ...baseV5TestEnv({
        DATABASE_URL: databaseUrl,
        PLATFORM_DEPLOYMENT_CODE: V5_DEPLOYMENT_CODE,
      }),
      SESSION_SECRET: "b".repeat(48),
    };
    const bbApp = createV5FoundationApp({
      getPool: () => pool,
      env: bbEnv,
    });
    const bbRes = await request(bbApp)
      .get("/register-church")
      .set("Host", "blessboard.org")
      .expect(200);
    assert.match(bbRes.text, /data-gp-location-init/);
    assert.match(bbRes.text, /id="register_country"/);
    assert.match(bbRes.text, /id="register_city"/);
    assert.match(bbRes.text, /location-autocomplete\.js\?v=/);
    assert.match(bbRes.text, /gp-location-field-init\.js\?v=/);
    assert.doesNotMatch(bbRes.text, /register-church-location\.js/);
  });

  it("shared JS clears city when country changes (source contract)", () => {
    const js = read("public/platform/location-autocomplete.js");
    assert.match(js, /country\.addEventListener\("change"/);
    assert.match(js, /clearCitySelection|invalidateCityForCountryChange/);
    assert.match(js, /aria-activedescendant|aria-expanded|role=['"]option['"]/);
  });
});
