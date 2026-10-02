"use strict";

/**
 * Shared Admin Console shell contract (V2.05 Task 2 / Batch 2).
 * Geometry + navigation slot order are shared; product tokens stay separate.
 */

const ADMIN_CONSOLE_SLOTS = Object.freeze([
  { key: "dashboard", label: "Dashboard", order: 1 },
  { key: "website", label: "Website", order: 2 },
  { key: "content", label: "Content", order: 3 },
  { key: "people", label: "People", order: 4 },
  { key: "operations", label: "Operations", order: 5 },
  { key: "locations", label: "Locations", order: 6 },
  { key: "media", label: "Media", order: 7 },
  { key: "reports", label: "Reports", order: 8 },
  { key: "access", label: "Access", order: 9 },
  { key: "settings", label: "Settings", order: 10 },
]);

const ADMIN_CONSOLE_SLOT_ORDER = Object.freeze(
  ADMIN_CONSOLE_SLOTS.map((s) => s.key)
);

const ADMIN_CONSOLE_SHELL = Object.freeze({
  pattern: "AdminConsoleShell",
  sidebarWidth: "16.5rem",
  desktopBreakpoint: 1440,
  mobileBreakpoint: 390,
  defaultNavKey: "home",
  websiteSlotOrder: 2,
  stitchScreens: Object.freeze({
    activeclinic: "AC-ADM-01",
    blessboard: "BB-ADM-01",
  }),
  supportsActiveNav: true,
  supportsRoleHiddenItems: true,
  supportsLocationContext: true,
  supportsBranchContext: true,
});

/**
 * Product Stitch screen id for the Admin Console shell home surface.
 * @param {string} productCode
 * @returns {string|null}
 */
function adminConsoleStitchScreen(productCode) {
  const code = String(productCode || "")
    .trim()
    .toLowerCase();
  return ADMIN_CONSOLE_SHELL.stitchScreens[code] || null;
}

/**
 * @param {string|null|undefined} slot
 * @returns {number}
 */
function slotSortIndex(slot) {
  const i = ADMIN_CONSOLE_SLOT_ORDER.indexOf(String(slot || ""));
  return i === -1 ? 999 : i;
}

/**
 * Sort nav items by canonical Admin Console slot, then stable label.
 * @param {Array<{ slot?: string, label?: string, key?: string }>} items
 * @returns {Array<object>}
 */
function sortNavItemsByAdminConsoleSlot(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const d = slotSortIndex(a.slot) - slotSortIndex(b.slot);
    if (d !== 0) return d;
    return String(a.label || a.key || "").localeCompare(String(b.label || b.key || ""));
  });
}

/**
 * Group visible items into canonical slots (empty slots omitted).
 * @param {Array<{ slot?: string }>} items
 * @returns {Array<{ key: string, label: string, items: Array<object> }>}
 */
function groupNavItemsByAdminConsoleSlot(items) {
  const sorted = sortNavItemsByAdminConsoleSlot(items);
  const bySlot = new Map();
  for (const item of sorted) {
    const slot = String(item.slot || "operations");
    if (!bySlot.has(slot)) bySlot.set(slot, []);
    bySlot.get(slot).push(item);
  }
  const groups = [];
  for (const slot of ADMIN_CONSOLE_SLOTS) {
    const slotItems = bySlot.get(slot.key);
    if (!slotItems || !slotItems.length) continue;
    groups.push({
      key: slot.key,
      label: slot.label,
      items: slotItems,
    });
  }
  return groups;
}

/**
 * Assert Dashboard is first visible primary destination and Website is second
 * when Website is present among primary slot anchors.
 * @param {Array<{ slot?: string, key?: string }>} items
 * @returns {{ ok: boolean, dashboardFirst: boolean, websiteSecond: boolean|null }}
 */
function validateAdminConsoleNavOrder(items) {
  const primary = sortNavItemsByAdminConsoleSlot(items).filter(
    (i) => i && (i.slot === "dashboard" || i.slot === "website")
  );
  const dashboardFirst =
    primary.length > 0 && String(primary[0].slot) === "dashboard";
  const websiteItems = primary.filter((i) => i.slot === "website");
  const websiteSecond =
    websiteItems.length === 0
      ? null
      : primary.length > 1 && String(primary[1].slot) === "website";
  return {
    ok: dashboardFirst && (websiteSecond === null || websiteSecond === true),
    dashboardFirst,
    websiteSecond,
  };
}

module.exports = {
  ADMIN_CONSOLE_SLOTS,
  ADMIN_CONSOLE_SLOT_ORDER,
  ADMIN_CONSOLE_SHELL,
  adminConsoleStitchScreen,
  slotSortIndex,
  sortNavItemsByAdminConsoleSlot,
  groupNavItemsByAdminConsoleSlot,
  validateAdminConsoleNavOrder,
};
