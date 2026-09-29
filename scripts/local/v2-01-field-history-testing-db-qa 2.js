"use strict";

/**
 * Hosted-testing DB QA for Field History restore using disposable tenants only.
 * Never resets the shared database. Never prints secrets.
 *
 * Usage (from repo root, with .env DATABASE_URL pointing at testing identity):
 *   node scripts/local/v2-01-field-history-testing-db-qa.js
 */

require("dotenv").config({ path: ".env" });
const { Pool } = require("pg");

const changeManager = require("../../src/platform/website/websiteChangeManagerService");
const contentService = require("../../src/platform/website/contentService");
const publicationService = require("../../src/platform/website/publicationService");
const { PERMISSIONS } = require("../../src/platform/website/permissions");
const { PUBLISH_POLICY } = require("../../src/platform/website/publishPolicy");
const { provisionPlatformTenant } = require("../../src/platform/services/provisionPlatformTenant");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../src/platform/config/deploymentProfiles");
const {
  registerActiveClinicWebsiteTemplate,
  ACTIVECLINIC_TEMPLATE_ID,
  ACTIVECLINIC_TEMPLATE_VERSION,
} = require("../../src/activeclinic/website/activeClinicWebsiteTemplate");
const { provisionWebsiteInstance } = require("../../src/platform/website/provisionService");

const GRANTS = [PERMISSIONS.VIEW, PERMISSIONS.EDIT, PERMISSIONS.PUBLISH];

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

async function assertTestingIdentity(pool) {
  const { rows } = await pool.query(
    `SELECT identity_key, environment_code
       FROM platform.database_identity
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 1`
  );
  assert(rows[0], "missing database_identity");
  assert(rows[0].identity_key === "moovex-platform-v7", `unexpected identity_key=${rows[0].identity_key}`);
  assert(rows[0].environment_code === "testing", `unexpected environment_code=${rows[0].environment_code}`);
  return rows[0];
}

