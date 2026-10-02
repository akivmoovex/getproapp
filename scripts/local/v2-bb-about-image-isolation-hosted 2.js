"use strict";

/**
 * V2.0 BUG 16 — About Life Together must not corrupt the three-image gallery grid.
 * Disposable V8 QA only. Production untouched.
 */

const fs = require("fs");
const https = require("https");
const { URL } = require("url");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const CREDS_PATH = path.join(ROOT, ".env.v8-qa-tenants.local");
const BB = process.env.V2_BB_HOSTED_BASE || "https://blessboard.neuniversity.org";
const V7_BB = "https://blessboard.pronline.org";
const EXPECTED_SHA_PREFIX = process.env.V2_BB_ABOUT_ISOLATION_EXPECTED_SHA || "PLACEHOLDER";
const OUT =
  process.env.V2_BB_ABOUT_ISOLATION_OUT || "/tmp/v2-bb-about-image-isolation-hosted.json";

const creds = {};
for (const line of fs.readFileSync(CREDS_PATH, "utf8").split(/\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) creds[m[1]] = m[2];
}

const ORG = creds.V8_QA_BB_ORG_KEY || "bb-v8qa-mub23a6v6a6b";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

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

function csrf(html) {
  const m = String(html || "").match(/name=["']_csrf["'][^>]*value=["']([^"']+)/i);
  if (m) return m[1];
  const alt = String(html || "").match(/value=["']([^"']+)["'][^>]*name=["']_csrf["']/i);
  return alt ? alt[1] : "";
}

function req(jar, url, opt = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    let body = null;
    const headers = {
      "User-Agent": "Mozilla/5.0 V2AboutIsolationQA",
      Cookie: jar.header(),
      Accept: opt.accept || "text/html,application/xhtml+xml",
      ...(opt.headers || {}),
    };
    if (opt.json) {
      body = JSON.stringify(opt.json);
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(body);
    } else if (opt.form) {
      body = new URLSearchParams(opt.form).toString();
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      headers["Content-Length"] = Buffer.byteLength(body);
    } else if (opt.multipart) {
      body = opt.multipart.body;
      headers["Content-Type"] = `multipart/form-data; boundary=${opt.multipart.boundary}`;
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

async function login() {
  const jar = new Jar();
  const page = await req(jar, `${BB}/login`);
  const posted = await follow(
    jar,
    await req(jar, `${BB}/login`, {
      method: "POST",
      form: {
        _csrf: csrf(page.body),
        email: creds.V8_QA_BB_HQ_EMAIL,
        password: creds.V8_QA_BB_PASSWORD,
      },
      headers: { Referer: `${BB}/login` },
    }),
    BB
  );
  return { jar, ok: posted.status === 200, url: posted.url };
}

function extract(html) {
  const gallery = (html.match(/data-bb-about-gallery="1"[\s\S]*?<\/section>/i) || [])[0] || "";
  const life = (html.match(/data-bb-about-life-together="1"[\s\S]*?<\/section>/i) || [])[0] || "";
  const visit = (html.match(/data-bb-about-visit="1"[\s\S]*?<\/section>/i) || [])[0] || "";
  const imgs = (chunk) => [...chunk.matchAll(/<img[^>]+src="([^"]+)"/gi)].map((m) => m[1]);
  const lifeSection =
    ((life.match(/data-section="([^"]+)"/) || [])[1] || "").toLowerCase() || null;
  const lifeTriggerSection =
    (
      (html.match(
        /data-bb-entity="about-life-together"[^>]*data-bb-section="([^"]*)"|data-bb-section="([^"]*)"[^>]*data-bb-entity="about-life-together"/
      ) || [])[1] ||
      (html.match(
        /data-bb-entity="about-life-together"[^>]*data-bb-section="([^"]*)"|data-bb-section="([^"]*)"[^>]*data-bb-entity="about-life-together"/
      ) || [])[2] ||
      ""
    ).toLowerCase() || null;
  return {
    gallery: imgs(gallery),
    life: imgs(life)[0] || null,
    visit: imgs(visit)[0] || null,
    lifeSection,
    lifeTriggerSection,
  };
}

async function uploadPng(jar, uploadUrl, token, filename, buf) {
  const boundary = `----V2AboutIso${Date.now()}`;
  const pre = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="_csrf"\r\n\r\n${token}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`,
    "utf8"
  );
  const post = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  const body = Buffer.concat([pre, buf || PNG, post]);
  const url = uploadUrl.startsWith("http") ? uploadUrl : `${BB}${uploadUrl}`;
  const res = await req(jar, url, {
    method: "POST",
    accept: "application/json",
    headers: {
      "X-CSRF-Token": token,
      Referer: `${BB}/c/${ORG}/about?website_edit=1&website_mode=draft`,
    },
    multipart: { boundary, body },
  });
  let json = {};
  try {
    json = JSON.parse(res.body || "{}");
  } catch (_e) {
    json = {};
  }
  return { status: res.status, json };
}

async function saveImageDraft(jar, token, sectionKey, entityKey, src) {
  const res = await req(jar, `${BB}/hq/content/api/structured-draft`, {
    method: "POST",
    accept: "application/json",
    headers: {
      "X-CSRF-Token": token,
      Referer: `${BB}/c/${ORG}/about?website_edit=1&website_mode=draft`,
    },
    json: {
      _csrf: token,
      action: "save",
      draftKind: "image",
      pageKey: "about",
      sectionKey,
      entityKey,
      op: "upsert",
      payload: { imageUrl: src, altText: entityKey, focal: "center" },
      previousPayload: null,
    },
  });
  let json = {};
  try {
    json = JSON.parse(res.body || "{}");
  } catch (_e) {
    json = {};
  }
  return { status: res.status, json };
}

async function publishWebsite(jar, token) {
  const res = await req(jar, `${BB}/c/${ORG}/website/publish`, {
    method: "POST",
    form: { _csrf: token, confirmPublish: "1" },
    headers: { Referer: `${BB}/c/${ORG}/about?website_edit=1&website_mode=draft` },
  });
  return follow(jar, res, BB);
}

function uniquePng(stamp, n) {
  return Buffer.concat([
    PNG.slice(0, PNG.length - 8),
    Buffer.from([n + 1, stamp.charCodeAt(0) || 1, stamp.charCodeAt(1) || 2, n, 0, 0, 0, 0]),
  ]);
}

async function main() {
  const result = {
    status: "BLOCKED",
    expectedShaPrefix: EXPECTED_SHA_PREFIX,
    organizationKey: ORG,
    startedAt: new Date().toISOString(),
  };

  if (EXPECTED_SHA_PREFIX === "PLACEHOLDER") {
    result.blockReason = "set_V2_BB_ABOUT_ISOLATION_EXPECTED_SHA";
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

  const auth = await login();
  result.login = { ok: auth.ok, url: auth.url };
  if (!auth.ok) {
    result.blockReason = "login_failed";
    fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    process.exit(2);
  }

  const editUrl = `${BB}/c/${ORG}/about?website_edit=1&website_mode=draft`;
  const beforePage = await follow(auth.jar, await req(auth.jar, editUrl), BB);
  const before = extract(beforePage.body);
  result.before = {
    galleryCount: before.gallery.length,
    gallery: before.gallery.map((u) => u.slice(-64)),
    life: before.life ? before.life.slice(-64) : null,
    visit: before.visit ? before.visit.slice(-64) : null,
    lifeSection: before.lifeSection,
    lifeTriggerSection: before.lifeTriggerSection,
  };

  if (before.gallery.length !== 3) {
    result.blockReason = "baseline_gallery_not_three";
    fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    process.exit(2);
  }

  let token = csrf(beforePage.body);
  const uploadUrl = (beforePage.body.match(/data-bb-media-upload="([^"]+)"/) || [])[1] || "";
  const stamp = Date.now().toString(36);
  const lifeSectionKey =
    before.lifeTriggerSection ||
    before.lifeSection ||
    "life_together";

  // Pass 1: edit Life Together
  const up1 = await uploadPng(
    auth.jar,
    uploadUrl,
    token,
    `life-${stamp}-1.png`,
    uniquePng(stamp, 1)
  );
  const media1 = up1.json.media || {};
  const src1 = media1.publicSrc || "";
  const id1 = media1.id || "";
  const save1 = await saveImageDraft(
    auth.jar,
    token,
    lifeSectionKey,
    "about-life-together",
    src1
  );

  const afterLifePage = await follow(auth.jar, await req(auth.jar, editUrl), BB);
  const afterLife = extract(afterLifePage.body);
  result.afterLifeTogether = {
    saveOk: save1.status === 200 && save1.json.ok === true,
    mediaId: id1,
    galleryCount: afterLife.gallery.length,
    galleryUnchanged: JSON.stringify(afterLife.gallery) === JSON.stringify(before.gallery),
    gallery: afterLife.gallery.map((u) => u.slice(-64)),
    lifeHasNew: Boolean(id1) && Boolean(afterLife.life) && afterLife.life.includes(id1),
    galleryHasNew: Boolean(id1) && afterLife.gallery.some((u) => u.includes(id1)),
    visitUnchanged: afterLife.visit === before.visit,
  };

  // Pass 2: edit Visit on Sunday independently
  token = csrf(afterLifePage.body) || token;
  const up2 = await uploadPng(
    auth.jar,
    uploadUrl,
    token,
    `visit-${stamp}-2.png`,
    uniquePng(stamp, 2)
  );
  const media2 = up2.json.media || {};
  const src2 = media2.publicSrc || "";
  const id2 = media2.id || "";
  const save2 = await saveImageDraft(auth.jar, token, "visitor_cta", "about-visit-sunday", src2);
  const afterVisitPage = await follow(auth.jar, await req(auth.jar, editUrl), BB);
  const afterVisit = extract(afterVisitPage.body);
  result.afterVisit = {
    saveOk: save2.status === 200 && save2.json.ok === true,
    mediaId: id2,
    galleryCount: afterVisit.gallery.length,
    galleryStillOriginal: JSON.stringify(afterVisit.gallery) === JSON.stringify(before.gallery),
    lifeStillNew: Boolean(id1) && Boolean(afterVisit.life) && afterVisit.life.includes(id1),
    visitHasNew: Boolean(id2) && Boolean(afterVisit.visit) && afterVisit.visit.includes(id2),
    lifeNotInGallery: !afterVisit.gallery.some((u) => u.includes(id1)),
    visitNotInGallery: !afterVisit.gallery.some((u) => u.includes(id2)),
  };

  // Pass 3: switch order — edit Life Together again, then a gallery slot, assert isolation
  token = csrf(afterVisitPage.body) || token;
  const up3 = await uploadPng(
    auth.jar,
    uploadUrl,
    token,
    `life-${stamp}-3.png`,
    uniquePng(stamp, 3)
  );
  const media3 = up3.json.media || {};
  const src3 = media3.publicSrc || "";
  const id3 = media3.id || "";
  await saveImageDraft(auth.jar, token, lifeSectionKey, "about-life-together", src3);
  const up4 = await uploadPng(
    auth.jar,
    uploadUrl,
    token,
    `grid-${stamp}-4.png`,
    uniquePng(stamp, 4)
  );
  const media4 = up4.json.media || {};
  const src4 = media4.publicSrc || "";
  const id4 = media4.id || "";
  await saveImageDraft(auth.jar, token, "gallery_2", "about-gallery_2", src4);
  const afterMixedPage = await follow(auth.jar, await req(auth.jar, editUrl), BB);
  const afterMixed = extract(afterMixedPage.body);
  result.afterMixedEdits = {
    galleryCount: afterMixed.gallery.length,
    lifeHasLatest: Boolean(id3) && Boolean(afterMixed.life) && afterMixed.life.includes(id3),
    galleryHasSlot2: Boolean(id4) && afterMixed.gallery.some((u) => u.includes(id4)),
    lifeNotInGallery: !afterMixed.gallery.some((u) => u.includes(id3)),
    slot2NotInLife: !(afterMixed.life && afterMixed.life.includes(id4)),
    visitPreserved: Boolean(id2) && Boolean(afterMixed.visit) && afterMixed.visit.includes(id2),
  };

  // Publish + public
  token = csrf(afterMixedPage.body) || token;
  const published = await publishWebsite(auth.jar, token);
  result.publish = {
    status: published.status,
    ok: published.status === 200 || published.status === 303,
  };
  await sleep(1000);
  const publicPage = await follow(new Jar(), await req(new Jar(), `${BB}/c/${ORG}/about`), BB);
  const pub = extract(publicPage.body);
  result.publicRender = {
    galleryCount: pub.gallery.length,
    lifeHasLatest: Boolean(id3) && Boolean(pub.life) && pub.life.includes(id3),
    galleryHasSlot2: Boolean(id4) && pub.gallery.some((u) => u.includes(id4)),
    lifeNotInGallery: !pub.gallery.some((u) => u.includes(id3)),
    visitHasNew: Boolean(id2) && Boolean(pub.visit) && pub.visit.includes(id2),
  };

  const relogin = await login();
  const again = await follow(relogin.jar, await req(relogin.jar, editUrl), BB);
  const againSnap = extract(again.body);
  result.relogin = {
    galleryCount: againSnap.gallery.length,
    lifeHasLatest: Boolean(id3) && Boolean(againSnap.life) && againSnap.life.includes(id3),
    galleryUncorrupted:
      againSnap.gallery.length === 3 && !againSnap.gallery.some((u) => u.includes(id3)),
  };

  result.status =
    result.afterLifeTogether.saveOk &&
    result.afterLifeTogether.galleryCount === 3 &&
    result.afterLifeTogether.galleryUnchanged &&
    result.afterLifeTogether.lifeHasNew &&
    !result.afterLifeTogether.galleryHasNew &&
    result.afterVisit.saveOk &&
    result.afterVisit.galleryCount === 3 &&
    result.afterVisit.galleryStillOriginal &&
    result.afterVisit.lifeStillNew &&
    result.afterVisit.visitHasNew &&
    result.afterVisit.lifeNotInGallery &&
    result.afterVisit.visitNotInGallery &&
    result.afterMixedEdits.galleryCount === 3 &&
    result.afterMixedEdits.lifeHasLatest &&
    result.afterMixedEdits.galleryHasSlot2 &&
    result.afterMixedEdits.lifeNotInGallery &&
    result.afterMixedEdits.slot2NotInLife &&
    result.afterMixedEdits.visitPreserved &&
    result.publish.ok &&
    result.publicRender.galleryCount === 3 &&
    result.publicRender.lifeHasLatest &&
    result.publicRender.galleryHasSlot2 &&
    result.publicRender.lifeNotInGallery &&
    result.publicRender.visitHasNew &&
    result.relogin.galleryCount === 3 &&
    result.relogin.lifeHasLatest &&
    result.relogin.galleryUncorrupted &&
    result.productionUntouched.ok
      ? "PASS"
      : "BLOCKED";

  if (result.status !== "PASS") {
    result.blockReason = [
      !result.afterLifeTogether.galleryUnchanged && "life_edit_changed_gallery",
      result.afterLifeTogether.galleryHasNew && "life_image_appended_to_gallery",
      result.afterLifeTogether.galleryCount !== 3 && "gallery_count_not_three_after_life",
      !result.afterLifeTogether.lifeHasNew && "life_image_not_updated",
      result.afterVisit.galleryCount !== 3 && "gallery_count_after_visit",
      !result.afterVisit.galleryStillOriginal && "visit_edit_changed_gallery",
      !result.afterVisit.visitHasNew && "visit_image_not_updated",
      result.afterMixedEdits.galleryCount !== 3 && "gallery_count_after_mixed",
      !result.afterMixedEdits.lifeNotInGallery && "life_leaked_into_gallery",
      !result.publish.ok && "publish_failed",
      result.publicRender.galleryCount !== 3 && "public_gallery_count",
      !result.relogin.galleryUncorrupted && "relogin_gallery_corrupted",
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
