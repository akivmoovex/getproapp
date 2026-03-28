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
} = require("../companyPersonnelAuth");
const { buildCompanyPageLocals, enrichCompanyWithCategory } = require("../companyPageRender");
const clientIntake = require("../clientProjectIntake");
const {
  COMPANY_PORTAL_ASSIGNMENT_LIST_SELECT,
  COMPANY_PORTAL_ASSIGNMENT_DETAIL_SELECT,
  COMPANY_PORTAL_ACTIVE_ASSIGNMENT_STATUSES,
  mapCompanyPortalAssignmentSummary,
  mapCompanyPortalAssignmentDetail,
  nextAssignmentStatusFromCompanyAction,
  assignmentStatusLabelForPortal,
} = require("../intakeProjectCompanyViewModel");

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

module.exports = function companyPortalRoutes({ db }) {
  const router = express.Router();

  router.get("/company/login", requirePublicTenant, (req, res) => {
    if (getCompanyPersonnelSession(req)) {
      return res.redirect("/company/leads");
    }
    return res.render("company_login", {
      tenant: req.tenant,
      tenantUrlPrefix: tenantUrlPrefixFromReq(req),
      error: String((req.query && req.query.error) || "").trim().slice(0, 300),
    });
  });

  router.post("/company/login", requirePublicTenant, async (req, res) => {
    const tid = req.tenant.id;
    if (isCompanyPortalLoginBlocked(tid, req)) {
      return res.redirect(
        "/company/login?error=" +
          encodeURIComponent("Too many sign-in attempts from this network. Please wait a few minutes and try again.")
      );
    }
    const login = String((req.body && req.body.login) || (req.body && req.body.phone) || "").trim();
    const password = String((req.body && req.body.password) || "");
    const user = await authenticateCompanyPersonnel(db, tid, login, password);
    if (!user) {
      recordCompanyPortalLoginFailure(tid, req);
      return res.redirect("/company/login?error=" + encodeURIComponent("Invalid login or password."));
    }
    clearCompanyPortalLoginFailures(tid, req);
    setCompanyPersonnelSession(req, {
      userId: user.id,
      tenantId: tid,
      companyId: user.company_id,
      fullName: user.full_name || "",
    });
    return res.redirect("/company/leads");
  });

  router.post("/company/logout", (req, res) => {
    clearCompanyPersonnelSession(req);
    return res.redirect("/company/login");
  });

  router.get("/company", requirePublicTenant, requireCompanyPersonnelAuth, (req, res) => {
    return res.redirect("/company/leads");
  });

  router.get("/company/leads", requirePublicTenant, requireCompanyPersonnelAuth, (req, res) => {
    const tid = req.tenant.id;
    const cid = req.companyPersonnel.companyId;
    let scope = String((req.query && req.query.scope) || "active").trim().toLowerCase();
    if (!COMPANY_LEADS_SCOPES.has(scope)) scope = "active";

    const stPlace = COMPANY_PORTAL_ACTIVE_ASSIGNMENT_STATUSES.map(() => "?").join(", ");
    const baseSql = `
      SELECT ${COMPANY_PORTAL_ASSIGNMENT_LIST_SELECT}
      FROM intake_project_assignments a
      INNER JOIN intake_client_projects p ON p.id = a.project_id AND p.tenant_id = a.tenant_id
      WHERE a.tenant_id = ? AND a.company_id = ?
    `;
    const orderSql = ` ORDER BY datetime(a.created_at) DESC, a.id DESC`;

    let activeAssignments = [];
    let declinedAssignments = [];

    if (scope === "active" || scope === "all") {
      const activeRows = db
        .prepare(`${baseSql} AND a.status IN (${stPlace})${orderSql}`)
        .all(tid, cid, ...COMPANY_PORTAL_ACTIVE_ASSIGNMENT_STATUSES);
      activeAssignments = activeRows.map(mapCompanyPortalAssignmentSummary).filter(Boolean);
    }
    if (scope === "declined" || scope === "all") {
      const declinedRows = db.prepare(`${baseSql} AND a.status = 'declined'${orderSql}`).all(tid, cid);
      declinedAssignments = declinedRows.map(mapCompanyPortalAssignmentSummary).filter(Boolean);
    }

    const company = db.prepare("SELECT * FROM companies WHERE id = ? AND tenant_id = ?").get(cid, tid);
    return res.render("company_leads", {
      tenant: req.tenant,
      tenantUrlPrefix: tenantUrlPrefixFromReq(req),
      companyPersonnel: req.companyPersonnel,
      companyName: company ? company.name : "",
      scope,
      activeAssignments,
      declinedAssignments,
      assignmentStatusLabelForPortal,
      activeCompanyNav: "leads",
    });
  });

  router.get("/company/leads/:id", requirePublicTenant, requireCompanyPersonnelAuth, (req, res) => {
    const tid = req.tenant.id;
    const cid = req.companyPersonnel.companyId;
    const assignmentId = Number(req.params.id);
    if (!assignmentId || assignmentId < 1) return res.status(400).send("Invalid id.");
    const row = db
      .prepare(
        `
        SELECT ${COMPANY_PORTAL_ASSIGNMENT_DETAIL_SELECT}
        FROM intake_project_assignments a
        INNER JOIN intake_client_projects p ON p.id = a.project_id AND p.tenant_id = a.tenant_id
        WHERE a.id = ? AND a.tenant_id = ? AND a.company_id = ?
        `
      )
      .get(assignmentId, tid, cid);
    const detail = mapCompanyPortalAssignmentDetail(row);
    if (!detail) return res.status(404).send("Lead not found.");
    const images = db
      .prepare(
        `SELECT id, sort_order FROM intake_project_images WHERE tenant_id = ? AND project_id = ? ORDER BY sort_order ASC, id ASC`
      )
      .all(tid, detail.project_id);
    const company = db.prepare("SELECT * FROM companies WHERE id = ? AND tenant_id = ?").get(cid, tid);
    const budget = clientIntake.getBudgetMetaForTenant(db, tid);
    const notice = String((req.query && req.query.notice) || "").trim().slice(0, 400);
    const error = String((req.query && req.query.error) || "").trim().slice(0, 400);
    return res.render("company_lead_detail", {
      tenant: req.tenant,
      tenantUrlPrefix: tenantUrlPrefixFromReq(req),
      companyPersonnel: req.companyPersonnel,
      companyName: company ? company.name : "",
      detail,
      images,
      budget,
      projectStatusLabel: clientIntake.intakeProjectStatusLabel(detail.project_status),
      assignmentStatusLabelForPortal,
      notice: notice || null,
      error: error || null,
      activeCompanyNav: "leads",
    });
  });

  router.post("/company/leads/:id/action", requirePublicTenant, requireCompanyPersonnelAuth, (req, res) => {
    const tid = req.tenant.id;
    const cid = req.companyPersonnel.companyId;
    const uid = req.companyPersonnel.userId;
    const assignmentId = Number(req.params.id);
    const action = String((req.body && req.body.action) || "").trim().toLowerCase();
    const note = String((req.body && req.body.note) || "").trim().slice(0, 400);
    if (!assignmentId || assignmentId < 1) return res.status(400).send("Invalid id.");
    const row = db
      .prepare(`SELECT id, status FROM intake_project_assignments WHERE id = ? AND tenant_id = ? AND company_id = ?`)
      .get(assignmentId, tid, cid);
    if (!row) return res.status(404).send("Not found.");
    const nextStatus = nextAssignmentStatusFromCompanyAction(row.status, action);
    if (!nextStatus) {
      return res.redirect(
        `/company/leads/${assignmentId}?error=` + encodeURIComponent("That action is not available for this lead.")
      );
    }
    db.prepare(
      `UPDATE intake_project_assignments SET
        status = ?,
        responded_at = datetime('now'),
        response_note = ?,
        updated_by_company_user_id = ?,
        updated_at = datetime('now')
       WHERE id = ? AND tenant_id = ? AND company_id = ?`
    ).run(nextStatus, note, uid, assignmentId, tid, cid);
    const okMsg =
      nextStatus === "interested"
        ? "Marked as interested."
        : nextStatus === "declined"
          ? "Lead declined."
          : "Callback requested.";
    return res.redirect(`/company/leads/${assignmentId}?notice=` + encodeURIComponent(okMsg));
  });

  /** Serve one intake image when the company has an active (non-declined) assignment to that project. */
  router.get("/company/project-files/:id", requirePublicTenant, requireCompanyPersonnelAuth, (req, res) => {
    const tid = req.tenant.id;
    const cid = req.companyPersonnel.companyId;
    const imgId = Number(req.params.id);
    if (!imgId || imgId < 1) return res.status(400).send("Invalid id.");
    const row = db.prepare("SELECT * FROM intake_project_images WHERE id = ? AND tenant_id = ?").get(imgId, tid);
    if (!row) return res.status(404).send("Not found.");
    const stPlace = COMPANY_PORTAL_ACTIVE_ASSIGNMENT_STATUSES.map(() => "?").join(", ");
    const ok = db
      .prepare(
        `
        SELECT 1 AS x FROM intake_project_assignments a
        WHERE a.tenant_id = ? AND a.company_id = ? AND a.project_id = ? AND a.status IN (${stPlace})
        LIMIT 1
        `
      )
      .get(tid, cid, row.project_id, ...COMPANY_PORTAL_ACTIVE_ASSIGNMENT_STATUSES);
    if (!ok) return res.status(404).send("Not found.");
    const abs = clientIntake.safeAbsoluteImagePath(row.image_path);
    if (!abs || !fs.existsSync(abs)) return res.status(404).send("File missing.");
    return res.type("jpeg").sendFile(path.resolve(abs));
  });

  router.get("/company/minisite", requirePublicTenant, requireCompanyPersonnelAuth, async (req, res, next) => {
    try {
      const tid = req.tenant.id;
      const cid = req.companyPersonnel.companyId;
      const company = enrichCompanyWithCategory(
        db,
        db.prepare("SELECT * FROM companies WHERE id = ? AND tenant_id = ?").get(cid, tid)
      );
      if (!company) return res.status(404).send("Company not found.");
      const locals = await buildCompanyPageLocals(req, db, company, {
        companyPortalReadOnly: true,
        companyPortalLayout: true,
        companyPortalPersonnel: req.companyPersonnel,
        activeCompanyNav: "minisite",
      });
      return res.render("company", locals);
    } catch (e) {
      return next(e);
    }
  });

  return router;
};
