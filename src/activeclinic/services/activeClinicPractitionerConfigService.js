"use strict";

/**
 * Practitioner profile + availability (ACN04/ACN05).
 * Profile configuration does NOT grant application RBAC.
 */

const { rejectForgedTenantIdentifiers } = require("../../platform/rbac/sharedTenantScope");
const { parseListQuery, buildListPageResult } = require("../../platform/http/listQuery");
const {
  getStaffMemberByIdAndOrganization,
  listStaffMembersByOrganization,
  updateStaffMemberProfile,
  RESULT: STAFF_RESULT,
} = require("./activeClinicStaffService");
const {
  listFacilitiesForStaff,
} = require("./activeClinicStaffFacilityService");
const { listFacilitiesByOrganization } = require("./facilityService");
const configRepo = require("../repositories/servicePractitionerConfigRepository");

const DAY_LABELS = Object.freeze([
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]);

function assertTrusted(input) {
  const orgId =
    input && input.organizationId ? String(input.organizationId).trim() : "";
  if (!orgId) {
    return { ok: false, code: "unauthenticated", httpStatus: 401 };
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
    return { ok: false, code: "forged_tenant", httpStatus: 403 };
  }
  return { ok: true, organizationId: orgId };
}

function hasPerm(permissions, key) {
  return Array.isArray(permissions) && permissions.includes(key);
}

function summarizeWeekly(slots) {
  const active = (slots || []).filter((s) => s.status === "active" || !s.status);
  if (!active.length) return "No weekly hours set";
  const byDay = new Map();
  for (const slot of active) {
    const day = Number(slot.day_of_week != null ? slot.day_of_week : slot.dayOfWeek);
    const label = DAY_LABELS[day] || `Day ${day}`;
    const range = `${String(slot.starts_at_local || slot.startsAtLocal).slice(0, 5)}–${String(
      slot.ends_at_local || slot.endsAtLocal
    ).slice(0, 5)}`;
    if (!byDay.has(label)) byDay.set(label, []);
    byDay.get(label).push(range);
  }
  return Array.from(byDay.entries())
    .map(([day, ranges]) => `${day.slice(0, 3)} ${ranges.join(", ")}`)
    .join("; ");
}

function parseSpecialties(raw) {
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s).trim()).filter(Boolean).slice(0, 20);
  }
  if (typeof raw === "string") {
    return raw
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);
  }
  return [];
}

function parseWeeklySlots(body) {
  const slots = [];
  if (!body || typeof body !== "object") return slots;
  // day_0_start / day_0_end repeating, or JSON slots
  if (typeof body.weeklySlotsJson === "string" && body.weeklySlotsJson.trim()) {
    try {
      const parsed = JSON.parse(body.weeklySlotsJson);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          slots.push({
            dayOfWeek: Number(item.dayOfWeek),
            startsAtLocal: item.startsAtLocal,
            endsAtLocal: item.endsAtLocal,
            facilityId: item.facilityId || null,
          });
        }
        return slots;
      }
    } catch (_err) {
      /* fall through */
    }
  }
  for (let day = 0; day <= 6; day += 1) {
    const enabled = body[`day_${day}_enabled`] === "1" || body[`day_${day}_enabled`] === true;
    const start = body[`day_${day}_start`];
    const end = body[`day_${day}_end`];
    if (enabled && start && end) {
      slots.push({
        dayOfWeek: day,
        startsAtLocal: String(start),
        endsAtLocal: String(end),
        facilityId: body.facilityId || null,
      });
    }
  }
  return slots;
}

