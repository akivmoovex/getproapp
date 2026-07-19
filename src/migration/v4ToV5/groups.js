"use strict";

/**
 * Ordered migration entity groups (authority: docs/database/V4_TO_V5_DATA_MAPPING.md).
 */

const ENTITY_GROUPS = Object.freeze([
  {
    id: "platform_identity",
    title: "Platform identity verification",
    entities: [],
    verifyOnly: true,
    description: "Verify V5 target identity; no V4 rows loaded.",
  },
  {
    id: "products_enrolments_domains",
    title: "Products / enrolments / domains",
    entities: ["organization", "domain"],
    description: "Organizations, BlessBoard enrolment, subscriptions, domains.",
  },
  {
    id: "churches_branches_settings",
    title: "Churches / branches / settings",
    entities: ["branch"],
    description: "Churches created with organizations; branches + settings shells.",
  },
  {
    id: "users_roles",
    title: "Users / roles",
    entities: ["user_hq_admin", "user_branch_admin"],
    description: "Staff identities and scoped roles.",
  },
  {
    id: "members",
    title: "Members",
    entities: ["member"],
    description: "Member profiles and primary branch memberships.",
  },
  {
    id: "public_content",
    title: "Public content",
    entities: ["ministry", "event", "announcement"],
    description: "Ministries, events, announcements (pages/settings derived later).",
  },
  {
    id: "operational_modules",
    title: "Operational modules",
    entities: ["attendance_record", "giving_summary"],
    description: "Aggregate attendance and giving summaries.",
  },
  {
    id: "media_metadata",
    title: "Media metadata",
    entities: [],
    skipReason: "media_blob_copy_deferred",
    description: "Metadata-only media deferred until storage copy path is approved.",
  },
  {
    id: "audit_reconciliation",
    title: "Audit / reconciliation",
    entities: ["audit_log"],
    description: "Optional redacted audit events + reconciliation report.",
  },
]);

/** Explicit unsupported V4 domains (no extract/mapper) — reported in plan for honesty. */
const UNSUPPORTED_SOURCE_ENTITIES = Object.freeze([
  { key: "tenants", reason: "bridge_only_not_migrated", v4Hint: "public.tenants" },
  { key: "registrations", reason: "unsupported_phase_2", v4Hint: "member registration workflow" },
  { key: "leaders", reason: "unsupported_phase_2", v4Hint: "leadership_json / church_ministry_leaders" },
  { key: "sermons", reason: "unsupported_phase_2", v4Hint: "church_sermons" },
  { key: "resources", reason: "unsupported_phase_2", v4Hint: "church_resources" },
  { key: "forms", reason: "unsupported_schema_mismatch", v4Hint: "registration/survey forms" },
  { key: "requests", reason: "unsupported_phase_2", v4Hint: "church_member_requests / prayer" },
  { key: "public_pages", reason: "unsupported_phase_2", v4Hint: "church_branch_website_content" },
  { key: "sessions", reason: "ephemeral_never_migrate", v4Hint: "public.session" },
]);

function listAllEntities() {
  const out = [];
  for (const g of ENTITY_GROUPS) {
    for (const e of g.entities) out.push(e);
  }
  return out;
}

module.exports = {
  ENTITY_GROUPS,
  UNSUPPORTED_SOURCE_ENTITIES,
  listAllEntities,
};
