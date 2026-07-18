"use strict";

const { normalizeKey, ok, quarantine } = require("./helpers");

const HQ_SLUGS = new Set(["hq", "head-office", "headquarters", "head_office"]);

function transform(row, ctx) {
  const id = row && row.id;
  if (id == null) return quarantine("missing_id", row);

  const branchKey = normalizeKey(row.slug);
  if (!branchKey) return quarantine("invalid_slug", row);

  if (row.organization_id == null) return quarantine("missing_organization_id", row);

  const churchId = ctx.idMap.resolve(
    "church_organizations_church",
    row.organization_id,
    "blessboard.churches"
  );
  const branchId = ctx.idMap.resolve("church_branches", id, "blessboard.branches");

  const statusRaw = String(row.status || "active").toLowerCase();
  const status =
    statusRaw === "active"
      ? "active"
      : statusRaw === "inactive"
        ? "inactive"
        : statusRaw === "suspended"
          ? "suspended"
          : statusRaw === "archived"
            ? "archived"
            : null;
  if (!status) return quarantine("invalid_status", row);

  const isHq = HQ_SLUGS.has(branchKey) || row.is_hq === true;
  const warnings = [];
  if (row.welcome_message || row.service_times || row.location_text) {
    warnings.push("public_copy_deferred_to_settings_or_pages");
  }

  return ok(
    {
      branch: {
        id: branchId,
        churchId,
        branchKey,
        displayName: String(row.name || branchKey).trim().slice(0, 200),
        branchType: isHq ? "hq" : "branch",
        isPrimary: isHq || row.is_primary === true,
        status,
        timezone: row.timezone || null,
        countryCode:
          row.country_code && /^[A-Z]{2}$/.test(String(row.country_code).toUpperCase())
            ? String(row.country_code).toUpperCase()
            : null,
      },
      unsupported: {
        welcome_message: row.welcome_message,
        service_times: row.service_times,
        location_text: row.location_text,
        pastor_name: row.pastor_name,
        host_slug: row.host_slug,
      },
    },
    warnings
  );
}

module.exports = { transform, HQ_SLUGS };
