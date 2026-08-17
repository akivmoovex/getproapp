"use strict";

/**
 * C04/C07/C08/C09 smoke against the local production-like clone only.
 * Aborts unless DATABASE_URL host is local. Never prints credentials.
 */

const request = require("supertest");
const { Pool } = require("pg");
const { parseDatabaseHost } = require("../../db/scripts/lib/databaseUrl");
const { buildFoundationPoolConfig } = require("../../db/scripts/lib/foundationPool");
const { createV5FoundationApp } = require("../../src/platform/http/v5FoundationServer");
const { createActiveClinicFoundationApp } = require("../../src/activeclinic/http/activeClinicFoundationServer");
const { createClinicRegistrationApplication } = require("../../src/activeclinic/services/activeClinicPublicOnboardingService");
const { approveAndProvisionClinicRegistration } = require("../../src/activeclinic/services/approveClinicRegistrationService");
const { backfillActiveClinicWebsites } = require("../../src/activeclinic/website/backfillActiveClinicWebsites");
const { createPlatformIdentitySession } = require("../../src/platform/session/createDeploymentSession");
const { CSRF_FIELD, getCsrfCookieName } = require("../../src/platform/http/v5Csrf");
const { COOKIE_COM, CODE_COM_PRODUCTION, CODE_ACTIVECLINIC_ORG_PRODUCTION } = require("../../src/platform/config/deploymentProfiles");
const submissionService = require("../../src/platform/website/submissionService");
const { setClinicWebsiteAvailability } = require("../../src/activeclinic/services/clinicWebsiteAvailabilityService");
const { sqlPublicDirectoryEnvironmentFilter } = require("../../src/church/orgDataEnvironment");

const HOST_BB = "blessboard.com";
const HOST_AC = "activeclinic.org";
const PASSWORD = "rehearsal-qa-clinic-12";

function cookieHeader(res, extra) {
  const parts = [].concat((res && res.headers && res.headers["set-cookie"]) || []).map((c) => String(c).split(";")[0]);
  if (extra) parts.push(extra);
  return parts.filter(Boolean).join("; ");
}

