#!/usr/bin/env node
"use strict";

/**
 * Hosted browser QA — V7 bugs 10–15 (testing pronline only).
 */

const { chromium } = require("playwright");
const { checkHostedTestingSha } = require("../check-hosted-testing-sha");

const PASS = process.env.QA_PASSWORD || "1234567890";
const BB = "https://blessboard.pronline.org";
const AC = "https://activeclinic.pronline.org";
const STAMP = Date.now();

const VIEWPORTS = [
  { label: "1440", width: 1440, height: 900 },
  { label: "1024", width: 1024, height: 768 },
  { label: "768", width: 768, height: 1024 },
  { label: "430", width: 430, height: 932 },
  { label: "390", width: 390, height: 844 },
  { label: "360", width: 360, height: 780 },
  { label: "320", width: 320, height: 693 },
];

const DEEP = new Set(["1440", "390"]);
const LAYOUT = new Set(["1440", "1024", "768", "430", "390", "360", "320"]);

const results = {
  sha: null,
  bugs: {},
  network: {},
  security: {},
  defects: [],
};

function record(bug, key, pass, detail) {
  if (!results.bugs[bug]) results.bugs[bug] = {};
  results.bugs[bug][key] = { pass: !!pass, detail: detail || "" };
  if (!pass) {
    results.defects.push({ bug, key, detail: detail || "", severity: bug === "BUG15" ? "P0" : "P1" });
  }
}

async function shaGate() {
  const report = await checkHostedTestingSha({});
  results.sha = report;
  if (!report.ok) {
    console.log("HOSTED_NOT_CURRENT");
    console.log(JSON.stringify(report, null, 2));
    process.exit(3);
  }
}

async function testAutocomplete(page, product) {
  const base = product === "BB" ? BB : AC;
  const path = product === "BB" ? "/register-church?plan=foundation" : "/register-clinic";
  const citySel = product === "BB" ? "#register_city" : "#city";
  const listSel =
    product === "BB"
      ? ".gp-location-option, [role='option']"
      : ".gp-location-option, [role='option'], .acw-location-listbox button";

  const requests = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/locations/autocomplete")) {
      requests.push({ url: req.url(), method: req.method() });
    }
  });

  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator(citySel).waitFor({ state: "visible", timeout: 30000 });
  if (product === "BB") {
    await page.locator("#register_country").selectOption("ZM").catch(() => {});
  }
  await page.locator(citySel).fill("L");
  await page.waitForTimeout(900);

  const req = requests.find((r) => r.method === "GET");
  const apiOk = !!req;
  let apiStatus = null;
  let apiBody = null;
  if (req) {
    const res = await page.request.get(req.url);
    apiStatus = res.status();
    apiBody = await res.json().catch(() => null);
  }
  const suggestions = await page.locator(listSel).count();
  record(
    "BUG10",
    `${product}-autocomplete-request`,
    apiOk && apiStatus === 200,
    `req=${!!req} status=${apiStatus} url=${req ? req.url : "none"}`
  );
  record(
    "BUG10",
    `${product}-autocomplete-visible`,
    suggestions > 0,
    `suggestions=${suggestions} results=${apiBody && apiBody.results ? apiBody.results.length : 0}`
  );
  results.network[`${product}-autocomplete`] = {
    url: req ? req.url : null,
    status: apiStatus,
    resultCount: apiBody && apiBody.results ? apiBody.results.length : 0,
    suggestions,
  };

  if (suggestions > 0) {
    await page.locator(listSel).first().click();
    const val = await page.locator(citySel).inputValue();
    record("BUG10", `${product}-mouse-select`, val.length > 1, `city='${val}'`);
  }

  page.removeAllListeners("request");
}

async function testUrlPreview(page) {
  await page.goto(`${BB}/register-church?plan=foundation`, { waitUntil: "domcontentloaded" });
  await page.locator("#register_church_name").fill("Grace Community Church");
  await page.locator("#register_branch_name").fill("Lusaka Central");
  await page.waitForTimeout(400);
  const preview = await page.locator("[data-bb-church-url-preview]").textContent();
  const expected = "blessboard.pronline.org/c/grace-community-church/lusaka-central";
  const normalized = String(preview || "").trim().toLowerCase();
  record(
    "BUG11",
    "bb-url-preview-live",
    normalized === expected,
    `preview='${normalized}' expected='${expected}'`
  );
  results.network.urlPreview = { preview: normalized, expected };
}

