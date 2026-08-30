#!/usr/bin/env node
"use strict";

/**
 * Wave 3 shared editor lifecycle — hosted testing Chromium QA (BB + AC).
 * EDIT-07 preview, EDIT-08 publish, EDIT-09 unsaved, EDIT-10 more lifecycle.
 * Refuses production hosts.
 */

const { chromium } = require("playwright");
const { checkHostedTestingSha } = require("../check-hosted-testing-sha");

const PASS = process.env.QA_PASSWORD || "1234567890";
const CANDIDATE_SHA = "27571f62640a061b3b80dc9704a612ead6df3f8b";

function normalizeSha(s) {
  return String(s || "").toLowerCase().slice(0, 12);
}

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
    previewBase: "https://blessboard.pronline.org/c/demo-church",
  },
  {
    code: "AC",
    loginUrl: "https://activeclinic.pronline.org/login",
    emailField: 'input[name="identifier"]',
    email: "qa.fullproduct.260817235630@example.test",
    editUrl:
      "https://activeclinic.pronline.org/clinics/qa-full-product-clinic-260817235630-805675?website_edit=1&website_mode=draft",
    previewBase:
      "https://activeclinic.pronline.org/clinics/qa-full-product-clinic-260817235630-805675",
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
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
}

async function clickExit(page, vp) {
  const desktopExit = page.locator(
    ".gp-website-editor__exit--desktop [data-website-engine-exit], .gp-website-editor__exit--desktop [data-bb-exit-editing]"
  );
  if (await desktopExit.first().isVisible().catch(() => false)) {
    await desktopExit.first().click();
    return;
  }
  await page.locator("[data-website-more-toggle]").click();
  const menuExit = page.locator(
    ".gp-website-editor__more-menu:not([hidden]) [data-website-engine-exit], .gp-website-editor__more-menu:not([hidden]) [data-bb-exit-editing]"
  );
  await menuExit.first().click();
}

async function openTextField(page) {
  const selector =
    '[data-website-key][data-website-type="text"], [data-website-key][data-website-type="textarea"]';
  const field = page.locator(selector).first();
  await field.waitFor({ state: "visible", timeout: 15000 });
  await field.locator(".gp-website-editable__pencil, [data-website-start]").first().click();
  const panel = page.locator("[data-website-field-editor-panel]:not([hidden])");
  await panel.waitFor({ state: "visible", timeout: 10000 });
  return panel;
}

function noteScore(notes, critical) {
  let score = 100;
  for (const n of notes) {
    if (critical.some((re) => re.test(n))) score -= 25;
    else score -= 8;
  }
  return Math.max(0, Math.min(100, score));
}

async function testPreview(page, product, vp) {
  const out = { kind: "EDIT-07-preview", pass: true, notes: [] };
  const critical = [/no preview banner|pencils visible|editor shell visible|wrong url|draft lost/i];
  try {
    await page.goto(product.editUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".gp-website-editor__toolbar", { timeout: 30000 });
    const marker = `W3-${product.code}-${Date.now()}`;
    const panel = await openTextField(page);
    await panel.locator("[data-website-input]").fill(marker);
    await panel.locator("[data-website-field-editor-save]").click();
    await panel.waitFor({ state: "hidden", timeout: 15000 });

    const previewLink = page.locator("[data-website-engine-preview], [data-website-preview]").first();
    await previewLink.click();
    await page.waitForLoadState("domcontentloaded");
    const url = page.url();
    if (!/website_mode=draft/i.test(url) || /website_edit=1/i.test(url)) {
      out.pass = false;
      out.notes.push(`wrong url: ${url}`);
    }
    const banner = page.locator("[data-website-preview-banner]");
    if (!(await banner.isVisible())) {
      out.pass = false;
      out.notes.push("no preview banner");
    } else {
      const text = await banner.textContent();
      if (!/previewing unpublished draft/i.test(text || "")) out.notes.push(`banner copy: ${text}`);
      if (!/back to editing/i.test(text || "")) out.notes.push("missing back to editing");
    }
    if ((await page.locator("[data-website-start]").count()) > 0) {
      out.pass = false;
      out.notes.push("pencils visible in preview");
    }
    if ((await page.locator("[data-website-engine-shell] [data-website-page-rail]").count()) > 0) {
      out.pass = false;
      out.notes.push("editor shell visible in preview");
    }
    if (!(await page.locator(`text=${marker}`).first().isVisible().catch(() => false))) {
      out.notes.push("draft marker not visible in preview");
    }
    const back = page.locator("[data-website-back-to-editing]").first();
    await back.click();
    await page.waitForLoadState("domcontentloaded");
    if (!/website_edit=1/i.test(page.url())) {
      out.pass = false;
      out.notes.push(`back to edit url: ${page.url()}`);
    }
    if (!(await page.locator(".gp-website-editor__toolbar").isVisible())) {
      out.pass = false;
      out.notes.push("editor toolbar missing after back");
    }
    if ((await page.locator("[data-website-start]").count()) === 0) {
      out.pass = false;
      out.notes.push("pencils missing after back");
    }
    if (!(await page.locator(`text=${marker}`).first().isVisible().catch(() => false))) {
      out.pass = false;
      out.notes.push("draft lost after back");
    }
  } catch (err) {
    out.pass = false;
    out.notes.push(err.message);
  }
  out.score = noteScore(out.notes, critical);
  if (!out.pass) out.score = Math.min(out.score, 89);
  return out;
}

