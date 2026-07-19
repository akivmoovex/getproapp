"use strict";

const { normalizeKey, isUnsafeHostname, ok, quarantine } = require("./helpers");
const { requireMappedParent } = require("./parents");

function transform(row, ctx) {
  const id = row && row.id;
  if (id == null) return quarantine("missing_id", row);
  if (row.organization_id == null) return quarantine("missing_organization_id", row);

  const org = requireMappedParent(
    ctx.idMap,
    "church_organizations",
    row.organization_id,
    "orphan_organization",
    row
  );
  if (!org.ok) return org.result;

  const hostSlugRaw = row.host_slug != null ? String(row.host_slug).trim() : "";
  if (!hostSlugRaw) {
    return quarantine("missing_host_slug", row);
  }

  const hostSlug = normalizeKey(hostSlugRaw);
  if (!hostSlug) return quarantine("invalid_host_slug", row);

  const suffix = String(ctx.runConfig.canonicalDomainSuffix || "blessboard.org")
    .trim()
    .toLowerCase();
  const hostname = `${hostSlug}.${suffix}`;

  if (isUnsafeHostname(hostname)) {
    return quarantine("unsafe_hostname", row);
  }

  const domainId = ctx.idMap.resolve("church_branches_domain", id, "platform.domains");

  return ok({
    domain: {
      id: domainId,
      organizationId: org.id,
      productKey: "blessboard",
      deploymentCode: ctx.runConfig.deploymentCode,
      hostname,
      domainType: "canonical",
      isPrimary: row.is_primary === true || Boolean(hostSlugRaw),
      status: "active",
    },
  });
}

module.exports = { transform };
