"use strict";

const express = require("express");
const { findOrganizationByKey } = require("../repositories/blessBoardCatalogueRepository");
const { getBlessBoardCatalogueContext, STATUS: CTX_STATUS } = require("../services/getBlessBoardCatalogueContext");
const { buildBlessBoardTenantContext } = require("./buildBlessBoardTenantContext");
const { pageKeyFromPath, isTenantPublicPagePath, PAGE_SUFFIXES } = require("./tenantPublicPaths");
const { loadTenantPublicPageModel, KIND } = require("./loadTenantPublicPageModel");
const { renderTenantPublicPage } = require("./renderTenantPublicPage");
const { renderControlledErrorPage } = require("./renderTenantLandingPage");
const { renderWebsiteSetupPage } = require("./renderWebsiteSetupPage");
const { normalizeOrganizationKey, isReservedOrganizationKey } = require("../services/organizationKey");
const { resolveHostname } = require("../../platform/host");
const { attachWebsiteAdminChrome } = require("./attachWebsiteAdminChrome");
const {
  resolvePublicWebsiteBranch,
  STATUS: PUBLIC_BRANCH_STATUS,
} = require("../services/resolvePublicWebsiteBranch");
const { publicBranchHomePath } = require("../urls/churchUrlHelper");

/**
 * @param {{
 *   getPool: () => { query: Function, connect?: Function },
 *   getEnv?: () => NodeJS.ProcessEnv,
 * }} deps
 */
