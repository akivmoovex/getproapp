"use strict";

const { normalizeKey, ok, quarantine } = require("./helpers");

function transform(row, ctx) {
  const id = row && row.id;
  if (id == null) return quarantine("missing_id", row);
  if (row.organization_id == null) return quarantine("missing_organization_id", row);

  const hostSlug = normalizeKey(row.host_slug || row.slug);
  if (!hostSlug) return quarantine("invalid_host_slug", row);

  const suffix = String(ctx.runConfig.canonicalDomainSuffix || "blessboard.org")
    .trim()
    .toLowerCase();
  const hostname = `${hostSlug}.${suffix}`;

  const organizationId = ctx.idMap.resolve(
    "church_organizations",
    row.organization_id,
    "platform.organizations"
  );
  const domainId = ctx.idMap.resolve("church_branches_domain", id, "platform.domains");

  if (hostname.includes("..") || hostname.length > 253) {
    return quarantine("invalid_hostname", row);
  }

  return ok({
    domain: {
      id: domainId,
      organizationId,
      productKey: "blessboard",
      deploymentCode: ctx.runConfig.deploymentCode,
      hostname,
      domainType: "canonical",
      isPrimary: row.is_primary === true || Boolean(row.host_slug),
      status: "active",
    },
  });
}

module.exports = { transform };
