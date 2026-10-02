"use strict";

/**
 * Branch mini-sites excluded from sitemap.xml.
 *
 * A branch is excluded when it opted out of sitemap inclusion or is forced
 * noindex. Both are per-branch overrides in blessboard.website_scope_settings,
 * so this is two queries per sitemap request regardless of branch count.
 */

const repo = require("../repositories/websiteScopeSettingsRepository");
const registry = require("./websiteSettingKeyRegistry");

function overrideValue(row) {
  if (!row || row.inheritanceState === "hidden") return null;
  return registry.fromValueJson(row.valueJson);
}

function truthyOverride(row) {
  return overrideValue(row) === true;
}

function falseyOverride(row) {
  return overrideValue(row) === false;
}

/**
 * @param {{ query: Function }} db
 * @param {{ churchId: string, activeBranches?: Array<{ id?: string, key?: string }> }} input
 * @returns {Promise<Set<string>>} branch keys to exclude
 */
async function resolveSitemapExcludedBranchKeys(db, input) {
  const excluded = new Set();
  const branches = Array.isArray(input && input.activeBranches) ? input.activeBranches : [];
  const churchId = input && input.churchId;
  if (!db || !churchId || !branches.length) return excluded;

  const byId = new Map();
  for (const branch of branches) {
    if (branch && branch.id && branch.key) byId.set(String(branch.id), String(branch.key));
  }
  if (!byId.size) return excluded;

  let sitemapRows = [];
  let noindexRows = [];
  try {
    [sitemapRows, noindexRows] = await Promise.all([
      repo.listActiveForChurchByKey(db, { churchId, settingKey: "seo.sitemap_include" }),
      repo.listActiveForChurchByKey(db, { churchId, settingKey: "seo.noindex" }),
    ]);
  } catch {
    // Discovery must not fail because of a settings read; fall back to inclusion.
    return excluded;
  }

  for (const row of sitemapRows) {
    if (!falseyOverride(row)) continue;
    const key = byId.get(String(row.branchId));
    if (key) excluded.add(key);
  }
  for (const row of noindexRows) {
    if (!truthyOverride(row)) continue;
    const key = byId.get(String(row.branchId));
    if (key) excluded.add(key);
  }

  return excluded;
}

module.exports = {
  resolveSitemapExcludedBranchKeys,
};
