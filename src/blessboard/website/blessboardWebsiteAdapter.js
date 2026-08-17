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
  return provisionWebsiteInstance(db, {
    organizationId,
    templateId: BLESSBOARD_TEMPLATE_ID,
    templateVersion: BLESSBOARD_TEMPLATE_VERSION,
    slug: slug || organizationId.slice(0, 8),
    status: input.status || "published",
    scopeKind: input.branchId ? "branch" : "church_wide",
    scopeRef: input.branchId || null,
    actorIdentityId: input.actorIdentityId || null,
    contentOverrides: input.contentOverrides || {},
    seedDefaults: false,
  });
}

async function findBlessBoardWebsiteInstance(db, organizationId) {
  registerBlessBoardWebsiteTemplate();
  return instanceRepo.findWebsiteInstanceByOrgProduct(db, {
    organizationId,
    productCode: "blessboard",
  });
}

module.exports = {
  ensureBlessBoardWebsiteInstance,
  findBlessBoardWebsiteInstance,
};
