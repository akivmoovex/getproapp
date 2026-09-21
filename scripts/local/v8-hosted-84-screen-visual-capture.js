#!/usr/bin/env node
'use strict';

/**
 * PROMPT 37 — Hosted 84-screen visual capture (V8 QA only).
 * Captures desktop 1440 and mobile 390 screenshots; never treats HTTP 200 alone as pass.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = '/tmp/v8-visual-audit';
const SHOT_DIR = path.join(OUT_DIR, 'shots');
const STITCH_DIR = path.join(OUT_DIR, 'stitch');
const BB = 'https://blessboard.neuniversity.org';
const HOSTED_SHA = 'bd2916bd3141';

function loadCreds() {
  const creds = {};
  for (const line of fs.readFileSync(path.join(ROOT, '.env.v8-qa-tenants.local'), 'utf8').split('\n')) {
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
  asPlaywrightCookies(url) {
    const u = new URL(url);
    return [...this.map].map(([name, value]) => ({
      name,
      value,
      domain: u.hostname,
      path: '/',
    }));
  }
}

function req(jar, url, opt = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = opt.form
      ? opt.form instanceof URLSearchParams
        ? opt.form.toString()
        : new URLSearchParams(opt.form).toString()
      : null;
    const headers = {
      'User-Agent': 'V8-Visual-Audit-Capture',
      Cookie: jar.header(),
      Accept: 'text/html,application/json',
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
        timeout: 60000,
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

function firstUuid(html, hint) {
  if (hint) {
    const re = new RegExp(String(hint).replace(/\//g, '\\/') + '/([0-9a-f-]{36})', 'i');
    const m = html.match(re);
    if (m) return m[1];
  }
  const m = html.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return m && m[1];
}

function titleOf(html) {
  return ((html.match(/<title>([^<]+)/i) || [])[1] || '').trim().slice(0, 120);
}

function isFailPage(html, status) {
  if (status >= 500) return true;
  if (status === 404) return true;
  const t = titleOf(html);
  if (/Unavailable|504 Gateway|Not found/i.test(t)) return true;
  if (/^Unavailable$/i.test(((html.match(/<h1[^>]*>([^<]+)/i) || [])[1] || '').trim())) return true;
  return false;
}

async function login(email, password) {
  const jar = new Jar();
  let page = await req(jar, `${BB}/login`);
  page = await follow(
    jar,
    await req(jar, `${BB}/login`, {
      method: 'POST',
      form: { _csrf: csrf(page.body), email, password },
      headers: { Referer: `${BB}/login` },
    }),
    BB
  );
  return jar;
}

async function discover(creds) {
  const org = creds.V8_QA_BB_ORG_KEY;
  const hq = await login(creds.V8_QA_BB_HQ_EMAIL, creds.V8_QA_BB_PASSWORD);
  const branch = await login(creds.V8_QA_BB_BRANCH_EMAIL, creds.V8_QA_BB_PASSWORD);
  const out = { org, hostedSha: HOSTED_SHA };

  const forms = await req(hq, `${BB}/hq/form-studio`);
  out.formId = firstUuid(forms.body, '/hq/form-studio');
  out.formIds = [...forms.body.matchAll(/\/hq\/form-studio\/([0-9a-f-]{36})/gi)].map((m) => m[1]);
  out.formIds = [...new Set(out.formIds)];

  if (out.formId) {
    const sharing = await req(hq, `${BB}/hq/form-studio/${out.formId}/sharing`);
    out.publicToken = ((sharing.body.match(/\/f\/([a-zA-Z0-9_-]+)/) || [])[1]) || null;
    const subs = await req(hq, `${BB}/hq/form-studio/${out.formId}/submissions`);
    out.submissionId = firstUuid(subs.body, '/submissions');
  }

  const members = await req(hq, `${BB}/hq/members`);
  out.memberId = firstUuid(members.body, '/hq/members');

  const memForms = await req(hq, `${BB}/hq/membership/forms`);
  out.membershipFormId = firstUuid(memForms.body, '/hq/membership/forms');
  out.membershipForms = { status: memForms.status, title: titleOf(memForms.body), h1: ((memForms.body.match(/<h1[^>]*>([^<]+)/i) || [])[1] || '').trim() };

  const regs = await req(branch, `${BB}/branch-admin/registrations`);
  out.regId = firstUuid(regs.body);

  const anns = await req(hq, `${BB}/hq/announcements`);
  out.annId = firstUuid(anns.body, '/hq/announcements');

  const studioList = await req(hq, `${BB}/hq/announcement-studio`);
  out.studioAnnId = firstUuid(studioList.body, '/hq/announcement-studio');
  if (!out.studioAnnId) {
    // create one for AN02–AN05
    const neu = await req(hq, `${BB}/hq/announcement-studio/new`);
    const token = csrf(neu.body);
    if (token) {
      const created = await follow(
        hq,
        await req(hq, `${BB}/hq/announcement-studio`, {
          method: 'POST',
          form: {
            _csrf: token,
            title: `P37 Studio Ann ${Date.now().toString(36).slice(-6)}`,
            body: 'Visual audit disposable announcement.',
            audience: 'public',
          },
          headers: { Referer: `${BB}/hq/announcement-studio/new` },
        }),
        BB
      );
      out.studioAnnId = firstUuid(created.headers.location || created.body || '', '/hq/announcement-studio') || firstUuid(created.body, '/hq/announcement-studio');
      out.studioCreate = { status: created.status, title: titleOf(created.body), loc: created.headers.location || null };
    }
  }

  // Event / ministry IDs from activity forms page or prior seeded public paths
  const activity = await req(hq, `${BB}/hq/activity-forms`);
  out.eventId = firstUuid(activity.body, '/events') || ((activity.body.match(/event[_-]?id["'=:\s]+([0-9a-f-]{36})/i) || [])[1]);
  out.ministryId = firstUuid(activity.body, '/ministries') || ((activity.body.match(/ministry[_-]?id["'=:\s]+([0-9a-f-]{36})/i) || [])[1]);

  // Probe known seeded IDs from prior overnight flows if present in HTML hidden fields
  const visit = await req(new Jar(), `${BB}/c/${org}/visit`);
  out.visitOk = visit.status === 200 && !isFailPage(visit.body, visit.status);

  // Transfer: try create from member profile if transfer form present
  if (out.memberId) {
    const profile = await req(hq, `${BB}/hq/members/${out.memberId}`);
    const transferCsrf = csrf(profile.body);
    const branchOpts = [...profile.body.matchAll(/<option[^>]*value=["']([0-9a-f-]{36})["'][^>]*>/gi)].map((m) => m[1]);
    out.transferBranchCandidates = branchOpts.slice(0, 5);
    if (transferCsrf && branchOpts.length) {
      const toBranch = branchOpts.find((id) => !profile.body.includes(`selected`) ) || branchOpts[0];
      const tr = await follow(
        hq,
        await req(hq, `${BB}/hq/membership/members/${out.memberId}/transfer`, {
          method: 'POST',
          form: {
            _csrf: transferCsrf,
            to_branch_id: toBranch,
            confirm_transfer: '1',
            reason: 'P37 visual audit disposable transfer',
          },
          headers: { Referer: `${BB}/hq/members/${out.memberId}` },
        }),
        BB
      );
      out.transferId = firstUuid(tr.headers.location || '', '/transfers') || firstUuid(tr.body, '/transfers');
      out.transferAttempt = { status: tr.status, title: titleOf(tr.body), loc: tr.headers.location || null };
    }
  }

  // Platform admin forms
  const plat = await req(hq, `${BB}/admin/forms`);
  out.platformForms = { status: plat.status, title: titleOf(plat.body), fail: isFailPage(plat.body, plat.status) };

  // Public announcements list variants
  for (const p of [`/c/${org}/announcements`, `/c/${org}/news`, `/announcements`]) {
    const r = await req(new Jar(), `${BB}${p}`);
    out[`public_${p}`] = { status: r.status, title: titleOf(r.body), fail: isFailPage(r.body, r.status) };
  }

  // Find event/ministry via membership activity HTML or form studio categories
  // Scan form studio pages for activity links
  for (const fid of out.formIds.slice(0, 8)) {
    const pub = await req(hq, `${BB}/hq/form-studio/${fid}/publication`);
    const ev = (pub.body.match(/\/c\/[^/]+\/events\/([0-9a-f-]{36})\/register/i) || [])[1];
    const mi = (pub.body.match(/\/c\/[^/]+\/ministries\/([0-9a-f-]{36})\/register/i) || [])[1];
    if (ev && !out.eventId) out.eventId = ev;
    if (mi && !out.ministryId) out.ministryId = mi;
  }

  // Last resort: pull from prior report artifacts if present
  const prior = path.join(ROOT, 'docs/releases/V8_HOSTED_END_TO_END_QA_REPORT.md');
  if (fs.existsSync(prior)) {
    const txt = fs.readFileSync(prior, 'utf8');
    if (!out.eventId) out.eventId = ((txt.match(/events\/([0-9a-f-]{36})\/register/i) || [])[1]) || null;
    if (!out.ministryId) out.ministryId = ((txt.match(/ministries\/([0-9a-f-]{36})\/register/i) || [])[1]) || null;
  }

  fs.writeFileSync(path.join(OUT_DIR, 'live-ids.json'), JSON.stringify(out, null, 2));
  return { hq, branch, ids: out, creds };
}

function buildMatrix(ids) {
  const org = ids.org;
  const fid = ids.formId;
  const tok = ids.publicToken;
  const sid = ids.submissionId;
  const mid = ids.memberId;
  const rid = ids.regId;
  const aid = ids.annId;
  const said = ids.studioAnnId;
  const mfid = ids.membershipFormId;
  const eid = ids.eventId;
  const minid = ids.ministryId;
  const tid = ids.transferId;

  /** @type {Array<{code:string,auth:'hq'|'branch'|'public'|'none',url:string|null,prep?:string,note?:string}>} */
  const screens = [
    { code: 'SH01', auth: 'hq', url: `${BB}/hq/form-studio` },
    { code: 'SH02', auth: 'hq', url: null, note: 'Empty dashboard requires zero forms; tenant has forms — capture blocked for empty-state UI' },
    { code: 'SH03', auth: 'hq', url: fid ? `${BB}/hq/form-studio/${fid}/studio` : null },
    { code: 'SH04', auth: 'hq', url: fid ? `${BB}/hq/form-studio/${fid}/studio` : null, prep: 'openFieldSettings' },
    { code: 'SH05', auth: 'hq', url: fid ? `${BB}/hq/form-studio/${fid}/preview` : null },
    { code: 'SH06', auth: 'hq', url: fid ? `${BB}/hq/form-studio/${fid}/publication` : null },
    { code: 'SH07', auth: 'hq', url: fid ? `${BB}/hq/form-studio/${fid}/sharing` : null },
    { code: 'SH08', auth: 'public', url: tok ? `${BB}/f/${tok}` : null },
    { code: 'SH09', auth: 'public', url: tok ? `${BB}/f/${tok}` : null, prep: 'validationErrors' },
    { code: 'SH10', auth: 'public', url: tok ? `${BB}/f/${tok}` : null, prep: 'submitThanks' },
    { code: 'SH11', auth: 'hq', url: fid ? `${BB}/hq/form-studio/${fid}/submissions` : null },
    { code: 'SH12', auth: 'hq', url: fid && sid ? `${BB}/hq/form-studio/${fid}/submissions/${sid}` : null },
    { code: 'SH13', auth: 'hq', url: fid && sid ? `${BB}/hq/form-studio/${fid}/submissions/${sid}` : null, prep: 'scrollReview' },
    { code: 'SH14', auth: 'hq', url: `${BB}/admin/forms`, note: 'Requires platform admin; HQ gets 403/unavailable' },
    { code: 'SH15', auth: 'branch', url: `${BB}/hq/form-studio` },

    { code: 'BB01', auth: 'hq', url: `${BB}/hq/membership/forms` },
    { code: 'BB02', auth: 'hq', url: mfid ? `${BB}/hq/membership/forms/${mfid}` : `${BB}/hq/membership/forms` },
    { code: 'BB03', auth: 'public', url: `${BB}/c/${org}/register` },
    { code: 'BB04', auth: 'public', url: `${BB}/c/${org}/register`, prep: 'registerStep2' },
    { code: 'BB05', auth: 'public', url: `${BB}/c/${org}/register`, prep: 'registerStep3' },
    { code: 'BB06', auth: 'public', url: `${BB}/c/${org}/register`, prep: 'registerStep4' },
    { code: 'BB07', auth: 'public', url: `${BB}/c/${org}/register/submitted?ref=p37-visual` },
    { code: 'BB08', auth: 'public', url: `${BB}/c/${org}/visit` },
    { code: 'BB09', auth: 'public', url: eid ? `${BB}/c/${org}/events/${eid}/register` : null, note: eid ? null : 'No event ID on disposable tenant' },
    { code: 'BB10', auth: 'public', url: minid ? `${BB}/c/${org}/ministries/${minid}/register` : null, note: minid ? null : 'No ministry ID on disposable tenant' },
    { code: 'BB11', auth: 'branch', url: `${BB}/branch-admin/registrations` },
    { code: 'BB12', auth: 'branch', url: rid ? `${BB}/branch-admin/registrations/${rid}` : null },
    { code: 'BB13', auth: 'branch', url: rid ? `${BB}/branch-admin/registrations/${rid}` : null, prep: 'scrollDecision' },
    { code: 'BB14', auth: 'hq', url: mid ? `${BB}/hq/members/${mid}` : null },
    { code: 'BB15', auth: 'hq', url: mid ? `${BB}/hq/members/${mid}` : null, prep: 'openMemberEdit' },
    { code: 'BB16', auth: 'hq', url: tid ? `${BB}/hq/membership/transfers/${tid}` : mid ? `${BB}/hq/members/${mid}` : null, prep: tid ? null : 'showTransferPanel', note: tid ? null : 'Transfer UI on member profile if no open transfer' },
    { code: 'BB17', auth: 'hq', url: `${BB}/hq/members` },
    { code: 'BB18', auth: 'branch', url: `${BB}/branch-admin/members` },
    { code: 'BB19', auth: 'hq', url: `${BB}/hq/announcements` },
    { code: 'BB20', auth: 'hq', url: aid ? `${BB}/hq/announcements/${aid}/edit` : `${BB}/hq/announcements/new` },
    { code: 'BB21', auth: 'public', url: aid ? `${BB}/c/${org}/announcements/${aid}` : null, note: 'List route 404; capturing public detail as closest public surface if list missing' },
    { code: 'BB22', auth: 'public', url: aid ? `${BB}/c/${org}/announcements/${aid}` : null },

    { code: 'AN01', auth: 'hq', url: `${BB}/hq/announcement-studio` },
    { code: 'AN02', auth: 'hq', url: said ? `${BB}/hq/announcement-studio/${said}` : `${BB}/hq/announcement-studio/new` },
    { code: 'AN03', auth: 'hq', url: said ? `${BB}/hq/announcement-studio/${said}/schedule` : null },
    { code: 'AN04', auth: 'hq', url: said ? `${BB}/hq/announcement-studio/${said}/preview` : null },
    { code: 'AN05', auth: 'hq', url: said ? `${BB}/hq/announcement-studio/${said}/confirm-publish` : null },
  ];

  const rows = [];
  for (const s of screens) {
    rows.push({ ...s, viewport: 'D', width: 1440, height: 900 });
    rows.push({ ...s, viewport: 'M', width: 390, height: 844 });
  }
  return rows;
}

