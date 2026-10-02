"use strict";

/**
 * ActiveClinic ACN27 Rooms & Spaces service.
 * Facility-required; department optional (same facility + org).
 * No occupancy engine.
 */

const repo = require("../repositories/facilityRoomRepository");
const facilityRepo = require("../repositories/facilityRepository");
const departmentRepo = require("../repositories/departmentRepository");
const { recordAuditEventSafe } = require("../../platform/services/auditEventService");

const ROOM_TYPES = Object.freeze([
  "consultation",
  "exam",
  "triage",
  "treatment",
  "procedure",
  "specimen_lab",
  "administrative",
  "other",
]);

const ROOM_TYPE_LABELS = Object.freeze({
  consultation: "Consultation room",
  exam: "Exam room",
  triage: "Triage room",
  treatment: "Treatment room",
  procedure: "Procedure room",
  specimen_lab: "Specimen / lab",
  administrative: "Administrative",
  other: "Other",
});

const STATUSES = Object.freeze(["available", "unavailable", "inactive"]);

const STATUS_LABELS = Object.freeze({
  available: "Available",
  unavailable: "Unavailable",
  inactive: "Inactive",
});

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  INVALID_TYPE: "invalid_room_type",
  INVALID_STATUS: "invalid_status",
  INVALID_CODE: "invalid_room_code",
  DUPLICATE_CODE: "room_code_exists",
  NOT_FOUND: "room_not_found",
  FACILITY_NOT_FOUND: "facility_not_found",
  FACILITY_MISMATCH: "facility_ownership_mismatch",
  DEPARTMENT_NOT_FOUND: "department_not_found",
  DEPARTMENT_FACILITY_MISMATCH: "department_facility_mismatch",
  ORGANIZATION_REQUIRED: "organization_required",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function mapRoom(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    facilityId: row.facility_id,
    departmentId: row.department_id || null,
    roomCode: row.room_code,
    displayName: row.display_name,
    roomType: row.room_type,
    roomTypeLabel: ROOM_TYPE_LABELS[row.room_type] || row.room_type,
    floorArea: row.floor_area || null,
    description: row.description || null,
    status: row.status,
    statusLabel: STATUS_LABELS[row.status] || row.status,
    facilityDisplayName: row.facility_display_name || null,
    facilityKey: row.facility_key || null,
    departmentDisplayName: row.department_display_name || null,
    departmentKey: row.department_key || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function trimRequired(value, max) {
  const text = String(value == null ? "" : value).trim();
  if (!text || text.length > max) return null;
  return text;
}

function trimOptional(value, max) {
  if (value == null || String(value).trim() === "") return null;
  const text = String(value).trim();
  if (text.length > max) return null;
  return text;
}

function normalizeCode(raw) {
  const text = String(raw == null ? "" : raw).trim();
  if (!CODE_RE.test(text)) return null;
  return text;
}

async function requireOrgFacility(db, { organizationId, facilityId }) {
  if (!organizationId || !UUID_RE.test(organizationId)) {
    return { ok: false, code: RESULT.ORGANIZATION_REQUIRED };
  }
  if (!facilityId || !UUID_RE.test(facilityId)) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }
  const facility = await facilityRepo.findByIdAndOrganization(db, {
    id: facilityId,
    organizationId,
  });
  if (!facility) {
    return { ok: false, code: RESULT.FACILITY_NOT_FOUND };
  }
  if (String(facility.organization_id) !== String(organizationId)) {
    return { ok: false, code: RESULT.FACILITY_MISMATCH };
  }
  return { ok: true, facility };
}

async function resolveOptionalDepartment(db, {
  organizationId,
  facilityId,
  departmentId,
}) {
  if (departmentId == null || String(departmentId).trim() === "") {
    return { ok: true, departmentId: null };
  }
  if (!UUID_RE.test(String(departmentId))) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }
  const dept = await departmentRepo.findDepartmentById(db, {
    id: departmentId,
    organizationId,
  });
  if (!dept) {
    return { ok: false, code: RESULT.DEPARTMENT_NOT_FOUND };
  }
  if (String(dept.facility_id) !== String(facilityId)) {
    return { ok: false, code: RESULT.DEPARTMENT_FACILITY_MISMATCH };
  }
  return { ok: true, departmentId: dept.id };
}

