"use strict";

/**
 * V2.0 BUG 13 — BlessBoard homepage pastor text editing hosted QA.
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
const EXPECTED_SHA_PREFIX = process.env.V2_BB_HOME_LEADERS_EXPECTED_SHA || "PLACEHOLDER";
const OUT = process.env.V2_BB_HOME_LEADERS_OUT || "/tmp/v2-bb-home-leaders-text-hosted.json";

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
      "User-Agent": "Mozilla/5.0 V2HomeLeadersQA",
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

function extractHomeLeaders(html) {
  const sectionMatch = String(html || "").match(
    /data-bb-home-leader-cards="1"([\s\S]*?)(?:<\/section>|<section\b|$)/
  );
  const slice = sectionMatch ? sectionMatch[1] : "";
  const cards = [];
  const buttonRe = /<button\b[^>]*>/gi;
  let m;
  while ((m = buttonRe.exec(slice))) {
    const tag = m[0];
    if (!/data-bb-kind="leader"/.test(tag)) continue;
    if (!/data-bb-edit-details="1"/.test(tag) && !/aria-label="Edit details"/.test(tag)) continue;
    const entity = (tag.match(/data-bb-entity="([^"]+)"/) || [])[1];
    if (entity) cards.push(entity);
  }
  const names = [];
  const nameRe = /bb-tp-leader-card__name[^>]*>([\s\S]*?)<\/h3>/gi;
  while ((m = nameRe.exec(slice))) {
    const text = m[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\bedit details\b/gi, " ")
      .trim();
    if (text) names.push(text);
  }
  return { entityKeys: [...new Set(cards)], names, slice };
}

function countLeadersOnLeadershipPage(html) {
  const names = [];
  const re = /bb-tp-leader-card__name[^>]*>([\s\S]*?)<\/h3>/gi;
  let m;
  while ((m = re.exec(html))) {
    const text = m[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\bedit details\b/gi, " ")
      .trim();
    if (text) names.push(text);
  }
  return { count: names.length, names };
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

async function main() {
  const result = {
    status: "BLOCKED",
    expectedShaPrefix: EXPECTED_SHA_PREFIX,
    organizationKey: ORG,
    startedAt: new Date().toISOString(),
  };

  if (EXPECTED_SHA_PREFIX === "PLACEHOLDER") {
    result.blockReason = "set_V2_BB_HOME_LEADERS_EXPECTED_SHA";
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
  const before = extractHomeLeaders(editPage.body);
  result.editChrome = {
    status: editPage.status,
    hasPastorsHeading: /Pastors and Leaders/i.test(editPage.body),
    hasHomeLeaderCards: /data-bb-home-leader-cards="1"/.test(editPage.body),
    editDetailsCount: before.entityKeys.length,
    entityKeys: before.entityKeys,
    distinctKeys: new Set(before.entityKeys).size,
    namesBefore: before.names,
    structuredBust: /website-structured-edit\.js\?v=v2-bb-home-lead-1/.test(editPage.body),
  };

  if (before.entityKeys.length < 3 || new Set(before.entityKeys).size < 3) {
    result.blockReason = "missing_independent_edit_details_controls";
    fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    process.exit(2);
  }

  const leadershipBefore = await follow(
    auth.jar,
    await req(auth.jar, `${BB}/c/${ORG}/leadership?website_edit=1&website_mode=draft`),
    BB
  );
  const leadershipCountBefore = countLeadersOnLeadershipPage(leadershipBefore.body);
  result.sharedSourceBefore = {
    homeCount: before.names.length,
    leadershipCount: leadershipCountBefore.count,
  };

  let token = csrf(editPage.body);
  const stamp = Date.now().toString(36);
  const targetKeys = before.entityKeys.slice(0, 3);
  const positions = ["first", "middle", "last"];
  const saves = [];

  for (let i = 0; i < targetKeys.length; i += 1) {
    const entityKey = targetKeys[i];
    const page = await follow(auth.jar, await req(auth.jar, editUrl), BB);
    token = csrf(page.body) || token;
    const displayName = `V2 Home ${positions[i]} ${stamp}`;
    const roleTitle = `${positions[i]} Pastor`;
    const biography = `Independent homepage pastor bio ${positions[i]} ${stamp}`;
    const save = await postLeaderDraft(auth.jar, token, entityKey, {
      displayName,
      roleTitle,
      biography,
      imageUrl: "/church/images/leadership/pastor-desktop.jpg",
      visible: true,
      seniorLeader: i === 0,
      sortOrder: (i + 1) * 10,
    });
    saves.push({
      position: positions[i],
      entityKey,
      displayName,
      roleTitle,
      biography,
      status: save.status,
      ok: save.status === 200 && save.json.ok === true,
      published: save.json.published,
    });
  }
  result.saves = saves;

  const draftPage = await follow(auth.jar, await req(auth.jar, editUrl), BB);
  const draft = extractHomeLeaders(draftPage.body);
  result.draftPreview = {
    status: draftPage.status,
    names: draft.names,
    allPresent: saves.every((s) => draft.names.some((n) => n.includes(s.displayName))),
    rolesPresent: saves.every((s) => draftPage.body.includes(s.roleTitle)),
    biosPresent: saves.every((s) => draftPage.body.includes(s.biography)),
    memberCount: draft.names.length,
    countPreserved: draft.names.length >= before.names.length,
  };

  const leadershipDraft = await follow(
    auth.jar,
    await req(auth.jar, `${BB}/c/${ORG}/leadership?website_preview=1&website_mode=draft`),
    BB
  );
  const leadershipDraftNames = countLeadersOnLeadershipPage(leadershipDraft.body);
  result.consistency = {
    leadershipHasFirst: leadershipDraftNames.names.some((n) => n.includes(saves[0].displayName)),
    leadershipHasMiddle: leadershipDraftNames.names.some((n) => n.includes(saves[1].displayName)),
    leadershipHasLast: leadershipDraftNames.names.some((n) => n.includes(saves[2].displayName)),
    leadershipCount: leadershipDraftNames.count,
    ok: false,
  };
  result.consistency.ok =
    result.consistency.leadershipHasFirst &&
    result.consistency.leadershipHasMiddle &&
    result.consistency.leadershipHasLast &&
    leadershipDraftNames.count >= leadershipCountBefore.count;

  // Bug 06: editing three members must not shrink the home set.
  result.bug06Regression = {
    before: before.names.length,
    after: draft.names.length,
    ok: draft.names.length >= before.names.length && draft.entityKeys.length >= 3,
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
  const publicHome = await follow(new Jar(), await req(new Jar(), `${BB}/c/${ORG}/`), BB);
  const publicLeaders = extractHomeLeaders(publicHome.body);
  result.publicRender = {
    status: publicHome.status,
    names: publicLeaders.names,
    allPresent: saves.every((s) => publicHome.body.includes(s.displayName)),
    rolesPresent: saves.every((s) => publicHome.body.includes(s.roleTitle)),
    biosPresent: saves.every((s) => publicHome.body.includes(s.biography)),
  };

  const publicLeadership = await follow(new Jar(), await req(new Jar(), `${BB}/c/${ORG}/leadership`), BB);
  result.publicLeadershipConsistency = {
    allPresent: saves.every((s) => publicLeadership.body.includes(s.displayName)),
  };

  const history = await follow(
    auth.jar,
    await req(auth.jar, `${BB}/c/${ORG}/website/history`),
    BB
  );
  result.history = {
    status: history.status,
    ok: history.status === 200 && /published|history|version/i.test(history.body),
  };

  const relogin = await login();
  const again = await follow(relogin.jar, await req(relogin.jar, editUrl), BB);
  result.relogin = {
    ok: saves.every((s) => again.body.includes(s.displayName)),
  };

  result.status =
    result.editChrome.hasPastorsHeading &&
    result.editChrome.editDetailsCount >= 3 &&
    result.editChrome.distinctKeys >= 3 &&
    result.editChrome.structuredBust &&
    saves.every((s) => s.ok) &&
    result.draftPreview.allPresent &&
    result.draftPreview.rolesPresent &&
    result.draftPreview.biosPresent &&
    result.draftPreview.countPreserved &&
    result.consistency.ok &&
    result.bug06Regression.ok &&
    result.publish.ok &&
    result.publicRender.allPresent &&
    result.publicLeadershipConsistency.allPresent &&
    result.history.ok &&
    result.relogin.ok &&
    result.productionUntouched.ok
      ? "PASS"
      : "BLOCKED";

  if (result.status !== "PASS") {
    result.blockReason = [
      !result.editChrome.hasPastorsHeading && "missing_pastors_heading",
      result.editChrome.editDetailsCount < 3 && "missing_edit_details",
      result.editChrome.distinctKeys < 3 && "non_independent_keys",
      !result.editChrome.structuredBust && "missing_js_bust",
      saves.some((s) => !s.ok) && "draft_save_failed",
      !result.draftPreview.allPresent && "draft_missing_names",
      !result.draftPreview.rolesPresent && "draft_missing_roles",
      !result.draftPreview.biosPresent && "draft_missing_bios",
      !result.draftPreview.countPreserved && "member_count_dropped",
      !result.consistency.ok && "leadership_page_inconsistent",
      !result.bug06Regression.ok && "bug06_data_loss",
      !result.publish.ok && "publish_failed",
      !result.publicRender.allPresent && "public_missing_names",
      !result.publicLeadershipConsistency.allPresent && "public_leadership_inconsistent",
      !result.history.ok && "history_missing",
      !result.relogin.ok && "relogin_lost",
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
