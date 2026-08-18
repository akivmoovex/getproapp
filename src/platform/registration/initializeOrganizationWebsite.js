"use strict";

/**
 * Shared registration lifecycle owns website draft initialization.
 * Product adapters supply template / content defaults only.
 * Creation is idempotent: an existing org+product instance is reused.
 */

const instanceRepo = require("../website/instanceRepository");
const { provisionWebsiteInstance } = require("../website/provisionService");

async function maybeSeedTemplateContent(adapter, db, input) {
  if (!adapter || typeof adapter.seedTemplateContent !== "function") {
    return { ok: true, skipped: true, reason: "adapter_seed_not_defined" };
  }
  return adapter.seedTemplateContent(db, input);
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
    const templateCopy = await maybeSeedTemplateContent(adapter, db, {
      ...input,
      instance: existing,
      created: false,
    });
    return {
      ok: true,
      created: false,
      existed: true,
      instance: existing,
      source: "existing",
      templateCopy,
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
