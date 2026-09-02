#!/usr/bin/env node
"use strict";

/**
 * Reproduce branch mini-website inline text save failure on hosted testing.
 * Captures failing network request before fix. No production hosts.
 */

const { chromium } = require("playwright");

const PASS = process.env.QA_PASSWORD || "1234567890";
const BASE = "https://blessboard.pronline.org";
const BRANCH_URL = `${BASE}/c/demo-church/demo-church-lusaka?website_edit=1&website_mode=draft`;
const HQ_URL = `${BASE}/c/demo-church?website_edit=1&website_mode=draft`;

const PERSONAS = [
  {
    label: "branch_admin",
    email: "qa.branch_administrator@demo-church.example.test",
    url: BRANCH_URL,
    branchKey: "demo-church-lusaka",
  },
  {
    label: "hq_admin",
    email: "qa.organisation_administrator@demo-church.example.test",
    url: BRANCH_URL,
    branchKey: "demo-church-lusaka",
  },
  {
    label: "hq_admin_church_wide",
    email: "qa.organisation_administrator@demo-church.example.test",
    url: HQ_URL,
    branchKey: null,
  },
];

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const emailField = page.locator(
    'input[name="email"], input[name="login_email"], input[data-bb-auth-email]'
  );
  await emailField.first().waitFor({ state: "visible", timeout: 30000 });
  await emailField.first().fill(email);
  await page.locator('input[name="password"]').fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60000 });
}

async function openHeroHeadingEditor(page) {
  const key = "home.hero.heading";
  const field = page.locator(`[data-website-key="${key}"]`).first();
  await field.waitFor({ state: "visible", timeout: 20000 });
  await page.evaluate((websiteKey) => {
    const fieldEl = document.querySelector(`[data-website-key="${websiteKey}"]`);
    if (!fieldEl) throw new Error(`missing field ${websiteKey}`);
    const start = fieldEl.querySelector("[data-website-start]");
    if (start) start.click();
    else fieldEl.querySelector("[data-website-display]")?.click();
  }, key);
  const panel = page.locator("[data-website-field-editor-panel]:not([hidden])");
  await panel.waitFor({ state: "visible", timeout: 10000 });
  return { key, panel };
}

async function attemptSave(page, persona) {
  const captured = {
    persona: persona.label,
    pageUrl: persona.url,
    branchKey: persona.branchKey,
    saveUrlFromDom: null,
    request: null,
    responseBody: null,
    domError: null,
    persistedAfterReload: null,
  };

  const saveResponses = [];
  page.on("response", async (res) => {
    const req = res.request();
    if (req.method() !== "POST") return;
    const url = req.url();
    if (!url.includes("/website/drafts")) return;
    let body = null;
    try {
      body = await res.text();
    } catch {
      body = "(unreadable)";
    }
    saveResponses.push({
      url,
      method: req.method(),
      status: res.status(),
      requestHeaders: {
        "content-type": req.headers()["content-type"] || "",
        "x-csrf-token": req.headers()["x-csrf-token"] ? "(present)" : "(absent)",
      },
      postData: (req.postData() || "").replace(/"_csrf":"[^"]+"/, '"_csrf":"(redacted)"'),
      responseBody: body.slice(0, 500),
    });
  });

  await page.goto(persona.url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("[data-website-chrome]", {
    state: "attached",
    timeout: 30000,
  });

  captured.saveUrlFromDom = await page.evaluate(() => {
    const chrome = document.querySelector("[data-website-chrome]");
    return chrome ? chrome.getAttribute("data-website-save-url") : null;
  });

  const { key, panel } = await openHeroHeadingEditor(page);
  const original = await page.evaluate((websiteKey) => {
    const el = document.querySelector(`[data-website-key="${websiteKey}"]`);
    return el ? el.getAttribute("data-website-value") || el.textContent || "" : "";
  }, key);

  const marker = `QA-SAVE-${Date.now()}`;
  await panel.locator("[data-website-input]").fill(marker);
  await panel.locator("[data-website-field-editor-save]").click();

  await page.waitForTimeout(2500);

  captured.request = saveResponses[0] || null;
  if (!captured.request) {
    captured.domError = await page.evaluate(() => {
      const err = document.querySelector("[data-website-field-editor-error]");
      return err ? err.textContent : null;
    });
  }

  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  const afterReload = await page.evaluate((websiteKey) => {
    const el = document.querySelector(`[data-website-key="${websiteKey}"]`);
    return el ? el.getAttribute("data-website-value") || el.textContent || "" : "";
  }, key);

  captured.persistedAfterReload = {
    original: String(original).slice(0, 80),
    afterReload: String(afterReload).slice(0, 80),
    markerFound: String(afterReload).includes(marker),
  };

  return captured;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const persona of PERSONAS) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await login(page, persona.email);
      const result = await attemptSave(page, persona);
      results.push(result);
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      results.push({ persona: persona.label, error: String(err.message || err) });
      console.log(JSON.stringify({ persona: persona.label, error: String(err.message || err) }, null, 2));
    } finally {
      await context.close();
    }
  }

  await browser.close();
  const branchFail = results.find(
    (r) => r.persona === "branch_admin" && r.request && r.request.status !== 200
  );
  process.exit(branchFail || results.some((r) => r.error) ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
