"use strict";

function privacyLevelLabel(level) {
  const map = {
    private_to_pastor: "Private to pastor",
    prayer_team: "Prayer team",
    anonymous_summary: "Anonymous summary",
  };
  return map[level] || level;
}

/**
 * @param {object | string | null | undefined} adminOrRole
 */
function normalizeAdmin(adminOrRole) {
  if (adminOrRole && typeof adminOrRole === "object") {
    return adminOrRole;
  }
  return { can_access_pastoral: false, can_access_safeguarding: false };
}

/**
 * @param {{ can_access_pastoral?: boolean } | null | undefined} admin
 */
function hasPastoralAccess(admin) {
  return Boolean(normalizeAdmin(admin).can_access_pastoral);
}

/**
 * @param {{ can_access_safeguarding?: boolean } | null | undefined} admin
 */
function hasSafeguardingAccess(admin) {
  return Boolean(normalizeAdmin(admin).can_access_safeguarding);
}

/**
 * @param {{ privacy_level?: string } | null} row
 */
function isConfidentialPrayer(row) {
  return row && row.privacy_level === "private_to_pastor";
}

/**
 * @param {object | null} admin
 * @param {{ privacy_level?: string } | null} row
 */
function canViewPrayerRequest(admin, row) {
  if (!row) return false;
  if (!hasPastoralAccess(admin)) return false;
  return true;
}

/**
 * @param {{ privacy_level?: string } | null} row
 * @param {object | string | null} adminOrRole
 */
function showPrayerMemberIdentity(row, adminOrRole) {
  const admin = normalizeAdmin(adminOrRole);
  if (!canViewPrayerRequest(admin, row)) return false;
  if (row.privacy_level === "anonymous_summary") return false;
  return true;
}

/**
 * @param {{ privacy_level?: string } | null} row
 * @param {object | string | null} adminOrRole
 */
function showPrayerDetails(row, adminOrRole) {
  const admin = normalizeAdmin(adminOrRole);
  if (!canViewPrayerRequest(admin, row)) return false;
  return true;
}

/**
 * @param {{ can_access_pastoral?: boolean } | null} admin
 * @param {{ visibility?: string } | null} attachment
 */
function canDownloadPastoralAttachment(admin, attachment) {
  if (!attachment) return false;
  if (attachment.visibility === "safeguarding_only") {
    return hasSafeguardingAccess(admin);
  }
  return hasPastoralAccess(admin);
}

function requirePastoralAccess(req, res, next) {
  if (hasPastoralAccess(req.churchBranchAdmin)) {
    return next();
  }
  const { wantsJson, renderChurchFailureState } = require("./churchFailureStates");
  if (wantsJson(req)) {
    return renderChurchFailureState(req, res, "forbidden", {
      shell: "branch",
      forceJson: true,
      message: "Pastoral access is required for this area.",
    });
  }
  return res.status(403).type("text").send("Pastoral access is required.");
}

function requireSafeguardingAccess(req, res, next) {
  if (hasSafeguardingAccess(req.churchBranchAdmin)) {
    return next();
  }
  const { wantsJson, renderChurchFailureState } = require("./churchFailureStates");
  if (wantsJson(req)) {
    return renderChurchFailureState(req, res, "forbidden", {
      shell: "branch",
      forceJson: true,
      message: "Safeguarding access is required.",
    });
  }
  return res.status(403).type("text").send("Safeguarding access is required.");
}

/**
 * @param {object | null} row
 * @param {{ can_access_pastoral?: boolean } | null} admin
 */
function mapPrayerRowForAdmin(row, admin) {
  if (!row) return row;
  const showIdentity = showPrayerMemberIdentity(row, admin);
  const showDetails = showPrayerDetails(row, admin);
  return {
    ...row,
    member_display_name: showIdentity ? row.member_name : "Anonymous",
    identity_masked: !showIdentity,
    details_display: showDetails ? row.details : "[Confidential — pastoral access required]",
    details_redacted: !showDetails,
    privacy_label: privacyLevelLabel(row.privacy_level),
  };
}

module.exports = {
  hasPastoralAccess,
  hasSafeguardingAccess,
  isConfidentialPrayer,
  canViewPrayerRequest,
  showPrayerMemberIdentity,
  showPrayerDetails,
  canDownloadPastoralAttachment,
  requirePastoralAccess,
  requireSafeguardingAccess,
  mapPrayerRowForAdmin,
  normalizeAdmin,
  privacyLevelLabel,
};
