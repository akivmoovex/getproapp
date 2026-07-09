"use strict";

const { getPgPool } = require("../db/pg");
const { parseChurchHost, normalizeHostFromRequest } = require("./host");
const organizationsRepo = require("../db/pg/church/organizationsRepo");
const branchesRepo = require("../db/pg/church/branchesRepo");

function logChurchHostResolution(req, parsed, branch) {
  if (
    process.env.GETPRO_LOG_CHURCH_HOST !== "1" &&
    process.env.GETPRO_DEBUG_ROUTING !== "1" &&
    process.env.DEBUG_HOST !== "1"
  ) {
    return;
  }
  const host = normalizeHostFromRequest(req);
  const slug = parsed && parsed.kind === "branch" ? parsed.hostSlug || parsed.orgSlug : null;
  const branchId = branch && branch.id != null ? branch.id : null;
  const orgId =
    branch && branch.organization_id != null
      ? branch.organization_id
      : parsed && parsed.organization && parsed.organization.id != null
        ? parsed.organization.id
        : null;
  // eslint-disable-next-line no-console
  console.log(
    `[church-host] host=${host} kind=${parsed ? parsed.kind : "none"} slug=${slug || "(none)"} branchId=${branchId || "(none)"} orgId=${orgId || "(none)"}`
  );
}

/**
 * Attach req.churchContext and req.isChurchHost for church vertical hosts.
 * Must run after req.subdomain is set and before company-subdomain guards.
 */
function createAttachChurchContext() {
  return async function attachChurchContext(req, res, next) {
    try {
      const parsed = parseChurchHost(req);
      if (!parsed) {
        req.churchContext = null;
        req.isChurchHost = false;
        res.locals.churchContext = null;
        res.locals.isChurchHost = false;
        return next();
      }

      req.isChurchHost = true;
      res.locals.isChurchHost = true;

      if (parsed.kind === "vertical-apex") {
        req.churchContext = {
          kind: "vertical-apex",
          host: parsed.host,
          organization: null,
          branch: null,
          orgSlug: null,
        };
        res.locals.churchContext = req.churchContext;
        logChurchHostResolution(req, parsed, null);
        return next();
      }

      const hostSlug = parsed.hostSlug || parsed.orgSlug;
      if (!hostSlug) {
        req.churchContext = {
          kind: "branch",
          host: parsed.host,
          orgSlug: null,
          hostSlug: null,
          organization: null,
          branch: null,
        };
        res.locals.churchContext = req.churchContext;
        logChurchHostResolution(req, parsed, null);
        return next();
      }

      const pool = getPgPool();
      const branch = await branchesRepo.findBranchByHostSlug(pool, hostSlug);
      let organization = null;
      if (branch) {
        organization = await organizationsRepo.findOrganizationById(pool, branch.organization_id);
      } else {
        organization = await organizationsRepo.findOrganizationBySlug(pool, hostSlug);
      }

      req.churchContext = {
        kind: "branch",
        host: parsed.host,
        orgSlug: hostSlug,
        hostSlug,
        organization,
        branch,
      };
      res.locals.churchContext = req.churchContext;
      logChurchHostResolution(req, parsed, branch);
      return next();
    } catch (e) {
      return next(e);
    }
  };
}

module.exports = { createAttachChurchContext, logChurchHostResolution };
