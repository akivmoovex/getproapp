"use strict";

/**
 * Product-scoped organization enablement (platform.organization_products).
 * ActiveClinic must use explicit active enrolment — no BlessBoard fallback.
 */

const {
  isValidApplicationCode,
  resolveProductOrError,
} = require("../config/productRegistry");
const repo = require("../repositories/organizationProductRepository");
const { provisionPlatformTenant } = require("./provisionPlatformTenant");

const DENIAL = Object.freeze({
  /** Safe denial — do not distinguish missing org vs wrong/inactive product to callers. */
  NOT_FOUND: "organization_product_not_found",
  INVALID_PRODUCT: "invalid_product_code",
  INVALID_INPUT: "invalid_input",
});

const RESULT = Object.freeze({
  OK: "ok",
  ...DENIAL,
});

/**
 * @param {object|null} row
 */
function mapEnrolment(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    productId: row.product_id,
    status: row.status,
    productTenantKey: row.product_tenant_key,
    activatedAt: row.activated_at || null,
    deactivatedAt: row.deactivated_at || null,
    productKey: row.product_key,
    productDisplayName: row.product_display_name,
    productStatus: row.product_status,
    organizationKey: row.organization_key,
    organizationDisplayName: row.organization_display_name,
    organizationStatus: row.organization_status,
    dataEnvironment: row.data_environment,
  };
}

function normalizeProductKey(applicationCode) {
  return String(applicationCode || "")
    .trim()
    .toLowerCase();
}

/**
 * @param {{ query: Function }} db
 * @param {{ organizationId: string, applicationCode: string }} input
 */
async function getOrganizationProduct(db, input) {
  const productKey = normalizeProductKey(input.applicationCode);
  if (!input.organizationId || !productKey) {
    return { ok: false, code: RESULT.INVALID_INPUT, organizationProduct: null };
  }
  if (!isValidApplicationCode(productKey)) {
    return { ok: false, code: RESULT.INVALID_PRODUCT, organizationProduct: null };
  }
  const row = await repo.findOrganizationProductByOrgAndProductKey(db, {
    organizationId: input.organizationId,
    productKey,
  });
  return {
    ok: true,
    code: RESULT.OK,
    organizationProduct: mapEnrolment(row),
  };
}

/**
 * @param {{ query: Function }} db
 * @param {{
 *   organizationId?: string,
 *   organizationKey?: string,
 *   applicationCode: string,
 *   allowedStatuses?: string[],
 *   dataEnvironment?: string|null,
 * }} input
 */
async function requireOrganizationProduct(db, input) {
  const productKey = normalizeProductKey(input.applicationCode);
  const allowed = Array.isArray(input.allowedStatuses) && input.allowedStatuses.length
    ? input.allowedStatuses.map((s) => String(s))
    : [repo.ACTIVE_STATUS];

  if (!productKey) {
    return { ok: false, code: RESULT.INVALID_INPUT, organizationProduct: null };
  }
  if (!isValidApplicationCode(productKey)) {
    return { ok: false, code: RESULT.INVALID_PRODUCT, organizationProduct: null };
  }

  let row = null;
  if (input.organizationId) {
    row = await repo.findOrganizationProductByOrgAndProductKey(db, {
      organizationId: input.organizationId,
      productKey,
    });
  } else if (input.organizationKey) {
    row = await repo.findOrganizationProductByOrgKeyAndProductKey(db, {
      organizationKey: String(input.organizationKey).trim().toLowerCase(),
      productKey,
    });
  } else {
    return { ok: false, code: RESULT.INVALID_INPUT, organizationProduct: null };
  }

  if (!row) {
    return { ok: false, code: RESULT.NOT_FOUND, organizationProduct: null };
  }
  if (row.organization_status !== "active") {
    return { ok: false, code: RESULT.NOT_FOUND, organizationProduct: null };
  }
  if (row.product_status !== "active") {
    return { ok: false, code: RESULT.NOT_FOUND, organizationProduct: null };
  }
  if (!allowed.includes(String(row.status))) {
    return { ok: false, code: RESULT.NOT_FOUND, organizationProduct: null };
  }
  if (
    input.dataEnvironment &&
    String(row.data_environment) !== String(input.dataEnvironment)
  ) {
    return { ok: false, code: RESULT.NOT_FOUND, organizationProduct: null };
  }

  return {
    ok: true,
    code: RESULT.OK,
    organizationProduct: mapEnrolment(row),
  };
}