async function testPasswordLayout(page, vp) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.goto(`${BB}/register-church?plan=foundation&step=administrator`, {
    waitUntil: "domcontentloaded",
  });
  await page.locator("#register_church_name").fill("Layout QA").catch(() => {});
  await page.goto(`${BB}/register-church?plan=foundation&step=administrator`, {
    waitUntil: "domcontentloaded",
  });
  const layout = await page.evaluate(() => {
    const grid = document.querySelector(".bb-apex-register-form__grid--password");
    const pwd = document.getElementById("register_password");
    const confirm = document.getElementById("register_password_confirm");
    const rules = document.querySelector(".bb-apex-register-form__password-rules");
    if (!grid || !pwd || !confirm || !rules) return { ok: false, reason: "missing-elements" };
    const pr = pwd.getBoundingClientRect();
    const cr = confirm.getBoundingClientRect();
    const rr = rules.getBoundingClientRect();
    const mobile = window.innerWidth < 768;
    const rowAligned = mobile ? pr.top < cr.top : Math.abs(pr.top - cr.top) < 40;
    const rulesBelow = rr.top >= Math.max(pr.bottom, cr.bottom) - 5;
    return {
      ok: rowAligned && rulesBelow,
      mobile,
      deltaTop: Math.abs(pr.top - cr.top),
      rulesBelow,
    };
  });
  record("BUG13", `bb-layout-${vp.label}`, layout.ok, JSON.stringify(layout));
}

async function testPasswordRules(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BB}/register-church?plan=foundation&step=administrator`, {
    waitUntil: "domcontentloaded",
  });
  const pwd = page.locator("#register_password");
  const confirm = page.locator("#register_password_confirm");
  await pwd.fill("short");
  await page.waitForTimeout(150);
  let minMet = await page.locator('[data-gp-password-rule="min_length"]').evaluate((el) =>
    el.classList.contains("is-met")
  );
  record("BUG14", "min-unmet-under-10", !minMet, `minMet=${minMet}`);
  await pwd.fill("1234567890");
  await page.waitForTimeout(150);
  minMet = await page.locator('[data-gp-password-rule="min_length"]').evaluate((el) =>
    el.classList.contains("is-met")
  );
  const maxMet = await page.locator('[data-gp-password-rule="max_length"]').evaluate((el) =>
    el.classList.contains("is-met")
  );
  record("BUG14", "min-met-at-10", minMet, `minMet=${minMet}`);
  record("BUG14", "max-met-at-10", maxMet, `maxMet=${maxMet}`);
  await confirm.fill("different-password");
  await page.waitForTimeout(150);
  const mismatch = await page.locator("#password-confirm-status").textContent();
  record(
    "BUG14",
    "confirm-mismatch",
    /do not match/i.test(String(mismatch || "")),
    mismatch || ""
  );
  await confirm.fill("1234567890");
  await page.waitForTimeout(150);
  const match = await page.locator("#password-confirm-status").textContent();
  record("BUG14", "confirm-match", /match/i.test(String(match || "")), match || "");
}

async function completeBbRegistration(page) {
  const email = `qa.bugs1015.bb.${STAMP}@example.test`;
  const church = `Grace QA Church ${STAMP}`;
  await page.context().clearCookies();
  await page.goto(`${BB}/register-church?plan=foundation`, { waitUntil: "domcontentloaded" });
  await page.locator("#register_church_name").fill(church);
  await page.locator("#register_country").selectOption("ZM");
  await page.locator("#register_city").fill("Lusaka");
  await page.locator("#register_branch_name").fill("Lusaka Central");
  await page.locator('button[value="next-church"]').click();
  await page.waitForSelector('[data-bb-register-step="administrator"]', { timeout: 45000 });
  await page.locator("#register_contact_name").fill("QA Admin");
  await page.locator("#register_email").fill(email);
  await page.locator("#register_role").fill("Pastor");
  const phoneNational = page.locator('input[name="phone_national"]');
  if ((await phoneNational.count()) > 0) {
    await phoneNational.fill("971234567");
  }
  await page.locator("#register_password").fill(PASS);
  await page.locator("#register_password_confirm").fill(PASS);
  await page.locator('button[value="next-admin"]').click();
  await page.waitForSelector('[data-bb-register-step="review"]', { timeout: 45000 });

  const reviewHtml = await page.content();
  record(
    "BUG15",
    "bb-review-no-password-html",
    !/name="password"/i.test(reviewHtml),
    "password input absent from review HTML"
  );

  await page.locator('input[name="registration_consent"]').check();
  const [response] = await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 120000 }),
    page.locator(".bb-apex-register-submit").click(),
  ]);
  const finalUrl = page.url();
  const bodyText = await page.locator("body").innerText();
  record(
    "BUG15",
    "bb-create-no-password-empty",
    !/password.*empty/i.test(bodyText) && response.status() < 500,
    `status=${response.status()} url=${finalUrl}`
  );
  record(
    "BUG15",
    "bb-create-success",
    /success|ready|registered/i.test(bodyText) || finalUrl.includes("success"),
    finalUrl
  );

  await page.goto(`${BB}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"], input[name="login_email"]').first().fill(email);
  await page.locator('input[name="password"]').fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60000 });
  record("BUG15", "bb-login-after-register", true, page.url());

  return { email, church, finalUrl };
}

