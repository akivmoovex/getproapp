"use strict";

const { createCrmTaskFromEvent } = require("../crm/crmAutoTasks");

async function notifyProviderSubmissionToCrm({ tenantId, submissionId, title, description }) {
  return createCrmTaskFromEvent({
    tenantId,
    title,
    description,
    sourceType: "field_agent_provider",
    sourceRefId: submissionId,
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
  notifyCallbackLeadToCrm,
};
