"use strict";

const { ok, quarantine } = require("./helpers");

function transform(row, ctx) {
  const id = row && row.id;
  if (id == null) return quarantine("missing_id", row);
  if (row.organization_id == null) return quarantine("missing_organization_id", row);

  const title = String(row.title || row.name || "").trim();
  if (!title) return quarantine("missing_title", row);

  const startsAt = row.starts_at || row.event_at || null;
  if (!startsAt) return quarantine("missing_starts_at", row);

  const statusRaw = String(row.status || "draft").toLowerCase();
  const status = ["draft", "published", "cancelled", "archived"].includes(statusRaw)
    ? statusRaw
    : null;
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
  const eventId = ctx.idMap.resolve("church_events", id, "blessboard.events");

  const warnings = [];
  if (row.registration_form_id) warnings.push("event_registration_forms_unsupported");

  return ok(
    {
      event: {
        id: eventId,
        churchId,
        branchId,
        title: title.slice(0, 200),
        description: row.description ? String(row.description).slice(0, 1000) : null,
        startsAt,
        endsAt: row.ends_at || null,
        timezone: row.timezone || "UTC",
        locationText: row.location_text || row.location || null,
        status,
      },
      unsupported: {
        registration_stack: true,
        check_ins: true,
      },
    },
    warnings
  );
}

module.exports = { transform };