/**
 * @param {{ query: Function }} db
 * @param {{ organizationId: string, applicationCode: string }} input
 */
async function organizationHasActiveProduct(db, input) {
  const required = await requireOrganizationProduct(db, {
    organizationId: input.organizationId,
    applicationCode: input.applicationCode,
    allowedStatuses: [repo.ACTIVE_STATUS],
  });
  return required.ok;
}

/**
 * @param {{ query: Function }} db
 * @param {{ applicationCode: string, status?: string, environment?: string|null }} input
 */
async function listOrganizationsByProduct(db, input) {
  const productKey = normalizeProductKey(input.applicationCode);
  if (!isValidApplicationCode(productKey)) {
    return { ok: false, code: RESULT.INVALID_PRODUCT, organizations: [] };
  }
  const productResolved = resolveProductOrError(productKey);
  if (!productResolved.ok) {
    return { ok: false, code: RESULT.INVALID_PRODUCT, organizations: [] };
  }
  const rows = await repo.listOrganizationsByProductKey(db, {
    productKey,
    enrolmentStatus: input.status || repo.ACTIVE_STATUS,
    dataEnvironment: input.environment || null,
  });
  return {
    ok: true,
    code: RESULT.OK,
    organizations: rows.map((row) => ({
      organizationId: row.organization_id,
      organizationKey: row.organization_key,
      displayName: row.organization_display_name,
      organizationStatus: row.organization_status,
      dataEnvironment: row.data_environment,
      enrolmentId: row.organization_product_id,
      enrolmentStatus: row.enrolment_status,
      productTenantKey: row.product_tenant_key,
      productKey: row.product_key,
      productId: row.product_id,
    })),
  };
}

/**
 * @param {{ query: Function }} db
 * @param {{ organizationId: string }} input
 */
async function listProductsForOrganization(db, input) {
  if (!input.organizationId) {
    return { ok: false, code: RESULT.INVALID_INPUT, products: [] };
  }
  const rows = await repo.listOrganizationProductsForOrganization(db, input.organizationId);
  return {
    ok: true,
    code: RESULT.OK,
    products: rows.map((row) => ({
      enrolmentId: row.id,
      productId: row.product_id,
      productKey: row.product_key,
      productDisplayName: row.product_display_name,
      productStatus: row.product_status,
      enrolmentStatus: row.status,
      productTenantKey: row.product_tenant_key,
      activatedAt: row.activated_at || null,
      deactivatedAt: row.deactivated_at || null,
    })),
  };
}

/**
 * Resolve organization + active product enrolment by organization key.
 * Safe denial when org missing, product not enabled, inactive, or environment mismatch.
 *
 * @param {{ query: Function }} db
 * @param {{
 *   organizationKey: string,
 *   applicationCode: string,
 *   environment?: string|null,
 * }} input
 */
