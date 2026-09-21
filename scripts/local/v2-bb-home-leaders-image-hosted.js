"use strict";

/**
 * V2.0 BUG 14 — BlessBoard homepage Pastors and Leaders image persistence hosted QA.
 * Disposable V8 QA tenant only. Does not write to demo-church-22 or production.
 */

const fs = require("fs");
const https = require("https");
const { URL } = require("url");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const CREDS_PATH = path.join(ROOT, ".env.v8-qa-tenants.local");
const BB = process.env.V2_BB_HOSTED_BASE || "https://blessboard.neuniversity.org";
const V7_BB = "https://blessboard.pronline.org";
const EXPECTED_SHA_PREFIX = process.env.V2_BB_HOME_LEADERS_IMAGE_EXPECTED_SHA || "PLACEHOLDER";
const OUT =
  process.env.V2_BB_HOME_LEADERS_IMAGE_OUT || "/tmp/v2-bb-home-leaders-image-hosted.json";

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
      "User-Agent": "Mozilla/5.0 V2HomeLeadersImageQA",
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
            headers: res.headers,
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

function extractLeaderImageTriggers(html) {
  const sectionMatch = html.match(
    /data-bb-home-leader-cards="1"([\s\S]*?)(?:<\/section>|<section\b|$)/
  );
  const slice = sectionMatch ? sectionMatch[1] : html;
  const triggers = [];
  const re =
    /data-bb-structured-open="1"[\s\S]*?data-bb-kind="leader"[\s\S]*?data-bb-entity="([^"]+)"[\s\S]*?aria-label="Edit image"/gi;
  let m;
  while ((m = re.exec(slice))) {
    triggers.push(m[1]);
  }
  if (!triggers.length) {
    const re2 =
      /aria-label="Edit image"[\s\S]{0,500}?data-bb-entity="([^"]+)"|data-bb-entity="([^"]+)"[\s\S]{0,500}?aria-label="Edit image"/gi;
    while ((m = re2.exec(slice))) {
      const key = m[1] || m[2];
      if (key && /leader/i.test(key)) triggers.push(key);
    }
  }
  return [...new Set(triggers)];
}

function extractOriginalImages(html) {
  const sectionMatch = html.match(
    /data-bb-home-leader-cards="1"([\s\S]*?)(?:<\/section>|<section\b|$)/
  );
  const slice = sectionMatch ? sectionMatch[1] : html;
  const out = [];
  const cardRe = /data-bb-leader-id="([^"]+)"[\s\S]*?(?:data-bb-leader-image="1"[^>]*src="([^"]*)"|src="([^"]*)"[^>]*data-bb-leader-image="1")/gi;
  let m;
  while ((m = cardRe.exec(slice))) {
    out.push({ entityKey: m[1], src: m[2] || m[3] || "" });
  }
  return out;
}

function extractUploadUrl(html) {
  const m = String(html || "").match(/data-bb-media-upload="([^"]+)"/);
  return m ? m[1] : "";
}

