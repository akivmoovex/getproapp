"use strict";

/**
 * ActiveClinic facility presentation helpers + screen loaders (AC-V6-S03).
 * No Stitch facility screens exist — UI follows shell design system (VISUAL_BLOCKED).
 */

const {
  FACILITY_TYPES,
  STATUSES,
  listFacilitiesByOrganization,
  getFacilityByOrganizationAndKey,
} = require("./facilityService");
const {
  listFacilitiesForStaff,
} = require("./activeClinicStaffFacilityService");
const {
  suggestFacilityKeyFromDisplayName,
} = require("./normalizeFacilityKey");

const TYPE_LABELS = Object.freeze({
  hospital: "Hospital",
  health_centre: "Health centre",
  clinic: "Clinic",
  diagnostic_centre: "Diagnostic centre",
  pharmacy: "Pharmacy",
  mobile_clinic: "Mobile clinic",
  administrative_office: "Administrative office",
  other: "Other",
});

const STATUS_LABELS = Object.freeze({
  planned: "Planned",
  active: "Active",
  inactive: "Inactive",
  suspended: "Suspended",
  archived: "Archived",
});

function facilityTypeLabel(type) {
  return TYPE_LABELS[type] || String(type || "—");
}

function facilityStatusLabel(status) {
  return STATUS_LABELS[status] || String(status || "—");
}

function facilityLocationSummary(f) {
  if (!f) return null;
  const parts = [f.city, f.district, f.province, f.countryCode].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function hasPerm(perms, key) {
  return Array.isArray(perms) ? perms.includes(key) : false;
}

function mapFacilityListItem(f, opts) {
  const selectedId = opts && opts.selectedFacilityId;
  return {
    facilityKey: f.facilityKey,
    displayName: f.displayName,
    facilityType: f.facilityType,
    facilityTypeLabel: facilityTypeLabel(f.facilityType),
    status: f.status,
    statusLabel: facilityStatusLabel(f.status),
    isPrimary: f.isPrimary === true,
    locationSummary: facilityLocationSummary(f),
    phoneDisplay: f.phoneDisplay || null,
    isSelected: selectedId && String(f.id) === String(selectedId),
  };
}

function mapFacilityDetail(f) {
  return {
    id: f.id,
    facilityKey: f.facilityKey,
    displayName: f.displayName,
    legalName: f.legalName,
    facilityType: f.facilityType,
    facilityTypeLabel: facilityTypeLabel(f.facilityType),
    status: f.status,
    statusLabel: facilityStatusLabel(f.status),
    isPrimary: f.isPrimary === true,
    countryCode: f.countryCode,
    province: f.province,
    district: f.district,
    city: f.city,
    addressLine1: f.addressLine1,
    addressLine2: f.addressLine2,
    postalCode: f.postalCode,
    locationSummary: facilityLocationSummary(f),
    phoneDisplay: f.phoneDisplay,
    emailDisplay: f.emailDisplay,
    timezone: f.timezone,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}

/**
 * Non-creators see assignment-scoped facilities.
 * Creators (typically network admins) see the organization catalogue.
 */
async function listAuthorizedFacilitiesForAuth(db, auth, statusFilter) {
  const organizationId = auth.organization.id;
  const listed = await listFacilitiesByOrganization(db, {
    organizationId,
    status: statusFilter || null,
  });
  if (!listed.ok) return listed;

  if (hasPerm(auth.permissions, "activeclinic.facility.create")) {
    return listed;
  }

  const assigned = await listFacilitiesForStaff(db, {
    staffMemberId: auth.staffMember.id,
    organizationId,
  });
  if (!assigned.ok) return { ok: true, facilities: [] };
  const allowedIds = new Set(
    (assigned.assignments || [])
      .filter((a) => a.status === "active")
      .map((a) => String(a.facilityId))
  );
  return {
    ok: true,
    facilities: (listed.facilities || []).filter((f) => allowedIds.has(String(f.id))),
  };
}

async function assertFacilityReadable(db, auth, facility) {
  if (!facility) return false;
  if (hasPerm(auth.permissions, "activeclinic.facility.create")) {
    return true;
  }
  const assigned = await listFacilitiesForStaff(db, {
    staffMemberId: auth.staffMember.id,
    organizationId: auth.organization.id,
  });
  if (!assigned.ok) return false;
  return (assigned.assignments || []).some(
    (a) => a.status === "active" && String(a.facilityId) === String(facility.id)
  );
}

/**
 * @param {{ query: Function }} db
 * @param {{ auth: object, query?: object }} input
 */
async function loadActiveClinicFacilitiesListScreen(db, input) {
  const auth = input.auth;
  const q = input.query || {};
  const search = String(q.q || q.search || "").trim().toLowerCase();
  const typeFilter = String(q.type || "").trim().toLowerCase();
  const statusFilter = String(q.status || "").trim().toLowerCase();
  const primaryOnly = q.primary === "1" || q.primary === "true";

  const statusParam =
    statusFilter && STATUSES.includes(statusFilter) ? statusFilter : null;
  const listed = await listAuthorizedFacilitiesForAuth(db, auth, statusParam);
  let facilities = listed.ok ? listed.facilities || [] : [];
  const authorizedCountBeforeFilters = facilities.length;

  if (typeFilter && FACILITY_TYPES.includes(typeFilter)) {
    facilities = facilities.filter((f) => f.facilityType === typeFilter);
  }
  if (primaryOnly) {
    facilities = facilities.filter((f) => f.isPrimary === true);
  }
  if (search) {
    facilities = facilities.filter((f) => {
      const hay = `${f.displayName} ${f.facilityKey} ${f.city || ""} ${f.province || ""}`
        .toLowerCase();
      return hay.includes(search);
    });
  }

  facilities = facilities
    .slice()
    .sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)));

  const perms = auth.permissions || [];
  const canCreate = hasPerm(perms, "activeclinic.facility.create");
  const selectedFacilityId =
    (auth.selectedFacility && auth.selectedFacility.id) || null;

  const items = facilities.map((f) => mapFacilityListItem(f, { selectedFacilityId }));
  const filtersActive = Boolean(search || typeFilter || statusFilter || primaryOnly);

  let emptyMode = null;
  if (!items.length) {
    if (filtersActive) {
      emptyMode = "filtered";
    } else if (
      !canCreate &&
      authorizedCountBeforeFilters === 0
    ) {
      // Org may still have facilities the user is not assigned to.
      const orgListed = await listFacilitiesByOrganization(db, {
        organizationId: auth.organization.id,
        status: null,
      });
      const orgCount =
        orgListed.ok && Array.isArray(orgListed.facilities)
          ? orgListed.facilities.length
          : 0;
      emptyMode = orgCount > 0 ? "restricted" : "none";
    } else {
      emptyMode = "none";
    }
  }

  return {
    ok: true,
    facilities: items,
    filters: {
      q: search,
      type: typeFilter && FACILITY_TYPES.includes(typeFilter) ? typeFilter : "",
      status: statusParam || "",
      primary: primaryOnly,
      active: filtersActive,
    },
    filterOptions: {
      types: FACILITY_TYPES.map((t) => ({ value: t, label: facilityTypeLabel(t) })),
      statuses: STATUSES.map((s) => ({ value: s, label: facilityStatusLabel(s) })),
    },
    actions: {
      canCreate,
      createHref: canCreate ? "/app/facilities/new" : null,
    },
    emptyMode,
  };
}

