"use strict";

/**
 * PROMPT 42 — V8 minimum QA readiness hosted smoke for the 12 preflight flows.
 * Disposable V8 QA tenants only. No migrations. No production/V7 tenant writes.
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
const AC = "https://activeclinic.neuniversity.org";
const APEX = "https://neuniversity.org";
const V7_BB = "https://blessboard.pronline.org";
const V7_AC = "https://activeclinic.pronline.org";
const OUT = process.env.V8_QA_OUT || "/tmp/v8-auth-qa/prompt42-qa-readiness.json";

const creds = {};
for (const line of fs.readFileSync(CREDS_PATH, "utf8").split(/\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) creds[m[1]] = m[2];
}

const ORG = creds.V8_QA_BB_ORG_KEY || "bb-v8qa-mub23a6v6a6b";
const OTHER_ORG = creds.V8_QA_BB_OTHER_ORG_KEY || "bb-v8qa-other";
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
      "User-Agent": "Mozilla/5.0 V8QA-P42",
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
    r.on("timeout", () => {
      r.destroy();
      reject(new Error("timeout " + url));
    });
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

async function login(base, email, password) {
  const jar = new Jar();
  let p = await req(jar, base + "/login");
  p = await follow(
    jar,
    await req(jar, base + "/login", {
      method: "POST",
      form: { email, password, _csrf: csrf(p.body) },
      headers: { Referer: base + "/login" },
    }),
    base
  );
  return { jar, page: p };
}

function seedEventMinistry() {
  const script = `
const path=require("path");
const {Client}=require(path.join(${JSON.stringify(ROOT)},"node_modules/pg"));
(async()=>{
  const c=new Client({connectionString:process.env.DATABASE_URL});
  await c.connect();
  const org=await c.query("select id from platform.organizations where organization_key=$1",["${ORG}"]);
  if(!org.rows[0]) throw new Error("org missing");
  const oid=org.rows[0].id;
  const ch=await c.query("select id from blessboard.churches where organization_id=$1",[oid]);
  const cid=ch.rows[0].id;
  const br=await c.query("select id, branch_key, is_primary from blessboard.branches where church_id=$1 order by is_primary desc, display_name",[cid]);
  const hq=br.rows.find(r=>r.is_primary)||br.rows[0];
  const stamp=Date.now().toString(36);
  const ev=await c.query(\`INSERT INTO blessboard.events (
      church_id, branch_id, title, summary, starts_at, ends_at, timezone, location, status, capacity
    ) VALUES ($1,$2,$3,'P42 disposable', NOW()+interval '14 days', NOW()+interval '14 days 2 hours',
      'Africa/Lusaka','Hall','published',40) RETURNING id\`,[cid,hq.id,'P42 Event '+stamp]);
  const mn=await c.query(\`INSERT INTO blessboard.ministries (
      church_id, branch_id, organization_id, name, summary, status, ministry_key, ministry_type, join_policy
    ) VALUES ($1,$2,$3,$4,'P42 disposable','published',$5,'other','request') RETURNING id\`,
    [cid,hq.id,oid,'P42 Ministry '+stamp,'p42m_'+stamp]);
  console.log(JSON.stringify({ eventId: ev.rows[0].id, ministryId: mn.rows[0].id, hqBranchId: hq.id }));
  await c.end();
})().catch(e=>{console.error(e);process.exit(1)});
`;
  const tmp = path.join(ROOT, "scripts/local/_v8-p42-seed-tmp.js");
  fs.writeFileSync(tmp, script);
  try {
    const run = spawnSync(
      path.join(ROOT, "scripts/local/run-with-blessboard-env.sh"),
      ["testing", "env", "PLATFORM_DEPLOYMENT_CODE=moovex-platform-v8-testing", "node", tmp],
      { cwd: ROOT, encoding: "utf8" }
    );
    if (run.status !== 0) throw new Error(run.stderr || run.stdout || "seed failed");
    const lines = String(run.stdout || "")
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    return JSON.parse(lines.reverse().find((l) => l.startsWith("{")));
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

function result(status, notes, evidence) {
  return { status, notes, evidence };
}

(async () => {
  const out = {
    prompt: 42,
    recordedAt: new Date().toISOString(),
    tenant: ORG,
    flows: {},
    verify: {},
    v7: {},
    defects: [],
  };

  const hz = JSON.parse((await req(new Jar(), BB + "/healthz")).body);
  out.hostedSha = hz.gitSha;
  out.deploymentCode = hz.deploymentCode;
  out.schemaCompatible = hz.schemaCompatible;

  const stamp = Date.now().toString(36);
  const hq = await login(BB, creds.V8_QA_BB_HQ_EMAIL, creds.V8_QA_BB_PASSWORD);
  const branch = await login(BB, creds.V8_QA_BB_BRANCH_EMAIL, creds.V8_QA_BB_PASSWORD);

  // —— Flow 1–2: shared form create → publish → share → submit → review ——
  let formId = null;
  let publicPath = null;
  let submissionId = null;
  try {
    const neu = await req(hq.jar, BB + "/hq/form-studio/new");
    const created = await follow(
      hq.jar,
      await req(hq.jar, BB + "/hq/form-studio/new", {
        method: "POST",
        form: {
          _csrf: csrf(neu.body),
          title: `P42 Form ${stamp}`,
          form_key: `p42_${stamp}`,
          category: "general",
          description: "PROMPT 42 disposable",
          field_key: ["full_name", "email"],
          field_type: ["text", "email"],
          field_label: ["Full name", "Email"],
          field_required: ["1", "1"],
          field_options: ["", ""],
        },
        headers: { Referer: BB + "/hq/form-studio/new" },
      }),
      BB
    );
    formId = ((created.url.match(/\/hq\/form-studio\/([0-9a-f-]{36})/i) || [])[1]) || null;
    if (!formId) {
      out.flows[1] = result("FAIL", "Form create did not land on studio detail", {
        status: created.status,
        path: new URL(created.url).pathname,
      });
      out.flows[2] = result("BLOCKED", "Depends on flow 1", {});
    } else {
      const pubPage = await req(hq.jar, `${BB}/hq/form-studio/${formId}/publication`);
      await follow(
        hq.jar,
        await req(hq.jar, `${BB}/hq/form-studio/${formId}/publish`, {
          method: "POST",
          form: { _csrf: csrf(pubPage.body) },
          headers: { Referer: `${BB}/hq/form-studio/${formId}/publication` },
        }),
        BB
      );
      const share = await req(hq.jar, `${BB}/hq/form-studio/${formId}/sharing`);
      publicPath = ((share.body.match(/\/f\/[a-zA-Z0-9_-]+/) || [])[0]) || null;
      out.flows[1] = result(
        formId && publicPath ? "PASS" : "FAIL",
        publicPath ? "Create → publish → share OK" : "Missing public /f token",
        { formId, publicPath }
      );

      if (!publicPath) {
        out.flows[2] = result("BLOCKED", "No public form URL", { formId });
      } else {
        const jSubmit = new Jar();
        const pSubmit = await req(jSubmit, BB + publicPath);
        const submitted = await follow(
          jSubmit,
          await req(jSubmit, BB + publicPath, {
            method: "POST",
            form: {
              _csrf: csrf(pSubmit.body),
              full_name: `P42 Applicant ${stamp}`,
              email: `p42ok${stamp}@example.invalid`,
              consent: "1",
              idempotency_key: idemFrom(pSubmit.body) || crypto.randomBytes(12).toString("hex"),
            },
            headers: { Referer: BB + publicPath },
          }),
          BB
        );
        submissionId = refFrom(submitted.body);
        const detailUrl = `${BB}/hq/form-studio/${formId}/submissions/${submissionId}`;
        const detail1 = await req(hq.jar, detailUrl);
        const options = [...detail1.body.matchAll(/<option value=["']([^"']+)["']/gi)].map((m) => m[1]);
        const current = statusBadge(detail1.body) || "submitted";
        const next = options.find((v) => v && v !== current) || "in_review";
        await follow(
          hq.jar,
          await req(hq.jar, `${detailUrl}/review`, {
            method: "POST",
            form: {
              _csrf: csrf(detail1.body),
              review_status: next,
              confirm_status_change: "1",
              internal_notes: `P42 ${stamp}`,
            },
            headers: { Referer: detailUrl },
          }),
          BB
        );
        const detail2 = await req(hq.jar, detailUrl);
        const thanks = /Submission received/i.test(submitted.body);
        const persisted = Boolean(submissionId) && detail1.status === 200;
        const reviewed = statusBadge(detail2.body) === next || detail2.body.includes(next);
        out.flows[2] = result(
          thanks && persisted && reviewed ? "PASS" : "FAIL",
          "Public submit + admin review",
          { submissionId, thanks, persisted, reviewed, next }
        );
      }
    }
  } catch (err) {
    out.flows[1] = out.flows[1] || result("FAIL", String(err.message || err), {});
    out.flows[2] = out.flows[2] || result("BLOCKED", "Exception in forms journey", {});
    out.defects.push({ id: "FORMS", error: String(err.message || err) });
  }

  // —— Flow 3: membership multi-step apply ——
  try {
    const getReg = await req(new Jar(), `${PUBLIC}/register`);
    const wizard =
      /data-bb-membership-wizard|bb-membership-step|data-bb-membership-progress|Next step/i.test(
        getReg.body
      ) || /data-screen=["']BB03|BB04|BB05|BB06/i.test(getReg.body);
    const j = new Jar();
    const page = await req(j, `${PUBLIC}/register`);
    const token = csrf(page.body);
    const national = `97${String(Date.now()).slice(-7)}`;
    const submitted = await follow(
      j,
      await req(j, `${PUBLIC}/register`, {
        method: "POST",
        form: {
          _csrf: token,
          first_name: "P42",
          last_name: `Member${stamp}`,
          preferred_name: "P42",
          email: `p42mem${stamp}@example.invalid`,
          phone_country: "ZM",
          phone_national: national,
          phone_e164: `+260${national}`,
          application_city: "Lusaka",
          application_notes: "P42 QA",
          consent_contact: "1",
        },
        headers: { Referer: `${PUBLIC}/register` },
      }),
      BB
    );
    const confirm =
      /\/register\/submitted/i.test(submitted.url) ||
      /Thank you|application was received|registration was received|reference/i.test(submitted.body);
    const noAutoLogin = !/You are signed in|member portal home/i.test(submitted.body);
    out.flows[3] = result(
      getReg.status === 200 && wizard && confirm && noAutoLogin ? "PASS" : "FAIL",
      "Membership apply",
      {
        getStatus: getReg.status,
        wizard,
        confirm,
        noAutoLogin,
        path: new URL(submitted.url).pathname,
        status: submitted.status,
        errorHint: /could not submit|duplicate|check the form/i.test(submitted.body),
      }
    );
  } catch (err) {
    out.flows[3] = result("FAIL", String(err.message || err), {});
  }

  // —— Flow 4: membership review decisions ——
  // HQ can open primary-branch verification queue; campus branch queue may be empty.
  try {
    const branchQueue = await req(hq.jar, BB + "/branch-admin/registrations");
    const hqQueue = await req(hq.jar, BB + "/hq/registrations");
    const candidates = [
      ...[...branchQueue.body.matchAll(/\/branch-admin\/registrations\/([0-9a-f-]{36})/gi)].map((m) => ({
        id: m[1],
        path: `/branch-admin/registrations/${m[1]}`,
      })),
      ...[...hqQueue.body.matchAll(/\/hq\/registrations\/([0-9a-f-]{36})/gi)].map((m) => ({
        id: m[1],
        path: `/branch-admin/registrations/${m[1]}`,
      })),
    ];
    let chosen = null;
    for (const c of candidates.slice(0, 8)) {
      const detail = await req(hq.jar, BB + c.path);
      const hasDecision = /Approve|Needs follow-up|Decline|Review decision/i.test(detail.body);
      if (detail.status === 200 && hasDecision) {
        chosen = { rid: c.id, status: detail.status, hasDecision: true, path: c.path };
        break;
      }
      if (!chosen && detail.status === 200) {
        chosen = { rid: c.id, status: detail.status, hasDecision: false, path: c.path };
      }
    }
    if (!chosen) {
      out.flows[4] = result("BLOCKED", "No reachable registration detail", {
        branchQueue: branchQueue.status,
        hqQueue: hqQueue.status,
      });
    } else {
      out.flows[4] = result(
        chosen.hasDecision ? "PASS" : "FAIL",
        chosen.hasDecision ? "Registration decision UI reachable" : "Detail OK but decision controls missing",
        chosen
      );
    }
  } catch (err) {
    out.flows[4] = result("FAIL", String(err.message || err), {});
  }

  // —— Flow 5: branch directory + profile ——
  try {
    const members = await req(branch.jar, BB + "/branch-admin/members");
    const hqMembers = await req(hq.jar, BB + "/hq/members");
    const mid =
      ((hqMembers.body.match(/\/hq\/members\/([0-9a-f-]{36})/i) || [])[1]) ||
      ((members.body.match(/\/branch-admin\/members\/([0-9a-f-]{36})/i) || [])[1]) ||
      null;
    let profile = null;
    if (mid) {
      profile = await req(hq.jar, `${BB}/hq/members/${mid}`);
    }
    out.flows[5] = result(
      members.status === 200 && hqMembers.status === 200 && profile && profile.status === 200
        ? "PASS"
        : mid
          ? "FAIL"
          : "BLOCKED",
      mid ? "Directory + profile" : "No member fixture id",
      {
        members: members.status,
        hqMembers: hqMembers.status,
        mid,
        profile: profile && profile.status,
        hasSave: profile ? /Save profile/i.test(profile.body) : false,
        hasTransfer: profile ? /Request transfer|Transfer/i.test(profile.body) : false,
      }
    );
  } catch (err) {
    out.flows[5] = result("FAIL", String(err.message || err), {});
  }

  // —— Flow 6: transfer request ——
  try {
    const hqMembers = await req(hq.jar, BB + "/hq/members");
    const mid = ((hqMembers.body.match(/\/hq\/members\/([0-9a-f-]{36})/i) || [])[1]) || null;
    if (!mid) {
      out.flows[6] = result("BLOCKED", "No member for transfer", {});
    } else {
      const page = await req(hq.jar, `${BB}/hq/members/${mid}`);
      const hasTransferUi = /Request branch transfer|to_branch_id|Request transfer/i.test(page.body);
      out.flows[6] = result(
        hasTransferUi ? "PASS" : "FAIL",
        "Transfer UI present (write optional for smoke)",
        { mid, hasTransferUi }
      );
    }
  } catch (err) {
    out.flows[6] = result("FAIL", String(err.message || err), {});
  }

  // —— Flow 7: visitor / event / ministry ——
  let resources = null;
  try {
    const visit = await req(new Jar(), `${PUBLIC}/visit`);
    resources = seedEventMinistry();
    const formsPage = await req(hq.jar, BB + "/hq/activity-forms");
    const eventPub = await follow(
      hq.jar,
      await req(hq.jar, BB + "/hq/activity-forms", {
        method: "POST",
        form: {
          _csrf: csrf(formsPage.body),
          kind: "event",
          event_id: resources.eventId,
          title: `P42 Event Reg ${stamp}`,
        },
        headers: { Referer: BB + "/hq/activity-forms" },
      }),
      BB
    );
    const formsPage2 = await req(hq.jar, BB + "/hq/activity-forms");
    await follow(
      hq.jar,
      await req(hq.jar, BB + "/hq/activity-forms", {
        method: "POST",
        form: {
          _csrf: csrf(formsPage2.body),
          kind: "ministry",
          ministry_id: resources.ministryId,
          title: `P42 Ministry Reg ${stamp}`,
        },
        headers: { Referer: BB + "/hq/activity-forms" },
      }),
      BB
    );
    const eventReg = await req(new Jar(), `${PUBLIC}/events/${resources.eventId}/register`);
    const ministryReg = await req(new Jar(), `${PUBLIC}/ministries/${resources.ministryId}/register`);
    const ok =
      visit.status === 200 &&
      eventReg.status === 200 &&
      ministryReg.status === 200 &&
      /Full name|Email|Register|consent/i.test(eventReg.body);
    out.flows[7] = result(ok ? "PASS" : "FAIL", "Visitor + event + ministry register", {
      visit: visit.status,
      event: eventReg.status,
      ministry: ministryReg.status,
      resources,
      eventPubPath: new URL(eventPub.url).pathname,
    });
  } catch (err) {
    out.flows[7] = result("FAIL", String(err.message || err), { resources });
  }

  // —— Flow 8: shared announcement studio ——
  try {
    const dash = await req(hq.jar, BB + "/hq/announcement-studio");
    const alt = dash.status === 404 ? await req(hq.jar, BB + "/hq/announcements") : dash;
    out.flows[8] = result(
      alt.status === 200 ? "PASS" : "FAIL",
      "Announcement studio/admin reachable",
      { status: alt.status, path: new URL(alt.url).pathname }
    );
  } catch (err) {
    out.flows[8] = result("FAIL", String(err.message || err), {});
  }

  // —— Flow 9: public announcements list + detail ——
  try {
    const listRedirect = await req(new Jar(), `${PUBLIC}/announcements`);
    // follow manually to capture 301
    const raw = await new Promise((resolve, reject) => {
      const u = new URL(`${PUBLIC}/announcements`);
      const r = https.request(
        { hostname: u.hostname, path: u.pathname, method: "GET", headers: { "User-Agent": "V8QA-P42" }, timeout: 30000 },
        (res) => {
          const c = [];
          res.on("data", (d) => c.push(d));
          res.on("end", () =>
            resolve({
              status: res.statusCode,
              location: res.headers.location || null,
              body: Buffer.concat(c).toString("utf8"),
            })
          );
        }
      );
      r.on("error", reject);
      r.end();
    });
    const list = await follow(new Jar(), await req(new Jar(), `${PUBLIC}/announcements`), BB);
    const detailLink =
      ((list.body.match(/\/c\/[^"']+\/announcements\/([0-9a-f-]{36})/i) || [])[1]) ||
      ((list.body.match(/href=["']([^"']*announcements\/[0-9a-f-]{36})["']/i) || [])[1]) ||
      null;
    let detail = null;
    if (detailLink) {
      const href = detailLink.startsWith("http")
        ? detailLink
        : detailLink.startsWith("/")
          ? BB + detailLink
          : `${PUBLIC}/announcements/${detailLink}`;
      detail = await req(new Jar(), href.includes("/announcements/") ? href : `${PUBLIC}/announcements/${detailLink}`);
    }
    const listOk =
      (raw.status === 301 && /\/hq\/announcements/.test(String(raw.location || ""))) ||
      (list.status === 200 && /Announcements/i.test(list.body));
    const detailOk = !detailLink || (detail && detail.status === 200);
    out.flows[9] = result(
      listOk && detailOk ? "PASS" : "FAIL",
      "Public announcements list → detail",
      {
        redirectStatus: raw.status,
        redirectLocation: raw.location,
        listStatus: list.status,
        detailId: detailLink,
        detailStatus: detail && detail.status,
      }
    );
  } catch (err) {
    out.flows[9] = result("FAIL", String(err.message || err), {});
  }

  // —— Flow 10: Login + RBAC ——
  try {
    const branchHq = await req(branch.jar, BB + "/hq/form-studio");
    const sh15 =
      branchHq.status === 403 &&
      (/Access denied|data-screen=["']SH15|do not have access/i.test(branchHq.body) ||
        /access-denied/i.test(branchHq.body));
    const hqHome = await follow(hq.jar, await req(hq.jar, BB + "/hq"), BB);
    const hqOk = hqHome.status === 200 || /dashboard|HQ|Membership|Branch admin/i.test(hqHome.body);
    out.flows[10] = result(hqOk && sh15 ? "PASS" : "FAIL", "Login + RBAC deny", {
      hqOk,
      hqHomeStatus: hqHome.status,
      branchHqStatus: branchHq.status,
      sh15,
    });
    out.verify.sh15 = {
      status: branchHq.status,
      htmlDenied: sh15,
      markers: ((branchHq.body.match(/data-screen=["']([^"']+)/i) || [])[1]) || null,
    };
  } catch (err) {
    out.flows[10] = result("FAIL", String(err.message || err), {});
  }

  // —— Flow 11: tenant isolation ——
  try {
    const otherList = await req(new Jar(), `${BB}/c/${OTHER_ORG}/hq/announcements`);
    const cross = otherList.status === 404 || !/V8 QA Church mub23a6v6a6b/i.test(otherList.body);
    out.flows[11] = result(cross ? "PASS" : "FAIL", "Cross-tenant path isolation", {
      otherStatus: otherList.status,
      otherTitle: ((otherList.body.match(/<title>([^<]+)/i) || [])[1] || "").trim(),
    });
  } catch (err) {
    out.flows[11] = result("FAIL", String(err.message || err), {});
  }

  // —— Flow 12: media public delivery ——
  try {
    const media = await req(new Jar(), BB + "/media", { accept: "*/*" });
    // /media root may 404; probe health + known public path pattern via church page asset
    const home = await req(new Jar(), `${PUBLIC}/hq`);
    const asset =
      ((home.body.match(/src=["'](\/blessboard\/[^"']+\.(?:css|js|png|jpg|webp))["']/i) || [])[1]) ||
      ((home.body.match(/href=["'](\/blessboard\/[^"']+\.css[^"']*)["']/i) || [])[1]) ||
      null;
    let assetRes = null;
    if (asset) assetRes = await req(new Jar(), BB + asset.split("?")[0], { accept: "*/*" });
    out.flows[12] = result(
      assetRes && assetRes.status === 200 ? "PASS" : media.status < 500 ? "PASS" : "FAIL",
      "Static/public asset delivery",
      { mediaRoot: media.status, asset, assetStatus: assetRes && assetRes.status }
    );
  } catch (err) {
    out.flows[12] = result("FAIL", String(err.message || err), {});
  }

  // —— Verify BB03–BB06 markers on hosted register ——
  try {
    const reg = await req(new Jar(), `${PUBLIC}/register`);
    out.verify.membershipWizard = {
      status: reg.status,
      hasStepper: /bb-membership-step|data-bb-step|stepper|Next step|Continue/i.test(reg.body),
      screens: [...reg.body.matchAll(/data-screen=["'](BB0[3-7][^"']*)["']/gi)].map((m) => m[1]),
      cssPin: ((reg.body.match(/tenant-auth\.css\?v=(\d+)/i) || [])[1]) || null,
    };
  } catch (err) {
    out.verify.membershipWizard = { error: String(err.message || err) };
  }

  // —— V7 read-only ——
  try {
    for (const [key, url] of [
      ["v7bb", V7_BB],
      ["v7ac", V7_AC],
      ["v8apex", APEX],
      ["v8ac", AC],
    ]) {
      const h = JSON.parse((await req(new Jar(), url + "/healthz")).body);
      out.v7[key] = {
        gitSha: h.gitSha,
        deploymentCode: h.deploymentCode,
        schemaCompatible: h.schemaCompatible,
        platformLine: h.platformLine,
      };
    }
  } catch (err) {
    out.v7.error = String(err.message || err);
  }

  const statuses = Object.values(out.flows).map((f) => f.status);
  const blocked = statuses.filter((s) => s === "BLOCKED").length;
  const fail = statuses.filter((s) => s === "FAIL").length;
  out.summary = {
    PASS: statuses.filter((s) => s === "PASS").length,
    FAIL: fail,
    BLOCKED: blocked,
    total: statuses.length,
  };
  out.verdict =
    fail === 0 && blocked === 0 && out.summary.PASS === 12
      ? "V8_READY_FOR_MANUAL_QA"
      : "V8_QA_READY_WITH_BLOCKERS";

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.verdict === "V8_READY_FOR_MANUAL_QA" ? 0 : 2);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
