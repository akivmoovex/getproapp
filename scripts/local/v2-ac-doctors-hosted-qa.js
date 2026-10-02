"use strict";

/**
 * V2.0 BUG FIX 03 — ActiveClinic doctor management hosted QA.
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
const EXPECTED_SHA_PREFIX = process.env.V2_AC_EXPECTED_SHA || "PLACEHOLDER";
const OUT = process.env.V2_AC_DOCTORS_OUT || "/tmp/v2-ac-doctors-hosted-result.json";
const UNILABS_ADMIN_ID = "6ec70d81-1275-42f6-87bb-e45a479f306c";
const UNILABS_ADMIN_EMAIL = "lukisamanjoz@gmail.com";
const UNILABS_CLINIC = "unilabs-02";
const UNILABS_EXISTING_STAFF_ID = "9f11abc3-cbe4-4105-8476-99066df0f9b6";
const TEMP_PASSWORD = `V2DocQa!${crypto.randomBytes(4).toString("hex")}`;

function stamp() {
  return `${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;
}
function re(text) {
  return new RegExp(String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}
async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForDeploy(expectedPrefix, maxMs = 12 * 60 * 1000) {
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
    if (health.status === 200 && String(last.gitSha || "").startsWith(expectedPrefix)) {
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
  return Object.values(obj).every((v) => !v || typeof v !== "object" || !Object.prototype.hasOwnProperty.call(v, "ok") || v.ok === true);
}

async function runDisposable(db, result) {
  const s = stamp();
  const doctorName = `V2 Hosted Doctor ${s}`;
  const draftName = `V2 Draft Doctor ${s}`;
  const editedName = `V2 Hosted Doctor Edited ${s}`;
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
    const emptyDoctors = await client.get(`${clinicPath}/doctors?website_edit=1&website_mode=draft`);
    result.manageNav = {
      ok:
        emptyDoctors.status === 200 &&
        /catalogue\?tab=doctors/.test(emptyDoctors.text || "") &&
        /Manage public doctors/.test(emptyDoctors.text || ""),
      status: emptyDoctors.status,
    };

    const formGet = await client.get("/app/settings/website/catalogue/doctors/new");
    result.createForm = {
      ok:
        formGet.status === 200 &&
        /name="professionalTitle"/.test(formGet.text || "") &&
        /name="qualifications"/.test(formGet.text || "") &&
        /name="imageMediaId"/.test(formGet.text || "") &&
        !/name="publicWebsiteVisible"[^>]*checked/.test(formGet.text || ""),
      status: formGet.status,
    };

    const draftPost = await client.postForm("/app/settings/website/catalogue/doctors/new", {
      [CSRF_FIELD]: extractCsrfField(formGet.text) || client.jar.csrf(),
      publicDisplayName: draftName,
      professionalTitle: "General Practitioner",
      specialty: "Family Medicine",
      qualifications: "MBChB",
      biography: `Draft ${s}`,
    });
    const orgRow = await db.query(
      `SELECT id FROM platform.organizations WHERE organization_key = $1`,
      [organizationKey]
    );
    const orgId = orgRow.rows[0] && orgRow.rows[0].id;
    const draftRow = await db.query(
      `SELECT public_profile_enabled FROM activeclinic.staff_members
        WHERE organization_id = $1 AND public_display_name = $2 LIMIT 1`,
      [orgId, draftName]
    );
    const publicDraft = await createHostedClient(BASE).get(`${clinicPath}/doctors`);
    result.draftCreate = {
      ok:
        draftPost.status === 303 &&
        draftRow.rows[0] &&
        draftRow.rows[0].public_profile_enabled === false &&
        !re(draftName).test(publicDraft.text || ""),
      status: draftPost.status,
    };

    const createGet = await client.get("/app/settings/website/catalogue/doctors/new");
    const createPost = await client.postForm("/app/settings/website/catalogue/doctors/new", {
      [CSRF_FIELD]: extractCsrfField(createGet.text) || client.jar.csrf(),
      publicDisplayName: doctorName,
      professionalTitle: "Consultant",
      specialty: "Pediatrics",
      qualifications: "MMed",
      biography: `Hosted ${s}`,
      publicWebsiteVisible: "1",
    });
    const svcRow = await db.query(
      `SELECT id, public_profile_key, public_profile_enabled, platform_identity_id
         FROM activeclinic.staff_members
        WHERE organization_id = $1 AND public_display_name = $2
        ORDER BY created_at DESC LIMIT 1`,
      [orgId, doctorName]
    );
    const doctor = svcRow.rows[0] || null;
    result.create = {
      ok:
        createPost.status === 303 &&
        Boolean(doctor) &&
        doctor.public_profile_enabled === true &&
        doctor.platform_identity_id == null,
      status: createPost.status,
      staffId: doctor && doctor.id,
      noLogin: doctor && doctor.platform_identity_id == null,
    };

    const publicVisible = await createHostedClient(BASE).get(`${clinicPath}/doctors`);
    result.publicVisible = {
      ok:
        publicVisible.status === 200 &&
        re(doctorName).test(publicVisible.text || "") &&
        /Pediatrics/.test(publicVisible.text || ""),
      status: publicVisible.status,
    };

    if (doctor) {
      const editGet = await client.get(
        `/app/settings/website/catalogue/doctors/${doctor.id}/edit`
      );
      const editPost = await client.postForm(
        `/app/settings/website/catalogue/doctors/${doctor.id}/edit`,
        {
          [CSRF_FIELD]: extractCsrfField(editGet.text) || client.jar.csrf(),
          publicDisplayName: editedName,
          professionalTitle: "Consultant",
          specialty: "Pediatrics",
          qualifications: "MMed",
          biography: `Edited ${s}`,
          publicWebsiteVisible: "1",
        }
      );
      result.edit = { ok: editPost.status === 303, status: editPost.status };
      const publicEdited = await createHostedClient(BASE).get(`${clinicPath}/doctors`);
      result.publicEdited = {
        ok: publicEdited.status === 200 && re(editedName).test(publicEdited.text || ""),
        status: publicEdited.status,
      };

      const hideGet = await client.get(
        `/app/settings/website/catalogue/doctors/${doctor.id}/edit`
      );
      const hidePost = await client.postForm(
        `/app/settings/website/catalogue/doctors/${doctor.id}/edit`,
        {
          [CSRF_FIELD]: extractCsrfField(hideGet.text) || client.jar.csrf(),
          publicDisplayName: editedName,
          specialty: "Pediatrics",
          biography: `Edited ${s}`,
          status: "inactive",
        }
      );
      result.hide = { ok: hidePost.status === 303, status: hidePost.status };
      const publicHidden = await createHostedClient(BASE).get(`${clinicPath}/doctors`);
      result.publicHidden = {
        ok: publicHidden.status === 200 && !re(editedName).test(publicHidden.text || ""),
        status: publicHidden.status,
      };
    }

    const client2 = createHostedClient(BASE);
    await login(client2, fixture.adminEmail, fixture.password);
    const list2 = await client2.get("/app/settings/website/catalogue?tab=doctors");
    result.reloginPersistence = {
      ok: list2.status === 200 && /catalogue|Doctors|Add doctor/i.test(list2.text || ""),
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
  const before = await createHostedClient(BASE).get(`/clinics/${UNILABS_CLINIC}/doctors`);
  result.unilabsBefore = {
    ok: before.status === 200,
    status: before.status,
    empty: /Doctor listings are not available yet/.test(before.text || ""),
  };

  const prior = await db.query(`SELECT password_hash FROM platform.identities WHERE id = $1`, [
    UNILABS_ADMIN_ID,
  ]);
  const priorHash = prior.rows[0] && prior.rows[0].password_hash;
  const staffBefore = await db.query(
    `SELECT count(*)::int AS n
       FROM activeclinic.staff_members
      WHERE organization_id = (SELECT organization_id FROM activeclinic.staff_members WHERE id = $1)
        AND status <> 'archived'`,
    [UNILABS_EXISTING_STAFF_ID]
  );

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

    const draftDoctors = await client.get(
      `/clinics/${UNILABS_CLINIC}/doctors?website_edit=1&website_mode=draft`
    );
    result.unilabsManageNav = {
      ok:
        draftDoctors.status === 200 &&
        /catalogue\?tab=doctors/.test(draftDoctors.text || "") &&
        /Manage public doctors/.test(draftDoctors.text || ""),
      status: draftDoctors.status,
    };

    const s = stamp();
    const name = `Dr Lukisa Public ${s}`;
    const createGet = await client.get("/app/settings/website/catalogue/doctors/new");
    const createPost = await client.postForm("/app/settings/website/catalogue/doctors/new", {
      [CSRF_FIELD]: extractCsrfField(createGet.text) || client.jar.csrf(),
      existingStaffId: UNILABS_EXISTING_STAFF_ID,
      publicDisplayName: name,
      professionalTitle: "Medical Director",
      specialty: "Laboratory Medicine",
      qualifications: "MBChB",
      biography: `Unilabs hosted doctor profile ${s}`,
      publicWebsiteVisible: "1",
    });
    result.unilabsCreate = {
      ok: createPost.status === 303 && /tab=doctors/.test(String(createPost.location || "")),
      status: createPost.status,
      location: createPost.location || null,
    };

    const staffAfter = await db.query(
      `SELECT public_display_name, public_profile_enabled, public_profile_key, platform_identity_id,
              (SELECT count(*)::int FROM activeclinic.staff_members sm2
                WHERE sm2.organization_id = sm.organization_id AND sm2.status <> 'archived') AS org_staff
         FROM activeclinic.staff_members sm WHERE id = $1`,
      [UNILABS_EXISTING_STAFF_ID]
    );
    result.unilabsNoDuplicate = {
      ok:
        staffAfter.rows[0] &&
        staffAfter.rows[0].public_profile_enabled === true &&
        staffAfter.rows[0].platform_identity_id != null &&
        Number(staffAfter.rows[0].org_staff) === Number(staffBefore.rows[0].n),
      orgStaff: staffAfter.rows[0] && staffAfter.rows[0].org_staff,
      before: staffBefore.rows[0] && staffBefore.rows[0].n,
    };

    const publicAfter = await createHostedClient(BASE).get(`/clinics/${UNILABS_CLINIC}/doctors`);
    result.unilabsPublic = {
      ok:
        publicAfter.status === 200 &&
        re(name).test(publicAfter.text || "") &&
        /Laboratory Medicine/.test(publicAfter.text || ""),
      status: publicAfter.status,
      name,
    };

    const refresh = await createHostedClient(BASE).get(`/clinics/${UNILABS_CLINIC}/doctors`);
    result.unilabsRefresh = {
      ok: refresh.status === 200 && re(name).test(refresh.text || ""),
      status: refresh.status,
    };

    const client2 = createHostedClient(BASE);
    await login(client2, UNILABS_ADMIN_EMAIL, TEMP_PASSWORD);
    const list = await client2.get("/app/settings/website/catalogue?tab=doctors");
    result.unilabsRelogin = {
      ok: list.status === 200 && re(name).test(list.text || ""),
      status: list.status,
    };

    result.unilabs = {
      ok:
        result.unilabsManageNav.ok &&
        result.unilabsCreate.ok &&
        result.unilabsNoDuplicate.ok &&
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
  const shaPrefix = String(process.env.V2_AC_EXPECTED_SHA || process.argv[2] || "").trim();
  const result = {
    verdict: "V2_AC_DOCTORS_QA_BLOCKED",
    baseUrl: BASE,
    expectedShaPrefix: shaPrefix,
    startedAt: new Date().toISOString(),
  };
  if (!shaPrefix) {
    result.blockReason = "missing_expected_sha";
    fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = 2;
    return;
  }

  const deploy = await waitForDeploy(shaPrefix);
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
      unilabsNoDuplicate: result.unilabsNoDuplicate,
      unilabsPublic: result.unilabsPublic,
      unilabsRefresh: result.unilabsRefresh,
      unilabsRelogin: result.unilabsRelogin,
    };
    result.checks = checks;
    result.verdict = allOk(checks) ? "V2_AC_DOCTORS_QA_PASS" : "V2_AC_DOCTORS_QA_BLOCKED";
    if (result.verdict !== "V2_AC_DOCTORS_QA_PASS") result.blockReason = "hosted_check_failed";
  } catch (err) {
    result.blockReason = err && err.message ? err.message : String(err);
    result.verdict = "V2_AC_DOCTORS_QA_BLOCKED";
  } finally {
    result.finishedAt = new Date().toISOString();
    fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
    await db.end().catch(() => {});
  }
  console.log(JSON.stringify(result, null, 2));
  if (result.verdict !== "V2_AC_DOCTORS_QA_PASS") process.exitCode = 2;
}

main();
