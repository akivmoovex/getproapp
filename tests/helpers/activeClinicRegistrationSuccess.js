"use strict";

const assert = require("node:assert/strict");

/**
 * Post-provision clinic registration redirect (V2.05 Batch 1).
 * Authenticated administrators land on /app — not the success/Website Management detour.
 */
function assertClinicReadyAppRedirect(location) {
  const loc = String(location || "");
  assert.match(loc, /^\/app(?:\?|$)/, loc);
  assert.doesNotMatch(loc, /register-clinic\/success/, loc);
  assert.doesNotMatch(loc, /review=1/, loc);
  assert.doesNotMatch(loc, /^\/register-clinic\?/, loc);
  assert.doesNotMatch(loc, /^\/login(?:\?|$)/, loc);
  assert.doesNotMatch(loc, /\/app\/settings\/website/, loc);
}

/**
 * Resolve stored public registration reference for optional success-page visits.
 * @param {{ query: Function }} pool
 * @param {string} email
 * @returns {Promise<string|null>}
 */
async function loadClinicPublicRegistrationReference(pool, email) {
  const r = await pool.query(
    `SELECT application_number
       FROM activeclinic.clinic_registration_applications
      WHERE contact_email_normalized = lower(trim($1))`,
    [String(email || "")]
  );
  const ref = r.rows[0] && r.rows[0].application_number;
  return ref ? String(ref) : null;
}

/**
 * @param {string} reference
 * @returns {string}
 */
function buildClinicReadySuccessPath(reference) {
  const ref = String(reference || "").trim();
  assert.ok(ref, "public registration reference required");
  return `/register-clinic/success?ref=${encodeURIComponent(ref)}&ready=1`;
}

module.exports = {
  assertClinicReadyAppRedirect,
  loadClinicPublicRegistrationReference,
  buildClinicReadySuccessPath,
};
