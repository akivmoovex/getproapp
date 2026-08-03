"use strict";

/**
 * ActiveClinic facility selection / context validation (AC-V6-10).
 */

const {
  listFacilitiesForStaff,
  getActiveStaffFacilityAssignment,
} = require("./activeClinicStaffFacilityService");
const {
  getFacilityByIdAndOrganization,
  getFacilityByOrganizationAndKey,
  listFacilitiesByOrganization,
} = require("./facilityService");
const {
  mergeSessionContext,
  clearSessionContextKeys,
} = require("../../platform/session/deploymentSessionContext");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "facility_not_found",
  INACTIVE: "facility_inactive",
  NO_ASSIGNMENT: "facility_assignment_required",
  SESSION_REQUIRED: "session_required",
});

function mapFacilityOption(row) {
  if (!row) return null;
  return {
    id: row.facilityId || row.id,
    facilityKey: row.facilityKey || row.facility_key,
    displayName: row.facilityDisplayName || row.displayName || row.display_name,
    status: row.facilityStatus || row.status,
    isPrimary: row.isPrimary === true || row.is_primary === true,
  };
}

/**
 * List facilities the authenticated staff may select.
 * Network admins: all active org facilities.
 * Others: active facility assignments only.
 */
async function listSelectableFacilities(db, auth) {
  if (!auth || !auth.authenticated || !auth.organization) {
    return { ok: false, code: RESULT.FORBIDDEN, facilities: [] };
  }
  if (auth.isNetworkAdmin) {
    const listed = await listFacilitiesByOrganization(db, {
      organizationId: auth.organization.id,
      status: "active",
    });
    if (!listed.ok) return { ok: false, code: listed.code, facilities: [] };
    return {
      ok: true,
      code: RESULT.OK,
      facilities: listed.facilities.map((f) => mapFacilityOption(f)),
    };
  }
  const assigned = await listFacilitiesForStaff(db, {
    staffMemberId: auth.staffMember.id,
    organizationId: auth.organization.id,
  });
  if (!assigned.ok) return { ok: false, code: assigned.code, facilities: [] };
  const facilities = (assigned.assignments || [])
    .filter((a) => a.status === "active" && a.facilityStatus === "active")
    .map((a) => mapFacilityOption(a));
  return { ok: true, code: RESULT.OK, facilities };
}

/**
 * Resolve and validate a facility for the current auth context.
 */
async function resolveSelectableFacility(db, auth, facilityIdOrKey) {
  if (!auth || !auth.authenticated) {
    return { ok: false, code: RESULT.FORBIDDEN, facility: null };
  }
  const raw = String(facilityIdOrKey || "").trim();
  if (!raw) return { ok: false, code: RESULT.INVALID_INPUT, facility: null };

  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let facility;
  if (uuidRe.test(raw)) {
    const got = await getFacilityByIdAndOrganization(db, {
      id: raw,
      organizationId: auth.organization.id,
    });
    if (!got.ok) return { ok: false, code: RESULT.NOT_FOUND, facility: null };
    facility = got.facility;
  } else {
    const got = await getFacilityByOrganizationAndKey(db, {
      organizationId: auth.organization.id,
      facilityKey: raw,
    });
    if (!got.ok) return { ok: false, code: RESULT.NOT_FOUND, facility: null };
    facility = got.facility;
  }

  if (facility.status !== "active") {
    return { ok: false, code: RESULT.INACTIVE, facility: null };
  }

  if (!auth.isNetworkAdmin) {
    const assignment = await getActiveStaffFacilityAssignment(db, {
      staffMemberId: auth.staffMember.id,
      facilityId: facility.id,
      organizationId: auth.organization.id,
    });
    if (!assignment.ok) {
      return { ok: false, code: RESULT.NO_ASSIGNMENT, facility: null };
    }
  }

  return {
    ok: true,
    code: RESULT.OK,
    facility: {
      id: facility.id,
      facilityKey: facility.facilityKey,
      displayName: facility.displayName,
      status: facility.status,
      isPrimary: facility.isPrimary === true,
      facilityType: facility.facilityType || null,
    },
  };
}

async function selectFacilityForSession(db, input) {
  const auth = input.auth;
  const sessionId = input.sessionId;
  if (!sessionId) return { ok: false, code: RESULT.SESSION_REQUIRED };
  const resolved = await resolveSelectableFacility(db, auth, input.facilityId);
  if (!resolved.ok) return resolved;
  const merged = await mergeSessionContext(db, {
    sessionId,
    patch: { selectedFacilityId: resolved.facility.id },
  });
  if (!merged.ok) return { ok: false, code: merged.code };
  return { ok: true, code: RESULT.OK, facility: resolved.facility };
}

async function clearSelectedFacility(db, sessionId) {
  return clearSessionContextKeys(db, {
    sessionId,
    keys: ["selectedFacilityId"],
  });
}

module.exports = {
  RESULT,
  listSelectableFacilities,
  resolveSelectableFacility,
  selectFacilityForSession,
  clearSelectedFacility,
  mapFacilityOption,
};
