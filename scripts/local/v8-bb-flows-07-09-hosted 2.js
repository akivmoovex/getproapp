"use strict";

/**
 * PROMPT 36 — hosted Flow 07 (member edit/transfer) + Flow 09 (event/ministry).
 * Disposable V8 QA only. Seeds published event/ministry via testing DB for the QA church.
 */

const fs = require("fs");
const https = require("https");
const { URL } = require("url");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const CREDS_PATH = path.join(ROOT, ".env.v8-qa-tenants.local");
const BB = "https://blessboard.neuniversity.org";
const OUT = process.env.V8_QA_OUT || "/tmp/v8-auth-qa/prompt36-flows-07-09.json";

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

function encodeForm(form) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(form || {})) {
    if (Array.isArray(v)) v.forEach((x) => params.append(k, x == null ? "" : String(x)));
    else if (v != null) params.append(k, String(v));
  }
  return params.toString();
}

function req(jar, url, opt = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = opt.form ? encodeForm(opt.form) : null;
    const headers = {
      "User-Agent": "Mozilla/5.0 V8QA-P36",
      Cookie: jar.header(),
      Accept: "text/html",
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
        timeout: 60000,
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

async function follow(jar, res, origin, n = 12) {
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
  const m = html.match(/name=["']_csrf["'][^>]*value=["']([^"']+)/i);
  return m && m[1];
}

function idemFrom(html) {
  return ((html.match(/name=["']idempotency_key["'][^>]*value=["']([^"']+)/i) || [])[1]) || null;
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

function seedResources() {
  const script = `
const path=require("path");
const {Client}=require(path.join(${JSON.stringify(ROOT)},"node_modules/pg"));
(async()=>{
  const c=new Client({connectionString:process.env.DATABASE_URL});
  await c.connect();
  const org=await c.query("select id from platform.organizations where organization_key=$1",["${ORG}"]);
  const oid=org.rows[0].id;
  const ch=await c.query("select id from blessboard.churches where organization_id=$1",[oid]);
  const cid=ch.rows[0].id;
  const br=await c.query("select id, branch_key, is_primary from blessboard.branches where church_id=$1 order by is_primary desc, display_name",[cid]);
  const hq=br.rows.find(r=>r.is_primary)||br.rows[0];
  const campus=br.rows.find(r=>!r.is_primary)||br.rows[1];
  const stamp=Date.now().toString(36);
  const ev=await c.query(\`INSERT INTO blessboard.events (
      church_id, branch_id, title, summary, starts_at, ends_at, timezone, location, status, capacity
    ) VALUES ($1,$2,$3,'P36 disposable', NOW()+interval '14 days', NOW()+interval '14 days 2 hours',
      'Africa/Lusaka','Hall','published',40) RETURNING id\`,[cid,hq.id,'P36 Event '+stamp]);
  const mn=await c.query(\`INSERT INTO blessboard.ministries (
      church_id, branch_id, organization_id, name, summary, status, ministry_key, ministry_type, join_policy
    ) VALUES ($1,$2,$3,$4,'P36 disposable','published',$5,'other','request') RETURNING id\`,
    [cid,hq.id,oid,'P36 Ministry '+stamp,'p36m_'+stamp]);
  console.log(JSON.stringify({
    organizationId: oid,
    churchId: cid,
    hqBranchId: hq.id,
    campusBranchId: campus && campus.id,
    campusBranchKey: campus && campus.branch_key,
    eventId: ev.rows[0].id,
    ministryId: mn.rows[0].id
  }));
  await c.end();
})().catch(e=>{console.error(e);process.exit(1)});
`;
  const tmp = path.join(ROOT, "scripts/local/_v8-p36-seed-tmp.js");
  fs.writeFileSync(tmp, script);
  try {
    const run = spawnSync(
      path.join(ROOT, "scripts/local/run-with-blessboard-env.sh"),
      ["testing", "env", "PLATFORM_DEPLOYMENT_CODE=moovex-platform-v8-testing", "node", tmp],
      { cwd: ROOT, encoding: "utf8" }
    );
    if (run.status !== 0) {
      throw new Error(run.stderr || run.stdout || "seed failed");
    }
    const lines = String(run.stdout || "")
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const jsonLine = lines.reverse().find((l) => l.startsWith("{"));
    return JSON.parse(jsonLine);
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

(async () => {
  const out = {
    recordedAt: new Date().toISOString(),
    tenant: ORG,
    flow07: {},
    flow09: {},
    defects: [],
  };
  out.sha = JSON.parse((await req(new Jar(), BB + "/healthz")).body).gitSha;
  out.resources = seedResources();

  const hq = await login(creds.V8_QA_BB_HQ_EMAIL, creds.V8_QA_BB_PASSWORD);
  const br = await login(creds.V8_QA_BB_BRANCH_EMAIL, creds.V8_QA_BB_PASSWORD);
  const stamp = Date.now().toString(36);

  // —— Publish activity forms ——
  {
    const page = await req(hq.jar, BB + "/hq/activity-forms");
    const eventPub = await follow(
      hq.jar,
      await req(hq.jar, BB + "/hq/activity-forms", {
        method: "POST",
        form: {
          _csrf: csrf(page.body),
          kind: "event",
          event_id: out.resources.eventId,
          title: `P36 Event Reg ${stamp}`,
        },
        headers: { Referer: BB + "/hq/activity-forms" },
      }),
      BB
    );
    const ministryPage = await req(hq.jar, BB + "/hq/activity-forms");
    const ministryPub = await follow(
      hq.jar,
      await req(hq.jar, BB + "/hq/activity-forms", {
        method: "POST",
        form: {
          _csrf: csrf(ministryPage.body),
          kind: "ministry",
          ministry_id: out.resources.ministryId,
          title: `P36 Ministry Reg ${stamp}`,
        },
        headers: { Referer: BB + "/hq/activity-forms" },
      }),
      BB
    );
    out.flow09.publish = {
      eventStatus: eventPub.status,
      eventPath: new URL(eventPub.url).pathname + new URL(eventPub.url).search,
      eventFormId: ((eventPub.url.match(/published=([0-9a-f-]{36})/i) || [])[1]) || null,
      ministryStatus: ministryPub.status,
      ministryFormId: ((ministryPub.url.match(/published=([0-9a-f-]{36})/i) || [])[1]) || null,
    };
  }

  // —— FLOW 09 event ——
  {
    const regUrl = `${PUBLIC}/events/${out.resources.eventId}/register`;
    const get = await req(new Jar(), regUrl);
    out.flow09.eventGet = {
      status: get.status,
      path: new URL(get.url).pathname,
      unavailable503: /not yet available in BlessBoard V5/i.test(get.body),
      hasForm: /Full name|P36 Event/i.test(get.body),
      formAction: ((get.body.match(/action=["']([^"']+)["']/i) || [])[1]) || null,
    };

    // validation: missing required
    const jBad = new Jar();
    const pBad = await req(jBad, regUrl);
    const missing = await follow(
      jBad,
      await req(jBad, regUrl, {
        method: "POST",
        form: {
          _csrf: csrf(pBad.body),
          email: `p36miss${stamp}@example.invalid`,
          consent: "1",
          idempotency_key: idemFrom(pBad.body) || crypto.randomBytes(12).toString("hex"),
        },
        headers: { Referer: regUrl },
      }),
      BB
    );
    out.flow09.eventValidation = {
      status: missing.status,
      thanks: /Thank you|registration was received/i.test(missing.body),
      error: /check the form|required|Consent/i.test(missing.body) || missing.status >= 400,
    };

    const jOk = new Jar();
    const pOk = await req(jOk, regUrl);
    const ok = await follow(
      jOk,
      await req(jOk, regUrl, {
        method: "POST",
        form: {
          _csrf: csrf(pOk.body),
          full_name: `P36 Event Goer ${stamp}`,
          email: `p36event${stamp}@example.invalid`,
          phone: "+260971111111",
          guests: "2",
          consent: "1",
          idempotency_key: idemFrom(pOk.body) || crypto.randomBytes(12).toString("hex"),
        },
        headers: { Referer: regUrl },
      }),
      BB
    );
    out.flow09.eventSubmit = {
      status: ok.status,
      thanks: /Thank you|registration was received/i.test(ok.body),
      path: new URL(ok.url).pathname,
    };

    // ministry
    const minUrl = `${PUBLIC}/ministries/${out.resources.ministryId}/register`;
    const mGet = await req(new Jar(), minUrl);
    const jMin = new Jar();
    const pMin = await req(jMin, minUrl);
    const mOk = await follow(
      jMin,
      await req(jMin, minUrl, {
        method: "POST",
        form: {
          _csrf: csrf(pMin.body),
          full_name: `P36 Minister ${stamp}`,
          email: `p36min${stamp}@example.invalid`,
          interest: "Serve on welcome team",
          consent: "1",
          idempotency_key: idemFrom(pMin.body) || crypto.randomBytes(12).toString("hex"),
        },
        headers: { Referer: minUrl },
      }),
      BB
    );
    out.flow09.ministry = {
      getStatus: mGet.status,
      get503: /not yet available in BlessBoard V5/i.test(mGet.body),
      submitStatus: mOk.status,
      thanks: /Thank you|registration was received/i.test(mOk.body),
      noRole: /does not grant|No ministry leadership/i.test(mOk.body),
    };

    // Review via Form Studio submissions if we have form id
    const formId = out.flow09.publish.eventFormId;
    if (formId) {
      const list = await req(hq.jar, `${BB}/hq/form-studio/${formId}/submissions`);
      const subId = ((list.body.match(/\/submissions\/([0-9a-f-]{36})/i) || [])[1]) || null;
      out.flow09.reviewList = {
        status: list.status,
        submissionId: subId,
        hasApplicant: /P36 Event Goer|p36event/i.test(list.body),
      };
      if (subId) {
        const detail = await req(hq.jar, `${BB}/hq/form-studio/${formId}/submissions/${subId}`);
        const reviewed = await follow(
          hq.jar,
          await req(hq.jar, `${BB}/hq/form-studio/${formId}/submissions/${subId}/review`, {
            method: "POST",
            form: {
              _csrf: csrf(detail.body),
              review_status: "in_review",
              confirm_status_change: "1",
              internal_notes: `P36 event review ${stamp}`,
            },
            headers: { Referer: `${BB}/hq/form-studio/${formId}/submissions/${subId}` },
          }),
          BB
        );
        const reload = await req(hq.jar, `${BB}/hq/form-studio/${formId}/submissions/${subId}`);
        out.flow09.review = {
          status: reviewed.status,
          badge: ((reload.body.match(/mx-forms-badge[^>]*>([^<]+)/i) || [])[1] || "").trim(),
          notes: new RegExp(`P36 event review ${stamp}`).test(reload.body),
        };
      }
    }

    // isolation: branch cannot HQ activity-forms
    const brHq = await req(br.jar, BB + "/hq/activity-forms");
    out.flow09.branchIsolation = {
      status: brHq.status,
      denied: brHq.status === 403 || /Access denied|do not have access/i.test(brHq.body),
    };
  }

  // —— FLOW 07 ——
  {
    // Apply membership
    const jar = new Jar();
    const page = await req(jar, `${PUBLIC}/register`);
    const phoneNat = `97${String(Date.now()).slice(-7)}`;
    const applicantLast = `Member${stamp.slice(-4)}`;
    const submitted = await follow(
      jar,
      await req(jar, `${PUBLIC}/register`, {
        method: "POST",
        form: {
          _csrf: csrf(page.body),
          first_name: "P36",
          last_name: applicantLast,
          preferred_name: "P36Pref",
          email: `p36member${stamp}@example.invalid`,
          phone_country: "ZM",
          phone_national: phoneNat,
        },
        headers: { Referer: `${PUBLIC}/register` },
      }),
      BB
    );
    out.flow07.apply = {
      status: submitted.status,
      path: new URL(submitted.url).pathname,
      ok: /submitted|thank|received|Registration/i.test(submitted.body + submitted.url),
    };

    // HQ session can review HQ-branch registrations via branch-admin shell
    const queue = await req(hq.jar, BB + "/branch-admin/registrations?status=submitted");
    let regId = null;
    // Prefer row matching this applicant
    const rowMatch = queue.body.match(
      new RegExp(
        `${applicantLast}[\\s\\S]{0,400}?(?:/branch-admin/registrations/|/hq/registrations/)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})`,
        "i"
      )
    );
    if (rowMatch) regId = rowMatch[1];
    if (!regId) {
      const ids = [...queue.body.matchAll(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi)].map(
        (m) => m[1]
      );
      regId = ids[0] || null;
    }
    out.flow07.queue = { status: queue.status, registrationId: regId };

    if (regId) {
      const detail = await req(hq.jar, `${BB}/branch-admin/registrations/${regId}`);
      const approved = await follow(
        hq.jar,
        await req(hq.jar, `${BB}/branch-admin/registrations/${regId}/approve`, {
          method: "POST",
          form: {
            _csrf: csrf(detail.body),
            review_notes: `P36 approve ${stamp}`,
          },
          headers: { Referer: `${BB}/branch-admin/registrations/${regId}` },
        }),
        BB
      );
      out.flow07.approve = {
        status: approved.status,
        path: new URL(approved.url).pathname + new URL(approved.url).search,
        saved: /saved=approve|Approved|approved/i.test(approved.body + approved.url),
      };

      let memberId =
        ((approved.body.match(/\/hq\/members\/([0-9a-f-]{36})/i) ||
          approved.body.match(/\/branch-admin\/members\/([0-9a-f-]{36})/i) ||
          [])[1]) || null;
      if (!memberId) {
        const detail2 = await req(hq.jar, `${BB}/branch-admin/registrations/${regId}`);
        memberId = ((detail2.body.match(/\/members\/([0-9a-f-]{36})/i) || [])[1]) || null;
      }
      if (!memberId) {
        const members = await req(hq.jar, `${BB}/hq/members?q=${encodeURIComponent(applicantLast)}`);
        memberId = ((members.body.match(/\/hq\/members\/([0-9a-f-]{36})/i) || [])[1]) || null;
        out.flow07.memberSearch = { status: members.status, memberId };
      }
      out.flow07.memberId = memberId;

      if (memberId) {
        const profile = await req(hq.jar, `${BB}/hq/members/${memberId}`);
        const edited = await follow(
          hq.jar,
          await req(hq.jar, `${BB}/hq/membership/members/${memberId}/edit`, {
            method: "POST",
            form: {
              _csrf: csrf(profile.body),
              first_name: "P36",
              last_name: applicantLast,
              preferred_name: `Edited${stamp.slice(-4)}`,
              email: `p36member${stamp}@example.invalid`,
            },
            headers: { Referer: `${BB}/hq/members/${memberId}` },
          }),
          BB
        );
        const reload = await req(hq.jar, `${BB}/hq/members/${memberId}`);
        out.flow07.edit = {
          status: edited.status,
          preferredPersisted: new RegExp(`Edited${stamp.slice(-4)}`).test(reload.body),
        };

        const toBranch = out.resources.campusBranchId;
        const profile2 = await req(hq.jar, `${BB}/hq/members/${memberId}`);
        const transferReq = await follow(
          hq.jar,
          await req(hq.jar, `${BB}/hq/membership/members/${memberId}/transfer`, {
            method: "POST",
            form: {
              _csrf: csrf(profile2.body),
              to_branch_id: toBranch,
              reason: `P36 transfer ${stamp}`,
              confirm_transfer: "1",
            },
            headers: { Referer: `${BB}/hq/members/${memberId}` },
          }),
          BB
        );
        const transferId =
          ((transferReq.url.match(/\/transfers\/([0-9a-f-]{36})/i) ||
            transferReq.body.match(/\/transfers\/([0-9a-f-]{36})/i) ||
            [])[1]) || null;
        out.flow07.transferRequest = {
          status: transferReq.status,
          path: new URL(transferReq.url).pathname,
          transferId,
          bodyErr: transferReq.status >= 400 ? transferReq.body.slice(0, 200) : null,
        };

        if (transferId) {
          const tPage = await req(hq.jar, `${BB}/hq/membership/transfers/${transferId}`);
          const reviewed = await follow(
            hq.jar,
            await req(hq.jar, `${BB}/hq/membership/transfers/${transferId}/review`, {
              method: "POST",
              form: {
                _csrf: csrf(tPage.body),
                decision: "approved",
                reviewer_notes: `P36 transfer approved ${stamp}`,
              },
              headers: { Referer: `${BB}/hq/membership/transfers/${transferId}` },
            }),
            BB
          );
          const tReload = await req(hq.jar, `${BB}/hq/membership/transfers/${transferId}`);
          out.flow07.transferReview = {
            status: reviewed.status,
            badge: ((tReload.body.match(/mx-forms-badge[^>]*>([^<]+)/i) || [])[1] || "").trim(),
            approved: /approved/i.test(tReload.body),
          };
        }

        const brHqMembers = await req(br.jar, BB + "/hq/members");
        out.flow07.branchIsolation = {
          status: brHqMembers.status,
          denied:
            brHqMembers.status === 403 ||
            /Access denied|do not have access/i.test(brHqMembers.body),
        };
      }
    }
  }

  const flow09Pass =
    out.flow09.eventGet &&
    out.flow09.eventGet.status === 200 &&
    !out.flow09.eventGet.unavailable503 &&
    out.flow09.eventGet.hasForm &&
    out.flow09.eventValidation &&
    !out.flow09.eventValidation.thanks &&
    out.flow09.eventSubmit &&
    out.flow09.eventSubmit.thanks &&
    out.flow09.ministry &&
    out.flow09.ministry.getStatus === 200 &&
    !out.flow09.ministry.get503 &&
    out.flow09.ministry.thanks &&
    out.flow09.branchIsolation &&
    out.flow09.branchIsolation.denied &&
    (!out.flow09.publish.eventFormId ||
      (out.flow09.review && out.flow09.review.badge === "in_review"));

  const flow07Pass =
    out.flow07.apply &&
    out.flow07.apply.ok &&
    out.flow07.approve &&
    out.flow07.approve.saved &&
    out.flow07.memberId &&
    out.flow07.edit &&
    out.flow07.edit.preferredPersisted &&
    out.flow07.transferRequest &&
    out.flow07.transferRequest.transferId &&
    out.flow07.transferReview &&
    out.flow07.transferReview.approved &&
    out.flow07.branchIsolation &&
    out.flow07.branchIsolation.denied;

  out.flow07.result = flow07Pass ? "PASS" : "PARTIAL_OR_FAIL";
  out.flow09.result = flow09Pass ? "PASS" : "PARTIAL_OR_FAIL";
  out.verdict =
    flow07Pass && flow09Pass
      ? "V8_BB_FLOWS_07_09_HOSTED_PASS"
      : "V8_BB_FLOWS_07_09_OPEN_DEFECTS";

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
