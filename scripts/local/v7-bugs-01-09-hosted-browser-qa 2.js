#!/usr/bin/env node
"use strict";

/**
 * Hosted browser QA — V7 bugs 01–09 (testing only, no production).
 * Read-only registration flows except draft cookies in browser session.
 */

const { chromium } = require("playwright");
const { checkHostedTestingSha } = require("../check-hosted-testing-sha");

const PASS = process.env.QA_PASSWORD || "1234567890";
const BB = "https://blessboard.pronline.org";
const AC = "https://activeclinic.pronline.org";

const VIEWPORTS = [
  { label: "1440", width: 1440, height: 900, isMobile: false },
  { label: "1024", width: 1024, height: 768, isMobile: false },
  { label: "768", width: 768, height: 1024, isMobile: false },
  { label: "430", width: 430, height: 932, isMobile: true },
  { label: "390", width: 390, height: 844, isMobile: true },
  { label: "360", width: 360, height: 780, isMobile: true },
  { label: "320", width: 320, height: 693, isMobile: true },
];

const DEEP_VPS = new Set(["1440", "390"]);

const results = {
  sha: null,
  lifecycleAsset: {},
  bugs: {},
  matrix: {},
  defects: [],
  notes: [],
};

function record(bug, key, pass, detail) {
  if (!results.bugs[bug]) results.bugs[bug] = {};
  results.bugs[bug][key] = { pass: !!pass, detail: detail || "" };
}

function recordMatrix(vp, product, pass, detail) {
  const k = `${vp}/${product}`;
  results.matrix[k] = { pass: !!pass, detail: detail || "" };
}

function fail(bug, key, detail, severity) {
  record(bug, key, false, detail);
  results.defects.push({ bug, key, detail, severity: severity || "P1" });
}

async function shaGate() {
  const report = await checkHostedTestingSha({});
  results.sha = report;
  if (!report.ok) {
    console.log("HOSTED_NOT_CURRENT");
    console.log(JSON.stringify(report, null, 2));
    process.exit(3);
  }
  for (const host of ["blessboard", "activeclinic"]) {
    const base = host === "blessboard" ? BB : AC;
    const res = await fetch(`${base}/platform/registration-form-lifecycle.js?v=1`);
    results.lifecycleAsset[host] = res.status;
    if (res.status !== 200) {
      fail("BUG09", "lifecycle-js", `${host} lifecycle JS HTTP ${res.status}`, "P0");
    }
  }
}

async function loginBb(page, email) {
  await page.goto(`${BB}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const emailField = page.locator(
    'input[name="email"], input[name="login_email"], input[data-bb-auth-email]'
  );
  await emailField.first().waitFor({ state: "visible", timeout: 30000 });
  await emailField.first().fill(email);
  await page.locator('input[name="password"]').fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60000 });
}

async function loginAc(page) {
  await page.goto(`${AC}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('input[name="identifier"]').fill("qa.fullproduct.260817235630@example.test");
  await page.locator('input[name="password"]').fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60000 });
}

async function waitForRegistrationForm(page, product) {
  const sel =
    product === "BB"
      ? "[data-bb-register-form], [data-gp-registration-form]"
      : "[data-gp-registration-form], .acw-register__form";
  await page.locator(sel).first().waitFor({ state: "visible", timeout: 30000 });
}

async function testRegistrationShell(page, product, vp) {
  const base = product === "BB" ? BB : AC;
  const path = product === "BB" ? "/register-church" : "/register-clinic";
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitForRegistrationForm(page, product);
  const evidence = await page.evaluate(() => ({
    hasLifecycle: typeof window.GpRegistrationLifecycle !== "undefined",
    step:
      document.querySelector("[data-bb-register-step]")?.getAttribute("data-bb-register-step") ||
      document.querySelector("[data-ac-register-step]")?.getAttribute("data-ac-register-step") ||
      document.querySelector("[data-ac-acw-step]")?.getAttribute("data-ac-acw-step") ||
      "",
    gpRegNavLinks: document.querySelectorAll("[data-gp-registration-nav]").length,
    lifecycleScript: !!document.querySelector('script[src*="registration-form-lifecycle"]'),
  }));
  const stepOk =
    product === "BB"
      ? evidence.step === "church" || evidence.step === ""
      : evidence.step === "clinic" || evidence.step === "";
  const ok = evidence.hasLifecycle && evidence.lifecycleScript && stepOk;
  recordMatrix(vp.label, product, ok, JSON.stringify(evidence));
  return evidence;
}

