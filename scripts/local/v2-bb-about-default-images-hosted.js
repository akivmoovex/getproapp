"use strict";

/**
 * V2.0 BUG 15 — BlessBoard About Life Together / Visit on Sunday default images.
 * Disposable V8 QA + Demo Church 22 (read). Does not write production.
 */

const fs = require("fs");
const https = require("https");
const { URL } = require("url");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const CREDS_PATH = path.join(ROOT, ".env.v8-qa-tenants.local");
const BB = process.env.V2_BB_HOSTED_BASE || "https://blessboard.neuniversity.org";
const V7_BB = "https://blessboard.pronline.org";
const EXPECTED_SHA_PREFIX = process.env.V2_BB_ABOUT_IMAGES_EXPECTED_SHA || "PLACEHOLDER";
const OUT = process.env.V2_BB_ABOUT_IMAGES_OUT || "/tmp/v2-bb-about-default-images-hosted.json";

const creds = {};
for (const line of fs.readFileSync(CREDS_PATH, "utf8").split(/\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) creds[m[1]] = m[2];
}

const ORG = creds.V8_QA_BB_ORG_KEY || "bb-v8qa-mub23a6v6a6b";
const DEMO22 = "demo-church-22";

class Jar {
  constructor() {
    this.map = new Map();
  }
  absorb(h) {
    for (const raw of [].concat(h["set-cookie"] || [])) {
      const p = String(raw).split(";")[0];
      const i = p.indexOf("=");
      if (i > 0) this.map.set(p.slice(0, i), p.slice(i + 1));
    }
  }
  header() {
    return [...this.map].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

function req(jar, url, opt = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    let body = null;
    const headers = {
      "User-Agent": "Mozilla/5.0 V2AboutImagesQA",
      Cookie: jar.header(),
      Accept: opt.accept || "text/html,application/xhtml+xml",
      ...(opt.headers || {}),
    };
    if (opt.json) {
      body = JSON.stringify(opt.json);
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(body);
    }
    const r = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: opt.method || "GET",
        headers,
        timeout: 90000,
      },
      (res) => {
        jar.absorb(res.headers);
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            location: res.headers.location || "",
            body: Buffer.concat(chunks).toString("utf8"),
            url: u.href,
          });
        });
      }
    );
    r.on("error", reject);
    r.on("timeout", () => r.destroy(new Error("timeout")));
    if (body) r.write(body);
    r.end();
  });
}

async function follow(jar, res, base) {
  let cur = res;
  for (let i = 0; i < 8; i++) {
    if (!(cur.status >= 300 && cur.status < 400 && cur.location)) return cur;
    const next = cur.location.startsWith("http") ? cur.location : `${base}${cur.location}`;
    cur = await req(jar, next);
  }
  return cur;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForDeploy(prefix, maxMs = 12 * 60 * 1000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < maxMs) {
    const hz = await req(new Jar(), `${BB}/healthz`, { accept: "application/json" });
    let body = {};
    try {
      body = JSON.parse(hz.body || "{}");
    } catch (_e) {
      body = {};
    }
    last = {
      status: hz.status,
      gitSha: body.gitSha || null,
      deploymentCode: body.deploymentCode || null,
      platformLine: body.platformLine || null,
    };
    if (hz.status === 200 && String(body.gitSha || "").startsWith(prefix)) {
      return { ok: true, hosted: last };
    }
    await sleep(15000);
  }
  return { ok: false, hosted: last, blockReason: "deploy_sha_timeout" };
}

function extractSection(html, attr) {
  const re = new RegExp(`${attr}="1"[\\s\\S]*?<\\/section>`, "i");
  const m = html.match(re);
  return m ? m[0] : "";
}

function sectionImages(chunk) {
  return [...chunk.matchAll(/<img[^>]+src="([^"]+)"/gi)].map((m) => m[1]);
}

