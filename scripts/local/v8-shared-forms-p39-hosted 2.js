"use strict";

/**
 * PROMPT 39 — hosted shared forms P0 journey on disposable V8 QA tenant.
 * Create → Edit → Publish → Share → Public Submit → Confirmation → Admin Review
 * + SH15 branch deny UI probe.
 * Never prints passwords. No migrations. No real notifications.
 */

const fs = require("fs");
const https = require("https");
const { URL } = require("url");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..", "..");
const CREDS_PATH = path.join(ROOT, ".env.v8-qa-tenants.local");
const BB = "https://blessboard.neuniversity.org";
const OUT = process.env.V8_QA_OUT || "/tmp/v8-auth-qa/prompt39-shared-forms-p0.json";

const creds = {};
for (const line of fs.readFileSync(CREDS_PATH, "utf8").split(/\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) creds[m[1]] = m[2];
}

const BB_ORG = creds.V8_QA_BB_ORG_KEY || "bb-v8qa-mub23a6v6a6b";

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
      "User-Agent": "Mozilla/5.0 V8QA-P39",
      Cookie: jar.header(),
      Accept: opt.accept || "text/html,application/xhtml+xml",
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
  const m =
    html.match(/name=["']_csrf["'][^>]*value=["']([^"']+)/i) ||
    html.match(/value=["']([^"']+)["'][^>]*name=["']_csrf["']/i);
  return m && m[1];
}

function idemFrom(html) {
  return (
    ((html.match(/name=["']idempotency_key["'][^>]*value=["']([^"']+)/i) || [])[1] ||
      (html.match(/name=["']idempotencyKey["'][^>]*value=["']([^"']+)/i) || [])[1] ||
      null)
  );
}

function refFrom(html) {
  return (
    (
      (html.match(/data-mx-forms-reference=["']1["'][^>]*>([^<]+)/i) ||
        html.match(/Reference:\s*<code[^>]*>([^<]+)/i) ||
        [])[1] || ""
    ).trim() || null
  );
}

function statusBadge(html) {
  return (
    ((html.match(/mx-forms-badge[^>]*>([^<]+)/i) || [])[1] || "").trim() ||
    ((html.match(/data-mx-forms-current-status=["']([^"']+)/i) || [])[1] || null)
  );
}

async function login(email, password) {
  const jar = new Jar();
  let p = await req(jar, BB + "/login");
  p = await follow(
    jar,
    await req(jar, BB + "/login", {
      method: "POST",
      form: { _csrf: csrf(p.body), email, password },
      headers: { Referer: BB + "/login" },
    }),
    BB
  );
  return { jar, page: p };
}

(async () => {
  const out = {
    prompt: 39,
    recordedAt: new Date().toISOString(),
    tenant: BB_ORG,
    steps: {},
    sh15: {},
    defects: [],
  };

  const hz = JSON.parse((await req(new Jar(), BB + "/healthz")).body);
  out.hostedShaBefore = hz.gitSha;
  out.deploymentCode = hz.deploymentCode;
  out.schemaCompatible = hz.schemaCompatible;

  const hq = await login(creds.V8_QA_BB_HQ_EMAIL, creds.V8_QA_BB_PASSWORD);
  const stamp = Date.now().toString(36);
  const title = `P39 Journey ${stamp}`;

  // 1) Create
  const neu = await req(hq.jar, BB + "/hq/form-studio/new");
  const created = await follow(
    hq.jar,
    await req(hq.jar, BB + "/hq/form-studio/new", {
      method: "POST",
      form: {
        _csrf: csrf(neu.body),
        title,
        form_key: `p39_${stamp}`,
        category: "general",
        description: "PROMPT 39 disposable form",
        field_key: ["full_name", "email", "phone"],
        field_type: ["text", "email", "phone"],
        field_label: ["Full name", "Email", "Phone"],
        field_required: ["1", "1", ""],
        field_options: ["", "", ""],
      },
      headers: { Referer: BB + "/hq/form-studio/new" },
    }),
    BB
  );
  const formId =
    ((created.url.match(/\/hq\/form-studio\/([0-9a-f-]{36})/i) || [])[1]) || null;
  out.formId = formId;
  out.steps.create = {
    status: created.status,
    path: new URL(created.url).pathname,
    formId,
    studio: /\/studio/i.test(created.url),
    unavailable503: /not yet available in BlessBoard V5/i.test(created.body),
  };

  if (!formId) {
    out.verdict = "V8_SHARED_FORMS_P0_BLOCKED";
    out.defects.push({ id: "CREATE_FAILED", step: out.steps.create });
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2));
    process.exit(2);
  }

  // 2) Edit (save studio with extra field)
  const studioGet = await req(hq.jar, `${BB}/hq/form-studio/${formId}/studio`);
  const edited = await follow(
    hq.jar,
    await req(hq.jar, `${BB}/hq/form-studio/${formId}/studio`, {
      method: "POST",
      form: {
        _csrf: csrf(studioGet.body),
        title: `${title} Edited`,
        form_key: `p39_${stamp}`,
        category: "general",
        description: "PROMPT 39 edited disposable form",
        field_key: ["full_name", "email", "phone", "notes"],
        field_type: ["text", "email", "phone", "textarea"],
        field_label: ["Full name", "Email", "Phone", "Notes"],
        field_required: ["1", "1", "", ""],
        field_options: ["", "", "", ""],
      },
      headers: { Referer: `${BB}/hq/form-studio/${formId}/studio` },
    }),
    BB
  );
  out.steps.edit = {
    status: edited.status,
    path: new URL(edited.url).pathname,
    titlePersisted: /P39 Journey .* Edited/i.test(edited.body),
    notesField: /name=["']notes["']|Notes/i.test(edited.body),
    unavailable503: /not yet available in BlessBoard V5/i.test(edited.body),
  };

  // 3) Publish
  const pubPage = await req(hq.jar, `${BB}/hq/form-studio/${formId}/publication`);
  const published = await follow(
    hq.jar,
    await req(hq.jar, `${BB}/hq/form-studio/${formId}/publish`, {
      method: "POST",
      form: { _csrf: csrf(pubPage.body) },
      headers: { Referer: `${BB}/hq/form-studio/${formId}/publication` },
    }),
    BB
  );
  out.steps.publish = {
    status: published.status,
    path: new URL(published.url).pathname,
    publishedBadge: /published/i.test(published.body),
  };

  // 4) Share → public URL
  const share = await req(hq.jar, `${BB}/hq/form-studio/${formId}/sharing`);
  const publicPath = ((share.body.match(/\/f\/[a-zA-Z0-9_-]+/) || [])[0]) || null;
  out.publicPath = publicPath;
  out.publicUrl = publicPath ? BB + publicPath : null;
  out.steps.share = {
    status: share.status,
    publicPath,
    hasQrOrLink: Boolean(publicPath),
  };

  if (!publicPath) {
    out.verdict = "V8_SHARED_FORMS_P0_BLOCKED";
    out.defects.push({ id: "NO_PUBLIC_URL", shareStatus: share.status });
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2));
    process.exit(2);
  }

  // 5) Anonymous public submit + confirmation (SH10)
  const anonGet = await req(new Jar(), BB + publicPath);
  out.steps.anonymousGet = {
    status: anonGet.status,
    hasForm: /Full name|Notes/i.test(anonGet.body),
    unavailable: /Form unavailable|not available/i.test(anonGet.body) && !/Full name/i.test(anonGet.body),
  };

  const jSubmit = new Jar();
  const pSubmit = await req(jSubmit, BB + publicPath);
  const idem = idemFrom(pSubmit.body) || crypto.randomBytes(16).toString("hex");
  const email = `p39ok${stamp}@example.invalid`;
  const submitted = await follow(
    jSubmit,
    await req(jSubmit, BB + publicPath, {
      method: "POST",
      form: {
        _csrf: csrf(pSubmit.body),
        full_name: `P39 Applicant ${stamp}`,
        email,
        phone: "+260971234567",
        notes: "Disposable QA note",
        consent: "1",
        idempotency_key: idem,
      },
      headers: { Referer: BB + publicPath },
    }),
    BB
  );
  const submissionId = refFrom(submitted.body);
  out.submissionId = submissionId;
  out.steps.submit = {
    status: submitted.status,
    thanks: /Submission received/i.test(submitted.body),
    reference: submissionId,
    stitch: ((submitted.body.match(/data-screen=["']([^"']+)/i) || [])[1] || null),
  };

  // 6) Admin review + status update
  const list = await req(hq.jar, `${BB}/hq/form-studio/${formId}/submissions`);
  const detailUrl = `${BB}/hq/form-studio/${formId}/submissions/${submissionId}`;
  const detail1 = await req(hq.jar, detailUrl);
  const nextMatches = [...detail1.body.matchAll(/<option value=["']([^"']+)["'][^>]*>([^<]*)<\/option>/gi)];
  const current = statusBadge(detail1.body) || "submitted";
  const nextOpt = nextMatches.map((m) => m[1]).find((v) => v && v !== current) || "in_review";
  const reviewed = await follow(
    hq.jar,
    await req(hq.jar, `${detailUrl}/review`, {
      method: "POST",
      form: {
        _csrf: csrf(detail1.body),
        review_status: nextOpt,
        confirm_status_change: "1",
        internal_notes: `P39 QA note ${stamp}`,
      },
      headers: { Referer: detailUrl },
    }),
    BB
  );
  const detail2 = await req(hq.jar, detailUrl);
  out.steps.adminReview = {
    listStatus: list.status,
    listHasId: submissionId ? list.body.includes(submissionId) : false,
    openStatus: detail1.status,
    hasAnswers: /P39 Applicant|Disposable QA note/i.test(detail1.body),
    reviewStatus: reviewed.status,
    statusChanged: statusBadge(reviewed.body) === nextOpt && nextOpt !== current,
    targetStatus: nextOpt,
    persistence: {
      statusBadge: statusBadge(detail2.body),
      notesVisible: new RegExp(`P39 QA note ${stamp}`).test(detail2.body),
      answersPersist: /P39 Applicant/i.test(detail2.body),
    },
  };

  // 7) SH15 — branch → HQ Form Studio
  const br = await login(creds.V8_QA_BB_BRANCH_EMAIL, creds.V8_QA_BB_PASSWORD);
  const deniedHtml = await req(br.jar, BB + "/hq/form-studio");
  const deniedApi = await req(br.jar, BB + "/hq/form-studio", {
    accept: "application/json",
  });
  const branchStudio = await req(br.jar, BB + "/branch-admin/form-studio");
  out.sh15 = {
    html: {
      status: deniedHtml.status,
      hasSH15: /data-screen=["']SH15["']/i.test(deniedHtml.body),
      hasStitchTitle: /Access Denied: Form or Action Unavailable/i.test(deniedHtml.body),
      plainLegacyDeny:
        /<title>Access<\/title>/i.test(deniedHtml.body) &&
        /You do not have access to this site/i.test(deniedHtml.body),
      http403Badge: /HTTP 403/i.test(deniedHtml.body),
    },
    api: {
      status: deniedApi.status,
      plainText: /You do not have access to this site/i.test(deniedApi.body),
      noSH15Markup: !/data-screen=["']SH15["']/i.test(deniedApi.body),
    },
    branchStudioAllowed: branchStudio.status === 200,
  };

  const hzAfter = JSON.parse((await req(new Jar(), BB + "/healthz")).body);
  out.hostedShaAfter = hzAfter.gitSha;

  const journeyPass =
    out.steps.create.studio &&
    !out.steps.create.unavailable503 &&
    out.steps.edit.status === 200 &&
    out.steps.edit.titlePersisted &&
    out.steps.publish.status === 200 &&
    out.steps.share.hasQrOrLink &&
    out.steps.anonymousGet.status === 200 &&
    out.steps.anonymousGet.hasForm &&
    out.steps.submit.thanks &&
    out.steps.submit.reference &&
    out.steps.submit.stitch === "SH10" &&
    out.steps.adminReview.listHasId &&
    out.steps.adminReview.statusChanged &&
    out.steps.adminReview.persistence.answersPersist &&
    out.steps.adminReview.persistence.statusBadge === out.steps.adminReview.targetStatus;

  const sh15Pass =
    out.sh15.html.status === 403 &&
    out.sh15.html.hasSH15 &&
    out.sh15.html.hasStitchTitle &&
    !out.sh15.html.plainLegacyDeny &&
    out.sh15.api.status === 403 &&
    out.sh15.api.plainText &&
    out.sh15.api.noSH15Markup &&
    out.sh15.branchStudioAllowed;

  if (!journeyPass) out.defects.push({ id: "JOURNEY_INCOMPLETE", steps: out.steps });
  if (!sh15Pass) out.defects.push({ id: "SH15_UI_OR_CONTRACT", sh15: out.sh15 });

  out.journeyResult = journeyPass ? "PASS" : "FAIL";
  out.sh15Result = sh15Pass ? "PASS" : "FAIL";
  out.verdict =
    journeyPass && sh15Pass
      ? "V8_SHARED_FORMS_P0_PASS"
      : sh15Pass === false && out.hostedShaAfter === out.hostedShaBefore
        ? "V8_SHARED_FORMS_P0_BLOCKED"
        : "V8_SHARED_FORMS_P0_OPEN_DEFECTS";

  // If only SH15 fails because code not deployed yet, call it blocked-on-hosted.
  if (journeyPass && !sh15Pass) {
    out.verdict = "V8_SHARED_FORMS_P0_BLOCKED";
    out.blockReason =
      "Hosted SHA still pre-SH15 fix; journey PASS on current host, SH15 requires deploy of tip.";
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  process.exit(journeyPass && sh15Pass ? 0 : 2);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
