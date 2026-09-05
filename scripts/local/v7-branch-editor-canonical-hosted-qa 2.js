#!/usr/bin/env node
"use strict";

/**
 * Hosted QA — canonical branch editor completion (testing only).
 */

const { chromium } = require("playwright");
const { checkHostedTestingSha } = require("../check-hosted-testing-sha");

const PASS = process.env.QA_PASSWORD || "1234567890";
const BASE = "https://blessboard.pronline.org";
const AC = "https://activeclinic.pronline.org";
const EMAIL = "qa.branch_administrator@demo-church.example.test";
const BRANCH = "demo-church-lusaka";
const SIBLING = "demo-church-ndola";
const ORG = "demo-church";
const EDITOR = `${BASE}/c/${ORG}/${BRANCH}?website_edit=1&website_mode=draft`;

const VIEWPORTS = [
  { label: "1440", width: 1440, height: 900 },
  { label: "390", width: 390, height: 844 },
];

const results = { checks: [], failures: [] };

function pass(name, detail) {
  results.checks.push({ name, pass: true, detail });
}

function fail(name, detail) {
  results.checks.push({ name, pass: false, detail });
  results.failures.push({ name, detail });
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('input[name="email"], input[name="login_email"]').first().fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60000 });
}

async function saveHeroHeading(page, marker) {
  await page.goto(EDITOR, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-website-key="home.hero.heading"]', { timeout: 30000 });
  await page.evaluate(() => {
    document.querySelector('[data-website-key="home.hero.heading"] [data-website-start]').click();
  });
  await page.locator("[data-website-input]").fill(marker);
  const saveResp = page.waitForResponse(
    (res) => res.request().method() === "POST" && res.url().includes("/website/drafts"),
    { timeout: 15000 }
  );
  await page.locator("[data-website-field-editor-save]").click();
  const res = await saveResp;
  return { status: res.status(), url: res.url() };
}

async function readHero(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  return page.evaluate(() => {
    const el = document.querySelector('[data-website-key="home.hero.heading"]');
    if (el) {
      const fromAttr = el.getAttribute("data-website-value");
      if (fromAttr) return fromAttr;
      const textEl = el.querySelector("[data-website-value-text], [data-website-display], h1, h2");
      if (textEl && textEl.textContent) return textEl.textContent;
    }
    const h1 = document.querySelector("main h1, .bb-tp-hero h1, h1");
    return h1 ? h1.textContent : "";
  });
}

async function runViewport(vp) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await context.newPage();
  try {
    await login(page);
    await page.goto(EDITOR, { waitUntil: "domcontentloaded" });
    const chrome = await page.evaluate(() => {
      const el = document.querySelector("[data-website-chrome]");
      if (!el) return null;
      return {
        saveUrl: el.getAttribute("data-website-save-url"),
        mediaUrl: el.getAttribute("data-website-media-url"),
        discardUrl: el.getAttribute("data-website-discard-url"),
      };
    });
    const prefix = `/c/${ORG}/${BRANCH}`;
    if (chrome && chrome.saveUrl === `${prefix}/website/drafts`) pass(`${vp.label}-save-url`, chrome.saveUrl);
    else fail(`${vp.label}-save-url`, JSON.stringify(chrome));

    for (const path of ["/website/history", "/website/styles", "/website/seo", "/website/media-library"]) {
      const res = await page.request.get(`${BASE}${prefix}${path}`);
      if (res.status() === 200) pass(`${vp.label}${path}`, String(res.status()));
      else fail(`${vp.label}${path}`, `HTTP ${res.status()}`);
    }

    const marker = `QA-COMPLETE-${vp.label}-${Date.now()}`;
    const saved = await saveHeroHeading(page, marker);
    if (saved.status === 200 && saved.url.includes(`${prefix}/website/drafts`)) {
      pass(`${vp.label}-text-save`, `${saved.status} ${saved.url}`);
    } else {
      fail(`${vp.label}-text-save`, `${saved.status} ${saved.url}`);
    }

    const reloaded = await readHero(page, EDITOR);
    if (String(reloaded).includes(marker)) pass(`${vp.label}-reload`, marker);
    else fail(`${vp.label}-reload`, reloaded.slice(0, 80));

    const preview = await readHero(page, `${BASE}/c/${ORG}/${BRANCH}?website_mode=draft`);
    if (String(preview).includes(marker)) pass(`${vp.label}-preview`, "draft visible");
    else fail(`${vp.label}-preview`, preview.slice(0, 80));

    const sibling = await readHero(page, `${BASE}/c/${ORG}/${SIBLING}?website_mode=draft`);
    if (!String(sibling).includes(marker)) pass(`${vp.label}-isolation`, "sibling unchanged");
    else fail(`${vp.label}-isolation`, sibling.slice(0, 80));
  } finally {
    await context.close();
    await browser.close();
  }
}

async function acSmoke() {
  const res = await fetch(`${AC}/healthz`);
  const body = await res.json();
  if (body.gitSha && body.environment === "testing") pass("ac-health", body.gitSha.slice(0, 12));
  else fail("ac-health", JSON.stringify(body));
}

async function main() {
  const sha = await checkHostedTestingSha({});
  if (!sha.ok) {
    console.log(JSON.stringify({ verdict: "HOSTED_SHA_DRIFT", sha }, null, 2));
    process.exit(3);
  }
  for (const vp of VIEWPORTS) await runViewport(vp);
  await acSmoke();
  const verdict = results.failures.length ? "BB_BRANCH_EDITOR_COMPLETE_WITH_GAPS" : "BB_BRANCH_EDITOR_CANONICAL_COMPLETE";
  console.log(JSON.stringify({ verdict, sha: sha.expectedSha, ...results }, null, 2));
  process.exit(results.failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