async function listPractitioners(db, input) {
  const scope = assertTrusted(input);
  if (!scope.ok) return scope;
  if (!hasPerm(input.permissions, "activeclinic.staff.view")) {
    return { ok: false, code: "forbidden", httpStatus: 403 };
  }

  const listQuery = parseListQuery(input.query || {}, {
    filterKeys: ["status", "specialty", "public", "facility"],
    searchKeys: ["q", "search"],
    defaultLimit: 50,
  });

  const listed = await listStaffMembersByOrganization(db, {
    organizationId: input.organizationId,
  });
  if (!listed.ok) return listed;

  let practitioners = [];
  for (const member of listed.staffMembers) {
    const weekly = await configRepo.listWeeklyAvailability(db, {
      organizationId: input.organizationId,
      healthcareOrganizationId: member.healthcareOrganizationId,
      staffMemberId: member.id,
    });
    const blocks = await configRepo.listAvailabilityBlocks(db, {
      organizationId: input.organizationId,
      healthcareOrganizationId: member.healthcareOrganizationId,
      staffMemberId: member.id,
    });
    const facilities = await listFacilitiesForStaff(db, {
      organizationId: input.organizationId,
      staffMemberId: member.id,
    });
    const onLeave = (blocks || []).some(
      (b) =>
        b.status === "active" &&
        new Date(b.starts_at) <= new Date() &&
        new Date(b.ends_at) >= new Date()
    );
    practitioners.push({
      ...member,
      weeklySummary: summarizeWeekly(weekly),
      onLeave,
      publicVisibilityLabel: member.publicBookable
        ? "Publicly bookable"
        : member.publicProfileEnabled
          ? "Profile visible"
          : "Internal only",
      locations: (facilities.ok ? facilities.assignments || facilities.facilities || [] : []).map(
        (f) => ({
          id: f.facilityId || f.id,
          label: f.displayName || f.facilityDisplayName || f.name || "Facility",
          isPrimary: f.isPrimary === true,
        })
      ),
    });
  }

  if (listQuery.q) {
    const q = listQuery.q.toLowerCase();
    practitioners = practitioners.filter(
      (p) =>
        String(p.displayName).toLowerCase().includes(q) ||
        String(p.jobTitle || "").toLowerCase().includes(q) ||
        String(p.licenseNumber || "").toLowerCase().includes(q) ||
        (p.specialties || []).some((s) => String(s).toLowerCase().includes(q))
    );
  }
  if (listQuery.filters.status) {
    practitioners = practitioners.filter((p) => p.status === listQuery.filters.status);
  }
  if (listQuery.filters.public === "1") {
    practitioners = practitioners.filter((p) => p.publicBookable);
  }
  if (listQuery.filters.specialty) {
    const needle = String(listQuery.filters.specialty).toLowerCase();
    practitioners = practitioners.filter((p) =>
      (p.specialties || []).some((s) => String(s).toLowerCase().includes(needle))
    );
  }

  const pageMeta = buildListPageResult({
    page: listQuery.page,
    limit: listQuery.limit,
    total: practitioners.length,
  });
  const pageRows = practitioners.slice(
    pageMeta.offset,
    pageMeta.offset + pageMeta.limit
  );

  return {
    ok: true,
    practitioners: pageRows,
    page: pageMeta,
    filters: {
      q: listQuery.q,
      status: listQuery.filters.status || "",
      specialty: listQuery.filters.specialty || "",
      public: listQuery.filters.public || "",
    },
    stats: {
      total: listed.staffMembers.length,
      active: listed.staffMembers.filter((s) => s.status === "active").length,
      publicBookable: listed.staffMembers.filter((s) => s.publicBookable).length,
      onLeave: practitioners.filter((p) => p.onLeave).length,
    },
    canEdit: hasPerm(input.permissions, "activeclinic.staff.update"),
    canInvite: hasPerm(input.permissions, "activeclinic.staff.invite"),
    rbacGuardrail:
      "Configuring practitioner profile, rooms, and booking channels does not grant ActiveClinic application access. Manage login and roles under Access Control.",
  };
}

async function getPractitionerWorkspace(db, input) {
  const scope = assertTrusted(input);
  if (!scope.ok) return scope;
  if (!hasPerm(input.permissions, "activeclinic.staff.view")) {
    return { ok: false, code: "forbidden", httpStatus: 403 };
  }

  const got = await getStaffMemberByIdAndOrganization(db, {
    id: input.staffId,
    organizationId: input.organizationId,
  });
  if (!got.ok) return got;

  const member = got.staffMember;
  const weekly = await configRepo.listWeeklyAvailability(db, {
    organizationId: input.organizationId,
    healthcareOrganizationId: member.healthcareOrganizationId,
    staffMemberId: member.id,
  });
  const blocks = await configRepo.listAvailabilityBlocks(db, {
    organizationId: input.organizationId,
    healthcareOrganizationId: member.healthcareOrganizationId,
    staffMemberId: member.id,
  });
  const facilities = await listFacilitiesByOrganization(db, {
    organizationId: input.organizationId,
    status: "active",
  });
  const assigned = await listFacilitiesForStaff(db, {
    organizationId: input.organizationId,
    staffMemberId: member.id,
  });

  return {
    ok: true,
    practitioner: member,
    weekly: weekly.map((row) => ({
      id: row.id,
      dayOfWeek: row.day_of_week,
      dayLabel: DAY_LABELS[row.day_of_week],
      startsAtLocal: String(row.starts_at_local).slice(0, 5),
      endsAtLocal: String(row.ends_at_local).slice(0, 5),
      facilityId: row.facility_id,
      status: row.status,
    })),
    blocks: blocks.map((row) => ({
      id: row.id,
      blockKind: row.block_kind,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      reason: row.reason,
      status: row.status,
    })),
    facilities: (facilities.ok ? facilities.facilities : []).map((f) => ({
      id: f.id,
      label: f.displayName || f.name || f.facilityKey,
    })),
    assignedFacilities: (assigned.ok ? assigned.assignments || assigned.facilities || [] : []).map(
      (f) => ({
        id: f.facilityId || f.id,
        label: f.displayName || f.facilityDisplayName || f.name,
        isPrimary: f.isPrimary === true,
      })
    ),
    dayLabels: DAY_LABELS,
    canEdit: hasPerm(input.permissions, "activeclinic.staff.update"),
    rbacGuardrail:
      "Saving profile and availability does not grant application permissions. Use Access Control for roles and login.",
  };
}

