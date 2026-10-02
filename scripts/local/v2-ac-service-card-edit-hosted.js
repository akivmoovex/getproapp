"use strict";

/**
 * V2.0 BUG 08 — ActiveClinic service card editing hosted QA.
 * Unilabs-02: Edit service control → catalogue editor → persist one service.
 */

const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

const root = path.resolve(__dirname, "../..");
process.chdir(root);

require("dotenv").config({ path: ".env.testing.local", quiet: true });

const {
  createProvisionPool,
  resolveDatabaseUrlSafe,
} = require(`${root}/db/scripts/lib/provisionCliSafety`);
const {
  CSRF_FIELD,
  createHostedClient,
  extractCsrfField,
} = require(`${root}/src/activeclinic/qa/activeClinicHostedAuthQaClient`);
const {
  setPlatformIdentityPassword,
} = require(`${root}/src/platform/services/platformIdentityCredentialService`);

const BASE = process.env.V2_AC_HOSTED_BASE || "https://activeclinic.neuniversity.org";
const PROD = process.env.V2_AC_PROD_BASE || "https://activeclinic.pronline.org";
const EXPECTED_SHA_PREFIX = process.env.V2_AC_SERVICE_CARD_EXPECTED_SHA || "PLACEHOLDER";
const OUT = process.env.V2_AC_SERVICE_CARD_OUT || "/tmp/v2-ac-service-card-edit-hosted.json";
const UNILABS_ADMIN_ID = "6ec70d81-1275-42f6-87bb-e45a479f306c";
const UNILABS_ADMIN_EMAIL = "lukisamanjoz@gmail.com";
const UNILABS_CLINIC = "unilabs-02";
const TEMP_PASSWORD = `V2SvcCard!${crypto.randomBytes(4).toString("hex")}`;

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
    if (health.status === 200 && String(last.gitSha || "").startsWith(EXPECTED_SHA_PREFIX)) {
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

function extractEditHrefs(html) {
  const hrefs = [];
  const reHref =
    /data-ac-edit-service="1"[^>]*href="([^"]+)"|href="([^"]+)"[^>]*data-ac-edit-service="1"/gi;
  let m;
  while ((m = reHref.exec(html))) {
    const raw = m[1] || m[2];
    if (raw) hrefs.push(raw.replace(/&amp;/g, "&"));
  }
  if (!hrefs.length) {
    const loose =
      /href="(\/app\/settings\/website\/catalogue\/services\/[0-9a-f-]{36}\/edit[^"]*)"[^>]*>\s*Edit service/gi;
    while ((m = loose.exec(html))) hrefs.push(String(m[1]).replace(/&amp;/g, "&"));
  }
  return hrefs;
}

function decodeAttr(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}


function extractCardNames(html) {
  const names = [];
  const reName = /<h3[^>]*ac-service-card__name[^>]*>([\s\S]*?)<\/h3>/gi;
  let m;
  while ((m = reName.exec(html))) {
    const text = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text) names.push(text);
  }
  return names;
}

