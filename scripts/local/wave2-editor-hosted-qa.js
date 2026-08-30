#!/usr/bin/env node
"use strict";

/**
 * Wave 2 shared field editor — hosted testing Chromium QA (BB + AC).
 * Refuses production hosts. Password via env QA_PASSWORD or documented default.
 */

const { chromium } = require("playwright");

const PASS = process.env.QA_PASSWORD || "1234567890";
const VIEWPORTS = [
  { label: "desktop-1440", width: 1440, height: 900 },
  { label: "mobile-390", width: 390, height: 844, isMobile: true },
];

const PRODUCTS = [
  {
    code: "BB",
    loginUrl: "https://blessboard.pronline.org/login",
    emailField: 'input[name="email"]',
    email: "qa.organisation_administrator@demo-church.example.test",
    editUrl:
      "https://blessboard.pronline.org/c/demo-church?website_edit=1&website_mode=draft",
  },
  {
    code: "AC",
    loginUrl: "https://activeclinic.pronline.org/login",
    emailField: 'input[name="identifier"]',
    email: "qa.fullproduct.260817235630@example.test",
    editUrl:
      "https://activeclinic.pronline.org/clinics/qa-full-product-clinic-260817235630-805675?website_edit=1&website_mode=draft",
  },
];

function assertTestingUrl(url) {
  const u = new URL(url);
  if (!u.hostname.endsWith(".pronline.org")) {
    throw new Error(`Refusing non-testing host: ${u.hostname}`);
  }
}

async function login(page, product) {
  assertTestingUrl(product.loginUrl);
  await page.goto(product.loginUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator(product.emailField).fill(product.email);
  await page.locator('input[name="password"]').fill(PASS);
  await page.locator('button[type="submit"], input[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 60000 });
}

async function overflowOk(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth <= doc.clientWidth + 1;
  });
}

async function draftCount(page) {
  return page.evaluate(() => {
    const el = document.querySelector("[data-website-engine-draft]");
    return el ? String(el.textContent || "").trim() : "";
  });
}

async function openFieldDialog(page, selector) {
  const field = page.locator(selector).first();
  await field.waitFor({ state: "visible", timeout: 15000 });
  const pencil = field.locator(".gp-website-editable__pencil, [data-website-pencil]").first();
  await pencil.click();
  const panel = page.locator("[data-website-field-editor-panel]:not([hidden])");
  await panel.waitFor({ state: "visible", timeout: 10000 });
  return { field, panel };
}

async function testTextDialog(page, product, vp) {
  const out = { kind: "text", pass: true, notes: [] };
  const selector =
    '[data-website-key][data-website-type="text"], [data-website-key][data-website-type="textarea"]';
  try {
    const { panel } = await openFieldDialog(page, selector);
    const title = await panel.locator("[data-website-field-editor-title]").textContent();
    if (!/edit/i.test(title || "")) out.notes.push(`title=${JSON.stringify(title)}`);
    const hasCurrent = (await panel.locator("[data-website-field-current]").count()) > 0;
    const hasInput = (await panel.locator("[data-website-input]").count()) > 0;
    const hasSave = (await panel.locator("[data-website-field-editor-save]").count()) > 0;
    const hasCancel = (await panel.locator("[data-website-field-editor-cancel]").count()) > 0;
    if (!hasCurrent || !hasInput || !hasSave || !hasCancel) {
      out.pass = false;
      out.notes.push("missing text dialog structure");
    }
    if (vp.isMobile) {
      const grabVisible = await panel.locator(".gp-website-field-editor__grab").isVisible();
      if (!grabVisible) out.notes.push("mobile grab handle not visible");
    }
    const testValue = `Wave2 QA ${Date.now()}`;
    await panel.locator("[data-website-input]").fill(testValue);
    await panel.locator("[data-website-field-editor-cancel]").click();
    await panel.waitFor({ state: "hidden", timeout: 5000 });
    await openFieldDialog(page, selector);
    const retained = await panel.locator("[data-website-input]").inputValue();
    if (retained === testValue) {
      out.pass = false;
      out.notes.push("cancel should not retain unsaved value");
    }
    const beforeDraft = await draftCount(page);
    const saveValue = `Wave2 save ${Date.now()}`;
    await panel.locator("[data-website-input]").fill(saveValue);
    await panel.locator("[data-website-field-editor-save]").click();
    await panel.waitFor({ state: "hidden", timeout: 15000 });
    const afterDraft = await draftCount(page);
    if (beforeDraft === afterDraft) out.notes.push("draft count unchanged after save");
    const editing = await page.evaluate(() =>
      document.body.classList.contains("gp-website-editor-open")
    );
    if (!editing) {
      out.pass = false;
      out.notes.push("editing mode lost after save");
    }
    await openFieldDialog(page, selector);
    const reopened = await panel.locator("[data-website-input]").inputValue();
    if (reopened !== saveValue) out.notes.push("reopen draft mismatch");
    await panel.locator("[data-website-field-editor-cancel]").click();
  } catch (err) {
    out.pass = false;
    out.notes.push(err.message);
  }
  return out;
}