/**
 * @param {{ query: Function }} db
 * @param {object} input
 */
async function createFacilityRoom(db, input) {
  const organizationId = input && input.organizationId;
  const facilityGate = await requireOrgFacility(db, {
    organizationId,
    facilityId: input && input.facilityId,
  });
  if (!facilityGate.ok) return facilityGate;

  const displayName = trimRequired(input.displayName, 120);
  const roomCode = normalizeCode(input.roomCode);
  const roomType = String(input.roomType || "").trim();
  const status = String(input.status || "available").trim();
  const floorArea = trimOptional(input.floorArea, 120);
  const description = trimOptional(input.description, 500);

  if (!displayName) return { ok: false, code: RESULT.INVALID_INPUT };
  if (!roomCode) return { ok: false, code: RESULT.INVALID_CODE };
  if (!ROOM_TYPES.includes(roomType)) return { ok: false, code: RESULT.INVALID_TYPE };
  if (!STATUSES.includes(status)) return { ok: false, code: RESULT.INVALID_STATUS };

  const deptGate = await resolveOptionalDepartment(db, {
    organizationId,
    facilityId: facilityGate.facility.id,
    departmentId: input.departmentId,
  });
  if (!deptGate.ok) return deptGate;

  const existing = await repo.findRoomByFacilityAndCode(db, {
    facilityId: facilityGate.facility.id,
    roomCode,
    organizationId,
  });
  if (existing) return { ok: false, code: RESULT.DUPLICATE_CODE };

  const row = await repo.insertRoom(db, {
    organizationId,
    healthcareOrganizationId: facilityGate.facility.healthcare_organization_id,
    facilityId: facilityGate.facility.id,
    departmentId: deptGate.departmentId,
    roomCode,
    displayName,
    roomType,
    floorArea,
    description,
    status,
  });

  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || null,
    organizationId,
    facilityId: facilityGate.facility.id,
    actorUserId: input.actor && (input.actor.platformIdentityId || input.actor.userId),
    actionKey: "activeclinic.facility_room.created",
    metadata: {
      room_id: row.id,
      room_code: row.room_code,
      facility_id: facilityGate.facility.id,
    },
  });

  return { ok: true, code: RESULT.OK, room: mapRoom(row) };
}

async function updateFacilityRoom(db, input) {
  const organizationId = input && input.organizationId;
  if (!organizationId || !UUID_RE.test(organizationId)) {
    return { ok: false, code: RESULT.ORGANIZATION_REQUIRED };
  }
  if (!input.roomId || !UUID_RE.test(input.roomId)) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const current = await repo.findRoomById(db, {
    id: input.roomId,
    organizationId,
  });
  if (!current) return { ok: false, code: RESULT.NOT_FOUND };

  const facilityGate = await requireOrgFacility(db, {
    organizationId,
    facilityId: current.facility_id,
  });
  if (!facilityGate.ok) return facilityGate;

  const displayName = trimRequired(
    input.displayName != null ? input.displayName : current.display_name,
    120
  );
  const roomCode = normalizeCode(
    input.roomCode != null ? input.roomCode : current.room_code
  );
  const roomType = String(
    input.roomType != null ? input.roomType : current.room_type
  ).trim();
  const status = String(input.status != null ? input.status : current.status).trim();
  const floorArea =
    input.floorArea !== undefined
      ? trimOptional(input.floorArea, 120)
      : current.floor_area;
  const description =
    input.description !== undefined
      ? trimOptional(input.description, 500)
      : current.description;

  if (!displayName) return { ok: false, code: RESULT.INVALID_INPUT };
  if (!roomCode) return { ok: false, code: RESULT.INVALID_CODE };
  if (!ROOM_TYPES.includes(roomType)) return { ok: false, code: RESULT.INVALID_TYPE };
  if (!STATUSES.includes(status)) return { ok: false, code: RESULT.INVALID_STATUS };

  const deptRaw =
    input.departmentId !== undefined ? input.departmentId : current.department_id;
  const deptGate = await resolveOptionalDepartment(db, {
    organizationId,
    facilityId: current.facility_id,
    departmentId: deptRaw,
  });
  if (!deptGate.ok) return deptGate;

  if (roomCode.toLowerCase() !== String(current.room_code).toLowerCase()) {
    const clash = await repo.findRoomByFacilityAndCode(db, {
      facilityId: current.facility_id,
      roomCode,
      organizationId,
    });
    if (clash && String(clash.id) !== String(current.id)) {
      return { ok: false, code: RESULT.DUPLICATE_CODE };
    }
  }

  const row = await repo.updateRoom(db, {
    id: current.id,
    organizationId,
    facilityId: current.facility_id,
    departmentId: deptGate.departmentId,
    roomCode,
    displayName,
    roomType,
    floorArea,
    description,
    status,
  });
  if (!row) return { ok: false, code: RESULT.NOT_FOUND };

  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || null,
    organizationId,
    facilityId: current.facility_id,
    actorUserId: input.actor && (input.actor.platformIdentityId || input.actor.userId),
    actionKey: "activeclinic.facility_room.updated",
    metadata: {
      room_id: row.id,
      room_code: row.room_code,
      facility_id: current.facility_id,
    },
  });

  const hydrated = await repo.findRoomById(db, {
    id: row.id,
    organizationId,
  });
  return { ok: true, code: RESULT.OK, room: mapRoom(hydrated || row) };
}