async function completeAcRegistration(page) {
  const email = `qa.bugs1015.ac.${STAMP}@example.test`;
  const clinic = `QA Clinic ${STAMP}`;
  await page.context().clearCookies();
  await page.goto(`${AC}/register-clinic`, { waitUntil: "domcontentloaded" });
  await page.locator("#clinicName").fill(clinic);
  await page.locator("#clinicType").selectOption("clinic");
  await page.locator("#city").fill("Lusaka");
  await page.locator("#provinceSelect").selectOption({ index: 1 }).catch(() => {});
  await page.locator('form[data-ac-register-step="clinic"] button[type="submit"]').click();
  await page.waitForSelector('[data-ac-register-step="administrator"], [data-ac-acw-step="administrator"]', {
    timeout: 45000,
  });
  await page.locator("#contactName").fill("QA Admin");
  await page.locator("#contactEmail").fill(email);
  await page.locator("#contactPhone").fill("+260971234567").catch(async () => {
    await page.locator('input[name="phone_national"]').fill("971234567");
  });
  await page.locator("#password").fill(PASS);
  await page.locator("#passwordConfirm").fill(PASS);
  await page.locator('button[value="next-admin"]').click();
  await page.waitForSelector('[data-ac-register-step="review"], [data-ac-acw-step="review"]', {
    timeout: 45000,
  });

  const reviewHtml = await page.content();
  record(
    "BUG15",
    "ac-review-no-password-html",
    !/name="password"/i.test(reviewHtml),
    "password input absent from review HTML"
  );

  await page.locator('input[name="registration_consent"]').check();
  const [response] = await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 120000 }),
    page.locator('button[type="submit"]').last().click(),
  ]);
  const bodyText = await page.locator("body").innerText();
  record(
    "BUG15",
    "ac-create-no-password-empty",
    !/password.*empty/i.test(bodyText) && response.status() < 500,
    `status=${response.status()}`
  );
  record(
    "BUG15",
    "ac-create-success",
    /success|ready|registered/i.test(bodyText) || page.url().includes("success"),
    page.url()
  );

  await page.goto(`${AC}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="identifier"]').fill(email);
  await page.locator('input[name="password"]').fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60000 });
  record("BUG15", "ac-login-after-register", true, page.url());
}

async function testDetourVsRefresh(page, product) {
  const base = product === "BB" ? BB : AC;
  const path = product === "BB" ? "/register-church?plan=foundation" : "/register-clinic";
  const marker = product === "BB" ? "Detour BB" : "Detour AC";
  await page.context().clearCookies();
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
  if (product === "BB") {
    await page.locator("#register_church_name").fill(marker);
    await page.locator("#register_country").selectOption("ZM");
    await page.locator("#register_city").fill("Lusaka");
    await page.locator("#register_branch_name").fill("Main");
    await page.locator('button[value="next-church"]').click();
    await page.waitForSelector('[data-bb-register-step="administrator"]');
    await page.locator("#register_contact_name").fill("Detour Admin");
  } else {
    await page.locator("#clinicName").fill(marker);
    await page.locator("#city").fill("Lusaka");
    await page.locator('form[data-ac-register-step="clinic"] button[type="submit"]').click();
    await page.waitForSelector('[data-ac-register-step="administrator"], [data-ac-acw-step="administrator"]');
    await page.locator("#contactName").fill("Detour Admin");
  }
  const returnTo = product === "BB" ? "register-church" : "register-clinic";
  await page.goto(
    `${base}/pricing?from=registration&returnTo=${returnTo}&step=administrator&gpRegNav=1`,
    { waitUntil: "domcontentloaded" }
  ).catch(async () => {
    await page.goto(
      `${base}/terms?from=registration&returnTo=${returnTo}&step=administrator&gpRegNav=1`,
      { waitUntil: "domcontentloaded" }
    );
  });
  await page.locator(".gp-registration-return__link").click();
  await page.waitForURL(/register-(church|clinic)/, { timeout: 30000 });
  const preserved =
    product === "BB"
      ? await page.locator('input[name="church_name"]').inputValue()
      : await page.locator('input[name="clinicName"]').inputValue();
  record("BUG12", `${product}-detour-preserve`, preserved.includes("Detour"), preserved);

  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
  const fresh =
    product === "BB"
      ? await page.locator("#register_church_name").inputValue()
      : await page.locator("#clinicName").inputValue();
  record("BUG12", `${product}-refresh-clean`, fresh === "", `name='${fresh}'`);
}

async function testSecurityCookies(page) {
  await page.goto(`${BB}/register-church?plan=foundation&step=administrator`, {
    waitUntil: "domcontentloaded",
  });
  const cookies = await page.context().cookies();
  const draft = cookies.find((c) => c.name === "bb_reg_draft");
  const vault = cookies.find((c) => c.name === "bb_reg_pwd");
  let draftHasPassword = false;
  if (draft && draft.value) {
    draftHasPassword = /password/i.test(decodeURIComponent(draft.value));
  }
  record("BUG15", "draft-no-password", !draftHasPassword, `draft=${!!draft}`);
  record("BUG15", "vault-httpOnly", !vault || vault.httpOnly, `vault=${!!vault}`);
  results.security = {
    draftPresent: !!draft,
    vaultPresent: !!vault,
    draftHasPassword,
    vaultHttpOnly: vault ? vault.httpOnly : null,
  };
}

async function main() {
  await shaGate();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await testAutocomplete(page, "BB");
  await testAutocomplete(page, "AC");
  await testUrlPreview(page);
  await testPasswordRules(page);
  for (const vp of VIEWPORTS) {
    if (LAYOUT.has(vp.label)) await testPasswordLayout(page, vp);
  }
  await testDetourVsRefresh(page, "BB");
  await testDetourVsRefresh(page, "AC");
  await testSecurityCookies(page);

  for (const vp of VIEWPORTS.filter((v) => DEEP.has(v.label))) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
  }

  let bbReg = null;
  try {
    bbReg = await completeBbRegistration(page);
    results.network.bbFinalUrl = bbReg.finalUrl;
  } catch (err) {
    record("BUG15", "bb-registration-flow", false, err.message);
  }
  try {
    await completeAcRegistration(page);
  } catch (err) {
    record("BUG15", "ac-registration-flow", false, err.message);
  }

  const canonical = await page.request.get(`${BB}/c/grace-community-church/lusaka-central`);
  record("BUG03", "canonical-branch-path", canonical.status() === 200 || canonical.status() === 302, String(canonical.status()));

  await browser.close();

  const p0 = results.defects.filter((d) => d.severity === "P0");
  const verdict =
    p0.length > 0 ? "FAIL" : results.defects.length ? "PASS_WITH_DEFECTS" : "PASS";
  console.log(
    JSON.stringify(
      {
        verdict,
        commitSha: results.sha.expectedSha,
        hosted: {
          blessboard: results.sha.hosts.find((h) => h.hostname.includes("blessboard"))?.gitSha,
          activeclinic: results.sha.hosts.find((h) => h.hostname.includes("activeclinic"))?.gitSha,
        },
        bugs: results.bugs,
        network: results.network,
        security: results.security,
        defects: results.defects,
      },
      null,
      2
    )
  );
  process.exit(verdict === "FAIL" ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