async function seedTenant(pool, suffix) {
  registerActiveClinicWebsiteTemplate();
  const stamp = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `fh_qa_${suffix}_${stamp}`,
    displayName: `FH QA ${suffix} ${stamp}`,
    productKey: "activeclinic",
    productTenantKey: `fh-qa-${suffix}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert(org.ok === true, `provision failed: ${JSON.stringify(org).slice(0, 240)}`);
  const provisioned = await provisionWebsiteInstance(pool, {
    organizationId: org.records.organization.id,
    templateId: ACTIVECLINIC_TEMPLATE_ID,
    templateVersion: ACTIVECLINIC_TEMPLATE_VERSION,
    slug: `fh-qa-${suffix}-${stamp}`,
    status: "coming_soon",
    publishPolicy: PUBLISH_POLICY.TENANT_PUBLISH,
  });
  assert(provisioned.ok === true, `website provision failed: ${JSON.stringify(provisioned).slice(0, 240)}`);
  return {
    organizationId: org.records.organization.id,
    instance: provisioned.instance,
    label: `fh-qa-${suffix}-${stamp}`,
  };
}

async function testUndoAndPreserve(pool) {
  const tenant = await seedTenant(pool, "undo");
  const keyA = "home.hero.title";
  const keyB = "home.hero.subtitle";
  await contentService.saveWebsiteDraft(pool, {
    organizationId: tenant.organizationId,
    instanceId: tenant.instance.id,
    contentKey: keyA,
    value: "Published A",
    grantedPermissions: GRANTS,
  });
  await contentService.saveWebsiteDraft(pool, {
    organizationId: tenant.organizationId,
    instanceId: tenant.instance.id,
    contentKey: keyB,
    value: "Published B",
    grantedPermissions: GRANTS,
  });
  const published = await publicationService.publishWebsiteDraft(pool, {
    organizationId: tenant.organizationId,
    instanceId: tenant.instance.id,
    actorIdentityId: null,
    grantedPermissions: GRANTS,
  });
  assert(published.ok === true, `publish failed ${JSON.stringify(published).slice(0, 200)}`);

  await contentService.saveWebsiteDraft(pool, {
    organizationId: tenant.organizationId,
    instanceId: tenant.instance.id,
    contentKey: keyA,
    value: "Draft A",
    grantedPermissions: GRANTS,
  });
  await contentService.saveWebsiteDraft(pool, {
    organizationId: tenant.organizationId,
    instanceId: tenant.instance.id,
    contentKey: keyB,
    value: "Draft B kept",
    grantedPermissions: GRANTS,
  });

  let summary = await changeManager.getPendingChangeSummary(pool, {
    organizationId: tenant.organizationId,
    instanceId: tenant.instance.id,
    grantedPermissions: GRANTS,
  });
  assert(summary.pendingChangeCount === 2, `expected 2 pending got ${summary.pendingChangeCount}`);

  const restored = await changeManager.restoreFieldRevisionToDraft(pool, {
    organizationId: tenant.organizationId,
    instanceId: tenant.instance.id,
    contentKey: keyA,
    choice: "undo_current_edit",
    grantedPermissions: GRANTS,
  });
  assert(restored.ok === true, JSON.stringify(restored).slice(0, 240));
  assert(restored.published === false, "restore must not publish");
  assert(restored.pendingChangeCount === 1, `pending after undo expected 1 got ${restored.pendingChangeCount}`);

  const rowA = await contentService.getWebsiteContentRow(
    pool,
    tenant.instance.id,
    tenant.organizationId,
    keyA
  );
  const rowB = await contentService.getWebsiteContentRow(
    pool,
    tenant.instance.id,
    tenant.organizationId,
    keyB
  );
  assert(rowA.draftValue === "Published A", `rowA=${rowA.draftValue}`);
  assert(rowB.draftValue === "Draft B kept", `rowB=${rowB.draftValue}`);
  return { name: "undo_preserve_unrelated", tenant: tenant.label, ok: true };
}

async function testEarlierPublished(pool) {
  const tenant = await seedTenant(pool, "earlier");
  const key = "home.hero.title";
  await contentService.saveWebsiteDraft(pool, {
    organizationId: tenant.organizationId,
    instanceId: tenant.instance.id,
    contentKey: key,
    value: "Version One",
    grantedPermissions: GRANTS,
  });
  assert(
    (await publicationService.publishWebsiteDraft(pool, {
      organizationId: tenant.organizationId,
      instanceId: tenant.instance.id,
      grantedPermissions: GRANTS,
    })).ok === true
  );
  await contentService.saveWebsiteDraft(pool, {
    organizationId: tenant.organizationId,
    instanceId: tenant.instance.id,
    contentKey: key,
    value: "Version Two",
    grantedPermissions: GRANTS,
  });
  assert(
    (await publicationService.publishWebsiteDraft(pool, {
      organizationId: tenant.organizationId,
      instanceId: tenant.instance.id,
      grantedPermissions: GRANTS,
    })).ok === true
  );
  await contentService.saveWebsiteDraft(pool, {
    organizationId: tenant.organizationId,
    instanceId: tenant.instance.id,
    contentKey: key,
    value: "Current Draft",
    grantedPermissions: GRANTS,
  });

  const panelRes = await changeManager.getFieldHistoryRestorePanel(pool, {
    organizationId: tenant.organizationId,
    instanceId: tenant.instance.id,
    contentKey: key,
    grantedPermissions: GRANTS,
  });
  assert(panelRes.ok === true, JSON.stringify(panelRes).slice(0, 200));
  const choices = (panelRes.panel && panelRes.panel.choices) || [];
  const earlier = choices.find((c) => c.choice === "earlier_published");
  assert(earlier && earlier.restorable, "earlier published choice missing");
  const previously = choices.find((c) => c.choice === "previously_saved");
  assert(previously && previously.available === false, "previously_saved must be unavailable");
  const versionId = earlier.versionId || String(earlier.id || "").split(":")[1];
  assert(versionId, "earlier published versionId missing");

  const denied = await changeManager.restoreFieldRevisionToDraft(pool, {
    organizationId: tenant.organizationId,
    instanceId: tenant.instance.id,
    contentKey: key,
    choice: "earlier_published",
    versionId,
    grantedPermissions: [PERMISSIONS.VIEW],
  });
  assert(denied.ok === false, "restore without edit must fail");

  const restored = await changeManager.restoreFieldRevisionToDraft(pool, {
    organizationId: tenant.organizationId,
    instanceId: tenant.instance.id,
    contentKey: key,
    choice: "earlier_published",
    versionId,
    grantedPermissions: GRANTS,
  });
  assert(restored.ok === true, JSON.stringify(restored).slice(0, 240));
  assert(restored.published === false, "must not auto-publish");
  const row = await contentService.getWebsiteContentRow(
    pool,
    tenant.instance.id,
    tenant.organizationId,
    key
  );
  assert(row.draftValue === "Version One", `draft=${row.draftValue}`);
  assert(row.publishedValue === "Version Two", `published=${row.publishedValue}`);
  return { name: "earlier_published_no_autopublish", tenant: tenant.label, ok: true };
}

async function testImageCurrentlyPublished(pool) {
  const tenant = await seedTenant(pool, "image");
  const key = "home.hero.image";
  const img1 = { src: null, alt: "Published hero one" };
  const img2 = { src: null, alt: "Draft hero two" };
  await contentService.saveWebsiteDraft(pool, {
    organizationId: tenant.organizationId,
    instanceId: tenant.instance.id,
    contentKey: key,
    value: img1,
    grantedPermissions: GRANTS,
  });
  assert(
    (
      await publicationService.publishWebsiteDraft(pool, {
        organizationId: tenant.organizationId,
        instanceId: tenant.instance.id,
        grantedPermissions: GRANTS,
      })
    ).ok === true
  );
  await contentService.saveWebsiteDraft(pool, {
    organizationId: tenant.organizationId,
    instanceId: tenant.instance.id,
    contentKey: key,
    value: img2,
    grantedPermissions: GRANTS,
  });
  const panelRes = await changeManager.getFieldHistoryRestorePanel(pool, {
    organizationId: tenant.organizationId,
    instanceId: tenant.instance.id,
    contentKey: key,
    grantedPermissions: GRANTS,
  });
  assert(panelRes.ok === true, JSON.stringify(panelRes).slice(0, 200));
  assert(panelRes.panel && panelRes.panel.contentType === "image", "expected image content type");
  const currently = (panelRes.panel.choices || []).find(
    (c) => c.choice === "currently_published"
  );
  assert(currently && currently.restorable, "currently published image restore missing");
  const restored = await changeManager.restoreFieldRevisionToDraft(pool, {
    organizationId: tenant.organizationId,
    instanceId: tenant.instance.id,
    contentKey: key,
    choice: "currently_published",
    grantedPermissions: GRANTS,
  });
  assert(restored.ok === true, JSON.stringify(restored).slice(0, 240));
  assert(restored.published === false, "image restore must not publish");
  const row = await contentService.getWebsiteContentRow(
    pool,
    tenant.instance.id,
    tenant.organizationId,
    key
  );
  assert(
    row.draftValue && row.draftValue.alt === "Published hero one",
    `image draft alt unexpected: ${JSON.stringify(row.draftValue).slice(0, 120)}`
  );
  return { name: "image_currently_published_restore", tenant: tenant.label, ok: true };
}

async function testTenantIsolation(pool) {
  const a = await seedTenant(pool, "iso_a");
  const b = await seedTenant(pool, "iso_b");
  const key = "home.hero.title";
  await contentService.saveWebsiteDraft(pool, {
    organizationId: a.organizationId,
    instanceId: a.instance.id,
    contentKey: key,
    value: "Tenant A Live",
    grantedPermissions: GRANTS,
  });
  assert(
    (await publicationService.publishWebsiteDraft(pool, {
      organizationId: a.organizationId,
      instanceId: a.instance.id,
      grantedPermissions: GRANTS,
    })).ok === true
  );
  await contentService.saveWebsiteDraft(pool, {
    organizationId: a.organizationId,
    instanceId: a.instance.id,
    contentKey: key,
    value: "Tenant A Draft",
    grantedPermissions: GRANTS,
  });

  const cross = await changeManager.restoreFieldRevisionToDraft(pool, {
    organizationId: b.organizationId,
    instanceId: a.instance.id,
    contentKey: key,
    choice: "undo_current_edit",
    grantedPermissions: GRANTS,
  });
  assert(cross.ok === false, "cross-tenant restore must fail");

  const ok = await changeManager.restoreFieldRevisionToDraft(pool, {
    organizationId: a.organizationId,
    instanceId: a.instance.id,
    contentKey: key,
    choice: "currently_published",
    grantedPermissions: GRANTS,
  });
  assert(ok.ok === true, JSON.stringify(ok).slice(0, 200));
  assert(ok.published === false, "must not auto-publish");
  return { name: "tenant_isolation", tenants: [a.label, b.label], ok: true };
}

async function testStaleConflict(pool) {
  const tenant = await seedTenant(pool, "conflict");
  const key = "home.hero.title";
  await contentService.saveWebsiteDraft(pool, {
    organizationId: tenant.organizationId,
    instanceId: tenant.instance.id,
    contentKey: key,
    value: "Live",
    grantedPermissions: GRANTS,
  });
  assert(
    (await publicationService.publishWebsiteDraft(pool, {
      organizationId: tenant.organizationId,
      instanceId: tenant.instance.id,
      grantedPermissions: GRANTS,
    })).ok === true
  );
  const first = await contentService.saveWebsiteDraft(pool, {
    organizationId: tenant.organizationId,
    instanceId: tenant.instance.id,
    contentKey: key,
    value: "Draft 1",
    grantedPermissions: GRANTS,
  });
  assert(first.ok === true);
  const stale =
    (first.content && first.content.updatedAt) ||
    (first.row && first.row.updatedAt) ||
    first.updatedAt;
  assert(stale, "missing updatedAt from first save");
  await contentService.saveWebsiteDraft(pool, {
    organizationId: tenant.organizationId,
    instanceId: tenant.instance.id,
    contentKey: key,
    value: "Draft 2 newer",
    grantedPermissions: GRANTS,
  });
  const conflict = await changeManager.restoreFieldRevisionToDraft(pool, {
    organizationId: tenant.organizationId,
    instanceId: tenant.instance.id,
    contentKey: key,
    choice: "undo_current_edit",
    expectedUpdatedAt: stale,
    grantedPermissions: GRANTS,
  });
  assert(conflict.ok === false, "stale expectedUpdatedAt must conflict");
  assert(
    /conflict|stale|expected|VERSION/i.test(String(conflict.code || conflict.message || "")),
    `unexpected conflict code ${conflict.code}`
  );
  return { name: "stale_conflict", tenant: tenant.label, ok: true, code: conflict.code || null };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("BLOCKED: DATABASE_URL missing");
    process.exit(2);
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 4,
  });
  const results = [];
  try {
    const identity = await assertTestingIdentity(pool);
    console.log(
      JSON.stringify({
        ok: true,
        step: "identity",
        identity_key: identity.identity_key,
        environment_code: identity.environment_code,
      })
    );
    results.push(await testUndoAndPreserve(pool));
    results.push(await testEarlierPublished(pool));
    results.push(await testImageCurrentlyPublished(pool));
    results.push(await testTenantIsolation(pool));
    results.push(await testStaleConflict(pool));
    console.log(JSON.stringify({ ok: true, results }, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err).slice(0, 400) }));
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}

main();
