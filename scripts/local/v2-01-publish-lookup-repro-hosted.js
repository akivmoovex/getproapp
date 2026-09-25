"use strict";

/**
 * V2.01 publish/lookup root-cause investigation — hosted reproduction (testing only).
 * Disposable V8 QA tenants. No production. No speculative fixes.
 */

const fs = require("fs");
const https = require("https");
const { URL } = require("url");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..", "..");
const CREDS_PATH = path.join(ROOT, ".env.v8-qa-tenants.local");
const BB = process.env.V2_BB_HOSTED_BASE || "https://blessboard.neuniversity.org";
const AC = process.env.V2_AC_HOSTED_BASE || "https://activeclinic.neuniversity.org";
const OUT = process.env.V2_PUB_LOOKUP_OUT || "/tmp/v2-01-publish-lookup-repro.json";

const creds = {};
for (const line of fs.readFileSync(CREDS_PATH, "utf8").split(/\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) creds[m[1]] = m[2];
}

const BB_ORG = creds.V8_QA_BB_ORG_KEY;
const AC_ORG = creds.V8_QA_AC_ORG_KEY;

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
      "User-Agent": "Mozilla/5.0 V201PublishLookupQA",
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
        timeout: 120000,
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
            requestId: res.headers["x-request-id"] || res.headers["x-correlation-id"] || null,
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

function parseJson(body) {
  try {
    return JSON.parse(body || "{}");
  } catch (_e) {
    return { _parseError: true, snippet: String(body || "").slice(0, 400) };
  }
}

function stamp(tag) {
  return `PUB${tag}-${Date.now().toString(36)}-${crypto.randomBytes(2).toString("hex")}`;
}

function classifyPublish(res, json) {
  const text = `${res.body || ""} ${JSON.stringify(json || {})} ${res.location || ""}`;
  const lookup =
    /lookup_error|lookup error|Readiness check unavailable|could not load website readiness/i.test(
      text
    );
  return {
    httpStatus: res.status,
    location: res.location || null,
    requestId: res.requestId,
    ok: Boolean(json && json.ok === true) || /notice=published|published successfully/i.test(text),
    code: (json && (json.code || json.reason || json.status)) || null,
    lookupErrorSignal: lookup,
    message: (json && (json.message || json.error)) || null,
    bodySnippet: String(res.body || "").slice(0, 500),
  };
}

async function bbLogin() {
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
  return { jar, ok: /\/hq|website_edit|Welcome|Dashboard|Organisation/i.test(posted.body) || posted.status === 200, url: posted.url };
}

async function acLogin() {
  const jar = new Jar();
  const page = await req(jar, `${AC}/login`);
  const posted = await follow(
    jar,
    await req(jar, `${AC}/login`, {
      method: "POST",
      form: {
        _csrf: csrf(page.body),
        email: creds.V8_QA_AC_ADMIN_EMAIL,
        password: creds.V8_QA_AC_PASSWORD,
      },
      headers: { Referer: `${AC}/login` },
    }),
    AC
  );
  return { jar, ok: posted.status === 200, url: posted.url };
}

async function bbSaveDraft(jar, token, referer, contentKey, value) {
  const res = await req(jar, `${BB}/c/${BB_ORG}/website/drafts`, {
    method: "POST",
    accept: "application/json",
    headers: { "X-CSRF-Token": token, Referer: referer },
    json: { contentKey, value },
  });
  return { status: res.status, requestId: res.requestId, json: parseJson(res.body) };
}

async function bbPublish(jar, token, referer) {
  const res = await req(jar, `${BB}/c/${BB_ORG}/website/publish`, {
    method: "POST",
    accept: "application/json",
    headers: { "X-CSRF-Token": token, Referer: referer },
    json: { confirmPublish: "1" },
  });
  return classifyPublish(res, parseJson(res.body));
}

async function bbDraftChangesPublish(jar, token) {
  const review = await follow(jar, await req(jar, `${BB}/hq/content/draft-changes`), BB);
  const t = csrf(review.body) || token;
  const res = await req(jar, `${BB}/hq/content/draft-changes/publish`, {
    method: "POST",
    form: {
      _csrf: t,
      confirm_publish: "1",
      acknowledge_public: "1",
    },
    headers: { Referer: `${BB}/hq/content/draft-changes` },
  });
  const followed = await follow(jar, res, BB);
  return {
    ...classifyPublish(followed, parseJson(followed.body)),
    reviewStatus: review.status,
    redirectLocation: res.location || null,
    htmlHasLookup: /lookup.?error|Readiness check unavailable/i.test(followed.body),
    htmlHasPublishFailed: /could not publish|Publication failed/i.test(followed.body),
    htmlHasPublished: /published successfully|notice=published/i.test(
      `${followed.body} ${res.location || ""}`
    ),
  };
}

