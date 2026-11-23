"use strict";

/**
 * Public enquiry for one resolved church.
 * The church, organization, and branch come from the route.
 * A posted church id is ignored so a visitor cannot retarget another church.
 * BlessBoard support enquiries stay on the apex /contact platform inquiry path.
 */

const { validatePublicContactBody } = require("../../church/contactSubmissionValidation");
const {
  createPublicContactSubmission,
} = require("../repositories/publicContactSubmissionsRepository");

async function submitPublicChurchEnquiry(pool, scope, body) {
  const source = scope || {};
  const organizationId = String(source.organizationId || "").trim();
  const churchId = String(source.churchId || "").trim();
  const branchId = String(source.branchId || "").trim();
  if (!organizationId || !churchId || !branchId) {
    return {
      ok: false,
      status: 404,
      error: "This church cannot receive messages right now.",
    };
  }
  const validation = validatePublicContactBody(body || {});
  if (!validation.ok) {
    return { ok: false, status: 400, error: validation.error };
  }
  if (!pool || typeof pool.query !== "function") {
    return {
      ok: false,
      status: 503,
      error: "We could not send your message right now. Please try again shortly.",
    };
  }
  const row = await createPublicContactSubmission(pool, {
    organization_id: organizationId,
    church_id: churchId,
    branch_id: branchId,
    full_name: validation.data.full_name,
    email: validation.data.email,
    phone: validation.data.phone,
    message: validation.data.message,
  });
  if (!row) {
    return {
      ok: false,
      status: 503,
      error: "We could not send your message right now. Please try again shortly.",
    };
  }
  return { ok: true, churchId, organizationId, branchId };
}

module.exports = {
  submitPublicChurchEnquiry,
};
