"use strict";

/**
 * Settings → Clinic Setup → Departments screen loaders (AC-B2-10).
 */

const {
  listDepartments,
  createDepartment,
  updateDepartment,
  DEPARTMENT_TYPES,
  DEPARTMENT_TYPE_LABELS,
  PERM,
  RESULT,
} = require("./activeClinicDepartmentService");
const {
  listFacilitiesByOrganization,
} = require("./facilityService");

/** Frozen Stitch AC-B2-10 (Batch 2 project 7300898757945019896). */
const STITCH_B2_10 = Object.freeze({
  desktop: "fb88329aa6af454a8e7b6675c6070b78",
  mobile: "4c70614fd2534fa3a5baee0f61f1f964",
});

/**
 * Stitch demo fields not present on activeclinic.departments / facilities model.
 * Do not invent schema for these without an approved functional requirement.
 */
const STITCH_GAPS = Object.freeze([
  {
    key: "department_code_display",
    stitchLabel: "Department code (DPT-…)",
    note: "Use department_key; Stitch-style DPT codes are presentation-only.",
  },
  {
    key: "department_lead",
    stitchLabel: "Operational / clinical lead",
    note: "No lead staff FK on departments.",
  },
  {
    key: "department_room_counts",
    stitchLabel: "Exam / consultation room counts",
    note: "No room inventory on departments or facilities.",
  },
  {
    key: "department_wing_location",
    stitchLabel: "Wing / floor / pod location",
    note: "Departments inherit facility address only; no sub-location fields.",
  },
]);

function hasPerm(perms, key) {
  return Array.isArray(perms) ? perms.includes(key) : false;
}

function uuidOrNull(value) {
  const s = String(value || "").trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      s
    )
  ) {
    return null;
  }
  return s;
}

async function loadDepartmentsSettingsScreen(db, input) {
  const auth = input.auth;
  const query = input.query || {};
  const perms = auth.permissions || [];
  const canManage = hasPerm(perms, PERM.MANAGE);
  if (!canManage) {
    return { ok: false, code: RESULT.ACCESS_DENIED };
  }

  const facilityFilter = uuidOrNull(query.facility || query.facility_id);
  const statusRaw = String(query.status || "")
    .trim()
    .toLowerCase();
  const statusFilter =
    statusRaw === "active" || statusRaw === "inactive" ? statusRaw : "";
  const typeFilter = String(query.type || "")
    .trim()
    .toLowerCase();
  const typeOk = DEPARTMENT_TYPES.includes(typeFilter) ? typeFilter : "";
  const q = String(query.q || "")
    .trim()
    .slice(0, 120)
    .toLowerCase();

  const listed = await listDepartments(db, {
    staffId: auth.staffMember.id,
    organizationId: auth.organization.id,
    facilityId: facilityFilter || null,
    status: statusFilter || null,
  });
  if (!listed.ok) {
    return { ok: false, code: listed.result };
  }

  let departments = listed.departments || [];
  if (typeOk) {
    departments = departments.filter((d) => d.departmentType === typeOk);
  }
  if (q) {
    departments = departments.filter((d) => {
      const hay = `${d.displayName || ""} ${d.departmentKey || ""} ${d.typeLabel || ""} ${d.facilityDisplayName || ""}`
        .toLowerCase();
      return hay.includes(q);
    });
  }

  const facilitiesListed = await listFacilitiesByOrganization(db, {
    organizationId: auth.organization.id,
  });
  const allFacilities = (facilitiesListed.facilities || []).filter((f) =>
    ["active", "planned", "inactive"].includes(f.status)
  );
  const facilities = allFacilities
    .filter((f) => ["active", "planned"].includes(f.status))
    .map((f) => ({
      id: f.id,
      displayName: f.displayName,
      facilityKey: f.facilityKey,
      status: f.status,
      isPrimary: f.isPrimary === true,
      selected:
        (facilityFilter && facilityFilter === f.id) ||
        (!facilityFilter &&
          ((auth.selectedFacility && auth.selectedFacility.id === f.id) ||
            f.isPrimary === true)),
    }));

  // Counts for KPIs: use unfiltered org list for totals when a facility filter is set.
  const allListed = facilityFilter
    ? await listDepartments(db, {
        staffId: auth.staffMember.id,
        organizationId: auth.organization.id,
        facilityId: null,
        status: null,
      })
    : listed;
  const allDepts = (allListed.ok ? allListed.departments : departments) || [];
  const scopedForKpi = facilityFilter
    ? allDepts.filter((d) => d.facilityId === facilityFilter)
    : allDepts;
  const activeCount = scopedForKpi.filter((d) => d.status === "active").length;
  const inactiveCount = scopedForKpi.filter((d) => d.status === "inactive").length;
  const facilityCount = allFacilities.filter((f) =>
    ["active", "planned"].includes(f.status)
  ).length;

  const qsBase = (overrides) => {
    const params = new URLSearchParams();
    const next = {
      facility: facilityFilter || "",
      status: statusFilter || "",
      type: typeOk || "",
      q: q || "",
      ...overrides,
    };
    Object.keys(next).forEach((key) => {
      if (next[key]) params.set(key, next[key]);
    });
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  const facilityTabs = [
    {
      key: "all",
      label: "All facilities",
      href: `/app/settings/clinic-setup/departments${qsBase({ facility: "" })}`,
      active: !facilityFilter,
      count: allDepts.length,
    },
    ...facilities.map((f) => ({
      key: f.id,
      label: f.displayName,
      href: `/app/settings/clinic-setup/departments${qsBase({ facility: f.id })}`,
      active: facilityFilter === f.id,
      count: allDepts.filter((d) => d.facilityId === f.id).length,
    })),
  ];

  return {
    ok: true,
    departmentsPage: {
      departments,
      facilities,
      facilityTabs,
      types: DEPARTMENT_TYPES.map((value) => ({
        value,
        label: DEPARTMENT_TYPE_LABELS[value] || value,
      })),
      filters: {
        facility: facilityFilter || "",
        status: statusFilter || "",
        type: typeOk || "",
        q: q || "",
      },
      metrics: {
        departmentTotal: scopedForKpi.length,
        activeCount,
        inactiveCount,
        facilityCount,
      },
      gaps: STITCH_GAPS,
      actions: {
        canManage,
        canViewFacilities: hasPerm(perms, "activeclinic.facility.view"),
        facilitiesHref: "/app/facilities",
        addHref: "#ac-dept-add-drawer",
      },
      stitch: {
        desktop: STITCH_B2_10.desktop,
        mobile: STITCH_B2_10.mobile,
      },
    },
  };
}

module.exports = {
  loadDepartmentsSettingsScreen,
  createDepartment,
  updateDepartment,
  RESULT,
  PERM,
  STITCH_B2_10,
  STITCH_GAPS,
};