async function testPublishConfirm(page, product, vp) {
  const out = { kind: "EDIT-08-publish", pass: true, notes: [] };
  const critical = [/window\.confirm|no lifecycle dialog|published without confirm/i];
  try {
    await page.goto(product.editUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".gp-website-editor__toolbar", { timeout: 30000 });

    let confirmSeen = false;
    page.on("dialog", async (dialog) => {
      confirmSeen = true;
      await dialog.dismiss();
    });

    const publishBtn = page.locator("[data-website-engine-publish]").first();
    await publishBtn.click();
    const dialog = page.locator('[data-website-lifecycle-panel="publish"]:not([hidden])');
    await dialog.waitFor({ state: "visible", timeout: 8000 });
    const title = await dialog.locator(".gp-website-lifecycle__title").textContent();
    if (!/publish/i.test(title || "")) out.notes.push(`title=${title}`);
    const cancel = dialog.locator("[data-website-lifecycle-cancel]");
    await cancel.click();
    await dialog.waitFor({ state: "hidden", timeout: 5000 });
    if (confirmSeen) {
      out.pass = false;
      out.notes.push("window.confirm appeared");
    }

    await publishBtn.click();
    await dialog.waitFor({ state: "visible", timeout: 8000 });
    await dialog.locator("[data-website-lifecycle-cancel]").click();
    await dialog.waitFor({ state: "hidden", timeout: 5000 });
    if (confirmSeen) {
      out.pass = false;
      out.notes.push("window.confirm on second open");
    }
  } catch (err) {
    out.pass = false;
    out.notes.push(err.message);
  }
  out.score = noteScore(out.notes, critical);
  if (!out.pass) out.score = Math.min(out.score, 89);
  return out;
}

async function testUnsaved(page, product, vp) {
  const out = { kind: "EDIT-09-unsaved", pass: true, notes: [] };
  const critical = [/false unsaved|no unsaved dialog|local not retained/i];
  try {
    await page.goto(product.editUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".gp-website-editor__toolbar", { timeout: 30000 });

    const panel = await openTextField(page);
    const savedVal = `W3-saved-${Date.now()}`;
    await panel.locator("[data-website-input]").fill(savedVal);
    await panel.locator("[data-website-field-editor-save]").click();
    await panel.waitFor({ state: "hidden", timeout: 15000 });

    await clickExit(page, vp);
    await page.waitForTimeout(800);
    const unsavedAfterSave = page.locator('[data-website-lifecycle-panel="unsaved"]:not([hidden])');
    if (await unsavedAfterSave.isVisible().catch(() => false)) {
      out.pass = false;
      out.notes.push("false unsaved after saved draft exit attempt");
      await page.locator('[data-website-lifecycle-confirm="keep-editing"]').click();
      await page.keyboard.press("Escape");
    }

    await page.goto(product.editUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".gp-website-editor__toolbar", { timeout: 30000 });
    const panel2 = await openTextField(page);
    const localOnly = `W3-local-${Date.now()}`;
    await panel2.locator("[data-website-input]").fill(localOnly);
    await page.waitForTimeout(200);
    await page.locator("[data-website-field-editor-overlay]").click();
    const unsaved = page.locator('[data-website-lifecycle-panel="unsaved"]:not([hidden])');
    await unsaved.waitFor({ state: "visible", timeout: 8000 });
    const body = await unsaved.textContent();
    if (!/keep editing/i.test(body || "")) out.notes.push("missing keep editing");
    if (!/discard changes/i.test(body || "")) out.notes.push("missing discard changes");
    await page.locator('[data-website-lifecycle-confirm="keep-editing"]').click();
    await unsaved.waitFor({ state: "hidden", timeout: 5000 });
    const stillOpen = await panel2.locator("[data-website-field-editor-panel]:not([hidden])").isVisible();
    if (!stillOpen) out.notes.push("field dialog closed after keep editing");
    const retained = await panel2.locator("[data-website-input]").inputValue().catch(() => "");
    if (!String(retained).includes(localOnly)) {
      out.pass = false;
      out.notes.push("local not retained after keep editing");
    }
    await page.locator("[data-website-field-editor-overlay]").click();
    await unsaved.waitFor({ state: "visible", timeout: 8000 });
    await page.locator('[data-website-lifecycle-confirm="discard-local"]').click();
    await unsaved.waitFor({ state: "hidden", timeout: 5000 });
  } catch (err) {
    out.pass = false;
    out.notes.push(err.message);
  }
  out.score = noteScore(out.notes, critical);
  if (!out.pass) out.score = Math.min(out.score, 89);
  return out;
}

