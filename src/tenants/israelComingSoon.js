/**
 * When true, il.* shows the coming-soon page and API blocks Israel tenant actions.
 * Set ISRAEL_COMING_SOON=true in env. Omit or set to anything else for full il.* parity with zm.*.
 */
function israelComingSoonEnabled() {
  return process.env.ISRAEL_COMING_SOON === "true";
}

module.exports = { israelComingSoonEnabled };
