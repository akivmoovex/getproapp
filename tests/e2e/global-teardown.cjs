"use strict";

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { cleanupPilotOrganization } = require("../helpers/churchPilotSmokeFixtures");

const STATE_PATH = path.join(__dirname, ".foundation-e2e-state.json");

module.exports = async function globalTeardown() {
  if (!fs.existsSync(STATE_PATH)) return;
  const state = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  const databaseUrl = String(process.env.E2E_DATABASE_URL || "").trim();
  if (!databaseUrl || !state.slugPrefix) {
    fs.rmSync(STATE_PATH, { force: true });
    return;
  }

  const ssl =
    String(process.env.GETPRO_PG_SSL || "off").toLowerCase() === "off"
      ? false
      : { rejectUnauthorized: false };
  const client = new Client({ connectionString: databaseUrl, ssl });
  await client.connect();
  try {
    const identity = await client.query(
      `SELECT environment_code FROM public.church_database_identity WHERE id = 1`
    );
    if (identity.rows[0]?.environment_code !== "testing") {
      throw new Error("Refusing E2E cleanup: database identity is not testing.");
    }

    const orgs = await client.query(
      `SELECT id FROM public.church_organizations WHERE slug LIKE $1`,
      [`${state.slugPrefix}%`]
    );
    for (const row of orgs.rows) {
      await cleanupPilotOrganization(client, row.id);
    }
  } finally {
    await client.end();
    fs.rmSync(STATE_PATH, { force: true });
  }
};
