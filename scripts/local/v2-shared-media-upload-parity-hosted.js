"use strict";

/**
 * V2.0 BUG FIX 04 — Shared platform media upload parity hosted QA.
 * Neuniversity V2.0 testing only. BlessBoard + ActiveClinic.
 */

const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const https = require("https");
const { URL } = require("url");

const root = path.resolve(__dirname, "../..");
process.chdir(root);
require("dotenv").config({ path: ".env.testing.local" });

const {
  createProvisionPool,
  resolveDatabaseUrlSafe,
} = require(`${root}/db/scripts/lib/provisionCliSafety`);
const {
  provisionHostedAuthQaClinic,
  cleanupHostedAuthQaClinic,
  publicFixtureRecord,
} = require(`${root}/src/activeclinic/qa/activeClinicHostedAuthQaFixture`);
const {
  CSRF_FIELD,
  createHostedClient,
  extractCsrfField,
} = require(`${root}/src/activeclinic/qa/activeClinicHostedAuthQaClient`);
const {
  setPlatformIdentityPassword,
} = require(`${root}/src/platform/services/platformIdentityCredentialService`);

const BB = process.env.V2_BB_HOSTED_BASE || "https://blessboard.neuniversity.org";
const AC = process.env.V2_AC_HOSTED_BASE || "https://activeclinic.neuniversity.org";
const V7_BB = "https://blessboard.pronline.org";
const V7_AC = "https://activeclinic.pronline.org";
const EXPECTED_SHA_PREFIX = process.env.V2_MEDIA_EXPECTED_SHA || "PLACEHOLDER";
const OUT = process.env.V2_MEDIA_OUT || "/tmp/v2-shared-media-upload-parity-hosted.json";
const CREDS_PATH = path.join(root, ".env.v8-qa-tenants.local");
const TEMP_PASSWORD = `V2MediaQa!${crypto.randomBytes(4).toString("hex")}`;

const creds = {};
if (fs.existsSync(CREDS_PATH)) {
  for (const line of fs.readFileSync(CREDS_PATH, "utf8").split(/\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) creds[m[1]] = m[2];
  }
}

