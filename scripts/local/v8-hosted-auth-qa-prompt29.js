"use strict";

/**
 * PROMPT 29 — disposable V8 hosted authenticated QA (read + write on QA tenants only).
 * Credentials: .env.v8-qa-tenants.local (gitignored).
 */

const fs = require("fs");
const https = require("https");
const { URL } = require("url");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const CREDS_PATH = path.join(ROOT, ".env.v8-qa-tenants.local");
const OUT_PATH = process.env.V8_QA_OUT || "/tmp/v8-auth-qa/auth-qa-full.json";

const creds = {};
for (const line of fs.readFileSync(CREDS_PATH, "utf8").split(/\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) creds[m[1]] = m[2];
}

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
    return [...this.map].map(([k, v]) => k + "=" + v).join("; ");
  }
}

function req(jar, url, opt = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = opt.form ? new URLSearchParams(opt.form).toString() : opt.raw || null;
    const headers = {
      "User-Agent": "Mozilla/5.0 V8QA",
      Cookie: jar.header(),
      Accept: "text/html,application/xhtml+xml",
      ...(opt.headers || {}),
    };
    if (body) {
      headers["Content-Type"] = opt.contentType || "application/x-www-form-urlencoded";
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
            url,
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

async function probe(jar, base, p) {
  const r = await req(jar, base + p);
  return {
    path: p,
    status: r.status,
    title: title(r.body),
    denied: denied(r.body),
    csrf: !!csrf(r.body),
    len: r.body.length,
    snip: denied(r.body) ? r.body.replace(/\s+/g, " ").slice(0, 120) : null,
  };
}

function fillFormFields(html, overrides) {
  const fields = { _csrf: csrf(html), ...overrides };
  for (const m of html.matchAll(/name=["']([^"']+)["']/g)) {
    const n = m[1];
    if (n === "_csrf" || fields[n] != null) continue;
    if (/email/i.test(n)) fields[n] = overrides.__email || `qa+${Date.now()}@example.invalid`;
    else if (/phone_country|country/i.test(n)) fields[n] = "ZM";
    else if (/phone/i.test(n)) fields[n] = overrides.__phone || "977001199";
    else if (/first/i.test(n)) fields[n] = "V8";
    else if (/last/i.test(n)) fields[n] = "QA";
    else if (/name/i.test(n)) fields[n] = overrides.__name || "V8 QA";
    else if (/date/i.test(n)) fields[n] = "2026-10-15";
    else if (/time/i.test(n)) fields[n] = "10:00";
    else if (/message|notes|details|body|subject|reason/i.test(n))
      fields[n] = overrides.__message || "Disposable hosted QA";
  }
  for (const m of html.matchAll(/<select[^>]*name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/select>/gi)) {
    const n = m[1];
    const opts = [...m[2].matchAll(/<option[^>]*value=["']([^"']+)["']/gi)]
      .map((o) => o[1])
      .filter(Boolean);
    if (opts[0] && (fields[n] == null || fields[n] === "")) fields[n] = opts[0];
  }
  delete fields.__email;
  delete fields.__phone;
  delete fields.__name;
  delete fields.__message;
  return fields;
}

(async () => {
  const BB = "https://blessboard.neuniversity.org";
  const AC = "https://activeclinic.neuniversity.org";
  const APEX = "https://neuniversity.org";
  const out = {
    sha: null,
    recordedAt: new Date().toISOString(),
    flows: {},
    screens: [],
    roles: {},
    regression: {},
    defects: [],
    isolation: {},
    persistence: {},
    health: [],
  };

  for (const h of [BB, AC, APEX]) {
    const hz = await req(new Jar(), h + "/healthz");
    try {
      const j = JSON.parse(hz.body);
      out.sha = out.sha || j.gitSha;
      out.health.push({
        host: h,
        gitSha: j.gitSha,
        deploymentCode: j.deploymentCode,
        schemaCompatible: j.schemaCompatible,
        ok: j.ok,
      });
    } catch (e) {
      out.health.push({ host: h, status: hz.status, parse: false });
    }
  }

  // Branch admin forms 01-03
  const br = await login(BB, creds.V8_QA_BB_BRANCH_EMAIL, creds.V8_QA_BB_PASSWORD);
  out.roles.branch = {
    path: new URL(br.page.url).pathname,
    status: br.page.status,
    title: title(br.page.body),
  };
  const formNew = await req(br.jar, BB + "/branch-admin/form-studio/new");
  out.screens.push(await probe(br.jar, BB, "/branch-admin/form-studio/new"));
  let formId = null;
  let publicPath = null;
  if (csrf(formNew.body) && !denied(formNew.body)) {
    const create = await follow(
      br.jar,
      await req(br.jar, BB + "/branch-admin/form-studio/new", {
        method: "POST",
        form: {
          _csrf: csrf(formNew.body),
          title: "V8 QA Branch Form " + Date.now().toString(36),
          description: "Disposable hosted QA",
          category: "general",
          field_key: ["full_name", "notes"],
          field_type: ["text", "textarea"],
          field_label: ["Full name", "Notes"],
          field_required: ["1", "0"],
          field_options: ["", ""],
        },
        headers: { Referer: BB + "/branch-admin/form-studio/new" },
      }),
      BB
    );
    formId =
      ((create.url + create.body).match(/\/branch-admin\/form-studio\/([0-9a-f-]{36})/i) ||
        [])[1] || null;
    out.flows["01_create"] = {
      status: create.status,
      path: new URL(create.url).pathname,
      formId,
      denied: denied(create.body),
    };
    if (formId) {
      const studio = await req(br.jar, `${BB}/branch-admin/form-studio/${formId}/studio`);
      await follow(
        br.jar,
        await req(br.jar, `${BB}/branch-admin/form-studio/${formId}/studio`, {
          method: "POST",
          form: {
            _csrf: csrf(studio.body),
            title: "V8 QA Branch Form",
            description: "Disposable hosted QA",
            category: "general",
            field_key: ["full_name", "notes"],
            field_type: ["text", "textarea"],
            field_label: ["Full name", "Notes"],
            field_required: ["1", "0"],
            field_options: ["", ""],
          },
          headers: { Referer: `${BB}/branch-admin/form-studio/${formId}/studio` },
        }),
        BB
      );
      out.screens.push(await probe(br.jar, BB, `/branch-admin/form-studio/${formId}/preview`));
      out.screens.push(await probe(br.jar, BB, `/branch-admin/form-studio/${formId}/publication`));
      const pubPage = await req(br.jar, `${BB}/branch-admin/form-studio/${formId}/publication`);
      const pub = await follow(
        br.jar,
        await req(br.jar, `${BB}/branch-admin/form-studio/${formId}/publish`, {
          method: "POST",
          form: { _csrf: csrf(pubPage.body) },
          headers: { Referer: `${BB}/branch-admin/form-studio/${formId}/publication` },
        }),
        BB
      );
      out.flows["01_publish"] = { status: pub.status, path: new URL(pub.url).pathname };
      const share = await req(br.jar, `${BB}/branch-admin/form-studio/${formId}/sharing`);
      out.screens.push({
        path: `/branch-admin/form-studio/${formId}/sharing`,
        status: share.status,
        title: title(share.body),
      });
      let href = (share.body.match(/href=["'](\/f\/[^"']+)["']/) || [])[1];
      if (!href) {
        const m2 = share.body.match(/\/f\/([A-Za-z0-9_-]+)/);
        if (m2) href = "/f/" + m2[1];
      }
      if (!href) {
        const m3 = share.body.match(/https?:\/\/[^"'<\s]+\/f\/([A-Za-z0-9_-]+)/);
        if (m3) href = "/f/" + m3[1];
      }
      if (!href) {
        const m4 =
          share.body.match(/name=["']public_path["'][^>]*value=["']([^"']+)/) ||
          share.body.match(/value=["'](\/f\/[^"']+)["']/);
        if (m4) href = m4[1];
      }
      publicPath = href || null;
      out.flows["01"] = {
        result: formId && pub.status < 400 ? "PASS" : "PARTIAL",
        formId,
        publicPath,
        via: "branch-admin",
        hqFormStudioNote: "HQ /hq/form-studio/new soft Access denied (requests.manage gap)",
      };
    }
  } else {
    out.flows["01"] = {
      result: "FAIL",
      reason: "branch_form_studio_denied",
      status: formNew.status,
      denied: denied(formNew.body),
      csrf: !!csrf(formNew.body),
    };
  }

  if (publicPath) {
    const pj = new Jar();
    const pf = await req(pj, BB + publicPath);
    out.screens.push({
      path: publicPath,
      status: pf.status,
      title: title(pf.body),
      csrf: !!csrf(pf.body),
    });
    const bad = await follow(
      pj,
      await req(pj, BB + publicPath, {
        method: "POST",
        form: { _csrf: csrf(pf.body) },
        headers: { Referer: BB + publicPath },
      }),
      BB
    );
    const pf2 = await req(pj, BB + publicPath);
    const good = await follow(
      pj,
      await req(pj, BB + publicPath, {
        method: "POST",
        form: {
          _csrf: csrf(pf2.body),
          full_name: "V8 QA Submitter",
          notes: "persist-check",
        },
        headers: { Referer: BB + publicPath },
      }),
      BB
    );
    out.flows["02"] = {
      result:
        good.status === 200 || /thank|submitted|confirm|received/i.test(good.body)
          ? "PASS"
          : "PARTIAL",
      status: good.status,
      path: new URL(good.url).pathname,
      validationEmptyStatus: bad.status,
      title: title(good.body),
    };
    const reloadPublic = await req(new Jar(), BB + publicPath);
    out.persistence.publicSubmitReload = {
      status: reloadPublic.status,
      csrf: !!csrf(reloadPublic.body),
    };
    const list = await req(br.jar, `${BB}/branch-admin/form-studio/${formId}/submissions`);
    out.screens.push({
      path: `/branch-admin/form-studio/${formId}/submissions`,
      status: list.status,
      title: title(list.body),
    });
    const ids = [...list.body.matchAll(/\/submissions\/([0-9a-f-]{36})/gi)].map((m) => m[1]);
    let reviewOk = false;
    if (ids[0]) {
      const det = await req(br.jar, `${BB}/branch-admin/form-studio/${formId}/submissions/${ids[0]}`);
      out.screens.push({
        path: `/branch-admin/form-studio/${formId}/submissions/${ids[0]}`,
        status: det.status,
        title: title(det.body),
      });
      const rev = await follow(
        br.jar,
        await req(br.jar, `${BB}/branch-admin/form-studio/${formId}/submissions/${ids[0]}/review`, {
          method: "POST",
          form: { _csrf: csrf(det.body), status: "accepted", note: "qa-accepted" },
          headers: { Referer: det.url },
        }),
        BB
      );
      reviewOk = rev.status >= 200 && rev.status < 400;
      const reload = await req(
        br.jar,
        `${BB}/branch-admin/form-studio/${formId}/submissions/${ids[0]}`
      );
      out.persistence.submissionReview = {
        reviewOk,
        reloadStatus: reload.status,
        accepted: /accepted/i.test(reload.body),
      };
    }
    out.flows["03"] = {
      result:
        list.status === 200 && ids.length && reviewOk
          ? "PASS"
          : list.status === 200 && ids.length
            ? "PARTIAL"
            : "FAIL",
      listStatus: list.status,
      submissionCount: ids.length,
      reviewOk,
    };
  } else if (!out.flows["02"]) {
    out.flows["02"] = { result: "BLOCKED", reason: "no_public_path" };
    out.flows["03"] = { result: "BLOCKED", reason: "no_submission" };
  }

  out.isolation.branchHqForm = await probe(br.jar, BB, "/hq/form-studio");
  out.isolation.branchHqMembers = await probe(br.jar, BB, "/hq/members");

  const hq = await login(BB, creds.V8_QA_BB_HQ_EMAIL, creds.V8_QA_BB_PASSWORD);
  out.roles.hq = { path: new URL(hq.page.url).pathname, status: hq.page.status };
  let onb = await req(hq.jar, BB + "/hq/onboarding");
  for (let i = 0; i < 8; i++) {
    const tok = csrf(onb.body);
    if (!tok) break;
    const step =
      (
        onb.body.match(/name=["']step_key["'][^>]*value=["']([^"']+)/) ||
        onb.body.match(/value=["']([^"']+)["'][^>]*name=["']step_key["']/) ||
        []
      )[1] || "welcome";
    const skip = await follow(
      hq.jar,
      await req(hq.jar, BB + "/hq/onboarding/skip", {
        method: "POST",
        form: { _csrf: tok, step_key: step },
        headers: { Referer: BB + "/hq/onboarding" },
      }),
      BB
    );
    if (!String(skip.url).includes("onboarding")) {
      onb = skip;
      break;
    }
    const onb2 = await req(hq.jar, BB + "/hq/onboarding");
    const ctok = csrf(onb2.body);
    if (ctok && /onboarding\/complete/i.test(onb2.body)) {
      const done = await follow(
        hq.jar,
        await req(hq.jar, BB + "/hq/onboarding/complete", {
          method: "POST",
          form: { _csrf: ctok },
          headers: { Referer: BB + "/hq/onboarding" },
        }),
        BB
      );
      onb = done;
      if (!String(done.url).includes("onboarding")) break;
    }
    onb = await req(hq.jar, BB + "/hq/onboarding");
    if (i === 7) {
      out.roles.onboardingStuck = {
        path: new URL(onb.url).pathname,
        title: title(onb.body),
        hasComplete: /onboarding\/complete/i.test(onb.body),
        steps: [...onb.body.matchAll(/step_key[^>]{0,40}value=["']([^"']+)/g)]
          .map((m) => m[1])
          .slice(0, 5),
      };
    }
  }
  out.roles.hqAfterOnb = { path: new URL((await req(hq.jar, BB + "/hq")).url).pathname };

  for (const p of [
    "/hq/form-studio/new",
    "/hq/announcements",
    "/hq/announcements/new",
    "/hq/announcement-studio",
    "/hq/members",
    "/hq/membership",
    "/hq",
    "/hq/branches",
  ]) {
    out.screens.push(await probe(hq.jar, BB, p));
  }

  out.flows["04"] = {
    result:
      (out.isolation.branchHqForm.status === 403 || out.isolation.branchHqForm.denied) &&
      (out.isolation.branchHqMembers.status === 403 || out.isolation.branchHqMembers.denied)
        ? "PASS"
        : "PARTIAL",
    branchHqForm: out.isolation.branchHqForm,
    branchHqMembers: out.isolation.branchHqMembers,
    hqFormStudioNew: out.screens.find((s) => s.path === "/hq/form-studio/new"),
  };

  const mem = await req(hq.jar, BB + "/hq/membership");
  const members = await req(hq.jar, BB + "/hq/members");
  out.flows["05"] = {
    result: "BLOCKED",
    reason: "no_church_tenant_hostname; product-hub /register controlled 404",
    register: (await req(new Jar(), BB + "/register")).status,
  };
  out.flows["06"] = {
    result: mem.status === 503 ? "FAIL" : mem.status === 200 ? "PARTIAL" : "FAIL",
    membershipStatus: mem.status,
    membersStatus: members.status,
    note: mem.status === 503 ? "/hq/membership foundation 503 on product hub" : null,
  };
  const brMem = await probe(br.jar, BB, "/branch-admin/members");
  out.screens.push(brMem);
  out.flows["07"] = {
    result: members.status === 200 && brMem.status === 200 ? "PARTIAL" : "FAIL",
    hqMembers: members.status,
    branchMembers: brMem.status,
    note: "Lists reachable; transfers not exercised without membership create",
  };
  out.flows["08"] = { result: "BLOCKED", reason: "visitor_register requires tenant hostname" };
  out.flows["09"] = {
    result: "BLOCKED",
    reason: "event/ministry register requires tenant hostname",
  };

  const annNew = await req(hq.jar, BB + "/hq/announcements/new");
  const annCreate = await follow(
    hq.jar,
    await req(hq.jar, BB + "/hq/announcements", {
      method: "POST",
      form: {
        _csrf: csrf(annNew.body),
        title: "V8 QA Ann " + Date.now().toString(36),
        body: "Disposable announcement for hosted QA persistence.",
        audience_public: "on",
        status: "draft",
        timezone: "Africa/Lusaka",
      },
      headers: { Referer: BB + "/hq/announcements/new" },
    }),
    BB
  );
  let annId = ((annCreate.headers.location || "") + annCreate.url + annCreate.body).match(
    /\/hq\/announcements\/([0-9a-f-]{36})/i
  );
  annId = annId && annId[1];
  if (annId) {
    const detail1 = await req(hq.jar, `${BB}/hq/announcements/${annId}`);
    const pubPage = await req(hq.jar, `${BB}/hq/announcements/${annId}/publish`);
    const pub = await follow(
      hq.jar,
      await req(hq.jar, `${BB}/hq/announcements/${annId}/publish`, {
        method: "POST",
        form: {
          _csrf: csrf(pubPage.body) || csrf(detail1.body),
          confirm_publish: "on",
          status: "published",
        },
        headers: { Referer: pubPage.url || detail1.url },
      }),
      BB
    );
    const reload = await req(hq.jar, `${BB}/hq/announcements/${annId}`);
    out.persistence.announcement = {
      annId,
      reloadStatus: reload.status,
      published: /published/i.test(reload.body),
    };
    out.flows["10"] = {
      result: pub.status < 400 && /published/i.test(reload.body) ? "PASS" : "PARTIAL",
      annId,
      publishStatus: pub.status,
      path: new URL(pub.url).pathname,
    };
    out.screens.push({
      path: `/hq/announcements/${annId}`,
      status: reload.status,
      title: title(reload.body),
    });
  } else {
    out.flows["10"] = {
      result: "FAIL",
      status: annCreate.status,
      path: new URL(annCreate.url).pathname,
      denied: denied(annCreate.body),
    };
  }

  const hqAnn = await probe(hq.jar, BB, "/hq/announcements");
  const brAnn = await probe(br.jar, BB, "/branch-admin/announcements");
  const studio = await probe(hq.jar, BB, "/hq/announcement-studio");
  out.flows["11"] = {
    result:
      hqAnn.status === 200 && brAnn.status === 200
        ? studio.status === 403 || studio.denied
          ? "PARTIAL"
          : "PASS"
        : "FAIL",
    hqAnnouncements: hqAnn.status,
    branchAnnouncements: brAnn.status,
    hqStudio: studio.status,
    note: "Shared announcement-studio gated; classic HQ/branch announcements work",
  };
  out.screens.push(brAnn);

  const pubAnn = await req(new Jar(), BB + "/announcements");
  out.flows["12"] = {
    result: "BLOCKED",
    reason:
      "public tenant announcements require church hostname; product-hub /announcements foundation",
    status: pubAnn.status,
    bodySnip: pubAnn.body.slice(0, 80),
  };

  const ac = await login(AC, creds.V8_QA_AC_ADMIN_EMAIL, creds.V8_QA_AC_PASSWORD);
  out.roles.ac = { path: new URL(ac.page.url).pathname, status: ac.page.status };
  const clinic = creds.V8_QA_AC_ORG_KEY;
  out.regression.acScreens = [];
  for (const p of [
    "/app",
    "/clinics",
    `/clinics/${clinic}`,
    `/clinics/${clinic}/services`,
    `/clinics/${clinic}/doctors`,
    `/clinics/${clinic}/book`,
    `/clinics/${clinic}/contact`,
    "/directory",
  ]) {
    out.regression.acScreens.push(await probe(ac.jar, AC, p));
  }
  out.regression.bookGet = await probe(new Jar(), AC, `/clinics/${clinic}/book`);
  out.regression.contactGet = await probe(new Jar(), AC, `/clinics/${clinic}/contact`);

  {
    const cj = new Jar();
    const cpage = await req(cj, `${AC}/clinics/${clinic}/contact`);
    const fields = fillFormFields(cpage.body, {
      __email: `qa+contact${Date.now()}@example.invalid`,
      __phone: "977001199",
      __name: "V8 QA Contact",
      __message: "Disposable inquiry hosted QA",
    });
    const action = ((cpage.body.match(/<form[^>]*action=["']([^"']*)["']/) || [])[1] || "").trim();
    const sub = await follow(
      cj,
      await req(cj, action ? new URL(action, AC).toString() : `${AC}/clinics/${clinic}/contact`, {
        method: "POST",
        form: fields,
        headers: { Referer: `${AC}/clinics/${clinic}/contact` },
      }),
      AC
    );
    out.regression.contactSubmit = {
      status: sub.status,
      path: new URL(sub.url).pathname,
      title: title(sub.body),
    };
  }

  {
    const bj = new Jar();
    const bpage = await req(bj, `${AC}/clinics/${clinic}/book`);
    const fields = fillFormFields(bpage.body, {
      __email: `qa+book${Date.now()}@example.invalid`,
      __phone: "977001188",
      __name: "V8 QA Booker",
      __message: "Disposable booking QA",
    });
    const action = ((bpage.body.match(/<form[^>]*action=["']([^"']*)["']/) || [])[1] || "").trim();
    const sub = await follow(
      bj,
      await req(bj, action ? new URL(action, AC).toString() : `${AC}/clinics/${clinic}/book`, {
        method: "POST",
        form: fields,
        headers: { Referer: `${AC}/clinics/${clinic}/book` },
      }),
      AC
    );
    out.regression.bookSubmit = {
      status: sub.status,
      path: new URL(sub.url).pathname,
      title: title(sub.body),
      denied: denied(sub.body),
      snip: sub.body.replace(/\s+/g, " ").slice(0, 180),
    };
  }

  out.regression.media = [];
  for (const [host, u] of [
    [BB, "/media/testing/platform/blessboard/brand/blessboard-small-church-logo.png"],
    [AC, "/media/testing/platform/activeclinic/clinic/julflona-hero.jpg"],
  ]) {
    const r = await req(new Jar(), host + u);
    out.regression.media.push({
      host,
      url: u,
      status: r.status,
      ct: r.headers["content-type"] || null,
      ok: r.status === 200,
    });
  }

  out.regression.register = {
    productHubRegister: (await req(new Jar(), BB + "/register")).status,
    registerChurch: (await req(new Jar(), BB + "/register-church")).status,
    apexRegister: (await req(new Jar(), APEX + "/register")).status,
  };

  out.regression.v7 = [];
  for (const h of ["https://blessboard.pronline.org", "https://activeclinic.pronline.org"]) {
    const hz = await req(new Jar(), h + "/healthz");
    try {
      const j = JSON.parse(hz.body);
      out.regression.v7.push({
        host: h,
        gitSha: j.gitSha,
        deploymentCode: j.deploymentCode,
        schemaCompatible: j.schemaCompatible,
      });
    } catch (e) {
      out.regression.v7.push({ host: h, status: hz.status });
    }
  }

  {
    const cj = new Jar();
    const cpage = await req(cj, `${AC}/clinics/${clinic}/contact`);
    const fields = fillFormFields(cpage.body, {
      __email: `qa+phoneconflict${Date.now()}@example.invalid`,
      __phone: "977001199",
      __name: "V8 QA Phone Conflict",
      __message: "Phone reuse probe",
    });
    const action = ((cpage.body.match(/<form[^>]*action=["']([^"']*)["']/) || [])[1] || "").trim();
    const sub = await follow(
      cj,
      await req(cj, action ? new URL(action, AC).toString() : `${AC}/clinics/${clinic}/contact`, {
        method: "POST",
        form: fields,
        headers: { Referer: `${AC}/clinics/${clinic}/contact` },
      }),
      AC
    );
    out.regression.phoneReuse = {
      status: sub.status,
      path: new URL(sub.url).pathname,
      title: title(sub.body),
      conflict: /conflict|already|exists|in use/i.test(sub.body),
    };
  }

  out.isolation.hqBranchForm = await probe(hq.jar, BB, "/branch-admin/form-studio");

  // defects summary
  if (out.flows["01"] && out.flows["01"].result === "PASS") {
    /* ok via branch */
  }
  const hqForm = out.screens.find((s) => s.path === "/hq/form-studio/new");
  if (hqForm && hqForm.denied) {
    out.defects.push({
      id: "V8-QA-HQ-FORM-STUDIO-DENIED",
      severity: "high",
      summary: "HQ /hq/form-studio/new returns soft Access denied despite org/system admin roles",
    });
  }
  if (out.flows["06"] && out.flows["06"].result === "FAIL") {
    out.defects.push({
      id: "V8-QA-HQ-MEMBERSHIP-503",
      severity: "high",
      summary: "/hq/membership returns foundation 503 on product hub",
    });
  }
  if (out.regression.bookSubmit && out.regression.bookSubmit.status === 403) {
    out.defects.push({
      id: "V8-QA-AC-BOOK-SUBMIT-403",
      severity: "high",
      summary: "Disposable AC clinic booking POST returns 403",
    });
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e.stack || e).slice(0, 1200) }));
  process.exit(2);
});
