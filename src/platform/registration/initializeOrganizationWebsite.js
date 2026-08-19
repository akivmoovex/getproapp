"use strict";

/**
 * Shared registration lifecycle owns website draft initialization.
 * Product adapters supply template / content defaults only.
 * Creation is idempotent: an existing org+product instance is reused.
 */

const instanceRepo = require("../website/instanceRepository");
const { provisionWebsiteInstance, starterEntries } = require("../website/provisionService");
const contentService = require("../website/contentService");
const { getWebsiteTemplate } = require("../website/templateRegistry");
const { ACTION, recordLifecycleAudit } = require("./lifecycleAudit");

async function maybeSeedTemplateContent(adapter, db, input) {
  if (!adapter || typeof adapter.seedTemplateContent !== "function") {
    return { ok: true, skipped: true, reason: "adapter_seed_not_defined" };
  }
  return adapter.seedTemplateContent(db, input);
}

async function seedMissingWebsiteContent(db, adapter, input, instance) {
  if (!instance || !instance.id) {
    return { ok: true, skipped: true, reason: "no_instance" };
  }
  const counted = await db.query(
    `SELECT COUNT(*)::int AS n FROM platform.website_content WHERE instance_id = $1`,
    [instance.id]
  );
  const existingCount = counted.rows[0] && counted.rows[0].n != null ? Number(counted.rows[0].n) : 0;
  if (existingCount > 0) {
    return { ok: true, skipped: true, reason: "content_present", seeded: 0 };
  }
  let defaults = {};
  if (adapter && typeof adapter.websiteDefaults === "function") {
    defaults =
      (await adapter.websiteDefaults({
        organizationId: input.organizationId,
        application: input.application,
        provision: input.provision,
        env: input.env,
      })) || {};
  }
  const templateId = instance.templateId || defaults.templateId;
  const templateVersion = instance.templateVersion || defaults.templateVersion || 1;
  const template = getWebsiteTemplate(templateId, templateVersion);
  if (!template) {
    return { ok: false, skipped: false, reason: "template_not_found", seeded: 0 };
  }
  const publishStarter =
    defaults.seedDefaults !== false &&
    (String(instance.status || "") === "published" || String(defaults.status || "") === "published");
  const seeded = await contentService.seedWebsiteContent(
    db,
    instance,
    starterEntries(template, defaults.contentOverrides, publishStarter),
    null
  );
  return { ok: Boolean(seeded && seeded.ok), skipped: false, ...seeded };
}

async function initializeOrganizationWebsite(db, input) {
  const adapter = input && input.adapter;
  const organizationId = input && input.organizationId;
  const productCode = String(
    (input && input.productCode) || (adapter && adapter.productCode) || ""
  ).trim();
  if (!organizationId || !productCode) {
    return { ok: false, skipped: true, reason: "missing_organization_or_product" };
  }

  const existing = await instanceRepo.findWebsiteInstanceByOrgProduct(db, {
    organizationId,
    productCode,
  });
  if (existing) {
    const contentRepair = await seedMissingWebsiteContent(db, adapter, input, existing);
    const templateCopy = await maybeSeedTemplateContent(adapter, db, {
      ...input,
      instance: existing,
      created: false,
    });
    return {
      ok: contentRepair.ok !== false,
      created: false,
      existed: true,
      instance: existing,
      source: "existing",
      templateCopy,
      contentRepair,
    };
  }

  if (!adapter || typeof adapter.websiteDefaults !== "function") {
    if (adapter && typeof adapter.ensureWebsite === "function") {
      const legacy = await adapter.ensureWebsite(db, input);
      return {
        ok: Boolean(legacy && legacy.ok !== false),
        created: false,
        existed: Boolean(legacy && (legacy.existed || legacy.instance)),
        instance: legacy && legacy.instance,
        source: "legacy_ensureWebsite",
        skipped: Boolean(legacy && legacy.skipped),
      };
    }
    return { ok: false, skipped: true, reason: "adapter_defaults_missing" };
  }

  const defaults = await adapter.websiteDefaults({
    organizationId,
    application: input.application,
    provision: input.provision,
    env: input.env,
  });
  if (!defaults || defaults.skip) {
    return {
      ok: true,
      skipped: true,
      reason: (defaults && defaults.reason) || "adapter_skip",
      source: "adapter_skip",
    };
  }

  const provisioned = await provisionWebsiteInstance(db, {
    organizationId,
    ...defaults,
  });
  const templateCopy = await maybeSeedTemplateContent(adapter, db, {
    ...input,
    instance: provisioned && provisioned.instance,
    created: Boolean(provisioned && provisioned.created),
  });
  if (provisioned && provisioned.ok && provisioned.created && provisioned.instance) {
    await recordLifecycleAudit(db, {
      deploymentCode: input.deploymentCode,
      organizationId: input.organizationId,
      actionKey: ACTION.WEBSITE_INITIALIZED,
      entityType: "website_instance",
      entityId: provisioned.instance.id,
      applicationId: input.application && input.application.id,
      instanceId: provisioned.instance.id,
      productCode,
      source: "registration_website_init",
      entityKey: provisioned.instance.slug,
    });
  }
  return {
    ok: Boolean(provisioned && provisioned.ok),
    created: Boolean(provisioned && provisioned.created),
    existed: Boolean(provisioned && provisioned.ok && !provisioned.created),
    instance: provisioned && provisioned.instance,
    source: "shared_registration_lifecycle",
    code: provisioned && provisioned.code,
    templateCopy,
  };
}

module.exports = {
  initializeOrganizationWebsite,
};
