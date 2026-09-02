#!/usr/bin/env node
"use strict";

/**
 * Focused hosted closure QA — BUGS 10–15 (testing pronline only).
 * Minimal POST volume: one admin-step session for layout/rules, one detour session, one E2E.
 */

const { chromium } = require("playwright");
const { checkHostedTestingSha } = require("../check-hosted-testing-sha");

const PASS = process.env.QA_PASSWORD || "1234567890";
const AC = "https://activeclinic.pronline.org";
const BB = "https://blessboard.pronline.org";
const EXPECTED_SHA = "687f668b8bc2";
const STAMP = Date.now();

const DESKTOP_VPS = [
  { label: "1440", width: 1440, height: 900 },
  { label: "1024", width: 1024, height: 768 },
  { label: "768", width: 768, height: 1024 },
];
const MOBILE_VPS = [
  { label: "390", width: 390, height: 844 },
  { label: "320", width: 320, height: 693 },
];

const out = {
  verdict: "NOT_READY",
  runtime: { expectedSha: EXPECTED_SHA, originV7: null, hosted: {} },
  acRegistration: null,
  acLogin: null,
  passwordLayout: {},
  passwordRules: { AC: {}, BB: null },
  detourRefresh: null,
  security: null,
  rateLimit: null,
  canonical: null,
  appCodeChanged: false,
  harnessOnlyChanged: true,
  defects: [],
};

function fail(severity, key, detail) {
  out.defects.push({ severity, key, detail });
}

async function probeAcRateLimit(page) {
  await page.context().clearCookies();
  await page.goto(`${AC}/register-clinic`, { waitUntil: "domcontentloaded" });
  let postMeta = null;
  const onResp = (r) => {
    if (r.url().includes("/register-clinic") && r.request().method() === "POST") {
      postMeta = { status: r.status(), headers: r.headers() };
    }
  };
  page.on("response", onResp);
  await page.locator("#clinicName").fill(`Rate Probe ${STAMP}`);
  await page.locator("#clinicType").selectOption("clinic");
  await page.locator("#city").fill("Lusaka");
  await page.locator("#provinceSelect").selectOption({ index: 1 }).catch(() => {});
  await page.locator('form[data-ac-register-step="clinic"] button[type="submit"]').click();
  await page.waitForTimeout(1500);
  page.off("response", onResp);
  const body = await page.locator("body").innerText();
  if (postMeta && isRateLimited(postMeta.status, body)) {
    out.rateLimit = {
      phase: "preflight-probe",
      status: postMeta.status,
      headers: {
        ratelimitLimit: postMeta.headers["ratelimit-limit"],
        ratelimitRemaining: postMeta.headers["ratelimit-remaining"],
        ratelimitReset: postMeta.headers["ratelimit-reset"],
        retryAfter: postMeta.headers["retry-after"],
      },
      bodySnippet: body.slice(0, 240),
      classification: "RATE_LIMIT",
    };
    return false;
  }
  return true;
}

function isRateLimited(status, text) {
  const body = String(text || "");
  return (
    status === 429 ||
    /too many (requests|submissions)/i.test(body) ||
    /please (wait|try again later)/i.test(body)
  );
}

async function preflight() {
  const report = await checkHostedTestingSha({ expectedSha: EXPECTED_SHA });
  out.runtime.originV7 = report.expectedSha;
  out.runtime.hosted = {
    blessboard: report.hosts.find((h) => h.hostname.includes("blessboard"))?.gitSha,
    activeclinic: report.hosts.find((h) => h.hostname.includes("activeclinic"))?.gitSha,
  };
  if (!report.ok) {
    console.log("HOSTED_NOT_CURRENT");
    console.log(JSON.stringify(out, null, 2));
    process.exit(3);
  }
}

async function advanceAcToAdmin(page, clinicName) {
  await page.context().clearCookies();
  const [response] = await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null),
    (async () => {
      await page.goto(`${AC}/register-clinic`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.locator("#clinicName").fill(clinicName);
      await page.locator("#clinicType").selectOption("clinic");
      await page.locator("#city").fill("Lusaka");
      await page.locator("#provinceSelect").selectOption({ index: 1 }).catch(() => {});
      await page.locator('form[data-ac-register-step="clinic"] button[type="submit"]').click();
    })(),
  ]);
  const body = await page.locator("body").innerText();
  const status = response ? response.status() : null;
  if (isRateLimited(status, body)) {
    out.rateLimit = {
      phase: "advanceAcToAdmin",
      status,
      bodySnippet: body.slice(0, 240),
      classification: "RATE_LIMIT",
    };
    throw new Error("RATE_LIMIT: clinic step POST blocked");
  }
  await page.waitForSelector('[data-ac-register-step="administrator"]', { timeout: 30000 });
}