function analyzeAbout(html, label) {
  const gallery = extractSection(html, "data-bb-about-gallery");
  const life = extractSection(html, "data-bb-about-life-together");
  const visit = extractSection(html, "data-bb-about-visit");
  const galleryImgs = sectionImages(gallery);
  const lifeImgs = sectionImages(life);
  const visitImgs = sectionImages(visit);
  const lifeSrc = lifeImgs[0] || "";
  const visitSrc = visitImgs[0] || "";
  return {
    label,
    hasLifeTogether: /data-bb-about-life-together="1"/.test(html),
    hasVisit: /data-bb-about-visit="1"/.test(html),
    hasGallery: /data-bb-about-gallery="1"/.test(html),
    lifeHeading: /Life Together/i.test(life),
    visitHeading: /Visit on a Sunday|Visit on Sunday/i.test(visit),
    galleryImageCount: galleryImgs.length,
    lifeImage: lifeSrc ? lifeSrc.slice(0, 140) : null,
    visitImage: visitSrc ? visitSrc.slice(0, 140) : null,
    lifeOk: Boolean(lifeSrc) && /about-culture-1|life-together|about\/about-culture/i.test(lifeSrc),
    visitOk:
      Boolean(visitSrc) && /about-branch-building|visit-sunday|about\/about-branch/i.test(visitSrc),
    independentFromGallery:
      Boolean(lifeSrc) &&
      Boolean(visitSrc) &&
      !galleryImgs.includes(lifeSrc) &&
      !galleryImgs.includes(visitSrc) &&
      lifeSrc !== visitSrc,
    orphanGenericLife: /data-bb-about-generic="1"[\s\S]*?>Life Together</i.test(html),
    orphanGenericVisit: /data-bb-about-generic="1"[\s\S]*?>Visit on a Sunday</i.test(html),
  };
}

async function headOk(url) {
  const res = await req(new Jar(), url, { accept: "*/*" });
  return { status: res.status, ok: res.status === 200, url: url.slice(0, 140) };
}

async function syncMarketingMedia() {
  const res = await req(new Jar(), `${BB}/__platform/qa/sync-platform-marketing-media`, {
    method: "POST",
    accept: "application/json",
    json: { confirm: "sync-platform-marketing-media-to-hostinger" },
  });
  let json = {};
  try {
    json = JSON.parse(res.body || "{}");
  } catch (_e) {
    json = {};
  }
  return { status: res.status, json };
}

