"use strict";

const assert = require("node:assert/strict");

/**
 * Post-provision church registration redirect (V2.04).
 * Authenticated administrators land on HQ — not the success/editor detour.
 */
function assertChurchReadyHqRedirect(location) {
  const loc = String(location || "");
  assert.match(loc, /^\/hq(?:\?|$)/, loc);
  assert.doesNotMatch(loc, /register-church\/success/, loc);
  assert.doesNotMatch(loc, /review=1/, loc);
  assert.doesNotMatch(loc, /^\/register-church\?/, loc);
  assert.doesNotMatch(loc, /^\/login(?:\?|$)/, loc);
}

/** @deprecated Alias — prefer assertChurchReadyHqRedirect */
function assertChurchReadySuccessRedirect(location) {
  return assertChurchReadyHqRedirect(location);
}

/**
 * Resolve stored public registration reference for optional success-page visits.
 * @param {{ query: Function }} pool
 * @param {string} email
 * @returns {Promise<string|null>}
 */
async function loadPublicRegistrationReference(pool, email) {
  const r = await pool.query(
    `SELECT public_registration_reference
       FROM blessboard.platform_church_registration_applications
      WHERE lower(contact_email) = lower($1)`,
    [String(email || "")]
  );
  const ref = r.rows[0] && r.rows[0].public_registration_reference;
  return ref ? String(ref) : null;
}

/**
 * @param {string} reference
 * @returns {string}
 */
function buildChurchReadySuccessPath(reference) {
  const ref = String(reference || "").trim();
  assert.ok(ref, "public registration reference required");
  return `/register-church/success?ref=${encodeURIComponent(ref)}&ready=1`;
}

module.exports = {
  assertChurchReadyHqRedirect,
  assertChurchReadySuccessRedirect,
  loadPublicRegistrationReference,
  buildChurchReadySuccessPath,
};
