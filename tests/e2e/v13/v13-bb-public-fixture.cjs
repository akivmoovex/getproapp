"use strict";

/**
 * Publish the existing synthetic BlessBoard churches through the product
 * publish service so browser public pages can render. Does not set
 * website_status with a direct status update.
 */

const { Pool } = require("pg");
const { provisionEmptyPublicPages } = require("../../../src/blessboard/services/publicContentAdminService");
const { publishChurchWebsite } = require("../../../src/blessboard/services/churchWebsitePublishService");

const DATABASE = "getpro_v13_e2e_g78d2301";
const CHURCHES = [
  { key: "v13d19-church-a", publicName: "V13 D19 Church A" },
  { key: "v13d19-church-b", publicName: "V13 D19 Church B" },
];

function connectionConfig(env) {
  const connectionString = String(env.E2E_DATABASE_URL || env.DATABASE_URL || "");
  if (!connectionString.includes("127.0.0.1:55432") || !connectionString.includes(DATABASE)) {
    throw new Error("V13_BB_FIXTURE: refusing a database that is not the authorized disposable instance");
  }
  if (connectionString.includes(":5432/") || connectionString.includes("getpro_v13_e2e_regression213101")) {
    throw new Error("V13_BB_FIXTURE: refusing the shared or existing regression database");
  }
  return {
    connectionString,
    password: String(env.PGPASSWORD || ""),
    ssl: false,
    max: 1,
  };
}

async function assertIdentity(pool) {
  const live = await pool.query(
    `SELECT current_database() AS db, inet_server_port() AS port,
            (SELECT environment_code FROM platform.database_identity) AS environment_code,
            (SELECT database_name FROM platform.database_identity) AS identity_db`
  );
  const row = live.rows[0];
  if (row.db !== DATABASE || Number(row.port) !== 55432) {
    throw new Error("V13_BB_FIXTURE: database identity mismatch");
  }
  if (row.environment_code !== "testing" || row.identity_db !== DATABASE) {
    throw new Error("V13_BB_FIXTURE: testing identity mismatch");
  }
}

async function ensureSyntheticChurchesPublished(env) {
  const pool = new Pool(connectionConfig(env));
  try {
    await assertIdentity(pool);
    for (const church of CHURCHES) {
      const found = await pool.query(
        `SELECT c.id AS church_id, o.id AS organization_id, s.website_status, s.primary_email
           FROM platform.organizations o
           JOIN blessboard.churches c ON c.organization_id = o.id
           LEFT JOIN blessboard.church_settings s ON s.church_id = c.id
          WHERE o.organization_key = $1`,
        [church.key]
      );
      const row = found.rows[0];
      if (!row) continue;
      if (!row.website_status) {
        await pool.query(
          `INSERT INTO blessboard.church_settings (church_id, public_name, primary_email)
           VALUES ($1, $2, $3)
           ON CONFLICT (church_id) DO NOTHING`,
          [row.church_id, church.publicName, `office.${church.key}@example.invalid`]
        );
      } else if (!row.primary_email) {
        await pool.query(
          `UPDATE blessboard.church_settings
              SET primary_email = $2, updated_at = now()
            WHERE church_id = $1 AND primary_email IS NULL`,
          [row.church_id, `office.${church.key}@example.invalid`]
        );
      }
      if (row.website_status === "published") continue;
      const pages = await provisionEmptyPublicPages(pool, { churchId: row.church_id });
      if (!pages.ok) {
        throw new Error(`V13_BB_FIXTURE: public pages for ${church.key} were not provisioned (${pages.reason || "unknown"})`);
      }
      const published = await publishChurchWebsite(pool, {
        churchId: row.church_id,
        organizationId: row.organization_id,
        confirmPublish: true,
        deferServiceTimes: true,
        env,
      });
      if (!published.ok) {
        const gaps = Array.isArray(published.gaps) ? published.gaps.map((gap) => gap.code || gap).join(",") : "";
        throw new Error(`V13_BB_FIXTURE: publish ${church.key} returned ${published.reason || "not_ready"}${gaps ? ` (${gaps})` : ""}`);
      }
    }
  } finally {
    await pool.end();
  }
}

module.exports = { ensureSyntheticChurchesPublished };
