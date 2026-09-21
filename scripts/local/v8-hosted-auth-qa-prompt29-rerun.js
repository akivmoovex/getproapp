"use strict";

/**
 * PROMPT 29 re-run — disposable V8 hosted authenticated QA after P30–P33 fixes.
 * Credentials: .env.v8-qa-tenants.local (gitignored). Never prints passwords.
 */

const fs = require("fs");
const https = require("https");
const { URL } = require("url");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const CREDS_PATH = path.join(ROOT, ".env.v8-qa-tenants.local");
const OUT_PATH = process.env.V8_QA_OUT || "/tmp/v8-auth-qa/prompt29-rerun.json";

const creds = {};
for (const line of fs.readFileSync(CREDS_PATH, "utf8").split(/\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) creds[m[1]] = m[2];
}

const BB = "https://blessboard.neuniversity.org";
const AC = "https://activeclinic.neuniversity.org";
const APEX = "https://neuniversity.org";
const BB_ORG = creds.V8_QA_BB_ORG_KEY;
const AC_ORG = creds.V8_QA_AC_ORG_KEY;
const PUBLIC = `${BB}/c/${BB_ORG}`;

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
    const body = opt.form ? new URLSearchParams(opt.form).toString() : null;
    const headers = {
      "User-Agent": "Mozilla/5.0 V8QA-P29",
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
    r.on("timeout", () => {
      r.destroy();
      reject(new Error("timeout " + url));
    });
    r.on("error", reject);
    if (body) r.write(body);
    r.end();
  });
}

