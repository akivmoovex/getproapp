"use strict";

/**
 * ActiveClinic facility departments repository.
 */

async function insertDepartment(db, row) {
  const r = await db.query(
    `INSERT INTO activeclinic.departments (
       organization_id, healthcare_organization_id, facility_id,
       department_key, department_type, display_name, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      row.organizationId,
      row.healthcareOrganizationId,
      row.facilityId,
      row.departmentKey,
      row.departmentType,
      row.displayName,
      row.status || "active",
    ]
  );
  return r.rows[0] || null;
}

async function findDepartmentById(db, { id, organizationId }) {
  const r = await db.query(
    `SELECT * FROM activeclinic.departments
      WHERE id = $1 AND organization_id = $2
      LIMIT 1`,
    [id, organizationId]
  );
  return r.rows[0] || null;
}

async function findDepartmentByFacilityAndKey(db, { facilityId, departmentKey, organizationId }) {
  const r = await db.query(
    `SELECT * FROM activeclinic.departments
      WHERE facility_id = $1 AND department_key = $2 AND organization_id = $3
      LIMIT 1`,
    [facilityId, departmentKey, organizationId]
  );
  return r.rows[0] || null;
}

async function listDepartmentsByFacility(db, { facilityId, organizationId, status }) {
  const params = [facilityId, organizationId];
  let sql = `SELECT d.*, f.display_name AS facility_display_name, f.facility_key
               FROM activeclinic.departments d
               JOIN activeclinic.facilities f ON f.id = d.facility_id
              WHERE d.facility_id = $1 AND d.organization_id = $2`;
  if (status) {
    params.push(status);
    sql += ` AND d.status = $${params.length}`;
  }
  sql += ` ORDER BY d.department_type, d.display_name`;
  const r = await db.query(sql, params);
  return r.rows;
}

async function listDepartmentsByOrganization(db, { organizationId, facilityId, status }) {
  const params = [organizationId];
  let sql = `SELECT d.*, f.display_name AS facility_display_name, f.facility_key
               FROM activeclinic.departments d
               JOIN activeclinic.facilities f ON f.id = d.facility_id
              WHERE d.organization_id = $1`;
  if (facilityId) {
    params.push(facilityId);
    sql += ` AND d.facility_id = $${params.length}`;
  }
  if (status) {
    params.push(status);
    sql += ` AND d.status = $${params.length}`;
  }
  sql += ` ORDER BY f.display_name, d.department_type, d.display_name`;
  const r = await db.query(sql, params);
  return r.rows;
}

async function listActiveDepartmentTypesForFacility(db, { facilityId, organizationId }) {
  const r = await db.query(
    `SELECT DISTINCT department_type
       FROM activeclinic.departments
      WHERE facility_id = $1
        AND organization_id = $2
        AND status = 'active'
      ORDER BY department_type`,
    [facilityId, organizationId]
  );
  return r.rows.map((row) => row.department_type);
}

async function hasActiveDepartmentOfType(db, { facilityId, organizationId, departmentType }) {
  const r = await db.query(
    `SELECT 1
       FROM activeclinic.departments
      WHERE facility_id = $1
        AND organization_id = $2
        AND department_type = $3
        AND status = 'active'
      LIMIT 1`,
    [facilityId, organizationId, departmentType]
  );
  return r.rowCount > 0;
}

async function updateDepartment(db, { id, organizationId, displayName, status }) {
  const sets = [];
  const params = [];
  if (displayName != null) {
    params.push(displayName);
    sets.push(`display_name = $${params.length}`);
  }
  if (status != null) {
    params.push(status);
    sets.push(`status = $${params.length}`);
  }
  if (!sets.length) {
    return findDepartmentById(db, { id, organizationId });
  }
  params.push(id, organizationId);
  const r = await db.query(
    `UPDATE activeclinic.departments
        SET ${sets.join(", ")}
      WHERE id = $${params.length - 1} AND organization_id = $${params.length}
      RETURNING *`,
    params
  );
  return r.rows[0] || null;
}

async function upsertDepartmentByKey(db, row) {
  const existing = await findDepartmentByFacilityAndKey(db, {
    facilityId: row.facilityId,
    departmentKey: row.departmentKey,
    organizationId: row.organizationId,
  });
  if (existing) {
    if (
      existing.display_name === row.displayName &&
      existing.department_type === row.departmentType &&
      existing.status === (row.status || "active")
    ) {
      return { row: existing, created: false, updated: false };
    }
    const updated = await db.query(
      `UPDATE activeclinic.departments
          SET display_name = $1,
              department_type = $2,
              status = $3
        WHERE id = $4 AND organization_id = $5
        RETURNING *`,
      [
        row.displayName,
        row.departmentType,
        row.status || "active",
        existing.id,
        row.organizationId,
      ]
    );
    return { row: updated.rows[0], created: false, updated: true };
  }
  const inserted = await insertDepartment(db, row);
  return { row: inserted, created: true, updated: false };
}

module.exports = {
  insertDepartment,
  findDepartmentById,
  findDepartmentByFacilityAndKey,
  listDepartmentsByFacility,
  listDepartmentsByOrganization,
  listActiveDepartmentTypesForFacility,
  hasActiveDepartmentOfType,
  updateDepartment,
  upsertDepartmentByKey,
};
