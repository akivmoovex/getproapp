"use strict";

/**
 * V2 Bug 21 — Contact hero image replacement hosted smoke (Neuniversity V8 only).
 */

const fs = require("fs");
const https = require("https");
const { URL } = require("url");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const CREDS_PATH = path.join(ROOT, ".env.v8-qa-tenants.local");
const BB = process.env.V2_BB_HOSTED_BASE || "https://blessboard.neuniversity.org";
const V7_BB = "https://blessboard.pronline.org";
const EXPECTED_SHA_PREFIX = process.env.V2_BB_CONTACT_IMAGE_EXPECTED_SHA || "PLACEHOLDER";
const OUT =
  process.env.V2_BB_CONTACT_IMAGE_OUT || "/tmp/v2-bb-contact-image-hosted.json";

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
      "User-Agent": "V2BbContactImageQA",
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
    last = { status: hz.status, gitSha: body.gitSha || null, platformLine: body.platformLine || null };
    if (hz.status === 200 && String(body.gitSha || "").startsWith(prefix)) {
      return { ok: true, hosted: last };
    }
    await sleep(15000);
  }
  return { ok: false, hosted: last, blockReason: "deploy_sha_timeout" };
}

async function main() {
  const result = {
    status: "BLOCKED",
    expectedShaPrefix: EXPECTED_SHA_PREFIX,
    organizationKey: ORG,
    startedAt: new Date().toISOString(),
  };

  if (EXPECTED_SHA_PREFIX === "PLACEHOLDER") {
    result.blockReason = "set_V2_BB_CONTACT_IMAGE_EXPECTED_SHA";
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
  const before = await follow(jar, await req(jar, contactEdit), BB);
  const token = csrf(before.body);
  const beforeImg = (before.body.match(/bb-tp-page-hero__img[^>]*src="([^"]+)"/) || [])[1] || null;
  result.originalMediaRef = beforeImg;

  const boundary = `----C21${Date.now()}`;
  const uniquePng = Buffer.concat([PNG.slice(0, PNG.length - 8), Buffer.from([3, 3, 3, 0, 0, 0, 0, 0])]);
  const pre = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="_csrf"\r\n\r\n${token}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="contact-hero.png"\r\nContent-Type: image/png\r\n\r\n`
  );
  const post = Buffer.from(`\r\n--${boundary}--\r\n`);
  const up = await req(jar, `${BB}/c/${ORG}/website/media`, {
    method: "POST",
    accept: "application/json",
    headers: { "X-CSRF-Token": token, Referer: contactEdit },
    multipart: { boundary, body: Buffer.concat([pre, uniquePng, post]) },
  });
  let uj = {};
  try {
    uj = JSON.parse(up.body || "{}");
  } catch (_e) {
    uj = {};
  }
  const media = uj.media || {};
  result.upload = {
    status: up.status,
    ok: up.status === 200 && uj.ok === true && Boolean(media.publicSrc),
    mediaId: media.id || null,
    publicSrc: media.publicSrc || null,
    storageProvider: media.storageProvider || null,
    published: uj.published,
  };

  const draftSave = await req(jar, `${BB}/hq/content/api/structured-draft`, {
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
        imageUrl: media.publicSrc,
        altText: `Contact hero ${Date.now().toString(36)}`,
        focal: "center",
      },
    },
  });
  let draftJson = {};
  try {
    draftJson = JSON.parse(draftSave.body || "{}");
  } catch (_e) {
    draftJson = {};
  }
  result.draftSave = {
    status: draftSave.status,
    ok: draftSave.status === 200 && draftJson.ok === true,
    draftId: draftJson.draftId || null,
  };

  const preview = await follow(jar, await req(jar, contactEdit), BB);
  const previewImg =
    (preview.body.match(/bb-tp-page-hero__img[^>]*src="([^"]+)"/) || [])[1] || null;
  result.draftPreview = {
    ok: Boolean(previewImg && media.publicSrc && previewImg.includes(String(media.id || ""))),
    imageSrc: previewImg,
  };
  result.newMediaRef = previewImg;

  const publish = await req(jar, `${BB}/c/${ORG}/website/publish`, {
    method: "POST",
    accept: "application/json",
    headers: { "X-CSRF-Token": csrf(preview.body) || token, Referer: contactEdit },
    json: {},
  });
  let pubJson = {};
  try {
    pubJson = JSON.parse(publish.body || "{}");
  } catch (_e) {
    pubJson = {};
  }
  result.publish = {
    status: publish.status,
    ok: publish.status === 200 && pubJson.ok === true,
    code: pubJson.code || null,
  };

  const publicPage = await follow(new Jar(), await req(new Jar(), `${BB}/c/${ORG}/contact`), BB);
  const publicImg =
    (publicPage.body.match(/bb-tp-page-hero__img[^>]*src="([^"]+)"/) || [])[1] || null;
  result.publicRender = {
    status: publicPage.status,
    ok: Boolean(publicImg && media.id && publicImg.includes(String(media.id))),
    imageSrc: publicImg,
  };

  let cdnOk = false;
  if (media.publicSrc) {
    const cdn = await req(new Jar(), media.publicSrc, { accept: "*/*" });
    cdnOk = cdn.status === 200;
  }
  result.cdn = { ok: cdnOk, url: media.publicSrc || null };

  const failures = [];
  if (!result.upload.ok) failures.push("upload");
  if (!result.draftSave.ok) failures.push("draft_save");
  if (!result.draftPreview.ok) failures.push("draft_preview");
  if (!result.publish.ok) failures.push("publish");
  if (!result.publicRender.ok) failures.push("public_render");
  if (!result.cdn.ok) failures.push("cdn");
  if (!result.productionUntouched.ok) failures.push("production");

  result.status = failures.length ? "PARTIAL" : "PASS";
  result.blockReason = failures.length ? failures.join(",") : null;
  result.finishedAt = new Date().toISOString();
  result.hostedUrl = contactEdit;
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(failures.length ? 2 : 0);
}

main().catch((err) => {
  fs.writeFileSync(
    OUT,
    JSON.stringify({ status: "BLOCKED", blockReason: "script_exception", error: String(err) }, null, 2)
  );
  console.error(err);
  process.exit(2);
});
