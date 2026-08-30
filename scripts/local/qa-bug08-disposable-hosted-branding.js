#!/usr/bin/env node
"use strict";

/**
 * BUG 08 disposable hosted branding lifecycle (testing only).
 * Provisions a church on moovex-platform-v7, exercises real Chromium on
 * blessboard.pronline.org, then purges the tenant.
 */

const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");
const { Pool } = require("pg");
const { requireDatabaseUrl } = require("../../db/scripts/lib/databaseUrl");
const { buildFoundationPoolConfig } = require("../../db/scripts/lib/foundationPool");
const { provisionPlatformTenant } = require("../../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../../src/blessboard/services/assignBlessBoardRole");
const { repairWebsiteFoundation } = require("../../src/blessboard/services/websiteFoundationRepairService");
const { registerBlessBoardWebsiteTemplate } = require("../../src/blessboard/website/blessboardChurchTemplate");
const { purgeOrganizationTree } = require("../../src/platform/repositories/testingDataResetRepository");
const {
  CODE_MOOVEX_PLATFORM_TESTING,
} = require("../../src/platform/config/deploymentProfiles");

const BB = "https://blessboard.pronline.org";
const LOGO_FIXTURE = path.join(
  __dirname,
  "../../public/church/images/brand/blessboard-small-church-logo.png"
);
const COLOUR_A = "#2e4057";
const COLOUR_B = "#1a2b3c";
const LOGO_ALT = "BUG08 disposable branding logo alt";

const report = { ok: true, steps: [], churchKey: null, organizationId: null };

