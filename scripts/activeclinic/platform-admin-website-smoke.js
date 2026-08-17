"use strict";

/**
 * Testing-only Platform Admin website-changes smoke.
 * Uses hosted testing DB identity moovex-platform-v7 / testing.
 * Does not touch production. Does not deploy.
 */

const { Pool } = require("pg");
const request = require("supertest");
const { requireDatabaseUrl } = require("../../db/scripts/lib/databaseUrl");
const { buildFoundationPoolConfig } = require("../../db/scripts/lib/foundationPool");
const {
  createMoovexPlatformRuntimeApp,
  buildDefaultProductApps,
} = require("../../src/platform/http/moovexPlatformRuntimeServer");
const { CSRF_FIELD, getCsrfCookieName } = require("../../src/platform/http/v5Csrf");
const { getV5SessionCookieName } = require("../../src/platform/session/v5SessionCookie");
const {
  CODE_MOOVEX_PLATFORM_TESTING,
} = require("../../src/platform/config/deploymentProfiles");

const BB_HOST = "blessboard.pronline.org";
const AC_HOST = "activeclinic.pronline.org";
const CLINIC_KEY = "activeclinic-demo";
const MARKER = `QA-WEBSITE-CHECKPOINT-${Date.now()}`;
const PA_EMAIL = "platform-admin@example.test";
const PA_PASSWORDS = ["12345678", "1234567890"];
const CLINIC_ADMIN_EMAIL = "demo_organization_admin@demo.activeclinic.example";
const CLINIC_ADMIN_PASSWORD = "1234567890";

