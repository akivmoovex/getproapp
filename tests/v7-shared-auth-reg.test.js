"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { resolveLoginIdentifierFromBody } = require("../src/platform/auth/resolveLoginIdentifier");
const { renderLoginPage } = require("../src/activeclinic/http/renderActiveClinicAuth");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V7 shared auth registration", () => {
  it("resolveLoginIdentifierFromBody handles email and phone modes", () => {
    const email = resolveLoginIdentifierFromBody({
      login_mode: "email",
      login_email: "Ada@Clinic.Example",
    });
    assert.equal(email.mode, "email");
    assert.equal(email.identifier, "Ada@Clinic.Example");

    const phone = resolveLoginIdentifierFromBody({
      login_mode: "phone",
      phone_country: "ZM",
      phone_national: "971234567",
    });
    assert.equal(phone.mode, "phone");
    assert.match(phone.identifier, /^\+260/);
  });

  it("ActiveClinic login renders Stitch email/phone tabs and shared assets", () => {
    const html = renderLoginPage({ csrfToken: "t", loginMode: "email" });
    assert.match(html, /data-gp-auth-identifier="1"/);
    assert.match(html, /data-gp-auth-id-tab="email"/);
    assert.match(html, /data-gp-auth-id-tab="phone"/);
    assert.match(html, /name="login_email"/);
    assert.match(html, /name="phone_national"/);
    assert.match(html, /Welcome back/);
    assert.match(html, /gp-auth-reg\.css/);
    assert.match(html, /data-ac-stitch-ref="a621bbc13d2542789cb76cb0c905b248"/);
    assert.match(html, /data-ac-auth-home="1"/);
  });

  it("shared registration stepper partial exists", () => {
    const stepper = read("views/platform/registration/stepper.ejs");
    assert.match(stepper, /gp-reg__stepper/);
    assert.match(stepper, /role="progressbar"/);
  });

  it("inventory documents Stitch auth frames separately from website editor", () => {
    const doc = read("docs/platform/V7_SHARED_AUTH_REG_STITCH_INVENTORY.md");
    assert.match(doc, /9585058196210789597/);
    assert.match(doc, /WE01/);
    assert.match(doc, /Login \(Email\)/);
    assert.match(doc, /Do not modify/);
  });
});
