"use strict";

/**
 * Build a compact BlessBoard tenant context from platform + catalogue diagnostics.
 * Never attaches raw rows. Returns null when required pieces are missing.
 *
 * @param {{
 *   organization?: { id?: string, key?: string } | null,
 *   church?: {
 *     id?: string,
 *     churchKey?: string,
 *     displayName?: string,
 *     dataEnvironment?: string | null,
 *   } | null,
 *   hqBranch?: {
 *     id?: string,
 *     branchKey?: string,
 *     displayName?: string,
 *   } | null,
 *   primaryBranch?: {
 *     id?: string,
 *     branchKey?: string,
 *     displayName?: string,
 *   } | null,
 * }} parts
 * @returns {object | null}
 */
function buildBlessBoardTenantContext(parts) {
  const source = parts && typeof parts === "object" ? parts : {};
  const org = source.organization;
  const church = source.church;
  const hqBranch = source.hqBranch;
  const primaryBranch = source.primaryBranch;

  if (!org || !org.id || !church || !church.id || !hqBranch || !hqBranch.id || !primaryBranch || !primaryBranch.id) {
    return null;
  }

  return {
    resolved: true,
    organization: {
      id: org.id,
      key: org.key || null,
    },
    church: {
      id: church.id,
      key: church.churchKey || null,
      displayName: church.displayName || "",
      dataEnvironment: church.dataEnvironment || null,
    },
    hqBranch: {
      id: hqBranch.id,
      key: hqBranch.branchKey || null,
      displayName: hqBranch.displayName || "",
    },
    primaryBranch: {
      id: primaryBranch.id,
      key: primaryBranch.branchKey || null,
      displayName: primaryBranch.displayName || "",
    },
  };
}

module.exports = {
  buildBlessBoardTenantContext,
};
