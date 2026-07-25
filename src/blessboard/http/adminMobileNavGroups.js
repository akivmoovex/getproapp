"use strict";

/**
 * Compact mobile drawer nav for Church HQ / Branch admin shells.
 * Desktop sidebars stay flat; this model is mobile-drawer only.
 */

/** @typedef {{ key: string, label: string, href: string, icon?: string }} AdminNavItem */

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   keys: string[],
 * }} AdminMobileNavGroupDef
 */

/**
 * @typedef {{
 *   primary: AdminNavItem[],
 *   sections: Array<{
 *     id: string,
 *     label: string,
 *     items: AdminNavItem[],
 *     open: boolean,
 *   }>,
 *   account: AdminNavItem[],
 * }} AdminMobileNavModel
 */

/** HQ: frequent links stay visible; secondary modules collapse. */
const HQ_MOBILE_NAV_CONFIG = Object.freeze({
  pinnedKeys: Object.freeze([
    "home",
    "members",
    "attendance",
    "giving",
    "broadcasts",
    "content",
  ]),
  accountKeys: Object.freeze(["account"]),
  groups: Object.freeze([
    Object.freeze({
      id: "people",
      label: "People",
      keys: Object.freeze(["registrations", "participation"]),
    }),
    Object.freeze({
      id: "communication",
      label: "Communication",
      keys: Object.freeze(["announcements"]),
    }),
    Object.freeze({
      id: "operations",
      label: "Operations",
      keys: Object.freeze(["resources", "forms", "requests"]),
    }),
    Object.freeze({
      id: "administration",
      label: "Administration",
      keys: Object.freeze([
        "branches",
        "roles",
        "settings",
        "reports",
        "executive",
        "audit",
        "governance",
      ]),
    }),
  ]),
});

/** Branch: same pattern; Website overview pinned, content/CR under Website. */
const BRANCH_MOBILE_NAV_CONFIG = Object.freeze({
  pinnedKeys: Object.freeze(["home", "members", "attendance", "giving", "website"]),
  accountKeys: Object.freeze(["account"]),
  groups: Object.freeze([
    Object.freeze({
      id: "people",
      label: "People",
      keys: Object.freeze(["registrations", "participation"]),
    }),
    Object.freeze({
      id: "communication",
      label: "Communication",
      keys: Object.freeze(["announcements"]),
    }),
    Object.freeze({
      id: "website",
      label: "Website",
      keys: Object.freeze(["content", "website_submissions"]),
    }),
    Object.freeze({
      id: "operations",
      label: "Operations",
      keys: Object.freeze(["resources", "forms", "requests"]),
    }),
    Object.freeze({
      id: "administration",
      label: "Administration",
      keys: Object.freeze(["settings"]),
    }),
  ]),
});

/**
 * Build mobile drawer model from already permission/plan-filtered nav items.
 * Omits empty groups; never duplicates a key across primary / sections / account.
 *
 * @param {ReadonlyArray<AdminNavItem>} navItems
 * @param {string} activeNav
 * @param {{
 *   pinnedKeys: ReadonlyArray<string>,
 *   accountKeys?: ReadonlyArray<string>,
 *   groups: ReadonlyArray<AdminMobileNavGroupDef>,
 * }} config
 * @returns {AdminMobileNavModel}
 */
function buildAdminMobileNavModel(navItems, activeNav, config) {
  const items = Array.isArray(navItems) ? navItems : [];
  const byKey = new Map();
  for (const item of items) {
    if (!item || !item.key || byKey.has(item.key)) continue;
    byKey.set(item.key, item);
  }

  const used = new Set();
  const active = String(activeNav || "");

  /** @param {ReadonlyArray<string>|undefined} keys */
  function take(keys) {
    const out = [];
    for (const key of keys || []) {
      if (used.has(key)) continue;
      const item = byKey.get(key);
      if (!item) continue;
      used.add(key);
      out.push(item);
    }
    return out;
  }

  const primary = take(config.pinnedKeys);
  const account = take(config.accountKeys);

  /** @type {AdminMobileNavModel["sections"]} */
  const sections = [];
  for (const group of config.groups || []) {
    const groupItems = take(group.keys);
    if (!groupItems.length) continue;
    sections.push({
      id: String(group.id),
      label: String(group.label),
      items: groupItems,
      open: groupItems.some((item) => item.key === active),
    });
  }

  const leftover = items.filter((item) => item && item.key && !used.has(item.key));
  if (leftover.length) {
    leftover.forEach((item) => used.add(item.key));
    sections.push({
      id: "more",
      label: "More",
      items: leftover,
      open: leftover.some((item) => item.key === active),
    });
  }

  // Prefer a single expanded section: the one that contains the active route.
  let sawOpen = false;
  for (const section of sections) {
    if (section.open && !sawOpen) {
      sawOpen = true;
      continue;
    }
    if (section.open && sawOpen) section.open = false;
  }

  return { primary, sections, account };
}

/**
 * @param {ReadonlyArray<AdminNavItem>} navItems
 * @param {string} activeNav
 * @returns {AdminMobileNavModel}
 */
function buildHqMobileNav(navItems, activeNav) {
  return buildAdminMobileNavModel(navItems, activeNav, HQ_MOBILE_NAV_CONFIG);
}

/**
 * @param {ReadonlyArray<AdminNavItem>} navItems
 * @param {string} activeNav
 * @returns {AdminMobileNavModel}
 */
function buildBranchMobileNav(navItems, activeNav) {
  return buildAdminMobileNavModel(navItems, activeNav, BRANCH_MOBILE_NAV_CONFIG);
}

/**
 * Flatten model keys for duplicate / coverage assertions.
 * @param {AdminMobileNavModel} model
 * @returns {string[]}
 */
function flattenMobileNavKeys(model) {
  const keys = [];
  for (const item of (model && model.primary) || []) keys.push(item.key);
  for (const section of (model && model.sections) || []) {
    for (const item of section.items || []) keys.push(item.key);
  }
  for (const item of (model && model.account) || []) keys.push(item.key);
  return keys;
}

module.exports = {
  HQ_MOBILE_NAV_CONFIG,
  BRANCH_MOBILE_NAV_CONFIG,
  buildAdminMobileNavModel,
  buildHqMobileNav,
  buildBranchMobileNav,
  flattenMobileNavKeys,
};
