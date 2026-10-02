"use strict";

/**
 * ActiveClinic facility rooms repository (ACN27).
 * Always organization-scoped. Room codes unique per facility only.
 */

async function insertRoom(db, row) {
  const r = await db.query(
    `INSERT INTO activeclinic.facility_rooms (
       organization_id, healthcare_organization_id, facility_id, department_id,
       room_code, display_name, room_type, floor_area, description, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      row.organizationId,
      row.healthcareOrganizationId,
      row.facilityId,
      row.departmentId || null,
      row.roomCode,
      row.displayName,
      row.roomType,
      row.floorArea || null,
      row.description || null,
      row.status || "available",
    ]
  );
  return r.rows[0] || null;
}

async function updateRoom(db, row) {
  const r = await db.query(
    `UPDATE activeclinic.facility_rooms
        SET department_id = $4,
            room_code = $5,
            display_name = $6,
            room_type = $7,
            floor_area = $8,
            description = $9,
            status = $10,
            updated_at = now()
      WHERE id = $1
        AND organization_id = $2
        AND facility_id = $3
      RETURNING *`,
    [
      row.id,
      row.organizationId,
      row.facilityId,
      row.departmentId || null,
      row.roomCode,
      row.displayName,
      row.roomType,
      row.floorArea || null,
      row.description || null,
      row.status,
    ]
  );
  return r.rows[0] || null;
}

async function findRoomById(db, { id, organizationId }) {
  const r = await db.query(
    `SELECT r.*,
            f.display_name AS facility_display_name,
            f.facility_key AS facility_key,
            d.display_name AS department_display_name,
            d.department_key AS department_key
       FROM activeclinic.facility_rooms r
       JOIN activeclinic.facilities f
         ON f.id = r.facility_id
        AND f.organization_id = r.organization_id
       LEFT JOIN activeclinic.departments d
         ON d.id = r.department_id
        AND d.organization_id = r.organization_id
      WHERE r.id = $1
        AND r.organization_id = $2
      LIMIT 1`,
    [id, organizationId]
  );
  return r.rows[0] || null;
}

async function findRoomByFacilityAndCode(db, { facilityId, roomCode, organizationId }) {
  const r = await db.query(
    `SELECT * FROM activeclinic.facility_rooms
      WHERE facility_id = $1
        AND lower(room_code) = lower($2)
        AND organization_id = $3
      LIMIT 1`,
    [facilityId, roomCode, organizationId]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} db
 * @param {{
 *   organizationId: string,
 *   facilityId?: string|null,
 *   departmentId?: string|null,
 *   status?: string|null,
 *   roomType?: string|null,
 *   q?: string|null,
 *   limit?: number,
 *   offset?: number,
 * }} input
 */
async function listRooms(db, input) {
  const params = [input.organizationId];
  const where = ["r.organization_id = $1"];

  if (input.facilityId) {
    params.push(input.facilityId);
    where.push(`r.facility_id = $${params.length}`);
  }
  if (input.departmentId) {
    params.push(input.departmentId);
    where.push(`r.department_id = $${params.length}`);
  }
  if (input.status) {
    params.push(input.status);
    where.push(`r.status = $${params.length}`);
  }
  if (input.roomType) {
    params.push(input.roomType);
    where.push(`r.room_type = $${params.length}`);
  }
  if (input.q && String(input.q).trim()) {
    params.push(`%${String(input.q).trim().toLowerCase()}%`);
    where.push(
      `(lower(r.display_name) LIKE $${params.length} OR lower(r.room_code) LIKE $${params.length} OR lower(coalesce(r.floor_area,'')) LIKE $${params.length})`
    );
  }

  const limit = Math.min(Math.max(Number(input.limit) || 100, 1), 200);
  const offset = Math.max(Number(input.offset) || 0, 0);
  params.push(limit);
  params.push(offset);

  const r = await db.query(
    `SELECT r.*,
            f.display_name AS facility_display_name,
            f.facility_key AS facility_key,
            d.display_name AS department_display_name,
            d.department_key AS department_key
       FROM activeclinic.facility_rooms r
       JOIN activeclinic.facilities f
         ON f.id = r.facility_id
        AND f.organization_id = r.organization_id
       LEFT JOIN activeclinic.departments d
         ON d.id = r.department_id
        AND d.organization_id = r.organization_id
      WHERE ${where.join(" AND ")}
      ORDER BY r.display_name ASC, r.room_code ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return r.rows;
}

async function countRoomsByStatus(db, { organizationId, facilityId }) {
  const params = [organizationId];
  let sql = `SELECT status, count(*)::int AS n
               FROM activeclinic.facility_rooms
              WHERE organization_id = $1`;
  if (facilityId) {
    params.push(facilityId);
    sql += ` AND facility_id = $2`;
  }
  sql += ` GROUP BY status`;
  const r = await db.query(sql, params);
  return r.rows;
}

module.exports = {
  insertRoom,
  updateRoom,
  findRoomById,
  findRoomByFacilityAndCode,
  listRooms,
  countRoomsByStatus,
};
