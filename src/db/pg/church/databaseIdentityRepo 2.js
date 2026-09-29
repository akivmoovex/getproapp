"use strict";

/**
 * Singleton database identity (public.church_database_identity).
 *
 * Lets the running app prove which PostgreSQL environment it is connected to.
 * Never logs or returns credentials — only the sanitized identity fields.
 * See db/postgres/121_church_database_identity.sql and
 * scripts/init-church-database-identity.js.
 */

const RELATION_MISSING = "42P01";

const IDENTITY_ENVIRONMENTS = Object.freeze(["testing", "production"]);

function mapRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    environmentCode: row.environment_code,
    deploymentName: row.deployment_name || null,
    databaseInstanceId: row.database_instance_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Reads the singleton identity row (id = 1) or null when unset.
 * Treats a missing table as "no identity" (null) so startup can report it cleanly;
 * connection/other errors propagate to the caller.
 * @param {import("pg").Pool} pool
 * @returns {Promise<null | { id:number, environmentCode:string, deploymentName:string|null, databaseInstanceId:string, createdAt:any, updatedAt:any }>}
 */
async function getDatabaseIdentity(pool) {
  if (!pool) return null;
  try {
    const r = await pool.query(
      `SELECT id, environment_code, deployment_name, database_instance_id, created_at, updated_at
         FROM public.church_database_identity
        WHERE id = 1
        LIMIT 1`
    );
    return mapRow(r.rows[0] || null);
  } catch (err) {
    if (err && err.code === RELATION_MISSING) return null;
    throw err;
  }
}

/**
 * Inserts the singleton identity row. Fails (unique/check violation) if a row already exists.
 * Never overwrites — callers must decide overwrite policy explicitly.
 * @param {import("pg").Pool} pool
 * @param {{ environmentCode: string, deploymentName?: string|null, databaseInstanceId: string }} input
 */
async function insertDatabaseIdentity(pool, input) {
  const environmentCode = String(input && input.environmentCode || "").trim().toLowerCase();
  if (!IDENTITY_ENVIRONMENTS.includes(environmentCode)) {
    throw new Error(`Invalid environment_code (expected one of: ${IDENTITY_ENVIRONMENTS.join(", ")}).`);
  }
  const databaseInstanceId = String(input && input.databaseInstanceId || "").trim();
  if (!databaseInstanceId) {
    throw new Error("database_instance_id is required.");
  }
  const deploymentName =
    input && input.deploymentName != null && String(input.deploymentName).trim() !== ""
      ? String(input.deploymentName).trim().slice(0, 120)
      : null;

  const r = await pool.query(
    `INSERT INTO public.church_database_identity
       (id, environment_code, deployment_name, database_instance_id)
     VALUES (1, $1, $2, $3::uuid)
     RETURNING id, environment_code, deployment_name, database_instance_id, created_at, updated_at`,
    [environmentCode, deploymentName, databaseInstanceId]
  );
  return mapRow(r.rows[0]);
}

module.exports = {
  IDENTITY_ENVIRONMENTS,
  getDatabaseIdentity,
  insertDatabaseIdentity,
};
