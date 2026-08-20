"use strict";

/**
 * Product capabilities for ActiveClinic public surfaces.
 * Directory search remains implemented at /clinics for QA/internal use.
 * Public navigation must not advertise it while this flag is off.
 */

const CAPABILITIES = Object.freeze({
  PUBLIC_CLINIC_DIRECTORY_NAV: false,
});

/**
 * Inventory of public clinic-directory entry points.
 * `gated` = hidden unless ACTIVECLINIC_PUBLIC_CLINIC_DIRECTORY_NAV is on.
 * `qa_route` = the directory itself; keep reachable by URL, do not advertise.
 */
const PUBLIC_DIRECTORY_ENTRY_POINTS = Object.freeze([
  { id: "platform-header-desktop", surface: "platform header desktop", destination: "/clinics", gated: true },
  { id: "platform-header-drawer", surface: "platform mobile drawer", destination: "/clinics", gated: true },
  { id: "platform-footer-explore", surface: "platform footer", destination: "/clinics", gated: true },
  { id: "platform-bottom-nav", surface: "platform mobile bottom nav", destination: "/clinics", gated: true },
  { id: "apex-home-hero", surface: "apex marketing hero", destination: "/clinics", gated: true },
  { id: "apex-home-discovery", surface: "apex marketing discovery CTA", destination: "/clinics", gated: true },
  { id: "apex-home-final-cta", surface: "apex marketing final CTA", destination: "/clinics", gated: true },
  { id: "solutions-cta", surface: "solutions page CTA", destination: "/clinics", gated: true },
  { id: "clinic-not-found", surface: "clinic not-found state", destination: "/clinics", gated: true },
  { id: "clinic-unavailable", surface: "clinic unavailable state", destination: "/clinics", gated: true },
  { id: "clinic-website-offline", surface: "clinic website offline state", destination: "/clinics", gated: true },
  { id: "clinic-website-suspended", surface: "clinic website suspended state", destination: "/clinics", gated: true },
  { id: "patient-not-found", surface: "patient portal not-found", destination: "/clinics", gated: true },
  { id: "tenant-clinic-nav", surface: "tenant clinic website nav", destination: "/clinics", gated: true },
  { id: "directory-page", surface: "GET /clinics (QA/internal)", destination: "/clinics", gated: false, qa_route: true },
  { id: "directory-search", surface: "GET /clinics/search (QA/internal)", destination: "/clinics/search", gated: false, qa_route: true },
]);

function isPublicClinicDirectoryNavEnabled(env) {
  const source = env || process.env || {};
  const raw = String(source.ACTIVECLINIC_PUBLIC_CLINIC_DIRECTORY_NAV || "").trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "off") return false;
  return CAPABILITIES.PUBLIC_CLINIC_DIRECTORY_NAV === true;
}

module.exports = {
  CAPABILITIES,
  PUBLIC_DIRECTORY_ENTRY_POINTS,
  isPublicClinicDirectoryNavEnabled,
};
