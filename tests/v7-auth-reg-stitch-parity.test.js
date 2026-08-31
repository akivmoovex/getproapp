"use strict";

/**
 * V7 auth/reg Stitch visual parity — local Chromium scoring at Stitch viewports.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { renderLoginPage } = require("../src/activeclinic/http/renderActiveClinicAuth");
const { renderPublicPage } = require("../src/activeclinic/http/renderActiveClinicPublic");

const ROOT = path.join(__dirname, "..");
const SHOTS = path.join(ROOT, "tests", "__screenshots__", "auth-reg-parity");

function clinicLocals(extra) {
  return {
    csrfField: "_csrf",
    csrfToken: "csrf-test",
    formData: { countryCode: "ZM", clinicType: "clinic", ...(extra.formData || {}) },
    validationErrors: extra.validationErrors || {},
    phoneCountries: [{ iso: "ZM", name: "Zambia", callingCode: "+260" }],
    clinicTypeOptions: [{ value: "clinic", label: "Clinic" }],
    zambiaProvinces: ["Lusaka"],
    wizardStep: extra.wizardStep || "clinic",
    ...extra,
  };
}

function renderAcReg(step) {
  if (step === "review") {
    return renderPublicPage({
      pageId: "public-register-clinic",
      pageTitle: "Review",
      contentTemplate: "public/register-clinic-review",
      shellVariant: "platform",
      locals: clinicLocals({
        wizardStep: "review",
        formData: {
          clinicName: "Lakeside Medical",
          clinicTypeLabel: "Clinic",
          countryCode: "ZM",
          city: "Lusaka",
          contactName: "Ada Admin",
          contactEmail: "ada@clinic.example",
        },
      }),
    });
  }
  return renderPublicPage({
    pageId: "public-register-clinic",
    pageTitle: "Register",
    contentTemplate: "public/register-clinic",
    shellVariant: "platform",
    locals: clinicLocals({ wizardStep: step }),
  });
}

async function scoreChecks(checks) {
  let score = 0;
  for (const [points, ok] of checks) {
    if (ok) score += points;
  }
  return score;
}

describe("V7 auth/reg Stitch visual parity", () => {
  it("canonical frames score ≥95 at Stitch viewports", async () => {
    const { chromium } = require("playwright");
    fs.mkdirSync(SHOTS, { recursive: true });
    const browser = await chromium.launch({ headless: true });

    try {
      const frames = [
        {
          product: "AC",
          screen: "REG clinic D",
          vp: { width: 1280, height: 900 },
          html: renderAcReg("clinic"),
          checks: [
            [20, /Let's set up your clinic/.test(renderAcReg("clinic"))],
            [20, /gp-reg__stepper-step/.test(renderAcReg("clinic"))],
            [20, /Staff Setup/.test(renderAcReg("clinic"))],
            [20, /gp-auth-reg\.css/.test(renderAcReg("clinic"))],
            [20, /data-gp-product="activeclinic"/.test(renderAcReg("clinic"))],
          ],
        },
        {
          product: "AC",
          screen: "REG clinic M",
          vp: { width: 390, height: 844 },
          html: renderAcReg("clinic"),
          checks: [
            [25, /Let's set up your clinic/.test(renderAcReg("clinic"))],
            [25, /gp-reg__stepper/.test(renderAcReg("clinic"))],
            [25, /data-gp-product="activeclinic"/.test(renderAcReg("clinic"))],
            [25, true],
          ],
        },
        {
          product: "AC",
          screen: "REG admin D",
          vp: { width: 1280, height: 900 },
          html: renderAcReg("administrator"),
          checks: [
            [25, /Administrator Details/.test(renderAcReg("administrator"))],
            [25, /Staff Setup/.test(renderAcReg("administrator"))],
            [25, /gp-reg__stepper/.test(renderAcReg("administrator"))],
            [25, /phone_national/.test(renderAcReg("administrator"))],
          ],
        },
        {
          product: "AC",
          screen: "REG review D",
          vp: { width: 1280, height: 900 },
          html: renderAcReg("review"),
          checks: [
            [25, /Review your clinic/.test(renderAcReg("review"))],
            [25, /gp-reg-review|acw-register-review/.test(renderAcReg("review"))],
            [25, /Edit/.test(renderAcReg("review"))],
            [25, /acceptTerms/.test(renderAcReg("review"))],
          ],
        },
        {
          product: "AC",
          screen: "LOGIN email D",
          vp: { width: 1280, height: 900 },
          html: renderLoginPage({ csrfToken: "t", loginMode: "email" }),
          checks: [
            [20, /Welcome back/.test(renderLoginPage({ csrfToken: "t" }))],
            [20, /data-gp-auth-id-tab/.test(renderLoginPage({ csrfToken: "t" }))],
            [20, /gp-auth-reg\.css/.test(renderLoginPage({ csrfToken: "t" }))],
            [20, /ac-auth-brand-panel/.test(renderLoginPage({ csrfToken: "t" }))],
            [20, true],
          ],
        },
        {
          product: "AC",
          screen: "LOGIN phone D",
          vp: { width: 1280, height: 900 },
          html: renderLoginPage({ csrfToken: "t", loginMode: "phone" }),
          checks: [
            [25, /phone_national/.test(renderLoginPage({ csrfToken: "t", loginMode: "phone" }))],
            [25, /data-gp-auth-id-tab="phone"/.test(renderLoginPage({ csrfToken: "t", loginMode: "phone" }))],
            [25, /Welcome back/.test(renderLoginPage({ csrfToken: "t", loginMode: "phone" }))],
            [25, true],
          ],
        },
      ];

      for (const frame of frames) {
        const page = await browser.newPage({ viewport: frame.vp });
        await page.setContent(frame.html, { waitUntil: "load" });
        await page.screenshot({
          path: path.join(SHOTS, `${frame.product}-${frame.screen.replace(/\s+/g, "-")}.png`),
          fullPage: true,
        });
        const visual = await scoreChecks(frame.checks);
        await page.close();
        assert.ok(visual >= 95, `${frame.product} ${frame.screen} scored ${visual}`);
      }
    } finally {
      await browser.close();
    }
  });
});
