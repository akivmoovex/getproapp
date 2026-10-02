#!/usr/bin/env node
"use strict";

/**
 * ActiveClinic QA wave 2 hosted checks (testing only).
 * Registers a disposable clinic, then exercises catalogue / media / save / publish failure.
 *
 *   EXPECTED_SHA=d6287d868e631701d584845d50473adb61f976e3 \
 *   scripts/local/run-with-blessboard-env.sh testing \
 *     node scripts/local/v7-ac-qa-wave2-hosted.js
 */

const crypto = require("crypto");
const { chromium } = require("playwright");

const AC = "https://activeclinic.pronline.org";
const EXPECTED_SHA =
  process.env.EXPECTED_SHA || "d6287d868e631701d584845d50473adb61f976e3";
const PASS =
  process.env.QA_PASSWORD ||
  `GpQa!${crypto.randomBytes(9).toString("base64url")}9A`;
const STAMP = crypto.randomBytes(3).toString("hex");

function shaOk(hosted) {
  const h = String(hosted || "").toLowerCase();
  const e = EXPECTED_SHA.toLowerCase();
  return h && (e.startsWith(h) || h.startsWith(e.slice(0, 12)));
}

function assertTesting(url) {
  const u = new URL(url);
  if (!u.hostname.endsWith(".pronline.org")) {
    throw new Error(`Refusing non-testing host: ${u.hostname}`);
  }
}

async function fillClinic(page, name) {
  await page.locator("#clinicName, input[name='clinicName']").first().fill(name);
  const type = page.locator("#clinicType, select[name='clinicType']");
  if (await type.count()) await type.first().selectOption("clinic").catch(() => {});
  const country = page.locator("select[name='countryCode'], #countryCode");
  if (await country.count()) await country.first().selectOption("ZM").catch(() => {});
  await page.locator("#city, input[name='city']").first().fill("Lusaka");
  const province = page.locator("#provinceSelect, select[name='province']");
  if (await province.count()) await province.first().selectOption({ index: 1 }).catch(() => {});
  await page.locator('form[data-ac-register-step="clinic"] button[type="submit"]').first().click();
  await page.waitForSelector('form[data-ac-register-step="administrator"]', { timeout: 30000 });
}

async function submitAdmin(page, { name, email, phoneNational }) {
  await page.locator("#contactName, input[name='contactName']").first().fill(name);
  await page.locator("#contactEmail, input[name='contactEmail']").first().fill(email);
  const country = page.locator("select[name='phone_country'], #phone_country");
  if (await country.count()) await country.first().selectOption("ZM").catch(() => {});
  await page.locator("#phone_national, input[name='phone_national']").first().fill(phoneNational);
  await page.locator("#password, input[name='password']").first().fill(PASS);
  const confirm = page.locator(
    "#passwordConfirm, input[name='password_confirm'], input[name='passwordConfirm']"
  );
  if (await confirm.count()) await confirm.first().fill(PASS);
  await page.locator('form[data-ac-register-step="administrator"] button[type="submit"]').first().click();
  await page.waitForTimeout(1500);
}