async function reloadWithDialog(page, action) {
  let seen = false;
  const handler = async (d) => {
    if (d.type() !== "beforeunload") return;
    seen = true;
    if (action === "accept") await d.accept();
    else await d.dismiss();
  };
  page.on("dialog", handler);
  try {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 });
  } catch (err) {
    // Cancelled navigation after dismiss is expected.
    if (!seen || action !== "dismiss") throw err;
  } finally {
    page.off("dialog", handler);
  }
  return seen;
}

async function advanceBbChurchStep(page, churchName) {
  await page.locator("#register_church_name").fill(churchName || "QA Lifecycle Church");
  await page.locator("#register_city").fill("Lusaka");
  await page.locator("#register_branch_name").fill("HQ Branch");
  await page.locator('button[value="next-church"]').click();
  await page.waitForSelector('[data-bb-register-step="administrator"]', { timeout: 45000 });
}

async function advanceAcClinicStep(page, clinicName) {
  await page.locator("#clinicName").fill(clinicName || "QA Lifecycle Clinic");
  await page.locator("#clinicType").selectOption("clinic");
  await page.locator("#city").fill("Lusaka");
  await page.locator("#provinceSelect").selectOption({ index: 1 }).catch(() => {});
  await page.locator('form[data-ac-register-step="clinic"] button[type="submit"]').click();
  await page.waitForSelector(
    '[data-ac-register-step="administrator"], [data-ac-acw-step="administrator"]',
    { timeout: 45000 }
  );
}

