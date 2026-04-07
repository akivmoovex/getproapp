/**
 * Auto-create tenant CRM tasks for inbound events (join signups, callbacks, company leads).
 * Tasks are unassigned (owner_id NULL) and status "new" so they appear in the New column + Unassigned sidebar.
 */

const { getPgPool } = require("../db/pg");
const crmTasksRepo = require("../db/pg/crmTasksRepo");

/**
 * @param {{ tenantId: number, title: string, description: string, sourceType: string, sourceRefId: number | null }} payload
 * @returns {Promise<number | null>}
 */
async function createCrmTaskFromEvent({ tenantId, title, description, sourceType, sourceRefId }) {
  const pool = getPgPool();
  return crmTasksRepo.insertFromInboundEvent(pool, {
    tenantId,
    title,
    description,
    sourceType,
    sourceRefId,
  });
}

module.exports = { createCrmTaskFromEvent };
