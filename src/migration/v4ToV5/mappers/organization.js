"use strict";

const {
  normalizeKey,
  mapOrgStatus,
  mapPlanKey,
  mapDataEnvironment,
  isSampleOrganizationKey,
  ok,
  quarantine,
} = require("./helpers");

function transform(row, ctx) {
  const id = row && row.id;
  if (id == null) return quarantine("missing_id", row);

  const organizationKey = normalizeKey(row.slug);
  if (!organizationKey) return quarantine("invalid_slug", row);

  if (isSampleOrganizationKey(organizationKey, ctx.runConfig)) {
    return quarantine("sample_organization_excluded", row);
  }

  const statuses = mapOrgStatus(row.status);
  if (!statuses) return quarantine("invalid_status", row);

  const dataEnvironment = mapDataEnvironment(
    row.data_environment,
    ctx.runConfig.dataEnvironmentDefault
  );
  if (!dataEnvironment) return quarantine("invalid_data_environment", row);

  const warnings = [];
  const planKey = mapPlanKey(row.plan_code);
  if (planKey !== String(row.plan_code || "free").toLowerCase()) {
    warnings.push("plan_code_defaulted_to_free");
  }

  const organizationId = ctx.idMap.resolve(
    "church_organizations",
    id,
    "platform.organizations"
  );
  const churchId = ctx.idMap.resolve(
    "church_organizations_church",
    id,
    "blessboard.churches"
  );

  return ok(
    {
      organization: {
        id: organizationId,
        organizationKey,
        displayName: String(row.name || organizationKey).trim().slice(0, 200),
        legalName: row.legal_name ? String(row.legal_name).trim().slice(0, 200) : null,
        status: statuses.org,
        dataEnvironment,
      },
      church: {
        id: churchId,
        organizationId,
        churchKey: organizationKey,
        displayName: String(row.name || organizationKey).trim().slice(0, 200),
        legalName: row.legal_name ? String(row.legal_name).trim().slice(0, 200) : null,
        status: statuses.church,
        dataEnvironment,
      },
      enrolment: {
        organizationId,
        productKey: "blessboard",
        productTenantKey: organizationKey,
        status: "active",
      },
      subscription: {
        organizationId,
        productKey: "blessboard",
        planKey,
        status: "active",
      },
      unsupported: {
        storage_bytes_used: row.storage_bytes_used,
        billing_fields: true,
      },
    },
    warnings
  );
}

module.exports = { transform };