/**
 * @param {{ query: Function }} db
 * @param {{ auth: object, facilityKey: string }} input
 */
async function loadActiveClinicFacilityDetailScreen(db, input) {
  const auth = input.auth;
  const got = await getFacilityByOrganizationAndKey(db, {
    organizationId: auth.organization.id,
    facilityKey: input.facilityKey,
  });
  if (!got.ok) {
    return { ok: false, code: got.code, facility: null };
  }
  const readable = await assertFacilityReadable(db, auth, got.facility);
  if (!readable) {
    return { ok: false, code: "facility_not_found", facility: null };
  }

  const perms = auth.permissions || [];
  const facility = mapFacilityDetail(got.facility);
  const canUpdate = hasPerm(perms, "activeclinic.facility.update");
  const canArchive = hasPerm(perms, "activeclinic.facility.archive");
  const canSetPrimary =
    canUpdate && facility.status === "active" && !facility.isPrimary;

  return {
    ok: true,
    facility,
    actions: {
      canUpdate,
      canArchive: canArchive && facility.status !== "archived",
      canSetPrimary,
      editHref: canUpdate ? `/app/facilities/${encodeURIComponent(facility.facilityKey)}/edit` : null,
      archiveAction: canArchive && facility.status !== "archived"
        ? `/app/facilities/${encodeURIComponent(facility.facilityKey)}/archive`
        : null,
      setPrimaryAction: canSetPrimary
        ? `/app/facilities/${encodeURIComponent(facility.facilityKey)}/set-primary`
        : null,
    },
  };
}