function acLayoutSelectors() {
  return {
    grid: ".acw-register__grid--password",
    pwd: "#password",
    confirm: "#passwordConfirm",
    rules: "#password-policy, .acw-register__policy",
  };
}

function bbLayoutSelectors() {
  return {
    grid: ".bb-apex-register-form__grid--password",
    pwd: "#register_password",
    confirm: "#register_password_confirm",
    rules: ".bb-apex-register-form__password-rules",
  };
}

async function measurePasswordLayout(page, product, vp) {
  const sel = product === "AC" ? acLayoutSelectors() : bbLayoutSelectors();
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.waitForTimeout(200);
  const layout = await page.evaluate((s) => {
    const pwd = document.querySelector(s.pwd);
    const confirm = document.querySelector(s.confirm);
    const rules = document.querySelector(s.rules);
    if (!pwd || !confirm || !rules) {
      return { ok: false, reason: "missing-elements" };
    }
    const pr = pwd.getBoundingClientRect();
    const cr = confirm.getBoundingClientRect();
    const rr = rules.getBoundingClientRect();
    const mobile = window.innerWidth < 768;
    const deltaTop = Math.abs(pr.top - cr.top);
    const rowAligned = mobile ? pr.top < cr.top - 1 : deltaTop < 8;
    const rulesBelowBoth = rr.top >= Math.max(pr.bottom, cr.bottom) - 8;
    return {
      ok: rowAligned && rulesBelowBoth,
      mobile,
      passwordTop: Math.round(pr.top),
      confirmTop: Math.round(cr.top),
      deltaTop: Math.round(deltaTop),
      rulesTop: Math.round(rr.top),
      rulesBelowBoth,
    };
  }, sel);
  const key = `${product}-${vp.label}`;
  out.passwordLayout[key] = layout;
  if (!layout.ok) {
    fail("P1", `password-layout-${key}`, JSON.stringify(layout));
  }
  return layout;
}

async function capturePasswordRulesDom(page, product) {
  const pwdSel = product === "AC" ? "#password" : "#register_password";
  const confirmSel = product === "AC" ? "#passwordConfirm" : "#register_password_confirm";
  const statusSel = "#password-confirm-status";
  const rules = {};

  async function ruleState(id) {
    const el = page.locator(`[data-gp-password-rule="${id}"]`);
    return el.evaluate((node) => ({
      classes: node.className,
      isMet: node.classList.contains("is-met"),
      isUnmet: node.classList.contains("is-unmet"),
      text: (node.textContent || "").trim(),
    }));
  }

  const pwd = page.locator(pwdSel);
  const confirm = page.locator(confirmSel);

  await pwd.fill("123456789");
  await page.waitForTimeout(200);
  rules.min9 = await ruleState("min_length");

  await pwd.fill("1234567890");
  await page.waitForTimeout(200);
  rules.min10 = await ruleState("min_length");
  rules.max10 = await ruleState("max_length");

  await confirm.fill("different-password");
  await page.waitForTimeout(200);
  rules.mismatch = {
    statusText: (await page.locator(statusSel).textContent()) || "",
    statusHtml: await page.locator(statusSel).evaluate((el) => ({
      classes: el.className,
      isSuccess: el.classList.contains("is-success"),
      isError: el.classList.contains("is-error"),
    })),
  };

  await confirm.fill("1234567890");
  await page.waitForTimeout(200);
  rules.match = {
    statusText: (await page.locator(statusSel).textContent()) || "",
    statusHtml: await page.locator(statusSel).evaluate((el) => ({
      classes: el.className,
      isSuccess: el.classList.contains("is-success"),
      isError: el.classList.contains("is-error"),
    })),
  };

  out.passwordRules[product] = rules;

  const pass =
    !rules.min9.isMet &&
    rules.min10.isMet &&
    rules.max10.isMet &&
    /do not match/i.test(rules.mismatch.statusText) &&
    /match/i.test(rules.match.statusText);

  if (!pass) fail("P1", `password-rules-${product}`, JSON.stringify(rules));
  return pass;
}

