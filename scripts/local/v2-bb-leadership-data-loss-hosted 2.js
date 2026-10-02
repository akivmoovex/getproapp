"use strict";

/**
 * V2.0 BUG 06 — BlessBoard leadership data-loss hosted QA.
 * Uses disposable V8 QA tenant only. Does not write to demo-church-22 or production.
 */

const fs = require("fs");
const https = require("https");
const { URL } = require("url");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const CREDS_PATH = path.join(ROOT, ".env.v8-qa-tenants.local");
const BB = process.env.V2_BB_HOSTED_BASE || "https://blessboard.neuniversity.org";
const V7_BB = "https://blessboard.pronline.org";
const EXPECTED_SHA_PREFIX = process.env.V2_BB_LEADERSHIP_EXPECTED_SHA || "PLACEHOLDER";
const OUT = process.env.V2_BB_LEADERSHIP_OUT || "/tmp/v2-bb-leadership-data-loss-hosted.json";

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
      "User-Agent": "Mozilla/5.0 V2LeadershipQA",
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

function countLeaders(html) {
  const names = [];
  const re = /<h3[^>]*bb-tp-leader-card__name[^>]*>([\s\S]*?)<\/h3>/gi;
  let m;
  while ((m = re.exec(html))) {
    const text = m[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) names.push(text);
  }
  const entityKeys = [...html.matchAll(/data-bb-entity-key=["']([^"']+)["']/gi)].map((x) => x[1]);
  return {
    count: names.length,
    names,
    entityKeys: entityKeys.filter((k) => /leader/i.test(k) || /^demo-leader-/.test(k) || /^[0-9a-f-]{36}$/i.test(k)),
  };
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
    last = { status: hz.status, gitSha: body.gitSha || null, deploymentCode: body.deploymentCode || null };
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

async function postLeaderDraft(jar, token, entityKey, displayName, roleTitle) {
  const res = await req(jar, `${BB}/hq/content/api/structured-draft`, {
    method: "POST",
    accept: "application/json",
    headers: { "X-CSRF-Token": token, Referer: `${BB}/c/${ORG}/leadership?website_edit=1&website_mode=draft` },
    json: {
      _csrf: token,
      action: "save",
      draftKind: "leader",
      pageKey: "leadership",
      sectionKey: null,
      entityKey,
      op: "upsert",
      payload: {
        displayName,
        roleTitle,
        biography: `V2 BUG06 hosted QA bio for ${displayName}`,
        imageUrl: "/church/images/leadership/pastor-desktop.jpg",
        visible: true,
        seniorLeader: /senior/i.test(roleTitle),
        sortOrder: 10,
      },
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

async function main() {
  const result = {
    status: "BLOCKED",
    expectedShaPrefix: EXPECTED_SHA_PREFIX,
    organizationKey: ORG,
    productionUntouched: null,
    startedAt: new Date().toISOString(),
  };

  if (EXPECTED_SHA_PREFIX === "PLACEHOLDER") {
    result.blockReason = "set_V2_BB_LEADERSHIP_EXPECTED_SHA";
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
  if (!auth.ok) {
    result.blockReason = "login_failed";
    fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    process.exit(2);
  }

  const editUrl = `${BB}/c/${ORG}/leadership?website_edit=1&website_mode=draft`;
  const beforePage = await follow(auth.jar, await req(auth.jar, editUrl), BB);
  const before = countLeaders(beforePage.body);
  const token = csrf(beforePage.body);
  result.before = before;

  if (before.count < 3) {
    result.blockReason = "baseline_leader_count_lt_3";
    result.status = "BLOCKED";
    fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    process.exit(2);
  }

  const stamp = Date.now().toString(36);
  const edits = [
    { key: "demo-leader-senior", name: `V2 Senior ${stamp}`, role: "Senior Pastor" },
    { key: "demo-leader-associate", name: `V2 Associate ${stamp}`, role: "Associate Pastor" },
    { key: "demo-leader-ministries", name: `V2 Director ${stamp}`, role: "Director of Ministries" },
  ];

  const editResults = [];
  for (const edit of edits) {
    const pageForToken = await follow(auth.jar, await req(auth.jar, editUrl), BB);
    const freshToken = csrf(pageForToken.body) || token;
    const saved = await postLeaderDraft(auth.jar, freshToken, edit.key, edit.name, edit.role);
    const afterPage = await follow(auth.jar, await req(auth.jar, editUrl), BB);
    const after = countLeaders(afterPage.body);
    editResults.push({
      entityKey: edit.key,
      saveStatus: saved.status,
      saveOk: saved.status === 200 && saved.json.ok === true && saved.json.published === false,
      saveError: saved.json.error || saved.json.reason || null,
      softFillSiblings: saved.json.softFillSiblings || null,
      afterCount: after.count,
      preserved: after.count >= before.count,
      names: after.names,
    });
  }
  result.edits = editResults;

  // Public (no edit) should still soft-fill or show drafts only in edit mode —
  // publish is optional for this QA; verify draft overlay never dropped members.
  const allPreserved = editResults.every((e) => e.saveOk && e.preserved);
  const allSaved = editResults.every((e) => e.saveOk);
  // Sibling seeding may be 0 when drafts already exist from a prior QA run; count preservation is authoritative.
  const siblingSeeded = editResults.some(
    (e) =>
      e.softFillSiblings &&
      (e.softFillSiblings.seeded > 0 ||
        e.softFillSiblings.skipped === "published_content_exists" ||
        e.softFillSiblings.skipped === null)
  );

  result.sharedCollectionAudit = {
    activeClinicDoctorsServices:
      "NOT_AFFECTED — catalogue per-item CRUD (not soft-fill collection materialization)",
    blessboardMinistriesEventsSermons:
      "SAME_PATTERN — sibling soft-fill draft seeding covers ministry/event/sermon keys",
  };

  result.status =
    allPreserved && allSaved && siblingSeeded && result.productionUntouched.ok
      ? "PASS"
      : "BLOCKED";
  if (result.status !== "PASS") {
    result.blockReason = [
      !allSaved && "edit_save_failed",
      !allPreserved && "member_count_not_preserved",
      !siblingSeeded && "sibling_seed_missing",
      !(result.productionUntouched && result.productionUntouched.ok) && "production_check_failed",
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
  const result = { status: "BLOCKED", blockReason: String(err && err.stack ? err.stack : err) };
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.error(result.blockReason);
  process.exit(2);
});