async function acSaveDraft(jar, token, clinicKey, contentKey, value) {
  const res = await req(jar, `${AC}/clinics/${clinicKey}/website/drafts`, {
    method: "POST",
    accept: "application/json",
    headers: { "X-CSRF-Token": token, Referer: `${AC}/clinics/${clinicKey}?website_edit=1` },
    json: { contentKey, value, _csrf: token },
  });
  return { status: res.status, requestId: res.requestId, json: parseJson(res.body) };
}

async function acPublish(jar, token, clinicKey) {
  const res = await req(jar, `${AC}/clinics/${clinicKey}/website/publish`, {
    method: "POST",
    accept: "application/json",
    headers: {
      "X-CSRF-Token": token,
      Referer: `${AC}/app/settings/website/publish`,
    },
    form: { _csrf: token, confirmPublish: "1" },
  });
  // may be redirect
  const followed = await follow(jar, res, AC);
  return {
    ...classifyPublish(followed, parseJson(followed.body)),
    redirectLocation: res.location || null,
  };
}

async function main() {
  const report = {
    task: "V2_01_PUBLISH_LOOKUP_ROOT_CAUSE",
    startedAt: new Date().toISOString(),
    bbOrg: BB_ORG,
    acOrg: AC_ORG,
    scenarios: {},
  };

  const hzBb = parseJson((await req(new Jar(), `${BB}/healthz`, { accept: "application/json" })).body);
  const hzAc = parseJson((await req(new Jar(), `${AC}/healthz`, { accept: "application/json" })).body);
  report.hosted = {
    bb: { gitSha: hzBb.gitSha, deploymentCode: hzBb.deploymentCode, environment: hzBb.environment },
    ac: { gitSha: hzAc.gitSha, deploymentCode: hzAc.deploymentCode, environment: hzAc.environment },
  };

  const bbAuth = await bbLogin();
  report.bbLogin = { ok: bbAuth.ok, url: bbAuth.url };
  if (!bbAuth.ok) {
    report.verdict = "LOGIN_BLOCKED";
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  // --- PUB-01 multiple text edits one page (Contact) ---
  {
    const referer = `${BB}/c/${BB_ORG}/contact?website_edit=1&website_mode=draft`;
    const page = await follow(bbAuth.jar, await req(bbAuth.jar, referer), BB);
    const token = csrf(page.body);
    const a = stamp("01a");
    const b = stamp("01b");
    const c = stamp("01c");
    const s1 = await bbSaveDraft(bbAuth.jar, token, referer, "contact.office_hours.bodyText", `Hours ${a}`);
    const s2 = await bbSaveDraft(bbAuth.jar, token, referer, "contact.hero.title", `Hero ${b}`);
    const s3 = await bbSaveDraft(bbAuth.jar, token, referer, "contact.intro.bodyText", `Intro ${c}`);
    const pub = await bbPublish(bbAuth.jar, token, referer);
    const publicPage = await follow(new Jar(), await req(new Jar(), `${BB}/c/${BB_ORG}/contact`), BB);
    report.scenarios["PUB-01"] = {
      product: "BlessBoard",
      description: "multiple text edits on one page then publish",
      saves: [s1, s2, s3],
      publish: pub,
      publicHasMarkers: {
        a: publicPage.body.includes(a),
        b: publicPage.body.includes(b),
        c: publicPage.body.includes(c),
      },
      expected: "publish ok; all markers live",
      actual: pub.ok ? "publish_ok" : `publish_fail code=${pub.code} lookup=${pub.lookupErrorSignal}`,
    };
  }

  // --- PUB-03 mixed: text + then draft-changes publish path ---
  {
    const aboutRef = `${BB}/c/${BB_ORG}/about?website_edit=1&website_mode=draft`;
    const about = await follow(bbAuth.jar, await req(bbAuth.jar, aboutRef), BB);
    const token = csrf(about.body);
    const t1 = stamp("03t");
    const s1 = await bbSaveDraft(bbAuth.jar, token, aboutRef, "about.hero.title", `About ${t1}`);
    const homeRef = `${BB}/c/${BB_ORG}/?website_edit=1&website_mode=draft`;
    const home = await follow(bbAuth.jar, await req(bbAuth.jar, homeRef), BB);
    const token2 = csrf(home.body) || token;
    const t2 = stamp("03h");
    const s2 = await bbSaveDraft(bbAuth.jar, token2, homeRef, "home.hero.title", `Home ${t2}`);
    const batch = await bbDraftChangesPublish(bbAuth.jar, token2);
    report.scenarios["PUB-03"] = {
      product: "BlessBoard",
      description: "mixed text across pages via draft-changes/publish",
      saves: [s1, s2],
      publish: batch,
      expected: "batch publish ok or explicit not_ready (not opaque lookup)",
      actual: batch.htmlHasPublished
        ? "published"
        : batch.htmlHasLookup || batch.lookupErrorSignal
          ? "LOOKUP_ERROR_SIGNAL"
          : batch.htmlHasPublishFailed
            ? "publish_failed_ui"
            : `status=${batch.httpStatus} loc=${batch.redirectLocation}`,
    };
  }

  // --- PUB-04 already covered partially by PUB-03; mark ---
  report.scenarios["PUB-04"] = {
    product: "BlessBoard",
    description: "edits across pages",
    note: "Executed as part of PUB-03 (about + home).",
    resultRef: "PUB-03",
  };

  // --- PUB-07 retry after failure: attempt publish with no confirm via API if available ---
  {
    const referer = `${BB}/c/${BB_ORG}/contact?website_edit=1&website_mode=draft`;
    const page = await follow(bbAuth.jar, await req(bbAuth.jar, referer), BB);
    const token = csrf(page.body);
    const marker = stamp("07");
    await bbSaveDraft(bbAuth.jar, token, referer, "contact.office_hours.bodyText", `Retry ${marker}`);
    // First attempt: empty confirm body (may still succeed on editor path)
    const first = await req(bbAuth.jar, `${BB}/c/${BB_ORG}/website/publish`, {
      method: "POST",
      accept: "application/json",
      headers: { "X-CSRF-Token": token, Referer: referer },
      json: {},
    });
    const firstJson = parseJson(first.body);
    const firstClass = classifyPublish(first, firstJson);
    let second = null;
    if (!firstClass.ok) {
      second = await bbPublish(bbAuth.jar, token, referer);
    } else {
      second = { skipped: true, reason: "first_attempt_succeeded" };
    }
    report.scenarios["PUB-07"] = {
      product: "BlessBoard",
      description: "retry after failure",
      first: firstClass,
      second,
      expected: "if first fails, second with confirm succeeds; drafts preserved",
      actual: firstClass.ok
        ? "first_ok"
        : second && second.ok
          ? "retry_ok"
          : `first_fail/${second && second.code}`,
    };
  }

  // --- ActiveClinic multi text ---
  const acAuth = await acLogin();
  report.acLogin = { ok: acAuth.ok, url: acAuth.url };
  if (acAuth.ok) {
    const clinicKey = AC_ORG;
    const edit = await follow(
      acAuth.jar,
      await req(acAuth.jar, `${AC}/clinics/${clinicKey}?website_edit=1`),
      AC
    );
    const token = csrf(edit.body);
    const a = stamp("A01");
    const b = stamp("A02");
    const s1 = await acSaveDraft(acAuth.jar, token, clinicKey, "home.hero.title", `AC Home ${a}`);
    const s2 = await acSaveDraft(acAuth.jar, token, clinicKey, "home.hero.subtitle", `AC Sub ${b}`);
    const pub = await acPublish(acAuth.jar, token, clinicKey);
    report.scenarios["PUB-01-AC"] = {
      product: "ActiveClinic",
      description: "multiple text drafts then publish",
      saves: [s1, s2],
      publish: pub,
      expected: "publish ok with explicit code (never lookup_error)",
      actual: pub.lookupErrorSignal
        ? "LOOKUP_ERROR_SIGNAL"
        : pub.ok
          ? "publish_ok"
          : `fail code=${pub.code} status=${pub.httpStatus}`,
    };
  } else {
    report.scenarios["PUB-01-AC"] = { status: "NOT_TESTED", reason: "ac_login_failed" };
  }

  // Scenarios requiring media upload / concurrent sessions
  report.scenarios["PUB-02"] = {
    status: "NOT_TESTED",
    reason: "image multi-edit deferred; covered by prior V2 image hosted PASS scripts",
  };
  report.scenarios["PUB-05"] = {
    status: "NOT_TESTED",
    reason: "dynamic item multi-edit deferred to structured-draft path in follow-up if needed",
  };
  report.scenarios["PUB-06"] = {
    status: "NOT_TESTED",
    reason: "concurrent admins require two sessions; not automated in this pass",
  };
  report.scenarios["PUB-08"] = {
    status: "NOT_TESTED",
    reason: "new media upload then publish covered by V2 shared media hosted scripts",
  };

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