async function testAcDetourRefresh(page) {
  const marker = `Detour AC ${STAMP}`;
  await page.context().clearCookies();
  await page.goto(`${AC}/register-clinic`, { waitUntil: "domcontentloaded" });
  await page.locator("#clinicName").fill(marker);
  await page.locator("#clinicType").selectOption("clinic");
  await page.locator("#city").fill("Lusaka");
  await page.locator("#provinceSelect").selectOption({ index: 1 }).catch(() => {});
  const [resp] = await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null),
    page.locator('form[data-ac-register-step="clinic"] button[type="submit"]').click(),
  ]);
  const body = await page.locator("body").innerText();
  if (isRateLimited(resp && resp.status(), body)) {
    out.rateLimit = { phase: "detour-clinic-step", status: resp && resp.status(), classification: "RATE_LIMIT" };
    throw new Error("RATE_LIMIT: detour clinic step");
  }
  await page.waitForSelector('[data-ac-register-step="administrator"]', { timeout: 30000 });
  await page.locator("#contactName").fill("Detour Admin");

  await page.goto(
    `${AC}/terms?from=registration&returnTo=register-clinic&step=administrator&gpRegNav=1`,
    { waitUntil: "domcontentloaded" }
  );
  await page.locator(".gp-registration-return__link").click();
  await page.waitForURL(/register-clinic/, { timeout: 30000 });
  const preservedName = await page.locator("#clinicName, input[name='clinicName']").first().inputValue();
  const preservedStep = await page
    .locator('[data-ac-register-step="administrator"]')
    .count()
    .then((n) => n > 0);

  await page.goto(`${AC}/register-clinic`, { waitUntil: "domcontentloaded" });
  const freshName = await page.locator("#clinicName").inputValue();

  out.detourRefresh = {
    detourPreserved: preservedName.includes("Detour AC") && preservedStep,
    preservedName,
    preservedStep,
    refreshClean: freshName === "",
    freshName,
  };

  if (!out.detourRefresh.detourPreserved) fail("P1", "ac-detour-preserve", JSON.stringify(out.detourRefresh));
  if (!out.detourRefresh.refreshClean) fail("P1", "ac-refresh-clean", JSON.stringify(out.detourRefresh));
}

async function readSecurityCookies(context) {
  const cookies = await context.cookies();
  const draft = cookies.find((c) => c.name === "ac_reg_draft");
  const vault = cookies.find((c) => c.name === "ac_reg_pwd");
  let draftHasPassword = false;
  if (draft && draft.value) {
    try {
      draftHasPassword = /password/i.test(decodeURIComponent(draft.value));
    } catch (_err) {
      draftHasPassword = /password/i.test(draft.value);
    }
  }
  return {
    draftPresent: !!draft,
    vaultPresent: !!vault,
    draftHasPassword,
    vaultHttpOnly: vault ? vault.httpOnly : null,
    vaultSecure: vault ? vault.secure : null,
  };
}

