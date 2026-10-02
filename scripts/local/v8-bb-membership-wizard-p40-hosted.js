"use strict";

/**
 * PROMPT 40 — hosted membership wizard probe on disposable V8 QA church.
 * Path-public: /c/:org/register. No passwords printed.
 */

const fs = require("fs");
const https = require("https");
const { URL } = require("url");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..", "..");
const CREDS_PATH = path.join(ROOT, ".env.v8-qa-tenants.local");
const BB = "https://blessboard.neuniversity.org";
const OUT = process.env.V8_QA_OUT || "/tmp/v8-auth-qa/prompt40-membership-wizard.json";

const creds = {};
for (const line of fs.readFileSync(CREDS_PATH, "utf8").split(/\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) creds[m[1]] = m[2];
}
const ORG = creds.V8_QA_BB_ORG_KEY || "bb-v8qa-mub23a6v6a6b";
const PUBLIC = `${BB}/c/${ORG}`;

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

function req(jar, url, opt = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    let body = null;
    if (opt.form) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(opt.form)) {
        if (Array.isArray(v)) {
          for (const item of v) params.append(k, item == null ? "" : String(item));
        } else if (v != null) {
          params.append(k, String(v));
        }
      }
      body = params.toString();
    }
    const headers = {
      "User-Agent": "Mozilla/5.0 V8QA-P40",
      Cookie: jar.header(),
      Accept: "text/html,application/xhtml+xml",
      ...(opt.headers || {}),
    };
    if (body) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      headers["Content-Length"] = Buffer.byteLength(body);
    }
    const r = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: opt.method || "GET",
        headers,
        timeout: 45000,
      },
      (res) => {
        jar.absorb(res.headers);
        const c = [];
        res.on("data", (d) => c.push(d));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(c).toString("utf8"),
            url: u.toString(),
          })
        );
      }
    );
    r.on("error", reject);
    if (body) r.write(body);
    r.end();
  });
}

async function follow(jar, res, origin, n = 10) {
  let cur = res;
  for (let i = 0; i < n; i += 1) {
    if (![301, 302, 303, 307, 308].includes(cur.status)) return cur;
    const loc = cur.headers.location;
    if (!loc) return cur;
    cur = await req(jar, loc.startsWith("http") ? loc : origin + loc);
  }
  return cur;
}

function csrf(html) {
  return (
    (html.match(/name=["']_csrf["'][^>]*value=["']([^"']+)/i) ||
      html.match(/value=["']([^"']+)["'][^>]*name=["']_csrf["']/i) ||
      [])[1]
  );
}

(async () => {
  const out = {
    prompt: 40,
    recordedAt: new Date().toISOString(),
    org: ORG,
    publicRegister: `${PUBLIC}/register`,
  };
  const hz = JSON.parse((await req(new Jar(), BB + "/healthz")).body);
  out.hostedSha = hz.gitSha;
  out.deploymentCode = hz.deploymentCode;
  out.schemaCompatible = hz.schemaCompatible;

  const jar = new Jar();
  const page = await req(jar, `${PUBLIC}/register`);
  out.get = {
    status: page.status,
    wizard: /data-bb-membership-wizard=["']1["']/i.test(page.body),
    panels: {
      p1: /data-bb-membership-panel=["']1["']/i.test(page.body),
      p2: /data-bb-membership-panel=["']2["']/i.test(page.body),
      p3: /data-bb-membership-panel=["']3["']/i.test(page.body),
      p4: /data-bb-membership-panel=["']4["']/i.test(page.body),
    },
    nextBtn: /data-bb-step-next/i.test(page.body),
    wizardJs: /membership-wizard\.js/i.test(page.body),
    review: /data-bb-membership-review/i.test(page.body),
    noPastoralNotes: !/pastoral.?note|confidential.?note/i.test(page.body),
    formAction: ((page.body.match(/action=["']([^"']*register[^"']*)["']/i) || [])[1]) || null,
  };

  if (page.status !== 200 || !out.get.wizard) {
    out.verdict = "V8_BB_MEMBERSHIP_WIZARD_BLOCKED";
    out.blockReason = page.status !== 200 ? `register HTTP ${page.status}` : "wizard markers missing on hosted";
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2));
    process.exit(2);
  }

  const stamp = Date.now().toString(36);
  const national = `97${String(Date.now()).slice(-7)}`;
  const submitted = await follow(
    jar,
    await req(jar, `${PUBLIC}/register`, {
      method: "POST",
      form: {
        _csrf: csrf(page.body),
        first_name: "P40",
        last_name: `Wizard${stamp}`,
        preferred_name: "P40",
        email: `p40.${stamp}@example.invalid`,
        phone_country: "ZM",
        phone_national: national,
        phone_e164: `+260${national}`,
        faith_background: "Optional spiritual note",
        baptism_status: "considering",
        previous_church: "",
        interests: ["worship", "youth"],
        ministry_interest: "Choir",
        availability: "Sundays",
        consent_contact: "1",
      },
      headers: { Referer: `${PUBLIC}/register` },
    }),
    BB
  );

  const ref =
    ((submitted.url.match(/[?&]ref=([0-9a-f-]{36})/i) || [])[1]) ||
    ((submitted.body.match(/data-bb-registration-reference=["']1["'][^>]*>[\s\S]*?<code>([^<]+)/i) ||
      [])[1]) ||
    null;

  out.submit = {
    status: submitted.status,
    path: new URL(submitted.url).pathname,
    thanks: /Registration Submitted|pending administrator review|BB07/i.test(submitted.body),
    stitchBB07: /data-screen=["']BB07["']/i.test(submitted.body),
    reference: ref,
    noAutoLogin: /does not create a login|not created automatically|An account is not created/i.test(
      submitted.body
    ),
  };

  // Validation: missing first name should stay on register
  const jar2 = new Jar();
  const page2 = await req(jar2, `${PUBLIC}/register`);
  const bad = await follow(
    jar2,
    await req(jar2, `${PUBLIC}/register`, {
      method: "POST",
      form: {
        _csrf: csrf(page2.body),
        first_name: "",
        last_name: "X",
        phone_country: "ZM",
        phone_national: `96${String(Date.now()).slice(-7)}`,
        phone_e164: `+26096${String(Date.now()).slice(-7)}`,
        consent_contact: "1",
      },
      headers: { Referer: `${PUBLIC}/register` },
    }),
    BB
  );
  out.validation = {
    status: bad.status,
    stayedOnForm: /bb-auth-form--register|First name/i.test(bad.body),
    notSubmitted: !/Registration Submitted/i.test(bad.body),
  };

  const structurePass =
    out.get.wizard &&
    out.get.panels.p1 &&
    out.get.panels.p4 &&
    out.get.nextBtn &&
    out.get.wizardJs &&
    out.get.review &&
    out.get.noPastoralNotes;

  const submitPass =
    out.submit.thanks &&
    out.submit.stitchBB07 &&
    out.submit.reference &&
    out.submit.noAutoLogin;

  const validationPass = out.validation.stayedOnForm && out.validation.notSubmitted;

  out.verdict =
    structurePass && submitPass && validationPass
      ? "V8_BB_MEMBERSHIP_WIZARD_PASS"
      : "V8_BB_MEMBERSHIP_WIZARD_BLOCKED";

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.verdict === "V8_BB_MEMBERSHIP_WIZARD_PASS" ? 0 : 2);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