async function getFacilityRoom(db, input) {
  const organizationId = input && input.organizationId;
  if (!organizationId || !UUID_RE.test(organizationId)) {
    return { ok: false, code: RESULT.ORGANIZATION_REQUIRED };
  }
  if (!input.roomId || !UUID_RE.test(input.roomId)) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }
  const row = await repo.findRoomById(db, {
    id: input.roomId,
    organizationId,
  });
  if (!row) return { ok: false, code: RESULT.NOT_FOUND };
  return { ok: true, code: RESULT.OK, room: mapRoom(row) };
}

async function listFacilityRooms(db, input) {
  const organizationId = input && input.organizationId;
  if (!organizationId || !UUID_RE.test(organizationId)) {
    return { ok: false, code: RESULT.ORGANIZATION_REQUIRED };
  }

  let facilityId = input.facilityId || null;
  if (facilityId) {
    const gate = await requireOrgFacility(db, { organizationId, facilityId });
    if (!gate.ok) return gate;
    facilityId = gate.facility.id;
  }

  if (input.departmentId) {
    if (!UUID_RE.test(String(input.departmentId))) {
      return { ok: false, code: RESULT.INVALID_INPUT };
    }
    const dept = await departmentRepo.findDepartmentById(db, {
      id: input.departmentId,
      organizationId,
    });
    if (!dept) return { ok: false, code: RESULT.DEPARTMENT_NOT_FOUND };
    if (facilityId && String(dept.facility_id) !== String(facilityId)) {
      return { ok: false, code: RESULT.DEPARTMENT_FACILITY_MISMATCH };
    }
  }

  const status = input.status ? String(input.status).trim() : null;
  if (status && !STATUSES.includes(status)) {
    return { ok: false, code: RESULT.INVALID_STATUS };
  }
  const roomType = input.roomType ? String(input.roomType).trim() : null;
  if (roomType && !ROOM_TYPES.includes(roomType)) {
    return { ok: false, code: RESULT.INVALID_TYPE };
  }

  const rows = await repo.listRooms(db, {
    organizationId,
    facilityId,
    departmentId: input.departmentId || null,
    status,
    roomType,
    q: input.q || null,
    limit: input.limit,
    offset: input.offset,
  });

  const counts = await repo.countRoomsByStatus(db, {
    organizationId,
    facilityId,
  });
  const metrics = {
    total: 0,
    available: 0,
    unavailable: 0,
    inactive: 0,
  };
  for (const c of counts) {
    metrics.total += c.n;
    if (c.status === "available") metrics.available = c.n;
    if (c.status === "unavailable") metrics.unavailable = c.n;
    if (c.status === "inactive") metrics.inactive = c.n;
  }

  return {
    ok: true,
    code: RESULT.OK,
    rooms: rows.map(mapRoom),
    metrics,
  };
}

module.exports = {
  ROOM_TYPES,
  ROOM_TYPE_LABELS,
  STATUSES,
  STATUS_LABELS,
  RESULT,
  mapRoom,
  createFacilityRoom,
  updateFacilityRoom,
  getFacilityRoom,
  listFacilityRooms,
};
