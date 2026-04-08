"use strict";

const bcrypt = require("bcryptjs");
const fieldAgentsRepo = require("../db/pg/fieldAgentsRepo");
const { TENANT_ZM } = require("../tenants/tenantIds");

/**
 * Idempotent default field agent account (separate from admin_users).
 * Username field_user / password 1234 on Zambia tenant — for demo and first deploy.
 * Set SEED_FIELD_AGENT_USER=0 to skip.
 * @param {import("pg").Pool} pool
 */
async function seedFieldAgentUser(pool) {
  if (process.env.SEED_FIELD_AGENT_USER === "0") return;

  const agents = [
    { username: "field_user", displayName: "Field user" },
    { username: "field_agent", displayName: "Field agent" },
  ];
  for (const a of agents) {
    const existing = await fieldAgentsRepo.getByUsernameAndTenant(pool, a.username, TENANT_ZM);
    if (existing) continue;
    try {
      const passwordHash = await bcrypt.hash("1234", 12);
      await fieldAgentsRepo.insertAgent(pool, {
        tenantId: TENANT_ZM,
        username: a.username,
        passwordHash,
        displayName: a.displayName,
        phone: "",
      });
      // eslint-disable-next-line no-console
      console.log(`[getpro] Seeded field agent user: ${a.username} (Zambia)`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[getpro] seedFieldAgentUser:", e && e.message ? e.message : e);
    }
  }
}

module.exports = { seedFieldAgentUser };
