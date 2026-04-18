"use strict";

const { getPgPool } = require("../db/pg");
const crmTasksRepo = require("../db/pg/crmTasksRepo");
const { createCrmTaskFromEvent } = require("../crm/crmAutoTasks");

const WEBSITE_LISTING_CRM_SOURCE = "field_agent_website_listing";

async function notifyProviderSubmissionToCrm({ tenantId, submissionId, title, description }) {
  return createCrmTaskFromEvent({
    tenantId,
    title,
    description,
    sourceType: "field_agent_provider",
    sourceRefId: submissionId,
  });
}

/**
 * Staff workflow: call provider, review/edit draft, publish listing. Idempotent per submission.
 * @param {{ tenantId: number, submissionId: number, title: string, description: string }} p
 * @returns {Promise<number | null>} CRM task id (new or existing)
 */
async function notifyWebsiteListingReviewToCrm(p) {
  const pool = getPgPool();
  const sid = Number(p.submissionId);
  const tid = Number(p.tenantId);
  if (!Number.isFinite(sid) || sid < 1 || !Number.isFinite(tid) || tid < 1) return null;
  const existing = await crmTasksRepo.findInboundTaskIdBySourceRef(pool, {
    tenantId: tid,
    sourceType: WEBSITE_LISTING_CRM_SOURCE,
    sourceRefId: sid,
  });
  if (existing != null) return existing;
  return createCrmTaskFromEvent({
    tenantId: tid,
    title: p.title,
    description: p.description,
    sourceType: WEBSITE_LISTING_CRM_SOURCE,
    sourceRefId: sid,
  });
}

async function notifyCallbackLeadToCrm({ tenantId, leadId, title, description }) {
  return createCrmTaskFromEvent({
    tenantId,
    title,
    description,
    sourceType: "field_agent_callback",
    sourceRefId: leadId,
  });
}

module.exports = {
  notifyProviderSubmissionToCrm,
  notifyWebsiteListingReviewToCrm,
  notifyCallbackLeadToCrm,
  WEBSITE_LISTING_CRM_SOURCE,
};
