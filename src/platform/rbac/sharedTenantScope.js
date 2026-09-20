"use strict";

/**
 * Shared tenant-scope helpers for BlessBoard + ActiveClinic.
 * Trusted scope comes from authentication / hostname / membership context —
 * never from client-supplied organization, church, branch, or facility IDs.
 */

const TENANT_ID_KEYS = Object.freeze([
  "organizationId",
  "organization_id",
  "churchId",
  "church_id",
  "branchId",
  "branch_id",
  "facilityId",
  "facility_id",
  "healthcareOrganizationId",
  "healthcare_organization_id",
]);

/**
 * Case-insensitive UUID / opaque id equality.
 * @param {unknown} a
 * @param {unknown} b
 */
function uuidEqual(a, b) {
  if (a == null || b == null) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

/**
 * @param {unknown} value
 * @returns {string|null}
 */
function normalizeId(value) {
  const s = String(value == null ? "" : value).trim();
  return s || null;
}

/**
 * Collect tenant-like identifiers from a body/query/params object.
 * @param {object|null|undefined} source
 * @returns {Record<string, string>}
 */
function extractClientTenantIds(source) {
  const out = Object.create(null);
  if (!source || typeof source !== "object") return out;
  for (const key of TENANT_ID_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    const value = normalizeId(source[key]);
    if (value) out[key] = value;
  }
  return out;
}

/**
 * True when the source carries any tenant-scope identifier.
 * @param {object|null|undefined} source
 */
function hasClientTenantIds(source) {
  return Object.keys(extractClientTenantIds(source)).length > 0;
}

/**
 * Reject requests that attempt to override trusted tenant scope via body/query.
 * Returns a structured denial (does not write HTTP).
 *
 * @param {{
 *   body?: object|null,
 *   query?: object|null,
 *   params?: object|null,
 *   trusted?: {
 *     organizationId?: string|null,
 *     churchId?: string|null,
 *     branchId?: string|null,
 *     facilityId?: string|null,
 *   }|null,
 *   allowMatchingTrusted?: boolean,
 * }} input
 */
function rejectForgedTenantIdentifiers(input) {
  const options = input || {};
  const trusted = options.trusted || null;
  const allowMatching = options.allowMatchingTrusted === true;
  const bags = [options.body, options.query, options.params].filter(Boolean);
  const found = [];

  for (const bag of bags) {
    const ids = extractClientTenantIds(bag);
    for (const [key, value] of Object.entries(ids)) {
      found.push({ key, value });
    }
  }

  if (!found.length) {
    return { ok: true, code: "ok", forged: [] };
  }

  if (!allowMatching || !trusted) {
    return {
      ok: false,
      code: "forged_tenant_identifiers",
      reasonCode: "RBAC_FORGED_TENANT_ID",
      forged: found,
      httpStatus: 403,
    };
  }

  const mismatches = [];
  for (const item of found) {
    const key = item.key;
    let trustedValue = null;
    if (key === "organizationId" || key === "organization_id") {
      trustedValue = trusted.organizationId;
    } else if (key === "churchId" || key === "church_id") {
      trustedValue = trusted.churchId;
    } else if (key === "branchId" || key === "branch_id") {
      trustedValue = trusted.branchId;
    } else if (key === "facilityId" || key === "facility_id") {
      trustedValue = trusted.facilityId;
    } else if (
      key === "healthcareOrganizationId" ||
      key === "healthcare_organization_id"
    ) {
      // Healthcare org is AC-specific; treat mismatch as forged when trusted set.
      trustedValue = trusted.organizationId;
    }
    if (trustedValue == null || !uuidEqual(item.value, trustedValue)) {
      mismatches.push(item);
    }
  }

  if (mismatches.length) {
    return {
      ok: false,
      code: "forged_tenant_identifiers",
      reasonCode: "RBAC_FORGED_TENANT_ID",
      forged: mismatches,
      httpStatus: 403,
    };
  }

  return { ok: true, code: "ok", forged: [] };
}

/**
 * Assert a resource context stays inside a trusted BB tenant.
 * @param {{
 *   organizationId?: string|null,
 *   churchId?: string|null,
 *   branchId?: string|null,
 * }} resource
 * @param {{
 *   organization?: { id?: string },
 *   church?: { id?: string },
 *   primaryBranch?: { id?: string }|null,
 *   resolved?: boolean,
 * }|null} tenant
 */
function assertResourceInsideBlessBoardTenant(resource, tenant) {
  if (!tenant || tenant.resolved !== true) {
    return {
      ok: false,
      code: "tenant_unresolved",
      reasonCode: "RBAC_TENANT_UNRESOLVED",
      httpStatus: 403,
    };
  }
  const orgId = tenant.organization && tenant.organization.id;
  const churchId = tenant.church && tenant.church.id;
  if (!orgId || !churchId) {
    return {
      ok: false,
      code: "tenant_unresolved",
      reasonCode: "RBAC_TENANT_UNRESOLVED",
      httpStatus: 403,
    };
  }
  if (!uuidEqual(resource && resource.organizationId, orgId)) {
    return {
      ok: false,
      code: "scope_mismatch",
      reasonCode: "RBAC_SCOPE_MISMATCH",
      httpStatus: 403,
      field: "organizationId",
    };
  }
  if (!uuidEqual(resource && resource.churchId, churchId)) {
    return {
      ok: false,
      code: "scope_mismatch",
      reasonCode: "RBAC_SCOPE_MISMATCH",
      httpStatus: 403,
      field: "churchId",
    };
  }
  return { ok: true, code: "ok" };
}

/**
 * Assert an ActiveClinic facility/org pair matches authenticated context.
 * @param {{
 *   organizationId?: string|null,
 *   facilityId?: string|null,
 * }} claimed
 * @param {{
 *   organization?: { id?: string }|null,
 *   selectedFacility?: { id?: string }|null,
 *   authenticated?: boolean,
 * }|null} auth
 * @param {{ requireFacility?: boolean }} [opts]
 */
function assertActiveClinicAuthScope(claimed, auth, opts) {
  const options = opts || {};
  if (!auth || !auth.authenticated || !auth.organization || !auth.organization.id) {
    return {
      ok: false,
      code: "unauthenticated",
      reasonCode: "RBAC_UNAUTHENTICATED",
      httpStatus: 401,
    };
  }
  if (
    claimed &&
    claimed.organizationId &&
    !uuidEqual(claimed.organizationId, auth.organization.id)
  ) {
    return {
      ok: false,
      code: "forged_organization",
      reasonCode: "RBAC_FORGED_TENANT_ID",
      httpStatus: 403,
      field: "organizationId",
    };
  }
  const selectedFacilityId =
    auth.selectedFacility && auth.selectedFacility.id
      ? String(auth.selectedFacility.id)
      : null;
  if (claimed && claimed.facilityId) {
    if (!selectedFacilityId || !uuidEqual(claimed.facilityId, selectedFacilityId)) {
      return {
        ok: false,
        code: "forged_facility",
        reasonCode: "RBAC_FORGED_TENANT_ID",
        httpStatus: 403,
        field: "facilityId",
      };
    }
  }
  if (options.requireFacility === true && !selectedFacilityId) {
    return {
      ok: false,
      code: "facility_required",
      reasonCode: "RBAC_FACILITY_REQUIRED",
      httpStatus: 403,
    };
  }
  return {
    ok: true,
    code: "ok",
    organizationId: String(auth.organization.id),
    facilityId: selectedFacilityId,
  };
}

/**
 * Express middleware: reject forged tenant IDs on mutating requests.
 * @param {{
 *   resolveTrusted?: (req: import('express').Request) => object|null,
 *   methods?: string[],
 *   concealAsNotFound?: boolean,
 *   allowMatchingTrusted?: boolean,
 * }} [deps]
 */
function createRejectForgedTenantIdsMiddleware(deps) {
  const options = deps || {};
  const methods = new Set(
    (Array.isArray(options.methods) ? options.methods : ["POST", "PUT", "PATCH", "DELETE"]).map(
      (m) => String(m).toUpperCase()
    )
  );
  const resolveTrusted =
    typeof options.resolveTrusted === "function" ? options.resolveTrusted : null;
  const concealAsNotFound = options.concealAsNotFound === true;
  const allowMatchingTrusted = options.allowMatchingTrusted === true;

  return function rejectForgedTenantIds(req, res, next) {
    const method = String(req.method || "GET").toUpperCase();
    if (!methods.has(method)) return next();

    const trusted = resolveTrusted ? resolveTrusted(req) : null;
    const decision = rejectForgedTenantIdentifiers({
      body: req.body,
      query: req.query,
      trusted,
      allowMatchingTrusted: allowMatchingTrusted && Boolean(trusted),
    });
    if (decision.ok) return next();

    const status = concealAsNotFound ? 404 : decision.httpStatus || 403;
    const message = concealAsNotFound ? "Not found." : "You do not have access to this site.";
    const wantsHtml = String(req.get && req.get("accept") || "").includes("text/html");
    if (wantsHtml) {
      return res.status(status).type("html").send(
        `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Access</title></head><body><p>${message}</p></body></html>`
      );
    }
    return res.status(status).type("text").send(message);
  };
}

module.exports = {
  TENANT_ID_KEYS,
  uuidEqual,
  normalizeId,
  extractClientTenantIds,
  hasClientTenantIds,
  rejectForgedTenantIdentifiers,
  assertResourceInsideBlessBoardTenant,
  assertActiveClinicAuthScope,
  createRejectForgedTenantIdsMiddleware,
};