async function savePractitionerWorkspace(db, input) {
  const scope = assertTrusted(input);
  if (!scope.ok) return scope;
  if (!hasPerm(input.permissions, "activeclinic.staff.update")) {
    return { ok: false, code: "forbidden", httpStatus: 403 };
  }

  const got = await getStaffMemberByIdAndOrganization(db, {
    id: input.staffId,
    organizationId: input.organizationId,
  });
  if (!got.ok) return got;
  const member = got.staffMember;

  const updated = await updateStaffMemberProfile(db, {
    id: member.id,
    organizationId: input.organizationId,
    patch: {
      firstName: input.firstName,
      lastName: input.lastName,
      displayName: input.displayName,
      jobTitle: input.jobTitle,
      phone: input.phone || input.phoneDisplay,
      phoneCountry: input.phoneCountry || null,
      phoneNational: input.phoneNational || null,
      email: input.email != null ? input.email : input.emailDisplay,
      credentialsText: input.credentialsText,
      licenseNumber: input.licenseNumber,
      specialties: parseSpecialties(input.specialties || input.specialtiesText),
      publicBookable: input.publicBookable === true || input.publicBookable === "1",
      publicProfileEnabled:
        input.publicProfileEnabled === true ||
        input.publicProfileEnabled === "1" ||
        input.publicBookable === true ||
        input.publicBookable === "1",
      publicDisplayName: input.publicDisplayName || input.displayName,
      publicTitle: input.publicTitle || input.jobTitle,
      publicBio: input.publicBio,
    },
  });
  if (!updated.ok) return updated;

  const slots = parseWeeklySlots(input.body || input);
  await configRepo.replaceWeeklyAvailability(db, {
    organizationId: input.organizationId,
    healthcareOrganizationId: member.healthcareOrganizationId,
    staffMemberId: member.id,
    slots,
  });

  if (input.blockStartsAt && input.blockEndsAt) {
    await configRepo.insertAvailabilityBlock(db, {
      organizationId: input.organizationId,
      healthcareOrganizationId: member.healthcareOrganizationId,
      staffMemberId: member.id,
      blockKind: input.blockKind || "leave",
      startsAt: new Date(input.blockStartsAt).toISOString(),
      endsAt: new Date(input.blockEndsAt).toISOString(),
      reason: input.blockReason || null,
      createdByStaffId: input.actorStaffId || null,
    });
  }

  return getPractitionerWorkspace(db, input);
}

async function cancelPractitionerBlock(db, input) {
  const scope = assertTrusted(input);
  if (!scope.ok) return scope;
  if (!hasPerm(input.permissions, "activeclinic.staff.update")) {
    return { ok: false, code: "forbidden", httpStatus: 403 };
  }
  const got = await getStaffMemberByIdAndOrganization(db, {
    id: input.staffId,
    organizationId: input.organizationId,
  });
  if (!got.ok) return got;
  const cancelled = await configRepo.cancelAvailabilityBlock(db, {
    id: input.blockId,
    organizationId: input.organizationId,
    healthcareOrganizationId: got.staffMember.healthcareOrganizationId,
    staffMemberId: got.staffMember.id,
  });
  if (!cancelled) return { ok: false, code: STAFF_RESULT.NOT_FOUND, httpStatus: 404 };
  return getPractitionerWorkspace(db, input);
}

module.exports = {
  DAY_LABELS,
  listPractitioners,
  getPractitionerWorkspace,
  savePractitionerWorkspace,
  cancelPractitionerBlock,
  summarizeWeekly,
  parseSpecialties,
  parseWeeklySlots,
};
