"use strict";

const { getPgPool } = require("../db/pg");
const { parseChurchHost } = require("./host");
const organizationsRepo = require("../db/pg/church/organizationsRepo");
const branchesRepo = require("../db/pg/church/branchesRepo");

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
      return next();
    } catch (e) {
      return next(e);
    }
  };
}

module.exports = { createAttachChurchContext };
