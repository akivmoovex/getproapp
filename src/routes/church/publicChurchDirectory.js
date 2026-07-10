"use strict";

const { getPgPool } = require("../../db/pg");
const directoryRepo = require("../../db/pg/church/publicChurchDirectoryRepo");
const { churchPublicUrl } = require("../../church/platformProvisioningValidation");
const {
  BLESSBOARD_NAME,
  BLESSBOARD_TAGLINE,
  BLESSBOARD_PUBLIC_URL,
} = require("../../church/branding");
const {
  isSafeSlug,
  normalizeSlug,
  readChurchSelectionPreference,
  setChurchSelectionPreference,
  clearChurchSelectionPreference,
} = require("../../church/churchSelectionPreference");

const ADMIN_INTENTS = new Set(["admin", "branch-admin"]);

function requireApex(req, res, next) {
  const ctx = req.churchContext;
  if (!ctx || ctx.kind !== "vertical-apex") {
    return res.status(404).type("text").send("Not found.");
  }
  return next();
}

function parseIntent(raw) {
  const v = String(raw || "")
    .toLowerCase()
    .trim();
  return ADMIN_INTENTS.has(v) ? "admin" : "member";
}

function destinationPathForIntent(intent) {
  return intent === "admin" ? "/branch/login" : "/";
}

function apexShellLocals(extra = {}) {
  return {
    pageTitle: extra.pageTitle || "Find Your Church",
    churchName: BLESSBOARD_NAME,
    metaDescription: extra.metaDescription || BLESSBOARD_TAGLINE,
    isVerticalApex: true,
    activePage: extra.activePage || "churches",
    welcomeMessage: extra.welcomeMessage || BLESSBOARD_TAGLINE,
    blessboardPublicUrl: BLESSBOARD_PUBLIC_URL,
    ...extra,
  };
}

function buildSearchQuery(filters, page) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.intent === "admin") params.set("for", "admin");
  if (page && page > 1) params.set("page", String(page));
  const s = params.toString();
  return s ? `?${s}` : "";
}

/**
 * Validate remembered preference against live active data.
 * Clears cookie when invalid.
 */
async function resolveRememberedChurch(req, res, pool) {
  const pref = readChurchSelectionPreference(req);
  if (!pref) return null;
  if (!pool) {
    clearChurchSelectionPreference(res, req);
    return null;
  }
  try {
    const resolved = await directoryRepo.findActivePublicBranchForOrganization(
      pool,
      pref.churchSlug,
      pref.branchSlug
    );
    if (!resolved) {
      clearChurchSelectionPreference(res, req);
      return null;
    }
    return {
      churchSlug: resolved.organization_slug,
      churchName: resolved.organization_name,
      branchSlug: resolved.branch_slug,
      branchName: resolved.branch_name,
      hostSlug: resolved.host_slug,
      continueUrl: churchPublicUrl(resolved.host_slug, "/"),
    };
  } catch {
    clearChurchSelectionPreference(res, req);
    return null;
  }
}