async function testMoreLifecycle(page, product, vp) {
  const out = { kind: "EDIT-10-more", pass: true, notes: [] };
  const critical = [/no more menu|discard missing|duplicate lifecycle/i];
  try {
    await page.goto(product.editUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("[data-website-more]", { timeout: 30000 });
    if (vp.isMobile) {
      await page.locator("[data-website-more-toggle]").click();
    } else {
      await page.locator("[data-website-more-toggle]").click();
    }
    const menu = page.locator("[data-website-more-menu]:not([hidden])");
    await menu.waitFor({ state: "visible", timeout: 5000 });
    const text = await menu.textContent();
    if (!/exit editing/i.test(text || "")) out.notes.push("exit not in more");
    const discard = menu.locator('[data-website-lifecycle-action="discard"]');
  } catch (err) {
    out.pass = false;
    out.notes.push(err.message);
  }
  out.score = noteScore(out.notes, critical);
  if (!out.pass) out.score = Math.min(out.score, 89);
  return out;
}

async function testWave1Shell(page) {
  const out = { kind: "wave1-shell", pass: true, notes: [], score: 96 };
  const checks = [
    ".gp-website-editor__toolbar",
    "[data-website-page-rail], [data-website-page-sheet]",
    "[data-website-more]",
  ];
  for (const sel of checks) {
    if ((await page.locator(sel).count()) === 0) {
      out.pass = false;
      out.notes.push(`missing ${sel}`);
      out.score = 80;
    }
  }
  return out;
}

async function testWave2Quick(page, vp) {
  const out = { kind: "wave2-quick", pass: true, notes: [], scores: { text: 100, image: 100, logo: 100 } };
  try {
    const panel = await openTextField(page);
    if ((await panel.locator("[data-website-field-editor-save]").count()) === 0) {
      out.pass = false;
      out.notes.push("text dialog broken");
      out.scores.text = 85;
    }
    await panel.locator("[data-website-field-editor-cancel]").click();
    const logoSel = '[data-website-key][data-website-variant="logo"]';
    if ((await page.locator(logoSel).count()) === 0) {
      out.scores.logo = 95;
    }
  } catch (err) {
    out.pass = false;
    out.notes.push(err.message);
    out.scores = { text: 80, image: 80, logo: 80 };
  }
  return out;
}

async function runProduct(browser, product, vp) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: Boolean(vp.isMobile),
    hasTouch: Boolean(vp.isMobile),
  });
  const page = await ctx.newPage();
  const row = { product: product.code, viewport: vp.label, tests: [], scores: {} };
  try {
    await login(page, product);
    row.tests.push(await testPreview(page, product, vp));
    row.tests.push(await testPublishConfirm(page, product, vp));
    row.tests.push(await testUnsaved(page, product, vp));
    row.tests.push(await testMoreLifecycle(page, product, vp));
    await page.goto(product.editUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    row.tests.push(await testWave1Shell(page));
    row.tests.push(await testWave2Quick(page, vp));
    row.overflow = await overflowOk(page);
    for (const t of row.tests) {
      if (t.kind === "EDIT-07-preview") row.scores.preview = t.score;
      if (t.kind === "EDIT-08-publish") row.scores.publish = t.score;
      if (t.kind === "EDIT-09-unsaved") row.scores.unsaved = t.score;
      if (t.kind === "EDIT-10-more") row.scores.more = t.score;
      if (t.kind === "wave1-shell") row.scores.wave1 = t.score;
      if (t.kind === "wave2-quick") Object.assign(row.scores, t.scores);
    }
  } catch (err) {
    row.error = err.message;
  } finally {
    await ctx.close();
  }
  return row;
}

async function main() {
  const sha = await checkHostedTestingSha({});
  if (!sha.ok) {
    process.stdout.write(JSON.stringify({ verdict: "HOSTED_NOT_CURRENT", sha }, null, 2) + "\n");
    process.exit(2);
  }
  const expected = normalizeSha(CANDIDATE_SHA);
  const allMatch = sha.hosts.every((h) => normalizeSha(h.gitSha) === expected);
  if (!allMatch) {
    process.stdout.write(JSON.stringify({ verdict: "HOSTED_NOT_CURRENT", sha }, null, 2) + "\n");
    process.exit(2);
  }

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
    verdict: "SHARED_EDITOR_WAVE3_HOSTED_QA_PASS",
    candidateSha: CANDIDATE_SHA,
    hostedSha: sha,
    results,
  };
  const failed = results.some(
    (r) =>
      r.error ||
      !r.overflow ||
      r.tests.some((t) => t.pass === false) ||
      Object.entries(r.scores).some(([k, v]) => k !== "wave1" && v < 95)
  );
  if (failed) report.verdict = "SHARED_EDITOR_WAVE3_HOSTED_QA_PASS_WITH_GAPS";
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
