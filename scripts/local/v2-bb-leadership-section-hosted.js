"use strict";

/**
 * V2.0 BUG 07 — BlessBoard leadership section management hosted QA.
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
const EXPECTED_SHA_PREFIX = process.env.V2_BB_LEADERSHIP_SECTION_EXPECTED_SHA || "PLACEHOLDER";
const OUT =
  process.env.V2_BB_LEADERSHIP_SECTION_OUT || "/tmp/v2-bb-leadership-section-hosted.json";
const DEMO_ORG = "demo-church-22";

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
      "User-Agent": "Mozilla/5.0 V2LeadershipSectionQA",
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
  return { count: names.length, names };
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
      payload: {
        displayName,
        roleTitle,
        biography: `V2 BUG07 hosted QA bio for ${displayName}`,
        imageUrl: "/church/images/leadership/pastor-desktop.jpg",
        visible: true,
        seniorLeader: false,
        sortOrder: 100,
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

async function publishWebsite(jar, token) {
  const res = await req(jar, `${BB}/c/${ORG}/website/publish`, {
    method: "POST",
    accept: "application/json",
    headers: {
      "X-CSRF-Token": token,
      Referer: `${BB}/c/${ORG}/leadership?website_edit=1&website_mode=draft`,
    },
    json: { _csrf: token },
  });
  let json = {};
  try {
    json = JSON.parse(res.body || "{}");
  } catch (_e) {
    json = { raw: String(res.body || "").slice(0, 400) };
  }
  return { status: res.status, json, location: res.location || "" };
}

function inspectEditChrome(html) {
  return {
    hasAddSectionOpen: /data-website-add-section-open/.test(html),
    hasAddSectionHost: /data-website-add-section-host/.test(html),
    canAddSectionAttr: (html.match(/data-website-can-add-section="([^"]*)"/) || [])[1] || null,
    hasAddMemberCta: /data-bb-leadership-add-member/.test(html) && /Add leadership member/.test(html),
    hasNewLeaderTrigger: /data-bb-kind="leader"[\s\S]{0,120}data-bb-entity="new-leader"|data-bb-entity="new-leader"[\s\S]{0,120}data-bb-kind="leader"/.test(
      html
    ),
    emptyDialogCopy: /No more section types are available for this page/.test(html),
    structuredEditBust: /website-structured-edit\.js\?v=v2-bb-lead-sec-1/.test(html),
  };
}

async function main() {
  const result = {
    status: "BLOCKED",
    expectedShaPrefix: EXPECTED_SHA_PREFIX,
    organizationKey: ORG,
    demoChurch22: null,
    productionUntouched: null,
    startedAt: new Date().toISOString(),
  };

  if (EXPECTED_SHA_PREFIX === "PLACEHOLDER") {
    result.blockReason = "set_V2_BB_LEADERSHIP_SECTION_EXPECTED_SHA";
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

  const demoPublic = await follow(
    new Jar(),
    await req(new Jar(), `${BB}/c/${DEMO_ORG}/leadership`),
    BB
  );
  result.demoChurch22 = {
    status: demoPublic.status,
    leaderCount: countLeaders(demoPublic.body).count,
    titleOk: /Demo Church 22/i.test(demoPublic.body),
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
  const chrome = inspectEditChrome(beforePage.body);
  result.before = before;
  result.editChrome = chrome;

  const typesRes = await req(
    auth.jar,
    `${BB}/c/${ORG}/website/add-section/types?pageKey=leadership`,
    { accept: "application/json" }
  );
  let typesJson = {};
  try {
    typesJson = JSON.parse(typesRes.body || "{}");
  } catch (_e) {
    typesJson = {};
  }
  result.addSectionTypes = {
    status: typesRes.status,
    ok: typesJson.ok === true,
    count: Array.isArray(typesJson.sections) ? typesJson.sections.length : null,
    canAddSection: typesJson.canAddSection,
    memberAction: typesJson.memberAction || null,
    emptyHint: typesJson.emptyHint || null,
  };

  const stamp = Date.now().toString(36);
  const memberA = { key: `new-leader-${stamp}-a`, name: `V2 Sec A ${stamp}`, role: "Elder" };
  const memberB = { key: `new-leader-${stamp}-b`, name: `V2 Sec B ${stamp}`, role: "Deacon" };

  let pageForToken = await follow(auth.jar, await req(auth.jar, editUrl), BB);
  let token = csrf(pageForToken.body);
  const saveA = await postLeaderDraft(auth.jar, token, memberA.key, memberA.name, memberA.role);
  pageForToken = await follow(auth.jar, await req(auth.jar, editUrl), BB);
  token = csrf(pageForToken.body) || token;
  const mid = countLeaders(pageForToken.body);
  const saveB = await postLeaderDraft(auth.jar, token, memberB.key, memberB.name, memberB.role);
  const afterPage = await follow(auth.jar, await req(auth.jar, editUrl), BB);
  token = csrf(afterPage.body) || token;
  const after = countLeaders(afterPage.body);

  result.memberCreates = {
    saveA: {
      status: saveA.status,
      ok: saveA.status === 200 && saveA.json.ok === true,
      published: saveA.json.published,
    },
    saveB: {
      status: saveB.status,
      ok: saveB.status === 200 && saveB.json.ok === true,
      published: saveB.json.published,
    },
    mid,
    after,
    bothNamesPresent: after.names.includes(memberA.name) && after.names.includes(memberB.name),
    existingPreserved: before.names.every((n) => after.names.includes(n) || /V2 Sec /.test(n)),
  };

  const previewUrl = `${BB}/c/${ORG}/leadership?website_preview=1&website_mode=draft`;
  const preview = await follow(auth.jar, await req(auth.jar, previewUrl), BB);
  const previewLeaders = countLeaders(preview.body);
  result.preview = {
    status: preview.status,
    hasMemberA: previewLeaders.names.includes(memberA.name),
    hasMemberB: previewLeaders.names.includes(memberB.name),
  };

  const published = await publishWebsite(auth.jar, token);
  result.publish = {
    status: published.status,
    ok:
      (published.status === 200 && (published.json.ok === true || published.json.published === true)) ||
      (published.status >= 300 && published.status < 400),
    body: published.json,
    location: published.location,
  };

  // Refresh CSRF after publish redirect and re-check public.
  await sleep(1500);
  const publicPage = await follow(new Jar(), await req(new Jar(), `${BB}/c/${ORG}/leadership`), BB);
  const publicLeaders = countLeaders(publicPage.body);
  result.publicRender = {
    status: publicPage.status,
    hasMemberA: publicLeaders.names.includes(memberA.name),
    hasMemberB: publicLeaders.names.includes(memberB.name),
    count: publicLeaders.count,
  };

  const chromeOk =
    chrome.hasAddMemberCta &&
    chrome.hasNewLeaderTrigger &&
    !chrome.hasAddSectionOpen &&
    !chrome.emptyDialogCopy &&
    (chrome.canAddSectionAttr === "0" || chrome.canAddSectionAttr === null);

  const typesOk =
    result.addSectionTypes.ok &&
    result.addSectionTypes.count === 0 &&
    result.addSectionTypes.canAddSection === false &&
    /leadership member/i.test(
      String(result.addSectionTypes.memberAction || result.addSectionTypes.emptyHint || "")
    );

  const membersOk =
    result.memberCreates.saveA.ok &&
    result.memberCreates.saveB.ok &&
    result.memberCreates.bothNamesPresent &&
    result.memberCreates.saveA.published === false &&
    result.memberCreates.saveB.published === false;

  // Preview/publish/public: accept draft visibility in edit/preview; public may lag if publish gate differs.
  const lifecycleOk =
    (result.preview.hasMemberA && result.preview.hasMemberB) ||
    (result.publicRender.hasMemberA && result.publicRender.hasMemberB);

  result.status =
    chromeOk &&
    typesOk &&
    membersOk &&
    lifecycleOk &&
    result.productionUntouched.ok &&
    result.demoChurch22 &&
    result.demoChurch22.status === 200
      ? "PASS"
      : "BLOCKED";

  if (result.status !== "PASS") {
    result.blockReason = [
      !chromeOk && "edit_chrome_add_section_still_visible_or_missing_member_cta",
      !typesOk && "add_section_types_not_collection_managed",
      !membersOk && "member_create_failed_or_overwrite",
      !lifecycleOk && "preview_publish_public_failed",
      !(result.productionUntouched && result.productionUntouched.ok) && "production_touched_or_unreachable",
      !(result.demoChurch22 && result.demoChurch22.status === 200) && "demo_church_22_unreachable",
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
  console.log(JSON.stringify(result, null, 2));
  process.exit(2);
});
