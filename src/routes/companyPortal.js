const express = require("express");
const fs = require("fs");
const path = require("path");
const {
  requireCompanyPersonnelAuth,
  authenticateCompanyPersonnel,
  setCompanyPersonnelSession,
  clearCompanyPersonnelSession,
  getCompanyPersonnelSession,
  isCompanyPortalLoginBlocked,
  recordCompanyPortalLoginFailure,
  clearCompanyPortalLoginFailures,
} = require("../auth/companyPersonnelAuth");
const { companyPortalLoginLimiter } = require("../middleware/authRateLimit");
const { buildCompanyPageLocals } = require("../companies/companyPageRender");
const clientIntake = require("../intake/clientProjectIntake");
const {
  mapCompanyPortalAssignmentSummary,
  mapCompanyPortalAssignmentDetail,
  nextAssignmentStatusFromCompanyAction,
  assignmentStatusLabelForPortal,
} = require("../intake/intakeProjectCompanyViewModel");
const intakeProjectAllocation = require("../intake/intakeProjectAllocation");
const {
  isLeadAcceptanceBlockedByCreditWithStore,
  isLeadAcceptanceAction,
} = require("../companyPortal/companyPortalLeadCredits");
const {
  buildCompanyPortalLeadCardVm,
  buildCompanyPortalLeadDetailVm,
} = require("../companyPortal/companyPortalLeadPresentation");
const { getPgPool } = require("../db/pg");
const companiesRepo = require("../db/pg/companiesRepo");
const companyPortalLeadsRepo = require("../db/pg/companyPortalLeadsRepo");
const intakeProjectImagesRepo = require("../db/pg/intakeProjectImagesRepo");

const COMPANY_LEADS_SCOPES = new Set(["active", "declined", "all"]);

function tenantUrlPrefixFromReq(req) {
  const p = req.tenantUrlPrefix != null ? String(req.tenantUrlPrefix) : "";
  return p;
}

function requirePublicTenant(req, res, next) {
  if (!req.tenant || !req.tenant.id) {
    return res.status(404).type("text").send("Region not found.");
  }
  return next();
}

/** Mounted at `/company` and `/provider`; paths below are relative to mount. */
function providerBasePath(req) {
  const b = req.baseUrl != null && String(req.baseUrl).length > 0 ? String(req.baseUrl) : "/company";
  return b.replace(/\/$/, "") || "/company";
}

