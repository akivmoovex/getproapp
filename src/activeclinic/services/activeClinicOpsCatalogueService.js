"use strict";

/**
 * ActiveClinic Batch 1A ops services catalogue (ACN02/ACN03).
 * Extends appointment_service_types with price, location, practitioners.
 * Reuses website catalogue create/update where possible; does not replace billing charge catalogue.
 */

const { rejectForgedTenantIdentifiers } = require("../../platform/rbac/sharedTenantScope");
const { parseListQuery, buildListPageResult } = require("../../platform/http/listQuery");
const { formatMoneyMinor } = require("../../platform/money/formatMoney");
const { validateRequired, validateText } = require("../../platform/validation");
const appointmentRepo = require("../repositories/appointmentRepository");
const configRepo = require("../repositories/servicePractitionerConfigRepository");
const {
  createCatalogueService,
  updateCatalogueService,
  getCatalogueService,
  listCatalogueServices,
  RESULT: CATALOGUE_RESULT,
} = require("../website/clinicWebsiteCatalogueService");
const { listFacilitiesByOrganization } = require("./facilityService");
const { listStaffMembersByOrganization } = require("./activeClinicStaffService");

const RESULT = Object.freeze({
  ...CATALOGUE_RESULT,
  FORGED_TENANT: "forged_tenant",
  UNAUTHENTICATED: "unauthenticated",
});

const PERM = Object.freeze({
  VIEW: "website.view",
  EDIT: "website.edit",
  // Also allow staff who manage billing catalog to view pricing ops
  BILLING_CATALOG: "activeclinic.billing.catalog.manage",
});

function hasAny(permissions, keys) {
  const set = new Set(Array.isArray(permissions) ? permissions : []);
  return keys.some((k) => set.has(k));
}

function assertTrusted(input) {
  const orgId =
    input && input.organizationId ? String(input.organizationId).trim() : "";
  if (!orgId) {
    return { ok: false, code: RESULT.UNAUTHENTICATED, httpStatus: 401 };
  }
  const forged = rejectForgedTenantIdentifiers({
    body: input.body,
    query: input.query,
    trusted: {
      organizationId: orgId,
      facilityId: input.facilityId || null,
    },
    allowMatchingTrusted: true,
  });
  if (!forged.ok) {
    return { ok: false, code: RESULT.FORGED_TENANT, httpStatus: 403, forged };
  }
  return { ok: true, organizationId: orgId };
}

function mapServiceRow(row, assignments) {
  if (!row) return null;
  const amountMinor =
    row.amount_minor == null || row.amount_minor === ""
      ? null
      : Number(row.amount_minor);
  const followUpAmountMinor =
    row.follow_up_amount_minor == null || row.follow_up_amount_minor === ""
      ? null
      : Number(row.follow_up_amount_minor);
  const price = formatMoneyMinor(amountMinor, row.currency_code);
  return {
    id: row.id,
    serviceKey: row.service_key,
    name: row.display_name,
    description: row.description || "",
    defaultDurationMinutes: Number(row.default_duration_minutes) || 30,
    bufferMinutes:
      row.buffer_minutes == null || row.buffer_minutes === ""
        ? null
        : Number(row.buffer_minutes),
    status: row.status,
    active: row.status === "active",
    publicBookable: row.public_bookable === true,
    publicWebsiteVisible: row.public_website_visible === true,
    facilityId: row.facility_id || null,
    amountMinor: Number.isFinite(amountMinor) ? amountMinor : null,
    currencyCode: row.currency_code || "ZMW",
    followUpAmountMinor: Number.isFinite(followUpAmountMinor)
      ? followUpAmountMinor
      : null,
    priceDisplay: price ? price.display : "—",
    practitioners: (assignments || []).map((a) => ({
      id: a.staff_member_id,
      displayName: a.display_name,
      jobTitle: a.job_title || null,
    })),
  };
}

function parsePriceMajorToMinor(raw) {
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number(String(raw).replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n < 0) return { ok: false };
  return { ok: true, amountMinor: Math.round(n * 100) };
}

