"use strict";

const companiesRepo = require("../db/pg/companiesRepo");
const fieldAgentsRepo = require("../db/pg/fieldAgentsRepo");
const fieldAgentSubmissionsRepo = require("../db/pg/fieldAgentSubmissionsRepo");
/**
 * Resolve account manager + source submission for a company save.
 * When `canMutate` is false, existing row values are preserved.
 *
 * @param {import("pg").Pool} pool
 * @param {{
 *   tenantId: number,
 *   companyId: number | null,
 *   canMutate: boolean,
 *   existingRow: object | null,
 *   body: Record<string, unknown>,
 * }} p
 * @returns {Promise<{ ok: true, accountManagerFieldAgentId: number | null, sourceFieldAgentSubmissionId: number | null } | { ok: false, error: string }>}
 */
async function resolveCompanyFieldAgentLinkage(pool, p) {
  const { tenantId, companyId, canMutate, existingRow, body } = p;
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) {
    return { ok: false, error: "Invalid tenant." };
  }

  const existingAm =
    existingRow && existingRow.account_manager_field_agent_id != null
      ? Number(existingRow.account_manager_field_agent_id)
      : null;
  const existingSrc =
    existingRow && existingRow.source_field_agent_submission_id != null
      ? Number(existingRow.source_field_agent_submission_id)
      : null;

  if (!canMutate) {
    return {
      ok: true,
      accountManagerFieldAgentId: Number.isFinite(existingAm) && existingAm > 0 ? existingAm : null,
      sourceFieldAgentSubmissionId: Number.isFinite(existingSrc) && existingSrc > 0 ? existingSrc : null,
    };
  }

  const rawSrc = body.source_field_agent_submission_id;
  const rawAm = body.account_manager_field_agent_id;

  let srcId = null;
  if (rawSrc !== undefined && rawSrc !== null && String(rawSrc).trim() !== "") {
    srcId = Number(rawSrc);
    if (!Number.isFinite(srcId) || srcId < 1) {
      return { ok: false, error: "Invalid field-agent submission id." };
    }
  }

  let amOverride = null;
  if (rawAm !== undefined && rawAm !== null && String(rawAm).trim() !== "") {
    amOverride = Number(rawAm);
    if (!Number.isFinite(amOverride) || amOverride < 1) {
      return { ok: false, error: "Invalid account manager (field agent) id." };
    }
  }

  if (srcId != null) {
    const sub = await fieldAgentSubmissionsRepo.getSubmissionByIdForAdminLinkage(pool, tid, srcId);
    if (!sub) {
      return { ok: false, error: "Field-agent submission not found for this region." };
    }
    if (String(sub.status) !== "approved") {
      return { ok: false, error: "Only approved field-agent submissions can be linked." };
    }
    const otherId = await companiesRepo.findCompanyIdBySourceSubmissionExcluding(pool, tid, srcId, companyId);
    if (otherId != null) {
      return { ok: false, error: "That submission is already linked to another listing." };
    }
    const defaultAgent = Number(sub.field_agent_id);
    const targetAm = amOverride != null ? amOverride : defaultAgent;
    const fa = await fieldAgentsRepo.getByIdAndTenant(pool, targetAm, tid);
    if (!fa) {
      return { ok: false, error: "Account manager must be a field agent in this region." };
    }
    return {
      ok: true,
      accountManagerFieldAgentId: targetAm,
      sourceFieldAgentSubmissionId: srcId,
    };
  }

  if (amOverride != null) {
    const fa = await fieldAgentsRepo.getByIdAndTenant(pool, amOverride, tid);
    if (!fa) {
      return { ok: false, error: "Account manager must be a field agent in this region." };
    }
    return {
      ok: true,
      accountManagerFieldAgentId: amOverride,
      sourceFieldAgentSubmissionId: null,
    };
  }

  return {
    ok: true,
    accountManagerFieldAgentId: null,
    sourceFieldAgentSubmissionId: null,
  };
}

module.exports = {
  resolveCompanyFieldAgentLinkage,
};
