"use strict";

/**
 * V2 Bug 22 — Shared media type conversion hosted smoke (Neuniversity V8 only).
 * Flow: seed YouTube on Contact hero → convert to photograph → publish → public render.
 * Also checks Home hero video payload wiring and production untouched.
 */

const fs = require("fs");
const https = require("https");
const { URL } = require("url");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const CREDS_PATH = path.join(ROOT, ".env.v8-qa-tenants.local");
const BB = process.env.V2_BB_HOSTED_BASE || "https://blessboard.neuniversity.org";
const AC = process.env.V2_AC_HOSTED_BASE || "https://activeclinic.neuniversity.org";
const V7_BB = "https://blessboard.pronline.org";
const EXPECTED_SHA_PREFIX =
  process.env.V2_SHARED_MEDIA_CONV_EXPECTED_SHA || "PLACEHOLDER";
const OUT =
  process.env.V2_SHARED_MEDIA_CONV_OUT ||
  "/tmp/v2-shared-media-type-conversion-hosted.json";
const YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

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
  const m =
    String(html || "").match(/data-bb-csrf="([^"]+)"/) ||
    String(html || "").match(/name=["']_csrf["'][^>]*value=["']([^"']+)/i);
  return m ? m[1] : "";
}

function req(jar, url, opt = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    let body = null;
    const headers = {
      "User-Agent": "V2SharedMediaConvQA",
      Cookie: jar.header(),
      Accept: opt.accept || "text/html",
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
        const c = [];
        res.on("data", (d) => c.push(d));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            location: res.headers.location || "",
            body: Buffer.concat(c).toString("utf8"),
          })
        );
      }
    );
    r.on("error", reject);
    if (body) r.write(body);
    r.end();
  });
}

async function follow(jar, res, base, n = 0) {
  if (n > 12) return res;
  if (res.status >= 300 && res.status < 400 && res.location) {
    const next = res.location.startsWith("http") ? res.location : base + res.location;
    return follow(jar, await req(jar, next), base, n + 1);
  }
  return res;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function heroImg(html) {
  return (String(html || "").match(/bb-tp-page-hero__img[^>]*src="([^"]+)"/) || [])[1] || null;
}

function homeHeroImg(html) {
  return (
    (String(html || "").match(/bb-tp-hero__img[^>]*src="([^"]+)"/) || [])[1] ||
    (String(html || "").match(/class="[^"]*bb-tp-hero__img[^"]*"[^>]*src="([^"]+)"/) || [])[1] ||
    null
  );
}

async function waitForDeploy(prefix) {
  let last = null;
  for (let i = 0; i < 40; i += 1) {
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
      platformLine: body.platformLine || null,
      environment: body.environment || null,
    };
    if (hz.status === 200 && String(body.gitSha || "").startsWith(prefix)) {
      return { ok: true, hosted: last };
    }
    await sleep(15000);
  }
  return { ok: false, hosted: last, blockReason: "deploy_sha_timeout" };
}

async function uploadPng(jar, token, referer, nameSuffix) {
  const boundary = `----C22${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const uniquePng = Buffer.concat([
    PNG.slice(0, PNG.length - 8),
    Buffer.from([
      (Date.now() >> 0) & 255,
      (Date.now() >> 8) & 255,
      Math.floor(Math.random() * 255),
      0,
      0,
      0,
      0,
      0,
    ]),
  ]);
  const pre = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="_csrf"\r\n\r\n${token}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="conv-${nameSuffix}.png"\r\nContent-Type: image/png\r\n\r\n`
  );
  const post = Buffer.from(`\r\n--${boundary}--\r\n`);
  const up = await req(jar, `${BB}/c/${ORG}/website/media`, {
    method: "POST",
    accept: "application/json",
    headers: { "X-CSRF-Token": token, Referer: referer },
    multipart: { boundary, body: Buffer.concat([pre, uniquePng, post]) },
  });
  let uj = {};
  try {
    uj = JSON.parse(up.body || "{}");
  } catch (_e) {
    uj = {};
  }
  const media = uj.media || {};
  return {
    status: up.status,
    ok: up.status === 200 && uj.ok === true && Boolean(media.publicSrc),
    mediaId: media.id || null,
    publicSrc: media.publicSrc || null,
    storageProvider: media.storageProvider || null,
  };
}