/** Minimal valid 1×1 PNG */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function csrfFrom(html) {
  const m = String(html || "").match(/name=["']_csrf["'][^>]*value=["']([^"']+)["']/i);
  if (m) return m[1];
  const alt = String(html || "").match(/value=["']([^"']+)["'][^>]*name=["']_csrf["']/i);
  return alt ? alt[1] : "";
}

function req(jar, url, opt = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    let body = null;
    const headers = {
      "User-Agent": "Mozilla/5.0 V2MediaParityQA",
      Cookie: jar.header(),
      Accept: opt.accept || "text/html,application/xhtml+xml",
      ...(opt.headers || {}),
    };
    if (opt.form) {
      body = new URLSearchParams(opt.form).toString();
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      headers["Content-Length"] = Buffer.byteLength(body);
    } else if (opt.multipart) {
      const boundary = opt.multipart.boundary;
      body = opt.multipart.buffer;
      headers["Content-Type"] = `multipart/form-data; boundary=${boundary}`;
      headers["Content-Length"] = body.length;
    }
    const r = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: opt.method || "GET",
        headers,
        timeout: 60000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          jar.absorb(res.headers);
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
    r.on("timeout", () => {
      r.destroy();
      reject(new Error("timeout"));
    });
    if (body) r.write(body);
    r.end();
  });
}

async function follow(jar, res, base) {
  let cur = res;
  for (let i = 0; i < 6; i++) {
    if (!(cur.status >= 300 && cur.status < 400 && cur.location)) return cur;
    const next = cur.location.startsWith("http") ? cur.location : `${base}${cur.location}`;
    cur = await req(jar, next);
  }
  return cur;
}

function buildMultipart(fields, fileField, fileName, fileBuf, mime) {
  const boundary = `----V2Media${crypto.randomBytes(8).toString("hex")}`;
  const parts = [];
  for (const [k, v] of Object.entries(fields || {})) {
    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`
    );
  }
  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${fileName}"\r\nContent-Type: ${mime}\r\n\r\n`
  );
  const head = Buffer.from(parts.join(""), "utf8");
  const mid = Buffer.isBuffer(fileBuf) ? fileBuf : Buffer.from(fileBuf);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return { boundary, buffer: Buffer.concat([head, mid, tail]) };
}

function hasParityLabels(html) {
  return {
    upload: /Upload from computer/i.test(html),
    library: /Choose from Content Library/i.test(html),
    sharedField: /data-gp-we-media-field/i.test(html),
    sharedPicker: /data-gp-we-media-picker/i.test(html),
    sharedJs: /website-media-field\.js/i.test(html),
    replaceOrUpload: /Replace image|Upload from computer/i.test(html),
    remove: /Remove image/i.test(html),
  };
}

async function waitForDeploy(bases, prefix, maxMs = 12 * 60 * 1000) {
  const started = Date.now();
  let last = {};
  while (Date.now() - started < maxMs) {
    last = {};
    let allOk = true;
    for (const base of bases) {
      const hz = await req(new Jar(), `${base}/healthz`, { accept: "application/json" });
      let body = {};
      try {
        body = JSON.parse(hz.body || "{}");
      } catch (_e) {
        body = {};
      }
      last[base] = {
        status: hz.status,
        gitSha: body.gitSha || null,
        deploymentCode: body.deploymentCode || null,
        platformLine: body.platformLine || null,
      };
      const sha = String(body.gitSha || "");
      if (!(hz.status === 200 && sha.startsWith(prefix))) allOk = false;
    }
    if (allOk) return { ok: true, hosted: last };
    await sleep(15000);
  }
  return { ok: false, hosted: last, blockReason: "deploy_sha_timeout" };
}

async function loginBb(email, password) {
  const jar = new Jar();
  const page = await req(jar, `${BB}/login`);
  const posted = await follow(
    jar,
    await req(jar, `${BB}/login`, {
      method: "POST",
      form: {
        _csrf: csrfFrom(page.body),
        email,
        password,
      },
      headers: { Referer: `${BB}/login` },
    }),
    BB
  );
  return { jar, ok: posted.status === 200 && /\/hq|Dashboard|Website/i.test(posted.body + posted.url), url: posted.url };
}

async function runBb(result) {
  const email = creds.V8_QA_BB_HQ_EMAIL;
  const password = creds.V8_QA_BB_PASSWORD;
  const org = creds.V8_QA_BB_ORG_KEY;
  if (!email || !password || !org) {
    result.blessboard = { ok: false, reason: "missing_v8_qa_creds" };
    return;
  }
  const login = await loginBb(email, password);
  if (!login.ok) {
    result.blessboard = { ok: false, reason: "login_failed", url: login.url };
    return;
  }

  const branding = await req(login.jar, `${BB}/hq/website/branding`);
  const labels = hasParityLabels(branding.body);
  const mediaUrlMatch = branding.body.match(/\/c\/[^"'\\\s]+\/website\/media/);
  const mediaUrl = mediaUrlMatch ? mediaUrlMatch[0] : `/c/${org}/website/media`;

  const csrf = csrfFrom(branding.body);
  const multipart = buildMultipart(
    { _csrf: csrf, mediaKind: "image", altText: "V2 parity logo" },
    "file",
    "v2-parity.png",
    TINY_PNG,
    "image/png"
  );
  const upload = await req(login.jar, `${BB}${mediaUrl}`, {
    method: "POST",
    multipart,
    accept: "application/json",
    headers: { Referer: `${BB}/hq/website/branding` },
  });
  let uploadJson = {};
  try {
    uploadJson = JSON.parse(upload.body || "{}");
  } catch (_e) {
    uploadJson = {};
  }

  const mediaId = uploadJson.media && (uploadJson.media.id || uploadJson.media.mediaId);
  const publicSrc =
    (uploadJson.media && (uploadJson.media.publicSrc || uploadJson.media.previewUrl)) || "";

  // Draft save with uploaded media id — must not force publish
  const saved = await follow(
    login.jar,
    await req(login.jar, `${BB}/hq/website/branding`, {
      method: "POST",
      form: {
        _csrf: csrf,
        primaryColor: "",
        accentColor: "",
        logoMediaId: mediaId || "",
        logoSrc: publicSrc || "",
        logoAlt: "V2 parity logo",
        heroMediaId: "",
        heroSrc: "",
        heroAlt: "",
      },
      headers: { Referer: `${BB}/hq/website/branding` },
    }),
    BB
  );

  // Structured / public editor assets
  const publicEdit = await req(login.jar, `${BB}/c/${org}?edit=1`);
  const inlineHasUpload = /Upload from computer|Choose from Content Library/i.test(
    fs.readFileSync(path.join(root, "public/platform/website-inline-edit.js"), "utf8")
  ) && /website-inline-edit\.js\?v=v2-media-parity-1/i.test(publicEdit.body);

  // CDN / media GET
  let cdnOk = false;
  let mediaGetStatus = null;
  if (mediaId) {
    const mediaGet = await req(login.jar, `${BB}${mediaUrl}/${mediaId}`, {
      accept: "application/json",
    });
    mediaGetStatus = mediaGet.status;
    let mediaGetJson = {};
    try {
      mediaGetJson = JSON.parse(mediaGet.body || "{}");
    } catch (_e) {
      mediaGetJson = {};
    }
    const src =
      (mediaGetJson.media && (mediaGetJson.media.publicSrc || mediaGetJson.media.previewUrl)) ||
      publicSrc;
    if (src && /^https?:\/\//i.test(src)) {
      const cdn = await req(new Jar(), src, { accept: "*/*" });
      cdnOk = cdn.status === 200 && (cdn.body.length > 0 || (cdn.headers["content-type"] || "").includes("image"));
    } else if (src) {
      const cdn = await req(login.jar, src.startsWith("http") ? src : `${BB}${src}`, {
        accept: "*/*",
      });
      cdnOk = cdn.status === 200;
    }
  }

  // Leadership coverage: structured edit source includes leader photo upload labels
  const structured = fs.readFileSync(
    path.join(root, "public/blessboard/v5/website-structured-edit.js"),
    "utf8"
  );
  const leadershipCoverage =
    /Leader photo/i.test(structured) &&
    /Upload from computer/.test(structured) &&
    /Choose from Content Library/.test(structured);

  const publishedFlag = uploadJson.published === false || uploadJson.published == null;

  result.blessboard = {
    ok:
      branding.status === 200 &&
      labels.upload &&
      labels.library &&
      labels.sharedField &&
      labels.sharedJs &&
      labels.remove &&
      upload.status === 200 &&
      uploadJson.ok === true &&
      Boolean(mediaId) &&
      publishedFlag &&
      /saved=1|Saved as a draft/i.test(saved.body + saved.url) &&
      inlineHasUpload &&
      leadershipCoverage &&
      Boolean(cdnOk || publicSrc),
    brandingStatus: branding.status,
    labels,
    mediaUrl,
    upload: {
      status: upload.status,
      ok: uploadJson.ok === true,
      mediaId: mediaId || null,
      published: uploadJson.published,
      publicSrc: publicSrc || null,
    },
    draftSave: {
      status: saved.status,
      url: saved.url,
      ok: /saved=1|Saved as a draft/i.test(saved.body + saved.url),
    },
    inlineEditorCacheBust: inlineHasUpload,
    leadershipCoverage,
    mediaGetStatus,
    cdnOk,
    publicSrc: publicSrc || null,
  };
}

async function runAc(db, result) {
  let organizationKey = null;
  try {
    const fixture = await provisionHostedAuthQaClinic(db, {}, process.env);
    if (!fixture.ok) {
      result.activeclinic = { ok: false, reason: fixture.reason || "provision_failed" };
      return;
    }
    organizationKey = fixture.organizationKey || fixture.clinicKey;
    const adminId = fixture.adminIdentityId || fixture.adminUserId;
    if (adminId) {
      await setPlatformIdentityPassword(db, {
        identityId: adminId,
        password: TEMP_PASSWORD,
        env: process.env,
      });
    }
    const email = fixture.adminEmail || fixture.loginEmail;
    const client = createHostedClient(AC);
    const loginGet = await client.get("/login");
    const csrf = extractCsrfField(loginGet.text) || client.jar.csrf();
    const loginPost = await client.postForm("/login", {
      [CSRF_FIELD]: csrf,
      identifier: email,
      password: TEMP_PASSWORD,
    });
    await client.follow(loginPost);
    if (!client.jar.sessionPresent()) {
      result.activeclinic = { ok: false, reason: "login_failed", organizationKey };
      return;
    }

    const branding = await client.get("/app/settings/website/branding");
    const labels = hasParityLabels(branding.text);
    const mediaUrlMatch = branding.text.match(/\/clinics\/[^"'\\\s]+\/website\/media/);
    const mediaUrl =
      mediaUrlMatch?.[0] || `/clinics/${organizationKey}/website/media`;

    const brandCsrf = extractCsrfField(branding.text) || client.jar.csrf();
    const fd = new FormData();
    fd.append("_csrf", brandCsrf);
    fd.append("mediaKind", "image");
    fd.append("altText", "V2 AC parity logo");
    fd.append("file", new Blob([TINY_PNG], { type: "image/png" }), "v2-ac-parity.png");

    const uploadRes = await fetch(`${AC}${mediaUrl}`, {
      method: "POST",
      headers: {
        Cookie: client.jar.header(),
        Accept: "application/json",
        Origin: AC,
        Referer: `${AC}/app/settings/website/branding`,
      },
      body: fd,
      redirect: "manual",
    });
    const uploadText = await uploadRes.text();
    let uploadJson = {};
    try {
      uploadJson = JSON.parse(uploadText || "{}");
    } catch (_e) {
      uploadJson = {};
    }
    const mediaId = uploadJson.media && (uploadJson.media.id || uploadJson.media.mediaId);
    const publicSrc =
      (uploadJson.media && (uploadJson.media.publicSrc || uploadJson.media.previewUrl)) || "";

    const savePost = await client.postForm("/app/settings/website/branding", {
      [CSRF_FIELD]: brandCsrf,
      logoMediaId: mediaId || "",
      logoSrc: publicSrc || "",
      logoAlt: "V2 AC parity logo",
      heroMediaId: "",
      heroSrc: "",
      heroAlt: "",
      primaryColor: "",
      accentColor: "",
    });
    const saved = await client.follow(savePost);

    // Doctor form media field parity (new doctor page)
    const doctorForm = await client.get("/app/settings/website/catalogue/doctors/new");
    const doctorLabels = hasParityLabels(doctorForm.text);

    // Service form
    const serviceForm = await client.get("/app/settings/website/catalogue/services/new");
    const serviceLabels = hasParityLabels(serviceForm.text);

    let cdnOk = false;
    if (publicSrc) {
      const cdnClient = createHostedClient(AC);
      const cdn = await cdnClient.get(
        publicSrc.startsWith("http") ? publicSrc : publicSrc
      );
      // Absolute CDN URLs need raw fetch
      if (/^https?:\/\//i.test(publicSrc)) {
        const cdnRes = await fetch(publicSrc, { redirect: "follow" });
        cdnOk = cdnRes.status === 200;
      } else {
        cdnOk = cdn.status === 200;
      }
    }

    result.activeclinic = {
      ok:
        branding.status === 200 &&
        labels.upload &&
        labels.library &&
        labels.sharedField &&
        labels.sharedJs &&
        uploadRes.status === 200 &&
        uploadJson.ok === true &&
        Boolean(mediaId) &&
        uploadJson.published === false &&
        doctorLabels.sharedField &&
        doctorLabels.upload &&
        serviceLabels.sharedField &&
        serviceLabels.upload &&
        Boolean(cdnOk || publicSrc),
      organizationKey,
      brandingStatus: branding.status,
      labels,
      mediaUrl,
      upload: {
        status: uploadRes.status,
        ok: uploadJson.ok === true,
        mediaId: mediaId || null,
        published: uploadJson.published,
        publicSrc: publicSrc || null,
      },
      draftSave: {
        status: saved.status,
        ok: saved.status === 200 || savePost.status === 303,
      },
      doctorForm: doctorLabels,
      serviceForm: serviceLabels,
      cdnOk,
      fixture: publicFixtureRecord(fixture),
    };
  } catch (err) {
    result.activeclinic = {
      ok: false,
      reason: err && err.message ? String(err.message) : String(err),
      organizationKey,
    };
  } finally {
    if (organizationKey) {
      try {
        await cleanupHostedAuthQaClinic(db, organizationKey, process.env);
      } catch (_e) {
        /* best-effort */
      }
    }
  }
}

async function productionUntouched() {
  const out = { ok: true, hosts: {} };
  for (const [name, base] of [
    ["bb", V7_BB],
    ["ac", V7_AC],
  ]) {
    try {
      const hz = await req(new Jar(), `${base}/healthz`, { accept: "application/json" });
      let body = {};
      try {
        body = JSON.parse(hz.body || "{}");
      } catch (_e) {
        body = {};
      }
      out.hosts[name] = {
        status: hz.status,
        gitSha: body.gitSha || null,
        deploymentCode: body.deploymentCode || null,
        platformLine: body.platformLine || null,
      };
      if (hz.status !== 200) out.ok = false;
      if (String(body.platformLine || "").toLowerCase().includes("v8")) out.ok = false;
    } catch (err) {
      out.ok = false;
      out.hosts[name] = { error: String(err.message || err) };
    }
  }
  return out;
}

async function main() {
  const result = {
    status: "BLOCKED",
    expectedShaPrefix: EXPECTED_SHA_PREFIX,
    hostedSha: null,
    productionUntouched: null,
    blessboard: null,
    activeclinic: null,
    startedAt: new Date().toISOString(),
  };

  if (EXPECTED_SHA_PREFIX === "PLACEHOLDER") {
    result.blockReason = "set_V2_MEDIA_EXPECTED_SHA_after_deploy";
    fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    process.exit(2);
  }

  const deploy = await waitForDeploy([BB, AC], EXPECTED_SHA_PREFIX);
  result.deploy = deploy;
  const shaSample =
    (deploy.hosted && deploy.hosted[BB] && deploy.hosted[BB].gitSha) ||
    (deploy.hosted && deploy.hosted[AC] && deploy.hosted[AC].gitSha);
  result.hostedSha = shaSample || null;
  if (!deploy.ok) {
    result.status = "BLOCKED";
    result.blockReason = deploy.blockReason || "deploy_sha_timeout";
    fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    process.exit(2);
  }

  result.productionUntouched = await productionUntouched();

  await runBb(result);

  const databaseUrl = resolveDatabaseUrlSafe(process.env);
  const db = createProvisionPool(databaseUrl);
  try {
    await runAc(db, result);
  } finally {
    await db.end().catch(() => {});
  }

  const pass =
    result.blessboard &&
    result.blessboard.ok &&
    result.activeclinic &&
    result.activeclinic.ok &&
    result.productionUntouched &&
    result.productionUntouched.ok;

  result.status = pass ? "PASS" : "BLOCKED";
  result.finishedAt = new Date().toISOString();
  if (!pass) {
    result.blockReason = [
      !(result.blessboard && result.blessboard.ok) && "blessboard_failed",
      !(result.activeclinic && result.activeclinic.ok) && "activeclinic_failed",
      !(result.productionUntouched && result.productionUntouched.ok) &&
        "production_check_failed",
    ]
      .filter(Boolean)
      .join(",");
  }

  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(pass ? 0 : 2);
}

main().catch((err) => {
  const result = {
    status: "BLOCKED",
    blockReason: String(err && err.stack ? err.stack : err),
  };
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.error(result.blockReason);
  process.exit(2);
});
