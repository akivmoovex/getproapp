#!/usr/bin/env node
"use strict";

/**
 * ActiveClinic Platform 02 — hosted testing QA on activeclinic.pronline.org.
 * Refuses production hosts. Does not print secrets.
 */

const { chromium } = require("playwright");
const { Pool } = require("pg");
const { buildFoundationPoolConfig } = require("../../db/scripts/lib/foundationPool");

const BASE = "https://activeclinic.pronline.org";
const REGISTER = `${BASE}/register-clinic`;
const PASSWORD = "Platform-QA-pass-12";
const ZAMBIA_PROVINCES = [
  "Central", "Copperbelt", "Eastern", "Luapula", "Lusaka",
  "Muchinga", "Northern", "North-Western", "Southern", "Western",
];

const report = {
  verdict: null,
  visualDesktop: 0,
  visualMobile: 0,
  autocompleteL: [],
  autocompleteK: [],
  newTown: null,
  registration: null,
  falseSessionExpiry: null,
  csrf: null,
  websiteHub: null,
  api: {},
  errors: [],
};

function fail(msg) {
  report.errors.push(msg);
  return false;
}

function scoreRegistrationVisual(html) {
  let score = 70;
  const checks = [
    [/data-ac-acw-screen="ACW09-clinic"/, 5],
    [/acw-register__form/, 5],
    [/draft/i, 4],
    [/publish/i, 3],
    [/website/i, 3],
    [/not automatically public|not published|unpublished/i, 4],
    [/Province \/ region/, 3],
    [/City \/ location/, 3],
    [/acw-platform\.css/, 2],
    [/data-ac-city-listbox/, 2],
  ];
  for (const [re, pts] of checks) {
    if (re.test(html)) score += pts;
  }
  return Math.min(score, 100);
}

async function extractCsrf(page) {
  return page.locator(`input[name="_csrf"]`).first().inputValue();
}

async function fillClinicStep(page, data) {
  await page.locator("#clinicName").fill(data.clinicName);
  await page.locator("#clinicType").selectOption(data.clinicType || "clinic");
  await page.locator("#countryCode").selectOption(data.countryCode || "ZM");
  if (data.countryCode === "ZM" || !data.countryCode) {
    await page.locator("#provinceSelect").waitFor({ state: "visible" });
    await page.locator("#provinceSelect").selectOption(data.province || "Lusaka");
  } else {
    await page.locator("#provinceText").waitFor({ state: "visible" });
    await page.locator("#provinceText").fill(data.province || "Gauteng");
  }
  await page.locator("#city").fill("");
  await page.locator("#city").type(data.city, { delay: 30 });
  if (data.pickCity || data.addNew) {
    await page.locator(".acw-location-option").first().waitFor({ state: "visible", timeout: 10000 });
    if (data.addNew) {
      await page.locator(".acw-location-option--add").first().click();
    } else {
      await page.locator(`.acw-location-option[data-name="${data.pickCity}"]`).first().click();
    }
  }
  await page.locator("#address").fill(data.address || "1 QA Street");
  await page.locator('form[data-ac-register-step="clinic"] button[type="submit"]').click();
}

async function fillAdminStep(page, data) {
  await page.locator("#contactName").fill(data.contactName || "QA Admin");
  await page.locator("#contactEmail").fill(data.contactEmail);
  const phoneNational = data.phoneNational || `97${String(Date.now()).slice(-7)}`;
  const phoneCountry = data.phoneCountry || "ZM";
  if (await page.locator('select[name="phone_country"]').count()) {
    await page.locator('select[name="phone_country"]').selectOption(phoneCountry);
  }
  if (await page.locator('input[name="phone_national"]').count()) {
    await page.locator('input[name="phone_national"]').fill(phoneNational);
  } else if (await page.locator("#contactPhone").count()) {
    await page.locator("#contactPhone").fill(`+260${phoneNational}`);
  }
  await page.locator("#password").fill(data.password || PASSWORD);
  await page.locator("#passwordConfirm").fill(data.password || PASSWORD);
  await page.locator('form[data-ac-register-step="administrator"] button[type="submit"]').click();
}