function parseStaffIds(body) {
  if (!body) return [];
  const raw = body.staffMemberIds || body.practitionerIds || body.staff_ids;
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string" && raw.trim()) {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

async function listOpsServices(db, input) {
  const scope = assertTrusted(input);
  if (!scope.ok) return scope;
  if (
    !hasAny(input.permissions, [PERM.VIEW, PERM.EDIT, PERM.BILLING_CATALOG])
  ) {
    return { ok: false, code: "forbidden", httpStatus: 403 };
  }

  const listQuery = parseListQuery(input.query || {}, {
    filterKeys: ["status", "facility", "bookable"],
    searchKeys: ["q", "search"],
    defaultLimit: 50,
  });

  const rows = await appointmentRepo.listServiceTypesByOrg(db, {
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
    includeInactive: true,
  });

  let services = [];
  for (const row of rows) {
    const assignments = await configRepo.listAssignmentsForService(db, {
      organizationId: input.organizationId,
      healthcareOrganizationId: input.healthcareOrganizationId,
      serviceTypeId: row.id,
    });
    services.push(mapServiceRow(row, assignments));
  }

  if (listQuery.q) {
    const q = listQuery.q.toLowerCase();
    services = services.filter(
      (s) =>
        String(s.name).toLowerCase().includes(q) ||
        String(s.serviceKey).toLowerCase().includes(q) ||
        String(s.description).toLowerCase().includes(q)
    );
  }
  if (listQuery.filters.status === "active") {
    services = services.filter((s) => s.active);
  } else if (listQuery.filters.status === "inactive") {
    services = services.filter((s) => !s.active);
  }
  if (listQuery.filters.facility) {
    services = services.filter(
      (s) => s.facilityId && s.facilityId === listQuery.filters.facility
    );
  }
  if (listQuery.filters.bookable === "1" || listQuery.filters.bookable === "true") {
    services = services.filter((s) => s.publicBookable);
  }

  const total = services.length;
  const pageMeta = buildListPageResult({
    page: listQuery.page,
    limit: listQuery.limit,
    total,
  });
  const pageRows = services.slice(pageMeta.offset, pageMeta.offset + pageMeta.limit);

  const facilities = await listFacilitiesByOrganization(db, {
    organizationId: input.organizationId,
    status: "active",
  });
  const staff = await listStaffMembersByOrganization(db, {
    organizationId: input.organizationId,
  });

  return {
    ok: true,
    services: pageRows,
    page: pageMeta,
    filters: {
      q: listQuery.q,
      status: listQuery.filters.status || "",
      facility: listQuery.filters.facility || "",
      bookable: listQuery.filters.bookable || "",
    },
    filterOptions: {
      facilities: (facilities.ok ? facilities.facilities : []).map((f) => ({
        value: f.id,
        label: f.displayName || f.name || f.facilityKey,
      })),
    },
    stats: {
      total: rows.length,
      active: rows.filter((r) => r.status === "active").length,
      bookable: rows.filter((r) => r.public_bookable === true && r.status === "active")
        .length,
      inactive: rows.filter((r) => r.status !== "active").length,
    },
    staffOptions: (staff.ok ? staff.staffMembers : [])
      .filter((s) => s.status === "active" || s.status === "invited")
      .map((s) => ({
        id: s.id,
        displayName: s.displayName,
        jobTitle: s.jobTitle || null,
      })),
    canEdit: hasAny(input.permissions, [PERM.EDIT]),
  };
}

async function getOpsService(db, input) {
  const scope = assertTrusted(input);
  if (!scope.ok) return scope;
  if (!hasAny(input.permissions, [PERM.VIEW, PERM.EDIT, PERM.BILLING_CATALOG])) {
    return { ok: false, code: "forbidden", httpStatus: 403 };
  }
  const row = await appointmentRepo.findServiceTypeByOrgAndId(db, {
    id: input.serviceId,
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
  });
  if (!row) return { ok: false, code: "not_found", httpStatus: 404 };
  const assignments = await configRepo.listAssignmentsForService(db, {
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
    serviceTypeId: row.id,
  });
  const facilities = await listFacilitiesByOrganization(db, {
    organizationId: input.organizationId,
    status: "active",
  });
  const staff = await listStaffMembersByOrganization(db, {
    organizationId: input.organizationId,
  });
  return {
    ok: true,
    service: mapServiceRow(row, assignments),
    assignedStaffIds: assignments.map((a) => a.staff_member_id),
    facilities: (facilities.ok ? facilities.facilities : []).map((f) => ({
      id: f.id,
      label: f.displayName || f.name || f.facilityKey,
    })),
    staffOptions: (staff.ok ? staff.staffMembers : [])
      .filter((s) => s.status === "active" || s.status === "invited")
      .map((s) => ({
        id: s.id,
        displayName: s.displayName,
        jobTitle: s.jobTitle || null,
      })),
    canEdit: hasAny(input.permissions, [PERM.EDIT]),
  };
}

async function saveOpsService(db, input) {
  const scope = assertTrusted(input);
  if (!scope.ok) return scope;
  if (!hasAny(input.permissions, [PERM.EDIT])) {
    return { ok: false, code: "forbidden", httpStatus: 403 };
  }

  const nameCheck = validateRequired(input.displayName || input.name);
  if (!nameCheck.ok) return { ok: false, code: RESULT.INVALID_INPUT, field: "displayName" };
  const descCheck = validateText(input.description || "", { maxLen: 500, allowEmpty: true });
  if (!descCheck.ok) return { ok: false, code: RESULT.INVALID_INPUT, field: "description" };

  const price = parsePriceMajorToMinor(input.priceMajor ?? input.amountMajor);
  if (price && price.ok === false) {
    return { ok: false, code: RESULT.INVALID_INPUT, field: "priceMajor" };
  }
  const followUp = parsePriceMajorToMinor(input.followUpPriceMajor);
  if (followUp && followUp.ok === false) {
    return { ok: false, code: RESULT.INVALID_INPUT, field: "followUpPriceMajor" };
  }
  if (
    price &&
    price.ok &&
    followUp &&
    followUp.ok &&
    followUp.amountMinor != null &&
    price.amountMinor != null &&
    followUp.amountMinor > price.amountMinor
  ) {
    return { ok: false, code: RESULT.INVALID_INPUT, field: "followUpPriceMajor" };
  }

  const catalogueInput = {
    ...input,
    displayName: String(input.displayName || input.name).trim(),
    description: input.description,
    defaultDurationMinutes: input.defaultDurationMinutes,
    status: input.status === "inactive" ? "inactive" : "active",
    publicBookable: input.publicBookable === true || input.publicBookable === "1",
    publicWebsiteVisible:
      input.publicWebsiteVisible === true || input.publicWebsiteVisible === "1",
    grantedPermissions: input.permissions,
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
  };

  let saved;
  if (input.serviceId) {
    saved = await updateCatalogueService(db, {
      ...catalogueInput,
      serviceId: input.serviceId,
    });
  } else {
    saved = await createCatalogueService(db, catalogueInput);
  }
  if (!saved.ok) return saved;

  const serviceId = saved.serviceId || (saved.service && saved.service.id) || input.serviceId;
  await appointmentRepo.updateServiceType(db, {
    id: serviceId,
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
    amountMinor: price && price.ok ? price.amountMinor : null,
    currencyCode: String(input.currencyCode || "ZMW").toUpperCase().slice(0, 3),
    followUpAmountMinor: followUp && followUp.ok ? followUp.amountMinor : null,
    bufferMinutes:
      input.bufferMinutes === "" || input.bufferMinutes == null
        ? null
        : Number(input.bufferMinutes),
    facilityId: input.facilityId || null,
    requiresAssignedStaff: parseStaffIds(input).length > 0,
  });

  await configRepo.replaceServiceStaffAssignments(db, {
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
    serviceTypeId: serviceId,
    staffMemberIds: parseStaffIds(input),
  });

  return getOpsService(db, {
    ...input,
    serviceId,
  });
}

module.exports = {
  RESULT,
  PERM,
  listOpsServices,
  getOpsService,
  saveOpsService,
  formatMoneyMinor,
  parsePriceMajorToMinor,
};
