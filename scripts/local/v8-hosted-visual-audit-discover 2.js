#!/usr/bin/env node
'use strict';

const fs = require('fs');
const https = require('https');
const { URL } = require('url');

const CRED_PATH = '.env.v8-qa-tenants.local';
const OUT = '/tmp/v8-visual-audit/live-ids.json';

function loadCreds() {
  const creds = {};
  for (const line of fs.readFileSync(CRED_PATH, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) creds[m[1]] = m[2];
  }
  return creds;
}

class Jar {
  constructor() {
    this.map = new Map();
  }
  absorb(headers) {
    for (const raw of [].concat(headers['set-cookie'] || [])) {
      const p = String(raw).split(';')[0];
      const i = p.indexOf('=');
      if (i > 0) this.map.set(p.slice(0, i), p.slice(i + 1));
    }
  }
  header() {
    return [...this.map].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

function req(jar, url, opt = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = opt.form ? new URLSearchParams(opt.form).toString() : null;
    const headers = {
      'User-Agent': 'V8-Visual-Discover',
      Cookie: jar.header(),
      Accept: 'text/html',
      ...(opt.headers || {}),
    };
    if (body) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    const r = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: opt.method || 'GET',
        headers,
        timeout: 45000,
      },
      (res) => {
        jar.absorb(res.headers);
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
            url: u.toString(),
          })
        );
      }
    );
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

async function follow(jar, res, origin) {
  let cur = res;
  for (let i = 0; i < 10; i++) {
    if (![301, 302, 303, 307, 308].includes(cur.status)) return cur;
    const loc = cur.headers.location;
    if (!loc) return cur;
    cur = await req(jar, loc.startsWith('http') ? loc : origin + loc);
  }
  return cur;
}

function csrf(html) {
  const m = html.match(/name=["']_csrf["'][^>]*value=["']([^"']+)/i);
  return m && m[1];
}

function firstUuid(html, pathHint) {
  if (pathHint) {
    const re = new RegExp(pathHint.replace(/\//g, '\\/') + '/([0-9a-f-]{36})', 'i');
    const m = html.match(re);
    if (m) return m[1];
  }
  const m = html.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return m && m[1];
}

function titleOf(html) {
  return ((html.match(/<title>([^<]+)/i) || [])[1] || '').trim().slice(0, 120);
}

(async () => {
  const creds = loadCreds();
  const BB = 'https://blessboard.neuniversity.org';
  const ORG = creds.V8_QA_BB_ORG_KEY;
  const jar = new Jar();

  let page = await req(jar, `${BB}/login`);
  page = await follow(
    jar,
    await req(jar, `${BB}/login`, {
      method: 'POST',
      form: {
        _csrf: csrf(page.body),
        email: creds.V8_QA_BB_HQ_EMAIL,
        password: creds.V8_QA_BB_PASSWORD,
      },
      headers: { Referer: `${BB}/login` },
    }),
    BB
  );

  const out = {
    org: ORG,
    hqEmail: creds.V8_QA_BB_HQ_EMAIL,
    branchEmail: creds.V8_QA_BB_BRANCH_EMAIL,
    password: creds.V8_QA_BB_PASSWORD,
    loginLanded: ((page.headers.location || page.url || '') + ' ' + titleOf(page.body)).slice(0, 160),
  };

  const forms = await req(jar, `${BB}/hq/form-studio`);
  out.formId = firstUuid(forms.body, '/hq/form-studio');
  out.formStudioStatus = forms.status;

  const members = await req(jar, `${BB}/hq/members`);
  out.memberId = firstUuid(members.body, '/hq/members');

  const anns = await req(jar, `${BB}/hq/announcements`);
  out.annId = firstUuid(anns.body, '/hq/announcements');
  out.announcementsTitle = titleOf(anns.body);

  const annStudio = await req(jar, `${BB}/hq/announcement-studio`);
  out.annStudio = { status: annStudio.status, title: titleOf(annStudio.body) };

  const regs = await req(jar, `${BB}/branch-admin/registrations`);
  out.regId = firstUuid(regs.body);

  if (out.formId) {
    const sharing = await req(jar, `${BB}/hq/form-studio/${out.formId}/sharing`);
    out.publicToken = ((sharing.body.match(/\/f\/([a-zA-Z0-9_-]+)/) || [])[1]) || null;
    const subs = await req(jar, `${BB}/hq/form-studio/${out.formId}/submissions`);
    out.submissionId = firstUuid(subs.body, '/submissions');
  }

  const visit = await req(new Jar(), `${BB}/c/${ORG}/visit`);
  out.visitOk = visit.status === 200 && /Full name|consent|Visitor/i.test(visit.body);

  const events = await req(jar, `${BB}/hq/events`);
  out.eventId = firstUuid(events.body, '/hq/events') || firstUuid(events.body, '/events');

  const ministries = await req(jar, `${BB}/hq/ministries`);
  out.ministryId = firstUuid(ministries.body, '/hq/ministries') || firstUuid(ministries.body, '/ministries');

  const transfers = await req(jar, `${BB}/hq/membership/transfers`);
  out.transfers = { status: transfers.status, title: titleOf(transfers.body) };

  const platform = await req(jar, `${BB}/platform-admin/forms`);
  out.platformForms = { status: platform.status, title: titleOf(platform.body) };

  // Branch login for deny path probe
  const bjar = new Jar();
  let bp = await req(bjar, `${BB}/login`);
  bp = await follow(
    bjar,
    await req(bjar, `${BB}/login`, {
      method: 'POST',
      form: {
        _csrf: csrf(bp.body),
        email: creds.V8_QA_BB_BRANCH_EMAIL,
        password: creds.V8_QA_BB_PASSWORD,
      },
      headers: { Referer: `${BB}/login` },
    }),
    BB
  );
  const denied = await req(bjar, `${BB}/hq/form-studio`);
  out.branchDeniedFormStudio = {
    status: denied.status,
    title: titleOf(denied.body),
    hasDenied: /denied|403|not authorized|permission|access/i.test(denied.body),
  };

  fs.mkdirSync('/tmp/v8-visual-audit', { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