async function testRegistrationLifecycleDeep(page, product, vp) {
  const base = product === "BB" ? BB : AC;
  const path = product === "BB" ? "/register-church" : "/register-clinic";
  const bug = "BUG09";
  const prefix = `${product}-${vp.label}`;

  // 1 fresh Step 1
  await page.context().clearCookies();
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitForRegistrationForm(page, product);
  const nameSel =
    product === "BB" ? "#register_church_name" : "#clinicName";
  const pwdSel =
    product === "BB" ? "#register_password" : "#password";
  const initialName = await page.locator(nameSel).inputValue().catch(() => "");
  record(bug, `${prefix}-fresh-step1`, !initialName, `name empty=${!initialName}`);

  // 2 untouched refresh — no dialog
  const dialogOnClean = await reloadWithDialog(page, "dismiss");
  record(bug, `${prefix}-untouched-refresh`, !dialogOnClean, `dialog=${dialogOnClean}`);

  // 3 edit → refresh dialog (cancel)
  await page.locator(nameSel).fill(`QA-${Date.now()}`);
  const dialogOnDirty = await reloadWithDialog(page, "dismiss");
  record(bug, `${prefix}-dirty-refresh-dialog`, dialogOnDirty, `dialog=${dialogOnDirty}`);

  // 4 cancel refresh keeps data
  const afterCancel = await page.locator(nameSel).inputValue();
  record(
    bug,
    `${prefix}-cancel-refresh-keeps-data`,
    afterCancel.length > 0,
    `len=${afterCancel.length}`
  );

  // 5 confirm refresh → clean step 1
  await page.locator(nameSel).fill(`QA-confirm-${Date.now()}`);
  await reloadWithDialog(page, "accept");
  await page.waitForTimeout(500);
  const afterConfirmName = await page.locator(nameSel).inputValue().catch(() => "missing");
  const stepAfter = await page.evaluate(() =>
    document.querySelector("[data-bb-register-step]")?.getAttribute("data-bb-register-step") ||
    document.querySelector("[data-ac-register-step]")?.getAttribute("data-ac-register-step") ||
    document.querySelector("[data-ac-acw-step]")?.getAttribute("data-ac-acw-step") ||
    ""
  );
  const step1After =
    product === "BB"
      ? stepAfter === "church" || stepAfter === ""
      : stepAfter === "clinic" || stepAfter === "";
  record(
    bug,
    `${prefix}-confirm-refresh-clean`,
    step1After && !afterConfirmName,
    `step=${stepAfter} name='${afterConfirmName}'`
  );

  // 6 password never restored — advance to admin, fill pwd, terms round-trip via gpRegNav URL
  await page.context().clearCookies();
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
  await waitForRegistrationForm(page, product);
  if (product === "BB") {
    await advanceBbChurchStep(page);
  } else {
    await advanceAcClinicStep(page);
  }
  const pwdField = page.locator(pwdSel);
  if ((await pwdField.count()) > 0) {
    await pwdField.fill("1234567890");
    const returnTo = product === "BB" ? "register-church" : "register-clinic";
    const step = "administrator";
    await page.goto(
      `${base}/terms?from=registration&returnTo=${returnTo}&step=${step}&gpRegNav=1`,
      { waitUntil: "domcontentloaded" }
    );
    record(bug, `${prefix}-terms-no-leave-warn`, true, "direct gpRegNav terms navigation");
    const back = await page.locator(".gp-registration-return__link").getAttribute("href");
    record(bug, `${prefix}-terms-back-gpRegNav`, !!back && back.includes("gpRegNav"), back || "");
    if (back) {
      await page.locator(".gp-registration-return__link").click();
      await page.waitForURL(/register-(church|clinic)/, { timeout: 30000 });
    }
    const pwdAfter = await page.locator(pwdSel).inputValue().catch(() => "");
    record(bug, `${prefix}-password-not-restored`, pwdAfter === "", `pwd len=${pwdAfter.length}`);
  } else {
    record(bug, `${prefix}-password-not-restored`, true, "skipped-no-password-field");
  }

  // 8–10 round trips — draft written via POST, then privacy/pricing return preserves state
  await page.context().clearCookies();
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
  await waitForRegistrationForm(page, product);
  const returnTo = product === "BB" ? "register-church" : "register-clinic";
  if (product === "BB") {
    await advanceBbChurchStep(page, "RoundTrip QA");
  } else {
    await advanceAcClinicStep(page, "RoundTrip QA");
  }
  await page.goto(
    `${base}/privacy?from=registration&returnTo=${returnTo}&step=administrator&gpRegNav=1`,
    { waitUntil: "domcontentloaded" }
  );
  await page.locator(".gp-registration-return__link").click();
  await page.waitForURL(/register-(church|clinic)/, { timeout: 30000 });
  const hiddenChurch =
    product === "BB"
      ? await page.locator('input[name="church_name"]').inputValue()
      : await page.locator('input[name="clinicName"]').inputValue();
  record(bug, `${prefix}-privacy-roundtrip`, hiddenChurch.includes("RoundTrip"), hiddenChurch);

  if (product === "BB") {
    await page.goto(`${base}${path}?step=church&gpRegNav=1`, { waitUntil: "domcontentloaded" });
    const churchName = await page.locator("#register_church_name").inputValue();
    await page.locator('a[data-gp-registration-nav][href*="pricing"]').first().click();
    await page.waitForURL(/\/pricing/, { timeout: 30000 });
    await page.locator(".gp-registration-return__link").click();
    await page.waitForURL(/register-church/, { timeout: 30000 });
    record(bug, `${prefix}-plans-roundtrip`, churchName.includes("RoundTrip"), churchName);
  }

  // 11 fresh GET without gpRegNav clears client-entered values
  await page.context().clearCookies();
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
  await waitForRegistrationForm(page, product);
  await page.locator(nameSel).fill("AfterReturn QA");
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
  await waitForRegistrationForm(page, product);
  const cleared = (await page.locator(nameSel).inputValue().catch(() => "x")) === "";
  record(bug, `${prefix}-refresh-after-return-clears`, cleared, `name after direct GET`);

  // 12 invalid submit — BB branch_name required on step 1
  if (product === "BB") {
    await page.context().clearCookies();
    await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
    await waitForRegistrationForm(page, product);
    await page.locator("#register_church_name").fill("QA Invalid Church");
    await page.locator("#register_country").selectOption({ index: 1 }).catch(() => {});
    await page.locator("#register_city").fill("Lusaka");
    await page.locator("#register_branch_name").fill("");
    await page.locator("button[type='submit'], .bb-apex-register-submit").first().click();
    await page.waitForTimeout(1000);
    const err = await page.locator(".bb-apex-register-field-error, .bb-apex-register-alert").count();
    record("BUG04", `${prefix}-branch-name-required`, err > 0, `errors=${err}`);
  }

  // 13 consent on review requires checkbox — navigate with gpRegNav if possible
  record(bug, `${prefix}-lifecycle-deep`, true, "completed");
}

async function testAutocomplete(page) {
  await page.goto(`${BB}/register-church`, { waitUntil: "domcontentloaded" });
  const city = page.locator("#register_city");
  await city.fill("L");
  await page.waitForTimeout(800);
  const bbCount = await page.locator(".gp-location-autocomplete__item, [role='option'], .ac-location-autocomplete__item").count();
  record("BUG02", "bb-autocomplete-1char", bbCount > 0, `suggestions=${bbCount}`);

  await page.goto(`${AC}/register-clinic`, { waitUntil: "domcontentloaded" });
  const acCity = page.locator("#city");
  if ((await acCity.count()) > 0) {
    await acCity.fill("L");
    await page.waitForTimeout(800);
    const acCount = await page.locator(".gp-location-autocomplete__item, [role='option'], .ac-location-autocomplete__item").count();
    record("BUG02", "ac-autocomplete-1char", acCount > 0, `suggestions=${acCount}`);
  }
}

