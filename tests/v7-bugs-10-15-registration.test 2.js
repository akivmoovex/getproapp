"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  storeRegistrationPasswordVault,
  readRegistrationPasswordVault,
  clearRegistrationPasswordVault,
  mergeRegistrationBodyWithPasswordVault,
} = require("../src/platform/registration/registrationPasswordVault");
const {
  resolveRegistrationTransactionForGet,
  clearRegistrationTransaction,
  mergeRegistrationBodyForValidation,
} = require("../src/platform/registration/registrationTransaction");
const { PRODUCT } = require("../src/platform/registration/constants");
const { sanitizeRegistrationDraftFormData } = require("../src/platform/registration/registrationDraftLifecycle");
const { registerPlatformLocationRoutes } = require("../src/platform/http/platformLocationRoutes");
const { buildBlessBoardRegistrationWebsitePreview } = require("../src/platform/registration/registrationSlugPreview");
const { resolveBaseBranchKey } = require("../src/blessboard/services/branchKey");
const { publicBranchHomePath } = require("../src/blessboard/urls/churchUrlHelper");
const { createApexMarketingRouter } = require("../src/blessboard/http/apexMarketingRoutes");
const express = require("express");
const request = require("supertest");

const ENV = { SESSION_SECRET: "test-session-secret-at-least-32-chars-long" };

function mockRes() {
  const res = {
    headers: {},
    append(name, value) {
      const key = String(name).toLowerCase();
      this.headers[key] = this.headers[key] || [];
      this.headers[key].push(value);
    },
  };
  return res;
}

function cookieHeaderFromRes(res, name) {
  const list = res.headers["set-cookie"] || [];
  const hit = list.find((line) => String(line).startsWith(`${name}=`));
  if (!hit) return "";
  return hit.split(";")[0];
}

