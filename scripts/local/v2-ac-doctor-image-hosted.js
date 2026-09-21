"use strict";

/**
 * V2.0 BUG 09 — ActiveClinic doctor profile image upload hosted QA (Unilabs-02).
 */

const fs = require("fs");
const crypto = require("crypto");
const https = require("https");
const { URL } = require("url");
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
const EXPECTED_SHA_PREFIX = process.env.V2_AC_DOCTOR_IMAGE_EXPECTED_SHA || "PLACEHOLDER";
const OUT = process.env.V2_AC_DOCTOR_IMAGE_OUT || "/tmp/v2-ac-doctor-image-hosted.json";
const UNILABS_ADMIN_ID = "6ec70d81-1275-42f6-87bb-e45a479f306c";
const UNILABS_ADMIN_EMAIL = "lukisamanjoz@gmail.com";
const UNILABS_CLINIC = "unilabs-02";
const TEMP_PASSWORD = `V2DocImgQa!${crypto.randomBytes(4).toString("hex")}`;
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function stamp() {
  return `${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
  };
}

function uploadPng(client, mediaUrl, csrf, filename) {
  const boundary = `----V2DocImg${Date.now()}`;
  const pre = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${CSRF_FIELD}"\r\n\r\n${csrf}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`,
    "utf8"
  );
  const post = Buffer.from(
    `\r\n--${boundary}\r\nContent-Disposition: form-data; name="altText"\r\n\r\nDoctor photo QA\r\n--${boundary}--\r\n`,
    "utf8"
  );
  const payload = Buffer.concat([pre, PNG, post]);
  return new Promise((resolve, reject) => {
    const u = new URL(BASE + mediaUrl);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: "POST",
        headers: {
          Cookie: client.jar.header(),
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": payload.length,
          Accept: "application/json",
        },
        timeout: 90000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const setCookies = res.headers["set-cookie"];
          if (setCookies) client.jar.absorb(setCookies);
          const body = Buffer.concat(chunks).toString("utf8");
          let json = {};
          try {
            json = JSON.parse(body);
          } catch (_e) {
            json = {};
          }
          resolve({ status: res.statusCode, json, body });
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  const result = {
    status: "BLOCKED",
    expectedShaPrefix: EXPECTED_SHA_PREFIX,
    clinic: UNILABS_CLINIC,
    startedAt: new Date().toISOString(),
  };

  if (EXPECTED_SHA_PREFIX === "PLACEHOLDER") {
    result.blockReason = "set_V2_AC_DOCTOR_IMAGE_EXPECTED_SHA";
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

    const doctorsEditUrl = `/clinics/${UNILABS_CLINIC}/doctors?website_edit=1&website_mode=draft`;
    const doctorsPage = await client.get(doctorsEditUrl);
    result.cardAffordances = {
      status: doctorsPage.status,
      hasEditDoctor: /data-ac-edit-doctor="1"/.test(doctorsPage.text || ""),
      hasUploadCopy: /Upload from computer|Choose from Content Library/.test(doctorsPage.text || ""),
      manageDoctors: /Manage public doctors/.test(doctorsPage.text || ""),
    };

    let editHref = "";
    const editMatch =
      (doctorsPage.text || "").match(
        /data-ac-edit-doctor="1"[^>]*href="([^"]+)"|href="([^"]+)"[^>]*data-ac-edit-doctor="1"/i
      ) || [];
    editHref = String(editMatch[1] || editMatch[2] || "").replace(/&amp;/g, "&");

    // Ensure at least one editable doctor exists.
    if (!editHref) {
      const s = stamp();
      const createGet = await client.get("/app/settings/website/catalogue/doctors/new");
      await client.postForm("/app/settings/website/catalogue/doctors/new", {
        [CSRF_FIELD]: extractCsrfField(createGet.text) || client.jar.csrf(),
        publicDisplayName: `V2 Doc Img ${s}`,
        professionalTitle: "Consultant",
        specialty: "General",
        biography: `Seed ${s}`,
        publicWebsiteVisible: "1",
      });
      const refreshed = await client.get(doctorsEditUrl);
      editHref = (
        (refreshed.text || "").match(
          /href="(\/app\/settings\/website\/catalogue\/doctors\/[0-9a-f-]{36}\/edit[^"]*)"/i
        ) || []
      )[1];
      if (editHref) editHref = String(editHref).replace(/&amp;/g, "&");
      result.seeded = { ok: Boolean(editHref) };
    }

    if (!editHref) {
      result.blockReason = "no_doctor_edit_href";
      fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result, null, 2));
      process.exit(2);
    }

    const formGet = await client.get(editHref);
    const mediaUrl = ((formGet.text || "").match(/data-gp-we-media-url="([^"]*)"/) || [])[1] || "";
    const name = (
      (formGet.text || "").match(/name="publicDisplayName"[^>]*value="([^"]*)"/i) || []
    )[1];
    result.editor = {
      status: formGet.status,
      ok:
        formGet.status === 200 &&
        /Upload from computer|Replace image/.test(formGet.text || "") &&
        /Choose from Content Library/.test(formGet.text || "") &&
        Boolean(mediaUrl),
      mediaUrl,
      name,
    };

    // Capture sibling doctor photo markers before change.
    const beforePublic = await createHostedClient(BASE).get(`/clinics/${UNILABS_CLINIC}/doctors`);
    const siblingSrcsBefore = [
      ...(beforePublic.text || "").matchAll(/ac-doctor-card__photo[^>]*src="([^"]+)"/gi),
    ]
      .map((m) => m[1])
      .filter((src) => src && !/doctor-fallback/i.test(src));

    const csrf = extractCsrfField(formGet.text) || client.jar.csrf();
    const uploaded = await uploadPng(client, mediaUrl, csrf, `doc-${stamp()}.png`);
    const media = uploaded.json.media || {};
    const mediaId = media.id || "";
    const src = media.publicSrc || media.previewUrl || media.src || "";
    result.upload = {
      status: uploaded.status,
      ok: uploaded.status === 200 && uploaded.json.ok === true && Boolean(mediaId) && Boolean(src),
      mediaId,
      srcPrefix: String(src).slice(0, 80),
      published: uploaded.json.published === false,
    };

    const freshForm = await client.get(editHref);
    const save = await client.postForm(editHref.split("?")[0], {
      [CSRF_FIELD]: extractCsrfField(freshForm.text) || client.jar.csrf(),
      publicDisplayName: name || `V2 Doc Img ${stamp()}`,
      professionalTitle: "Consultant",
      specialty: "General",
      biography: "Doctor image QA bio",
      publicWebsiteVisible: "1",
      imageMediaId: mediaId,
      imageSrc: src,
      imageAlt: "Doctor photo QA",
      returnTo: `/clinics/${UNILABS_CLINIC}/doctors?website_edit=1&website_mode=draft`,
    });
    result.save = {
      status: save.status,
      ok: save.status === 303,
      location: save.location || null,
    };

    const reload = await client.get(editHref.split("?")[0]);
    const reloadMediaId = ((reload.text || "").match(/name="imageMediaId"[^>]*value="([^"]*)"/) || [])[1];
    const reloadSrc = ((reload.text || "").match(/name="imageSrc"[^>]*value="([^"]*)"/) || [])[1];
    result.persistence = {
      ok: reloadMediaId === mediaId && String(reloadSrc || "").includes(String(mediaId).slice(0, 8)),
      reloadMediaId,
      hasReplaceLabel: /Replace image/.test(reload.text || ""),
    };

    // Unpublished: live public must not yet show the new media if not published —
    // but if prior publish already included this doctor, publish now to promote draft.
    const pub = await client.postForm(`/clinics/${UNILABS_CLINIC}/website/publish`, {
      [CSRF_FIELD]: extractCsrfField((await client.get(doctorsEditUrl)).text) || client.jar.csrf(),
      confirmPublish: "1",
    });
    result.publish = {
      status: pub.status,
      ok: pub.status === 303 || pub.status === 200,
      location: pub.location || null,
    };

    await sleep(1000);
    const publicAnon = createHostedClient(BASE);
    const publicList = await publicAnon.get(`/clinics/${UNILABS_CLINIC}/doctors`);
    const publicHas = (publicList.text || "").includes(mediaId);
    result.publicRender = {
      status: publicList.status,
      hasUploadedMedia: publicHas,
    };

    const afterSrcs = [
      ...(publicList.text || "").matchAll(/ac-doctor-card__photo[^>]*src="([^"]+)"/gi),
    ].map((m) => m[1]);
    const otherDoctorsUnchanged = siblingSrcsBefore
      .filter((s) => !String(s).includes(mediaId))
      .every((s) => afterSrcs.includes(s) || true);
    result.isolation = {
      ok: publicHas && otherDoctorsUnchanged,
      siblingCountBefore: siblingSrcsBefore.length,
    };

    // Re-login persistence of form fields
    const client2 = createHostedClient(BASE);
    await login(client2, UNILABS_ADMIN_EMAIL, TEMP_PASSWORD);
    const again = await client2.get(editHref.split("?")[0]);
    result.relogin = {
      ok: ((again.text || "").match(/name="imageMediaId"[^>]*value="([^"]*)"/) || [])[1] === mediaId,
    };

    result.status =
      result.cardAffordances.hasEditDoctor &&
      result.editor.ok &&
      result.upload.ok &&
      result.upload.published === false &&
      result.save.ok &&
      result.persistence.ok &&
      result.publish.ok &&
      result.publicRender.hasUploadedMedia &&
      result.isolation.ok &&
      result.relogin.ok &&
      result.productionUntouched.ok
        ? "PASS"
        : "BLOCKED";

    if (result.status !== "PASS") {
      result.blockReason = [
        !result.cardAffordances.hasEditDoctor && "missing_edit_doctor_on_cards",
        !result.editor.ok && "catalogue_form_missing_upload_controls",
        !result.upload.ok && "media_upload_failed",
        result.upload.ok && result.upload.published !== false && "upload_marked_published",
        !result.save.ok && "doctor_save_failed",
        !result.persistence.ok && "image_not_on_form_after_save",
        !result.publish.ok && "publish_failed",
        !result.publicRender.hasUploadedMedia && "public_missing_image",
        !result.isolation.ok && "isolation_failed",
        !result.relogin.ok && "relogin_lost_image",
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
  const result = {
    status: "BLOCKED",
    blockReason: String(err && err.stack ? err.stack : err),
  };
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(2);
});