module.exports = function companyPortalRoutes() {
  const router = express.Router();

  router.use((req, res, next) => {
    res.locals.providerPortalBasePath = providerBasePath(req);
    next();
  });

  router.get("/login", requirePublicTenant, (req, res) => {
    const pb = providerBasePath(req);
    if (getCompanyPersonnelSession(req)) {
      return res.redirect(`${pb}/leads`);
    }
    return res.render("company_login", {
      tenant: req.tenant,
      tenantUrlPrefix: tenantUrlPrefixFromReq(req),
      providerPortalBasePath: pb,
      error: String((req.query && req.query.error) || "").trim().slice(0, 300),
    });
  });

  router.post("/login", requirePublicTenant, companyPortalLoginLimiter, async (req, res) => {
    const tid = req.tenant.id;
    const pb = providerBasePath(req);
    const loginPath = `${pb}/login`;
    if (isCompanyPortalLoginBlocked(tid, req)) {
      return res.redirect(
        `${loginPath}?error=` +
          encodeURIComponent("Too many sign-in attempts from this network. Please wait a few minutes and try again.")
      );
    }
    const login = String((req.body && req.body.login) || (req.body && req.body.phone) || "").trim();
    const password = String((req.body && req.body.password) || "");
    const pool = getPgPool();
    const user = await authenticateCompanyPersonnel(pool, tid, login, password);
    if (!user) {
      recordCompanyPortalLoginFailure(tid, req);
      return res.redirect(`${loginPath}?error=` + encodeURIComponent("Invalid login or password."));
    }
    clearCompanyPortalLoginFailures(tid, req);
    setCompanyPersonnelSession(req, {
      userId: user.id,
      tenantId: tid,
      companyId: user.company_id,
      fullName: user.full_name || "",
    });
    return res.redirect(`${pb}/leads`);
  });

  router.post("/logout", (req, res) => {
    const pb = providerBasePath(req);
    clearCompanyPersonnelSession(req);
    return res.redirect(`${pb}/login`);
  });

  router.get("/", requirePublicTenant, requireCompanyPersonnelAuth, (req, res) => {
    return res.redirect(`${providerBasePath(req)}/leads`);
  });

  router.get("/leads", requirePublicTenant, requireCompanyPersonnelAuth, async (req, res, next) => {
    try {
    const tid = req.tenant.id;
    const cid = req.companyPersonnel.companyId;
    let scope = String((req.query && req.query.scope) || "active").trim().toLowerCase();
    if (!COMPANY_LEADS_SCOPES.has(scope)) scope = "active";

    const pool = getPgPool();

    let activeAssignments = [];
    let declinedAssignments = [];

    if (scope === "active" || scope === "all") {
      const activeRows = await companyPortalLeadsRepo.listAssignmentsForPortal(pool, tid, cid, "active");
      activeAssignments = activeRows.map(mapCompanyPortalAssignmentSummary).filter(Boolean);
    }
    if (scope === "declined" || scope === "all") {
      const declinedRows = await companyPortalLeadsRepo.listAssignmentsForPortal(pool, tid, cid, "declined");
      declinedAssignments = declinedRows.map(mapCompanyPortalAssignmentSummary).filter(Boolean);
    }
    const company = await companiesRepo.getPortalLeadCreditFields(pool, cid, tid);
    const budget = await clientIntake.getBudgetMetaForTenantWithStore(pool, tid);
    const blocked_credit = await isLeadAcceptanceBlockedByCreditWithStore(
      pool,
      tid,
      company && company.portal_lead_credits_balance
    );
    const activeLeadCards = activeAssignments.map((a) => buildCompanyPortalLeadCardVm(a, budget));
    const declinedLeadCards = declinedAssignments.map((a) => buildCompanyPortalLeadCardVm(a, budget));
    return res.render("company_leads", {
      tenant: req.tenant,
      tenantUrlPrefix: tenantUrlPrefixFromReq(req),
      providerPortalBasePath: providerBasePath(req),
      companyPersonnel: req.companyPersonnel,
      companyName: company ? company.name : "",
      scope,
      blocked_credit,
      activeLeadCards,
      declinedLeadCards,
      assignmentStatusLabelForPortal,
      activeCompanyNav: "leads",
    });
    } catch (e) {
      next(e);
    }
  });

  router.get("/leads/:id", requirePublicTenant, requireCompanyPersonnelAuth, async (req, res, next) => {
    try {
    const tid = req.tenant.id;
    const cid = req.companyPersonnel.companyId;
    const assignmentId = Number(req.params.id);
    if (!assignmentId || assignmentId < 1) return res.status(400).send("Invalid id.");
    const pool = getPgPool();

    const row = await companyPortalLeadsRepo.getDetailForPortal(pool, assignmentId, tid, cid);
    const detail = mapCompanyPortalAssignmentDetail(row);
    if (!detail) return res.status(404).send("Lead not found.");
    await intakeProjectAllocation.processPublishedProjectAllocation(pool, tid, detail.project_id);
    await intakeProjectAllocation.markAssignmentViewedIfAllocated(pool, tid, cid, assignmentId);
    const rowAfter = await companyPortalLeadsRepo.getDetailForPortal(pool, assignmentId, tid, cid);
    const detailFresh = mapCompanyPortalAssignmentDetail(rowAfter);
    const detailForView = detailFresh || detail;
    const imgRows = await intakeProjectImagesRepo.listByProject(pool, tid, detailForView.project_id);
    const images = imgRows.map((im) => ({ id: im.id, sort_order: im.sort_order }));
    const company = await companiesRepo.getPortalLeadCreditFields(pool, cid, tid);
    const budget = await clientIntake.getBudgetMetaForTenantWithStore(pool, tid);
    const blocked_credit = await isLeadAcceptanceBlockedByCreditWithStore(
      pool,
      tid,
      company && company.portal_lead_credits_balance
    );
    const detailVm = buildCompanyPortalLeadDetailVm(detailForView, budget);
    if (!detailVm) return res.status(404).send("Lead not found.");
    const notice = String((req.query && req.query.notice) || "").trim().slice(0, 400);
    const error = String((req.query && req.query.error) || "").trim().slice(0, 400);
    return res.render("company_lead_detail", {
      tenant: req.tenant,
      tenantUrlPrefix: tenantUrlPrefixFromReq(req),
      providerPortalBasePath: providerBasePath(req),
      companyPersonnel: req.companyPersonnel,
      companyName: company ? company.name : "",
      detail: detailVm,
      images,
      projectStatusLabel: clientIntake.intakeProjectStatusLabel(detailVm.project_status),
      assignmentStatusLabelForPortal,
      blocked_credit,
      can_accept_lead_actions: !blocked_credit,
      notice: notice || null,
      error: error || null,
      activeCompanyNav: "leads",
    });
    } catch (e) {
      next(e);
    }
  });

  router.post("/leads/:id/action", requirePublicTenant, requireCompanyPersonnelAuth, async (req, res) => {
    const tid = req.tenant.id;
    const cid = req.companyPersonnel.companyId;
    const uid = req.companyPersonnel.userId;
    const pb = providerBasePath(req);
    const assignmentId = Number(req.params.id);
    const action = String((req.body && req.body.action) || "").trim().toLowerCase();
    const note = String((req.body && req.body.note) || "").trim().slice(0, 400);
    if (!assignmentId || assignmentId < 1) return res.status(400).send("Invalid id.");
    const pool = getPgPool();
    const row = await companyPortalLeadsRepo.getIdAndStatusForCompanyAction(pool, assignmentId, tid, cid);
    if (!row) return res.status(404).send("Not found.");
    const coCredit = await companiesRepo.getPortalLeadCreditFields(pool, cid, tid);
    if (
      isLeadAcceptanceAction(action) &&
      (await isLeadAcceptanceBlockedByCreditWithStore(pool, tid, coCredit && coCredit.portal_lead_credits_balance))
    ) {
      return res.redirect(
        `${pb}/leads/${assignmentId}?error=` +
          encodeURIComponent(
            "Your account has a credit hold. You can review leads but cannot mark interest or request a callback until your balance is above the threshold."
          )
      );
    }
    const nextStatus = nextAssignmentStatusFromCompanyAction(row.status, action);
    if (!nextStatus) {
      return res.redirect(
        `${pb}/leads/${assignmentId}?error=` + encodeURIComponent("That action is not available for this lead.")
      );
    }
    await companyPortalLeadsRepo.updateStatusFromCompanyUser(pool, {
      nextStatus,
      note,
      companyUserId: uid,
      assignmentId,
      tenantId: tid,
      companyId: cid,
    });
    if (nextStatus === "declined") {
      await intakeProjectAllocation.onAssignmentDeclinedByProvider(pool, tid, assignmentId);
    }
    const okMsg =
      nextStatus === "interested"
        ? "Marked as interested."
        : nextStatus === "declined"
          ? "Lead declined."
          : "Callback requested.";
    return res.redirect(`${pb}/leads/${assignmentId}?notice=` + encodeURIComponent(okMsg));
  });

  /** Serve one intake image when the company has an active (non-declined) assignment to that project. */
  router.get("/project-files/:id", requirePublicTenant, requireCompanyPersonnelAuth, async (req, res) => {
    const tid = req.tenant.id;
    const cid = req.companyPersonnel.companyId;
    const imgId = Number(req.params.id);
    if (!imgId || imgId < 1) return res.status(400).send("Invalid id.");
    const pool = getPgPool();
    const row = await intakeProjectImagesRepo.getByIdAndTenant(pool, imgId, tid);
    if (!row) return res.status(404).send("Not found.");
    const ok = await companyPortalLeadsRepo.hasActiveAssignmentForProjectImages(pool, tid, cid, row.project_id);
    if (!ok) return res.status(404).send("Not found.");
    const abs = clientIntake.safeAbsoluteImagePath(row.image_path);
    if (!abs || !fs.existsSync(abs)) return res.status(404).send("File missing.");
    return res.type("jpeg").sendFile(path.resolve(abs));
  });

  router.get("/minisite", requirePublicTenant, requireCompanyPersonnelAuth, async (req, res, next) => {
    try {
      const tid = req.tenant.id;
      const cid = req.companyPersonnel.companyId;
      const pool = getPgPool();
      const company = await companiesRepo.getByIdAndTenantId(pool, cid, tid);
      if (!company) return res.status(404).send("Company not found.");
      const locals = await buildCompanyPageLocals(req, company, {
        companyPortalReadOnly: true,
        companyPortalLayout: true,
        companyPortalPersonnel: req.companyPersonnel,
        activeCompanyNav: "minisite",
        providerPortalBasePath: providerBasePath(req),
      });
      return res.render("company", locals);
    } catch (e) {
      return next(e);
    }
  });

  return router;
};
