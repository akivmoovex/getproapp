"use strict";

/**
 * Read-only BlessBoard catalogue context resolver.
 * Accepts an explicit pool/client. Does not read process.env or make HTTP decisions.
 */

const repo = require("../repositories/blessBoardCatalogueRepository");

const STATUS = Object.freeze({
  OK: "ok",
  ORGANIZATION_NOT_FOUND: "organization_not_found",
  CHURCH_MISSING: "church_missing",
  CHURCH_INACTIVE: "church_inactive",
  HQ_BRANCH_MISSING: "hq_branch_missing",
  HQ_BRANCH_INACTIVE: "hq_branch_inactive",
  PRIMARY_BRANCH_MISSING: "primary_branch_missing",
  PRIMARY_BRANCH_INACTIVE: "primary_branch_inactive",
  LOOKUP_ERROR: "lookup_error",
});

/**
 * @param {object|null} row
 */
function mapContext(row) {
  if (!row) return null;
  return {
    organization: {
      id: row.organization_id,
      key: row.organization_key,
      displayName: row.organization_display_name,
      status: row.organization_status,
      dataEnvironment: row.organization_data_environment,
    },
    church: row.church_id
      ? {
          id: row.church_id,
          key: row.church_key,
          displayName: row.church_display_name,
          legalName: row.church_legal_name,
          status: row.church_status,
          dataEnvironment: row.church_data_environment,
        }
      : null,
    hqBranch: row.hq_branch_id
      ? {
          id: row.hq_branch_id,
          key: row.hq_branch_key,
          displayName: row.hq_branch_display_name,
          status: row.hq_branch_status,
          isPrimary: Boolean(row.hq_is_primary),
          timezone: row.hq_timezone,
          countryCode: row.hq_country_code,
        }
      : null,
    primaryBranch: row.primary_branch_id
      ? {
          id: row.primary_branch_id,
          key: row.primary_branch_key,
          displayName: row.primary_branch_display_name,
          branchType: row.primary_branch_type,
          status: row.primary_branch_status,
        }
      : null,
  };
}

/**
 * @param {{ query: Function }} db
 * @param {string} organizationId
 */
async function getBlessBoardCatalogueContext(db, organizationId) {
  const id = organizationId != null ? String(organizationId).trim() : "";
  if (!id) {
    return { ok: false, status: STATUS.ORGANIZATION_NOT_FOUND, message: "organization_id_required", context: null };
  }
  if (!db || typeof db.query !== "function") {
    return { ok: false, status: STATUS.LOOKUP_ERROR, message: "database client or pool required", context: null };
  }

  try {
    const row = await repo.findCatalogueContextByOrganizationId(db, id);
    if (!row) {
      return {
        ok: false,
        status: STATUS.ORGANIZATION_NOT_FOUND,
        message: "organization_not_found",
        context: null,
      };
    }

    const context = mapContext(row);

    if (!context.church) {
      return {
        ok: false,
        status: STATUS.CHURCH_MISSING,
        message: "church_missing",
        context,
      };
    }

    if (String(context.church.status) !== "active") {
      return {
        ok: false,
        status: STATUS.CHURCH_INACTIVE,
        message: "church_inactive",
        context,
      };
    }

    if (!context.hqBranch) {
      return {
        ok: false,
        status: STATUS.HQ_BRANCH_MISSING,
        message: "hq_branch_missing",
        context,
      };
    }

    if (String(context.hqBranch.status) !== "active") {
      return {
        ok: false,
        status: STATUS.HQ_BRANCH_INACTIVE,
        message: "hq_branch_inactive",
        context,
      };
    }

    if (!context.primaryBranch) {
      return {
        ok: false,
        status: STATUS.PRIMARY_BRANCH_MISSING,
        message: "primary_branch_missing",
        context,
      };
    }

    if (String(context.primaryBranch.status) !== "active") {
      return {
        ok: false,
        status: STATUS.PRIMARY_BRANCH_INACTIVE,
        message: "primary_branch_inactive",
        context,
      };
    }

    return {
      ok: true,
      status: STATUS.OK,
      message: "ok",
      context,
    };
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      message: "lookup_error",
      context: null,
    };
  }
}

module.exports = {
  STATUS,
  getBlessBoardCatalogueContext,
};