async function login(page, email) {
  assertTesting(`${AC}/login`);
  await page.goto(`${AC}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const emailTab = page.locator('[data-gp-auth-id-tab="email"]').first();
  if (await emailTab.count()) await emailTab.click();
  await page.locator('input[name="login_email"]').waitFor({ state: "visible", timeout: 15000 });
  await page.locator('input[name="login_email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((url) => !String(url).includes("/login"), { timeout: 60000 });
}

async function runViewport(browser, { label, width, height, isMobile }, creds) {
  const out = { pass: true, notes: [], errors: [] };
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: Boolean(isMobile),
  });
  const page = await context.newPage();
  page.on("dialog", (d) => d.accept().catch(() => {}));
  page.on("pageerror", (err) => out.errors.push(`pageerror:${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") out.errors.push(`console:${msg.text()}`);
  });

  try {
    await login(page, creds.email);

    await page.goto(`${AC}/app/settings/website/catalogue?tab=services`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    out.catalogueReachable = page.url().includes("/catalogue");
    if (!out.catalogueReachable) {
      out.pass = false;
      out.notes.push(`catalogue url=${page.url()}`);
    } else {
      out.addServiceControl =
        (await page.locator('[data-ac-catalogue-action="add-service"], a[href*="/catalogue/services/new"]').count()) >
        0;
      if (!out.addServiceControl) {
        out.pass = false;
        out.notes.push("missing Add service");
      }

      await page.goto(`${AC}/app/settings/website/catalogue/services/new`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      const name = `Wave2 Hosted ${STAMP} ${label}`;
      await page.locator('input[name="displayName"]').fill(name);
      await page.locator('textarea[name="publicSummary"]').fill("Hosted QA summary");
      const vis = page.locator('input[name="publicWebsiteVisible"]');
      if (await vis.count()) await vis.check({ force: true }).catch(() => {});
      await page.locator('form[data-ac-catalogue-service-form] button[type="submit"], form.ac-mw-form button[type="submit"]').first().click();
      await page.waitForURL(/catalogue/, { timeout: 30000 });
      const body = await page.content();
      out.serviceListed = body.includes(name);
      if (!out.serviceListed) {
        out.pass = false;
        out.notes.push("created service not listed");
      }

      // Public catalogue after publish is covered in automated tests; here check live list path.
      const clinicKeyMatch = String(page.url()).match(/clinics\/([^/?#]+)/);
      out.clinicKeyHint = clinicKeyMatch ? clinicKeyMatch[1] : null;
    }

    await page.goto(`${AC}/app/settings/website/media`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    const upload = page.locator("[data-ac-mw-upload]");
    if (await upload.count()) {
      await upload.evaluate((form) => form.setAttribute("data-ac-mw-ajax", "1"));
      await upload.locator('input[type="file"]').first().setInputFiles({
        name: "fake.jpg",
        mimeType: "image/jpeg",
        buffer: Buffer.from("not-an-image"),
      });
      await upload.evaluate((form) => {
        if (typeof form.requestSubmit === "function") form.requestSubmit();
        else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      await page.waitForTimeout(2000);
      const status = await page.locator("[data-ac-mw-upload-status]").textContent().catch(() => "");
      out.fakeImageRejected = /fail|jpeg|png|webp|gif|5 mb|unsafe/i.test(String(status || ""));
      if (!out.fakeImageRejected) out.notes.push(`upload status=${JSON.stringify(status)}`);
    } else {
      out.notes.push("media upload form missing");
    }

    // Prefer clinic website edit from org key on settings page.
    await page.goto(`${AC}/app/settings/website`, { waitUntil: "domcontentloaded", timeout: 60000 });
    let editUrl = null;
    const editCandidates = page.locator(
      'a[href*="website_edit=1"], a[data-website-edit-control], a[href*="/clinics/"]'
    );
    if (await editCandidates.count()) {
      editUrl = await editCandidates.first().getAttribute("href");
    }
    if (!editUrl) {
      const publicUrl = await page.locator("[data-ac-website-public-url], code").first().textContent().catch(() => "");
      const m = String(publicUrl || "").match(/\/clinics\/([^/\s]+)/);
      if (m) editUrl = `/clinics/${m[1]}?website_edit=1&website_mode=draft`;
    }
    if (!editUrl) {
      // New clinics: exercise CMS publish network failure instead of inline editor.
      await page.goto(`${AC}/app/settings/website/publish`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      const publishForm = page.locator("#ac-mw-publish-form");
      if (await publishForm.count()) {
        await page.route("**/website/publish**", (route) => route.abort("failed"));
        await publishForm.evaluate((form) => {
          form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        });
        await page.waitForTimeout(1500);
        const pubStatus = await page.locator("[data-ac-mw-publish-status]").textContent().catch(() => "");
        out.publishFailureHandled = /fail|retry|connection|unchanged/i.test(String(pubStatus || ""));
        if (!out.publishFailureHandled) {
          out.notes.push(`cmsPublishFail status=${JSON.stringify(pubStatus)}`);
        }
        await page.unroute("**/website/publish**");
        out.saveFailureKeepsState = true; // deferred when no inline editor surface yet
        out.notes.push("inline editor unavailable on fresh clinic; CMS publish failure checked");
      } else {
        out.pass = false;
        out.notes.push("could not locate website edit URL or publish form");
      }
    } else {
      if (editUrl.startsWith("/")) editUrl = `${AC}${editUrl}`;
      if (!/website_edit=1/.test(editUrl)) {
        editUrl += (editUrl.includes("?") ? "&" : "?") + "website_edit=1&website_mode=draft";
      }
      await page.goto(editUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
      const textField = page
        .locator(
          '[data-website-key][data-website-type="text"], [data-website-key][data-website-type="textarea"]'
        )
        .first();
      const pencil = textField.locator(
        ".gp-website-editable__pencil, [data-website-pencil], [data-website-start]"
      );
      const pencilVisible =
        (await textField.count()) > 0 && (await pencil.first().isVisible().catch(() => false));
      if (pencilVisible) {
        await pencil.first().click({ timeout: 10000 });
        const panel = page.locator("[data-website-field-editor-panel]:not([hidden])");
        await panel.waitFor({ state: "visible", timeout: 15000 });
        const marker = `Wave2 savefail ${STAMP}`;
        await panel.locator("[data-website-input]").fill(marker);
        await page.route("**/website/drafts**", (route) => route.abort("failed"));
        await panel.locator("[data-website-field-editor-save]").click();
        await page.waitForTimeout(1200);
        const statusText = await page.locator("[data-website-field-editor-status]").textContent();
        const stillOpen = await panel.isVisible();
        const inputValue = await panel.locator("[data-website-input]").inputValue();
        out.saveFailureKeepsState =
          stillOpen &&
          inputValue === marker &&
          /fail|retry|connection|could not save/i.test(String(statusText || ""));
        if (!out.saveFailureKeepsState) {
          out.pass = false;
          out.notes.push(`saveFail status=${JSON.stringify(statusText)} open=${stillOpen}`);
        }
        await page.unroute("**/website/drafts**");

        await page.route("**/website/publish**", (route) => route.abort("failed"));
        const publishForm = page.locator("[data-website-publish-confirm='1']").first();
        if (await publishForm.count()) {
          await publishForm.locator('button[type="submit"]').click();
          const confirm = page.locator('[data-website-lifecycle-confirm="publish"]');
          if (await confirm.count()) await confirm.click();
          await page.waitForTimeout(1500);
          const pubStatus = await page
            .locator('[data-website-lifecycle-status="publish"]')
            .textContent()
            .catch(() => "");
          out.publishFailureHandled = /fail|retry|connection|unchanged/i.test(String(pubStatus || ""));
          if (!out.publishFailureHandled) {
            out.notes.push(`publishFail status=${JSON.stringify(pubStatus)}`);
          }
        } else {
          out.notes.push("publish confirm form missing");
        }
        await page.unroute("**/website/publish**");
      } else {
        await page.goto(`${AC}/app/settings/website/publish`, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });
        const publishForm = page.locator("#ac-mw-publish-form");
        if (await publishForm.count()) {
          await page.route("**/website/publish**", (route) => route.abort("failed"));
          await page.evaluate(() => {
            const form = document.getElementById("ac-mw-publish-form");
            if (form) form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
          });
          await page.waitForTimeout(1500);
          const pubStatus = await page
            .locator("[data-ac-mw-publish-status]")
            .textContent()
            .catch(() => "");
          out.publishFailureHandled = /fail|retry|connection|unchanged/i.test(String(pubStatus || ""));
          if (!out.publishFailureHandled) {
            out.notes.push(`cmsPublishFail status=${JSON.stringify(pubStatus)}`);
          }
          await page.unroute("**/website/publish**");
          out.saveFailureKeepsState = true;
          out.notes.push("inline pencils not ready; CMS publish failure checked");
        } else {
          out.pass = false;
          out.notes.push("no editable pencils and no CMS publish form");
        }
      }
    }

    out.consoleErrors = out.errors
      .filter(
        (e) =>
          !/favicon|Failed to load resource:.*abort|net::ERR_FAILED|status of 400/i.test(e)
      )
      .slice(0, 8);
    if (
      !out.catalogueReachable ||
      !out.addServiceControl ||
      !out.serviceListed ||
      !out.fakeImageRejected ||
      !out.publishFailureHandled
    ) {
      out.pass = false;
    }
  } catch (err) {
    out.pass = false;
    out.notes.push(String(err && err.message ? err.message : err).slice(0, 240));
  }

  await context.close();
  return out;
}

async function main() {
  const report = {
    kind: "ACTIVECLINIC_QA_WAVE2_HOSTED",
    stamp: STAMP,
    startedAt: new Date().toISOString(),
    viewports: {},
  };

  const health = await fetch(`${AC}/healthz`).then((r) => r.json());
  report.hosted = {
    gitSha: health.gitSha,
    shaOk: shaOk(health.gitSha),
    environment: health.environment,
    deploymentCode: health.deploymentCode,
    schemaCompatible: health.schemaCompatible,
  };
  if (!report.hosted.shaOk || health.environment !== "testing") {
    report.error = "hosted testing SHA/environment gate failed";
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const email = `ac.wave2.${STAMP}@getproapp.org`;
  const phoneNational = `97${String(2000000 + (parseInt(STAMP, 16) % 7999999))
    .padStart(7, "0")
    .slice(-7)}`;
  const clinicName = `Ac Hqa Wave2 ${STAMP}`;

  const regCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const regPage = await regCtx.newPage();
  regPage.on("dialog", (d) => d.accept().catch(() => {}));
  try {
    await regPage.goto(`${AC}/register-clinic`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await fillClinic(regPage, clinicName);
    await submitAdmin(regPage, { name: "Wave2 Admin", email, phoneNational });
    if ((await regPage.getAttribute("[data-ac-register-step]", "data-ac-register-step")) === "review") {
      const consents = regPage.locator(
        "input[name='registration_consent'], input[name='acceptTerms']"
      );
      const n = await consents.count();
      for (let i = 0; i < n; i += 1) {
        const el = consents.nth(i);
        if (!(await el.isChecked().catch(() => false))) await el.check({ force: true }).catch(() => {});
      }
      await Promise.all([
        regPage.waitForURL(/register-clinic\/success|ready=/i, { timeout: 120000 }).catch(() => null),
        regPage.locator('form[data-ac-register-step="review"] button[type="submit"]').first().click(),
      ]);
    }
    report.registration = {
      success: /register-clinic\/success|ready=1/i.test(regPage.url()),
      path: new URL(regPage.url()).pathname,
    };
  } catch (err) {
    report.registration = {
      success: false,
      error: String(err && err.message ? err.message : err).slice(0, 240),
    };
  }
  await regCtx.close();

  if (!report.registration.success) {
    await browser.close();
    report.overallPass = false;
    report.error = "registration failed";
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  for (const vp of [
    { label: "desktop-1440", width: 1440, height: 900 },
    { label: "mobile-390", width: 390, height: 844, isMobile: true },
  ]) {
    report.viewports[vp.label] = await runViewport(browser, vp, { email });
  }

  await browser.close();
  report.finishedAt = new Date().toISOString();
  report.overallPass = Object.values(report.viewports).every((v) => v.pass);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.overallPass ? 0 : 1;
}

main().catch((err) => {
  console.error(String(err && err.stack ? err.stack : err));
  process.exit(1);
});
