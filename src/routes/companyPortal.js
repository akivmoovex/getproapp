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
const { getBudgetDisplayMetaForTenant } = require("../tenants/tenantCommerceSettings");
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
  normalizePortalLeadCreditsBalance,
} = require("../companyPortal/companyPortalLeadCredits");
const { applyDealPriceDebitOnInterestedIfNeeded } = require("../intake/intakeDealAcceptanceDebit");
const {
  buildCompanyPortalLeadCardVm,
  buildCompanyPortalLeadDetailVm,
} = require("../companyPortal/companyPortalLeadPresentation");
const { getPgPool } = require("../db/pg");
const companiesRepo = require("../db/pg/companiesRepo");
const companyPortalLeadsRepo = require("../db/pg/companyPortalLeadsRepo");
const intakeProjectImagesRepo = require("../db/pg/intakeProjectImagesRepo");
const intakeDealReviewsRepo = require("../db/pg/intakeDealReviewsRepo");

const COMPANY_LEADS_SCOPES = new Set(["active", "declined", "all", "completed"]);

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
    let completedAssignments = [];

    if (scope === "active" || scope === "all") {
      const activeRows = await companyPortalLeadsRepo.listAssignmentsForPortal(pool, tid, cid, "active");
      activeAssignments = activeRows.map(mapCompanyPortalAssignmentSummary).filter(Boolean);
    }
    if (scope === "declined" || scope === "all") {
      const declinedRows = await companyPortalLeadsRepo.listAssignmentsForPortal(pool, tid, cid, "declined");
      declinedAssignments = declinedRows.map(mapCompanyPortalAssignmentSummary).filter(Boolean);
    }
    if (scope === "completed") {
      const completedRows = await companyPortalLeadsRepo.listAssignmentsForPortal(pool, tid, cid, "completed");
      completedAssignments = completedRows.map(mapCompanyPortalAssignmentSummary).filter(Boolean);
    }
    const company = await companiesRepo.getPortalLeadCreditFields(pool, cid, tid);
    const budget = await getBudgetDisplayMetaForTenant(pool, tid);
    const maxDeal = await companyPortalLeadsRepo.getMaxDealPriceForCompanyPublishedActiveAssignments(pool, tid, cid);
    const blocked_credit = await isLeadAcceptanceBlockedByCreditWithStore(
      pool,
      tid,
      company && company.portal_lead_credits_balance,
      maxDeal
    );
    const portal_credit_balance = normalizePortalLeadCreditsBalance(company && company.portal_lead_credits_balance);
    const pref = budget && budget.displayPrefix ? String(budget.displayPrefix).trim() : "";
    const code = budget && budget.code ? String(budget.code).trim() : "";
    const portal_credit_balance_display = [pref ? `${pref} ${portal_credit_balance}` : String(portal_credit_balance), code]
      .filter(Boolean)
      .join(" ");
    const acceptedDeals = await companyPortalLeadsRepo.listAcceptedDealsWithClientContact(pool, tid, cid);
    const activeLeadCards = activeAssignments.map((a) => buildCompanyPortalLeadCardVm(a, budget));
    const declinedLeadCards = declinedAssignments.map((a) => buildCompanyPortalLeadCardVm(a, budget));
    const completedLeadCards = completedAssignments.map((a) => buildCompanyPortalLeadCardVm(a, budget));
    return res.render("company_leads", {
      tenant: req.tenant,
      tenantUrlPrefix: tenantUrlPrefixFromReq(req),
      providerPortalBasePath: providerBasePath(req),
      companyPersonnel: req.companyPersonnel,
      companyName: company ? company.name : "",
      scope,
      blocked_credit,
      portal_credit_balance,
      portal_credit_balance_display,
      acceptedDeals,
      activeLeadCards,
      declinedLeadCards,
      completedLeadCards,
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
    const pst = String(detail.project_status || "").trim().toLowerCase();
    if (pst === "published") {
      await intakeProjectAllocation.processPublishedProjectAllocation(pool, tid, detail.project_id);
      await intakeProjectAllocation.markAssignmentViewedIfAllocated(pool, tid, cid, assignmentId);
    }
    const rowAfter = await companyPortalLeadsRepo.getDetailForPortal(pool, assignmentId, tid, cid);
    const detailFresh = mapCompanyPortalAssignmentDetail(rowAfter);
    const detailForView = detailFresh || detail;
    const imgRows = await intakeProjectImagesRepo.listByProject(pool, tid, detailForView.project_id);
    const images = imgRows.map((im) => ({ id: im.id, sort_order: im.sort_order }));
    const company = await companiesRepo.getPortalLeadCreditFields(pool, cid, tid);
    const budget = await getBudgetDisplayMetaForTenant(pool, tid);
    const dealForCredit =
      detailForView && detailForView.project_deal_price != null && Number.isFinite(Number(detailForView.project_deal_price))
        ? Number(detailForView.project_deal_price)
        : null;
    const blocked_credit = await isLeadAcceptanceBlockedByCreditWithStore(
      pool,
      tid,
      company && company.portal_lead_credits_balance,
      dealForCredit
    );
    const detailVm = buildCompanyPortalLeadDetailVm(detailForView, budget);
    if (!detailVm) return res.status(404).send("Lead not found.");
    const reviewPair = await intakeDealReviewsRepo.getPairByAssignment(pool, tid, assignmentId);
    const projectSt = String(detailForView.project_status || "").trim().toLowerCase();
    const assignSt = String(detailForView.assignment_status || "").trim().toLowerCase();
    const deal_review_eligible = projectSt === "closed" && assignSt === "interested";
    const provider_review_submitted = !!(reviewPair && reviewPair.provider);
    const client_review_submitted = !!(reviewPair && reviewPair.client);
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
      deal_review_eligible,
      provider_review_submitted,
      client_review_submitted,
      activeCompanyNav: "leads",
    });
    } catch (e) {
      next(e);
    }
  });

  router.post("/leads/:id/review", requirePublicTenant, requireCompanyPersonnelAuth, async (req, res) => {
    const tid = req.tenant.id;
    const cid = req.companyPersonnel.companyId;
    const pb = providerBasePath(req);
    const assignmentId = Number(req.params.id);
    const rating = Number((req.body && req.body.rating) || 0);
    const body = String((req.body && req.body.body) || "").trim().slice(0, 4000);
    if (!assignmentId || assignmentId < 1) return res.status(400).send("Invalid id.");
    const pool = getPgPool();
    const result = await intakeDealReviewsRepo.insertProviderReview(pool, {
      tenantId: tid,
      assignmentId,
      companyId: cid,
      rating,
      body,
    });
    if (!result.ok) {
      const msg =
        result.code === "duplicate"
          ? "You already submitted a review for this job."
          : result.code === "not_eligible"
            ? "Reviews are only available after the job is marked closed and you were marked interested."
            : "Could not save your review.";
      return res.redirect(`${pb}/leads/${assignmentId}?error=` + encodeURIComponent(msg));
    }
    return res.redirect(`${pb}/leads/${assignmentId}?notice=` + encodeURIComponent("Thank you — your review was saved."));
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
    const dealPrice = await companyPortalLeadsRepo.getPublishedDealPriceForCompanyAssignment(pool, assignmentId, tid, cid);
    if (
      isLeadAcceptanceAction(action) &&
      (await isLeadAcceptanceBlockedByCreditWithStore(
        pool,
        tid,
        coCredit && coCredit.portal_lead_credits_balance,
        dealPrice
      ))
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
    if (nextStatus === "interested") {
      try {
        await applyDealPriceDebitOnInterestedIfNeeded(pool, tid, assignmentId, cid);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[getpro] deal price debit on interested:", e && e.message ? e.message : e);
      }
    }
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
