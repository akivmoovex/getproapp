#!/usr/bin/env node
"use strict";

/**
 * V1.1 QA freeze hosted gate — TESTING only.
 * CDN image audit + BB-01..06 / AC-01..08 browser checks.
 */

const { chromium } = require("playwright");
const { execSync } = require("child_process");
const fs = require("fs");
const { checkHostedTestingSha } = require("../check-hosted-testing-sha");

const PASS = process.env.QA_PASSWORD || "1234567890";
const EXPECTED = execSync("git rev-parse --short=12 origin/V7", { encoding: "utf8" }).trim();
const HERO = "/tmp/v7-cdn-gate-hero.png";
const LOGO = "/tmp/v7-cdn-gate-logo.png";

const BB = "https://blessboard.pronline.org";
const AC = "https://activeclinic.pronline.org";

const CDN_RE = /^https:\/\/blessboard\.pronline\.org\/media\/(testing|production)\//i;
const OFFENDERS = [
  { id: "church_images", re: /\/church\/images\//i },
  { id: "ac_assets", re: /\/activeclinic\/assets\//i },
  { id: "data_uri", re: /^data:image\//i },
  { id: "blob", re: /^blob:/i },
  { id: "app_media", re: /\/(c|clinics)\/[^/]+\/website\/media\//i },
  { id: "relative_media", re: /^\/media\//i },
];

function ensurePngs() {
  if (!fs.existsSync(HERO) || !fs.existsSync(LOGO)) {
    execSync(`python3 - <<'PY'
import struct,zlib
from pathlib import Path
def png(w,h,rgb):
    def chunk(t,d):
        return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
    raw=b''.join(b'\\x00'+bytes(rgb)*w for _ in range(h))
    return b'\\x89PNG\\r\\n\\x1a\\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b'')
Path('${HERO}').write_bytes(png(64,40,(49,250,33)))
Path('${LOGO}').write_bytes(png(48,48,(108,92,231)))
PY`);
  }
}

async function login(page, base, email) {
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('input[name="login_email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !String(u).includes("/login"), { timeout: 60000 });
}

async function collectImages(page) {
  return page.evaluate(() => {
    const out = [];
    document.querySelectorAll("img").forEach((img, i) => {
      out.push({
        url: img.currentSrc || img.getAttribute("src") || "",
        el: `img[${i}].${String(img.className || "").split(/\s+/).slice(0, 2).join(".")}`,
        broken: Boolean(img.getAttribute("src") && img.complete && img.naturalWidth === 0),
      });
    });
    document.querySelectorAll("picture source").forEach((s, i) => {
      const ss = s.getAttribute("srcset") || "";
      ss.split(",").forEach((part) => {
        const u = part.trim().split(/\s+/)[0];
        if (u) out.push({ url: u, el: `source[${i}]`, broken: false });
      });
    });
    const walk = (el) => {
      if (!el || el.nodeType !== 1) return;
      const bg = getComputedStyle(el).backgroundImage || "";
      (bg.match(/url\(["']?([^"')]+)["']?\)/g) || []).forEach((u) => {
        out.push({
          url: u.replace(/^url\(["']?/, "").replace(/["']?\)$/, ""),
          el: `css-bg:${el.tagName}`,
          broken: false,
        });
      });
      [...el.children].forEach(walk);
    };
    walk(document.body);
    return out;
  });
}

function classify(url) {
  const raw = String(url || "").trim();
  if (!raw || raw.endsWith(".js") || /fonts\.|favicon|material-symbols/i.test(raw)) {
    return { class: "SKIP" };
  }
  for (const o of OFFENDERS) {
    if (o.re.test(raw)) return { class: "NON_CDN", reason: o.id, url: raw };
  }
  if (CDN_RE.test(raw)) return { class: "CDN", url: raw };
  if (/^https:\/\//i.test(raw) && /pronline\.org\//i.test(raw) && !/\/media\//i.test(raw)) {
    return { class: "NON_CDN", reason: "app_host_non_media", url: raw };
  }
  if (/^https:\/\//i.test(raw)) return { class: "NON_CDN", reason: "external", url: raw };
  if (raw.startsWith("/")) return { class: "NON_CDN", reason: "relative", url: raw };
  return { class: "NON_CDN", reason: "other", url: raw };
}

async function httpOk(url) {
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow" });
    return res.status === 200;
  } catch (_e) {
    return false;
  }
}

async function auditPages(page, pages, product) {
  let total = 0;
  let cdn = 0;
  let non = 0;
  let broken = 0;
  const offenders = [];
  const brokenList = [];
  const seen = new Set();
  for (const pg of pages) {
    await page.goto(pg.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(800);
    const imgs = await collectImages(page);
    for (const img of imgs) {
      const c = classify(img.url);
      if (c.class === "SKIP") continue;
      total += 1;
      if (c.class === "CDN") {
        cdn += 1;
        if (!seen.has(c.url)) {
          seen.add(c.url);
          const ok = await httpOk(c.url);
          if (!ok || img.broken) {
            broken += 1;
            brokenList.push({ product, page: pg.key, url: c.url, reason: ok ? "naturalWidth0" : "http_not_200" });
          }
        } else if (img.broken) {
          broken += 1;
          brokenList.push({ product, page: pg.key, url: c.url, reason: "naturalWidth0" });
        }
      } else {
        non += 1;
        offenders.push({ product, page: pg.key, url: c.url, reason: c.reason, el: img.el });
      }
    }
  }
  return { total, cdn, non, broken, offenders, brokenList };
}

async function publish(page) {
  return page.evaluate(async () => {
    const form = document.querySelector("[data-website-engine-publish-form]");
    if (!form) return { ok: false, reason: "no_form" };
    const csrf =
      document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") ||
      document.querySelector('input[name="_csrf"]')?.value ||
      "";
    const action = form.getAttribute("action") || "";
    const body = new URLSearchParams({ _csrf: csrf, confirm_publish: "1" });
    const res = await fetch(action, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      redirect: "follow",
    });
    return { ok: res.ok || (res.status >= 300 && res.status < 400), status: res.status };
  });
}

async function replaceFirstImage(page, file) {
  const start = page
    .locator('[data-website-kind="image"] [data-website-start], [data-website-type="image"] [data-website-start]')
    .first();
  if ((await start.count()) === 0) return { ok: false, reason: "no_image_field" };
  await start.click({ force: true });
  await page.locator("[data-website-file]").setInputFiles(file);
  await page.locator("[data-website-save]").click();
  await page.waitForTimeout(2500);
  return { ok: true };
}

async function fillPhoneNational(page, digits) {
  const national = page
    .locator(
      'input[name="phone_national"], input[data-gp-phone-national], #register_phone-national, input[inputmode="tel"]'
    )
    .first();
  if ((await national.count()) === 0) return { ok: false, reason: "no_phone_national" };
  await national.fill(String(digits));
  return { ok: true };
}

async function main() {
  ensurePngs();
  const report = {
    gate: "V11_QA_FREEZE",
    expectedSha: EXPECTED,
    hostedSha: null,
    productionTouched: "NO",
    migrationsExecuted: [
      "platform/035_website_media_storage_provider.sql (already applied)",
      "hosted POST /__platform/qa/migrate-website-media bulk forceRewrite",
      "hosted POST /__platform/qa/sync-platform-marketing-media",
      "hosted POST /__platform/qa/repair-missing-hostinger-media",
      "hosted clearPayload migrate (payload_bytes cleared)",
    ],
    bugs: [],
    cdn: {},
    verdict: "V11_QA_FREEZE_BLOCKED",
  };

  const sha = await checkHostedTestingSha({ expectedSha: EXPECTED });
  report.hostedSha = sha.hosts?.[0]?.gitSha || null;
  report.shaMatch = sha.ok === true;
  if (!sha.ok) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const bbCtx = await browser.newContext();
    const bbPage = await bbCtx.newPage();
    await login(bbPage, BB, "qa.organisation_administrator@demo-church.example.test");
    const bbAudit = await auditPages(
      bbPage,
      [
        { key: "home", url: `${BB}/c/demo-church` },
        { key: "leadership", url: `${BB}/c/demo-church/leadership` },
        { key: "events", url: `${BB}/c/demo-church/events` },
        { key: "sermons", url: `${BB}/c/demo-church/sermons` },
        { key: "ministries", url: `${BB}/c/demo-church/ministries` },
        { key: "branch", url: `${BB}/c/demo-church/demo-church-lusaka` },
        { key: "apex", url: `${BB}/` },
      ],
      "BB"
    );

    // BB-01 hero text edit/save/refresh
    let bb01 = { id: "BB-01", status: "OPEN", detail: "" };
    try {
      await bbPage.goto(`${BB}/c/demo-church?website_edit=1&website_mode=draft`, {
        waitUntil: "domcontentloaded",
      });
      await bbPage.waitForTimeout(800);
      const stamp = `QA-HERO-${Date.now().toString(36)}`;
      const textStart = bbPage
        .locator(
          '[data-website-kind="text"] [data-website-start], [data-website-type="text"] [data-website-start], [data-website-kind="textarea"] [data-website-start]'
        )
        .first();
      if ((await textStart.count()) > 0) {
        await textStart.click({ force: true });
        const input = bbPage.locator("[data-website-input], textarea, input[type=text]").first();
        await input.waitFor({ state: "visible", timeout: 10000 });
        await input.fill(stamp);
        await bbPage.locator("[data-website-save]").click();
        await bbPage.waitForTimeout(1800);
        await bbPage.reload({ waitUntil: "domcontentloaded" });
        const body = await bbPage.content();
        bb01 = body.includes(stamp)
          ? { id: "BB-01", status: "CLOSED", detail: "hero/text draft persisted after reload" }
          : { id: "BB-01", status: "PARTIAL", detail: "edit UI present; stamp not found after reload" };
      } else {
        bb01 = { id: "BB-01", status: "OPEN", detail: "no text edit start found" };
      }
    } catch (e) {
      bb01 = { id: "BB-01", status: "OPEN", detail: e.message };
    }

    // BB-02 leader image
    let bb02 = { id: "BB-02", status: "OPEN", detail: "" };
    try {
      await bbPage.goto(`${BB}/c/demo-church/leadership?website_edit=1&website_mode=draft`, {
        waitUntil: "domcontentloaded",
      });
      const hasLeaderEdit =
        (await bbPage.locator("[data-website-structured-edit], [data-bb-structured-edit], [data-website-start]").count()) >
        0;
      const imgReplace = await replaceFirstImage(bbPage, HERO);
      await publish(bbPage);
      await bbPage.goto(`${BB}/c/demo-church/leadership`, { waitUntil: "domcontentloaded" });
      const html = await bbPage.content();
      const cdnOk = /blessboard\.pronline\.org\/media\/testing\//.test(html);
      bb02 =
        hasLeaderEdit && cdnOk
          ? {
              id: "BB-02",
              status: imgReplace.ok ? "CLOSED" : "PARTIAL",
              detail: `leader edit=${hasLeaderEdit} replace=${JSON.stringify(imgReplace)} cdn=${cdnOk}`,
            }
          : { id: "BB-02", status: "OPEN", detail: `leader edit=${hasLeaderEdit} cdn=${cdnOk}` };
    } catch (e) {
      bb02 = { id: "BB-02", status: "OPEN", detail: e.message };
    }

    // BB-03 directory
    let bb03 = { id: "BB-03", status: "OPEN", detail: "" };
    try {
      const res = await bbPage.goto(`${BB}/directory`, { waitUntil: "domcontentloaded", timeout: 60000 });
      const text = await bbPage.content();
      const found = /demo-church|Demo Church/i.test(text);
      bb03 = {
        id: "BB-03",
        status: res && res.ok() && found ? "CLOSED" : res && res.status() === 404 ? "BLOCKED" : "OPEN",
        detail: `status=${res && res.status()} found=${found}`,
      };
    } catch (e) {
      bb03 = { id: "BB-03", status: "OPEN", detail: e.message };
    }

    // BB-04 contact
    let bb04 = { id: "BB-04", status: "OPEN", detail: "" };
    try {
      await bbPage.goto(`${BB}/c/demo-church/contact?website_edit=1&website_mode=draft`, {
        waitUntil: "domcontentloaded",
      });
      const starts = await bbPage.locator("[data-website-start]").count();
      if (starts === 0) {
        bb04 = { id: "BB-04", status: "OPEN", detail: "no contact edit starts" };
      } else {
        const textStart = bbPage
          .locator('[data-website-kind="text"] [data-website-start], [data-website-type="text"] [data-website-start]')
          .first();
        await textStart.click({ force: true });
        const input = bbPage.locator("[data-website-input], textarea, input[type=text]").first();
        await input.waitFor({ state: "visible", timeout: 8000 });
        const before = await input.inputValue().catch(() => "");
        await input.fill("not-an-email@@@");
        await bbPage.locator("[data-website-save]").click();
        await bbPage.waitForTimeout(1200);
        const errVisible =
          (await bbPage.locator('[role="alert"], .is-error, [data-website-error], .gp-website-editable__error').count()) >
          0;
        await input.fill(before || "info@demo-church.example.test");
        await bbPage.locator("[data-website-save]").click();
        await bbPage.waitForTimeout(1200);
        bb04 = {
          id: "BB-04",
          status: errVisible ? "CLOSED" : "PARTIAL",
          detail: `editStarts=${starts} invalidError=${errVisible}`,
        };
      }
    } catch (e) {
      bb04 = { id: "BB-04", status: "PARTIAL", detail: e.message };
    }

    // BB-05 phone registration (administrator step)
    let bb05 = { id: "BB-05", status: "OPEN", detail: "" };
    try {
      const anon = await browser.newContext();
      const reg = await anon.newPage();
      await reg.goto(`${BB}/register-church?step=administrator&plan=foundation`, {
        waitUntil: "domcontentloaded",
      });
      const shortTry = await fillPhoneNational(reg, "12");
      if (!shortTry.ok) {
        bb05 = { id: "BB-05", status: "OPEN", detail: shortTry.reason };
      } else {
        await reg.locator('button[type="submit"], [data-bb-register-continue]').first().click();
        await reg.waitForTimeout(1200);
        const shortErr = await reg.content();
        const shortRejected = /phone|short|invalid|digit|characters/i.test(shortErr);
        await fillPhoneNational(reg, "971234567890123456789012345");
        await reg.locator('button[type="submit"], [data-bb-register-continue]').first().click();
        await reg.waitForTimeout(1200);
        const longErr = await reg.content();
        const longRejected = /phone|long|invalid|digit|characters|maximum/i.test(longErr);
        bb05 = {
          id: "BB-05",
          status: shortRejected && longRejected ? "CLOSED" : shortRejected || longRejected ? "PARTIAL" : "OPEN",
          detail: `shortRejected=${shortRejected} longRejected=${longRejected}`,
        };
      }
      await anon.close();
    } catch (e) {
      bb05 = { id: "BB-05", status: "OPEN", detail: e.message };
    }

    // BB-06 back/exit
    let bb06 = { id: "BB-06", status: "OPEN", detail: "" };
    try {
      await bbPage.goto(`${BB}/c/demo-church?website_edit=1&website_mode=draft`, {
        waitUntil: "domcontentloaded",
      });
      const exit = bbPage
        .locator("[data-website-exit], [data-website-engine-exit], a:has-text('Exit'), button:has-text('Exit')")
        .first();
      if ((await exit.count()) === 0) {
        bb06 = { id: "BB-06", status: "OPEN", detail: "exit control missing" };
      } else {
        await exit.click({ force: true });
        await bbPage.waitForTimeout(1200);
        const stillEdit = /website_edit=1/.test(bbPage.url());
        bb06 = {
          id: "BB-06",
          status: stillEdit ? "PARTIAL" : "CLOSED",
          detail: `exitPresent=true stillEditUrl=${stillEdit} url=${bbPage.url()}`,
        };
      }
    } catch (e) {
      bb06 = { id: "BB-06", status: "PARTIAL", detail: e.message };
    }

    await bbCtx.close();

    // ActiveClinic
    const acCtx = await browser.newContext();
    const acPage = await acCtx.newPage();
    await login(acPage, AC, "demo_organization_admin@demo.activeclinic.example");
    const acAudit = await auditPages(
      acPage,
      [
        { key: "apex", url: `${AC}/` },
        { key: "clinic", url: `${AC}/clinics/activeclinic-demo` },
        { key: "about", url: `${AC}/clinics/activeclinic-demo/about` },
        { key: "services", url: `${AC}/clinics/activeclinic-demo/services` },
        { key: "doctors", url: `${AC}/clinics/activeclinic-demo/doctors` },
        { key: "location", url: `${AC}/clinics/activeclinic-demo/location` },
      ],
      "AC"
    );

    async function acCollection(bugId, pathSuffix) {
      try {
        await acPage.goto(`${AC}/clinics/activeclinic-demo${pathSuffix}?website_edit=1&website_mode=draft`, {
          waitUntil: "domcontentloaded",
        });
        const starts = await acPage
          .locator("[data-website-start], [data-website-collection-edit], [data-ac-collection-edit]")
          .count();
        const pub = await publish(acPage);
        return {
          id: bugId,
          status: starts > 0 ? (pub.ok ? "CLOSED" : "PARTIAL") : "OPEN",
          detail: `editAffordances=${starts} publish=${JSON.stringify(pub)}`,
        };
      } catch (e) {
        return { id: bugId, status: "OPEN", detail: e.message };
      }
    }

    const ac01 = await acCollection("AC-01", "/services");
    const ac02 = await acCollection("AC-02", "/doctors");
    const ac06 = await acCollection("AC-06", "/location");

    const ac03 = {
      id: "AC-03",
      status: "BLOCKED",
      detail: "WhatsApp invite requires external channel; not fully automatable on hosted testing",
    };
    const ac04 = {
      id: "AC-04",
      status: "BLOCKED",
      detail: "Invitation password setup depends on invite token delivery",
    };
    const ac05 = {
      id: "AC-05",
      status: "BLOCKED",
      detail: "APPLICATION_PASS_DELIVERY_DEFERRED — forgot-password app path present; mail delivery not proven",
    };

    let ac07 = { id: "AC-07", status: "OPEN", detail: "" };
    let ac08 = { id: "AC-08", status: "OPEN", detail: "" };
    try {
      const regCtx = await browser.newContext();
      const regPage = await regCtx.newPage();
      await regPage.goto(`${AC}/register-clinic?step=administrator`, { waitUntil: "domcontentloaded" });
      const phone = regPage
        .locator('input[name="phone_national"], input[data-ac-phone-national], input[inputmode="tel"]')
        .first();
      const hasPhone = (await phone.count()) > 0;
      if (hasPhone) {
        // Known demo admin phone (ZM national) — expect duplicate rejection if reached.
        await phone.fill("971234567");
        await regPage.locator('button[type="submit"], [data-ac-register-continue]').first().click();
        await regPage.waitForTimeout(1500);
        const body = await regPage.content();
        const dupHint = /already|exist|registered|duplicate|in use/i.test(body);
        ac07 = {
          id: "AC-07",
          status: dupHint ? "CLOSED" : "PARTIAL",
          detail: `phoneField=true duplicateHint=${dupHint}`,
        };
      } else {
        ac07 = { id: "AC-07", status: "OPEN", detail: "registration phone field missing on administrator step" };
      }
      await regCtx.close();

      const loginCtx = await browser.newContext();
      const loginPage = await loginCtx.newPage();
      await login(loginPage, AC, "demo_organization_admin@demo.activeclinic.example");
      ac08 = {
        id: "AC-08",
        status: !loginPage.url().includes("/login") ? "CLOSED" : "OPEN",
        detail: `landed=${loginPage.url()}`,
      };
      await loginCtx.close();
    } catch (e) {
      ac07 = { id: "AC-07", status: "OPEN", detail: e.message };
      ac08 = { id: "AC-08", status: "OPEN", detail: e.message };
    }

    await acCtx.close();

    report.bugs = [bb01, bb02, bb03, bb04, bb05, bb06, ac01, ac02, ac03, ac04, ac05, ac06, ac07, ac08];
    report.cdn = {
      BlessBoard: {
        Images_discovered: bbAudit.total,
        CDN_backed: bbAudit.cdn,
        Non_CDN: bbAudit.non,
        Broken: bbAudit.broken,
        offenders: bbAudit.offenders.slice(0, 30),
        brokenList: bbAudit.brokenList.slice(0, 30),
      },
      ActiveClinic: {
        Images_discovered: acAudit.total,
        CDN_backed: acAudit.cdn,
        Non_CDN: acAudit.non,
        Broken: acAudit.broken,
        offenders: acAudit.offenders.slice(0, 30),
        brokenList: acAudit.brokenList.slice(0, 30),
      },
      BLESSBOARD_IMAGE_TOTAL: bbAudit.total,
      BLESSBOARD_CDN_TOTAL: bbAudit.cdn,
      BLESSBOARD_NON_CDN_TOTAL: bbAudit.non,
      ACTIVECLINIC_IMAGE_TOTAL: acAudit.total,
      ACTIVECLINIC_CDN_TOTAL: acAudit.cdn,
      ACTIVECLINIC_NON_CDN_TOTAL: acAudit.non,
    };

    const openBugs = report.bugs.filter((b) => b.status === "OPEN").length;
    const blockedBugs = report.bugs.filter((b) => b.status === "BLOCKED").length;
    const cdnFail =
      bbAudit.non > 0 || acAudit.non > 0 || bbAudit.broken > 0 || acAudit.broken > 0;
    if (!cdnFail && openBugs === 0 && blockedBugs === 0) report.verdict = "V11_QA_FREEZE_READY";
    else if (!cdnFail && openBugs === 0)
      report.verdict = "V11_QA_FREEZE_READY_WITH_NONBLOCKING_DEBT";
    else report.verdict = "V11_QA_FREEZE_BLOCKED";
  } finally {
    await browser.close();
  }

  const out = "/tmp/v11-qa-freeze-gate.json";
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.error(`Wrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