async function main() {
  const result = {
    status: "BLOCKED",
    expectedShaPrefix: EXPECTED_SHA_PREFIX,
    clinic: UNILABS_CLINIC,
    startedAt: new Date().toISOString(),
  };

  if (EXPECTED_SHA_PREFIX === "PLACEHOLDER") {
    result.blockReason = "set_V2_AC_SERVICE_CARD_EXPECTED_SHA";
    fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    process.exit(2);
  }

  const deploy = await waitForDeploy();
  result.deploy = deploy;
  result.hostedSha = deploy.hosted && deploy.hosted.gitSha;
  if (!deploy.ok) {
    result.blockReason = deploy.blockReason;
    fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    process.exit(2);
  }

  const prodHealth = await createHostedClient(PROD).get("/healthz");
  let prodBody = {};
  try {
    prodBody = JSON.parse(prodHealth.text || "{}");
  } catch (_e) {
    prodBody = {};
  }
  result.productionUntouched = {
    ok:
      prodHealth.status === 200 &&
      !String(prodBody.platformLine || "").toLowerCase().includes("v8") &&
      String(prodBody.gitSha || "") !== String(result.hostedSha || ""),
    gitSha: prodBody.gitSha || null,
    deploymentCode: prodBody.deploymentCode || null,
  };

  const url = resolveDatabaseUrlSafe();
  if (!url.ok) {
    result.blockReason = "missing_database_url";
    fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    process.exit(2);
  }
  const db = createProvisionPool(url.connectionString);
  const prior = await db.query(`SELECT password_hash FROM platform.identities WHERE id = $1`, [
    UNILABS_ADMIN_ID,
  ]);
  const priorHash = prior.rows[0] && prior.rows[0].password_hash;

  try {
    const setPwd = await setPlatformIdentityPassword(db, {
      identityId: UNILABS_ADMIN_ID,
      password: TEMP_PASSWORD,
    });
    if (!setPwd.ok) {
      result.blockReason = setPwd.code || "password_set_failed";
      fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result, null, 2));
      process.exit(2);
    }

    const client = createHostedClient(BASE);
    const loginRes = await login(client, UNILABS_ADMIN_EMAIL, TEMP_PASSWORD);
    result.login = loginRes;
    if (!loginRes.ok) {
      result.blockReason = "login_failed";
      fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result, null, 2));
      process.exit(2);
    }

    const editUrl = `/clinics/${UNILABS_CLINIC}/services?website_edit=1&website_mode=draft`;
    const beforeEdit = await client.get(editUrl);
    const beforeNames = extractCardNames(beforeEdit.text || "");
    const editHrefs = extractEditHrefs(beforeEdit.text || "");
    result.cardAffordances = {
      status: beforeEdit.status,
      hasEditControls: editHrefs.length > 0,
      editControlCount: editHrefs.length,
      hasManageCatalogue: /Manage public catalogue/.test(beforeEdit.text || ""),
      cardCount: beforeNames.length,
      sampleHref: editHrefs[0] || null,
    };

    if (!result.cardAffordances.hasEditControls) {
      result.blockReason = "no_edit_service_controls_on_cards";
      result.status = "BLOCKED";
      fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result, null, 2));
      process.exit(2);
    }

    // Prefer editing an existing card; if none with id, create one first.
    let targetHref = editHrefs[0];
    let createdName = null;
    if (!beforeNames.length) {
      const s = stamp();
      createdName = `V2 Card Edit Seed ${s}`;
      const createGet = await client.get("/app/settings/website/catalogue/services/new");
      await client.postForm("/app/settings/website/catalogue/services/new", {
        [CSRF_FIELD]: extractCsrfField(createGet.text) || client.jar.csrf(),
        displayName: createdName,
        category: "Consultation",
        description: `Seed ${s}`,
        publicSummary: "Consultation",
        defaultDurationMinutes: "30",
        publicWebsiteVisible: "1",
        publicBookable: "1",
      });
      const seeded = await client.get(editUrl);
      const seededHrefs = extractEditHrefs(seeded.text || "");
      targetHref = seededHrefs[0];
      result.seeded = { ok: Boolean(targetHref), name: createdName };
      if (!targetHref) {
        result.blockReason = "seed_failed_no_edit_href";
        fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
        console.log(JSON.stringify(result, null, 2));
        process.exit(2);
      }
    }

    const formGet = await client.get(targetHref);
    result.editorNavigation = {
      status: formGet.status,
      ok:
        formGet.status === 200 &&
        /data-ac-catalogue-service-form="1"/.test(formGet.text || "") &&
        /name="displayName"/.test(formGet.text || "") &&
        /imageMediaId/.test(formGet.text || "") &&
        /website-cms-media-field|media-field|data-website-media/.test(formGet.text || ""),
      hasReturnTo: /name="returnTo"/.test(formGet.text || ""),
      title: /Edit service/.test(formGet.text || ""),
    };

    const originalNameMatch = String(formGet.text || "").match(
      /name="displayName"[^>]*value="([^"]*)"/i
    );
    const originalName = decodeAttr((originalNameMatch && originalNameMatch[1]) || "");
    const siblingNamesBefore = extractCardNames((await client.get(editUrl)).text || "").filter(
      (n) => n !== originalName
    );

    const s = stamp();
    const editedName = `V2 Card Edited ${s}`;
    const editedSummary = `Card edit QA ${s}`;
    const returnToMatch = String(formGet.text || "").match(/name="returnTo"[^>]*value="([^"]*)"/i);
    const returnTo = decodeAttr((returnToMatch && returnToMatch[1]) || editUrl);
    const actionMatch = String(formGet.text || "").match(
      /data-ac-catalogue-service-form="1"[^>]*action="([^"]+)"|action="([^"]+)"[^>]*data-ac-catalogue-service-form="1"/i
    );
    const actionPath =
      (actionMatch && decodeAttr(actionMatch[1] || actionMatch[2])) || targetHref.split("?")[0];

    // Fresh CSRF immediately before save (cookie can rotate after intermediate GETs).
    const freshForm = await client.get(targetHref);
    const csrf = extractCsrfField(freshForm.text) || client.jar.csrf();
    const editPost = await client.postForm(actionPath, {
      [CSRF_FIELD]: csrf,
      displayName: editedName,
      category: "Consultation",
      description: `Updated via card edit ${s}`,
      publicSummary: editedSummary,
      defaultDurationMinutes: "40",
      publicWebsiteVisible: "1",
      publicBookable: "1",
      returnTo,
    });
    const afterRedirect = await client.follow(editPost);
    result.update = {
      status: editPost.status,
      ok: editPost.status === 303,
      location: editPost.location || null,
      returnedToServices: /\/services/.test(String(editPost.location || afterRedirect.url || "")),
      csrfPresent: Boolean(csrf),
      actionPath,
    };

    const afterEditPage = await client.get(editUrl);
    const afterNames = extractCardNames(afterEditPage.text || "");
    result.isolation = {
      editedPresent: afterNames.some((n) => n === editedName),
      siblingsPreserved: siblingNamesBefore.every((n) => afterNames.includes(n)),
      afterNames,
      siblingNamesBefore,
    };

    const publicPage = await createHostedClient(BASE).get(`/clinics/${UNILABS_CLINIC}/services`);
    result.publicRender = {
      status: publicPage.status,
      hasEdited: re(editedName).test(publicPage.text || ""),
      missingOriginal:
        !originalName ||
        originalName === editedName ||
        !re(originalName).test(publicPage.text || ""),
    };

    // Refresh persistence
    const refresh = await createHostedClient(BASE).get(`/clinics/${UNILABS_CLINIC}/services`);
    result.refresh = {
      status: refresh.status,
      ok: refresh.status === 200 && re(editedName).test(refresh.text || ""),
    };

    result.status =
      result.cardAffordances.hasEditControls &&
      result.editorNavigation.ok &&
      result.update.ok &&
      result.isolation.editedPresent &&
      result.isolation.siblingsPreserved &&
      result.publicRender.hasEdited &&
      result.refresh.ok &&
      result.productionUntouched.ok
        ? "PASS"
        : "BLOCKED";

    if (result.status !== "PASS") {
      result.blockReason = [
        !result.cardAffordances.hasEditControls && "missing_card_edit_controls",
        !result.editorNavigation.ok && "catalogue_editor_not_opened",
        !result.update.ok && "service_update_failed",
        !result.isolation.editedPresent && "edited_name_missing",
        !result.isolation.siblingsPreserved && "sibling_services_modified",
        !result.publicRender.hasEdited && "public_not_updated",
        !result.refresh.ok && "refresh_lost_edit",
        !result.productionUntouched.ok && "production_touched_or_unreachable",
      ]
        .filter(Boolean)
        .join(",");
    }
  } finally {
    if (priorHash) {
      await db.query(
        `UPDATE platform.identities SET password_hash = $2, updated_at = now() WHERE id = $1`,
        [UNILABS_ADMIN_ID, priorHash]
      );
      result.passwordRestored = true;
    }
    await db.end().catch(() => {});
  }

  result.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === "PASS" ? 0 : 2);
}

main().catch((err) => {
  const result = { status: "BLOCKED", blockReason: String(err && err.stack ? err.stack : err) };
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(2);
});
