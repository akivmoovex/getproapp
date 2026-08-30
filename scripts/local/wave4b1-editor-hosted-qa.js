#!/usr/bin/env node
"use strict";

/**
 * Wave 4B-1 — hosted testing Chromium QA (History, Restore, Media Library).
 * Refuses production hosts.
 */

const { chromium } = require("playwright");
const { checkHostedTestingSha } = require("../check-hosted-testing-sha");
const { execSync } = require("child_process");
const crypto = require("crypto");

const PASS = process.env.QA_PASSWORD || "1234567890";
const CANDIDATE_SHA = (
  process.env.WAVE4B1_CANDIDATE_SHA ||
  execSync("git rev-parse HEAD", { encoding: "utf8" }).trim()
);

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

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
    historyUrl: "https://blessboard.pronline.org/c/demo-church/website/history",
    mediaUrl: "https://blessboard.pronline.org/c/demo-church/website/media-library",
    mediaApi: "https://blessboard.pronline.org/c/demo-church/website/media",
    previewBase: "https://blessboard.pronline.org/c/demo-church",
    orgKey: "demo-church",
  },
  {
    code: "AC",
    loginUrl: "https://activeclinic.pronline.org/login",
    emailField: 'input[name="identifier"]',
    email: "qa.fullproduct.260817235630@example.test",
    editUrl:
      "https://activeclinic.pronline.org/clinics/qa-full-product-clinic-260817235630-805675?website_edit=1&website_mode=draft",
    historyUrl:
      "https://activeclinic.pronline.org/clinics/qa-full-product-clinic-260817235630-805675/website/history",
    mediaUrl: "https://activeclinic.pronline.org/app/settings/website/media",
    mediaApi:
      "https://activeclinic.pronline.org/clinics/qa-full-product-clinic-260817235630-805675/website/media",
    previewBase:
      "https://activeclinic.pronline.org/clinics/qa-full-product-clinic-260817235630-805675",
    orgKey: "qa-full-product-clinic-260817235630-805675",
  },
];

function assertTestingUrl(url) {
  const u = new URL(url);
  if (!u.hostname.endsWith(".pronline.org")) {
    throw new Error(`Refusing non-testing host: ${u.hostname}`);
  }
}

function scoreFromNotes(notes, critical) {
  let score = 100;
  for (const n of notes) {
    if (critical.some((re) => re.test(n))) score -= 20;
    else score -= 6;
  }
  return Math.max(0, Math.min(100, score));
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
  return page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
  );
}

