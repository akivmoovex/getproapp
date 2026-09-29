"use strict";

/**
 * V2 Bug 20 — Contact opening hours hosted smoke (Neuniversity V8 only).
 */

const fs = require("fs");
const https = require("https");
const { URL } = require("url");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const CREDS_PATH = path.join(ROOT, ".env.v8-qa-tenants.local");
const BB = process.env.V2_BB_HOSTED_BASE || "https://blessboard.neuniversity.org";
const V7_BB = "https://blessboard.pronline.org";
const EXPECTED_SHA_PREFIX = process.env.V2_BB_CONTACT_HOURS_EXPECTED_SHA || "PLACEHOLDER";
const OUT =
  process.env.V2_BB_CONTACT_HOURS_OUT || "/tmp/v2-bb-contact-hours-hosted.json";

const creds = {};
for (const line of fs.readFileSync(CREDS_PATH, "utf8").split(/\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) creds[m[1]] = m[2];
}
const ORG = creds.V8_QA_BB_ORG_KEY || "bb-v8qa-mub23a6v6a6b";

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
      "User-Agent": "V2BbContactHoursQA",
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
    result.blockReason = "set_V2_BB_CONTACT_HOURS_EXPECTED_SHA";
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

  const stamp = `Bug20 ${Date.now().toString(36)}`;
  const hoursValue = `Monday – Wednesday · 8:30 AM – 2:00 PM (${stamp})`;
  const contactEdit = `${BB}/c/${ORG}/contact?website_edit=1&website_mode=draft`;
  const page = await follow(jar, await req(jar, contactEdit), BB);
  const token = csrf(page.body);
  const failures = [];

  result.markup = {
    status: page.status,
    dataSection: /data-section="office_hours"/.test(page.body),
    hoursKey: /data-website-key="contact\.office_hours\.bodyText"/.test(page.body),
    pencilLabel: /aria-label="Edit opening hours"/.test(page.body),
  };
  if (
    page.status !== 200 ||
    !result.markup.dataSection ||
    !result.markup.hoursKey ||
    !result.markup.pencilLabel
  ) {
    failures.push("markup");
  }

  const draftSave = await req(jar, `${BB}/c/${ORG}/website/drafts`, {
    method: "POST",
    accept: "application/json",
    headers: { "X-CSRF-Token": token, Referer: contactEdit },
    json: { contentKey: "contact.office_hours.bodyText", value: hoursValue },
  });
  let draftJson = {};
  try {
    draftJson = JSON.parse(draftSave.body || "{}");
  } catch (_e) {
    draftJson = {};
  }
  result.draftSave = {
    status: draftSave.status,
    ok: draftSave.status === 200 && draftJson.ok === true && draftJson.code !== "unknown_content_key",
    code: draftJson.code || null,
  };
  if (!result.draftSave.ok) failures.push("draft_save");

  const preview = await follow(jar, await req(jar, contactEdit), BB);
  result.draftPreview = {
    ok: preview.body.includes(stamp),
  };
  if (!result.draftPreview.ok) failures.push("draft_preview");

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
  if (!result.publish.ok) failures.push("publish");

  const publicPage = await follow(new Jar(), await req(new Jar(), `${BB}/c/${ORG}/contact`), BB);
  result.publicRender = {
    status: publicPage.status,
    ok: publicPage.status === 200 && publicPage.body.includes(stamp),
  };
  if (!result.publicRender.ok) failures.push("public_render");

  // Bug 18 regression: allowlisted value card saves; unknown aggregate rejected.
  const aboutEdit = `${BB}/c/${ORG}/about?website_edit=1&website_mode=draft`;
  const aboutPage = await follow(jar, await req(jar, aboutEdit), BB);
  const aboutToken = csrf(aboutPage.body);
  const valueOk = await req(jar, `${BB}/c/${ORG}/website/drafts`, {
    method: "POST",
    accept: "application/json",
    headers: { "X-CSRF-Token": aboutToken, Referer: aboutEdit },
    json: {
      contentKey: "about.value_presence.bodyText",
      value: `Presence ${stamp}`,
    },
  });
  let valueOkJson = {};
  try {
    valueOkJson = JSON.parse(valueOk.body || "{}");
  } catch (_e) {
    valueOkJson = {};
  }
  const valueBad = await req(jar, `${BB}/c/${ORG}/website/drafts`, {
    method: "POST",
    accept: "application/json",
    headers: { "X-CSRF-Token": aboutToken, Referer: aboutEdit },
    json: {
      contentKey: "about.not_a_real_value.bodyText",
      value: `Bad ${stamp}`,
    },
  });
  let valueBadJson = {};
  try {
    valueBadJson = JSON.parse(valueBad.body || "{}");
  } catch (_e) {
    valueBadJson = {};
  }
  result.bug18 = {
    allowlistedOk: valueOk.status === 200 && valueOkJson.ok === true,
    unknownRejected:
      valueBad.status === 400 && valueBadJson.code === "unknown_content_key",
    noAggregateBodyEditor: !/data-website-key="about\.values\.bodyText"/.test(aboutPage.body),
  };
  if (
    !result.bug18.allowlistedOk ||
    !result.bug18.unknownRejected ||
    !result.bug18.noAggregateBodyEditor
  ) {
    failures.push("bug18");
  }

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