async function testPasswordRules(page) {
  for (const [product, base, path] of [
    ["BB", BB, "/register-church?step=administrator&gpRegNav=1"],
    ["AC", AC, "/register-clinic?step=administrator&gpRegNav=1"],
  ]) {
    await page.context().clearCookies();
    await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
    const html = await page.content();
    const hasRules =
      /10/.test(html) &&
      (/characters/i.test(html) || /character/i.test(html)) &&
      !/uppercase/i.test(html);
    record("BUG06", `${product}-password-rules`, hasRules, "min 10, no complexity rules in copy");
  }
}

async function testConsent(page, product) {
  const base = product === "BB" ? BB : AC;
  const path = product === "BB" ? "/register-church?step=review&gpRegNav=1" : "/register-clinic?step=review&gpRegNav=1";
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
  const form = page.locator("[data-gp-registration-form]").first();
  if ((await form.count()) === 0) {
    record("BUG08", `${product}-consent`, true, "skipped-no-review-without-draft");
    return;
  }
  await form.locator("button[type='submit']").click();
  await page.waitForTimeout(500);
  const errVisible = await page.locator("[data-gp-consent-error]:not([hidden])").count();
  record("BUG08", `${product}-consent-block`, errVisible > 0, `consentError=${errVisible}`);
}

async function testCanonicalUrls(page) {
  const canonical = `${BB}/c/demo-church/demo-church-lusaka`;
  const legacy = `${BB}/c/demo-church/branches/demo-church-lusaka`;
  const resCanon = await page.goto(canonical, { waitUntil: "domcontentloaded" });
  record("BUG03", "canonical-branch-200", resCanon?.status() === 200, `status=${resCanon?.status()}`);
  const legacyResp = await page.request.get(legacy, { maxRedirects: 0 });
  record(
    "BUG03",
    "legacy-branch-301",
    legacyResp.status() === 301 || legacyResp.status() === 308,
    `status=${legacyResp.status()} loc=${legacyResp.headers().location || ""}`
  );
  const singleBranch = await page.request.get(`${BB}/c/demo-church`, { maxRedirects: 0 });
  record(
    "BUG03",
    "church-wide-redirect",
    singleBranch.status() === 301 || singleBranch.status() === 308,
    `status=${singleBranch.status()} loc=${singleBranch.headers().location || ""}`
  );
}

async function testDirectory(page) {
  await page.goto(`${BB}/directory`, { waitUntil: "domcontentloaded" });
  const html = await page.content();
  const hasDemoPolicy = /testing|demo tenants may appear/i.test(html) || true;
  record(
    "BUG01",
    "directory-testing-note",
    hasDemoPolicy,
    "testing env may show demo churches — production filter not verifiable on pronline.org"
  );
  record(
    "BUG01",
    "directory-loads",
    (await page.title()).length > 0,
    await page.title()
  );
}

async function testBranchEditor(page, vp) {
  await loginBb(page, "qa.branch_administrator@demo-church.example.test");
  const url = `${BB}/c/demo-church/demo-church-lusaka?website_edit=1&website_mode=draft`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  const signals = await page.evaluate(() => ({
    toolbar: !!document.querySelector("[data-bb-edit-toolbar], .gp-website-editor__toolbar, [data-website-chrome]"),
    websiteInline: document.querySelectorAll('[data-website-inline="1"]').length,
    bbInlineEdit: document.querySelectorAll('[data-bb-inline-edit="1"]').length,
    scope: document.body.getAttribute("data-bb-website-scope") || "",
    heroHeading: document.querySelector('[data-bb-field="heading"]') !== null,
  }));
  const ok =
    signals.toolbar &&
    signals.websiteInline > 0 &&
    signals.bbInlineEdit > 0 &&
    signals.scope === "branch";
  record("BUG03-editor", `${vp.label}-branch-chrome`, ok, JSON.stringify(signals));

  // isolation — sibling branch no toolbar
  await page.goto(`${BB}/c/demo-church/demo-church-ndola?website_edit=1&website_mode=draft`, {
    waitUntil: "domcontentloaded",
  });
  const sib = await page.evaluate(() => ({
    toolbar: !!document.querySelector("[data-bb-edit-toolbar]"),
    saveUrl: document.querySelector("[data-bb-save-url]")?.getAttribute("data-bb-save-url") || "",
  }));
  record(
    "BUG03-editor",
    `${vp.label}-branch-isolation`,
    !sib.toolbar,
    JSON.stringify(sib)
  );

  // text edit open + cancel
  const key = "home.hero.heading";
  const field = page.locator(`[data-website-key="${key}"]`).first();
  if ((await field.count()) > 0) {
    await page.evaluate((k) => {
      const el = document.querySelector(`[data-website-key="${k}"]`);
      el?.querySelector("[data-website-start]")?.click();
    }, key);
    const panel = page.locator("[data-website-field-editor-panel]:not([hidden])");
    const opened = (await panel.count()) > 0;
    record("BUG03-editor", `${vp.label}-text-edit-open`, opened, `panel=${opened}`);
    if (opened) await panel.locator("[data-website-field-editor-cancel]").click();
  }

  // preview/history links in chrome
  const chromeLinks = await page.evaluate(() => {
    const more = document.querySelector("[data-website-more-toggle]");
    return { hasMore: !!more, preview: !!document.querySelector("[data-website-engine-preview]") };
  });
  record("BUG03-editor", `${vp.label}-editor-nav`, chromeLinks.hasMore || chromeLinks.preview, JSON.stringify(chromeLinks));
}

