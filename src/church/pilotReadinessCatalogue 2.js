"use strict";

/**
 * Pilot-readiness checklist catalogue for BlessBoard organisations.
 * Status values: complete | incomplete | needs_review
 */

const STATUSES = Object.freeze(["complete", "incomplete", "needs_review"]);

const STATUS_LABELS = Object.freeze({
  complete: "Complete",
  incomplete: "Incomplete",
  needs_review: "Needs Review",
});

const ROLE_LABELS = Object.freeze({
  platform_admin: "Platform administrator",
  hq_admin: "HQ administrator",
  branch_admin: "Branch administrator",
});

/** Known provision / onboarding placeholder strings — never count as Complete alone. */
const PLACEHOLDER_SERVICE_TIMES = Object.freeze([
  "sunday · contact the church office for service times",
  "contact the church office for service times",
]);

const PLACEHOLDER_CONTENT_MARKERS = Object.freeze([
  "update this",
  "welcome home",
  "part of the blessboard community",
  "draft … publish when ready",
  "draft ... publish when ready",
  "member registration and login are available on your branch church site",
]);

const RESERVED_DEMO_HOST_SLUGS = Object.freeze(["demo", "demo2"]);

/**
 * @typedef {{
 *   key: string,
 *   label: string,
 *   description: string,
 *   responsibleRole: 'platform_admin'|'hq_admin'|'branch_admin',
 *   evaluation: 'auto'|'manual',
 *   link: (ctx: { organizationId: number, primaryBranchId: number|null, blessboardAdminMode?: boolean }) => string|null,
 * }} ChecklistItemDef
 */

/** @type {ChecklistItemDef[]} */
const CHECKLIST_ITEMS = Object.freeze([
  {
    key: "organisation_identity",
    label: "Organisation identity complete",
    description: "Name, slug, country, and primary contact details are filled with real church data.",
    responsibleRole: "platform_admin",
    evaluation: "auto",
    link: ({ organizationId, blessboardAdminMode }) =>
      blessboardAdminMode
        ? `/admin/churches/${organizationId}/edit`
        : `/admin/church/organizations/${organizationId}/edit`,
  },
  {
    key: "package_assigned",
    label: "Package assigned",
    description: "Foundation or Growth package is explicitly assigned (not silent fallback).",
    responsibleRole: "platform_admin",
    evaluation: "auto",
    link: ({ organizationId, blessboardAdminMode }) =>
      blessboardAdminMode
        ? `/admin/churches/${organizationId}/plan`
        : `/admin/church/organizations/${organizationId}/plan`,
  },
  {
    key: "primary_subdomain",
    label: "Primary subdomain valid",
    description: "Primary branch host slug is valid, unique, and not a demo/reserved slug.",
    responsibleRole: "platform_admin",
    evaluation: "auto",
    link: ({ primaryBranchId }) =>
      primaryBranchId ? `/admin/church/branches/${primaryBranchId}` : null,
  },
  {
    key: "branch_configured",
    label: "At least one branch configured",
    description: "An active branch exists for the organisation (inactive-only does not count).",
    responsibleRole: "platform_admin",
    evaluation: "auto",
    link: ({ organizationId, blessboardAdminMode }) =>
      blessboardAdminMode
        ? `/admin/churches/${organizationId}`
        : `/admin/church/organizations/${organizationId}`,
  },
  {
    key: "branch_administrator",
    label: "Branch administrator assigned",
    description: "At least one active branch administrator on an active branch.",
    responsibleRole: "platform_admin",
    evaluation: "auto",
    link: ({ primaryBranchId }) =>
      primaryBranchId ? `/admin/church/branches/${primaryBranchId}` : null,
  },
  {
    key: "service_schedule",
    label: "Service schedule configured",
    description: "Service times are set and are not the provision default placeholder.",
    responsibleRole: "branch_admin",
    evaluation: "auto",
    link: () => "/branch/website-editor",
  },
  {
    key: "branding_uploaded",
    label: "Branding uploaded",
    description: "Website content published with non-placeholder branding copy (and logo when available).",
    responsibleRole: "branch_admin",
    evaluation: "auto",
    link: () => "/branch/website-editor",
  },
  {
    key: "public_contact",
    label: "Public contact information complete",
    description: "Public phone or email plus location/address for the primary branch.",
    responsibleRole: "branch_admin",
    evaluation: "auto",
    link: () => "/branch/website-editor",
  },
  {
    key: "public_pages_reviewed",
    label: "Public pages reviewed",
    description: "Published public pages have been reviewed for accuracy (manual confirmation).",
    responsibleRole: "branch_admin",
    evaluation: "manual",
    link: ({ primaryBranchId }) => (primaryBranchId ? null : null), // public host shown separately
  },
  {
    key: "member_registration_tested",
    label: "Member registration tested",
    description: "Registration is enabled and a real (non-placeholder) registration has been verified.",
    responsibleRole: "branch_admin",
    evaluation: "auto",
    link: () => "/register",
  },
  {
    key: "attendance_tested",
    label: "Attendance tested",
    description: "At least one attendance record exists for an active branch.",
    responsibleRole: "branch_admin",
    evaluation: "auto",
    link: () => "/branch/attendance",
  },
  {
    key: "safeguarding_roles",
    label: "Safeguarding roles assigned",
    description: "Safeguarding responsibilities confirmed outside automated role tables.",
    responsibleRole: "hq_admin",
    evaluation: "manual",
    link: ({ organizationId, blessboardAdminMode }) =>
      blessboardAdminMode
        ? `/admin/churches/${organizationId}/hq-admins`
        : `/admin/church/organizations/${organizationId}/hq-admins`,
  },
  {
    key: "finance_roles",
    label: "Finance roles reviewed",
    description: "HQ finance visibility (`can_view_finance`) reviewed for the intended administrators.",
    responsibleRole: "platform_admin",
    evaluation: "manual",
    link: ({ organizationId, blessboardAdminMode }) =>
      blessboardAdminMode
        ? `/admin/churches/${organizationId}/hq-admins`
        : `/admin/church/organizations/${organizationId}/hq-admins`,
  },
  {
    key: "backup_status",
    label: "Backup status available",
    description: "Operational backup/restore posture confirmed by platform operations.",
    responsibleRole: "platform_admin",
    evaluation: "manual",
    link: () => "/admin/diagnostics",
  },
  {
    key: "support_contact",
    label: "Support contact confirmed",
    description: "Organisation primary support contact is present and confirmed with the church.",
    responsibleRole: "platform_admin",
    evaluation: "auto",
    link: ({ organizationId, blessboardAdminMode }) =>
      blessboardAdminMode
        ? `/admin/churches/${organizationId}/edit`
        : `/admin/church/organizations/${organizationId}/edit`,
  },
  {
    key: "privacy_consent",
    label: "Privacy and consent text reviewed",
    description: "Platform privacy/terms and registration consent wording reviewed for this pilot.",
    responsibleRole: "platform_admin",
    evaluation: "manual",
    link: () => "/privacy",
  },
]);