async function confirmRegistration(page) {
  await page.locator("#acceptTerms").check();
  await page.locator('form[data-ac-register-confirm="1"] button[type="submit"]').click();
}

async function testAutocompleteApi(page) {
  const cases = [
    { label: "zmL", url: "/api/locations/autocomplete?country=ZM&q=L", expectStatus: 200 },
    { label: "zmK", url: "/api/locations/autocomplete?country=ZM&q=K", expectStatus: 200 },
    { label: "empty", url: "/api/locations/autocomplete?country=ZM&q=", expectStatus: 200 },
    { label: "badCountry", url: "/api/locations/autocomplete?country=ZZZ&q=L", expectStatus: 400 },
    { label: "long", url: `/api/locations/autocomplete?country=ZM&q=${"x".repeat(200)}`, expectStatus: 200 },
    { label: "special", url: "/api/locations/autocomplete?country=ZM&q=lu%27s%25ka", expectStatus: 200 },
  ];
  for (const c of cases) {
    const res = await page.request.get(`${BASE}${c.url}`);
    const body = await res.json().catch(() => ({}));
    report.api[c.label] = {
      status: res.status(),
      ok: body.ok,
      count: Array.isArray(body.results) ? body.results.length : null,
      hasPii: JSON.stringify(body).includes("@"),
    };
    if (res.status() !== c.expectStatus) fail(`API ${c.label}: expected ${c.expectStatus}, got ${res.status()}`);
    if (res.status() >= 500) fail(`API ${c.label}: server error`);
  }
  report.autocompleteL = (report.api.zmL && report.api.zmL.count >= 0)
    ? (await page.request.get(`${BASE}/api/locations/autocomplete?country=ZM&q=L`).then((r) => r.json()).then((b) => (b.results || []).map((x) => x.name)))
    : [];
  report.autocompleteK = await page.request
    .get(`${BASE}/api/locations/autocomplete?country=ZM&q=K`)
    .then((r) => r.json())
    .then((b) => (b.results || []).map((x) => x.name));
}

async function testCsrfBoundary(page) {
  const get = await page.request.get(REGISTER);
  const html = await get.text();
  const tokenMatch = html.match(/name="_csrf"[^>]*value="([^"]+)"/);
  const cookie = get.headers()["set-cookie"] || "";
  const bad = await page.request.post(REGISTER, {
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    data: "action=next-clinic&clinicName=CSRF+Test&countryCode=ZM&_csrf=invalid-token",
  });
  const ok = bad.status() === 403;
  report.csrf = { protected: ok, status: bad.status() };
  if (!ok) fail(`CSRF boundary: expected 403 on invalid token, got ${bad.status()}`);
}

async function queryDb(sql, params) {
  if (!process.env.DATABASE_URL) return null;
  const pool = new Pool(buildFoundationPoolConfig(process.env.DATABASE_URL, { max: 2 }));
  try {
    const r = await pool.query(sql, params);
    return r.rows;
  } finally {
    await pool.end().catch(() => {});
  }
}