async function completeAcE2E(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = `qa.closure.ac.${STAMP}@example.test`;
  const clinic = `Closure QA Clinic ${STAMP}`;

  await page.goto(`${AC}/register-clinic`, { waitUntil: "domcontentloaded" });
  await page.locator("#clinicName").fill(clinic);
  await page.locator("#clinicType").selectOption("clinic");
  await page.locator("#city").fill("L");
  await page.waitForTimeout(700);
  const listSel = ".gp-location-option, [role='option']";
  if ((await page.locator(listSel).count()) > 0) {
    await page.locator(listSel).first().click();
  } else {
    await page.locator("#city").fill("Lusaka");
  }
  await page.locator("#provinceSelect").selectOption({ index: 1 }).catch(() => {});

  const [clinicNav] = await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null),
    page.locator('form[data-ac-register-step="clinic"] button[type="submit"]').click(),
  ]);
  let body = await page.locator("body").innerText();
  if (isRateLimited(clinicNav && clinicNav.status(), body)) {
    out.rateLimit = {
      phase: "e2e-clinic-step",
      status: clinicNav && clinicNav.status(),
      bodySnippet: body.slice(0, 240),
      classification: "RATE_LIMIT",
    };
    out.acRegistration = { pass: false, reason: "RATE_LIMIT" };
    await context.close();
    fail("P0", "ac-registration", "RATE_LIMIT at clinic step");
    return;
  }

  await page.waitForSelector('[data-ac-register-step="administrator"]', { timeout: 45000 });
  await page.locator("#contactName").fill("Closure QA Admin");
  await page.locator("#contactEmail").fill(email);
  const phoneNational = page.locator('input[name="phone_national"]');
  if ((await phoneNational.count()) > 0) {
    await phoneNational.fill("971234567");
  } else {
    await page.locator("#contactPhone").fill("+260971234567").catch(() => {});
  }
  await page.locator("#password").fill(PASS);
  await page.locator("#passwordConfirm").fill(PASS);

  const preAdminCookies = await readSecurityCookies(context);

  const [adminNav] = await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null),
    page.locator('button[value="next-admin"]').click(),
  ]);
  body = await page.locator("body").innerText();
  if (isRateLimited(adminNav && adminNav.status(), body)) {
    out.rateLimit = { phase: "e2e-admin-step", status: adminNav && adminNav.status(), classification: "RATE_LIMIT" };
    out.acRegistration = { pass: false, reason: "RATE_LIMIT" };
    await context.close();
    fail("P0", "ac-registration", "RATE_LIMIT at admin step");
    return;
  }

  await page.waitForSelector('[data-ac-register-step="review"], [data-ac-acw-step="review"]', {
    timeout: 45000,
  });

  const reviewHtml = await page.content();
  const reviewUrl = page.url();
  const postAdminCookies = await readSecurityCookies(context);

  await page.locator('input[name="registration_consent"]').check();
  const [confirmNav] = await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 120000 }).catch(() => null),
    page.locator('button[type="submit"]').last().click(),
  ]);
  const finalUrl = page.url();
  body = await page.locator("body").innerText();
  const confirmStatus = confirmNav ? confirmNav.status() : null;

  const passwordEmpty = /password.*empty/i.test(body);
  const success =
    !passwordEmpty &&
    (confirmStatus == null || confirmStatus < 500) &&
    (/success|ready|registered|active/i.test(body) || finalUrl.includes("success"));

  out.acRegistration = {
    pass: success,
    passwordEmpty,
    confirmStatus,
    finalUrl,
    reviewUrlHasPassword: /[?&]password=/i.test(reviewUrl) || /[?&]password=/i.test(finalUrl),
    reviewHtmlHasPasswordField: /name=["']password["']/i.test(reviewHtml),
  };

  if (passwordEmpty) fail("P0", "ac-password-empty", "password empty regression");
  if (!success) fail("P0", "ac-registration", `status=${confirmStatus} url=${finalUrl}`);

  const postSuccessCookies = await readSecurityCookies(context);
  out.security = {
    urlNoPassword: !out.acRegistration.reviewUrlHasPassword && !/[?&]password=/i.test(finalUrl),
    reviewHtmlNoPassword: !out.acRegistration.reviewHtmlHasPasswordField,
    preAdmin: preAdminCookies,
    postAdmin: postAdminCookies,
    postSuccess: postSuccessCookies,
    vaultHttpOnlyAfterAdmin: postAdminCookies.vaultPresent ? postAdminCookies.vaultHttpOnly === true : null,
    vaultClearedAfterSuccess: !postSuccessCookies.vaultPresent,
    draftNoPasswordAfterAdmin: !postAdminCookies.draftHasPassword,
  };

  if (!out.security.reviewHtmlNoPassword) fail("P0", "ac-password-leak-review", "password in review HTML");
  if (!out.security.urlNoPassword) fail("P0", "ac-password-leak-url", "password in URL");
  if (postAdminCookies.draftHasPassword) fail("P0", "ac-password-in-draft", "password in draft cookie");
  if (postAdminCookies.vaultPresent && postAdminCookies.vaultHttpOnly !== true) {
    fail("P0", "ac-vault-not-httpOnly", JSON.stringify(postAdminCookies));
  }
  if (postSuccessCookies.vaultPresent) {
    fail("P1", "ac-vault-not-cleared", "vault still present after success");
  }

  let canonicalPath = null;
  const canonicalMatch = body.match(/\/c\/[a-z0-9-]+(?:\/[a-z0-9-]+)?/i);
  if (canonicalMatch) canonicalPath = canonicalMatch[0];
  if (canonicalPath) {
    const canonResp = await page.request.get(`${AC}${canonicalPath}`);
    out.canonical = { path: canonicalPath, status: canonResp.status() };
  }

  if (!success) {
    await context.close();
    out.acLogin = { pass: false, reason: "registration failed" };
    return;
  }

  await page.goto(`${AC}/logout`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.context().clearCookies();
  await page.goto(`${AC}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="identifier"]').fill(email);
  await page.locator('input[name="password"]').fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  try {
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60000 });
    const loginUrl = page.url();
    const staffLoaded = !loginUrl.includes("/login") && !/sign in/i.test(await page.locator("body").innerText());
    out.acLogin = { pass: staffLoaded, url: loginUrl };
    if (!staffLoaded) fail("P0", "ac-login", loginUrl);
  } catch (err) {
    out.acLogin = { pass: false, error: err.message };
    fail("P0", "ac-login", err.message);
  }

  await context.close();
}

async function main() {
  await preflight();

  const browser = await chromium.launch({ headless: true });

  // Session A: one clinic POST → admin step; layout (resize only) + live rules on AC
  try {
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await advanceAcToAdmin(pageA, `Layout QA ${STAMP}`);
    for (const vp of DESKTOP_VPS) await measurePasswordLayout(pageA, "AC", vp);
    for (const vp of MOBILE_VPS) await measurePasswordLayout(pageA, "AC", vp);
    await capturePasswordRulesDom(pageA, "AC");
    await ctxA.close();
  } catch (err) {
    if (!out.rateLimit) fail("P1", "ac-layout-rules-session", err.message);
  }

  // Session B: optional BB rules only (GET church reg + one POST) if AC rate limited layout already done
  try {
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await pageB.goto(`${BB}/register-church?plan=foundation`, { waitUntil: "domcontentloaded" });
    await pageB.locator("#register_church_name").fill(`BB Rules ${STAMP}`);
    await pageB.locator("#register_country").selectOption("ZM");
    await pageB.locator("#register_city").fill("Lusaka");
    await pageB.locator("#register_branch_name").fill("Main");
    const [bbNav] = await Promise.all([
      pageB.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null),
      pageB.locator('button[value="next-church"]').click(),
    ]);
    const bbBody = await pageB.locator("body").innerText();
    if (isRateLimited(bbNav && bbNav.status(), bbBody)) {
      out.passwordRules.BB = { skipped: true, reason: "RATE_LIMIT" };
    } else {
      await pageB.waitForSelector('[data-bb-register-step="administrator"]', { timeout: 30000 });
      out.passwordRules.BB = await capturePasswordRulesDom(pageB, "BB");
      await pageB.setViewportSize({ width: 1440, height: 900 });
      await measurePasswordLayout(pageB, "BB", { label: "1440", width: 1440, height: 900 });
    }
    await ctxB.close();
  } catch (err) {
    out.passwordRules.BB = { skipped: true, error: err.message };
  }

  // Session C: detour vs refresh (one POST)
  try {
    const ctxC = await browser.newContext();
    const pageC = await ctxC.newPage();
    await testAcDetourRefresh(pageC);
    await ctxC.close();
  } catch (err) {
    if (!out.detourRefresh) {
      out.detourRefresh = { error: err.message };
      if (!String(err.message).includes("RATE_LIMIT")) fail("P1", "ac-detour-refresh", err.message);
    }
  }

  // Session D: AC E2E + security + login (three POSTs)
  await completeAcE2E(browser);

  await browser.close();

  const p0 = out.defects.filter((d) => d.severity === "P0");
  const layoutOk = Object.values(out.passwordLayout).every((l) => l && l.ok);
  const rulesOk =
    out.passwordRules.AC &&
    out.passwordRules.AC.min9 &&
    !out.passwordRules.AC.min9.isMet &&
    out.passwordRules.AC.min10 &&
    out.passwordRules.AC.min10.isMet;
  const detourOk = out.detourRefresh && out.detourRefresh.detourPreserved && out.detourRefresh.refreshClean;
  const secOk =
    out.security &&
    out.security.urlNoPassword &&
    out.security.reviewHtmlNoPassword &&
    !out.security.postAdmin.draftHasPassword;

  if (
    out.acRegistration &&
    out.acRegistration.pass &&
    out.acLogin &&
    out.acLogin.pass &&
    layoutOk &&
    rulesOk &&
    detourOk &&
    secOk &&
    p0.length === 0
  ) {
    out.verdict = "READY_FOR_NEXT_RELEASE_GATE";
  }

  console.log(JSON.stringify(out, null, 2));
  process.exit(out.verdict === "READY_FOR_NEXT_RELEASE_GATE" ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
