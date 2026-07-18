"use strict";

const { ok, quarantine } = require("./helpers");

function transform(row, ctx) {
  const id = row && row.id;
  if (id == null) return quarantine("missing_id", row);
  if (row.organization_id == null) return quarantine("missing_organization_id", row);

  const title = String(row.title || "").trim();
  const body = String(row.body || row.content || "").trim();
  if (!title || !body) return quarantine("missing_title_or_body", row);

  const statusRaw = String(row.status || "draft").toLowerCase();
  const status =
    statusRaw === "published" ? "published" : statusRaw === "draft" ? "draft" : statusRaw === "archived" ? "archived" : null;
  if (!status) return quarantine("invalid_status", row);

  const churchId = ctx.idMap.resolve(
    "church_organizations_church",
    row.organization_id,
    "blessboard.churches"
  );
  const branchId =
    row.branch_id != null
      ? ctx.idMap.resolve("church_branches", row.branch_id, "blessboard.branches")
      : null;
  const announcementId = ctx.idMap.resolve(
    "church_announcements",
    id,
    "blessboard.announcements"
  );

  const warnings = [];
  if (row.is_pinned || row.is_featured) warnings.push("pin_feature_flags_unsupported");

  return ok(
    {
      announcement: {
        id: announcementId,
        churchId,
        branchId,
        title: title.slice(0, 200),
        body: body.slice(0, 20000),
        status,
        publishedAt: status === "published" ? row.published_at || row.updated_at || null : null,
      },
      audiences: [{ announcementId, audienceKey: "members" }],
      unsupported: {
        action_url_alone: Boolean(row.action_url && !row.action_label),
        hq_broadcast_analytics: false,
      },
    },
    warnings
  );
}

module.exports = { transform };