describe("V7 registration bugs 10–15", () => {
  it("BUG 15: password vault stores encrypted httpOnly cookie and merges on confirm", () => {
    const res = mockRes();
    storeRegistrationPasswordVault(
      res,
      ENV,
      { password: "valid-password-10", password_confirm: "valid-password-10" },
      { productCode: PRODUCT.BLESSBOARD, isProduction: false }
    );
    const cookie = cookieHeaderFromRes(res, "bb_reg_pwd");
    assert.match(cookie, /^bb_reg_pwd=/);

    const req = { headers: { cookie }, cookies: {} };
    const vault = readRegistrationPasswordVault(req, ENV, PRODUCT.BLESSBOARD);
    assert.equal(vault.password, "valid-password-10");
    assert.equal(vault.password_confirm, "valid-password-10");

    const merged = mergeRegistrationBodyWithPasswordVault(req, ENV, PRODUCT.BLESSBOARD, {
      church_name: "Grace Community Church",
    });
    assert.equal(merged.password, "valid-password-10");
    assert.equal(merged.password_confirm, "valid-password-10");
  });

  it("BUG 15: draft sanitizer strips passwords but vault preserves active transaction", () => {
    const sanitized = sanitizeRegistrationDraftFormData({
      church_name: "Grace",
      password: "valid-password-10",
      password_confirm: "valid-password-10",
      passwordConfirm: "valid-password-10",
    });
    assert.equal(sanitized.church_name, "Grace");
    assert.equal(sanitized.password, undefined);
    assert.equal(sanitized.password_confirm, undefined);
    assert.equal(sanitized.passwordConfirm, undefined);
  });

  it("BUG 12: fresh GET clears password vault; gpRegNav preserves transaction", () => {
    let clearedDraft = false;
    let clearedVault = false;
    const res = mockRes();
    const readDraft = () => ({ formData: { clinicName: "Draft Clinic" } });
    const clearDraft = () => {
      clearedDraft = true;
    };

    resolveRegistrationTransactionForGet({
      req: { query: {} },
      res,
      isProduction: false,
      clearDraft,
      readDraft,
      env: ENV,
      productCode: PRODUCT.ACTIVECLINIC,
    });
    clearedVault = (res.headers["set-cookie"] || []).some((line) =>
      String(line).startsWith("ac_reg_pwd=;")
    );

    assert.equal(clearedDraft, true);
    assert.equal(clearedVault, true);

    clearedVault = false;
    const res2 = mockRes();
    resolveRegistrationTransactionForGet({
      req: { query: { gpRegNav: "1" } },
      res: res2,
      isProduction: false,
      clearDraft,
      readDraft,
      env: ENV,
      productCode: PRODUCT.ACTIVECLINIC,
    });
    const gpNavVaultClear = (res2.headers["set-cookie"] || []).some((line) =>
      String(line).startsWith("ac_reg_pwd=;")
    );
    assert.equal(gpNavVaultClear, false);
  });

  it("BUG 10: BlessBoard apex router mounts shared /api/locations/autocomplete", async () => {
    const router = createApexMarketingRouter({
      getPool: () => ({
        query: async () => ({ rows: [{ id: 1, display_name: "Lusaka", province_region: "Lusaka" }] }),
      }),
      isApexHost: () => true,
      env: ENV,
      isProduction: false,
    });
    const app = express();
    app.use(router);
    const res = await request(app).get("/api/locations/autocomplete?country=ZM&q=L");
    assert.notEqual(res.status, 404);
    assert.doesNotMatch(String(res.text || ""), /not yet available/i);
  });

  it("BUG 11: registration website preview uses /c/:org/:branch canonical path", () => {
    const preview = buildBlessBoardRegistrationWebsitePreview({
      churchName: "Grace Community Church",
      branchName: "Lusaka Central",
      origin: "https://blessboard.pronline.org",
    });
    assert.equal(preview.publicPath, "/c/grace-community-church/lusaka-central");
    assert.equal(
      preview.publicUrl,
      "https://blessboard.pronline.org/c/grace-community-church/lusaka-central"
    );
    assert.equal(
      publicBranchHomePath("grace-community-church", "lusaka-central"),
      "/c/grace-community-church/lusaka-central"
    );
  });

  it("BUG 11: branch key derives from branch display name for provisioning preview", () => {
    const branch = resolveBaseBranchKey("Lusaka Central");
    assert.equal(branch.ok, true);
    assert.equal(branch.key, "lusaka-central");
  });

  it("BUG 13–14: shared password UX assets expose confirm match + grid layout", () => {
    const css = fs.readFileSync(
      path.join(__dirname, "../public/platform/registration-ux.css"),
      "utf8"
    );
    assert.match(css, /bb-apex-register-form__grid--password/);
    assert.match(css, /gp-registration-password-confirm-status/);

    const js = fs.readFileSync(
      path.join(__dirname, "../public/platform/registration-password-rules.js"),
      "utf8"
    );
    assert.match(js, /confirmInput/);
    assert.match(js, /Passwords match/);

    const bbTemplate = fs.readFileSync(
      path.join(__dirname, "../views/blessboard/v5/apex/register-church.ejs"),
      "utf8"
    );
    assert.match(bbTemplate, /bb-apex-register-form__grid--password/);
    assert.match(bbTemplate, /password-confirm-status/);
    assert.doesNotMatch(
      fs.readFileSync(
        path.join(__dirname, "../views/activeclinic/partials/register-clinic-hidden-fields.ejs"),
        "utf8"
      ),
      /name="password"/
    );
  });

  it("BUG 10: shared location route registrar is reusable", async () => {
    const app = express();
    registerPlatformLocationRoutes(app, {
      getPool: () => ({ query: async () => ({ rows: [] }) }),
    });
    const res = await request(app).get("/api/locations/autocomplete?country=ZM&q=L");
    assert.notEqual(res.status, 404);
  });

  it("clearRegistrationTransaction clears draft and vault together", () => {
    let draftCleared = false;
    const res = mockRes();
    clearRegistrationTransaction(res, {
      isProduction: false,
      productCode: PRODUCT.BLESSBOARD,
      clearDraft: () => {
        draftCleared = true;
      },
    });
    const vaultCleared = (res.headers["set-cookie"] || []).some((line) =>
      String(line).startsWith("bb_reg_pwd=;")
    );
    assert.equal(draftCleared, true);
    assert.equal(vaultCleared, true);
  });
});