const CHECKLIST_ITEM_KEYS = Object.freeze(CHECKLIST_ITEMS.map((i) => i.key));

function getChecklistItemDefinition(key) {
  return CHECKLIST_ITEMS.find((i) => i.key === String(key || "").trim()) || null;
}

function isKnownChecklistItemKey(key) {
  return CHECKLIST_ITEM_KEYS.includes(String(key || "").trim());
}

function looksLikePlaceholderText(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  if (!text) return true;
  return PLACEHOLDER_CONTENT_MARKERS.some((m) => text.includes(m));
}

function isPlaceholderServiceTimes(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!text) return true;
  return PLACEHOLDER_SERVICE_TIMES.some((p) => text === p || text.includes(p));
}

function isReservedDemoHostSlug(hostSlug) {
  const slug = String(hostSlug || "")
    .trim()
    .toLowerCase();
  return RESERVED_DEMO_HOST_SLUGS.includes(slug);
}

function isDemoLikeOrganisation(org, primaryBranch) {
  const { getDataEnvironment } = require("./orgDataEnvironment");
  const env = getDataEnvironment(org);
  if (env === "demo" || env === "test") return true;
  const slug = String((org && org.slug) || "")
    .trim()
    .toLowerCase();
  const name = String((org && org.name) || "")
    .trim()
    .toLowerCase();
  if (slug === "demo" || slug.startsWith("demo-") || slug.endsWith("-demo")) return true;
  if (name === "demo" || name.includes("demo church") || name.includes("blessboard demo")) return true;
  if (primaryBranch && isReservedDemoHostSlug(primaryBranch.host_slug || primaryBranch.hostSlug)) {
    return true;
  }
  return false;
}

module.exports = {
  STATUSES,
  STATUS_LABELS,
  ROLE_LABELS,
  CHECKLIST_ITEMS,
  CHECKLIST_ITEM_KEYS,
  PLACEHOLDER_SERVICE_TIMES,
  PLACEHOLDER_CONTENT_MARKERS,
  RESERVED_DEMO_HOST_SLUGS,
  getChecklistItemDefinition,
  isKnownChecklistItemKey,
  looksLikePlaceholderText,
  isPlaceholderServiceTimes,
  isReservedDemoHostSlug,
  isDemoLikeOrganisation,
};