async function main() {
  const result = {
    status: "BLOCKED",
    expectedShaPrefix: EXPECTED_SHA_PREFIX,
    organizationKey: ORG,
    startedAt: new Date().toISOString(),
  };

  if (EXPECTED_SHA_PREFIX === "PLACEHOLDER") {
    result.blockReason = "set_V2_BB_ABOUT_IMAGES_EXPECTED_SHA";
    fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    process.exit(2);
  }

  const deploy = await waitForDeploy(EXPECTED_SHA_PREFIX);
  result.deploy = deploy;
  result.hostedSha = deploy.hosted && deploy.hosted.gitSha;
  if (!deploy.ok) {
    result.blockReason = deploy.blockReason;
    fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    process.exit(2);
  }

  const prod = await req(new Jar(), `${V7_BB}/healthz`, { accept: "application/json" });
  let prodBody = {};
  try {
    prodBody = JSON.parse(prod.body || "{}");
  } catch (_e) {
    prodBody = {};
  }
  result.productionUntouched = {
    ok: prod.status === 200 && !String(prodBody.platformLine || "").toLowerCase().includes("v8"),
    gitSha: prodBody.gitSha || null,
    deploymentCode: prodBody.deploymentCode || null,
  };

  result.marketingSync = await syncMarketingMedia();

  const qaPublic = await follow(new Jar(), await req(new Jar(), `${BB}/c/${ORG}/about`), BB);
  const demoPublic = await follow(
    new Jar(),
    await req(new Jar(), `${BB}/c/${DEMO22}/about`),
    BB
  );

  result.qaChurch = analyzeAbout(qaPublic.body, "qa");
  result.demoChurch22 = analyzeAbout(demoPublic.body, "demo22");
  result.urls = {
    qa: qaPublic.url,
    demo22: demoPublic.url,
  };

  const cdnChecks = [];
  for (const src of [result.qaChurch.lifeImage, result.qaChurch.visitImage].filter(Boolean)) {
    const abs = src.startsWith("http") ? src : `${BB}${src}`;
    cdnChecks.push(await headOk(abs));
  }
  result.cdn = {
    checks: cdnChecks,
    ok: cdnChecks.length >= 2 && cdnChecks.every((c) => c.ok),
  };

  // Draft preview (authorized)
  const jar = new Jar();
  const loginPage = await req(jar, `${BB}/login`);
  const csrf =
    (String(loginPage.body || "").match(/name=["']_csrf["'][^>]*value=["']([^"']+)/i) || [])[1] ||
    "";
  const posted = await follow(
    jar,
    await new Promise((resolve, reject) => {
      const u = new URL(`${BB}/login`);
      const body = new URLSearchParams({
        _csrf: csrf,
        email: creds.V8_QA_BB_HQ_EMAIL,
        password: creds.V8_QA_BB_PASSWORD,
      }).toString();
      const r = https.request(
        {
          hostname: u.hostname,
          path: u.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": Buffer.byteLength(body),
            Cookie: jar.header(),
            Referer: `${BB}/login`,
            "User-Agent": "Mozilla/5.0 V2AboutImagesQA",
          },
          timeout: 90000,
        },
        (res) => {
          jar.absorb(res.headers);
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () =>
            resolve({
              status: res.statusCode,
              location: res.headers.location || "",
              body: Buffer.concat(chunks).toString("utf8"),
              url: u.href,
            })
          );
        }
      );
      r.on("error", reject);
      r.write(body);
      r.end();
    }),
    BB
  );

  const draft = await follow(
    jar,
    await req(jar, `${BB}/c/${ORG}/about?website_edit=1&website_mode=draft`),
    BB
  );
  result.draftPreview = analyzeAbout(draft.body, "qa-draft");
  result.login = { ok: posted.status === 200, url: posted.url };

  const reloginJar = new Jar();
  const lp = await req(reloginJar, `${BB}/login`);
  const csrf2 =
    (String(lp.body || "").match(/name=["']_csrf["'][^>]*value=["']([^"']+)/i) || [])[1] || "";
  await follow(
    reloginJar,
    await new Promise((resolve, reject) => {
      const u = new URL(`${BB}/login`);
      const body = new URLSearchParams({
        _csrf: csrf2,
        email: creds.V8_QA_BB_HQ_EMAIL,
        password: creds.V8_QA_BB_PASSWORD,
      }).toString();
      const r = https.request(
        {
          hostname: u.hostname,
          path: u.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": Buffer.byteLength(body),
            Cookie: reloginJar.header(),
            Referer: `${BB}/login`,
            "User-Agent": "Mozilla/5.0 V2AboutImagesQA",
          },
          timeout: 90000,
        },
        (res) => {
          reloginJar.absorb(res.headers);
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () =>
            resolve({
              status: res.statusCode,
              location: res.headers.location || "",
              body: Buffer.concat(chunks).toString("utf8"),
              url: u.href,
            })
          );
        }
      );
      r.on("error", reject);
      r.write(body);
      r.end();
    }),
    BB
  );
  const again = await follow(
    reloginJar,
    await req(reloginJar, `${BB}/c/${ORG}/about?website_edit=1&website_mode=draft`),
    BB
  );
  result.relogin = analyzeAbout(again.body, "qa-relogin");

  const passChurch = (c) =>
    c.hasLifeTogether &&
    c.hasVisit &&
    c.lifeOk &&
    c.visitOk &&
    c.independentFromGallery &&
    !c.orphanGenericLife &&
    !c.orphanGenericVisit;

  result.status =
    passChurch(result.qaChurch) &&
    passChurch(result.demoChurch22) &&
    passChurch(result.draftPreview) &&
    passChurch(result.relogin) &&
    result.cdn.ok &&
    result.productionUntouched.ok &&
    result.marketingSync.status === 200 &&
    result.marketingSync.json.ok === true
      ? "PASS"
      : "BLOCKED";

  if (result.status !== "PASS") {
    result.blockReason = [
      !passChurch(result.qaChurch) && "qa_church_missing_defaults",
      !passChurch(result.demoChurch22) && "demo22_missing_defaults",
      !passChurch(result.draftPreview) && "draft_missing_defaults",
      !passChurch(result.relogin) && "relogin_missing_defaults",
      !result.cdn.ok && "cdn_fetch_failed",
      !(result.marketingSync.status === 200 && result.marketingSync.json.ok) && "marketing_sync_failed",
      !result.productionUntouched.ok && "production_touched",
    ]
      .filter(Boolean)
      .join(",");
  }

  result.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === "PASS" ? 0 : 2);
}

main().catch((err) => {
  const result = {
    status: "BLOCKED",
    blockReason: String(err && err.stack ? err.stack : err),
  };
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.error(JSON.stringify(result, null, 2));
  process.exit(2);
});