async function uploadPng(jar, uploadUrl, token, filename) {
  const boundary = `----V2LeadImg${Date.now()}`;
  const pre = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="_csrf"\r\n\r\n${token}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`,
    "utf8"
  );
  const post = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  const body = Buffer.concat([pre, PNG, post]);
  const url = uploadUrl.startsWith("http") ? uploadUrl : `${BB}${uploadUrl}`;
  const res = await req(jar, url, {
    method: "POST",
    accept: "application/json",
    headers: {
      "X-CSRF-Token": token,
      Referer: `${BB}/c/${ORG}/?website_edit=1&website_mode=draft`,
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

async function listMedia(jar, token, listUrl) {
  const url = listUrl.startsWith("http") ? listUrl : `${BB}${listUrl}`;
  const res = await req(jar, url, {
    accept: "application/json",
    headers: {
      "X-CSRF-Token": token,
      Referer: `${BB}/c/${ORG}/?website_edit=1&website_mode=draft`,
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

async function postLeaderDraft(jar, token, entityKey, payload) {
  const res = await req(jar, `${BB}/hq/content/api/structured-draft`, {
    method: "POST",
    accept: "application/json",
    headers: {
      "X-CSRF-Token": token,
      Referer: `${BB}/c/${ORG}/?website_edit=1&website_mode=draft`,
    },
    json: {
      _csrf: token,
      action: "save",
      draftKind: "leader",
      pageKey: "leadership",
      sectionKey: null,
      entityKey,
      op: "upsert",
      payload,
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
    headers: { Referer: `${BB}/c/${ORG}/?website_edit=1&website_mode=draft` },
  });
  return follow(jar, res, BB);
}

function leaderDisplayName(entityKey, i) {
  if (entityKey === "demo-leader-senior") return "Senior Pastor";
  if (entityKey === "demo-leader-associate") return "Associate Pastor";
  if (entityKey === "demo-leader-ministries") return "Ministries Director";
  return `Leader ${i + 1}`;
}

async function main() {
  const result = {
    status: "BLOCKED",
    expectedShaPrefix: EXPECTED_SHA_PREFIX,
    organizationKey: ORG,
    startedAt: new Date().toISOString(),
  };

  if (EXPECTED_SHA_PREFIX === "PLACEHOLDER") {
    result.blockReason = "set_V2_BB_HOME_LEADERS_IMAGE_EXPECTED_SHA";
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

  const editUrl = `${BB}/c/${ORG}/?website_edit=1&website_mode=draft`;
  const editPage = await follow(auth.jar, await req(auth.jar, editUrl), BB);
  const originals = extractOriginalImages(editPage.body);
  const triggers = extractLeaderImageTriggers(editPage.body);
  const uploadUrl = extractUploadUrl(editPage.body);
  const listUrlMatch = String(editPage.body || "").match(/data-bb-media-list="([^"]+)"/);
  const listUrl = listUrlMatch ? listUrlMatch[1] : "";

  result.originalImages = originals.map((o) => ({
    entityKey: o.entityKey,
    srcPrefix: String(o.src).slice(0, 96),
  }));
  result.editChrome = {
    status: editPage.status,
    hasPastorsSection: /Pastors and Leaders|data-bb-home-leader-cards="1"/i.test(editPage.body),
    editImageCount: triggers.length,
    entityKeys: triggers,
    distinctKeys: new Set(triggers).size,
    structuredBust: /website-structured-edit\.js\?v=v2-bb-lead-img-1/.test(editPage.body),
    cssBust: /tenant-public\.css\?v=67/.test(editPage.body),
    uploadUrl: uploadUrl || null,
    listUrl: listUrl || null,
  };

  if (triggers.length < 3 || new Set(triggers).size < 3) {
    result.blockReason = "missing_independent_edit_image_triggers";
    fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    process.exit(2);
  }

  let token = csrf(editPage.body);
  const stamp = Date.now().toString(36);
  const uploads = [];
  const saves = [];
  const targetKeys = triggers.slice(0, 3);
  const siblingNamesBefore = {};

  for (const key of targetKeys) {
    const nameMatch = editPage.body.match(
      new RegExp(`data-bb-leader-id="${key}"[\\s\\S]*?bb-tp-leader-card__name[^>]*>([^<]+)`, "i")
    );
    siblingNamesBefore[key] = nameMatch ? nameMatch[1].trim() : "";
  }

  for (let i = 0; i < targetKeys.length; i += 1) {
    const entityKey = targetKeys[i];
    const page = await follow(auth.jar, await req(auth.jar, editUrl), BB);
    token = csrf(page.body) || token;
    const upUrl = extractUploadUrl(page.body) || uploadUrl;
    const uploaded = await uploadPng(auth.jar, upUrl, token, `lead-${stamp}-${i}.png`);
    const media = uploaded.json.media || uploaded.json.asset || {};
    const src =
      media.publicSrc ||
      media.deliveryPath ||
      media.previewUrl ||
      media.src ||
      uploaded.json.deliveryPath ||
      "";
    const mediaId = media.id || uploaded.json.mediaId || "";
    uploads.push({
      entityKey,
      status: uploaded.status,
      ok: uploaded.status === 200 && Boolean(src) && Boolean(mediaId),
      mediaId,
      src,
      srcPrefix: String(src).slice(0, 96),
      topLevelDeliveryPath: uploaded.json.deliveryPath || null,
      nestedPublicSrc: Boolean(media.publicSrc),
    });
    if (!src) {
      result.blockReason = `upload_failed_${entityKey}`;
      result.uploads = uploads;
      fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result, null, 2));
      process.exit(2);
    }
    const save = await postLeaderDraft(auth.jar, token, entityKey, {
      displayName: leaderDisplayName(entityKey, i),
      roleTitle: `V2 BUG14 role ${stamp} ${i}`,
      biography: `V2 BUG14 independent pastor image ${stamp} ${i}`,
      imageUrl: src,
      sortOrder: (i + 1) * 10,
      seniorLeader: i === 0,
      visible: true,
      contactPublic: false,
    });
    saves.push({
      entityKey,
      status: save.status,
      ok: save.status === 200 && save.json.ok === true,
      published: save.json.published,
      mediaId,
      mediaMarker: mediaId || src.slice(-24),
    });
  }
  result.uploads = uploads.map((u) => ({
    entityKey: u.entityKey,
    status: u.status,
    ok: u.ok,
    mediaId: u.mediaId,
    srcPrefix: u.srcPrefix,
    topLevelDeliveryPath: u.topLevelDeliveryPath,
    nestedPublicSrc: u.nestedPublicSrc,
  }));
  result.saves = saves;

  // Content Library list returns media[] with publicSrc (not assets/deliveryPath).
  if (listUrl) {
    const listed = await listMedia(auth.jar, token, listUrl);
    const items = listed.json.media || listed.json.assets || [];
    const matched = items.filter((item) =>
      uploads.some((u) => u.mediaId && item && item.id === u.mediaId)
    );
    result.contentLibrary = {
      status: listed.status,
      ok: listed.status === 200 && listed.json.ok === true,
      usesMediaArray: Array.isArray(listed.json.media),
      matchedUploadCount: matched.length,
      sampleSrc: matched[0]
        ? String(matched[0].publicSrc || matched[0].previewUrl || matched[0].deliveryPath || "").slice(
            0,
            96
          )
        : null,
    };
  } else {
    result.contentLibrary = { ok: false, reason: "missing_list_url" };
  }

  const draftPage = await follow(auth.jar, await req(auth.jar, editUrl), BB);
  const draftMarkers = saves.map((s) => ({
    entityKey: s.entityKey,
    present: Boolean(s.mediaMarker) && draftPage.body.includes(s.mediaMarker),
  }));
  result.draftPreview = {
    status: draftPage.status,
    markers: draftMarkers,
    ok: draftMarkers.every((m) => m.present),
  };

  // Bug 06: other pastors still present with distinct media ids after independent edits.
  const namesAfter = {};
  for (const key of targetKeys) {
    const nameMatch = draftPage.body.match(
      new RegExp(`data-bb-leader-id="${key}"[\\s\\S]*?bb-tp-leader-card__name[^>]*>([^<]+)`, "i")
    );
    namesAfter[key] = nameMatch ? nameMatch[1].trim() : "";
  }
  result.siblingPreservation = {
    ok:
      targetKeys.every((k) => Boolean(namesAfter[k])) &&
      new Set(uploads.map((u) => u.mediaId).filter(Boolean)).size === targetKeys.length,
    namesAfter,
    uniqueMediaIds: new Set(uploads.map((u) => u.mediaId).filter(Boolean)).size,
  };

  const leadershipPage = await follow(
    auth.jar,
    await req(auth.jar, `${BB}/c/${ORG}/leadership?website_edit=1&website_mode=draft`),
    BB
  );
  result.leadershipPageParity = {
    status: leadershipPage.status,
    ok: saves.every((s) => leadershipPage.body.includes(s.mediaMarker)),
  };

  const pubPage = await follow(auth.jar, await req(auth.jar, editUrl), BB);
  token = csrf(pubPage.body) || token;
  const published = await publishWebsite(auth.jar, token);
  result.publish = {
    status: published.status,
    ok: published.status === 200 || published.status === 303,
    url: published.url,
  };

  await sleep(1000);
  const publicPage = await follow(new Jar(), await req(new Jar(), `${BB}/c/${ORG}/`), BB);
  const publicMarkers = saves.map((s) => ({
    entityKey: s.entityKey,
    present: Boolean(s.mediaMarker) && publicPage.body.includes(s.mediaMarker),
  }));
  result.publicRender = {
    status: publicPage.status,
    markers: publicMarkers,
    ok: publicMarkers.every((m) => m.present),
  };

  const relogin = await login();
  const again = await follow(relogin.jar, await req(relogin.jar, editUrl), BB);
  result.relogin = {
    ok: saves.every((s) => again.body.includes(s.mediaMarker)),
  };

  // CDN: resolve one uploaded publicSrc (absolute URL).
  let cdnOk = false;
  const sampleSrc = uploads[0] && uploads[0].src;
  if (sampleSrc) {
    const abs = sampleSrc.startsWith("http") ? sampleSrc : `${BB}${sampleSrc}`;
    const cdn = await req(new Jar(), abs, { accept: "*/*" });
    cdnOk = cdn.status === 200 && Buffer.byteLength(cdn.body || "") > 0;
    result.cdnPersistence = {
      status: cdn.status,
      ok: cdnOk,
      srcPrefix: String(sampleSrc).slice(0, 96),
    };
  } else {
    result.cdnPersistence = { ok: false };
  }

  result.status =
    result.editChrome.editImageCount >= 3 &&
    result.editChrome.distinctKeys >= 3 &&
    result.editChrome.structuredBust &&
    uploads.every((u) => u.ok) &&
    saves.every((s) => s.ok) &&
    result.draftPreview.ok &&
    result.siblingPreservation.ok &&
    result.leadershipPageParity.ok &&
    result.contentLibrary.ok &&
    result.publish.ok &&
    result.publicRender.ok &&
    result.relogin.ok &&
    result.cdnPersistence.ok &&
    result.productionUntouched.ok
      ? "PASS"
      : "BLOCKED";

  if (result.status !== "PASS") {
    result.blockReason = [
      result.editChrome.editImageCount < 3 && "missing_edit_image_triggers",
      result.editChrome.distinctKeys < 3 && "non_independent_entity_keys",
      !result.editChrome.structuredBust && "missing_js_bust",
      uploads.some((u) => !u.ok) && "upload_failed",
      saves.some((s) => !s.ok) && "draft_save_failed",
      !result.draftPreview.ok && "draft_preview_missing_images",
      !result.siblingPreservation.ok && "sibling_preservation_failed",
      !result.leadershipPageParity.ok && "leadership_page_missing_images",
      !result.contentLibrary.ok && "content_library_failed",
      !result.publish.ok && "publish_failed",
      !result.publicRender.ok && "public_missing_images",
      !result.relogin.ok && "relogin_lost_images",
      !result.cdnPersistence.ok && "cdn_fetch_failed",
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