function step(name, ok, detail) {
  report.steps.push({ name, ok, detail: detail || "" });
  if (!ok) report.ok = false;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function assertTestingIdentity(pool) {
  return pool.query(
    `SELECT identity_key, environment_code FROM platform.database_identity LIMIT 1`
  ).then((r) => {
    const row = r.rows[0] || {};
    if (row.identity_key !== "moovex-platform-v7" || row.environment_code !== "testing") {
      throw new Error(
        `refusing: database identity ${row.identity_key}/${row.environment_code}`
      );
    }
  });
}

async function provisionDisposable(pool) {
  const stamp = Date.now().toString(36).slice(-8);
  const key = `bb08h${stamp}`.slice(0, 20);
  const email = `bb08h-${stamp}@example.invalid`;
  const password = "1234567890";
  const tenant = await provisionPlatformTenant(pool, {
    organizationKey: key,
    displayName: `BB08 Hosted QA ${key}`,
    legalName: null,
    dataEnvironment: "testing",
    productKey: "blessboard",
    productTenantKey: key,
    skipDomain: true,
    deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
  });
  if (!tenant.ok) throw new Error(`provisionPlatformTenant: ${tenant.message}`);
  const organizationId = tenant.records.organization.id;
  await pool.query(
    `UPDATE platform.organizations SET test_cleanup_eligible = true WHERE id = $1`,
    [organizationId]
  );
  const churchProv = await provisionBlessBoardChurch(pool, {
    organizationKey: key,
    churchKey: key,
    displayName: `BB08 Hosted QA ${key}`,
    legalName: null,
    dataEnvironment: "testing",
    hqBranchKey: "hq",
    hqBranchDisplayName: "HQ",
    timezone: "Africa/Lusaka",
    countryCode: "ZM",
  });
  if (!churchProv.ok) throw new Error(`provisionBlessBoardChurch: ${churchProv.message}`);
  const churchId = churchProv.records.church.id;
  await pool.query(
    `INSERT INTO blessboard.church_settings (church_id, public_name, primary_email, website_status)
     VALUES ($1, $2, $3, 'published')
     ON CONFLICT (church_id) DO UPDATE
       SET public_name = EXCLUDED.public_name,
           website_status = 'published'`,
    [churchId, `BB08 Hosted QA ${key}`, email]
  );
  registerBlessBoardWebsiteTemplate();
  const repaired = await repairWebsiteFoundation(pool, {
    churchId,
    publicName: `BB08 Hosted QA ${key}`,
  });
  if (!repaired.ok) throw new Error(`repairWebsiteFoundation: ${JSON.stringify(repaired)}`);
  const user = await createBlessBoardUser(pool, {
    email,
    password,
    displayName: "BB08 HQ Admin",
  });
  if (!user.ok) throw new Error(`createBlessBoardUser: ${user.message}`);
  const role = await assignBlessBoardRole(pool, {
    email,
    organizationKey: key,
    roleKey: "church_hq_admin",
    churchKey: key,
  });
  if (!role.ok) throw new Error(`assignBlessBoardRole: ${role.message}`);
  return { key, organizationId, churchId, email, password };
}

async function login(page, email, password) {
  await page.goto(`${BB}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), page.click('button[type="submit"]')]);
}

async function bodyPrimary(page) {
  return page.evaluate(() => {
    const style = document.body.getAttribute("style") || "";
    const m = style.match(/--bb-violet:\s*(#[0-9a-f]{6})/i);
    if (m) return m[1].toLowerCase();
    const css = getComputedStyle(document.body).getPropertyValue("--bb-violet").trim();
    return css && css.startsWith("#") ? css.toLowerCase() : null;
  });
}

async function publishFromReview(page) {
  await page.goto(`${BB}/hq/website/publish/review`, { waitUntil: "domcontentloaded" });
  const publishable = await page.locator('button[form="phase4-publish-form"]').count();
  if (!publishable) {
    const snippet = await page.locator(".bb-phase4-publish, .bb-hq-card").first().textContent().catch(() => "");
    throw new Error(`publish review not publishable: ${String(snippet).slice(0, 200)}`);
  }
  await page.check('input[name="preview_reviewed"]');
  const mob = page.locator('input[name="mobile_preview_confirmed"]');
  if (await mob.count()) await mob.check();
  await page.locator('button[form="phase4-publish-form"]').first().click();
  await page.waitForLoadState("domcontentloaded");
}

async function runHostedE2E(ctx) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await login(page, ctx.email, ctx.password);
    step("hosted_login", page.url().includes("/hq"), page.url());

    const instanceCount = await ctx.pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.website_instances WHERE organization_id = $1 AND product_code = 'blessboard'`,
      [ctx.organizationId]
    );
    step("single_website_instance", instanceCount.rows[0].n === 1, String(instanceCount.rows[0].n));

    await publishFromReview(page);
    step("baseline_publish", /publish\/success|\/c\//.test(page.url()), page.url());

    const livePage = await context.newPage();
    await livePage.goto(`${BB}/c/${ctx.key}`, { waitUntil: "domcontentloaded" });
    const liveBefore = await bodyPrimary(livePage);
    await livePage.close();
    step("recorded_live_before_branding", true, liveBefore || "default");

    await page.goto(`${BB}/hq/website/branding`, { waitUntil: "domcontentloaded" });

    await page.fill('input[name="primaryColor"]', COLOUR_A);
    await page.fill('input[name="accentColor"]', "#4a6fa5");
    await page.fill('input[name="logoAlt"]', LOGO_ALT);
    const uploadInput = page.locator('[data-bb-wb-media-field]').first().locator('input[data-bb-wb-upload]');
    const uploadWait = page.waitForResponse(
      (res) => res.url().includes("/website/media") && res.request().method() === "POST",
      { timeout: 60000 }
    );
    await uploadInput.setInputFiles(LOGO_FIXTURE);
    const uploadRes = await uploadWait;
    const uploadJson = await uploadRes.json();
    step(
      "logo_upload_publicSrc",
      uploadJson.ok === true && !!uploadJson.media?.publicSrc,
      uploadJson.media?.publicSrc || "missing"
    );
    await page.waitForFunction(() => {
      const src = document.querySelector('[data-bb-wb-media-src]');
      return src && src.value;
    });
    const hiddenSrc = await page.locator('[data-bb-wb-media-src]').first().inputValue();
    step(
      "logo_preview_src_populated",
      hiddenSrc === uploadJson.media.publicSrc,
      hiddenSrc || "empty"
    );

    await page.locator('form[data-bb-wb-brand-form] button[type="submit"]').click();
    await page.waitForURL(/saved=1/, { timeout: 30000 });
    step("branding_save", true);

    const altAfterSave = await page.inputValue('input[name="logoAlt"]');
    step("logo_alt_retained", altAfterSave === LOGO_ALT, altAfterSave);

    const previewPage = await context.newPage();
    await login(previewPage, ctx.email, ctx.password);
    await previewPage.goto(`${BB}/c/${ctx.key}?website_mode=draft`, { waitUntil: "domcontentloaded" });
    const previewColour = await bodyPrimary(previewPage);
    step("preview_draft_colour", previewColour === COLOUR_A, previewColour || "missing");
    await previewPage.close();

    const liveMidPage = await context.newPage();
    await liveMidPage.goto(`${BB}/c/${ctx.key}`, { waitUntil: "domcontentloaded" });
    const liveMid = await bodyPrimary(liveMidPage);
    await liveMidPage.close();
    step("live_unchanged_before_publish", liveMid !== COLOUR_A, liveMid || "default");

    await publishFromReview(page);
    step("publish_branding", /publish\/success|\/c\//.test(page.url()), page.url());

    const liveAfterPage = await context.newPage();
    await liveAfterPage.goto(`${BB}/c/${ctx.key}`, { waitUntil: "domcontentloaded" });
    const liveAfter = await bodyPrimary(liveAfterPage);
    await liveAfterPage.close();
    step("live_colour_after_publish", liveAfter === COLOUR_A, liveAfter || "missing");

    await page.goto(`${BB}/hq/website/branding`, { waitUntil: "domcontentloaded" });
    await page.fill('input[name="primaryColor"]', COLOUR_B);
    await page.fill('input[name="accentColor"]', "#334455");
    await page.locator('form[data-bb-wb-brand-form] button[type="submit"]').click();
    await page.waitForURL(/saved=1/);
    await publishFromReview(page);
    step("publish_colour_b", true);

    await page.goto(`${BB}/hq/website/version-history`, { waitUntil: "domcontentloaded" });
    const restoreHref = await page.locator('a[href*="/restore"]').nth(1).getAttribute("href");
    step("version_history_restore_link", !!restoreHref, restoreHref || "");
    await page.goto(`${BB}${restoreHref}`, { waitUntil: "domcontentloaded" });
    await page.fill("#restore-reason", "BUG08 hosted restore QA");
    await page.check('input[name="confirm_restore"]');
    await page.locator('form.bb-hq-phase3-restore__form button[type="submit"]').click();
    await page.waitForLoadState("domcontentloaded");

    const restoredPreview = await context.newPage();
    await login(restoredPreview, ctx.email, ctx.password);
    await restoredPreview.goto(`${BB}/c/${ctx.key}?website_mode=draft`, { waitUntil: "domcontentloaded" });
    const restoredColour = await bodyPrimary(restoredPreview);
    step("restore_preview_colour", restoredColour === COLOUR_A, restoredColour || "missing");
    await restoredPreview.close();

    await publishFromReview(page);
    const liveRestoredPage = await context.newPage();
    await liveRestoredPage.goto(`${BB}/c/${ctx.key}`, { waitUntil: "domcontentloaded" });
    const liveRestored = await bodyPrimary(liveRestoredPage);
    await liveRestoredPage.close();
    step("restore_live_colour", liveRestored === COLOUR_A, liveRestored || "missing");
  } finally {
    await browser.close();
  }
}

async function main() {
  if (process.env.DEPLOYMENT_ENV && process.env.DEPLOYMENT_ENV !== "testing") {
    throw new Error("refusing: DEPLOYMENT_ENV must be testing");
  }
  const url = requireDatabaseUrl();
  const pool = new Pool({ ...buildFoundationPoolConfig(url), max: 4 });
  let disposable = null;
  try {
    await assertTestingIdentity(pool);
    if (!fs.existsSync(LOGO_FIXTURE)) throw new Error("logo fixture missing");
    disposable = await provisionDisposable(pool);
    report.churchKey = disposable.key;
    report.organizationId = disposable.organizationId;
    console.log(`Disposable church: ${disposable.key} (${disposable.organizationId})`);
    await runHostedE2E({ ...disposable, pool });
  } finally {
    if (disposable && disposable.organizationId) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const purged = await purgeOrganizationTree(client, {
          organizationId: disposable.organizationId,
          preserveOrgIds: [],
          preserveUserIds: [],
        });
        await client.query("COMMIT");
        step("purge_disposable", purged.ok === true, purged.reason || purged.status || "ok");
      } catch (err) {
        await client.query("ROLLBACK");
        step("purge_disposable", false, err.message);
      } finally {
        client.release();
      }
    }
    await pool.end().catch(() => {});
  }
  console.log("\n--- REPORT ---");
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
