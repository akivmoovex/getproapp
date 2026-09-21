"use strict";

/**
 * V2.0 BUG 17 — BlessBoard ministry leader profile image upload hosted QA.
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
const EXPECTED_SHA_PREFIX =
  process.env.V2_BB_MINISTRY_LEADER_IMAGE_EXPECTED_SHA || "PLACEHOLDER";
const OUT =
  process.env.V2_BB_MINISTRY_LEADER_IMAGE_OUT ||
  "/tmp/v2-bb-ministry-leader-image-hosted.json";

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
      "User-Agent": "Mozilla/5.0 V2MinistryLeaderImageQA",
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
    if (body) r.write(body);
    r.end();
  });
}

async function follow(jar, res, base, n = 0) {
  if (n > 12) return res;
  if (res.status >= 300 && res.status < 400 && res.location) {
    const next = res.location.startsWith("http") ? res.location : base + res.location;
    const hopped = await req(jar, next);
    hopped.url = next;
    return follow(jar, hopped, base, n + 1);
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

function extractLeadersFromAdmin(html) {
  const leaders = [];
  const re =
    /id="update_([a-f0-9]+)_image_media_id"|name="item_id"\s+value="([a-f0-9-]{36})"|data-bb-entity-id="([^"]+)"/gi;
  const ids = new Set();
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1] || m[2] || m[3];
    if (!raw) continue;
    let id = raw;
    if (/^[a-f0-9]{32}$/i.test(raw)) {
      id = `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
    }
    if (/^[a-f0-9-]{36}$/i.test(id)) ids.add(id.toLowerCase());
  }
  // Prefer forms with item_id + image_url
  const formRe =
    /<form\b[^>]*>([\s\S]*?)<\/form>/gi;
  let fm;
  while ((fm = formRe.exec(html))) {
    const body = fm[1];
    if (!/name="item_id"/.test(body) || !/name="image_url"/.test(body)) continue;
    if (!/name="display_name"/.test(body)) continue;
    const id = ((body.match(/name="item_id"[^>]*value="([^"]+)"/i) ||
      body.match(/value="([^"]+)"[^>]*name="item_id"/i) ||
      [])[1] || "").toLowerCase();
    const name = ((body.match(/name="display_name"[^>]*value="([^"]*)"/i) ||
      body.match(/value="([^"]*)"[^>]*name="display_name"/i) ||
      [])[1] || "").trim();
    const role = ((body.match(/name="role_title"[^>]*value="([^"]*)"/i) ||
      body.match(/value="([^"]*)"[^>]*name="role_title"/i) ||
      [])[1] || "").trim();
    const imageUrl = ((body.match(/name="image_url"[^>]*value="([^"]*)"/i) ||
      body.match(/value="([^"]*)"[^>]*name="image_url"/i) ||
      [])[1] || "").trim();
    const expectedUpdatedAt = ((body.match(
      /name="expected_updated_at"[^>]*value="([^"]*)"/i
    ) ||
      body.match(/value="([^"]*)"[^>]*name="expected_updated_at"/i) ||
      [])[1] || "").trim();
    const status = ((body.match(/name="status"[^>]*>[\s\S]*?<option[^>]*selected[^>]*value="([^"]+)"/i) ||
      body.match(/<option[^>]*value="([^"]+)"[^>]*selected/i) ||
      [])[1] || "published").trim();
    if (id) {
      leaders.push({ id, name, role, imageUrl, expectedUpdatedAt, status });
      ids.add(id);
    }
  }
  return leaders;
}

async function uploadPng(jar, uploadUrl, token, filename, pngBuffer) {
  const fileBuf = pngBuffer || PNG;
  const boundary = `----V2LeadImg${Date.now()}`;
  const pre = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="_csrf"\r\n\r\n${token}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`,
    "utf8"
  );
  const post = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  const body = Buffer.concat([pre, fileBuf, post]);
  const url = uploadUrl.startsWith("http") ? uploadUrl : `${BB}${uploadUrl}`;
  const res = await req(jar, url, {
    method: "POST",
    accept: "application/json",
    headers: {
      "X-CSRF-Token": token,
      Referer: `${BB}/hq/content/leadership`,
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

async function postLeaderDraft(jar, token, entityKey, payload) {
  const res = await req(jar, `${BB}/hq/content/api/structured-draft`, {
    method: "POST",
    accept: "application/json",
    headers: {
      "X-CSRF-Token": token,
      Referer: `${BB}/c/${ORG}/leadership?website_edit=1&website_mode=draft`,
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
    headers: { Referer: `${BB}/c/${ORG}/leadership?website_edit=1&website_mode=draft` },
  });
  if (res.status === 303 || res.status === 302) {
    return { status: res.status, location: res.location, okHttp: true };
  }
  const followed = await follow(jar, res, BB);
  return {
    status: followed.status,
    location: followed.location || followed.url || "",
    okHttp: followed.status === 200 || followed.status === 303,
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
    result.blockReason = "set_V2_BB_MINISTRY_LEADER_IMAGE_EXPECTED_SHA";
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

  const adminUrl = `${BB}/hq/content/leadership`;
  const adminPage = await follow(auth.jar, await req(auth.jar, adminUrl), BB);
  const mediaListUrl = `/c/${ORG}/website/media`;
  result.adminChrome = {
    status: adminPage.status,
    hasUploadFromComputer: /Upload from computer/i.test(adminPage.body),
    hasContentLibrary: /Choose from Content Library/i.test(adminPage.body),
    hasSharedMediaField: /data-gp-we-media-field="1"|data-bb-leadership-photo="1"/i.test(
      adminPage.body
    ),
    usesWebsiteMediaUrl: adminPage.body.includes(mediaListUrl),
    avoidsKillSwitchUpload: !/data-upload-url="\/hq\/content\/media\/upload"/i.test(
      adminPage.body
    ),
    hasSharedJs: /website-media-field\.js\?v=v2-media-parity-1/.test(adminPage.body),
  };

  if (
    !result.adminChrome.hasUploadFromComputer ||
    !result.adminChrome.hasContentLibrary ||
    !result.adminChrome.hasSharedMediaField ||
    !result.adminChrome.usesWebsiteMediaUrl
  ) {
    result.blockReason = "admin_missing_shared_upload_controls";
    fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    process.exit(2);
  }

  const leaders = extractLeadersFromAdmin(adminPage.body);
  result.leadersFound = leaders.map((l) => ({
    id: l.id,
    name: l.name,
    imagePrefix: String(l.imageUrl || "").slice(0, 80),
  }));

  if (leaders.length < 2) {
    result.blockReason = "need_at_least_two_leaders_for_isolation";
    fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    process.exit(2);
  }

  const target = leaders[0];
  const sibling = leaders[1];
  const siblingImageBefore = sibling.imageUrl || "";

  let token = csrf(adminPage.body);
  const stamp = Date.now().toString(36);
  const uniquePng = Buffer.concat([
    PNG.slice(0, PNG.length - 8),
    Buffer.from([7, stamp.charCodeAt(0) || 1, stamp.charCodeAt(1) || 2, 0, 0, 0, 0, 0]),
  ]);
  const uploaded = await uploadPng(
    auth.jar,
    mediaListUrl,
    token,
    `ministry-leader-${stamp}.png`,
    uniquePng
  );
  const media = uploaded.json.media || {};
  const src = media.publicSrc || media.previewUrl || media.src || "";
  const mediaId = media.id || "";
  result.upload = {
    status: uploaded.status,
    ok: uploaded.status === 200 && uploaded.json.ok === true && Boolean(src) && Boolean(mediaId),
    mediaId,
    srcPrefix: String(src).slice(0, 100),
    published: uploaded.json.published,
    storageProvider: media.storageProvider || null,
  };
  if (!result.upload.ok) {
    result.blockReason = "shared_media_upload_failed";
    fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    process.exit(2);
  }

  // Save draft associated to the stable leader member id only.
  const publicEdit = await follow(
    auth.jar,
    await req(auth.jar, `${BB}/c/${ORG}/leadership?website_edit=1&website_mode=draft`),
    BB
  );
  token = csrf(publicEdit.body) || token;
  const save = await postLeaderDraft(auth.jar, token, target.id, {
    displayName: target.name || "Ministry Leader",
    roleTitle: target.role || "Ministry Leader",
    biography: "BUG17 QA biography",
    imageUrl: src,
    visible: true,
    sortOrder: 10,
  });
  result.draftSave = {
    status: save.status,
    ok: save.status === 200 && save.json.ok === true,
    published: save.json.published,
    entityKey: target.id,
    draftId: save.json.draftId || null,
  };
  if (!result.draftSave.ok) {
    result.blockReason = "leader_draft_save_failed";
    fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    process.exit(2);
  }

  // Isolation: sibling leader image must remain unchanged on admin reload before publish.
  const adminAfter = await follow(auth.jar, await req(auth.jar, adminUrl), BB);
  const leadersAfter = extractLeadersFromAdmin(adminAfter.body);
  const siblingAfter = leadersAfter.find((l) => l.id === sibling.id);
  result.isolation = {
    siblingId: sibling.id,
    siblingImageBefore: siblingImageBefore.slice(0, 100),
    siblingImageAfter: String((siblingAfter && siblingAfter.imageUrl) || "").slice(0, 100),
    ok:
      Boolean(siblingAfter) &&
      String((siblingAfter && siblingAfter.imageUrl) || "") === String(siblingImageBefore) &&
      !String((siblingAfter && siblingAfter.imageUrl) || "").includes(mediaId),
  };

  // Refresh CSRF from the public editor before publish (draft save may rotate tokens).
  const beforePublish = await follow(
    auth.jar,
    await req(auth.jar, `${BB}/c/${ORG}/leadership?website_edit=1&website_mode=draft`),
    BB
  );
  token = csrf(beforePublish.body) || token;
  const pub = await publishWebsite(auth.jar, token);
  result.publish = {
    status: pub.status,
    ok: Boolean(pub.okHttp),
    location: pub.location || null,
  };

  await sleep(1500);
  const publicAnon = new Jar();
  const publicPage = await follow(
    publicAnon,
    await req(publicAnon, `${BB}/c/${ORG}/leadership`),
    BB
  );
  const publicHas = (publicPage.body || "").includes(mediaId);
  result.publicRender = {
    status: publicPage.status,
    hasUploadedMedia: publicHas,
    ok: publicPage.status === 200 && publicHas,
  };

  // Refresh admin — target should show new image after publish (or draft association).
  const adminFinal = await follow(auth.jar, await req(auth.jar, adminUrl), BB);
  const leadersFinal = extractLeadersFromAdmin(adminFinal.body);
  const targetFinal = leadersFinal.find((l) => l.id === target.id);
  result.persistence = {
    targetId: target.id,
    hasMediaOnForm: Boolean(targetFinal && String(targetFinal.imageUrl || "").includes(mediaId)),
    hasReplaceLabel: /Replace image/.test(adminFinal.body),
    ok: Boolean(targetFinal && String(targetFinal.imageUrl || "").includes(mediaId)),
  };

  const pass =
    result.productionUntouched.ok &&
    result.adminChrome.hasUploadFromComputer &&
    result.adminChrome.hasContentLibrary &&
    result.upload.ok &&
    result.upload.published === false &&
    result.draftSave.ok &&
    result.isolation.ok &&
    result.publish.ok &&
    result.publicRender.ok &&
    result.persistence.ok;

  result.status = pass ? "PASS" : "BLOCKED";
  if (!pass) {
    result.blockReason = [
      !result.productionUntouched.ok && "production_touched_or_unreachable",
      !result.upload.ok && "upload_failed",
      result.upload.ok && result.upload.published !== false && "upload_marked_published",
      !result.draftSave.ok && "draft_save_failed",
      !result.isolation.ok && "sibling_leader_image_changed",
      !result.publish.ok && "publish_failed",
      !result.publicRender.ok && "public_missing_image",
      !result.persistence.ok && "image_not_on_admin_after_publish",
    ]
      .filter(Boolean)
      .join(",");
  }
  result.finishedAt = new Date().toISOString();
  result.hostedUrl = `${BB}/hq/content/leadership`;
  result.publicUrl = `${BB}/c/${ORG}/leadership`;
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(pass ? 0 : 2);
}

main().catch((err) => {
  const result = {
    status: "BLOCKED",
    blockReason: "script_exception",
    error: String(err && err.message ? err.message : err),
  };
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.error(err);
  process.exit(2);
});