function blankFacilityForm(defaults) {
  const d = defaults || {};
  return {
    displayName: d.displayName || "",
    facilityKey: d.facilityKey || "",
    legalName: d.legalName || "",
    facilityType: d.facilityType || "clinic",
    status: d.status || "planned",
    isPrimary: d.isPrimary === true,
    countryCode: d.countryCode || "ZM",
    province: d.province || "",
    district: d.district || "",
    city: d.city || "",
    addressLine1: d.addressLine1 || "",
    addressLine2: d.addressLine2 || "",
    postalCode: d.postalCode || "",
    phone: d.phone || d.phoneDisplay || "",
    email: d.email || d.emailDisplay || "",
    timezone: d.timezone || "Africa/Lusaka",
  };
}

async function loadActiveClinicCreateFacilityScreen(db, input) {
  const auth = input.auth;
  const hco = auth.healthcareOrganization || {};
  const values = blankFacilityForm({
    ...(input.values || {}),
    countryCode: (input.values && input.values.countryCode) || hco.countryCode || "ZM",
    timezone: (input.values && input.values.timezone) || hco.timezone || "Africa/Lusaka",
  });
  if (!values.facilityKey && values.displayName) {
    values.facilityKey = suggestFacilityKeyFromDisplayName(values.displayName);
  }
  return {
    ok: true,
    mode: "create",
    formAction: "/app/facilities",
    values,
    errors: input.errors || [],
    fieldErrors: input.fieldErrors || {},
    typeOptions: FACILITY_TYPES.map((t) => ({ value: t, label: facilityTypeLabel(t) })),
    statusOptions: ["planned", "active"].map((s) => ({
      value: s,
      label: facilityStatusLabel(s),
    })),
    keyEditable: true,
  };
}

async function loadActiveClinicEditFacilityScreen(db, input) {
  const detail = await loadActiveClinicFacilityDetailScreen(db, {
    auth: input.auth,
    facilityKey: input.facilityKey,
  });
  if (!detail.ok) return detail;
  if (!detail.actions.canUpdate) {
    return { ok: false, code: "access_denied", facility: detail.facility };
  }
  const f = detail.facility;
  const values = blankFacilityForm({
    displayName: f.displayName,
    facilityKey: f.facilityKey,
    legalName: f.legalName,
    facilityType: f.facilityType,
    status: f.status === "archived" ? f.status : f.status,
    isPrimary: f.isPrimary,
    countryCode: f.countryCode,
    province: f.province,
    district: f.district,
    city: f.city,
    addressLine1: f.addressLine1,
    addressLine2: f.addressLine2,
    postalCode: f.postalCode,
    phone: f.phoneDisplay,
    email: f.emailDisplay,
    timezone: f.timezone,
    ...(input.values || {}),
  });
  return {
    ok: true,
    mode: "edit",
    formAction: `/app/facilities/${encodeURIComponent(f.facilityKey)}`,
    facility: f,
    values,
    errors: input.errors || [],
    fieldErrors: input.fieldErrors || {},
    typeOptions: FACILITY_TYPES.map((t) => ({ value: t, label: facilityTypeLabel(t) })),
    statusOptions: STATUSES.filter((s) => s !== "archived").map((s) => ({
      value: s,
      label: facilityStatusLabel(s),
    })),
    keyEditable: false,
  };
}

function parseFacilityFormBody(body) {
  const b = body || {};
  return {
    displayName: String(b.display_name || "").trim(),
    facilityKey: String(b.facility_key || "").trim(),
    legalName: String(b.legal_name || "").trim(),
    facilityType: String(b.facility_type || "").trim(),
    status: String(b.status || "planned").trim(),
    isPrimary: b.is_primary === "1" || b.is_primary === "on" || b.is_primary === true,
    countryCode: String(b.country_code || "").trim(),
    province: String(b.province || "").trim(),
    district: String(b.district || "").trim(),
    city: String(b.city || "").trim(),
    addressLine1: String(b.address_line_1 || "").trim(),
    addressLine2: String(b.address_line_2 || "").trim(),
    postalCode: String(b.postal_code || "").trim(),
    phone: String(b.phone || "").trim(),
    email: String(b.email || "").trim(),
    timezone: String(b.timezone || "").trim(),
  };
}

module.exports = {
  TYPE_LABELS,
  STATUS_LABELS,
  FACILITY_TYPES,
  STATUSES,
  facilityTypeLabel,
  facilityStatusLabel,
  facilityLocationSummary,
  loadActiveClinicFacilitiesListScreen,
  loadActiveClinicFacilityDetailScreen,
  loadActiveClinicCreateFacilityScreen,
  loadActiveClinicEditFacilityScreen,
  parseFacilityFormBody,
  blankFacilityForm,
  assertFacilityReadable,
};