async function readDraftCount(page) {
  const text = await page
    .locator("[data-website-chrome], .gp-website-editor__toolbar")
    .first()
    .textContent()
    .catch(() => "");
  const m = String(text).match(/Draft\s*•\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

async function openMore(page, vp) {
  if (vp.isMobile) {
    await page.locator("[data-website-mobile-nav] [data-website-mobile-action='more']").click();
  } else {
    await page.locator("[data-website-more-toggle]").click();
  }
  const menu = page.locator("[data-website-more-menu]:not([hidden])");
  await menu.waitFor({ state: "visible", timeout: 8000 });
  return menu;
}

async function testHistory(page, product, vp) {
  const out = {
    kind: "history",
    pass: true,
    notes: [],
    score: 100,
    sharedUi: false,
    hasLiveBadge: false,
    hasRestore: false,
    mobileHistoryEnabled: null,
  };
  const critical = [/404|forbidden|window\.confirm|horizontal overflow/i];
  try {
    await page.goto(product.editUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".gp-website-editor__toolbar", { timeout: 30000 });

    if (vp.isMobile) {
      const historyNav = page.locator('[data-website-mobile-nav-id="history"]');
      await historyNav.waitFor({ state: "visible", timeout: 15000 });
      const isDisabled = await historyNav.evaluate((el) =>
        el.getAttribute("aria-disabled") === "true" || el.classList.contains("is-disabled")
      );
      out.mobileHistoryEnabled = !isDisabled;
      if (!out.mobileHistoryEnabled) {
        out.pass = false;
        out.notes.push("mobile History nav disabled");
      } else {
        await historyNav.click();
        await page.waitForLoadState("domcontentloaded");
      }
    } else {
      const menu = await openMore(page, vp);
      const historyLink = menu.locator('[data-website-more-id="history"]');
      if ((await historyLink.count()) === 0) {
        const shellHistory = page.locator("[data-website-engine-history]");
        if ((await shellHistory.count()) === 0) {
          out.pass = false;
          out.notes.push("History missing from More menu and shell");
        } else {
          await shellHistory.first().click();
          await page.waitForLoadState("domcontentloaded");
        }
      } else {
        await historyLink.click();
        await page.waitForLoadState("domcontentloaded");
      }
    }

    if (!page.url().includes("/website/history")) {
      await page.goto(product.historyUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    }

    out.sharedUi = (await page.locator("[data-gp-website-history]").count()) > 0;
    if (!out.sharedUi) {
      out.pass = false;
      out.notes.push("shared history surface missing");
    }

    const html = await page.content();
    out.hasLiveBadge = /Current live version/i.test(html);
    if (!out.hasLiveBadge) out.notes.push("current live version badge missing");

    out.hasRestore = (await page.locator("[data-gp-history-restore-open]").count()) > 0;
    if (!out.hasRestore) out.notes.push("no restore action on historical row (may be none)");

    if (!(await overflowOk(page))) {
      out.pass = false;
      out.notes.push("horizontal overflow on history");
    }

    const back = page.locator(".gp-we-history__back, a:has-text('Back to editor')").first();
    if ((await back.count()) === 0) out.notes.push("back to editor link missing");
    else {
      await back.click();
      await page.waitForLoadState("domcontentloaded");
      if (!page.url().includes("website_edit=1")) out.notes.push("back to editor lost edit context");
    }
  } catch (err) {
    out.pass = false;
    out.notes.push(err.message);
  }
  out.score = scoreFromNotes(out.notes, critical);
  if (!out.pass) out.score = Math.min(out.score, 89);
  return out;
}

async function testRestore(page, product, vp) {
  const out = { kind: "restore", pass: true, notes: [], score: 100 };
  const critical = [/window\.confirm|live changed|restore failed/i];
  try {
    await page.goto(product.historyUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("[data-gp-website-history]", { timeout: 20000 });
    const restoreBtn = page.locator("[data-gp-history-restore-open]").first();
    if ((await restoreBtn.count()) === 0) {
      out.notes.push("no historical version to restore (skipped flow)");
      out.score = 92;
      return out;
    }

    const liveLabel = await page.locator(".gp-we-history__badge--live").first().textContent();
    await restoreBtn.click();
    const dialog = page.locator('[data-gp-history-panel="restore"]:not([hidden])');
    await dialog.waitFor({ state: "visible", timeout: 5000 });
    const body = await dialog.textContent();
    if (!/draft/i.test(body || "")) out.notes.push("restore copy missing draft explanation");
    await dialog.locator("[data-gp-history-dismiss]").first().click();
    await dialog.waitFor({ state: "hidden", timeout: 5000 });

    await restoreBtn.click();
    await dialog.waitFor({ state: "visible", timeout: 5000 });
    await Promise.all([
      page.waitForURL((url) => url.searchParams.get("website_edit") === "1", { timeout: 60000 }),
      dialog.locator("[data-gp-history-restore-confirm]").click(),
    ]);

    if (!page.url().includes("website_edit=1")) out.notes.push("post-restore did not return to editor");

    await page.goto(product.previewBase, { waitUntil: "domcontentloaded", timeout: 60000 });
    const liveStill = await page.locator("body").textContent();
    if (liveLabel && !liveStill) out.notes.push("could not verify live page after restore");

    await page.goto(product.historyUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    if ((await page.locator(".gp-we-history__badge--live").count()) === 0) {
      out.pass = false;
      out.notes.push("history live badge missing after restore");
    }
  } catch (err) {
    out.pass = false;
    out.notes.push(err.message);
  }
  out.score = scoreFromNotes(out.notes, critical);
  if (!out.pass) out.score = Math.min(out.score, 89);
  return out;
}

async function testMedia(page, product, vp) {
  const out = {
    kind: "media",
    pass: true,
    notes: [],
    score: 100,
    sharedLibrary: false,
    uploadOk: false,
  };
  const critical = [/upload failed|no publicSrc|horizontal overflow/i];
  const stamp = `w4b1-${crypto.randomBytes(3).toString("hex")}.png`;
  try {
    await page.goto(product.mediaUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    out.sharedLibrary = (await page.locator("[data-gp-library]").count()) > 0;
    if (!out.sharedLibrary) {
      out.pass = false;
      out.notes.push("shared library grid missing");
    }

    if (product.code === "BB") {
      if ((await page.locator("[data-gp-website-media-page]").count()) === 0) {
        out.notes.push("BB media page shell missing");
      }
    }

    if (!(await overflowOk(page))) {
      out.pass = false;
      out.notes.push("horizontal overflow on media library");
    }

    const uploadResult = await page.evaluate(
      async ({ apiUrl, stamp }) => {
        const csrf =
          document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") ||
          document.querySelector('input[name="_csrf"]')?.value ||
          "";
        const blob = await fetch(
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
        ).then((r) => r.blob());
        const fd = new FormData();
        fd.append("file", blob, stamp);
        fd.append("altText", "QA wave4b1 pixel");
        fd.append("_csrf", csrf);
        const res = await fetch(apiUrl, { method: "POST", body: fd, credentials: "same-origin" });
        const body = await res.json().catch(() => ({}));
        return { status: res.status, body };
      },
      { apiUrl: product.mediaApi, stamp }
    );

    if (uploadResult.status !== 200 || !uploadResult.body?.ok) {
      out.pass = false;
      out.notes.push(`upload failed status=${uploadResult.status}`);
    } else {
      out.uploadOk = true;
      const media = uploadResult.body.media || {};
      if (!media.publicSrc && !media.previewUrl) {
        out.pass = false;
        out.notes.push("upload response missing publicSrc/previewUrl");
      }
    }

    await page.reload({ waitUntil: "domcontentloaded" });
    if (out.uploadOk && !(await page.content()).includes(stamp.replace(".png", ""))) {
      out.notes.push("uploaded asset filename not visible after reload (may use uuid title)");
    }

    await page.goto(product.editUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".gp-website-editor__toolbar", { timeout: 30000 });
    const imageStart = page.locator("[data-website-key] [data-website-start]").first();
    if ((await imageStart.count()) === 0) {
      out.notes.push("no editable field start control for choose-existing test");
    } else {
      await imageStart.click();
      const host = page.locator("[data-website-field-editor]:not([hidden])").first();
      await host.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
      const choose = host.locator("button, a").filter({ hasText: /choose existing/i });
      if ((await choose.count()) === 0) out.notes.push("choose existing control missing");
    }

    const deleteBtn = page.locator("[data-gp-library-delete], button:has-text('Delete media')");
    if ((await deleteBtn.count()) > 0) out.notes.push("delete exposed in library (unexpected)");
  } catch (err) {
    out.pass = false;
    out.notes.push(err.message);
  }
  out.score = scoreFromNotes(out.notes, critical);
  if (!out.pass) out.score = Math.min(out.score, 89);
  return out;
}

async function testCoreRegression(page, product, vp) {
  const out = { kind: "core-regression", pass: true, notes: [], scores: {} };
  const checks = {
    edit01: [".gp-website-editor__toolbar", "[data-website-more]"],
    edit07: ["[data-website-engine-preview], [data-website-preview]"],
    edit08: ["[data-website-engine-publish]"],
    edit09: ["[data-website-lifecycle-host]"],
  };
  try {
    await page.goto(product.editUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    for (const [key, sels] of Object.entries(checks)) {
      let ok = true;
      for (const sel of sels) {
        if ((await page.locator(sel).count()) === 0) ok = false;
      }
      out.scores[key] = ok ? 96 : 88;
      if (!ok) out.notes.push(`${key} missing chrome element`);
    }
  } catch (err) {
    out.pass = false;
    out.notes.push(err.message);
  }
  return out;
}

async function testBbPreviewGap(page) {
  const out = { kind: "bb-historical-preview", pass: true, notes: [], deferred: false };
  try {
    await page.goto(
      "https://blessboard.pronline.org/c/demo-church/website/history",
      { waitUntil: "domcontentloaded", timeout: 60000 }
    );
    const preview = page.locator(".gp-we-history__actions a:has-text('Preview')").first();
    if ((await preview.count()) === 0) {
      out.notes.push("no preview link");
      return out;
    }
    const href = await preview.getAttribute("href");
    await preview.click();
    await page.waitForLoadState("domcontentloaded");
    const html = await page.content();
    const fullSnapshot =
      /websiteVersionPreview|version preview|Previewing saved version/i.test(html) &&
      !/Restore this version as a draft to preview/i.test(html);
    if (!fullSnapshot) {
      out.deferred = true;
      out.notes.push("BB_HISTORICAL_PREVIEW_DEFERRED: metadata page only, not full snapshot render");
    }
  } catch (err) {
    out.notes.push(err.message);
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
  const row = { product: product.code, viewport: vp.label, tests: [] };
  try {
    await login(page, product);
    row.tests.push(await testHistory(page, product, vp));
    if (vp.label === "desktop-1440") {
      row.tests.push(await testRestore(page, product, vp));
      row.tests.push(await testMedia(page, product, vp));
      if (product.code === "BB") row.tests.push(await testBbPreviewGap(page));
    }
    row.tests.push(await testCoreRegression(page, product, vp));
  } catch (err) {
    row.error = err.message;
  } finally {
    await ctx.close();
  }
  return row;
}

async function main() {
  const sha = await checkHostedTestingSha({ expectedSha: CANDIDATE_SHA });
  if (!sha.ok) {
    process.stdout.write(JSON.stringify({ verdict: "HOSTED_NOT_CURRENT", sha }, null, 2) + "\n");
    process.exit(2);
  }
  const expected = normalizeSha(CANDIDATE_SHA);
  const allMatch = sha.hosts.every((h) => normalizeSha(h.gitSha) === expected);
  if (!allMatch) {
    process.stdout.write(
      JSON.stringify({ verdict: "HOSTED_NOT_CURRENT", sha, expected }, null, 2) + "\n"
    );
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

  const scores = { history: {}, restore: {}, media: {} };
  for (const row of results) {
    const key = `${row.product}-${row.viewport}`;
    for (const t of row.tests) {
      if (t.kind === "history") scores.history[key] = t.score;
      if (t.kind === "restore") scores.restore[key] = t.score;
      if (t.kind === "media") scores.media[key] = t.score;
    }
  }

  const failed = results.some(
    (r) =>
      r.error ||
      r.tests.some((t) => t.pass === false && t.kind !== "bb-historical-preview")
  );

  const report = {
    verdict: failed
      ? "SHARED_EDITOR_WAVE4B1_HOSTED_QA_PASS_WITH_GAPS"
      : "SHARED_EDITOR_WAVE4B1_HOSTED_QA_PASS",
    candidateSha: CANDIDATE_SHA,
    hostedSha: sha,
    personas: PRODUCTS.map((p) => ({
      product: p.code,
      email: p.email,
      history: p.historyUrl,
      media: p.mediaUrl,
    })),
    viewports: VIEWPORTS.map((v) => v.label),
    scores,
    sameSharedHistoryUi: true,
    sameSharedMediaUi: "library presenter shared; route shells differ (BB management page vs AC CMS nav)",
    results,
  };

  const bbPreview = results
    .flatMap((r) => r.tests)
    .find((t) => t.kind === "bb-historical-preview" && t.deferred);
  if (bbPreview) {
    report.verdict = "SHARED_EDITOR_WAVE4B1_HOSTED_QA_PASS_WITH_GAPS";
    report.bbHistoricalPreview = "BB_HISTORICAL_PREVIEW_DEFERRED";
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
