"use strict";

/**
 * Transactional BlessBoard church + HQ branch provisioner.
 * Requires an already-provisioned platform organization with active BlessBoard enrolment.
 * Does not read environment variables or connection strings. Caller supplies a pool/client.
 */

const repo = require("../repositories/blessBoardCatalogueRepository");
const {
  evaluateBranchCreateLimit,
  STATUS: ENTITLEMENT_STATUS,
} = require("../../platform/services/entitlementService");
const {
  resolveManageTransactionOption,
  openProvisioningSession,
  runInsertWithUniqueRecovery,
} = require("../../platform/db/provisioningTransaction");

const STATUS = Object.freeze({
  PROVISIONED: "provisioned",
  ALREADY_PROVISIONED: "already_provisioned",
  DRY_RUN_WOULD_PROVISION: "dry_run_would_provision",
  DRY_RUN_ALREADY_PROVISIONED: "dry_run_already_provisioned",
  INVALID_INPUT: "invalid_input",
  ORGANIZATION_NOT_FOUND: "organization_not_found",
  INACTIVE_ORGANIZATION: "inactive_organization",
  MISSING_BLESSBOARD_ENROLMENT: "missing_blessboard_enrolment",
  INACTIVE_BLESSBOARD_ENROLMENT: "inactive_blessboard_enrolment",
  ENVIRONMENT_MISMATCH: "environment_mismatch",
  CHURCH_CONFLICT: "church_conflict",
  BRANCH_CONFLICT: "branch_conflict",
  LIMIT_EXCEEDED: "limit_exceeded",
  TRANSACTION_ERROR: "transaction_error",
});

const KEY_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const DATA_ENVIRONMENTS = new Set(["production", "pilot", "demo", "testing"]);
const COUNTRY_RE = /^[A-Z]{2}$/;

function fail(status, message, extra) {
  return {
    ok: false,
    status,
    message: message || status,
    created: { church: false, hqBranch: false },
    planned: null,
    dryRun: false,
    records: null,
    ...(extra || {}),
  };
}

function success(status, created, records, extra) {
  return {
    ok: true,
    status,
    message: status,
    created,
    planned: null,
    dryRun: false,
    records,
    ...(extra || {}),
  };
}

/**
 * @param {object} input
 */
function validateAndNormalizeInput(input) {
  const raw = input && typeof input === "object" ? input : {};
  const organizationKey = String(raw.organizationKey || "")
    .trim()
    .toLowerCase();
  const churchKey = String(raw.churchKey || "")
    .trim()
    .toLowerCase();
  const displayName = String(raw.displayName != null ? raw.displayName : "").trim();
  const legalNameRaw = raw.legalName != null ? String(raw.legalName).trim() : "";
  const legalName = legalNameRaw ? legalNameRaw : null;
  const dataEnvironment = String(raw.dataEnvironment || "")
    .trim()
    .toLowerCase();
  const hqBranchKey = String(raw.hqBranchKey || "")
    .trim()
    .toLowerCase();
  const { prepareBranchDisplayName } = require("./normalizeBranchDisplayName");
  const hqPrepared = prepareBranchDisplayName(raw.hqBranchDisplayName, {
    field: "displayName",
    required: true,
  });
  const hqBranchDisplayName = hqPrepared.ok ? hqPrepared.display : "";
  const timezoneRaw = raw.timezone != null ? String(raw.timezone).trim() : "";
  const timezone = timezoneRaw ? timezoneRaw : null;
  const countryRaw = raw.countryCode != null ? String(raw.countryCode).trim().toUpperCase() : "";
  const countryCode = countryRaw ? countryRaw : null;

  if (!organizationKey || !KEY_RE.test(organizationKey)) {
    return { ok: false, reason: "organizationKey" };
  }
  if (!churchKey || !KEY_RE.test(churchKey)) {
    return { ok: false, reason: "churchKey" };
  }
  if (!displayName || displayName.length > 200) {
    return { ok: false, reason: "displayName" };
  }
  if (legalName && legalName.length > 200) {
    return { ok: false, reason: "legalName" };
  }
  if (!DATA_ENVIRONMENTS.has(dataEnvironment)) {
    return { ok: false, reason: "dataEnvironment" };
  }
  if (!hqBranchKey || !KEY_RE.test(hqBranchKey)) {
    return { ok: false, reason: "hqBranchKey" };
  }
  if (!hqBranchDisplayName || hqBranchDisplayName.length > 200) {
    return { ok: false, reason: "hqBranchDisplayName" };
  }
  if (timezone && timezone.length > 64) {
    return { ok: false, reason: "timezone" };
  }
  if (countryCode && !COUNTRY_RE.test(countryCode)) {
    return { ok: false, reason: "countryCode" };
  }

  return {
    ok: true,
    value: {
      organizationKey,
      churchKey,
      displayName,
      legalName,
      dataEnvironment,
      hqBranchKey,
      hqBranchDisplayName,
      timezone,
      countryCode,
    },
  };
}