async function resolveOrganizationForProduct(db, input) {
  const productKey = normalizeProductKey(input.applicationCode);
  const organizationKey = String(input.organizationKey || "")
    .trim()
    .toLowerCase();
  if (!organizationKey || !productKey) {
    return {
      ok: false,
      code: RESULT.INVALID_INPUT,
      organization: null,
      organizationProduct: null,
      product: null,
    };
  }

  const required = await requireOrganizationProduct(db, {
    organizationKey,
    applicationCode: productKey,
    allowedStatuses: [repo.ACTIVE_STATUS],
    dataEnvironment: input.environment || null,
  });
  if (!required.ok) {
    return {
      ok: false,
      code: required.code === RESULT.INVALID_PRODUCT ? required.code : RESULT.NOT_FOUND,
      organization: null,
      organizationProduct: null,
      product: null,
    };
  }

  const enrolment = required.organizationProduct;
  return {
    ok: true,
    code: RESULT.OK,
    organization: {
      id: enrolment.organizationId,
      key: enrolment.organizationKey,
      displayName: enrolment.organizationDisplayName,
      status: enrolment.organizationStatus,
      dataEnvironment: enrolment.dataEnvironment,
    },
    organizationProduct: enrolment,
    product: {
      id: enrolment.productId,
      key: enrolment.productKey,
      displayName: enrolment.productDisplayName,
      status: enrolment.productStatus,
    },
  };
}

/**
 * Governed enablement via existing provisionPlatformTenant (org + enrolment + optional domain).
 * Prefer this over ad-hoc INSERT for ActiveClinic.
 *
 * @param {{ connect?: Function, query?: Function }} db
 * @param {object} input — same shape as provisionPlatformTenant input
 */
async function enableOrganizationProduct(db, input) {
  const productKey = normalizeProductKey(input && input.productKey);
  if (!isValidApplicationCode(productKey)) {
    return {
      ok: false,
      status: "invalid_product",
      message: RESULT.INVALID_PRODUCT,
    };
  }
  return provisionPlatformTenant(db, {
    ...input,
    productKey,
  });
}

/**
 * Suspend an existing enrolment (status → inactive). Safe denial if missing/wrong product.
 * @param {{ query: Function }} db
 * @param {{ organizationId: string, applicationCode: string }} input
 */
async function suspendOrganizationProduct(db, input) {
  const current = await requireOrganizationProduct(db, {
    organizationId: input.organizationId,
    applicationCode: input.applicationCode,
    allowedStatuses: [repo.ACTIVE_STATUS],
  });
  if (!current.ok) {
    return { ok: false, code: RESULT.NOT_FOUND, organizationProduct: null };
  }
  await repo.updateOrganizationProductStatus(db, {
    organizationProductId: current.organizationProduct.id,
    status: "inactive",
  });
  const got = await getOrganizationProduct(db, input);
  return {
    ok: true,
    code: RESULT.OK,
    organizationProduct: got.organizationProduct,
  };
}

/**
 * Restore inactive enrolment to active.
 * @param {{ query: Function }} db
 * @param {{ organizationId: string, applicationCode: string }} input
 */
async function restoreOrganizationProduct(db, input) {
  const got = await getOrganizationProduct(db, input);
  if (!got.ok || !got.organizationProduct) {
    return { ok: false, code: RESULT.NOT_FOUND, organizationProduct: null };
  }
  if (got.organizationProduct.status === repo.ACTIVE_STATUS) {
    return { ok: true, code: RESULT.OK, organizationProduct: got.organizationProduct };
  }
  if (got.organizationProduct.status === "retired") {
    return { ok: false, code: RESULT.NOT_FOUND, organizationProduct: null };
  }
  const updated = await repo.updateOrganizationProductStatus(db, {
    organizationProductId: got.organizationProduct.id,
    status: repo.ACTIVE_STATUS,
  });
  return {
    ok: true,
    code: RESULT.OK,
    organizationProduct: {
      ...got.organizationProduct,
      status: updated.status,
      activatedAt: updated.activated_at,
      deactivatedAt: updated.deactivated_at,
    },
  };
}

module.exports = {
  DENIAL,
  RESULT,
  getOrganizationProduct,
  requireOrganizationProduct,
  organizationHasActiveProduct,
  listOrganizationsByProduct,
  listProductsForOrganization,
  resolveOrganizationForProduct,
  enableOrganizationProduct,
  suspendOrganizationProduct,
  restoreOrganizationProduct,
};
