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
const {
  legacyOrganizationKeyRedirectTarget,
  legacyBranchKeyRedirectTarget,
} = require("../services/organizationKeyCompat");
const { resolveHostname } = require("../../platform/host");
const { publicBranchHomePath, publicChurchHomePath } = require("../urls/churchUrlHelper");
const {
  attachWebsiteAdminChrome,
  resolveAuthorizedPublicPreview,
} = require("./attachWebsiteAdminChrome");
const {
  resolveWebsiteMode,
  WEBSITE_MODE,
  STATUS: WEBSITE_MODE_STATUS,
} = require("../services/resolveWebsiteMode");
const { normalizeBranchKey } = require("../services/listBlessBoardBranches");
const {
  PRODUCT_CODE,
  sendCanonicalPublicWebsiteRedirect,
  canonicalPublicWebsiteRedirect,
} = require("../../platform/website/publicWebsiteUrl");
const {
  legacyBranchPublicRedirectTarget,
  legacyChurchWidePageRedirectTarget,
  orgHomeRedirectTarget,
} = require("./pathPublicBranchRouting");

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

    const legacyTarget = legacyOrganizationKeyRedirectTarget(rawKey);
    if (legacyTarget) {
      const dest =
        canonicalPublicWebsiteRedirect(
          PRODUCT_CODE.BLESSBOARD,
          req.originalUrl || req.url || "",
          { remapOrganizationKey: () => legacyTarget }
        ) || publicChurchHomePath(legacyTarget);
      res.redirect(301, dest);
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
      const authorizedPreview = await resolveAuthorizedPublicPreview(
        getPool(),
        req,
        tenant,
        selectedBranch && selectedBranch.id
      );
      model = await loadTenantPublicPageModel(getPool(), {
        tenant,
        pageKey,
        hostname,
        pathPrefix,
        selectedBranch: selectedBranch || null,
        routingMode: routingMode || "path",
        preview: authorizedPreview,
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

  async function resolvePrimaryBranchKey(churchId) {
    try {
      const websiteMode = await resolveWebsiteMode(getPool(), { churchId });
      if (!websiteMode.ok) return null;
      const primary =
        websiteMode.primaryActiveBranch ||
        (websiteMode.activeBranches && websiteMode.activeBranches[0]);
      return primary && primary.key ? primary.key : null;
    } catch {
      return null;
    }
  }

  async function handleLegacyBranchPublicRedirect(req, res) {
    if (
      sendCanonicalPublicWebsiteRedirect(req, res, PRODUCT_CODE.BLESSBOARD, {
        remapOrganizationKey: (key) => legacyOrganizationKeyRedirectTarget(key) || key,
        remapBranchKey: (organizationKey, branchKey) =>
          legacyBranchKeyRedirectTarget(organizationKey, branchKey) || branchKey,
      })
    ) {
      return;
    }
    const resolved = await resolvePathTenant(req, res, req.params.organizationKey);
    if (!resolved) return;
    const suffix = String(req.params[0] || "");
    const pathOnly = suffix ? `/${suffix.replace(/^\//, "")}` : "/";
    const dest = legacyBranchPublicRedirectTarget(
      req,
      resolved.organizationKey,
      req.params.branchKey,
      pathOnly
    );
    if (!dest) {
      return res
        .status(404)
        .type("html")
        .send(renderControlledErrorPage(404, "This BlessBoard site could not be found."));
    }
    return res.redirect(301, dest);
  }

  async function handleOrgHomeRedirect(req, res) {
    if (
      sendCanonicalPublicWebsiteRedirect(req, res, PRODUCT_CODE.BLESSBOARD, {
        remapOrganizationKey: (key) => legacyOrganizationKeyRedirectTarget(key) || key,
      })
    ) {
      return;
    }
    const resolved = await resolvePathTenant(req, res, req.params.organizationKey);
    if (!resolved) return;
    const primaryBranchKey = await resolvePrimaryBranchKey(resolved.tenant.church.id);
    const dest = orgHomeRedirectTarget(req, resolved.organizationKey, primaryBranchKey);
    if (!dest) {
      return res
        .status(404)
        .type("html")
        .send(renderControlledErrorPage(404, "This BlessBoard site could not be found."));
    }
    return res.redirect(301, dest);
  }

  async function handleLegacyChurchWideRedirect(req, res) {
    if (
      sendCanonicalPublicWebsiteRedirect(req, res, PRODUCT_CODE.BLESSBOARD, {
        remapOrganizationKey: (key) => legacyOrganizationKeyRedirectTarget(key) || key,
      })
    ) {
      return;
    }
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
    const primaryBranchKey = await resolvePrimaryBranchKey(resolved.tenant.church.id);
    const dest = legacyChurchWidePageRedirectTarget(
      req,
      resolved.organizationKey,
      pageKey,
      primaryBranchKey
    );
    if (!dest) {
      return res
        .status(404)
        .type("html")
        .send(renderControlledErrorPage(404, "This BlessBoard site could not be found."));
    }
    return res.redirect(301, dest);
  }

  async function handlePathBranchPublic(req, res) {
    if (
      sendCanonicalPublicWebsiteRedirect(req, res, PRODUCT_CODE.BLESSBOARD, {
        remapOrganizationKey: (key) => legacyOrganizationKeyRedirectTarget(key) || key,
        remapBranchKey: (organizationKey, branchKey) =>
          legacyBranchKeyRedirectTarget(organizationKey, branchKey) || branchKey,
      })
    ) {
      return;
    }
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
    const branchKeyRaw = String(req.params.branchKey || "")
      .trim()
      .toLowerCase();
    const legacyBranchTarget = legacyBranchKeyRedirectTarget(
      resolved.organizationKey,
      branchKeyRaw
    );
    if (legacyBranchTarget) {
      const dest =
        canonicalPublicWebsiteRedirect(
          PRODUCT_CODE.BLESSBOARD,
          req.originalUrl || req.url || "",
          {
            remapOrganizationKey: () => resolved.organizationKey,
            remapBranchKey: () => legacyBranchTarget,
          }
        ) || publicBranchHomePath(resolved.organizationKey, legacyBranchTarget);
      return res.redirect(301, dest);
    }

    const branchKey = normalizeBranchKey(req.params.branchKey);
    if (!branchKey) {
      return res
        .status(404)
        .type("html")
        .send(renderControlledErrorPage(404, "This BlessBoard site could not be found."));
    }

    let websiteMode;
    try {
      websiteMode = await resolveWebsiteMode(getPool(), {
        churchId: resolved.tenant.church.id,
        branchKey,
      });
    } catch {
      return res
        .status(503)
        .type("html")
        .send(renderControlledErrorPage(503, "This BlessBoard site is temporarily unavailable."));
    }

    if (!websiteMode.ok) {
      if (websiteMode.status === WEBSITE_MODE_STATUS.LOOKUP_ERROR) {
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

    const activeBranch = (websiteMode.activeBranches || []).find((b) => b.key === branchKey);
    if (!activeBranch) {
      const { isLegacyPublicPageSegment } = require("./pathPublicBranchRouting");
      if (isLegacyPublicPageSegment(branchKey)) {
        const primaryBranchKey = await resolvePrimaryBranchKey(resolved.tenant.church.id);
        const dest = legacyChurchWidePageRedirectTarget(
          req,
          resolved.organizationKey,
          branchKey,
          primaryBranchKey
        );
        if (dest) return res.redirect(301, dest);
      }
      return res
        .status(404)
        .type("html")
        .send(renderControlledErrorPage(404, "This BlessBoard site could not be found."));
    }
    if (!websiteMode.requestedBranchMayHaveIndependentPublicWebsite) {
      return res
        .status(404)
        .type("html")
        .send(renderControlledErrorPage(404, "This BlessBoard site could not be found."));
    }

    const pathPrefix = publicBranchHomePath(
      resolved.organizationKey,
      activeBranch.key
    );
    return renderPublicModel(req, res, {
      tenant: resolved.tenant,
      pageKey,
      pathPrefix,
      selectedBranch: activeBranch,
      routingMode: "path",
    });
  }

  // Org-level discovery (must register before /:branchKey catch-all).
  router.get("/c/:organizationKey/sitemap.xml", (req, res, next) => {
    Promise.resolve(
      (async () => {
        if (
          sendCanonicalPublicWebsiteRedirect(req, res, PRODUCT_CODE.BLESSBOARD, {
            remapOrganizationKey: (key) => legacyOrganizationKeyRedirectTarget(key) || key,
          })
        ) {
          return;
        }
        const resolved = await resolvePathTenant(req, res, req.params.organizationKey);
        if (!resolved) return;

        const hostname = resolveHostname(req) || String(req.hostname || "");
        let websiteMode;
        try {
          websiteMode = await resolveWebsiteMode(getPool(), {
            churchId: resolved.tenant.church.id,
          });
        } catch {
          return res
            .status(503)
            .type("html")
            .send(
              renderControlledErrorPage(503, "This BlessBoard site is temporarily unavailable.")
            );
        }
        if (!websiteMode.ok) {
          return res
            .status(503)
            .type("html")
            .send(
              renderControlledErrorPage(503, "This BlessBoard site is temporarily unavailable.")
            );
        }

        const {
          buildTenantPublicDiscoveryUrls,
          buildTenantPublicSitemapXml,
        } = require("./tenantPublicDiscovery");
        const {
          resolveSitemapExcludedBranchKeys,
        } = require("../services/resolveSitemapExclusions");
        const excludeBranchKeys = await resolveSitemapExcludedBranchKeys(getPool(), {
          churchId: resolved.tenant.church.id,
          activeBranches: websiteMode.activeBranches || [],
        });

        const urls = buildTenantPublicDiscoveryUrls({
          hostname,
          routingMode: "path",
          organizationKey: resolved.organizationKey,
          websiteMode: websiteMode.websiteMode,
          activeBranches: websiteMode.activeBranches || [],
          excludeBranchKeys,
        });
        res.setHeader("Content-Type", "application/xml; charset=utf-8");
        return res.status(200).send(buildTenantPublicSitemapXml(urls));
      })()
    ).catch(next);
  });

  router.get("/c/:organizationKey/robots.txt", (req, res, next) => {
    Promise.resolve(
      (async () => {
        if (
          sendCanonicalPublicWebsiteRedirect(req, res, PRODUCT_CODE.BLESSBOARD, {
            remapOrganizationKey: (key) => legacyOrganizationKeyRedirectTarget(key) || key,
          })
        ) {
          return;
        }
        const resolved = await resolvePathTenant(req, res, req.params.organizationKey);
        if (!resolved) return;

        const hostname = resolveHostname(req) || String(req.hostname || "");
        const { buildRobotsTxt } = require("../../platform/website/seoDiscovery");
        const base = `/c/${encodeURIComponent(resolved.organizationKey)}`;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        return res.status(200).send(
          buildRobotsTxt({
            allow: true,
            sitemapUrl: hostname ? `https://${hostname}${base}/sitemap.xml` : null,
          })
        );
      })()
    ).catch(next);
  });

  // Legacy /c/:org/branches/:branch → canonical /c/:org/:branch (301).
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
      Promise.resolve(handleLegacyBranchPublicRedirect(req, res)).catch(next);
    });
  }

  // Legacy church-wide pages → primary branch (301). Register before /:branchKey catch-all.
  for (const suffix of PAGE_SUFFIXES) {
    if (!suffix) continue;
    const routePath = `/c/:organizationKey${suffix}`;
    router.get(routePath, (req, res, next) => {
      req.params[0] = suffix.replace(/^\//, "");
      Promise.resolve(handleLegacyChurchWideRedirect(req, res)).catch(next);
    });
  }

  // Org home → primary branch home (301).
  router.get("/c/:organizationKey", (req, res, next) => {
    req.params[0] = "";
    Promise.resolve(handleOrgHomeRedirect(req, res)).catch(next);
  });

  // Canonical flat branch mini-sites: /c/:org/:branchKey(/page)?
  for (const suffix of PAGE_SUFFIXES) {
    const routePath = suffix
      ? `/c/:organizationKey/:branchKey${suffix}`
      : "/c/:organizationKey/:branchKey";
    router.get(routePath, (req, res, next) => {
      if (suffix) {
        req.params[0] = suffix.replace(/^\//, "");
      } else {
        req.params[0] = "";
      }
      Promise.resolve(handlePathBranchPublic(req, res)).catch(next);
    });
  }

  return router;
}

module.exports = {
  createPathPublicRouter,
  PAGE_SUFFIXES,
};
