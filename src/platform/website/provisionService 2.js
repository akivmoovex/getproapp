"use strict";

const instanceRepo = require("./instanceRepository");
const contentService = require("./contentService");
const { getWebsiteTemplate, listTemplateKeys } = require("./templateRegistry");
const { recordWebsiteAudit } = require("./auditService");
const { recordModerationEvent, ACTION } = require("./moderationEventService");
const { withProvisioningTransaction } = require("../db/provisioningTransaction");
const { productWebsiteDefaults } = require("./productWebsiteDefaults");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  TEMPLATE_NOT_FOUND: "template_not_found",
  SLUG_COLLISION: "slug_collision",
});

function starterEntries(template, overrides, publishStarter) {
  const extras = overrides && typeof overrides === "object" ? overrides : {};
  return listTemplateKeys(template).map((key) => ({
    contentKey: key,
    value: Object.prototype.hasOwnProperty.call(extras, key)
      ? extras[key]
      : template.defaults
        ? template.defaults[key]
        : null,
    publish: publishStarter === true,
  }));
}

async function provisionWebsiteInstance(db, input) {
  const run = async (client) => {
    const templateId = String((input && input.templateId) || "").trim();
    const templateVersion = Number(input.templateVersion) || 1;
    const template = getWebsiteTemplate(templateId, templateVersion);
    if (!template) return { ok: false, code: RESULT.TEMPLATE_NOT_FOUND, instance: null };

    const defaults = productWebsiteDefaults(template.productCode);
    const created = await instanceRepo.createWebsiteInstance(client, {
      organizationId: input.organizationId,
      productCode: template.productCode,
      templateId: template.templateId,
      templateVersion: template.version,
      slug: input.slug,
      status: input.status || "coming_soon",
      scopeKind: input.scopeKind || "tenant",
      scopeRef: input.scopeRef || null,
      lifecycleStatus: input.lifecycleStatus || defaults.lifecycleStatus,
      publishPolicy: input.publishPolicy || defaults.publishPolicy,
      adapterMode: input.adapterMode || defaults.adapterMode,
    });
    if (!created.ok) return created;

    if (created.created && input.seedDefaults !== false) {
      const publishStarter =
        input.publishStarter === true || String(input.status || "") === "published";
      await contentService.seedWebsiteContent(
        client,
        created.instance,
        starterEntries(template, input.contentOverrides, publishStarter),
        input.actorIdentityId || null
      );
      await recordWebsiteAudit(client, {
        organizationId: created.instance.organizationId,
        instanceId: created.instance.id,
        actorIdentityId: input.actorIdentityId || null,
        actionKey: "website.provision",
        metadata: { entity_key: created.instance.slug },
      });
      await recordModerationEvent(client, {
        organizationId: created.instance.organizationId,
        instanceId: created.instance.id,
        productCode: created.instance.productCode,
        actorIdentityId: input.actorIdentityId || null,
        actionKey: ACTION.PROVISION,
        newState: created.instance.lifecycleStatus,
        notesTenantVisible: false,
        metadata: {
          policy: created.instance.publishPolicy,
          adapter: created.instance.adapterMode,
        },
      });
    }

    return {
      ok: true,
      code: created.created ? RESULT.OK : instanceRepo.RESULT.DUPLICATE,
      instance: created.instance,
      created: Boolean(created.created),
    };
  };
  if (db && typeof db.connect === "function" && typeof db.release !== "function") {
    return withProvisioningTransaction(db, run);
  }
  return run(db);
}

module.exports = {
  RESULT,
  provisionWebsiteInstance,
  starterEntries,
};