async function main() {
  const result = {
    status: "BLOCKED",
    expectedShaPrefix: EXPECTED_SHA_PREFIX,
    organizationKey: ORG,
    startedAt: new Date().toISOString(),
  };

  if (EXPECTED_SHA_PREFIX === "PLACEHOLDER") {
    result.blockReason = "set_V2_SHARED_MEDIA_CONV_EXPECTED_SHA";
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
    platformLine: prodBody.platformLine || null,
  };

  const acHz = await req(new Jar(), `${AC}/healthz`, { accept: "application/json" });
  let acBody = {};
  try {
    acBody = JSON.parse(acHz.body || "{}");
  } catch (_e) {
    acBody = {};
  }
  result.activeClinicHosted = {
    status: acHz.status,
    gitSha: acBody.gitSha || null,
    sameShaFamily: String(acBody.gitSha || "").startsWith(EXPECTED_SHA_PREFIX),
  };

  const jar = new Jar();
  const loginGet = await req(jar, `${BB}/login`);
  await follow(
    jar,
    await req(jar, `${BB}/login`, {
      method: "POST",
      form: {
        _csrf: csrf(loginGet.body),
        email: creds.V8_QA_BB_HQ_EMAIL,
        password: creds.V8_QA_BB_PASSWORD,
      },
      headers: { Referer: `${BB}/login` },
    }),
    BB
  );

  const contactEdit = `${BB}/c/${ORG}/contact?website_edit=1&website_mode=draft`;
  const homeEdit = `${BB}/c/${ORG}/?website_edit=1&website_mode=draft`;
  const before = await follow(jar, await req(jar, contactEdit), BB);
  let token = csrf(before.body);

  const posterUpload = await uploadPng(jar, token, contactEdit, "poster");
  result.posterUpload = posterUpload;

  const videoDraft = await req(jar, `${BB}/hq/content/api/structured-draft`, {
    method: "POST",
    accept: "application/json",
    headers: { "X-CSRF-Token": token, Referer: contactEdit },
    json: {
      draftKind: "video",
      pageKey: "contact",
      sectionKey: "hero",
      entityKey: "contact-hero-video",
      op: "upsert",
      payload: {
        videoUrl: YT,
        title: `QA video ${Date.now().toString(36)}`,
        thumbnailUrl: posterUpload.publicSrc,
      },
    },
  });
  let videoJson = {};
  try {
    videoJson = JSON.parse(videoDraft.body || "{}");
  } catch (_e) {
    videoJson = {};
  }
  result.videoDraft = {
    status: videoDraft.status,
    ok: videoDraft.status === 200 && videoJson.ok === true,
    draftId: videoJson.draftId || null,
  };

  const afterVideo = await follow(jar, await req(jar, contactEdit), BB);
  token = csrf(afterVideo.body) || token;
  const afterVideoImg = heroImg(afterVideo.body);
  result.videoDraftPreview = {
    ok: Boolean(
      afterVideoImg &&
        posterUpload.mediaId &&
        afterVideoImg.includes(String(posterUpload.mediaId)) &&
        !/youtube\.com|youtu\.be/i.test(afterVideoImg)
    ),
    imageSrc: afterVideoImg,
    hasYoutubePayload: afterVideo.body.includes(YT) || afterVideo.body.includes("youtu.be"),
  };

  const pubVideo = await req(jar, `${BB}/c/${ORG}/website/publish`, {
    method: "POST",
    accept: "application/json",
    headers: { "X-CSRF-Token": token, Referer: contactEdit },
    json: {},
  });
  let pubVideoJson = {};
  try {
    pubVideoJson = JSON.parse(pubVideo.body || "{}");
  } catch (_e) {
    pubVideoJson = {};
  }
  result.publishVideo = {
    status: pubVideo.status,
    ok: pubVideo.status === 200 && pubVideoJson.ok === true,
  };

  const photoUpload = await uploadPng(jar, token, contactEdit, "photo");
  result.photoUpload = photoUpload;

  const imageDraft = await req(jar, `${BB}/hq/content/api/structured-draft`, {
    method: "POST",
    accept: "application/json",
    headers: { "X-CSRF-Token": token, Referer: contactEdit },
    json: {
      draftKind: "image",
      pageKey: "contact",
      sectionKey: "hero",
      entityKey: "contact-hero-image",
      op: "upsert",
      payload: {
        imageUrl: photoUpload.publicSrc,
        altText: `Contact photo ${Date.now().toString(36)}`,
        focal: "center",
        fit: "cover",
      },
    },
  });
  let imageJson = {};
  try {
    imageJson = JSON.parse(imageDraft.body || "{}");
  } catch (_e) {
    imageJson = {};
  }
  result.imageDraft = {
    status: imageDraft.status,
    ok: imageDraft.status === 200 && imageJson.ok === true,
    draftId: imageJson.draftId || null,
  };

  const afterImage = await follow(jar, await req(jar, contactEdit), BB);
  token = csrf(afterImage.body) || token;
  const afterImageSrc = heroImg(afterImage.body);
  result.imageDraftPreview = {
    ok: Boolean(
      afterImageSrc &&
        photoUpload.mediaId &&
        afterImageSrc.includes(String(photoUpload.mediaId)) &&
        !/youtube\.com|youtu\.be/i.test(afterImageSrc)
    ),
    imageSrc: afterImageSrc,
  };

  const pubImage = await req(jar, `${BB}/c/${ORG}/website/publish`, {
    method: "POST",
    accept: "application/json",
    headers: { "X-CSRF-Token": token, Referer: contactEdit },
    json: {},
  });
  let pubImageJson = {};
  try {
    pubImageJson = JSON.parse(pubImage.body || "{}");
  } catch (_e) {
    pubImageJson = {};
  }
  result.publishImage = {
    status: pubImage.status,
    ok: pubImage.status === 200 && pubImageJson.ok === true,
  };

  const publicPage = await follow(new Jar(), await req(new Jar(), `${BB}/c/${ORG}/contact`), BB);
  const publicImg = heroImg(publicPage.body);
  result.publicRenderAfterImage = {
    status: publicPage.status,
    ok: Boolean(
      publicImg &&
        photoUpload.mediaId &&
        publicImg.includes(String(photoUpload.mediaId)) &&
        !/youtube\.com|youtu\.be/i.test(publicImg)
    ),
    imageSrc: publicImg,
  };

  // Cross-section isolation: About Life Together must not absorb Contact hero image.
  const aboutPublic = await follow(new Jar(), await req(new Jar(), `${BB}/c/${ORG}/about`), BB);
  result.crossSectionIsolation = {
    ok: !(
      photoUpload.mediaId &&
      aboutPublic.body.includes(String(photoUpload.mediaId)) &&
      /life.?together/i.test(aboutPublic.body)
    ),
    note: "Contact hero media id must not appear as About Life Together feature",
  };

  const homePage = await follow(jar, await req(jar, homeEdit), BB);
  result.homeVideoControl = {
    ok:
      homePage.body.includes("home-hero-video") &&
      homePage.body.includes("Edit hero YouTube video"),
    hasLayoutVideoBinding: /layoutMetadata\.videoUrl/.test(
      fs.readFileSync(
        path.join(ROOT, "views/blessboard/v5/public/home.ejs"),
        "utf8"
      )
    ),
  };

  let cdnOk = false;
  if (photoUpload.publicSrc) {
    const cdn = await req(new Jar(), photoUpload.publicSrc, { accept: "*/*" });
    cdnOk = cdn.status === 200;
  }
  result.cdn = { ok: cdnOk, url: photoUpload.publicSrc || null };

  const editorJs = await req(
    new Jar(),
    `${BB}/blessboard/v5/website-structured-edit.js?v=v2-bb-media-conv-1`,
    { accept: "*/*" }
  );
  result.editorAsset = {
    status: editorJs.status,
    ok:
      editorJs.status === 200 &&
      /data-bb-media-mode="image"/.test(editorJs.body) &&
      /data-bb-media-mode="youtube"/.test(editorJs.body),
  };

  const failures = [];
  if (!result.posterUpload.ok) failures.push("poster_upload");
  if (!result.videoDraft.ok) failures.push("video_draft");
  if (!result.videoDraftPreview.ok) failures.push("video_draft_preview");
  if (!result.publishVideo.ok) failures.push("publish_video");
  if (!result.photoUpload.ok) failures.push("photo_upload");
  if (!result.imageDraft.ok) failures.push("image_draft");
  if (!result.imageDraftPreview.ok) failures.push("image_draft_preview");
  if (!result.publishImage.ok) failures.push("publish_image");
  if (!result.publicRenderAfterImage.ok) failures.push("public_render");
  if (!result.crossSectionIsolation.ok) failures.push("cross_section");
  if (!result.cdn.ok) failures.push("cdn");
  if (!result.editorAsset.ok) failures.push("editor_asset");
  if (!result.productionUntouched.ok) failures.push("production");
  if (!result.activeClinicHosted.sameShaFamily) failures.push("ac_sha");

  result.status = failures.length ? "PARTIAL" : "PASS";
  result.blockReason = failures.length ? failures.join(",") : null;
  result.finishedAt = new Date().toISOString();
  result.hostedUrl = contactEdit;
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(failures.length ? 2 : 0);
}

main().catch((err) => {
  const result = {
    status: "BLOCKED",
    error: String(err && err.stack ? err.stack : err),
    finishedAt: new Date().toISOString(),
  };
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.error(JSON.stringify(result, null, 2));
  process.exit(2);
});
