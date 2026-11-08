"use strict";

const SHA_RE = /^[0-9a-f]{40}$/i;

function validateTargetSha(value) {
  const sha = String(value || "").trim();
  if (!SHA_RE.test(sha)) {
    throw new Error("target_sha must be exactly 40 hexadecimal characters");
  }
  return sha.toLowerCase();
}

function assertCheckoutMatches(targetSha, checkoutSha) {
  const target = validateTargetSha(targetSha);
  const checkout = validateTargetSha(checkoutSha);
  if (target !== checkout) {
    throw new Error("pinned checkout SHA mismatch");
  }
  return true;
}

function buildChildDispatchInputs(targetSha) {
  return { target_sha: validateTargetSha(targetSha) };
}

module.exports = {
  SHA_RE,
  validateTargetSha,
  assertCheckoutMatches,
  buildChildDispatchInputs,
};
