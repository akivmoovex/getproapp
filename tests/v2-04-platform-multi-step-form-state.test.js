"use strict";

/**
 * Focused tests for platform multi-step form draft state (V2.04 design).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const { mergeDraftFields } = require("../src/platform/registration/multiStepDraftMerge");
const {
  createSignedRegistrationDraftCookie,
} = require("../src/platform/registration/signedRegistrationDraftCookie");
const {
  resolveRegistrationDraftForGet,
  isRegistrationFreshStartRequest,
} = require("../src/platform/registration/registrationDraftLifecycle");
const { createMultiStepFormState } = require("../src/platform/forms/multiStepFormState");

const ENV = { SESSION_SECRET: "platform-form-state-secret-32chars-min!!" };

function mockRes() {
  const headers = [];
  return {
    headers,
    append(_name, value) {
      headers.push(["set-cookie", value]);
    },
  };
}

function cookieFromRes(res, name) {
  const line = res.headers.find(
    ([, v]) => String(v).startsWith(`${name}=`) && !String(v).includes("Max-Age=0")
  );
  if (!line) return null;
  const raw = String(line[1]).split(";")[0];
  const eq = raw.indexOf("=");
  return decodeURIComponent(raw.slice(eq + 1));
}

describe("platform multi-step form state", () => {
  it("1 merge Step 1 + Step 2", () => {
    const merged = mergeDraftFields({
      prior: { church_name: "Grace", city: "Lusaka", country: "ZM" },
      incoming: { contact_name: "Ada", email: "ada@example.org" },
      options: {
        fieldAllowlist: ["contact_name", "email"],
      },
    });
    assert.equal(merged.church_name, "Grace");
    assert.equal(merged.city, "Lusaka");
    assert.equal(merged.contact_name, "Ada");
    assert.equal(merged.email, "ada@example.org");
  });

  it("2 missing Step 1 fields in Step 2 POST do not clear them", () => {
    const merged = mergeDraftFields({
      prior: { clinicName: "Demo Clinic", city: "Ndola" },
      incoming: { contactName: "Bo", clinicName: "", city: "" },
      options: {
        fieldAllowlist: ["clinicName", "city", "contactName"],
      },
    });
    assert.equal(merged.clinicName, "Demo Clinic");
    assert.equal(merged.city, "Ndola");
    assert.equal(merged.contactName, "Bo");
  });

  it("3 explicit permitted edit does update them", () => {
    const merged = mergeDraftFields({
      prior: { clinicName: "Old", city: "Ndola" },
      incoming: { clinicName: "New Clinic" },
      options: { fieldAllowlist: ["clinicName", "city"] },
    });
    assert.equal(merged.clinicName, "New Clinic");
    assert.equal(merged.city, "Ndola");
  });

  it("4/5 refresh and back navigation hydrate without gpRegNav", () => {
    const draftApi = createSignedRegistrationDraftCookie({ cookieName: "test_ms_draft" });
    const resWrite = mockRes();
    draftApi.writeRegistrationDraft(
      resWrite,
      ENV,
      { church_name: "Hydrate Church", city: "Kitwe" },
      { isProduction: false, currentStep: "administrator" }
    );
    const cookie = cookieFromRes(resWrite, "test_ms_draft");
    assert.ok(cookie);

    const req = { headers: { cookie: `test_ms_draft=${encodeURIComponent(cookie)}` }, query: {} };
    const resGet = mockRes();
    let cleared = false;
    const resolved = resolveRegistrationDraftForGet({
      req,
      res: resGet,
      isProduction: false,
      clearDraft: () => {
        cleared = true;
      },
      readDraft: draftApi.readRegistrationDraft,
      env: ENV,
    });
    assert.equal(resolved.restoreDraft, true);
    assert.equal(resolved.formData.church_name, "Hydrate Church");
    assert.equal(cleared, false);
  });

  it("6 validation failure path keeps prior via merge (empty overlay skipped)", () => {
    const merged = mergeDraftFields({
      prior: { church_name: "Keep", organization_key: "keep-key" },
      incoming: { contact_name: "", email: "bad" },
      options: {
        fieldAllowlist: ["contact_name", "email"],
        protectedKeys: ["organization_key"],
      },
    });
    assert.equal(merged.church_name, "Keep");
    assert.equal(merged.organization_key, "keep-key");
    assert.equal(merged.email, "bad");
    assert.equal(merged.contact_name, undefined);
  });

  it("7 expired/invalid draft returns null", async () => {
    const draftApi = createSignedRegistrationDraftCookie({
      cookieName: "test_ms_exp2",
      maxAgeMs: 20,
    });
    const resWrite = mockRes();
    draftApi.writeRegistrationDraft(resWrite, ENV, { church_name: "Gone" }, { isProduction: false });
    const cookie = cookieFromRes(resWrite, "test_ms_exp2");
    await new Promise((r) => setTimeout(r, 30));
    const read = draftApi.readRegistrationDraft(
      { headers: { cookie: `test_ms_exp2=${encodeURIComponent(cookie)}` } },
      ENV
    );
    assert.equal(read, null);
  });

  it("8 cross-user / cross-product draft denial (separate cookie names)", () => {
    const bb = createSignedRegistrationDraftCookie({ cookieName: "bb_reg_draft" });
    const ac = createSignedRegistrationDraftCookie({ cookieName: "ac_reg_draft" });
    const res = mockRes();
    bb.writeRegistrationDraft(res, ENV, { church_name: "BB Only" }, { isProduction: false });
    const bbCookie = cookieFromRes(res, "bb_reg_draft");
    const acRead = ac.readRegistrationDraft(
      { headers: { cookie: `bb_reg_draft=${encodeURIComponent(bbCookie)}` } },
      ENV
    );
    assert.equal(acRead, null);
  });

  it("9 tampered identifier/signature rejected", () => {
    const draftApi = createSignedRegistrationDraftCookie({ cookieName: "test_ms_tamper" });
    const res = mockRes();
    draftApi.writeRegistrationDraft(res, ENV, { x: 1 }, { isProduction: false });
    const cookie = cookieFromRes(res, "test_ms_tamper");
    const tampered = `${cookie.slice(0, -4)}XXXX`;
    const read = draftApi.readRegistrationDraft(
      { headers: { cookie: `test_ms_tamper=${encodeURIComponent(tampered)}` } },
      ENV
    );
    assert.equal(read, null);
  });

  it("10 successful completion clears usable draft", () => {
    const draftApi = createSignedRegistrationDraftCookie({ cookieName: "test_ms_done" });
    const res = mockRes();
    const written = draftApi.writeRegistrationDraft(
      res,
      ENV,
      { church_name: "Done" },
      { isProduction: false }
    );
    draftApi.completeRegistrationDraft(res, ENV, {
      isProduction: false,
      priorDraft: written,
    });
    const cleared = res.headers.some(
      ([, v]) => String(v).startsWith("test_ms_done=") && String(v).includes("Max-Age=0")
    );
    assert.equal(cleared, true);
  });

  it("protected keys cannot be injected from client", () => {
    const merged = mergeDraftFields({
      prior: { organization_key: "server-key" },
      incoming: { organization_key: "evil-key", city: "Lusaka" },
      options: {
        fieldAllowlist: ["organization_key", "city"],
        protectedKeys: ["organization_key"],
      },
    });
    assert.equal(merged.organization_key, "server-key");
    assert.equal(merged.city, "Lusaka");
  });

  it("passwords never land in draft formData", () => {
    const draftApi = createSignedRegistrationDraftCookie({ cookieName: "test_ms_pwd" });
    const res = mockRes();
    const payload = draftApi.writeRegistrationDraft(
      res,
      ENV,
      { email: "a@b.c", password: "Secret99!", password_confirm: "Secret99!" },
      { isProduction: false }
    );
    assert.equal(payload.formData.password, undefined);
    assert.equal(payload.formData.password_confirm, undefined);
    assert.equal(payload.formData.email, "a@b.c");
    assert.ok(payload.draftNonce);
  });

  it("fresh start detector", () => {
    assert.equal(isRegistrationFreshStartRequest({ query: { fresh: "1" } }), true);
    assert.equal(isRegistrationFreshStartRequest({ query: {}, body: { action: "restart" } }), true);
    assert.equal(isRegistrationFreshStartRequest({ query: {} }), false);
  });

  it("façade createMultiStepFormState wires merge + cookie", () => {
    const state = createMultiStepFormState({
      cookieName: `facade_${crypto.randomBytes(2).toString("hex")}`,
      productCode: "blessboard",
    });
    const merged = state.mergeFields({ a: 1 }, { b: 2 }, { fieldAllowlist: ["b"] });
    assert.equal(merged.a, 1);
    assert.equal(merged.b, 2);
  });
});