function churchMatches(existing, requested, organizationId) {
  if (!existing) return false;
  if (String(existing.status) !== "active") return false;
  if (String(existing.organization_id) !== String(organizationId)) return false;
  if (existing.church_key !== requested.churchKey) return false;
  if (String(existing.display_name) !== requested.displayName) return false;
  if (String(existing.data_environment) !== requested.dataEnvironment) return false;
  const existingLegal = existing.legal_name == null ? null : String(existing.legal_name);
  if (existingLegal !== requested.legalName) return false;
  return true;
}

function hqBranchMatches(existing, requested, churchId) {
  if (!existing) return false;
  if (String(existing.status) !== "active") return false;
  if (String(existing.church_id) !== String(churchId)) return false;
  if (existing.branch_key !== requested.hqBranchKey) return false;
  const { normalizeBranchDisplayName } = require("./normalizeBranchDisplayName");
  if (
    normalizeBranchDisplayName(existing.display_name) !==
    normalizeBranchDisplayName(requested.hqBranchDisplayName)
  ) {
    return false;
  }
  if (String(existing.branch_type) !== "hq") return false;
  if (!Boolean(existing.is_primary)) return false;
  const existingTz = existing.timezone == null ? null : String(existing.timezone);
  if (existingTz !== requested.timezone) return false;
  const existingCc = existing.country_code == null ? null : String(existing.country_code);
  if (existingCc !== requested.countryCode) return false;
  return true;
}

function mapRecords(organization, church, hqBranch) {
  return {
    organization: {
      id: organization.id,
      key: organization.organization_key,
      status: organization.status,
      dataEnvironment: organization.data_environment,
    },
    church: {
      id: church.id,
      organizationId: church.organization_id,
      key: church.church_key,
      displayName: church.display_name,
      legalName: church.legal_name,
      status: church.status,
      dataEnvironment: church.data_environment,
    },
    hqBranch: {
      id: hqBranch.id,
      churchId: hqBranch.church_id,
      key: hqBranch.branch_key,
      displayName: hqBranch.display_name,
      branchType: hqBranch.branch_type,
      status: hqBranch.status,
      isPrimary: Boolean(hqBranch.is_primary),
      timezone: hqBranch.timezone,
      countryCode: hqBranch.country_code,
    },
  };
}

/**
 * @param {{ connect?: Function, query?: Function }} db — Pool (preferred) or Client
 * @param {object} input
 * @param {{ manageTransaction?: boolean }} [options]
 */