function csrf(html) {
  const m =
    html.match(/name=["']_csrf["'][^>]*value=["']([^"']+)/) ||
    html.match(/value=["']([^"']+)["'][^>]*name=["']_csrf["']/);
  return m && m[1];
}
function title(html) {
  return ((html.match(/<title[^>]*>([^<]+)/i) || [])[1] || "").trim();
}
function denied(html) {
  return /Access denied|Forbidden|Sign-in is required|do not have access/i.test(html);
}
async function follow(jar, res, base) {
  let cur = res;
  let h = 0;
  while (cur.status >= 300 && cur.status < 400 && cur.headers.location && h++ < 10) {
    cur = await req(jar, new URL(cur.headers.location, base).toString());
  }
  return cur;
}
async function login(base, email, password) {
  const jar = new Jar();
  const page = await req(jar, base + "/login");
  const post = await follow(
    jar,
    await req(jar, base + "/login", {
      method: "POST",
      form: { email, password, _csrf: csrf(page.body) },
      headers: { Referer: base + "/login" },
    }),
    base
  );
  return { jar, page: post };
}
function probe(res, pathHint) {
  return {
    path: pathHint || new URL(res.url).pathname,
    status: res.status,
    title: title(res.body),
    denied: denied(res.body),
    section:
      ((res.body.match(/data-ac-page-section=["']([^"']+)/) || [])[1] ||
        (res.body.match(/data-bb-[a-z-]+=["']([^"']+)/) || [])[1] ||
        null),
    unavailable: /not yet available in BlessBoard/i.test(res.body),
    comingSoon: /coming soon/i.test(res.body),
  };
}

(async () => {
  const out = {
    recordedAt: new Date().toISOString(),
    tenants: { bb: BB_ORG, ac: AC_ORG },
    health: {},
    flows: {},
    regressions: {},
    screensHttp: [],
    defects: [],
  };

  for (const [name, host] of [
    ["bb", BB],
    ["ac", AC],
    ["apex", APEX],
    ["v7bb", "https://blessboard.pronline.org"],
    ["v7ac", "https://activeclinic.pronline.org"],
  ]) {
    const hz = await req(new Jar(), host + "/healthz");
    try {
      const j = JSON.parse(hz.body);
      out.health[name] = {
        status: hz.status,
        gitSha: j.gitSha,
        deploymentCode: j.deploymentCode,
        schemaCompatible: j.schemaCompatible,
        platformLine: j.platformLine,
      };
    } catch {
      out.health[name] = { status: hz.status };
    }
  }
  out.sha = out.health.bb && out.health.bb.gitSha;

  const hq = await login(BB, creds.V8_QA_BB_HQ_EMAIL, creds.V8_QA_BB_PASSWORD);
  const br = await login(BB, creds.V8_QA_BB_BRANCH_EMAIL, creds.V8_QA_BB_PASSWORD);
  const ac = await login(AC, creds.V8_QA_AC_ADMIN_EMAIL, creds.V8_QA_AC_PASSWORD);
  out.roles = {
    hqLogin: probe(hq.page, "/login→hq"),
    branchLogin: probe(br.page, "/login→branch"),
    acLogin: probe(ac.page, "/login→ac"),
  };

  // ---- Flow 01 form studio ----
  {
    const neu = await req(hq.jar, BB + "/hq/form-studio/new");
    const createDenied = denied(neu.body);
    let created = null;
    if (!createDenied && csrf(neu.body)) {
      const stamp = Date.now().toString(36);
      const post = await follow(
        hq.jar,
        await req(hq.jar, BB + "/hq/form-studio/new", {
          method: "POST",
          form: {
            _csrf: csrf(neu.body),
            title: `V8 QA Form ${stamp}`,
            form_key: `v8qa_${stamp}`,
            category: "general",
            description: "Disposable hosted QA form",
            field_key: "full_name",
            field_type: "text",
            field_label: "Full name",
            field_required: "1",
          },
          headers: { Referer: BB + "/hq/form-studio/new" },
        }),
        BB
      );
      created = probe(post, new URL(post.url).pathname);
      const detailPath = new URL(post.url).pathname.replace(/\/$/, "");
      const formIdMatch = detailPath.match(/\/hq\/form-studio\/([0-9a-f-]{36})/i);
      const formBase = formIdMatch
        ? `/hq/form-studio/${formIdMatch[1]}`
        : detailPath.replace(/\/(studio|publication|sharing|preview)$/, "");
      const pubPage = await req(hq.jar, BB + formBase + "/publication");
      if (csrf(pubPage.body) || csrf(post.body)) {
        const pub = await follow(
          hq.jar,
          await req(hq.jar, BB + formBase + "/publish", {
            method: "POST",
            form: { _csrf: csrf(pubPage.body) || csrf(post.body) },
            headers: { Referer: BB + formBase + "/publication" },
          }),
          BB
        );
        created.publish = probe(pub, new URL(pub.url).pathname);
        const share = await req(hq.jar, BB + formBase + "/sharing");
        created.publicLink =
          ((share.body + pub.body + post.body).match(/\/f\/[a-zA-Z0-9_-]+/) || [])[0] || null;
      }
    }
    out.flows["01"] = {
      result: createDenied ? "FAIL" : created && created.status < 400 ? "PASS" : "PARTIAL",
      newPage: probe(neu, "/hq/form-studio/new"),
      created,
    };
    if (createDenied) {
      out.defects.push({
        id: "V8-QA-FORM-STUDIO-DENIED",
        severity: "high",
        summary: "/hq/form-studio/new still soft-denies HQ",
      });
    }
  }

  // ---- Flow 02 public form ----
  {
    const link = out.flows["01"].created && out.flows["01"].created.publicLink;
    if (!link) {
      out.flows["02"] = { result: "BLOCKED", reason: "no_published_form_url" };
    } else {
      const page = await req(new Jar(), BB + link);
      out.flows["02"] = {
        result: page.status === 200 ? "PARTIAL" : "FAIL",
        get: probe(page, link),
        note: "Submit may need field schema; GET verified when URL present",
      };
    }
  }

  // ---- Flow 03 ----
  out.flows["03"] = {
    result: out.flows["02"].result === "BLOCKED" ? "BLOCKED" : "PARTIAL",
    reason: out.flows["02"].result === "BLOCKED" ? "depends_on_02" : "review_ui_not_fully_exercised",
  };

  // ---- Flow 04 isolation ----
  {
    const branchHq = await req(br.jar, BB + "/hq/form-studio");
    const branchMembers = await req(br.jar, BB + "/hq/members");
    const hqBranch = await req(hq.jar, BB + "/branch-admin");
    const ok =
      (branchHq.status === 403 || denied(branchHq.body)) &&
      (branchMembers.status === 403 || denied(branchMembers.body));
    out.flows["04"] = {
      result: ok ? "PASS" : "FAIL",
      branchHqForm: probe(branchHq, "/hq/form-studio"),
      branchHqMembers: probe(branchMembers, "/hq/members"),
      hqOnBranch: probe(hqBranch, "/branch-admin"),
    };
  }

  // ---- Flow 05 membership apply (path-public) ----
  {
    const reg = await req(new Jar(), `${PUBLIC}/register`);
    let submit = null;
    if (reg.status === 200 && csrf(reg.body)) {
      const stamp = Date.now().toString(36);
      submit = await follow(
        new Jar(),
        await req(new Jar(), `${PUBLIC}/register`, {
          method: "POST",
          form: {
            _csrf: csrf(reg.body),
            first_name: "V8",
            last_name: `Applicant${stamp.slice(-4)}`,
            preferred_name: "App",
            email: `member.applicant+${stamp}@example.invalid`,
            phone_country: "ZM",
            phone_national: `977${String(Date.now()).slice(-6)}`,
          },
          headers: { Referer: `${PUBLIC}/register` },
        }),
        BB
      );
      // need cookie jar continuity for CSRF - redo with same jar
    }
    const jar = new Jar();
    const page = await req(jar, `${PUBLIC}/register`);
    const stamp = Date.now().toString(36);
    const phoneNat = `97${String(Date.now()).slice(-7)}`;
    submit = await follow(
      jar,
      await req(jar, `${PUBLIC}/register`, {
        method: "POST",
        form: {
          _csrf: csrf(page.body),
          first_name: "V8",
          last_name: `Applicant${stamp.slice(-4)}`,
          preferred_name: "App",
          email: `member.applicant+${stamp}@example.invalid`,
          phone_country: "ZM",
          phone_national: phoneNat,
        },
        headers: { Referer: `${PUBLIC}/register` },
      }),
      BB
    );
    const ok =
      page.status === 200 &&
      (submit.status === 200 || submit.status === 303) &&
      (/submitted|thank|received|registration/i.test(submit.body + title(submit.body)) ||
        /register\/submitted/i.test(submit.url));
    out.flows["05"] = {
      result: page.status === 200 && ok ? "PASS" : page.status === 200 ? "PARTIAL" : "FAIL",
      get: probe(page, `${PUBLIC}/register`),
      submit: probe(submit, new URL(submit.url).pathname),
    };
  }

  // ---- Flow 06 membership review ----
  {
    const queue = await req(hq.jar, BB + "/hq/membership");
    const regs = await req(hq.jar, BB + "/hq/registrations");
    const ok = queue.status === 200 && !/not yet available/i.test(queue.body);
    out.flows["06"] = {
      result: ok ? "PASS" : "FAIL",
      membership: probe(queue, "/hq/membership"),
      registrations: probe(regs, "/hq/registrations"),
    };
    if (!ok) {
      out.defects.push({
        id: "V8-QA-HQ-MEMBERSHIP",
        severity: "high",
        summary: "/hq/membership not restored",
      });
    }
  }

  // ---- Flow 07 members + transfers ----
  {
    const hqMem = await req(hq.jar, BB + "/hq/members");
    const brMem = await req(br.jar, BB + "/branch-admin/members");
    out.flows["07"] = {
      result: hqMem.status === 200 && brMem.status === 200 ? "PARTIAL" : "FAIL",
      note: "Lists reachable; transfer write depends on approved members",
      hq: probe(hqMem, "/hq/members"),
      branch: probe(brMem, "/branch-admin/members"),
      transferUi: /transfer/i.test(brMem.body),
    };
  }

  // ---- Flow 08 visitor ----
  {
    const visit = await req(new Jar(), `${PUBLIC}/visit`);
    out.flows["08"] = {
      result: visit.status === 200 && /visitor|Plan a visit|data-bb-activity/i.test(visit.body) ? "PASS" : "FAIL",
      get: probe(visit, `${PUBLIC}/visit`),
    };
  }

  // ---- Flow 09 event/ministry ----
  {
    const events = await req(new Jar(), `${PUBLIC}/hq/events`);
    out.flows["09"] = {
      result: events.status === 200 ? "PARTIAL" : "BLOCKED",
      note: "Public events page reachable; specific event/ministry register forms need published resources",
      events: probe(events, `${PUBLIC}/hq/events`),
    };
  }

  // ---- Flow 10 announcements create/publish ----
  {
    const neu = await req(hq.jar, BB + "/hq/announcements/new");
    const stamp = Date.now().toString(36);
    const create = await follow(
      hq.jar,
      await req(hq.jar, BB + "/hq/announcements", {
        method: "POST",
        form: {
          _csrf: csrf(neu.body),
          title: `V8 QA Ann ${stamp}`,
          body: "Disposable announcement for hosted QA persistence.",
          audience_public: "on",
          status: "draft",
          timezone: "Africa/Lusaka",
        },
        headers: { Referer: BB + "/hq/announcements/new" },
      }),
      BB
    );
    let annId = ((create.headers.location || "") + create.url + create.body).match(
      /\/hq\/announcements\/([0-9a-f-]{36})/i
    );
    annId = annId && annId[1];
    let published = null;
    if (annId) {
      const pubPage = await req(hq.jar, `${BB}/hq/announcements/${annId}/publish`);
      published = await follow(
        hq.jar,
        await req(hq.jar, `${BB}/hq/announcements/${annId}/publish`, {
          method: "POST",
          form: { _csrf: csrf(pubPage.body) || csrf(create.body), confirm_publish: "1" },
          headers: { Referer: `${BB}/hq/announcements/${annId}/publish` },
        }),
        BB
      );
    }
    out.flows["10"] = {
      result: annId && published && published.status === 200 ? "PASS" : "PARTIAL",
      annId,
      create: probe(create, new URL(create.url).pathname),
      publish: published ? probe(published, new URL(published.url).pathname) : null,
    };
  }

  // ---- Flow 11 HQ/branch announcements ----
  {
    const hqList = await req(hq.jar, BB + "/hq/announcements");
    const brList = await req(br.jar, BB + "/branch-admin/announcements");
    out.flows["11"] = {
      result: hqList.status === 200 && brList.status === 200 ? "PASS" : "PARTIAL",
      hq: probe(hqList, "/hq/announcements"),
      branch: probe(brList, "/branch-admin/announcements"),
    };
  }

  // ---- Flow 12 public announcements ----
  {
    const list = await req(new Jar(), `${PUBLIC}/hq/announcements`);
    const annId = out.flows["10"].annId;
    const detail = annId
      ? await req(new Jar(), `${PUBLIC}/announcements/${annId}`)
      : null;
    const ok =
      list.status === 200 &&
      !/coming soon/i.test(list.body) &&
      detail &&
      detail.status === 200 &&
      /V8 QA Ann|announcement/i.test(detail.body);
    out.flows["12"] = {
      result: ok ? "PASS" : list.status === 200 ? "PARTIAL" : "FAIL",
      list: probe(list, `${PUBLIC}/hq/announcements`),
      detail: detail ? probe(detail, `${PUBLIC}/announcements/${annId}`) : null,
    };
  }

  // ---- Regressions ----
  {
    // AC booking wizard submit
    const jar = new Jar();
    let p = await req(jar, `${AC}/clinics/${AC_ORG}/book`);
    let t = csrf(p.body);
    const svc = ((p.body.match(/name=["']serviceKey["'][^>]*value=["']([^"']+)/i) || [])[1]) || "";
    p = await follow(
      jar,
      await req(jar, `${AC}/clinics/${AC_ORG}/book`, {
        method: "POST",
        form: { _csrf: t, wizardAction: "continue", serviceKey: svc },
        headers: { Referer: `${AC}/clinics/${AC_ORG}/book` },
      }),
      AC
    );
    t = csrf(p.body);
    p = await follow(
      jar,
      await req(jar, `${AC}/clinics/${AC_ORG}/book/doctor`, {
        method: "POST",
        form: { _csrf: t, doctorChoice: "any" },
        headers: { Referer: `${AC}/clinics/${AC_ORG}/book/doctor` },
      }),
      AC
    );
    t = csrf(p.body);
    p = await follow(
      jar,
      await req(jar, `${AC}/clinics/${AC_ORG}/book/slot`, {
        method: "POST",
        form: { _csrf: t, preferredStartsAt: "2030-09-01T10:00" },
        headers: { Referer: `${AC}/clinics/${AC_ORG}/book/slot` },
      }),
      AC
    );
    t = csrf(p.body);
    p = await follow(
      jar,
      await req(jar, `${AC}/clinics/${AC_ORG}/book/patient`, {
        method: "POST",
        form: {
          _csrf: t,
          patientFirstName: "P29",
          patientLastName: "Book",
          patientPhone: `+26097${String(Date.now()).slice(-7)}`,
          patientEmail: `p29book${Date.now()}@example.invalid`,
          visitReason: "P29 regression",
        },
        headers: { Referer: `${AC}/clinics/${AC_ORG}/book/patient` },
      }),
      AC
    );
    t = csrf(p.body);
    const idem = (p.body.match(/name=["']idempotencyKey["'][^>]*value=["']([^"']+)/) || [])[1];
    const sub = await follow(
      jar,
      await req(jar, `${AC}/clinics/${AC_ORG}/book/submit`, {
        method: "POST",
        form: { _csrf: t, idempotencyKey: idem || "" },
        headers: { Referer: `${AC}/clinics/${AC_ORG}/book/review` },
      }),
      AC
    );
    out.regressions.acBooking = {
      status: sub.status,
      pending: /pending clinic confirmation|Request submitted/i.test(sub.body),
      section: ((sub.body.match(/data-ac-page-section=["']([^"']+)/) || [])[1] || null),
    };

    const contactPage = await req(new Jar(), `${AC}/clinics/${AC_ORG}/contact`);
    const cj = new Jar();
    const cp = await req(cj, `${AC}/clinics/${AC_ORG}/contact`);
    const csub = await follow(
      cj,
      await req(cj, `${AC}/clinics/${AC_ORG}/contact`, {
        method: "POST",
        form: {
          _csrf: csrf(cp.body),
          senderName: "P29 Contact",
          senderEmail: `p29contact${Date.now()}@example.invalid`,
          phone_country: "ZM",
          phone_national: `97${String(Date.now()).slice(-7)}`,
          subject: "general",
          message: "P29 inquiry regression",
        },
        headers: { Referer: `${AC}/clinics/${AC_ORG}/contact` },
      }),
      AC
    );
    out.regressions.acContact = probe(csub, new URL(csub.url).pathname);

    out.regressions.acServices = probe(
      await req(new Jar(), `${AC}/clinics/${AC_ORG}/services`),
      `/clinics/${AC_ORG}/services`
    );
    out.regressions.acDoctors = probe(
      await req(new Jar(), `${AC}/clinics/${AC_ORG}/doctors`),
      `/clinics/${AC_ORG}/doctors`
    );
    out.regressions.acDirectory = probe(await req(new Jar(), AC + "/clinics"), "/clinics");

    out.regressions.productHubRegister = probe(await req(new Jar(), BB + "/register"), "/register");
    out.regressions.registerChurch = probe(
      await req(new Jar(), BB + "/register-church"),
      "/register-church"
    );

    out.regressions.media = [];
    for (const [host, u] of [
      [BB, "/media/testing/platform/blessboard/brand/blessboard-small-church-logo.png"],
      [AC, "/media/testing/platform/activeclinic/clinic/julflona-hero.jpg"],
    ]) {
      const r = await req(new Jar(), host + u);
      out.regressions.media.push({
        host,
        url: u,
        status: r.status,
        ct: r.headers["content-type"] || null,
      });
    }
  }

  // HTTP screen matrix (auth + public) — not 84 visual claim
  const hqPaths = [
    "/hq",
    "/hq/members",
    "/hq/membership",
    "/hq/registrations",
    "/hq/announcements",
    "/hq/form-studio",
    "/hq/branches",
    "/hq/forms",
  ];
  for (const p of hqPaths) {
    out.screensHttp.push({ role: "hq", ...probe(await req(hq.jar, BB + p), p) });
  }
  for (const p of ["/branch-admin", "/branch-admin/members", "/branch-admin/announcements", "/branch-admin/registrations"]) {
    out.screensHttp.push({ role: "branch", ...probe(await req(br.jar, BB + p), p) });
  }
  for (const p of [
    `${PUBLIC}`,
    `${PUBLIC}/hq`,
    `${PUBLIC}/register`,
    `${PUBLIC}/visit`,
    `${PUBLIC}/hq/announcements`,
    `${PUBLIC}/hq/about`,
  ]) {
    const r = await req(new Jar(), p.startsWith("http") ? p : BB + p);
    out.screensHttp.push({ role: "public", ...probe(r, p.replace(BB, "")) });
  }
  for (const p of [
    `/clinics/${AC_ORG}`,
    `/clinics/${AC_ORG}/book`,
    `/clinics/${AC_ORG}/contact`,
    `/clinics/${AC_ORG}/services`,
    `/clinics/${AC_ORG}/doctors`,
  ]) {
    out.screensHttp.push({ role: "ac-public", ...probe(await req(new Jar(), AC + p), p) });
  }

  const counts = { PASS: 0, PARTIAL: 0, FAIL: 0, BLOCKED: 0 };
  for (const f of Object.values(out.flows)) {
    counts[f.result] = (counts[f.result] || 0) + 1;
  }
  out.flowCounts = counts;
  out.verdict =
    counts.FAIL > 0 || counts.BLOCKED > 0 || counts.PARTIAL > 0
      ? "V8_HOSTED_QA_WITH_OPEN_DEFECTS"
      : "V8_HOSTED_84_SCREEN_12_FLOW_QA_PASS";
  // Never claim 84 visual pass from HTTP alone
  if (out.verdict === "V8_HOSTED_84_SCREEN_12_FLOW_QA_PASS") {
    out.verdict = "V8_HOSTED_QA_WITH_OPEN_DEFECTS";
    out.verdictNote = "HTTP flows may pass; 84-screen visual PASS not claimed without full visual inspection";
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e.stack || e).slice(0, 2000) }));
  process.exit(2);
});