const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail: detail || "" });
  const tag = ok ? "PASS" : "FAIL";
  console.log(`${tag}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function extractCookie(res, name) {
  const raw = res.headers["set-cookie"];
  if (!raw) return null;
  const list = Array.isArray(raw) ? raw : [raw];
  for (const line of list) {
    if (String(line).startsWith(`${name}=`)) {
      return String(line).split(";")[0].slice(name.length + 1);
    }
  }
  return null;
}

function mergeCookies(existing, res) {
  const map = new Map();
  for (const part of String(existing || "").split(";").map((s) => s.trim()).filter(Boolean)) {
    const i = part.indexOf("=");
    if (i > 0) map.set(part.slice(0, i), part.slice(i + 1));
  }
  for (const line of [].concat((res && res.headers && res.headers["set-cookie"]) || [])) {
    const pair = String(line).split(";")[0];
    const i = pair.indexOf("=");
    if (i > 0) map.set(pair.slice(0, i), pair.slice(i + 1));
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function extractCsrfField(html) {
  const match = String(html || "").match(/name="_csrf" value="([^"]+)"/);
  return match ? match[1] : "";
}

async function main() {
  const identityAbort = { ok: false };
  const url = requireDatabaseUrl();
  const pool = new Pool({ ...buildFoundationPoolConfig(url), max: 8 });
  let app;
  try {
    const id = await pool.query(
      `SELECT identity_key, environment_code FROM platform.database_identity LIMIT 1`
    );
    const identity = id.rows[0] || {};
    if (
      identity.identity_key !== "moovex-platform-v7" ||
      String(identity.environment_code) !== "testing"
    ) {
      console.error("ABORT: database identity is not moovex-platform-v7 / testing", identity);
      process.exitCode = 2;
      return;
    }
    identityAbort.ok = true;
    record("db_identity", true, `${identity.identity_key}/${identity.environment_code}`);

    const env = { ...process.env };
    if (!env.PLATFORM_DEPLOYMENT_CODE) {
      env.PLATFORM_DEPLOYMENT_CODE = CODE_MOOVEX_PLATFORM_TESTING;
    }
    if (!env.DEPLOYMENT_ENV) env.DEPLOYMENT_ENV = "testing";
    if (!env.DATABASE_IDENTITY_EXPECTED) env.DATABASE_IDENTITY_EXPECTED = "moovex-platform-v7";
    if (!env.DATABASE_IDENTITY_ENV) env.DATABASE_IDENTITY_ENV = "testing";
    if (!env.SESSION_SECRET || String(env.SESSION_SECRET).length < 32) {
      env.SESSION_SECRET = "testing-smoke-session-secret-do-not-use-in-prod-32";
    }
    const csrfCookieName = getCsrfCookieName(env);
    const sessionCookieName = getV5SessionCookieName(env);
    record(
      "cookie_names",
      sessionCookieName === "moovex_platform_testing_sid",
      `${sessionCookieName} / ${csrfCookieName}`
    );

    const productApps = buildDefaultProductApps({ env, getPool: () => pool });
    app = createMoovexPlatformRuntimeApp({ env, getPool: () => pool, productApps });

    async function loginPa(password) {
      const getLogin = await request(app).get("/login").set("Host", BB_HOST);
      const csrfCookie = extractCookie(getLogin, csrfCookieName);
      const field = extractCsrfField(getLogin.text);
      const res = await request(app)
        .post("/login")
        .set("Host", BB_HOST)
        .set("Cookie", `${csrfCookieName}=${csrfCookie}`)
        .set("Accept", "text/html")
        .type("form")
        .send({ [CSRF_FIELD]: field, email: PA_EMAIL, password });
      return { getLogin, res, csrfCookie };
    }

    const unauthInbox = await request(app).get("/admin/website-changes").set("Host", BB_HOST);
    const unauthLoc = String(unauthInbox.headers.location || "");
    record(
      "unauthenticated_inbox_denied",
      unauthInbox.status === 302 || unauthInbox.status === 303 || unauthInbox.status === 401,
      `status=${unauthInbox.status} loc=${unauthLoc.slice(0, 80)}`
    );

    let paLogin = null;
    let usedPasswordIndex = -1;
    for (let i = 0; i < PA_PASSWORDS.length; i += 1) {
      paLogin = await loginPa(PA_PASSWORDS[i]);
      if (paLogin.res.status === 303 || paLogin.res.status === 302) {
        usedPasswordIndex = i;
        break;
      }
    }
    const paLoc = String(paLogin.res.headers.location || "");
    const paSid = extractCookie(paLogin.res, sessionCookieName);
    record(
      "platform_admin_login",
      Boolean(paSid) && (paLoc === "/admin" || paLoc.startsWith("/admin")),
      `status=${paLogin.res.status} loc=${paLoc} sid=${Boolean(paSid)} pwIndex=${usedPasswordIndex}`
    );
    if (!paSid) {
      record("platform_admin_login_body", false, String(paLogin.res.text || "").slice(0, 240));
      throw new Error("platform admin login failed");
    }
    let paCookies = mergeCookies(
      `${csrfCookieName}=${paLogin.csrfCookie}; ${sessionCookieName}=${paSid}`,
      paLogin.res
    );

    const adminHome = await request(app).get("/admin").set("Host", BB_HOST).set("Cookie", paCookies);
    paCookies = mergeCookies(paCookies, adminHome);
    record(
      "platform_admin_shell",
      adminHome.status === 200 && /Website Changes|website-changes/i.test(adminHome.text),
      `status=${adminHome.status}`
    );

    const inbox = await request(app)
      .get("/admin/website-changes")
      .set("Host", BB_HOST)
      .set("Cookie", paCookies);
    paCookies = mergeCookies(paCookies, inbox);
    record(
      "website_changes_inbox_opens",
      inbox.status === 200 && /Website Changes/i.test(inbox.text),
      `status=${inbox.status} bytes=${(inbox.text || "").length}`
    );

    async function loginClinicAdmin() {
      const getLogin = await request(app).get("/login").set("Host", AC_HOST);
      const csrfCookie = extractCookie(getLogin, csrfCookieName);
      const field = extractCsrfField(getLogin.text);
      const res = await request(app)
        .post("/login")
        .set("Host", AC_HOST)
        .set("Cookie", `${csrfCookieName}=${csrfCookie}`)
        .set("Accept", "text/html")
        .type("form")
        .send({
          [CSRF_FIELD]: field,
          identifier: CLINIC_ADMIN_EMAIL,
          password: CLINIC_ADMIN_PASSWORD,
        });
      return { getLogin, res, csrfCookie };
    }

    const clinicLogin = await loginClinicAdmin();
    const clinicSid = extractCookie(clinicLogin.res, sessionCookieName);
    record(
      "clinic_admin_login",
      Boolean(clinicSid) && (clinicLogin.res.status === 303 || clinicLogin.res.status === 302 || clinicLogin.res.status === 200),
      `status=${clinicLogin.res.status} loc=${clinicLogin.res.headers.location || ""} sid=${Boolean(clinicSid)}`
    );
    if (!clinicSid) {
      throw new Error("clinic admin login failed");
    }
    let clinicCookies = mergeCookies(
      `${csrfCookieName}=${clinicLogin.csrfCookie}; ${sessionCookieName}=${clinicSid}`,
      clinicLogin.res
    );

    const editorPage = await request(app)
      .get(`/clinics/${CLINIC_KEY}?website_edit=1&website_mode=draft`)
      .set("Host", AC_HOST)
      .set("Cookie", clinicCookies);
    clinicCookies = mergeCookies(clinicCookies, editorPage);
    const editorCsrf = extractCookie(editorPage, csrfCookieName) || extractCsrfField(editorPage.text);
    record(
      "clinic_editor_page",
      editorPage.status === 200 && /data-website-chrome|website-edit/i.test(editorPage.text),
      `status=${editorPage.status}`
    );

    const drafts = [
      ["home.hero.title", "ActiveClinic Demo Centre"],
      ["home.hero.subtitle", MARKER],
      ["about.story.body", "Disposable testing checkpoint about copy."],
      ["location.address", "Lusaka, Zambia"],
      ["location.hours", "Mon-Fri 08:00-17:00"],
      ["contact.phone", "+260970000001"],
    ];
    let draftOk = true;
    for (const [contentKey, value] of drafts) {
      const saved = await request(app)
        .post(`/clinics/${CLINIC_KEY}/website/drafts`)
        .set("Host", AC_HOST)
        .set("Cookie", clinicCookies)
        .send({ [CSRF_FIELD]: editorCsrf, contentKey, value });
      clinicCookies = mergeCookies(clinicCookies, saved);
      if (saved.status !== 200) {
        draftOk = false;
        record("clinic_save_draft", false, `${contentKey} status=${saved.status} ${String(saved.text).slice(0, 160)}`);
        break;
      }
    }
    if (draftOk) record("clinic_save_draft", true, `${drafts.length} keys`);

    const preview = await request(app)
      .get(`/clinics/${CLINIC_KEY}/website/preview`)
      .set("Host", AC_HOST)
      .set("Cookie", clinicCookies)
      .redirects(0);
    record(
      "clinic_preview_reachable",
      preview.status === 303 || preview.status === 200,
      `status=${preview.status} loc=${preview.headers.location || ""}`
    );

    const submitted = await request(app)
      .post(`/clinics/${CLINIC_KEY}/website/submit`)
      .set("Host", AC_HOST)
      .set("Cookie", clinicCookies)
      .send({ [CSRF_FIELD]: editorCsrf });
    let submissionId = null;
    try {
      const body = JSON.parse(submitted.text || "{}");
      submissionId = body.submission && body.submission.id;
      record(
        "clinic_submit",
        submitted.status === 200 && body.ok === true && Boolean(submissionId),
        `status=${submitted.status} code=${body.code || ""} id=${submissionId || ""}`
      );
    } catch (err) {
      record("clinic_submit", false, `${submitted.status} ${String(submitted.text).slice(0, 180)}`);
      throw err;
    }
    if (!submissionId) throw new Error("no submission id");

    const review = await request(app)
      .get(`/admin/website-changes/${submissionId}`)
      .set("Host", BB_HOST)
      .set("Cookie", paCookies);
    paCookies = mergeCookies(paCookies, review);
    const reviewCsrf = extractCsrfField(review.text);
    record(
      "review_page_opens",
      review.status === 200 && /Review website changes/i.test(review.text),
      `status=${review.status}`
    );
    record(
      "clinic_identity_on_review",
      /activeclinic-demo|ActiveClinic Demo/i.test(review.text),
      ""
    );
    record(
      "change_diff_renders",
      /changed keys|home\.hero\.subtitle|QA-WEBSITE-CHECKPOINT/i.test(review.text),
      ""
    );

    const csrfFail = await request(app)
      .post(`/admin/website-changes/${submissionId}/approve`)
      .set("Host", BB_HOST)
      .set("Cookie", paCookies)
      .type("form")
      .send({ review_note: "missing csrf" });
    const csrfFailLoc = String(csrfFail.headers.location || "");
    record(
      "approve_without_csrf_rejected",
      csrfFail.status === 303 && /csrf/i.test(csrfFailLoc),
      `status=${csrfFail.status} loc=${csrfFailLoc}`
    );

    const rowVersionMatch = String(review.text).match(/name="rowVersion" value="([^"]+)"/);
    const approveBody = {
      [CSRF_FIELD]: reviewCsrf,
      rowVersion: rowVersionMatch ? rowVersionMatch[1] : "1",
      review_note: "testing checkpoint smoke approve",
    };
    if (/override_readiness/.test(review.text)) {
      approveBody.override_readiness = "1";
    }
    const approved = await request(app)
      .post(`/admin/website-changes/${submissionId}/approve`)
      .set("Host", BB_HOST)
      .set("Cookie", paCookies)
      .type("form")
      .send(approveBody);
    const approvedLoc = String(approved.headers.location || "");
    record(
      "approve_publish_authorized",
      approved.status === 303 && /status=approved|website-changes/i.test(approvedLoc) && !/error=/i.test(approvedLoc),
      `status=${approved.status} loc=${approvedLoc}`
    );

    const publicHome = await request(app)
      .get(`/clinics/${CLINIC_KEY}`)
      .set("Host", AC_HOST);
    record(
      "public_shows_approved_marker",
      publicHome.status === 200 && publicHome.text.includes(MARKER),
      `status=${publicHome.status} hasMarker=${publicHome.text.includes(MARKER)}`
    );
    record(
      "public_has_no_edit_chrome",
      publicHome.status === 200 && !/data-website-chrome/.test(publicHome.text),
      ""
    );

    const audit = await pool.query(
      `SELECT action_key FROM platform.website_audit_events
        WHERE organization_id = (
          SELECT id FROM platform.organizations WHERE organization_key = $1
        )
        ORDER BY created_at DESC LIMIT 12`,
      [CLINIC_KEY]
    );
    const types = audit.rows.map((r) => r.action_key);
    record(
      "audit_records",
      types.some((t) => /submit|approv|publish/i.test(String(t))),
      types.join(",")
    );
    const versions = await pool.query(
      `SELECT id, version_number, status FROM platform.website_versions
        WHERE organization_id = (
          SELECT id FROM platform.organizations WHERE organization_key = $1
        )
        ORDER BY published_at DESC NULLS LAST LIMIT 5`,
      [CLINIC_KEY]
    );
    record("version_records", versions.rows.length > 0, `count=${versions.rows.length}`);

    const subRow = await pool.query(
      `SELECT status, version_id, published_at IS NOT NULL AS published
         FROM platform.website_submissions WHERE id = $1`,
      [submissionId]
    );
    record(
      "submission_approved_state",
      subRow.rows[0] && subRow.rows[0].status === "approved" && Boolean(subRow.rows[0].version_id),
      JSON.stringify(subRow.rows[0] || {})
    );
  } finally {
    await pool.end();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    JSON.stringify(
      {
        verdict: failed.length ? "PLATFORM_ADMIN_WEBSITE_SMOKE_BLOCKED" : "PLATFORM_ADMIN_WEBSITE_SMOKE_PASS",
        failed: failed.map((r) => r.name),
        results,
      },
      null,
      2
    )
  );
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