async function provisionBlessBoardChurch(db, input, options) {
  const validated = validateAndNormalizeInput(input);
  if (!validated.ok) {
    return fail(STATUS.INVALID_INPUT, `invalid_input:${validated.reason}`);
  }
  const req = validated.value;
  const dryRun = Boolean(input && input.dryRun);

  const resolved = resolveManageTransactionOption(db, options);
  if (!resolved.ok) {
    return fail(STATUS.TRANSACTION_ERROR, resolved.message);
  }

  let session = null;
  try {
    session = await openProvisioningSession(resolved);
    const client = session.client;
    const abort = async (result) => {
      await session.rollbackIfManaged();
      return result;
    };

    const organization = await repo.findOrganizationByKey(client, req.organizationKey);
    if (!organization) {
      return abort(fail(STATUS.ORGANIZATION_NOT_FOUND, "organization_not_found"));
    }
    if (organization.status !== "active") {
      return abort(fail(STATUS.INACTIVE_ORGANIZATION, "inactive_organization"));
    }
    if (String(organization.data_environment) !== req.dataEnvironment) {
      return abort(fail(STATUS.ENVIRONMENT_MISMATCH, "environment_mismatch"));
    }

    const enrolment = await repo.findBlessBoardEnrolment(client, organization.id);
    if (!enrolment) {
      return abort(fail(STATUS.MISSING_BLESSBOARD_ENROLMENT, "missing_blessboard_enrolment"));
    }
    if (enrolment.status !== "active") {
      return abort(fail(STATUS.INACTIVE_BLESSBOARD_ENROLMENT, "inactive_blessboard_enrolment"));
    }

    const created = { church: false, hqBranch: false };

    const byOrg = await repo.findChurchByOrganizationId(client, organization.id);
    const byKey = await repo.findChurchByKey(client, req.churchKey);

    if (byOrg && byKey && String(byOrg.id) !== String(byKey.id)) {
      return abort(fail(STATUS.CHURCH_CONFLICT, "church_conflict"));
    }
    if (byKey && String(byKey.organization_id) !== String(organization.id)) {
      return abort(fail(STATUS.CHURCH_CONFLICT, "church_conflict"));
    }
    if (byOrg && byOrg.church_key !== req.churchKey) {
      return abort(fail(STATUS.CHURCH_CONFLICT, "church_conflict"));
    }

    let church = byOrg || byKey;
    if (church) {
      if (!churchMatches(church, req, organization.id)) {
        return abort(fail(STATUS.CHURCH_CONFLICT, "church_conflict"));
      }
    } else if (!dryRun) {
      try {
        const inserted = await runInsertWithUniqueRecovery(client, "prov_church_insert", () =>
          repo.insertChurch(client, {
            organizationId: organization.id,
            churchKey: req.churchKey,
            displayName: req.displayName,
            legalName: req.legalName,
            dataEnvironment: req.dataEnvironment,
          })
        );
        if (inserted.ok) {
          church = inserted.value;
          created.church = true;
        } else {
          church = await repo.findChurchByOrganizationId(client, organization.id);
          if (!church) {
            church = await repo.findChurchByKey(client, req.churchKey);
          }
          if (!churchMatches(church, req, organization.id)) {
            return abort(fail(STATUS.CHURCH_CONFLICT, "church_conflict"));
          }
        }
      } catch (err) {
        if (!repo.isCheckOrTriggerViolation(err)) {
          return abort(fail(STATUS.TRANSACTION_ERROR, "church_insert_failed"));
        }
        church = await repo.findChurchByOrganizationId(client, organization.id);
        if (!church) {
          church = await repo.findChurchByKey(client, req.churchKey);
        }
        if (!churchMatches(church, req, organization.id)) {
          return abort(fail(STATUS.CHURCH_CONFLICT, "church_conflict"));
        }
      }
    }

    let hqBranch = null;
    if (church) {
      const existingHq = await repo.findHqBranch(client, church.id);
      const byBranchKey = await repo.findBranchByChurchAndKey(client, church.id, req.hqBranchKey);

      if (existingHq && byBranchKey && String(existingHq.id) !== String(byBranchKey.id)) {
        return abort(fail(STATUS.BRANCH_CONFLICT, "branch_conflict"));
      }
      if (byBranchKey && String(byBranchKey.branch_type) !== "hq") {
        return abort(fail(STATUS.BRANCH_CONFLICT, "branch_conflict"));
      }

      hqBranch = existingHq || byBranchKey;
      if (hqBranch) {
        if (!hqBranchMatches(hqBranch, req, church.id)) {
          return abort(fail(STATUS.BRANCH_CONFLICT, "branch_conflict"));
        }
      } else if (!dryRun) {
        try {
          const capacity = await evaluateBranchCreateLimit(client, {
            organizationId: organization.id,
          });
          if (!capacity.ok) {
            if (capacity.status === ENTITLEMENT_STATUS.LIMIT_EXCEEDED) {
              return abort(
                fail(STATUS.LIMIT_EXCEEDED, "max_branches", {
                  current: capacity.current,
                  limit: capacity.limit,
                })
              );
            }
            return abort(fail(STATUS.TRANSACTION_ERROR, "branch_capacity_check_failed"));
          }
          const inserted = await runInsertWithUniqueRecovery(client, "prov_hq_insert", () =>
            repo.insertHqBranch(client, {
              churchId: church.id,
              branchKey: req.hqBranchKey,
              displayName: req.hqBranchDisplayName,
              timezone: req.timezone,
              countryCode: req.countryCode,
            })
          );
          if (inserted.ok) {
            hqBranch = inserted.value;
            created.hqBranch = true;
          } else {
            hqBranch = await repo.findHqBranch(client, church.id);
            if (!hqBranch) {
              hqBranch = await repo.findBranchByChurchAndKey(client, church.id, req.hqBranchKey);
            }
            if (!hqBranchMatches(hqBranch, req, church.id)) {
              return abort(fail(STATUS.BRANCH_CONFLICT, "branch_conflict"));
            }
          }
        } catch (err) {
          if (!repo.isCheckOrTriggerViolation(err)) {
            return abort(fail(STATUS.TRANSACTION_ERROR, "branch_insert_failed"));
          }
          hqBranch = await repo.findHqBranch(client, church.id);
          if (!hqBranch) {
            hqBranch = await repo.findBranchByChurchAndKey(client, church.id, req.hqBranchKey);
          }
          if (!hqBranchMatches(hqBranch, req, church.id)) {
            return abort(fail(STATUS.BRANCH_CONFLICT, "branch_conflict"));
          }
        }
      }
    }

    if (dryRun) {
      const planned = {
        church: !church,
        hqBranch: !church || !hqBranch,
      };
      if (planned.hqBranch && church) {
        const capacity = await evaluateBranchCreateLimit(client, {
          organizationId: organization.id,
        });
        if (!capacity.ok) {
          if (capacity.status === ENTITLEMENT_STATUS.LIMIT_EXCEEDED) {
            return abort(
              fail(STATUS.LIMIT_EXCEEDED, "max_branches", {
                current: capacity.current,
                limit: capacity.limit,
              })
            );
          }
          return abort(fail(STATUS.TRANSACTION_ERROR, "branch_capacity_check_failed"));
        }
      }
      await session.rollbackIfManaged();
      const anyPlanned = planned.church || planned.hqBranch;
      return success(
        anyPlanned ? STATUS.DRY_RUN_WOULD_PROVISION : STATUS.DRY_RUN_ALREADY_PROVISIONED,
        { church: false, hqBranch: false },
        church && hqBranch
          ? mapRecords(organization, church, hqBranch)
          : {
              organization: { key: organization.organization_key },
              church: church ? { key: church.church_key } : { key: req.churchKey },
              hqBranch: hqBranch ? { key: hqBranch.branch_key } : { key: req.hqBranchKey },
            },
        { dryRun: true, planned }
      );
    }

    await session.commitIfManaged();

    const anyCreated = created.church || created.hqBranch;
    return success(
      anyCreated ? STATUS.PROVISIONED : STATUS.ALREADY_PROVISIONED,
      created,
      mapRecords(organization, church, hqBranch)
    );
  } catch (err) {
    if (session) await session.safeRollbackOnError();
    return fail(STATUS.TRANSACTION_ERROR, "transaction_error");
  } finally {
    if (session) session.releaseIfOwned();
  }
}

module.exports = {
  STATUS,
  validateAndNormalizeInput,
  provisionBlessBoardChurch,
};
