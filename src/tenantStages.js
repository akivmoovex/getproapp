/** Tenant lifecycle for public site + admin. */
const STAGES = {
  PARTNER_COLLECTION: "PartnerCollection",
  ENABLED: "Enabled",
  DISABLED: "Disabled",
};

const ALL_STAGES = Object.values(STAGES);

function normalizeStage(s) {
  const v = String(s || "").trim();
  return ALL_STAGES.includes(v) ? v : STAGES.ENABLED;
}

/** Only Enabled tenants appear on the public site and accept traffic. */
function isPubliclyVisible(stage) {
  return normalizeStage(stage) === STAGES.ENABLED;
}

module.exports = { STAGES, ALL_STAGES, normalizeStage, isPubliclyVisible };