function registerPublicChurchDirectoryRoutes(router) {
  router.get("/churches/search", requireApex, (req, res) => {
    const q = directoryRepo.normalizeSearchQuery(req.query.q);
    const intent = parseIntent(req.query.for);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (intent === "admin") params.set("for", "admin");
    const qs = params.toString();
    return res.redirect(302, qs ? `/churches?${qs}` : "/churches");
  });

  router.get("/churches", requireApex, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const q = directoryRepo.normalizeSearchQuery(req.query.q);
      const page = Number(req.query.page) || 1;
      const intent = parseIntent(req.query.for);
      const searched = Boolean(String(req.query.q || "").trim().length);

      let results = { items: [], total: 0, page: 1, limit: directoryRepo.DEFAULT_PAGE_SIZE, totalPages: 0, q };
      let dbUnavailable = false;

      if (!pool) {
        dbUnavailable = true;
      } else {
        try {
          results = await directoryRepo.searchPublicOrganizations(pool, { q, page });
        } catch {
          dbUnavailable = true;
          results = { items: [], total: 0, page: 1, limit: directoryRepo.DEFAULT_PAGE_SIZE, totalPages: 0, q };
        }
      }

      const filters = { q: results.q, intent };
      return res.render(
        "church/public/churches",
        apexShellLocals({
          pageTitle: intent === "admin" ? "Find Your Church — Administrator" : "Find Your Church",
          activePage: "churches",
          intent,
          searchQuery: results.q,
          searched,
          churches: results.items,
          total: results.total,
          page: results.page,
          totalPages: results.totalPages,
          prevUrl: results.page > 1 ? `/churches${buildSearchQuery(filters, results.page - 1)}` : null,
          nextUrl:
            results.totalPages > 0 && results.page < results.totalPages
              ? `/churches${buildSearchQuery(filters, results.page + 1)}`
              : null,
          dbUnavailable,
          noResults: !dbUnavailable && searched && results.total === 0,
          emptyDirectory: !dbUnavailable && !searched && results.total === 0,
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get("/churches/:churchSlug", requireApex, async (req, res, next) => {
    try {
      const churchSlug = normalizeSlug(req.params.churchSlug);
      if (!churchSlug || !isSafeSlug(churchSlug)) {
        return res.status(404).render(
          "church/public/church_unavailable",
          apexShellLocals({
            pageTitle: "Church not found",
            message: "We could not find that church.",
            activePage: "churches",
          })
        );
      }

      const intent = parseIntent(req.query.for);
      const pool = getPgPool();
      if (!pool) {
        return res.status(503).render(
          "church/public/church_unavailable",
          apexShellLocals({
            pageTitle: "Temporarily unavailable",
            message: "Church directory is temporarily unavailable. Please try again shortly.",
            activePage: "churches",
          })
        );
      }

      const org = await directoryRepo.findActivePublicOrganizationBySlug(pool, churchSlug);
      if (!org) {
        return res.status(404).render(
          "church/public/church_unavailable",
          apexShellLocals({
            pageTitle: "Church not found",
            message: "We could not find that church.",
            activePage: "churches",
          })
        );
      }

      const branches = await directoryRepo.listActivePublicBranchesForOrganization(pool, org.id);
      if (branches.length === 0) {
        return res.status(404).render(
          "church/public/church_unavailable",
          apexShellLocals({
            pageTitle: org.name,
            church: org,
            message: "This church does not currently have an active branch available online.",
            activePage: "churches",
          })
        );
      }

      if (branches.length === 1) {
        // Intentional: Set-Cookie on this GET redirect is a navigation preference only
        // (same slug payload as POST .../open). Tenant auth still resolves from host_slug.
        const branch = branches[0];
        setChurchSelectionPreference(res, req, {
          churchSlug: org.slug,
          branchSlug: branch.slug,
        });
        const dest = churchPublicUrl(branch.host_slug, destinationPathForIntent(intent));
        if (!dest) {
          return res.status(404).render(
            "church/public/church_unavailable",
            apexShellLocals({
              pageTitle: "Church not found",
              message: "We could not find that church.",
              activePage: "churches",
            })
          );
        }
        return res.redirect(302, dest);
      }

      const qs = intent === "admin" ? "?for=admin" : "";
      return res.redirect(302, `/churches/${encodeURIComponent(org.slug)}/branches${qs}`);
    } catch (e) {
      return next(e);
    }
  });

  router.get("/churches/:churchSlug/branches", requireApex, async (req, res, next) => {
    try {
      const churchSlug = normalizeSlug(req.params.churchSlug);
      if (!churchSlug || !isSafeSlug(churchSlug)) {
        return res.status(404).render(
          "church/public/church_unavailable",
          apexShellLocals({
            pageTitle: "Church not found",
            message: "We could not find that church.",
            activePage: "churches",
          })
        );
      }

      const intent = parseIntent(req.query.for);
      const branchFilter = directoryRepo.normalizeSearchQuery(req.query.q);
      const pool = getPgPool();
      if (!pool) {
        return res.status(503).render(
          "church/public/church_unavailable",
          apexShellLocals({
            pageTitle: "Temporarily unavailable",
            message: "Church directory is temporarily unavailable. Please try again shortly.",
            activePage: "churches",
          })
        );
      }

      const org = await directoryRepo.findActivePublicOrganizationBySlug(pool, churchSlug);
      if (!org) {
        return res.status(404).render(
          "church/public/church_unavailable",
          apexShellLocals({
            pageTitle: "Church not found",
            message: "We could not find that church.",
            activePage: "churches",
          })
        );
      }

      const branches = await directoryRepo.listActivePublicBranchesForOrganization(pool, org.id, {
        q: branchFilter,
      });

      if (!branchFilter && branches.length === 0) {
        return res.status(404).render(
          "church/public/church_unavailable",
          apexShellLocals({
            pageTitle: org.name,
            church: org,
            message: "This church does not currently have an active branch available online.",
            activePage: "churches",
          })
        );
      }

      if (!branchFilter && branches.length === 1) {
        // Intentional GET Set-Cookie: navigation preference only (see churchSelectionPreference.js).
        const branch = branches[0];
        setChurchSelectionPreference(res, req, {
          churchSlug: org.slug,
          branchSlug: branch.slug,
        });
        const dest = churchPublicUrl(branch.host_slug, destinationPathForIntent(intent));
        return res.redirect(302, dest);
      }

      return res.render(
        "church/public/church_branches",
        apexShellLocals({
          pageTitle: `Select a branch — ${org.name}`,
          activePage: "churches",
          intent,
          church: org,
          branches,
          branchFilter,
          openActionBase: `/churches/${encodeURIComponent(org.slug)}/branches`,
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.post("/churches/:churchSlug/branches/:branchSlug/open", requireApex, async (req, res, next) => {
    try {
      const churchSlug = normalizeSlug(req.params.churchSlug);
      const branchSlug = normalizeSlug(req.params.branchSlug);
      const intent = parseIntent(req.body && req.body.for);

      if (!churchSlug || !branchSlug || !isSafeSlug(churchSlug) || !isSafeSlug(branchSlug)) {
        clearChurchSelectionPreference(res, req);
        return res.redirect(302, "/churches");
      }

      const pool = getPgPool();
      if (!pool) {
        return res.status(503).render(
          "church/public/church_unavailable",
          apexShellLocals({
            pageTitle: "Temporarily unavailable",
            message: "Church directory is temporarily unavailable. Please try again shortly.",
            activePage: "churches",
          })
        );
      }

      const resolved = await directoryRepo.findActivePublicBranchForOrganization(
        pool,
        churchSlug,
        branchSlug
      );
      if (!resolved) {
        clearChurchSelectionPreference(res, req);
        return res.status(404).render(
          "church/public/church_unavailable",
          apexShellLocals({
            pageTitle: "Branch not available",
            message: "This church does not currently have an active branch available online.",
            activePage: "churches",
          })
        );
      }

      // Ownership already enforced by join on organization slug + branch slug in the query.
      setChurchSelectionPreference(res, req, {
        churchSlug: resolved.organization_slug,
        branchSlug: resolved.branch_slug,
      });

      const dest = churchPublicUrl(resolved.host_slug, destinationPathForIntent(intent));
      if (!dest || !dest.startsWith("https://")) {
        clearChurchSelectionPreference(res, req);
        return res.redirect(302, "/churches");
      }
      return res.redirect(303, dest);
    } catch (e) {
      return next(e);
    }
  });

  router.post("/churches/preference/clear", requireApex, (req, res) => {
    clearChurchSelectionPreference(res, req);
    return res.redirect(303, "/churches");
  });
}

module.exports = registerPublicChurchDirectoryRoutes;
module.exports.resolveRememberedChurch = resolveRememberedChurch;
module.exports.parseIntent = parseIntent;
