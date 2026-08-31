"use strict";

/**
 * ActiveClinic Platform Bug Fix 03 — navigation, login visual alignment, registration layout.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { renderLoginPage } = require("../src/activeclinic/http/renderActiveClinicAuth");
const { renderPublicPage } = require("../src/activeclinic/http/renderActiveClinicPublic");

const ROOT = path.join(__dirname, "..");
const SHOTS = path.join(ROOT, "tests", "__screenshots__", "platform-03");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function clinicLocals(extra) {
  return {
    csrfField: "_csrf",
    csrfToken: "csrf-test",
    formData: { countryCode: "ZM", clinicType: "clinic", ...(extra.formData || {}) },
    validationErrors: extra.validationErrors || {},
    formState: extra.formState || "form",
    phoneCountries: [{ iso: "ZM", name: "Zambia", callingCode: "+260" }],
    clinicTypeOptions: [
      { value: "hospital", label: "Hospital" },
      { value: "clinic", label: "Clinic" },
    ],
    zambiaProvinces: ["Lusaka", "Copperbelt"],
    wizardStep: extra.wizardStep || "clinic",
    error: extra.error || null,
    ...extra,
  };
}

function renderStep(step) {
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
          clinicType: "clinic",
          clinicTypeLabel: "Clinic",
          countryCode: "ZM",
          city: "Lusaka",
          province: "Lusaka",
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

async function scorePage(page, checks) {
  let score = 0;
  for (const [points, ok] of checks) {
    if (ok) score += points;
  }
  return score;
}

describe("ActiveClinic Platform 03 — navigation and layout", () => {
  it("login includes Home link pointing to /", () => {
    const html = renderLoginPage({ csrfToken: "csrf-test" });
    assert.match(html, /data-ac-auth-home="1"/);
    assert.match(html, /data-ac-auth-public-header="1"/);
    assert.match(html, /<a[^>]+href="\/"[^>]*>[\s\S]*Home/);
    assert.match(html, /href="\/register-clinic"/);
  });

  it("login uses ActiveClinic teal tokens in auth CSS", () => {
    const css = read("public/activeclinic/ac-auth.css");
    assert.match(css, /--ac-auth-primary:\s*var\(--acp-primary/);
    assert.doesNotMatch(css, /--ac-auth-primary:\s*#003c90/);
  });

  it("app shell includes Public site link without removing Dashboard", () => {
    const sidebar = read("views/activeclinic/partials/sidebar.ejs");
    assert.match(sidebar, /data-ac-public-site="1"/);
    assert.match(sidebar, /href="\/"/);
    assert.match(sidebar, /Public site/);

    const nav = read("src/activeclinic/services/activeClinicNavigation.js");
    assert.match(nav, /Dashboard/);
    assert.match(nav, /\/app/);
  });

  it("registration keeps three steps with shared aside layout shell", () => {
    const step1 = renderPublicPage({
      pageId: "public-register-clinic",
      pageTitle: "Register",
      contentTemplate: "public/register-clinic",
      shellVariant: "platform",
      locals: clinicLocals({ wizardStep: "clinic" }),
    });
    const step2 = renderPublicPage({
      pageId: "public-register-clinic",
      pageTitle: "Register",
      contentTemplate: "public/register-clinic",
      shellVariant: "platform",
      locals: clinicLocals({ wizardStep: "administrator" }),
    });
    const step3 = renderPublicPage({
      pageId: "public-register-clinic",
      pageTitle: "Review",
      contentTemplate: "public/register-clinic-review",
      shellVariant: "platform",
      locals: clinicLocals({ wizardStep: "review" }),
    });

    for (const html of [step1, step2, step3]) {
      assert.match(html, /acw-register--with-aside/);
      assert.match(html, /acw-register__layout/);
      assert.match(html, /acw-register__aside/);
      assert.match(html, /acw-register__panel/);
    }

    assert.match(step1, /Step 1 of 3/);
    assert.match(step2, /Step 2 of 3/);
    assert.match(step3, /Step 3 of 3/);
    assert.match(step1, /data-ac-city-listbox="1"/);
    assert.match(step1, /id="provinceSelect"/);
    assert.match(step3, /href="\/register-clinic\?step=clinic"/);
    assert.match(step3, /href="\/register-clinic\?step=administrator"/);
    assert.match(step3, /name="_csrf"/);
    assert.match(step3, /name="acceptTerms"/);
  });

  it("Chromium visual QA scores login and registration layout ≥95", async () => {
    const { chromium } = require("playwright");
    fs.mkdirSync(SHOTS, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    try {
      const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });

      const loginHtml = renderLoginPage({ csrfToken: "csrf-test" });
      const loginDesktop = await desktopContext.newPage();
      await loginDesktop.setContent(loginHtml, { waitUntil: "load" });
      await loginDesktop.addStyleTag({ content: read("public/activeclinic/ac-tokens.css") });
      await loginDesktop.addStyleTag({ content: read("public/activeclinic/ac-auth.css") });
      await loginDesktop.screenshot({ path: path.join(SHOTS, "login-desktop.png"), fullPage: true });
      const loginHomeVisible = await loginDesktop.isVisible('[data-ac-auth-home="1"]');
      const loginPrimary = await loginDesktop.evaluate(() => {
        const btn = document.querySelector(".ac-auth-btn");
        return btn ? getComputedStyle(btn).backgroundColor : "";
      });
      const loginBrandPanel = await loginDesktop.evaluate(() => {
        const panel = document.querySelector(".ac-auth-brand-panel");
        return panel ? getComputedStyle(panel).display !== "none" : false;
      });
      const loginScore = await scorePage(loginDesktop, [
        [20, loginHomeVisible],
        [20, /006068|rgb\(0,\s*96,\s*104\)/i.test(loginPrimary)],
        [20, await loginDesktop.isVisible('[data-ac-auth-public-header="1"]')],
        [20, loginBrandPanel],
        [20, await loginDesktop.isVisible('a[href="/register-clinic"]')],
      ]);
      assert.ok(loginScore >= 95, `login desktop score ${loginScore}`);

      const loginMobile = await mobileContext.newPage();
      await loginMobile.setContent(loginHtml, { waitUntil: "load" });
      await loginMobile.addStyleTag({ content: read("public/activeclinic/ac-tokens.css") });
      await loginMobile.addStyleTag({ content: read("public/activeclinic/ac-auth.css") });
      await loginMobile.screenshot({ path: path.join(SHOTS, "login-mobile.png"), fullPage: true });
      const loginMobileOverflow = await loginMobile.evaluate(() => {
        const doc = document.documentElement;
        return Math.max(doc.scrollWidth, document.body.scrollWidth) <= doc.clientWidth + 2;
      });
      assert.equal(loginMobileOverflow, true, "login mobile horizontal overflow");
      assert.ok(await loginMobile.isVisible('[data-ac-auth-home="1"]'), "login mobile home");

      for (const step of ["clinic", "administrator", "review"]) {
        const html = renderStep(step);
        const desktop = await desktopContext.newPage();
        await desktop.setContent(html, { waitUntil: "load" });
        await desktop.addStyleTag({ content: read("public/activeclinic/ac-tokens.css") });
        await desktop.addStyleTag({ content: read("public/activeclinic/ac-public.css") });
        await desktop.addStyleTag({ content: read("public/activeclinic/acw-platform.css") });
        await desktop.screenshot({ path: path.join(SHOTS, `register-${step}-desktop.png`), fullPage: true });
        const layout = await desktop.evaluate(() => {
          const section = document.querySelector(".acw-register");
          const layoutEl = document.querySelector(".acw-register__layout");
          const panel = document.querySelector(".acw-register__panel");
          const aside = document.querySelector(".acw-register__aside");
          const sectionWidth = section ? section.getBoundingClientRect().width : 0;
          const layoutCols = layoutEl ? getComputedStyle(layoutEl).gridTemplateColumns : "";
          const panelWidth = panel ? panel.getBoundingClientRect().width : 0;
          const asideWidth = aside ? aside.getBoundingClientRect().width : 0;
          const colCount = layoutCols.split(/\s+/).filter(Boolean).length;
          return { sectionWidth, layoutCols, panelWidth, asideWidth, colCount };
        });
        const regDesktopScore = await scorePage(desktop, [
          [25, layout.sectionWidth >= 680],
          [25, layout.panelWidth >= 340],
          [25, layout.colCount >= 2],
          [25, layout.asideWidth >= 220],
        ]);
        assert.ok(regDesktopScore >= 95, `${step} desktop score ${regDesktopScore}`);
        await desktop.close();

        const mobile = await mobileContext.newPage();
        await mobile.setContent(html, { waitUntil: "load" });
        await mobile.addStyleTag({ content: read("public/activeclinic/ac-tokens.css") });
        await mobile.addStyleTag({ content: read("public/activeclinic/ac-public.css") });
        await mobile.addStyleTag({ content: read("public/activeclinic/acw-platform.css") });
        await mobile.screenshot({ path: path.join(SHOTS, `register-${step}-mobile.png`), fullPage: true });
        const mobileOk = await mobile.evaluate(() => {
          const doc = document.documentElement;
          const overflow = Math.max(doc.scrollWidth, document.body.scrollWidth) > doc.clientWidth + 2;
          return !overflow;
        });
        assert.equal(mobileOk, true, `${step} mobile overflow`);
        await mobile.close();
      }
    } finally {
      await browser.close();
    }
  });
});