async function applyPrep(page, prep, ctx) {
  if (!prep) return;
  if (prep === 'openFieldSettings') {
    const field = page.locator('[data-field-key], .mx-forms-field, .mx-field-card, button:has-text("Settings"), button:has-text("Edit field")').first();
    if (await field.count()) {
      await field.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(400);
    }
  }
  if (prep === 'validationErrors') {
    const submit = page.locator('button[type="submit"], input[type="submit"]').first();
    if (await submit.count()) {
      await submit.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(800);
    }
  }
  if (prep === 'submitThanks') {
    // Fill required-looking fields loosely then submit
    const inputs = page.locator('form input:not([type=hidden]):not([type=submit]), form textarea, form select');
    const n = await inputs.count();
    for (let i = 0; i < Math.min(n, 12); i++) {
      const el = inputs.nth(i);
      const type = await el.getAttribute('type');
      const tag = await el.evaluate((e) => e.tagName.toLowerCase());
      try {
        if (tag === 'select') {
          const opts = el.locator('option');
          if ((await opts.count()) > 1) await el.selectOption({ index: 1 });
        } else if (type === 'email') await el.fill(`p37.${Date.now()}@example.invalid`);
        else if (type === 'checkbox' || type === 'radio') await el.check({ force: true }).catch(() => {});
        else if (type === 'number') await el.fill('1');
        else await el.fill('P37 Visual Audit');
      } catch (_) {}
    }
    const submit = page.locator('button[type="submit"], input[type="submit"]').first();
    if (await submit.count()) {
      await submit.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1200);
    }
  }
  if (prep === 'scrollReview' || prep === 'scrollDecision') {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
  }
  if (prep === 'openMemberEdit') {
    const btn = page.locator('button:has-text("Edit"), a:has-text("Edit"), summary:has-text("Edit"), [data-bb-member-edit]').first();
    if (await btn.count()) await btn.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
  if (prep === 'showTransferPanel') {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const btn = page.locator('button:has-text("Transfer"), a:has-text("Transfer"), summary:has-text("Transfer")').first();
    if (await btn.count()) await btn.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
  if (prep && prep.startsWith('registerStep')) {
    const step = Number(prep.replace('registerStep', ''));
    for (let s = 1; s < step; s++) {
      // fill minimal on current step
      const textInputs = page.locator('form input[type="text"], form input:not([type]), form input[type="email"], form input[type="tel"]');
      const count = await textInputs.count();
      for (let i = 0; i < Math.min(count, 6); i++) {
        const el = textInputs.nth(i);
        const type = (await el.getAttribute('type')) || 'text';
        const name = (await el.getAttribute('name')) || '';
        try {
          if (type === 'email' || /email/i.test(name)) await el.fill(`p37.step${s}.${Date.now()}@example.invalid`);
          else if (/phone|tel/i.test(name) || type === 'tel') await el.fill('+15555550100');
          else await el.fill(`P37 Step${s} Value`);
        } catch (_) {}
      }
      const next = page.locator('button:has-text("Next"), button:has-text("Continue"), a:has-text("Next")').first();
      if (await next.count()) {
        await next.click({ timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(700);
      } else break;
    }
  }
}

async function captureAll(ctx) {
  const { hq, branch, ids } = ctx;
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const matrix = buildMatrix(ids);
  fs.writeFileSync(path.join(OUT_DIR, 'route-matrix.json'), JSON.stringify(matrix, null, 2));

  const browser = await chromium.launch({ headless: true });
  const results = [];

  async function contextFor(auth) {
    const c = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent: 'V8-Visual-Audit-Playwright',
    });
    if (auth === 'hq') await c.addCookies(hq.asPlaywrightCookies(BB));
    if (auth === 'branch') await c.addCookies(branch.asPlaywrightCookies(BB));
    return c;
  }

  // Reuse contexts per auth
  const contexts = {
    hq: await contextFor('hq'),
    branch: await contextFor('branch'),
    public: await contextFor('public'),
    none: await contextFor('none'),
  };

  for (const row of matrix) {
    const codeVp = `${row.code}-${row.viewport}`;
    const shotPath = path.join(SHOT_DIR, `${codeVp}.png`);
    const entry = {
      code: row.code,
      viewport: row.viewport,
      width: row.width,
      url: row.url,
      auth: row.auth,
      prep: row.prep || null,
      note: row.note || null,
      screenshot: null,
      finalUrl: null,
      title: null,
      h1: null,
      httpLike: null,
      blocked: false,
      blockReason: null,
      overflowX: null,
      bodyTextSample: null,
    };

    if (!row.url) {
      entry.blocked = true;
      entry.blockReason = row.note || 'No hosted URL resolved for disposable tenant';
      results.push(entry);
      console.log(`BLOCKED ${codeVp}: ${entry.blockReason}`);
      continue;
    }

    const context = contexts[row.auth] || contexts.public;
    const page = await context.newPage();
    try {
      await page.setViewportSize({ width: row.width, height: row.height });
      const resp = await page.goto(row.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(600);
      await applyPrep(page, row.prep, ctx);
      await page.waitForTimeout(400);

      entry.finalUrl = page.url();
      entry.title = await page.title();
      entry.h1 = await page.locator('h1').first().textContent().catch(() => null);
      entry.httpLike = resp ? resp.status() : null;
      const html = await page.content();
      const status = entry.httpLike || 0;

      if (isFailPage(html, status) || (row.code === 'SH14' && (status === 403 || /Unavailable|Forbidden|Access/i.test(entry.title || '')))) {
        // SH15 expects access denied — that is success, not block
        if (row.code === 'SH15' && (status === 403 || /access|denied|permission/i.test(html.slice(0, 4000)))) {
          entry.blocked = false;
        } else if (row.code === 'SH14') {
          entry.blocked = true;
          entry.blockReason = `Platform admin forms inaccessible to QA HQ (status ${status})`;
        } else if (status >= 500 || /Unavailable|504/i.test(entry.title || '')) {
          entry.blocked = true;
          entry.blockReason = `Hosted page unavailable (status ${status}, title ${entry.title})`;
        } else if (status === 404) {
          entry.blocked = true;
          entry.blockReason = `Not found (404)`;
        }
      }

      entry.overflowX = await page.evaluate(() => {
        const doc = document.documentElement;
        return {
          scrollWidth: doc.scrollWidth,
          clientWidth: doc.clientWidth,
          overflow: doc.scrollWidth > doc.clientWidth + 1,
        };
      });
      entry.bodyTextSample = await page.evaluate(() => (document.body && document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 400));

      if (!entry.blocked) {
        await page.screenshot({ path: shotPath, fullPage: true });
        entry.screenshot = shotPath;
      } else {
        // still capture evidence of block
        await page.screenshot({ path: shotPath, fullPage: true }).catch(() => {});
        entry.screenshot = fs.existsSync(shotPath) ? shotPath : null;
      }
      console.log(`${entry.blocked ? 'BLOCKED' : 'SHOT'} ${codeVp} ${entry.finalUrl} :: ${entry.title}`);
    } catch (e) {
      entry.blocked = true;
      entry.blockReason = `Navigation/capture error: ${e.message}`;
      console.log(`ERROR ${codeVp}: ${e.message}`);
    } finally {
      await page.close();
    }
    results.push(entry);
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT_DIR, 'capture-results.json'), JSON.stringify(results, null, 2));
  return results;
}

async function downloadStitchRefs() {
  const index = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'stitch-index.json'), 'utf8'));
  fs.mkdirSync(STITCH_DIR, { recursive: true });
  const downloaded = [];
  for (const [code, meta] of Object.entries(index)) {
    if (!meta.screenshotUrl) continue;
    const dest = path.join(STITCH_DIR, `${code}.png`);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      downloaded.push({ code, path: dest, cached: true });
      continue;
    }
    try {
      await new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https
          .get(meta.screenshotUrl, (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              https.get(res.headers.location, (res2) => {
                res2.pipe(file);
                file.on('finish', () => {
                  file.close();
                  resolve();
                });
              }).on('error', reject);
              return;
            }
            res.pipe(file);
            file.on('finish', () => {
              file.close();
              resolve();
            });
          })
          .on('error', reject);
      });
      downloaded.push({ code, path: dest, bytes: fs.statSync(dest).size });
      process.stdout.write(`stitch ${code}\n`);
    } catch (e) {
      downloaded.push({ code, error: e.message });
    }
  }
  fs.writeFileSync(path.join(OUT_DIR, 'stitch-downloads.json'), JSON.stringify(downloaded, null, 2));
  return downloaded;
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const creds = loadCreds();
  console.log('Discovering live IDs…');
  const ctx = await discover(creds);
  console.log(JSON.stringify(ctx.ids, null, 2));
  console.log('Downloading Stitch references…');
  await downloadStitchRefs();
  console.log('Capturing hosted screens…');
  const results = await captureAll(ctx);
  const blocked = results.filter((r) => r.blocked).length;
  const shot = results.filter((r) => r.screenshot && !r.blocked).length;
  console.log(JSON.stringify({ total: results.length, captured: shot, blocked }, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
