"use strict";

/**
 * V2.0 BUG FIX 02 — ActiveClinic services hosted QA.
 * Disposable clinic full workflow + Unilabs-02 manage-nav / create / public sync.
 */

const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

const root = path.resolve(__dirname, "../..");
process.chdir(root);

require("dotenv").config({ path: ".env.testing.local" });

const {
  createProvisionPool,
  resolveDatabaseUrlSafe,
} = require(`${root}/db/scripts/lib/provisionCliSafety`);
const {
  provisionHostedAuthQaClinic,
  cleanupHostedAuthQaClinic,
  publicFixtureRecord,
} = require(`${root}/src/activeclinic/qa/activeClinicHostedAuthQaFixture`);
const {
  CSRF_FIELD,
  createHostedClient,
  extractCsrfField,
} = require(`${root}/src/activeclinic/qa/activeClinicHostedAuthQaClient`);
const {
  setPlatformIdentityPassword,
} = require(`${root}/src/platform/services/platformIdentityCredentialService`);

const BASE = process.env.V2_AC_HOSTED_BASE || "https://activeclinic.neuniversity.org";
const EXPECTED_SHA_PREFIX = process.env.V2_AC_EXPECTED_SHA || "e81eed5a";
const OUT = process.env.V2_AC_SERVICES_OUT || "/tmp/v2-ac-services-hosted-result.json";
const UNILABS_ADMIN_ID = "6ec70d81-1275-42f6-87bb-e45a479f306c";
const UNILABS_ADMIN_EMAIL = "lukisamanjoz@gmail.com";
const UNILABS_CLINIC = "unilabs-02";
const TEMP_PASSWORD = `V2SvcQa!${crypto.randomBytes(4).toString("hex")}`;