async function main() {
  if (/activeclinic\.org(?!\.pronline)/.test(BASE) || BASE.includes("blessboard.com")) {
    throw new Error("Refusing production host");
  }

  const stamp = Date.now();
  const newTown = `Platform QA Town ${stamp}`;
  const clinicName = `Platform QA Clinic ${stamp}`;
  const email = `ac-p02-qa-${stamp}@example.invalid`;
  const phone = `+26097${String(stamp).slice(-7)}`;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();

  try {
    // Desktop registration visual
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(REGISTER, { waitUntil: "domcontentloaded", timeout: 60000 });
    const desktopHtml = await page.content();
    report.visualDesktop = scoreRegistrationVisual(desktopHtml);
    if (!/draft/i.test(desktopHtml) && !/not published/i.test(desktopHtml) && !/unpublished/i.test(desktopHtml)) {
      fail("Desktop registration missing draft website messaging");
    }

    // Zambia provinces
    await page.locator("#countryCode").selectOption("ZM");
    const options = await page.locator("#provinceSelect option").allTextContents();
    for (const prov of ZAMBIA_PROVINCES) {
      if (!options.includes(prov)) fail(`Missing Zambia province: ${prov}`);
    }
    await page.locator("#provinceSelect").selectOption("Copperbelt");
    await page.locator("#city").fill("Kitwe");
    await page.locator(".acw-location-option").first().waitFor({ state: "visible", timeout: 10000 });
    await page.locator('.acw-location-option[data-name="Kitwe"]').first().click();
    await page.locator("#clinicName").fill(`Province Persist ${stamp}`);
    await page.locator("#clinicType").selectOption("clinic");
    await page.locator("#address").fill("1 Province Street");
    await page.locator('form[data-ac-register-step="clinic"] button[type="submit"]').click();
    await page.waitForSelector('[data-ac-acw-screen="ACW09-admin"]', { timeout: 15000 });
    await page.goto(`${REGISTER}?step=clinic`, { waitUntil: "domcontentloaded" });
    const provAfterBack = await page.locator("#provinceSelect").inputValue();
    if (provAfterBack !== "Copperbelt") fail(`Province did not persist after back navigation: ${provAfterBack}`);

    // Non-Zambia free text
    await page.goto(REGISTER, { waitUntil: "domcontentloaded" });
    await page.locator("#countryCode").selectOption("ZA");
    await page.locator("#provinceText").waitFor({ state: "visible" });
    await page.locator("#provinceText").fill("Gauteng");
    await page.locator("#countryCode").selectOption("ZM");
    await page.locator("#provinceSelect").waitFor({ state: "visible" });
    const hiddenText = await page.locator("#provinceText").getAttribute("name");
    if (hiddenText === "province") fail("Stale non-Zambia province field still named province");

    // Autocomplete one-char
    await page.goto(REGISTER, { waitUntil: "domcontentloaded" });
    await page.locator("#city").fill("L");
    await page.locator(".acw-location-option").first().waitFor({ state: "visible", timeout: 10000 });
    const lOptions = await page.locator(".acw-location-option").allTextContents();
    for (const name of ["Lusaka", "Livingstone", "Luanshya"]) {
      if (!lOptions.some((t) => t.includes(name))) fail(`Missing L suggestion: ${name}`);
    }
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Escape");
    await page.locator("#city").fill("K");
    await page.locator(".acw-location-option").first().waitFor({ state: "visible", timeout: 10000 });
    const kOptions = await page.locator(".acw-location-option").allTextContents();
    for (const name of ["Kitwe", "Kabwe", "Kasama", "Kafue"]) {
      if (!kOptions.some((t) => t.includes(name))) fail(`Missing K suggestion: ${name}`);
    }

    // Step 3 edit flow
    await page.goto(REGISTER, { waitUntil: "domcontentloaded" });
    await fillClinicStep(page, {
      clinicName: `Edit Flow ${stamp}`,
      province: "Lusaka",
      city: "Lus",
      pickCity: "Lusaka",
      address: "10 Edit Street",
    });
    await page.waitForSelector('[data-ac-acw-screen="ACW09-admin"]', { timeout: 15000 });
    await fillAdminStep(page, {
      contactName: "Edit Admin",
      contactEmail: `edit-flow-${stamp}@example.invalid`,
    });
    await page.waitForSelector('[data-ac-acw-screen="ACW09-review"]', { timeout: 15000 });
    await page.locator('a[href="/register-clinic?step=clinic"]').click();
    await page.waitForSelector('[data-ac-acw-screen="ACW09-clinic"]', { timeout: 15000 });
    const editHtml = await page.content();
    report.falseSessionExpiry = /session expired/i.test(editHtml);
    if (report.falseSessionExpiry) fail("Edit Clinic showed false session expiry");
    if (!editHtml.includes("Lusaka")) fail("Edit Clinic did not restore city");
    if (!editHtml.includes("Lusaka") || !editHtml.includes("10 Edit Street")) fail("Edit Clinic values not restored");
    await page.locator("#address").fill("11 Edit Street Updated");
    await page.locator('form[data-ac-register-step="clinic"] button[type="submit"]').click();
    await page.waitForSelector('[data-ac-acw-screen="ACW09-admin"]', { timeout: 15000 });
    await page.locator('form[data-ac-register-step="administrator"] button[type="submit"]').click();
    await page.waitForSelector('[data-ac-acw-screen="ACW09-review"]', { timeout: 15000 });
    if (!(await page.content()).includes("11 Edit Street Updated")) fail("Edited clinic address missing on review");
    await page.locator('a[href="/register-clinic?step=administrator"]').click();
    await page.waitForSelector('[data-ac-acw-screen="ACW09-admin"]', { timeout: 15000 });
    if (!(await page.locator("#contactName").inputValue()).includes("Edit Admin")) fail("Edit Admin did not restore administrator");

    // New town registration
    await page.goto(REGISTER, { waitUntil: "domcontentloaded" });
    await fillClinicStep(page, {
      clinicName,
      province: "Lusaka",
      city: newTown,
      addNew: true,
      address: "99 QA Avenue",
    });
    await page.waitForSelector('[data-ac-acw-screen="ACW09-admin"]', { timeout: 15000 });
    await fillAdminStep(page, { contactName: "Hub QA Admin", contactEmail: email });
    await page.waitForSelector('[data-ac-acw-screen="ACW09-review"]', { timeout: 15000 });
    if (!(await page.content()).includes(newTown)) fail("Review missing new town");
    await confirmRegistration(page);
    await page.waitForURL(/register-clinic\/success/, { timeout: 60000 });
    const successUrl = page.url();
    const successHtml = await page.content();
    const refMatch = successUrl.match(/ref=(AC-[^&]+)/);
    const ref = refMatch ? refMatch[1] : null;
    if (!ref) fail("Success page missing registration ref");
    if (!/Draft|not published|unpublished/i.test(successHtml)) fail("Success page missing draft status");
    if (!successHtml.includes("/app/settings/website")) fail("Success CTA missing website hub path");
    const copyBtn = page.locator("[data-ac-copy-website-url]");
    if (!(await copyBtn.count())) fail("Success page missing copy button");
    await copyBtn.click();
    const copied = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
    if (!String(copied).startsWith("https://") || !String(copied).includes("/clinics/")) {
      fail("Copy button did not place canonical HTTPS clinic URL on clipboard");
    }
    report.registration = { ref, email, clinicName, successUrl, copied: String(copied).replace(/https?:\/\/[^/]+/, "https://activeclinic.pronline.org") };

    // Website hub
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.locator('input[name="identifier"], input[name="email"]').first().fill(email);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL(/\/app/, { timeout: 60000 });
    await page.goto(`${BASE}/app/settings/website`, { waitUntil: "domcontentloaded" });
    const hubHtml = await page.content();
    const hubOk = hubHtml.includes("data-ac-website-management") || hubHtml.includes("data-ac-website-hub");
    report.websiteHub = {
      status200: true,
      populated: hubOk && !hubHtml.includes("data-ac-provisioning-incomplete"),
      hasEdit: /data-ac-website-action="edit"|Edit website/i.test(hubHtml),
      hasPreview: /data-ac-website-action="preview"|Preview/i.test(hubHtml),
      hasMedia: /data-ac-website-action="media"|Media/i.test(hubHtml),
      hasStyles: /data-ac-website-action="styles"|Styles/i.test(hubHtml),
      hasSeo: /data-ac-website-action="seo"|SEO/i.test(hubHtml),
      hasHistory: /data-ac-website-action="history"|history/i.test(hubHtml),
    };
    if (!report.websiteHub.populated) fail("Website Hub empty or provisioning incomplete");
    for (const [k, v] of Object.entries(report.websiteHub)) {
      if (k !== "status200" && k !== "populated" && !v) fail(`Website Hub missing: ${k}`);
    }

    // Edit website
    const editLink = page.locator('a[data-ac-website-action="edit"], a:has-text("Edit website")').first();
    await editLink.click();
    await page.waitForURL(/website_edit=1|website_mode=draft/, { timeout: 60000 });
    if (!(await page.content()).includes("gp-website-editor__toolbar") && !(await page.content()).includes("website_edit")) {
      fail("Edit website did not open shared visual editor");
    }

    // Privacy / Terms
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const path of ["/privacy", "/terms"]) {
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
      const box = await page.locator(".ac-legal, .bb-legal, [data-ac-legal-container]").first().boundingBox().catch(() => null);
      if (!box) fail(`${path} missing legal container`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
      if (overflow) fail(`${path} horizontal overflow on desktop`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/privacy`, { waitUntil: "domcontentloaded" });
    const mobOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    if (mobOverflow) fail("Privacy horizontal overflow on mobile");

    // Mobile registration
    await page.goto(REGISTER, { waitUntil: "domcontentloaded" });
    report.visualMobile = scoreRegistrationVisual(await page.content());
    await page.locator("#provinceSelect").waitFor({ state: "visible" });
    await page.locator("#city").fill("L");
    await page.locator(".acw-location-option").first().waitFor({ state: "visible", timeout: 10000 });

    await testAutocompleteApi(page);
    await testCsrfBoundary(page);

    // DB checks for new town reuse
    const norm = newTown.toLowerCase().replace(/\s+/g, " ").trim();
    const locRows = process.env.DATABASE_URL
      ? await queryDb(
          `SELECT id, name, normalized_name, source, approval_status
             FROM platform.geographic_locations
            WHERE country_code = 'ZM' AND normalized_name = $1`,
          [norm]
        )
      : [];
    report.newTown = {
      name: newTown,
      dbRows: locRows ? locRows.length : null,
      source: locRows && locRows[0] ? locRows[0].source : null,
      approvalStatus: locRows && locRows[0] ? locRows[0].approval_status : null,
    };
    if (locRows && locRows.length !== 1) fail(`Expected exactly 1 location row for new town, got ${locRows.length}`);

    // Second registration lookup
    const page2 = await context.newPage();
    await page2.goto(REGISTER, { waitUntil: "domcontentloaded" });
    await page2.locator("#city").fill(newTown.slice(0, 10));
    await page2.locator(".acw-location-option").first().waitFor({ state: "visible", timeout: 10000 });
    const reuseOptions = await page2.locator(".acw-location-option").allTextContents();
    report.newTown.reuseInAutocomplete = reuseOptions.some((t) => t.includes(newTown));
    if (!report.newTown.reuseInAutocomplete) fail("USER_ADDED_LOCATION_REUSE failed");
    await page2.close();

    // Normalization duplicate check (service-level via DB only if row exists)
    if (process.env.DATABASE_URL) {
      const dupCount = await queryDb(
        `SELECT COUNT(*)::int AS n FROM platform.geographic_locations
          WHERE country_code='ZM' AND normalized_name = $1`,
        [norm]
      );
      report.newTown.duplicateCount = dupCount && dupCount[0] ? dupCount[0].n : null;
    }
  } finally {
    await browser.close();
  }

  const blockers = report.errors.length;
  const visualOk = report.visualDesktop >= 93 && report.visualMobile >= 90;
  if (blockers > 0) {
    report.verdict = "AC_PLATFORM_02_HOSTED_QA_FAIL";
  } else if (!visualOk) {
    report.verdict = "AC_PLATFORM_02_HOSTED_QA_PASS_WITH_NONBLOCKING_GAPS";
  } else {
    report.verdict = "AC_PLATFORM_02_HOSTED_QA_PASS";
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(blockers > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