async function testMediaDialog(page, variant) {
  const out = { kind: variant, pass: true, notes: [] };
  const selector =
    variant === "logo"
      ? '[data-website-key][data-website-variant="logo"]'
      : '[data-website-key][data-website-type="image"][data-website-variant="image"]';
  try {
    const count = await page.locator(selector).count();
    if (!count) {
      out.pass = false;
      out.notes.push(`no ${variant} field on page`);
      return out;
    }
    const { panel } = await openFieldDialog(page, selector);
    const title = await panel.locator("[data-website-field-editor-title]").textContent();
    if (variant === "logo" && !/logo/i.test(title || "")) {
      out.notes.push(`logo title=${JSON.stringify(title)}`);
    }
    const hasCurrentImg = (await panel.locator("[data-website-field-current-image]").count()) > 0;
    const hasFile = (await panel.locator("[data-website-file]").count()) > 0;
    const hasAlt = (await panel.locator("[data-website-alt]").count()) > 0;
    if (!hasCurrentImg || !hasFile || !hasAlt) {
      out.pass = false;
      out.notes.push("missing image dialog structure");
    }
    await panel.locator("[data-website-field-editor-cancel]").click();
    await panel.waitFor({ state: "hidden", timeout: 5000 });
  } catch (err) {
    out.pass = false;
    out.notes.push(err.message);
  }
  return out;
}

async function testWave1Shell(page) {
  const out = { kind: "wave1-shell", pass: true, notes: [] };
  const checks = [
    ".gp-website-editor__toolbar",
    "[data-website-engine-page-select], [data-website-page-sheet]",
    "[data-website-more]",
    "[data-website-field-editor]",
  ];
  for (const sel of checks) {
    const n = await page.locator(sel).count();
    if (!n) {
      out.pass = false;
      out.notes.push(`missing ${sel}`);
    }
  }
  return out;
}

function scoreDialog(notes, isMobile) {
  let score = 100;
  for (const n of notes) {
    if (/missing|no .* field|cancel should not|editing mode lost/i.test(n)) score -= 25;
    else if (/draft count|title=|logo title|grab handle/i.test(n)) score -= 5;
    else score -= 10;
  }
  if (isMobile && notes.some((n) => /grab handle/i.test(n))) score -= 5;
  return Math.max(0, Math.min(100, score));
}

async function runProduct(browser, product, vp) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: Boolean(vp.isMobile),
    hasTouch: Boolean(vp.isMobile),
  });
  const page = await ctx.newPage();
  const row = {
    product: product.code,
    viewport: vp.label,
    overflow: false,
    tests: [],
    scores: {},
  };
  try {
    await login(page, product);
    assertTestingUrl(product.editUrl);
    await page.goto(product.editUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".gp-website-editor__toolbar, [data-website-inline]", {
      timeout: 30000,
    });
    row.overflow = await overflowOk(page);
    row.tests.push(await testWave1Shell(page));
    row.tests.push(await testTextDialog(page, product, vp));
    row.tests.push(await testMediaDialog(page, "image"));
    row.tests.push(await testMediaDialog(page, "logo"));
    for (const t of row.tests) {
      if (t.kind === "text") row.scores.text = scoreDialog(t.notes, vp.isMobile);
      if (t.kind === "image") row.scores.image = scoreDialog(t.notes, vp.isMobile);
      if (t.kind === "logo") row.scores.logo = scoreDialog(t.notes, vp.isMobile);
      if (t.kind === "wave1-shell") row.scores.wave1 = t.pass ? 96 : 80;
    }
  } catch (err) {
    row.error = err.message;
  } finally {
    await ctx.close();
  }
  return row;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const product of PRODUCTS) {
      for (const vp of VIEWPORTS) {
        results.push(await runProduct(browser, product, vp));
      }
    }
  } finally {
    await browser.close();
  }
  const report = {
    ok: results.every(
      (r) =>
        !r.error &&
        r.overflow &&
        r.tests.every((t) => t.pass) &&
        Object.values(r.scores).every((s) => s >= 95)
    ),
    results,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
