"use strict";

const { provisionWebsiteInstance } = require("../../platform/website/provisionService");
const instanceRepo = require("../../platform/website/instanceRepository");
const {
  registerBlessBoardWebsiteTemplate,
  BLESSBOARD_TEMPLATE_ID,
  BLESSBOARD_TEMPLATE_VERSION,
} = require("./blessboardChurchTemplate");

async function ensureBlessBoardWebsiteInstance(db, input) {
  registerBlessBoardWebsiteTemplate();
  const organizationId = String((input && input.organizationId) || "");
  const slug = String((input && input.slug) || "").trim().toLowerCase();
  const provisioned = await provisionWebsiteInstance(db, {
    organizationId,
    templateId: BLESSBOARD_TEMPLATE_ID,
    templateVersion: BLESSBOARD_TEMPLATE_VERSION,
    slug: slug || organizationId.slice(0, 8),
    status: input.status || "coming_soon",
    scopeKind: input.branchId ? "branch" : "church_wide",
    scopeRef: input.branchId || null,
    actorIdentityId: input.actorIdentityId || null,
    contentOverrides: input.contentOverrides || {},
    seedDefaults: false,
    adapterMode: "shared_engine",
    publishPolicy: input.publishPolicy || "TENANT_PUBLISH",
    lifecycleStatus: input.lifecycleStatus || "provisional",
  });
  if (
    provisioned.ok &&
    provisioned.instance &&
    provisioned.instance.adapterMode === "legacy_cms"
  ) {
    const rows = await db.query(
      `UPDATE platform.website_instances
          SET adapter_mode = 'shared_engine', updated_at = now()
        WHERE id = $1 AND organization_id = $2
        RETURNING *`,
      [provisioned.instance.id, organizationId]
    );
    if (rows.rows[0]) {
      provisioned.instance = instanceRepo.mapInstance(rows.rows[0]);
    }
  }
  return provisioned;
}

async function findBlessBoardWebsiteInstance(db, organizationId, branchId) {
  registerBlessBoardWebsiteTemplate();
  return instanceRepo.findWebsiteInstanceByOrgProduct(db, {
    organizationId,
    productCode: "blessboard",
    scopeRef: branchId || null,
  });
}

module.exports = {
  ensureBlessBoardWebsiteInstance,
  findBlessBoardWebsiteInstance,
};