function createPathPublicRouter(deps) {
  const router = express.Router();
  const getPool = deps.getPool;
  const getEnv =
    typeof deps.getEnv === "function" ? deps.getEnv : () => process.env;

  async function resolvePathTenant(req, res, organizationKeyRaw) {
    const rawKey = String(organizationKeyRaw || "").trim().toLowerCase();
    if (!rawKey || isReservedOrganizationKey(rawKey)) {
      res
        .status(404)
        .type("html")
        .send(renderControlledErrorPage(404, "This BlessBoard site could not be found."));
      return null;
    }

    const keyNorm = normalizeOrganizationKey(rawKey);
    if (!keyNorm.ok || keyNorm.key !== rawKey) {
      res
        .status(404)
        .type("html")
        .send(renderControlledErrorPage(404, "This BlessBoard site could not be found."));
      return null;
    }

    let org;
    try {
      org = await findOrganizationByKey(getPool(), keyNorm.key);
    } catch {
      res
        .status(503)
        .type("html")
        .send(renderControlledErrorPage(503, "This BlessBoard site is temporarily unavailable."));
      return null;
    }

    if (!org || String(org.status || "") === "retired" || String(org.status || "") === "inactive") {
      res
        .status(404)
        .type("html")
        .send(renderControlledErrorPage(404, "This BlessBoard site could not be found."));
      return null;
    }

    let catalogue;
    try {
      catalogue = await getBlessBoardCatalogueContext(getPool(), org.id);
    } catch {
      res
        .status(503)
        .type("html")
        .send(renderControlledErrorPage(503, "This BlessBoard site is temporarily unavailable."));
      return null;
    }

    if (!catalogue.ok || !catalogue.context) {
      if (
        catalogue.status === CTX_STATUS.ORGANIZATION_NOT_FOUND ||
        catalogue.status === CTX_STATUS.CHURCH_MISSING
      ) {
        res
          .status(404)
          .type("html")
          .send(renderControlledErrorPage(404, "This BlessBoard site could not be found."));
        return null;
      }
      res
        .status(503)
        .type("html")
        .send(renderControlledErrorPage(503, "This BlessBoard site is temporarily unavailable."));
      return null;
    }

    const tenant = buildBlessBoardTenantContext({
      organization: {
        id: catalogue.context.organization.id,
        key: catalogue.context.organization.key,
      },
      church: catalogue.context.church
        ? {
            id: catalogue.context.church.id,
            churchKey: catalogue.context.church.key,
            displayName: catalogue.context.church.displayName,
            dataEnvironment: catalogue.context.church.dataEnvironment,
          }
        : null,
      hqBranch: catalogue.context.hqBranch
        ? {
            id: catalogue.context.hqBranch.id,
            branchKey: catalogue.context.hqBranch.key,
            displayName: catalogue.context.hqBranch.displayName,
          }
        : null,
      primaryBranch: catalogue.context.primaryBranch
        ? {
            id: catalogue.context.primaryBranch.id,
            branchKey: catalogue.context.primaryBranch.key,
            displayName: catalogue.context.primaryBranch.displayName,
          }
        : null,
    });

    if (!tenant) {
      res
        .status(503)
        .type("html")
        .send(renderControlledErrorPage(503, "This BlessBoard site is temporarily unavailable."));
      return null;
    }

    return { tenant, organizationKey: keyNorm.key };
  }

  async function renderPublicModel(req, res, opts) {
    const { tenant, pageKey, pathPrefix, selectedBranch, routingMode } = opts;
    const hostname = resolveHostname(req) || String(req.hostname || "");

    let model;
    try {
      model = await loadTenantPublicPageModel(getPool(), {
        tenant,
        pageKey,
        hostname,
        pathPrefix,
        selectedBranch: selectedBranch || null,
        routingMode: routingMode || "path",
      });
    } catch {
      return res
        .status(503)
        .type("html")
        .send(renderControlledErrorPage(503, "This BlessBoard site is temporarily unavailable."));
    }

    if (model.kind === KIND.UNAVAILABLE) {
      return res
        .status(503)
        .type("html")
        .send(renderControlledErrorPage(503, "This BlessBoard site is temporarily unavailable."));
    }

    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    if (model.kind === KIND.SETUP || (model.seo && model.seo.noindex)) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
    }

    if (model.kind === KIND.SETUP) {
      const html = renderWebsiteSetupPage({
        publicName: model.publicName,
        message: "This website is being prepared and is not public yet.",
      });
      return res.status(200).type("html").send(html);
    }

    if (model.seo && !model.seo.noindex) {
      res.removeHeader("X-Robots-Tag");
    }

    try {
      await attachWebsiteAdminChrome({
        req,
        res,
        db: getPool(),
        model,
        tenant,
        env: getEnv(),
      });
    } catch {
      model.websiteAdmin = null;
    }

    try {
      const {
        resolveTenantPortalAccess,
        publicPortalHeaderFromAccess,
      } = require("../services/resolveTenantPortalAccess");
      const sessionOk = Boolean(req.v5Session && req.v5Session.authenticated && req.v5Session.session);
      if (sessionOk) {
        const access = await resolveTenantPortalAccess({
          db: getPool(),
          userId: req.v5Session.session.userId,
          organizationId: tenant.organization.id,
          churchId: tenant.church.id,
          branchId:
            (selectedBranch && selectedBranch.id) ||
            (tenant.primaryBranch && tenant.primaryBranch.id),
          organizationStatus: tenant.organization && tenant.organization.status,
          branchStatus: tenant.primaryBranch && tenant.primaryBranch.status,
        });
        const header = publicPortalHeaderFromAccess(access);
        model.portalHref = header.portalHref;
        model.portalLabel = header.portalLabel;
        model.loginHref = null;
      } else {
        model.portalHref = null;
        model.portalLabel = null;
        model.loginHref = "/login";
      }
    } catch {
      model.portalHref = null;
      model.portalLabel = null;
      if (!model.loginHref) model.loginHref = "/login";
    }

    const html = renderTenantPublicPage(model);
    return res.status(200).type("html").send(html);
  }

  async function handlePathPublic(req, res) {
    const suffix = String(req.params[0] || "");
    const pathOnly = suffix ? `/${suffix.replace(/^\//, "")}` : "/";
    const normalizedPath =
      pathOnly.length > 1 && pathOnly.endsWith("/") ? pathOnly.slice(0, -1) : pathOnly;

    if (!isTenantPublicPagePath(normalizedPath)) {
      return res
        .status(404)
        .type("html")
        .send(renderControlledErrorPage(404, "This BlessBoard site could not be found."));
    }

    const resolved = await resolvePathTenant(req, res, req.params.organizationKey);
    if (!resolved) return;

    const pageKey = pageKeyFromPath(normalizedPath);
    return renderPublicModel(req, res, {
      tenant: resolved.tenant,
      pageKey,
      pathPrefix: `/c/${resolved.organizationKey}`,
      selectedBranch: null,
      routingMode: "path",
    });
  }

  async function handlePathBranchPublic(req, res) {
    const suffix = String(req.params[0] || "");
    const pathOnly = suffix ? `/${suffix.replace(/^\//, "")}` : "/";
    const normalizedPath =
      pathOnly.length > 1 && pathOnly.endsWith("/") ? pathOnly.slice(0, -1) : pathOnly;

    if (!isTenantPublicPagePath(normalizedPath)) {
      return res
        .status(404)
        .type("html")
        .send(renderControlledErrorPage(404, "This BlessBoard site could not be found."));
    }

    const resolved = await resolvePathTenant(req, res, req.params.organizationKey);
    if (!resolved) return;

    const branchResolved = await resolvePublicWebsiteBranch(getPool(), {
      churchId: resolved.tenant.church.id,
      branchKey: req.params.branchKey,
    });
    if (!branchResolved.ok || !branchResolved.branch) {
      if (branchResolved.status === PUBLIC_BRANCH_STATUS.LOOKUP_ERROR) {
        return res
          .status(503)
          .type("html")
          .send(renderControlledErrorPage(503, "This BlessBoard site is temporarily unavailable."));
      }
      return res
        .status(404)
        .type("html")
        .send(renderControlledErrorPage(404, "This BlessBoard site could not be found."));
    }

    const pageKey = pageKeyFromPath(normalizedPath);
    const pathPrefix = publicBranchHomePath(
      resolved.organizationKey,
      branchResolved.branch.key
    );
    return renderPublicModel(req, res, {
      tenant: resolved.tenant,
      pageKey,
      pathPrefix,
      selectedBranch: branchResolved.branch,
      routingMode: "path",
    });
  }

  // Branch mini websites first (more specific than church-wide suffixes).
  for (const suffix of PAGE_SUFFIXES) {
    const routePath = suffix
      ? `/c/:organizationKey/branches/:branchKey${suffix}`
      : "/c/:organizationKey/branches/:branchKey";
    router.get(routePath, (req, res, next) => {
      if (suffix) {
        req.params[0] = suffix.replace(/^\//, "");
      } else {
        req.params[0] = "";
      }
      Promise.resolve(handlePathBranchPublic(req, res)).catch(next);
    });
  }

  for (const suffix of PAGE_SUFFIXES) {
    const routePath = suffix ? `/c/:organizationKey${suffix}` : "/c/:organizationKey";
    router.get(routePath, (req, res, next) => {
      if (suffix) {
        req.params[0] = suffix.replace(/^\//, "");
      } else {
        req.params[0] = "";
      }
      Promise.resolve(handlePathPublic(req, res)).catch(next);
    });
  }

  return router;
}

module.exports = {
  createPathPublicRouter,
  PAGE_SUFFIXES,
};