function stamp() {
  return `${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;
}

function re(text) {
  return new RegExp(String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDeploy(maxMs = 12 * 60 * 1000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < maxMs) {
    const health = await createHostedClient(BASE).get("/healthz");
    let body = {};
    try {
      body = JSON.parse(health.text || "{}");
    } catch (_e) {
      body = {};
    }
    last = {
      status: health.status,
      gitSha: body.gitSha || null,
      deploymentCode: body.deploymentCode || null,
      platformLine: body.platformLine || null,
    };
    const sha = String(last.gitSha || "");
    if (health.status === 200 && sha.startsWith(EXPECTED_SHA_PREFIX)) {
      return { ok: true, hosted: last };
    }
    await sleep(15000);
  }
  return { ok: false, hosted: last, blockReason: "deploy_sha_timeout" };
}

async function login(client, identifier, password) {
  const loginGet = await client.get("/login");
  const csrf = extractCsrfField(loginGet.text) || client.jar.csrf();
  const loginPost = await client.postForm("/login", {
    [CSRF_FIELD]: csrf,
    identifier,
    password,
  });
  await client.follow(loginPost);
  return {
    ok: loginPost.status === 303 && client.jar.sessionPresent(),
    status: loginPost.status,
    location: loginPost.location || null,
  };
}

function allOk(obj) {
  return Object.values(obj).every((v) => {
    if (v == null) return true;
    if (typeof v !== "object") return true;
    if (Object.prototype.hasOwnProperty.call(v, "ok")) return v.ok === true;
    return true;
  });
}

async function runDisposable(db, result) {
  const s = stamp();
  const serviceName = `V2 Hosted Service ${s}`;
  const draftName = `V2 Draft Service ${s}`;
  const serviceEdited = `V2 Hosted Service Edited ${s}`;
  let organizationKey = null;

  const fixture = await provisionHostedAuthQaClinic(db, {}, process.env);
  if (!fixture.ok) {
    result.disposable = { ok: false, reason: fixture.reason || null };
    return;
  }
  organizationKey = fixture.organizationKey || fixture.clinicKey;
  result.disposable = {
    ok: true,
    clinicKey: publicFixtureRecord(fixture).clinicKey || organizationKey,
    organizationKey,
  };

  try {
    const client = createHostedClient(BASE);
    const loginRes = await login(client, fixture.adminEmail, fixture.password);
    result.disposableLogin = loginRes;
    if (!loginRes.ok) return;

    const clinicPath = `/clinics/${result.disposable.clinicKey}`;

    // Empty services Manage link must open services tab
    const emptyServices = await client.get(`${clinicPath}/services?website_edit=1&website_mode=draft`);
    result.manageNav = {
      ok:
        emptyServices.status === 200 &&
        /catalogue\?tab=services/.test(emptyServices.text || "") &&
        /Manage public catalogue/.test(emptyServices.text || ""),
      status: emptyServices.status,
    };

    // Draft create (no publicWebsiteVisible)
    const draftGet = await client.get("/app/settings/website/catalogue/services/new");
    result.createForm = {
      ok:
        draftGet.status === 200 &&
        /name="category"/.test(draftGet.text || "") &&
        /name="imageMediaId"/.test(draftGet.text || "") &&
        !/name="publicWebsiteVisible"[^>]*checked/.test(draftGet.text || ""),
      status: draftGet.status,
    };
    const draftPost = await client.postForm("/app/settings/website/catalogue/services/new", {
      [CSRF_FIELD]: extractCsrfField(draftGet.text) || client.jar.csrf(),
      displayName: draftName,
      category: "Diagnostics",
      description: `Draft ${s}`,
      defaultDurationMinutes: "30",
    });
    const orgRow = await db.query(
      `SELECT id FROM platform.organizations WHERE organization_key = $1`,
      [organizationKey]
    );
    const orgId = orgRow.rows[0] && orgRow.rows[0].id;
    const draftRow = await db.query(
      `SELECT public_website_visible, public_summary FROM activeclinic.appointment_service_types
        WHERE organization_id = $1 AND display_name = $2 LIMIT 1`,
      [orgId, draftName]
    );
    const publicDraft = await createHostedClient(BASE).get(`${clinicPath}/services`);
    result.draftCreate = {
      ok:
        draftPost.status === 303 &&
        draftRow.rows[0] &&
        draftRow.rows[0].public_website_visible === false &&
        draftRow.rows[0].public_summary === "Diagnostics" &&
        !re(draftName).test(publicDraft.text || ""),
      status: draftPost.status,
      visible: draftRow.rows[0] && draftRow.rows[0].public_website_visible,
    };

    // Published create
    const createGet = await client.get("/app/settings/website/catalogue/services/new");
    const createPost = await client.postForm("/app/settings/website/catalogue/services/new", {
      [CSRF_FIELD]: extractCsrfField(createGet.text) || client.jar.csrf(),
      displayName: serviceName,
      category: "Consultation",
      description: `Hosted ${s}`,
      publicSummary: `Hosted ${s}`,
      defaultDurationMinutes: "30",
      publicWebsiteVisible: "1",
      publicBookable: "1",
    });
    const svcRow = await db.query(
      `SELECT id, service_key, public_website_visible FROM activeclinic.appointment_service_types
        WHERE organization_id = $1 AND display_name = $2 ORDER BY created_at DESC LIMIT 1`,
      [orgId, serviceName]
    );
    const service = svcRow.rows[0] || null;
    result.create = {
      ok: createPost.status === 303 && Boolean(service) && service.public_website_visible === true,
      status: createPost.status,
      serviceId: service && service.id,
    };
    const publicVisible = await createHostedClient(BASE).get(`${clinicPath}/services`);
    result.publicVisible = {
      ok: publicVisible.status === 200 && re(serviceName).test(publicVisible.text || ""),
      status: publicVisible.status,
    };

    if (service) {
      const editGet = await client.get(
        `/app/settings/website/catalogue/services/${service.id}/edit`
      );
      const editPost = await client.postForm(
        `/app/settings/website/catalogue/services/${service.id}/edit`,
        {
          [CSRF_FIELD]: extractCsrfField(editGet.text) || client.jar.csrf(),
          displayName: serviceEdited,
          category: "Consultation",
          description: `Edited ${s}`,
          publicSummary: `Edited ${s}`,
          defaultDurationMinutes: "45",
          publicWebsiteVisible: "1",
          publicBookable: "1",
        }
      );
      result.edit = { ok: editPost.status === 303, status: editPost.status };
      const publicEdited = await createHostedClient(BASE).get(`${clinicPath}/services`);
      result.publicEdited = {
        ok: publicEdited.status === 200 && re(serviceEdited).test(publicEdited.text || ""),
        status: publicEdited.status,
      };

      const hideGet = await client.get(
        `/app/settings/website/catalogue/services/${service.id}/edit`
      );
      const hidePost = await client.postForm(
        `/app/settings/website/catalogue/services/${service.id}/edit`,
        {
          [CSRF_FIELD]: extractCsrfField(hideGet.text) || client.jar.csrf(),
          displayName: serviceEdited,
          description: `Edited ${s}`,
          status: "inactive",
        }
      );
      result.hide = { ok: hidePost.status === 303, status: hidePost.status };
      const publicHidden = await createHostedClient(BASE).get(`${clinicPath}/services`);
      result.publicHidden = {
        ok: publicHidden.status === 200 && !re(serviceEdited).test(publicHidden.text || ""),
        status: publicHidden.status,
      };
    }

    const client2 = createHostedClient(BASE);
    await login(client2, fixture.adminEmail, fixture.password);
    const list2 = await client2.get("/app/settings/website/catalogue?tab=services");
    result.reloginPersistence = {
      ok: list2.status === 200 && /catalogue|Services|Add service/i.test(list2.text || ""),
      status: list2.status,
    };
  } finally {
    if (organizationKey) {
      const cleaned = await cleanupHostedAuthQaClinic(db, { organizationKey }, process.env);
      result.cleanup = { ok: cleaned.ok !== false, status: cleaned.status || cleaned.ok || null };
    }
  }
}

async function runUnilabs(db, result) {
  const before = await createHostedClient(BASE).get(`/clinics/${UNILABS_CLINIC}/services`);
  result.unilabsBefore = {
    ok: before.status === 200,
    status: before.status,
    empty: /Service listings are not available yet/.test(before.text || ""),
  };

  const prior = await db.query(
    `SELECT password_hash FROM platform.identities WHERE id = $1`,
    [UNILABS_ADMIN_ID]
  );
  const priorHash = prior.rows[0] && prior.rows[0].password_hash;

  const setPwd = await setPlatformIdentityPassword(db, {
    identityId: UNILABS_ADMIN_ID,
    password: TEMP_PASSWORD,
  });
  if (!setPwd.ok) {
    result.unilabs = { ok: false, reason: setPwd.code || "password_set_failed" };
    return;
  }

  try {
    const client = createHostedClient(BASE);
    const loginRes = await login(client, UNILABS_ADMIN_EMAIL, TEMP_PASSWORD);
    result.unilabsLogin = loginRes;
    if (!loginRes.ok) {
      result.unilabs = { ok: false, reason: "login_failed" };
      return;
    }

    const draftServices = await client.get(
      `/clinics/${UNILABS_CLINIC}/services?website_edit=1&website_mode=draft`
    );
    result.unilabsManageNav = {
      ok:
        draftServices.status === 200 &&
        /catalogue\?tab=services/.test(draftServices.text || "") &&
        /Manage public catalogue/.test(draftServices.text || ""),
      status: draftServices.status,
    };

    const s = stamp();
    const name = `Unilabs QA Service ${s}`;
    const createGet = await client.get("/app/settings/website/catalogue/services/new");
    const createPost = await client.postForm("/app/settings/website/catalogue/services/new", {
      [CSRF_FIELD]: extractCsrfField(createGet.text) || client.jar.csrf(),
      displayName: name,
      category: "Laboratory",
      description: `Hosted Unilabs service ${s}`,
      publicSummary: "Laboratory",
      defaultDurationMinutes: "30",
      publicWebsiteVisible: "1",
    });
    result.unilabsCreate = {
      ok: createPost.status === 303 && /tab=services/.test(String(createPost.location || "")),
      status: createPost.status,
      location: createPost.location || null,
    };

    const publicAfter = await createHostedClient(BASE).get(`/clinics/${UNILABS_CLINIC}/services`);
    result.unilabsPublic = {
      ok: publicAfter.status === 200 && re(name).test(publicAfter.text || ""),
      status: publicAfter.status,
      name,
    };

    // Refresh persistence
    const refresh = await createHostedClient(BASE).get(`/clinics/${UNILABS_CLINIC}/services`);
    result.unilabsRefresh = {
      ok: refresh.status === 200 && re(name).test(refresh.text || ""),
      status: refresh.status,
    };

    const client2 = createHostedClient(BASE);
    await login(client2, UNILABS_ADMIN_EMAIL, TEMP_PASSWORD);
    const list = await client2.get("/app/settings/website/catalogue?tab=services");
    result.unilabsRelogin = {
      ok: list.status === 200 && re(name).test(list.text || ""),
      status: list.status,
    };

    result.unilabs = {
      ok:
        result.unilabsManageNav.ok &&
        result.unilabsCreate.ok &&
        result.unilabsPublic.ok &&
        result.unilabsRefresh.ok &&
        result.unilabsRelogin.ok,
    };
  } finally {
    if (priorHash) {
      await db.query(`UPDATE platform.identities SET password_hash = $2, updated_at = now() WHERE id = $1`, [
        UNILABS_ADMIN_ID,
        priorHash,
      ]);
      result.unilabsPasswordRestored = true;
    }
  }
}

async function main() {
  const result = {
    verdict: "V2_AC_SERVICES_QA_BLOCKED",
    baseUrl: BASE,
    expectedShaPrefix: EXPECTED_SHA_PREFIX,
    startedAt: new Date().toISOString(),
  };

  const deploy = await waitForDeploy();
  result.hosted = deploy.hosted;
  if (!deploy.ok) {
    result.blockReason = deploy.blockReason;
    fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = 2;
    return;
  }

  const url = resolveDatabaseUrlSafe();
  if (!url.ok) {
    result.blockReason = "missing_database_url";
    fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = 2;
    return;
  }

  const db = createProvisionPool(url.connectionString);
  try {
    await runDisposable(db, result);
    await runUnilabs(db, result);

    const checks = {
      disposable: result.disposable,
      disposableLogin: result.disposableLogin,
      manageNav: result.manageNav,
      createForm: result.createForm,
      draftCreate: result.draftCreate,
      create: result.create,
      publicVisible: result.publicVisible,
      edit: result.edit,
      publicEdited: result.publicEdited,
      hide: result.hide,
      publicHidden: result.publicHidden,
      reloginPersistence: result.reloginPersistence,
      unilabs: result.unilabs,
      unilabsManageNav: result.unilabsManageNav,
      unilabsCreate: result.unilabsCreate,
      unilabsPublic: result.unilabsPublic,
      unilabsRefresh: result.unilabsRefresh,
      unilabsRelogin: result.unilabsRelogin,
    };
    result.checks = checks;
    result.verdict = allOk(checks) ? "V2_AC_SERVICES_QA_PASS" : "V2_AC_SERVICES_QA_BLOCKED";
    if (result.verdict !== "V2_AC_SERVICES_QA_PASS") {
      result.blockReason = "hosted_check_failed";
    }
  } catch (err) {
    result.blockReason = err && err.message ? err.message : String(err);
    result.verdict = "V2_AC_SERVICES_QA_BLOCKED";
  } finally {
    result.finishedAt = new Date().toISOString();
    fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
    await db.end().catch(() => {});
  }

  console.log(JSON.stringify(result, null, 2));
  if (result.verdict !== "V2_AC_SERVICES_QA_PASS") process.exitCode = 2;
}

main();