function extractNamedCookie(res, name) {
  const cookies = [].concat((res && res.headers && res.headers["set-cookie"]) || []);
  const raw = cookies.find((c) => String(c).startsWith(`${name}=`)) || "";
  const match = String(raw).match(new RegExp(`${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

async function main() {
  const url = process.env.DATABASE_URL;
  const host = parseDatabaseHost(url);
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    console.error("ABORT: not local clone");
    process.exit(2);
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret || String(secret).length < 32) {
    console.error("ABORT: SESSION_SECRET missing/short");
    process.exit(2);
  }

  const pool = new Pool(buildFoundationPoolConfig(url, { max: 4 }));
  const report = { host, stages: {} };
  const started = Date.now();

  try {
    const bbEnv = {
      ...process.env,
      PLATFORM_DEPLOYMENT_CODE: CODE_COM_PRODUCTION,
      DEPLOYMENT_ENV: "production",
      NODE_ENV: "production",
      SESSION_SECRET: secret,
    };
    const acEnv = {
      ...process.env,
      PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_PRODUCTION,
      DEPLOYMENT_ENV: "production",
      NODE_ENV: "production",
      SESSION_SECRET: secret,
    };

    const bbApp = createV5FoundationApp({ getPool: () => pool, env: bbEnv, log: () => {} });
    const acApp = createActiveClinicFoundationApp({ getPool: () => pool, env: acEnv, log: () => {} });

    const t0 = Date.now();
    const health = await request(bbApp).get("/healthz").set("Host", HOST_BB);
    const login = await request(bbApp).get("/login").set("Host", HOST_BB);
    const home = await request(bbApp).get("/").set("Host", HOST_BB);
    const features = await request(bbApp).get("/features").set("Host", HOST_BB);
    const pricing = await request(bbApp).get("/pricing").set("Host", HOST_BB);
    const directoryA = await request(bbApp).get("/directory").set("Host", HOST_BB);
    const admin = await request(bbApp).get("/admin").set("Host", HOST_BB).redirects(0);
    const cms = await request(bbApp).get("/hq").set("Host", HOST_BB).redirects(0);
    const colHome = await request(bbApp).get("/c/col").set("Host", HOST_BB);
    const colAbout = await request(bbApp).get("/c/col/about").set("Host", HOST_BB);
    const colContact = await request(bbApp).get("/c/col/contact").set("Host", HOST_BB);
    const colGiving = await request(bbApp).get("/c/col/giving").set("Host", HOST_BB);
    const loginCookies = [].concat(login.headers["set-cookie"] || []).map((c) => String(c).split("=")[0]);
    const chromeHits = [home, features, colHome].map((r) => ({
      status: r.status,
      websiteChrome: /data-website-chrome/.test(r.text || ""),
      publicPagesMarker: /church-body--apex|bb-apex|BlessBoard/i.test(r.text || ""),
    }));

    const pages = (await pool.query(`SELECT page_key, status FROM blessboard.public_pages ORDER BY 1`)).rows;
    const dirSql = `SELECT o.organization_key FROM platform.organizations o
      WHERE o.status = 'active' AND ${sqlPublicDirectoryEnvironmentFilter("o", bbEnv)} ORDER BY 1`;
    const dirA = (await pool.query(dirSql)).rows.map((r) => r.organization_key);

    report.stages.blessboard = {
      ms: Date.now() - t0,
      health: { status: health.status, body: health.body },
      login: { status: login.status, cookies: loginCookies },
      sessionCookieNameExpected: COOKIE_COM,
      sessionCookieIssuedOnGetLogin: loginCookies.includes(COOKIE_COM),
      csrfCookie: loginCookies.find((n) => /csrf/i.test(n)) || null,
      testingCookiePresent: loginCookies.some((n) => /pronline|moovex_platform_testing|activeclinic_org_sid$/.test(n)),
      pages: {
        "/": home.status,
        "/features": features.status,
        "/pricing": pricing.status,
        "/directory": directoryA.status,
        "/admin": admin.status,
        "/adminLocation": admin.headers.location || null,
        "/hq": cms.status,
        "/hqLocation": cms.headers.location || null,
        "/c/col": colHome.status,
        "/c/col/about": colAbout.status,
        "/c/col/contact": colContact.status,
        "/c/col/giving": colGiving.status,
      },
      chromeHits,
      publicPages: pages,
      directoryKeysWhileTestingEnv: dirA,
      directoryHtmlHasCol: /col|City Of The Lord/i.test(directoryA.text || ""),
    };

    const tAc = Date.now();
    const acHealth = await request(acApp).get("/healthz").set("Host", HOST_AC);
    const registerGet = await request(acApp).get("/register-clinic").set("Host", HOST_AC);
    const clinicsBefore = (await pool.query(`SELECT count(*)::int n FROM activeclinic.healthcare_organizations`)).rows[0].n;
    const instancesBefore = (await pool.query(`SELECT count(*)::int n FROM platform.website_instances`)).rows[0].n;
    const dryBackfill = await backfillActiveClinicWebsites(pool, { dryRun: true });
    report.stages.activeclinicFoundation = {
      ms: Date.now() - tAc,
      health: { status: acHealth.status, body: acHealth.body },
      registerClinic: { status: registerGet.status, hasForm: /register/i.test(registerGet.text || "") },
      clinicsBefore,
      instancesBefore,
      backfillDryRunActions: (dryBackfill.actions || []).length,
      backfillOk: dryBackfill.ok === true,
    };

    // C04 B: correct clone church/org env, re-check directory, then restore anomaly.
    const t4 = Date.now();
    await pool.query(`UPDATE platform.organizations SET data_environment = 'production' WHERE organization_key = 'col'`);
    await pool.query(`UPDATE blessboard.churches SET data_environment = 'production' WHERE church_key = 'col'`);
    const dirB = (await pool.query(dirSql)).rows.map((r) => r.organization_key);
    const directoryB = await request(bbApp).get("/directory").set("Host", HOST_BB);
    const colHomeB = await request(bbApp).get("/c/col").set("Host", HOST_BB);
    const loginB = await request(bbApp).get("/login").set("Host", HOST_BB);
    await pool.query(`UPDATE platform.organizations SET data_environment = 'testing' WHERE organization_key = 'col'`);
    await pool.query(`UPDATE blessboard.churches SET data_environment = 'testing' WHERE church_key = 'col'`);
    const dirRestored = (await pool.query(dirSql)).rows.map((r) => r.organization_key);
    report.stages.c04 = {
      ms: Date.now() - t4,
      leaveUnchangedDirectoryKeys: dirA,
      correctedDirectoryKeys: dirB,
      colPublicStillRenders: colHomeB.status,
      loginStillOk: loginB.status,
      restoredDirectoryKeys: dirRestored,
      recommendation: dirA.includes("col") ? "LEAVE_AS_LEGACY_METADATA" : "CORRECT_BEFORE_CUTOVER",
    };

    const t9 = Date.now();
    const stamp = Date.now().toString(36);
    const created = await createClinicRegistrationApplication(pool, {
      clinicName: `Rehearsal QA Clinic ${stamp}`,
      contactName: "QA Operator",
      contactEmail: `rehearsal-qa-${stamp}@example.test`,
      contactPhone: `+26097${String(Date.now()).slice(-7)}`,
      province: "Lusaka Province",
      city: "Lusaka",
      countryCode: "ZM",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
    });
    if (!created.ok) {
      report.stages.c09 = { ok: false, created };
      throw new Error(`registration failed: ${JSON.stringify(created)}`);
    }

    const pending = await approveAndProvisionClinicRegistration(pool, {
      applicationId: created.application.id,
      dataEnvironment: "production",
      deploymentCode: CODE_ACTIVECLINIC_ORG_PRODUCTION,
      websiteTemplateVersion: 999,
    });
    const recovered = await approveAndProvisionClinicRegistration(pool, {
      applicationId: created.application.id,
      dataEnvironment: "production",
      deploymentCode: CODE_ACTIVECLINIC_ORG_PRODUCTION,
    });

    const staffId = recovered.staffMemberId;
    const ident = await pool.query(
      `SELECT platform_identity_id FROM activeclinic.staff_members WHERE id = $1`,
      [staffId]
    );
    const identityId = ident.rows[0] && ident.rows[0].platform_identity_id;
    const slug = recovered.slug;
    const orgId = recovered.organizationId;

    const session = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_PRODUCTION,
      platformIdentityId: identityId,
      organizationId: orgId,
      contextJson: recovered.facility && recovered.facility.id ? { selectedFacilityId: recovered.facility.id } : {},
    });
    const sidName = "activeclinic_org_prod_sid";
    const sessionCookie = `${sidName}=${session.rawToken}`;
    const editorGet = await request(acApp)
      .get(`/clinics/${slug}?website_edit=1&website_mode=draft`)
      .set("Host", HOST_AC)
      .set("Cookie", sessionCookie);
    const csrfName = getCsrfCookieName(acEnv);
    const csrf = extractNamedCookie(editorGet, csrfName);
    const jar = cookieHeader(editorGet, sessionCookie);
    const save = await request(acApp)
      .post(`/clinics/${slug}/website/drafts`)
      .set("Host", HOST_AC)
      .set("Cookie", jar)
      .send({ [CSRF_FIELD]: csrf, contentKey: "home.hero.title", value: "Rehearsal QA Clinic Live" });
    const submit = await request(acApp)
      .post(`/clinics/${slug}/website/submit`)
      .set("Host", HOST_AC)
      .set("Cookie", jar)
      .send({ [CSRF_FIELD]: csrf });
    let submitted = null;
    try {
      submitted = JSON.parse(submit.text);
    } catch {
      submitted = { parseError: true, text: String(submit.text).slice(0, 200) };
    }
    let decided = null;
    if (submitted && submitted.ok && submitted.submission) {
      decided = await submissionService.decideWebsiteSubmission(pool, {
        organizationId: orgId,
        submissionId: submitted.submission.id,
        decision: "approve",
        rowVersion: submitted.submission.rowVersion,
        overrideReadiness: true,
      });
    }
    const liveBeforePublish = await request(acApp).get(`/clinics/${slug}`).set("Host", HOST_AC);
    const published = await setClinicWebsiteAvailability(pool, {
      organizationKey: slug,
      public: true,
      env: acEnv,
      overrideReadiness: true,
    });
    const live = await request(acApp).get(`/clinics/${slug}`).set("Host", HOST_AC);
    const unpublished = await setClinicWebsiteAvailability(pool, {
      organizationKey: slug,
      public: false,
      env: acEnv,
    });
    const liveUnpublished = await request(acApp).get(`/clinics/${slug}`).set("Host", HOST_AC);
    const republished = await setClinicWebsiteAvailability(pool, {
      organizationKey: slug,
      public: true,
      env: acEnv,
      overrideReadiness: true,
    });
    const liveRepublished = await request(acApp).get(`/clinics/${slug}`).set("Host", HOST_AC);
    const liveHasChrome = /data-website-chrome/.test(live.text || "");
    const liveHasTitle = /Rehearsal QA Clinic Live/.test(live.text || "");
    const clinicsAfter = (await pool.query(`SELECT count(*)::int n FROM activeclinic.healthcare_organizations`)).rows[0].n;
    const juflona = (await pool.query(
      `SELECT count(*)::int n FROM platform.organizations WHERE organization_key ILIKE '%juflona%' OR display_name ILIKE '%juflona%'`
    )).rows[0].n;

    report.stages.c09 = {
      ms: Date.now() - t9,
      createdOk: created.ok,
      websitePendingCode: pending.code,
      recoveredCode: recovered.code,
      recoveredInstance: Boolean(recovered.instance),
      editorStatus: editorGet.status,
      editorHasChrome: /data-website-chrome/.test(editorGet.text || ""),
      saveStatus: save.status,
      submitStatus: submit.status,
      submitOk: Boolean(submitted && submitted.ok),
      decidedOk: Boolean(decided && decided.ok),
      liveBeforePublish: liveBeforePublish.status,
      publishedOk: Boolean(published && published.ok),
      liveStatus: live.status,
      liveHasChrome,
      liveHasTitle,
      unpublishedOk: Boolean(unpublished && unpublished.ok),
      liveUnpublished: liveUnpublished.status,
      republishedOk: Boolean(republished && republished.ok),
      liveRepublished: liveRepublished.status,
      clinicsAfter,
      juflonaOrgs: juflona,
      sessionOk: session.ok === true,
    };

    const acOnBb = await request(bbApp).get("/register-clinic").set("Host", HOST_BB);
    report.stages.hostRouting = {
      registerClinicOnBlessBoardHost: acOnBb.status,
      note: "blessboard-com-production productCode is blessboard; ActiveClinic HTTP is a separate profile",
    };

    report.totalMs = Date.now() - started;
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