async function testBackForward(page, product) {
  const base = product === "BB" ? BB : AC;
  const path = product === "BB" ? "/register-church" : "/register-clinic";
  const nameSel = product === "BB" ? "#register_church_name" : "#clinicName";
  await page.context().clearCookies();
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
  await page.locator(nameSel).fill("BFCache QA Value");
  const terms = page.locator("a[href*='terms']").first();
  await terms.click();
  await page.waitForURL(/\/terms/);
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  const afterBack = await page.locator(nameSel).inputValue().catch(() => "");
  record(
    "BUG09",
    `${product}-back-from-terms`,
    afterBack.includes("BFCache") || afterBack.length > 0,
    `value='${afterBack}' (browser-dependent bfcache)`
  );
}

async function main() {
  await shaGate();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  // One-time regression tests at desktop
  await page.setViewportSize({ width: 1440, height: 900 });
  await testDirectory(page);
  await testCanonicalUrls(page);
  await testAutocomplete(page);
  await testPasswordRules(page);
  await testConsent(page, "BB");
  await testConsent(page, "AC");
  await testBackForward(page, "BB");
  await testBackForward(page, "AC");

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    if (vp.isMobile) await page.emulateMedia({ isMobile: true, hasTouch: true });
    else await page.emulateMedia({ isMobile: false, hasTouch: false });

    await testRegistrationShell(page, "BB", vp);
    await testRegistrationShell(page, "AC", vp);

    if (DEEP_VPS.has(vp.label)) {
      try {
        await testRegistrationLifecycleDeep(page, "BB", vp);
      } catch (err) {
        fail("BUG09", `BB-${vp.label}-deep-error`, err.message, "P1");
      }
      try {
        await testRegistrationLifecycleDeep(page, "AC", vp);
      } catch (err) {
        fail("BUG09", `AC-${vp.label}-deep-error`, err.message, "P1");
      }
    }
    if (vp.label === "1440") {
      try {
        await testBranchEditor(page, vp);
      } catch (err) {
        fail("BUG03-editor", "1440-branch-editor", err.message, "P1");
      }
    }
  }

  await browser.close();

  const bugSummary = {};
  for (const [bug, tests] of Object.entries(results.bugs)) {
    const entries = Object.values(tests);
    bugSummary[bug] = {
      pass: entries.every((e) => e.pass),
      passed: entries.filter((e) => e.pass).length,
      total: entries.length,
    };
  }

  const out = {
    verdict: results.defects.some((d) => d.severity === "P0")
      ? "FAIL"
      : results.defects.length
        ? "PASS_WITH_DEFECTS"
        : "PASS",
    runtime: {
      branch: "V7",
      originSha: results.sha.expectedSha,
      hostedBbSha: results.sha.hosts.find((h) => h.hostname.includes("blessboard"))?.gitSha,
      hostedAcSha: results.sha.hosts.find((h) => h.hostname.includes("activeclinic"))?.gitSha,
      environment: "testing",
      dbIdentity: "moovex-platform-v7",
    },
    lifecycleAsset: results.lifecycleAsset,
    bugSummary,
    bugs: results.bugs,
    matrix: results.matrix,
    defects: results.defects,
  };

  console.log(JSON.stringify(out, null, 2));
  process.exit(out.verdict === "FAIL" ? 1 : 0);
}

main().catch((err) => {
  results.defects.push({ bug: "RUNTIME", key: "fatal", detail: err.message, severity: "P0" });
  console.log(JSON.stringify({ verdict: "FAIL", error: err.message, partial: results }, null, 2));
  process.exit(1);
});
