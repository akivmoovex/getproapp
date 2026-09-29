"use strict";

const instanceRepo = require("./instanceRepository");
const contentService = require("./contentService");
const { getWebsiteTemplate, listTemplateKeys } = require("./templateRegistry");
const { recordWebsiteAudit } = require("./auditService");

async function upgradeWebsiteTemplate(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const instance = await instanceRepo.findWebsiteInstanceById(db, input.instanceId, organizationId);
  if (!instance) return { ok: false, code: "website_instance_not_found" };
  const nextVersion = Number(input.toVersion);
  const next = getWebsiteTemplate(instance.templateId, nextVersion);
  if (!next) return { ok: false, code: "template_not_found" };
  if (nextVersion <= instance.templateVersion) {
    return { ok: true, instance, upgraded: false };
  }
  const prev = getWebsiteTemplate(instance.templateId, instance.templateVersion);
  const existing = await contentService.listWebsiteContent(db, instance, organizationId);
  const have = new Set(existing.map((r) => r.contentKey));
  const entries = [];
  for (const key of listTemplateKeys(next)) {
    if (have.has(key)) continue;
    entries.push({
      contentKey: key,
      value: next.defaults && Object.prototype.hasOwnProperty.call(next.defaults, key) ? next.defaults[key] : null,
      publish: true,
    });
  }
  await instanceRepo.updateWebsiteInstance(db, {
    instanceId: instance.id,
    organizationId,
    templateVersion: nextVersion,
  });
  const updated = await instanceRepo.findWebsiteInstanceById(db, instance.id, organizationId);
  if (entries.length) {
    await contentService.seedWebsiteContent(db, updated, entries, input.actorIdentityId || null);
  }
  await recordWebsiteAudit(db, {
    organizationId,
    instanceId: instance.id,
    actorIdentityId: input.actorIdentityId || null,
    actionKey: "website.template.upgrade",
    metadata: {
      from: instance.templateVersion,
      to: nextVersion,
      added: entries.map((e) => e.contentKey),
      preserved: prev ? listTemplateKeys(prev) : [],
    },
  });
  return { ok: true, instance: updated, upgraded: true, addedKeys: entries.map((e) => e.contentKey) };
}

module.exports = {
  upgradeWebsiteTemplate,
};
