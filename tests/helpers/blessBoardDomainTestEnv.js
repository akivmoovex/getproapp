"use strict";

/**
 * Env-driven BlessBoard domain/redirect tests must not be overridden by an
 * authoritative PLATFORM_DEPLOYMENT_CODE (e.g. prod-safe runner's
 * blessboard-com-production). Production profile truth is .com-only apex;
 * dual-TLD / .org matrix cases intentionally clear the profile.
 */

const PROFILE_ENV_KEYS = Object.freeze(["PLATFORM_DEPLOYMENT_CODE"]);

function withoutAuthoritativeDeploymentProfile(fn) {
  const prev = {};
  for (const key of PROFILE_ENV_KEYS) prev[key] = process.env[key];
  for (const key of PROFILE_ENV_KEYS) delete process.env[key];
  try {
    return fn();
  } finally {
    for (const key of PROFILE_ENV_KEYS) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

async function withoutAuthoritativeDeploymentProfileAsync(fn) {
  const prev = {};
  for (const key of PROFILE_ENV_KEYS) prev[key] = process.env[key];
  for (const key of PROFILE_ENV_KEYS) delete process.env[key];
  try {
    return await fn();
  } finally {
    for (const key of PROFILE_ENV_KEYS) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

module.exports = {
  withoutAuthoritativeDeploymentProfile,
  withoutAuthoritativeDeploymentProfileAsync,
};
