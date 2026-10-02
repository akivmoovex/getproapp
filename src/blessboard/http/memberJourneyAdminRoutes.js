"use strict";

/**
 * HQ member-journey workflow routes (testing surface).
 */

const express = require("express");
const { renderV5Ejs } = require("./v5EjsTemplateCache");
const {
  createRequireBlessBoardPermission,
} = require("./requireBlessBoardPermission");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { createRejectApex } = require("./rejectApex");
const { buildHqAdminShellLocals } = require("./hqAdminShellLocals");
const {
  CSRF_FIELD,
  validateCsrf,
} = require("../../platform/http/v5Csrf");
const handoverSvc = require("../services/memberJourneyHandoverService");
const domainSvc = require("../services/memberJourneyDomainService");
const workflowSvc = require("../services/memberJourneyWorkflowService");
const {
  resolveBlessBoardFormPhone,
  blessBoardPhoneFieldLocals,
} = require("../services/resolveBlessBoardFormPhone");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PAGE_SIZE = 50;

const PROGRAM_TYPES = Object.freeze([
  "orientation",
  "salvation",
  "foundation",
  "establishment",
  "special",
]);

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sendControlled(req, res, status, message) {
  const safe = escapeHtml(message);
  const wantsHtml = String(req.get("accept") || "").includes("text/html");
  if (!wantsHtml) return res.status(status).type("text").send(String(message || ""));
  return res.status(status).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Member journey</title>
<link rel="stylesheet" href="/blessboard/v5/hq-admin.css?v=75"/></head>
<body class="bb-hq-body"><main class="bb-hq-login-unavailable">
<h1>${status === 401 ? "Sign-in required" : "Unavailable"}</h1>
<p>${safe}</p><p><a href="/hq">HQ home</a></p></main></body></html>`);
}

function parsePage(query) {
  const page = Math.max(parseInt(String((query && query.page) || "1"), 10) || 1, 1);
  return { page, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE };
}

function contactEditable(contact) {
  if (!contact) return false;
  return !["linked", "closed", "archived"].includes(String(contact.status || ""));
}

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 * }} deps
 */
function createMemberJourneyAdminRouter(deps) {
  const router = express.Router();
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const isProduction = String(env.NODE_ENV || "") === "production";

  const requireHandoverView = createRequireBlessBoardPermission(
    "journey_handovers.view_status",
    null,
    { getPool, scopeMode: "church" }
  );
  const requireContactsView = createRequireBlessBoardPermission(
    "journey_contacts.view_team",
    null,
    { getPool, scopeMode: "church" }
  );
  const requireCellsView = createRequireBlessBoardPermission("cells.view", null, {
    getPool,
    scopeMode: "church",
  });
  const requireClassesView = createRequireBlessBoardPermission("classes.view", null, {
    getPool,
    scopeMode: "church",
  });
  const requireDepartmentsView = createRequireBlessBoardPermission("departments.view", null, {
    getPool,
    scopeMode: "church",
  });

  const rejectApex = createRejectApex({
    isApexHost,
    mode: "unlessTenant",
    sendUnavailable: (req, res) => sendControlled(req, res, 404, "Not found on this host."),
  });

  /** Session + tenant only — journey RBAC permissions gate access (not HQ-role-only). */
  function gateStaff(req, res, next) {
    if (!(req.v5Session && req.v5Session.authenticated)) {
      if (String(req.get("accept") || "").includes("text/html")) {
        return res.redirect(
          303,
          `/login?next=${encodeURIComponent(req.originalUrl || "/hq/member-journey")}`
        );
      }
      return sendControlled(req, res, 401, "Sign-in is required.");
    }
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || tenant.resolved !== true) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    return next();
  }

  async function shellLocals(req, res, extra) {
    const pageTitle =
      (extra && extra.pageTitle) ||
      (extra && extra.activeNav === "cells"
        ? "Cells"
        : extra && extra.activeNav === "classes"
          ? "Classes"
          : extra && extra.activeNav === "departments"
            ? "Departments"
            : "Member journey");
    return buildHqAdminShellLocals(req, res, {
      env,
      isProduction,
      getPool,
      activeNav: (extra && extra.activeNav) || "member-journey",
      pageTitle,
      extra,
    });
  }

  function tenantIds(req) {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.organization || !tenant.church || !tenant.primaryBranch) return null;
    return {
      tenant,
      organizationId: tenant.organization.id,
      churchId: tenant.church.id,
      branchId: tenant.primaryBranch.id,
      actorUserId: req.v5Session.session.userId,
    };
  }

  function requireCsrf(req, res) {
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
      res.status(403).type("text").send("Invalid or missing CSRF token.");
      return false;
    }
    return true;
  }

  function redirectWith(res, path, kind, code) {
    const sep = path.includes("?") ? "&" : "?";
    return res.redirect(303, `${path}${sep}${kind}=${encodeURIComponent(code || "ok")}`);
  }

  async function loadHandoverForStaleCheck(ids, handoverId, expectedStatus) {
    const detail = await workflowSvc.getHandoverDetail(getPool(), {
      actorUserId: ids.actorUserId,
      organizationId: ids.organizationId,
      churchId: ids.churchId,
      branchId: ids.branchId,
      tenantContext: ids.tenant,
      handoverId,
    });
    if (!detail.ok || !detail.handover) {
      return { ok: false, reason: detail.reason || "not_found" };
    }
    if (String(detail.handover.status) !== String(expectedStatus || "")) {
      return { ok: false, reason: "stale", handover: detail.handover };
    }
    return { ok: true, handover: detail.handover, events: detail.events || [] };
  }

  // ── Dashboard ───────────────────────────────────────────────────────────

  router.get("/hq/member-journey", rejectApex, gateStaff, requireHandoverView, async (req, res) => {
    const ids = tenantIds(req);
    if (!ids) return sendControlled(req, res, 403, "You do not have access to this site.");
    const counted = await workflowSvc.getDashboardCounts(getPool(), {
      actorUserId: ids.actorUserId,
      organizationId: ids.organizationId,
      churchId: ids.churchId,
      branchId: ids.branchId,
      tenantContext: ids.tenant,
    });
    const html = renderV5Ejs(
      "hq/member-journey.ejs",
      await shellLocals(req, res, {
        pageTitle: "Member journey",
        activeNav: "member-journey",
        counts: counted.ok ? counted.counts : null,
        notice: req.query.notice || null,
        error: req.query.error || null,
      })
    );
    return res.status(200).type("html").send(html);
  });

  // ── Contacts ────────────────────────────────────────────────────────────

  router.get(
    "/hq/member-journey/contacts",
    rejectApex,
    gateStaff,
    requireContactsView,
    async (req, res) => {
      const ids = tenantIds(req);
      if (!ids) return sendControlled(req, res, 403, "You do not have access to this site.");
      const { page, limit, offset } = parsePage(req.query);
      const q = String(req.query.q || "").trim();
      const sourceType = String(req.query.sourceType || "").trim();
      const listed = await workflowSvc.listJourneyContacts(getPool(), {
        actorUserId: ids.actorUserId,
        organizationId: ids.organizationId,
        churchId: ids.churchId,
        branchId: ids.branchId,
        tenantContext: ids.tenant,
        q,
        sourceType,
        limit,
        offset,
      });
      const total = listed.ok ? listed.total : 0;
      const html = renderV5Ejs(
        "hq/member-journey-contacts.ejs",
        await shellLocals(req, res, {
          pageTitle: "Journey contacts",
          activeNav: "member-journey",
          contacts: listed.ok ? listed.contacts : [],
          total,
          page,
          pageSize: limit,
          q,
          sourceType,
          form: {},
          duplicateMatches: [],
          followUpStatuses: workflowSvc.FOLLOW_UP_STATUSES,
          notice: req.query.notice || null,
          error: req.query.error || null,
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  router.get(
    "/hq/member-journey/contacts/:id",
    rejectApex,
    gateStaff,
    requireContactsView,
    async (req, res) => {
      const ids = tenantIds(req);
      if (!ids) return sendControlled(req, res, 403, "You do not have access to this site.");
      const id = String(req.params.id || "").trim();
      if (!UUID_RE.test(id)) return sendControlled(req, res, 404, "Not found.");
      const got = await workflowSvc.getJourneyContact(getPool(), {
        actorUserId: ids.actorUserId,
        organizationId: ids.organizationId,
        churchId: ids.churchId,
        branchId: ids.branchId,
        tenantContext: ids.tenant,
        contactId: id,
      });
      if (!got.ok || !got.contact) {
        return sendControlled(req, res, got.status === "forbidden" ? 403 : 404, "Not found.");
      }
      const listed = await handoverSvc.listHandovers(getPool(), {
        actorUserId: ids.actorUserId,
        organizationId: ids.organizationId,
        churchId: ids.churchId,
        branchId: ids.branchId,
        tenantContext: ids.tenant,
      });
      const related = (listed.ok ? listed.handovers : []).filter(
        (h) => h.journeyContactId && String(h.journeyContactId) === id
      );
      const html = renderV5Ejs(
        "hq/member-journey-contact-detail.ejs",
        await shellLocals(req, res, {
          pageTitle: "Journey contact",
          activeNav: "member-journey",
          contact: got.contact,
          contactEditable: contactEditable(got.contact),
          handovers: related,
          stages: handoverSvc.STAGES,
          followUpStatuses: workflowSvc.FOLLOW_UP_STATUSES,
          previousStageMayEdit: handoverSvc.previousStageMayEdit,
          notice: req.query.notice || null,
          error: req.query.error || null,
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  router.post("/hq/member-journey/contacts", rejectApex, gateStaff, async (req, res) => {
    const ids = tenantIds(req);
    if (!ids) return sendControlled(req, res, 403, "You do not have access to this site.");
    if (!requireCsrf(req, res)) return;

    const body = req.body || {};
    
    // Resolve phone from split fields (required)
    const phoneResolved = resolveBlessBoardFormPhone(body, {
      required: true,
      env: ids.env,
      allowLegacyPhone: false,
    });
    if (!phoneResolved.result.ok) {
      const form = {
        firstName: body.firstName || "",
        lastName: body.lastName || "",
        email: body.email || "",
        phoneCountry: phoneResolved.fields.phoneCountry,
        phoneNational: phoneResolved.fields.phoneNational,
        phone: phoneResolved.fields.phone,
        sourceType: body.sourceType || "manual",
      };
      const { page, limit, offset } = parsePage({});
      const listed = await workflowSvc.listJourneyContacts(getPool(), {
        actorUserId: ids.actorUserId,
        organizationId: ids.organizationId,
        churchId: ids.churchId,
        branchId: ids.branchId,
        tenantContext: ids.tenant,
        limit,
        offset,
      });
      const phoneLocals = blessBoardPhoneFieldLocals({
        env: ids.env,
        selectedCountry: phoneResolved.fields.phoneCountry,
        nationalValue: phoneResolved.fields.phoneNational,
      });
      const html = renderV5Ejs(
        "hq/member-journey-contacts.ejs",
        await shellLocals(req, res, {
          pageTitle: "Journey contacts",
          activeNav: "member-journey",
          contacts: listed.ok ? listed.contacts : [],
          total: listed.ok ? listed.total : 0,
          page,
          pageSize: limit,
          q: "",
          sourceType: "",
          form,
          loadPhoneField: true,
          ...phoneLocals,
          duplicateMatches: [],
          followUpStatuses: workflowSvc.FOLLOW_UP_STATUSES,
          notice: null,
          error: "phone",
        })
      );
      return res.status(400).type("html").send(html);
    }
    
    const form = {
      firstName: body.firstName || "",
      lastName: body.lastName || "",
      email: body.email || "",
      phone: phoneResolved.e164,
      phoneCountry: phoneResolved.fields.phoneCountry,
      phoneNational: phoneResolved.fields.phoneNational,
      sourceType: body.sourceType || "manual",
    };

    const dups = await workflowSvc.findContactDuplicates(getPool(), {
      churchId: ids.churchId,
      email: form.email || null,
      phone: form.phone || null,
    });
    const matches = dups.ok ? dups.matches : [];
    if (matches.length && String(body.confirmDuplicates || "") !== "1") {
      const { page, limit, offset } = parsePage({});
      const listed = await workflowSvc.listJourneyContacts(getPool(), {
        actorUserId: ids.actorUserId,
        organizationId: ids.organizationId,
        churchId: ids.churchId,
        branchId: ids.branchId,
        tenantContext: ids.tenant,
        limit,
        offset,
      });
      const phoneLocals = blessBoardPhoneFieldLocals({
        env: ids.env,
        selectedCountry: form.phoneCountry,
        nationalValue: form.phoneNational,
      });
      const html = renderV5Ejs(
        "hq/member-journey-contacts.ejs",
        await shellLocals(req, res, {
          pageTitle: "Journey contacts",
          activeNav: "member-journey",
          contacts: listed.ok ? listed.contacts : [],
          total: listed.ok ? listed.total : 0,
          page,
          pageSize: limit,
          q: "",
          sourceType: "",
          form,
          loadPhoneField: true,
          ...phoneLocals,
          duplicateMatches: matches,
          followUpStatuses: workflowSvc.FOLLOW_UP_STATUSES,
          notice: null,
          error: "possible_duplicates",
        })
      );
      return res.status(200).type("html").send(html);
    }

    const created = await handoverSvc.createJourneyContact(getPool(), {
      actorUserId: ids.actorUserId,
      organizationId: ids.organizationId,
      churchId: ids.churchId,
      branchId: ids.branchId,
      tenantContext: ids.tenant,
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone,
      sourceType: form.sourceType,
    });
    if (!created.ok) {
      return redirectWith(res, "/hq/member-journey/contacts", "error", created.reason || "failed");
    }
    return redirectWith(
      res,
      `/hq/member-journey/contacts/${created.contact.id}`,
      "notice",
      "contact_created"
    );
  });

  router.post("/hq/member-journey/contacts/:id", rejectApex, gateStaff, async (req, res) => {
    const ids = tenantIds(req);
    if (!ids) return sendControlled(req, res, 403, "You do not have access to this site.");
    if (!requireCsrf(req, res)) return;
    const id = String(req.params.id || "").trim();
    if (!UUID_RE.test(id)) return sendControlled(req, res, 404, "Not found.");
    const updated = await handoverSvc.updateJourneyContact(getPool(), {
      actorUserId: ids.actorUserId,
      organizationId: ids.organizationId,
      churchId: ids.churchId,
      branchId: ids.branchId,
      tenantContext: ids.tenant,
      contactId: id,
      firstName: req.body && req.body.firstName,
      lastName: req.body && req.body.lastName,
      membershipInterest: req.body && req.body.membershipInterest,
      decisionOfFaith:
        req.body && req.body.decisionOfFaith != null
          ? String(req.body.decisionOfFaith) === "1" || req.body.decisionOfFaith === true
          : undefined,
    });
    if (!updated.ok) {
      return redirectWith(
        res,
        `/hq/member-journey/contacts/${id}`,
        "error",
        updated.reason || "failed"
      );
    }
    return redirectWith(res, `/hq/member-journey/contacts/${id}`, "notice", "contact_updated");
  });

  router.post(
    "/hq/member-journey/contacts/:id/follow-up",
    rejectApex,
    gateStaff,
    async (req, res) => {
      const ids = tenantIds(req);
      if (!ids) return sendControlled(req, res, 403, "You do not have access to this site.");
      if (!requireCsrf(req, res)) return;
      const id = String(req.params.id || "").trim();
      if (!UUID_RE.test(id)) return sendControlled(req, res, 404, "Not found.");
      const result = await workflowSvc.updateContactFollowUp(getPool(), {
        actorUserId: ids.actorUserId,
        organizationId: ids.organizationId,
        churchId: ids.churchId,
        branchId: ids.branchId,
        tenantContext: ids.tenant,
        contactId: id,
        followUpStatus: req.body && req.body.followUpStatus,
        followUpOutcomeSummary: req.body && req.body.followUpOutcomeSummary,
        followUpAssignedUserId: req.body && req.body.followUpAssignedUserId,
      });
      if (!result.ok) {
        return redirectWith(
          res,
          `/hq/member-journey/contacts/${id}`,
          "error",
          result.reason || "failed"
        );
      }
      return redirectWith(res, `/hq/member-journey/contacts/${id}`, "notice", "follow_up_updated");
    }
  );

  router.post(
    "/hq/member-journey/contacts/:id/link-member",
    rejectApex,
    gateStaff,
    async (req, res) => {
      const ids = tenantIds(req);
      if (!ids) return sendControlled(req, res, 403, "You do not have access to this site.");
      if (!requireCsrf(req, res)) return;
      const id = String(req.params.id || "").trim();
      if (!UUID_RE.test(id)) return sendControlled(req, res, 404, "Not found.");
      const result = await handoverSvc.linkJourneyContactToMember(getPool(), {
        actorUserId: ids.actorUserId,
        organizationId: ids.organizationId,
        churchId: ids.churchId,
        branchId: ids.branchId,
        tenantContext: ids.tenant,
        contactId: id,
        memberId: req.body && req.body.memberId,
      });
      if (!result.ok) {
        return redirectWith(
          res,
          `/hq/member-journey/contacts/${id}`,
          "error",
          result.reason || "failed"
        );
      }
      return redirectWith(res, `/hq/member-journey/contacts/${id}`, "notice", "member_linked");
    }
  );

  // ── Handovers ───────────────────────────────────────────────────────────

  router.get(
    "/hq/member-journey/handovers",
    rejectApex,
    gateStaff,
    requireHandoverView,
    async (req, res) => {
      const ids = tenantIds(req);
      if (!ids) return sendControlled(req, res, 403, "You do not have access to this site.");
      const listed = await handoverSvc.listHandovers(getPool(), {
        actorUserId: ids.actorUserId,
        organizationId: ids.organizationId,
        churchId: ids.churchId,
        branchId: ids.branchId,
        tenantContext: ids.tenant,
      });
      const html = renderV5Ejs(
        "hq/member-journey-handovers.ejs",
        await shellLocals(req, res, {
          pageTitle: "Handovers",
          activeNav: "member-journey",
          handovers: listed.ok ? listed.handovers : [],
          notice: req.query.notice || null,
          error: req.query.error || null,
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  router.get(
    "/hq/member-journey/handovers/:id",
    rejectApex,
    gateStaff,
    requireHandoverView,
    async (req, res) => {
      const ids = tenantIds(req);
      if (!ids) return sendControlled(req, res, 403, "You do not have access to this site.");
      const id = String(req.params.id || "").trim();
      if (!UUID_RE.test(id)) return sendControlled(req, res, 404, "Not found.");
      const detail = await workflowSvc.getHandoverDetail(getPool(), {
        actorUserId: ids.actorUserId,
        organizationId: ids.organizationId,
        churchId: ids.churchId,
        branchId: ids.branchId,
        tenantContext: ids.tenant,
        handoverId: id,
      });
      if (!detail.ok || !detail.handover) {
        return sendControlled(req, res, detail.status === "forbidden" ? 403 : 404, "Not found.");
      }
      const html = renderV5Ejs(
        "hq/member-journey-handover-detail.ejs",
        await shellLocals(req, res, {
          pageTitle: "Handover",
          activeNav: "member-journey",
          handover: detail.handover,
          events: detail.events || [],
          mayEditCore: handoverSvc.previousStageMayEdit(detail.handover.status),
          previousStageMayEdit: handoverSvc.previousStageMayEdit,
          receivingStageMayAct: handoverSvc.receivingStageMayAct,
          canTransition: handoverSvc.canTransition,
          notice: req.query.notice || null,
          error: req.query.error || null,
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  router.post("/hq/member-journey/handovers", rejectApex, gateStaff, async (req, res) => {
    const ids = tenantIds(req);
    if (!ids) return sendControlled(req, res, 403, "You do not have access to this site.");
    if (!requireCsrf(req, res)) return;
    const body = req.body || {};
    const created = await handoverSvc.createHandover(getPool(), {
      actorUserId: ids.actorUserId,
      organizationId: ids.organizationId,
      churchId: ids.churchId,
      branchId: ids.branchId,
      tenantContext: ids.tenant,
      journeyContactId: body.journeyContactId || null,
      memberId: body.memberId || null,
      fromStage: body.fromStage,
      toStage: body.toStage,
      notesSummary: body.notesSummary || null,
    });
    const back =
      body.journeyContactId && UUID_RE.test(String(body.journeyContactId))
        ? `/hq/member-journey/contacts/${body.journeyContactId}`
        : "/hq/member-journey/handovers";
    if (!created.ok) {
      return redirectWith(res, back, "error", created.reason || "failed");
    }
    return redirectWith(
      res,
      `/hq/member-journey/handovers/${created.handover.id}`,
      "notice",
      "handover_created"
    );
  });

  router.post("/hq/member-journey/handovers/:id", rejectApex, gateStaff, async (req, res) => {
    const ids = tenantIds(req);
    if (!ids) return sendControlled(req, res, 403, "You do not have access to this site.");
    if (!requireCsrf(req, res)) return;
    const id = String(req.params.id || "").trim();
    if (!UUID_RE.test(id)) return sendControlled(req, res, 404, "Not found.");
    const body = req.body || {};
    const action = String(body.action || "update").trim();
    const back = `/hq/member-journey/handovers/${id}`;

    if (action !== "update" && action !== "update_core") {
      const stale = await loadHandoverForStaleCheck(ids, id, body.expectedStatus);
      if (!stale.ok) {
        return redirectWith(res, back, "error", stale.reason || "stale");
      }
    }

    let result;
    if (action === "update" || action === "update_core") {
      result = await handoverSvc.updateHandoverCore(getPool(), {
        actorUserId: ids.actorUserId,
        churchId: ids.churchId,
        tenantContext: ids.tenant,
        handoverId: id,
        notesSummary: body.notesSummary,
      });
    } else if (action === "submit") {
      result = await handoverSvc.submitHandover(getPool(), {
        actorUserId: ids.actorUserId,
        churchId: ids.churchId,
        handoverId: id,
        tenantContext: ids.tenant,
      });
    } else if (action === "accept") {
      result = await handoverSvc.acceptHandover(getPool(), {
        actorUserId: ids.actorUserId,
        churchId: ids.churchId,
        handoverId: id,
        tenantContext: ids.tenant,
      });
    } else if (action === "return") {
      result = await handoverSvc.returnHandover(getPool(), {
        actorUserId: ids.actorUserId,
        churchId: ids.churchId,
        handoverId: id,
        returnReason: body.returnReason,
        tenantContext: ids.tenant,
      });
    } else if (action === "assign") {
      result = await handoverSvc.assignHandover(getPool(), {
        actorUserId: ids.actorUserId,
        churchId: ids.churchId,
        handoverId: id,
        assignedUserId: body.assignedUserId || null,
        assignedScopeType: body.assignedScopeType || null,
        assignedScopeId: body.assignedScopeId || null,
        tenantContext: ids.tenant,
      });
    } else if (action === "complete") {
      result = await handoverSvc.completeHandover(getPool(), {
        actorUserId: ids.actorUserId,
        churchId: ids.churchId,
        handoverId: id,
        tenantContext: ids.tenant,
      });
    } else if (action === "escalate") {
      result = await handoverSvc.escalateHandover(getPool(), {
        actorUserId: ids.actorUserId,
        churchId: ids.churchId,
        handoverId: id,
        tenantContext: ids.tenant,
      });
    } else if (action === "close") {
      result = await handoverSvc.closeHandover(getPool(), {
        actorUserId: ids.actorUserId,
        churchId: ids.churchId,
        handoverId: id,
        tenantContext: ids.tenant,
      });
    } else {
      return redirectWith(res, back, "error", "unknown_action");
    }

    if (!result.ok) {
      return redirectWith(res, back, "error", result.reason || "failed");
    }
    return redirectWith(res, back, "notice", `${action}_ok`);
  });

  // ── Cells ───────────────────────────────────────────────────────────────

  router.get("/hq/cells", rejectApex, gateStaff, requireCellsView, async (req, res) => {
    const ids = tenantIds(req);
    if (!ids) return sendControlled(req, res, 403, "You do not have access to this site.");
    const listed = await domainSvc.listCellsForBranch(getPool(), {
      actorUserId: ids.actorUserId,
      organizationId: ids.organizationId,
      churchId: ids.churchId,
      branchId: ids.branchId,
      tenantContext: ids.tenant,
    });
    const html = renderV5Ejs(
      "hq/member-journey-cells.ejs",
      await shellLocals(req, res, {
        pageTitle: "Cells",
        activeNav: "member-journey",
        cells: listed.ok ? listed.cells : [],
        notice: req.query.notice || null,
        error: req.query.error || null,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/hq/cells/:id", rejectApex, gateStaff, requireCellsView, async (req, res) => {
    const ids = tenantIds(req);
    if (!ids) return sendControlled(req, res, 403, "You do not have access to this site.");
    const id = String(req.params.id || "").trim();
    if (!UUID_RE.test(id)) return sendControlled(req, res, 404, "Not found.");
    const detail = await domainSvc.getCellDetail(getPool(), {
      actorUserId: ids.actorUserId,
      organizationId: ids.organizationId,
      churchId: ids.churchId,
      branchId: ids.branchId,
      tenantContext: ids.tenant,
      cellId: id,
    });
    if (!detail.ok || !detail.cell) {
      return sendControlled(req, res, detail.status === "forbidden" ? 403 : 404, "Not found.");
    }
    const html = renderV5Ejs(
      "hq/member-journey-cell-detail.ejs",
      await shellLocals(req, res, {
        pageTitle: "Cell",
        activeNav: "member-journey",
        cell: detail.cell,
        members: detail.members || [],
        notice: req.query.notice || null,
        error: req.query.error || null,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.post("/hq/cells", rejectApex, gateStaff, async (req, res) => {
    const ids = tenantIds(req);
    if (!ids) return sendControlled(req, res, 403, "You do not have access to this site.");
    if (!requireCsrf(req, res)) return;
    const created = await domainSvc.createCell(getPool(), {
      actorUserId: ids.actorUserId,
      organizationId: ids.organizationId,
      churchId: ids.churchId,
      branchId: ids.branchId,
      tenantContext: ids.tenant,
      cellKey: req.body && req.body.cellKey,
      displayName: req.body && req.body.displayName,
      meetingSchedule: req.body && req.body.meetingSchedule,
      meetingLocationSummary: req.body && req.body.meetingLocationSummary,
    });
    if (!created.ok) {
      return redirectWith(res, "/hq/cells", "error", created.reason || "failed");
    }
    return redirectWith(res, `/hq/cells/${created.cell.id}`, "notice", "created");
  });

  router.post("/hq/cells/:id", rejectApex, gateStaff, async (req, res) => {
    const ids = tenantIds(req);
    if (!ids) return sendControlled(req, res, 403, "You do not have access to this site.");
    if (!requireCsrf(req, res)) return;
    const id = String(req.params.id || "").trim();
    if (!UUID_RE.test(id)) return sendControlled(req, res, 404, "Not found.");
    const updated = await domainSvc.updateCell(getPool(), {
      actorUserId: ids.actorUserId,
      organizationId: ids.organizationId,
      churchId: ids.churchId,
      branchId: ids.branchId,
      tenantContext: ids.tenant,
      cellId: id,
      displayName: req.body && req.body.displayName,
      primaryLeaderUserId: (req.body && req.body.primaryLeaderUserId) || null,
      assistantLeaderUserId: (req.body && req.body.assistantLeaderUserId) || null,
      meetingSchedule: req.body && req.body.meetingSchedule,
      meetingLocationSummary: req.body && req.body.meetingLocationSummary,
    });
    if (!updated.ok) {
      return redirectWith(res, `/hq/cells/${id}`, "error", updated.reason || "failed");
    }
    return redirectWith(res, `/hq/cells/${id}`, "notice", "updated");
  });

  router.post("/hq/cells/:id/assign", rejectApex, gateStaff, async (req, res) => {
    const ids = tenantIds(req);
    if (!ids) return sendControlled(req, res, 403, "You do not have access to this site.");
    if (!requireCsrf(req, res)) return;
    const id = String(req.params.id || "").trim();
    if (!UUID_RE.test(id)) return sendControlled(req, res, 404, "Not found.");
    const result = await domainSvc.assignMemberToCell(getPool(), {
      actorUserId: ids.actorUserId,
      organizationId: ids.organizationId,
      churchId: ids.churchId,
      branchId: ids.branchId,
      tenantContext: ids.tenant,
      cellId: id,
      memberId: req.body && req.body.memberId,
    });
    if (!result.ok) {
      return redirectWith(res, `/hq/cells/${id}`, "error", result.reason || "failed");
    }
    return redirectWith(res, `/hq/cells/${id}`, "notice", "member_assigned");
  });

  router.post("/hq/cells/:id/transfer", rejectApex, gateStaff, async (req, res) => {
    const ids = tenantIds(req);
    if (!ids) return sendControlled(req, res, 403, "You do not have access to this site.");
    if (!requireCsrf(req, res)) return;
    const id = String(req.params.id || "").trim();
    if (!UUID_RE.test(id)) return sendControlled(req, res, 404, "Not found.");
    const transferReason = req.body && req.body.transferReason;
    if (!String(transferReason || "").trim()) {
      return redirectWith(res, `/hq/cells/${id}`, "error", "transfer_reason");
    }
    const result = await domainSvc.transferMemberCell(getPool(), {
      actorUserId: ids.actorUserId,
      organizationId: ids.organizationId,
      churchId: ids.churchId,
      branchId: ids.branchId,
      tenantContext: ids.tenant,
      cellId: id,
      memberId: req.body && req.body.memberId,
      transferReason,
    });
    if (!result.ok) {
      return redirectWith(res, `/hq/cells/${id}`, "error", result.reason || "failed");
    }
    return redirectWith(res, `/hq/cells/${id}`, "notice", "member_transferred");
  });

  // ── Classes ─────────────────────────────────────────────────────────────

  router.get("/hq/classes", rejectApex, gateStaff, requireClassesView, async (req, res) => {
    const ids = tenantIds(req);
    if (!ids) return sendControlled(req, res, 403, "You do not have access to this site.");
    const programs = await domainSvc.listClassPrograms(getPool(), {
      actorUserId: ids.actorUserId,
      organizationId: ids.organizationId,
      churchId: ids.churchId,
      branchId: ids.branchId,
      tenantContext: ids.tenant,
    });
    const cohorts = await domainSvc.listClassCohorts(getPool(), {
      actorUserId: ids.actorUserId,
      organizationId: ids.organizationId,
      churchId: ids.churchId,
      branchId: ids.branchId,
      tenantContext: ids.tenant,
    });
    const html = renderV5Ejs(
      "hq/member-journey-classes.ejs",
      await shellLocals(req, res, {
        pageTitle: "Classes",
        activeNav: "member-journey",
        programs: programs.ok ? programs.programs : [],
        cohorts: cohorts.ok ? cohorts.cohorts : [],
        notice: req.query.notice || null,
        error: req.query.error || null,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/hq/classes/programs", rejectApex, gateStaff, requireClassesView, async (req, res) => {
    const ids = tenantIds(req);
    if (!ids) return sendControlled(req, res, 403, "You do not have access to this site.");
    const programs = await domainSvc.listClassPrograms(getPool(), {
      actorUserId: ids.actorUserId,
      organizationId: ids.organizationId,
      churchId: ids.churchId,
      branchId: ids.branchId,
      tenantContext: ids.tenant,
    });
    const html = renderV5Ejs(
      "hq/member-journey-programs.ejs",
      await shellLocals(req, res, {
        pageTitle: "Class programs",
        activeNav: "member-journey",
        programs: programs.ok ? programs.programs : [],
        programTypes: PROGRAM_TYPES,
        notice: req.query.notice || null,
        error: req.query.error || null,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get(
    "/hq/classes/cohorts/:id",
    rejectApex,
    gateStaff,
    requireClassesView,
    async (req, res) => {
      const ids = tenantIds(req);
      if (!ids) return sendControlled(req, res, 403, "You do not have access to this site.");
      const id = String(req.params.id || "").trim();
      if (!UUID_RE.test(id)) return sendControlled(req, res, 404, "Not found.");
      const detail = await domainSvc.getCohortDetail(getPool(), {
        actorUserId: ids.actorUserId,
        organizationId: ids.organizationId,
        churchId: ids.churchId,
        branchId: ids.branchId,
        tenantContext: ids.tenant,
        cohortId: id,
      });
      if (!detail.ok || !detail.cohort) {
        return sendControlled(req, res, detail.status === "forbidden" ? 403 : 404, "Not found.");
      }
      const html = renderV5Ejs(
        "hq/member-journey-cohort-detail.ejs",
        await shellLocals(req, res, {
          pageTitle: "Class cohort",
          activeNav: "member-journey",
          cohort: detail.cohort,
          enrolments: detail.enrolments || [],
          notice: req.query.notice || null,
          error: req.query.error || null,
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  router.post("/hq/classes/programs", rejectApex, gateStaff, async (req, res) => {
    const ids = tenantIds(req);
    if (!ids) return sendControlled(req, res, 403, "You do not have access to this site.");
    if (!requireCsrf(req, res)) return;
    const created = await domainSvc.createClassProgram(getPool(), {
      actorUserId: ids.actorUserId,
      organizationId: ids.organizationId,
      churchId: ids.churchId,
      branchId: ids.branchId,
      tenantContext: ids.tenant,
      programKey: req.body && req.body.programKey,
      displayName: req.body && req.body.displayName,
      programType: req.body && req.body.programType,
    });
    if (!created.ok) {
      return redirectWith(res, "/hq/classes/programs", "error", created.reason || "failed");
    }
    return redirectWith(res, "/hq/classes/programs", "notice", "program_created");
  });

  router.post("/hq/classes/cohorts", rejectApex, gateStaff, async (req, res) => {
    const ids = tenantIds(req);
    if (!ids) return sendControlled(req, res, 403, "You do not have access to this site.");
    if (!requireCsrf(req, res)) return;
    const created = await domainSvc.createClassCohort(getPool(), {
      actorUserId: ids.actorUserId,
      organizationId: ids.organizationId,
      churchId: ids.churchId,
      branchId: ids.branchId,
      tenantContext: ids.tenant,
      programId: req.body && req.body.programId,
      cohortKey: req.body && req.body.cohortKey,
      displayName: req.body && req.body.displayName,
      teacherUserId: (req.body && req.body.teacherUserId) || null,
      startsOn: (req.body && req.body.startsOn) || null,
      endsOn: (req.body && req.body.endsOn) || null,
    });
    if (!created.ok) {
      return redirectWith(res, "/hq/classes", "error", created.reason || "failed");
    }
    return redirectWith(res, `/hq/classes/cohorts/${created.cohort.id}`, "notice", "cohort_created");
  });

  router.post("/hq/classes/cohorts/:id/enrol", rejectApex, gateStaff, async (req, res) => {
    const ids = tenantIds(req);
    if (!ids) return sendControlled(req, res, 403, "You do not have access to this site.");
    if (!requireCsrf(req, res)) return;
    const id = String(req.params.id || "").trim();
    if (!UUID_RE.test(id)) return sendControlled(req, res, 404, "Not found.");
    const result = await domainSvc.enrolMember(getPool(), {
      actorUserId: ids.actorUserId,
      organizationId: ids.organizationId,
      churchId: ids.churchId,
      branchId: ids.branchId,
      tenantContext: ids.tenant,
      cohortId: id,
      memberId: req.body && req.body.memberId,
    });
    if (!result.ok) {
      return redirectWith(res, `/hq/classes/cohorts/${id}`, "error", result.reason || "failed");
    }
    return redirectWith(res, `/hq/classes/cohorts/${id}`, "notice", "enrolled");
  });

  router.post("/hq/classes/cohorts/:id/attendance", rejectApex, gateStaff, async (req, res) => {
    const ids = tenantIds(req);
    if (!ids) return sendControlled(req, res, 403, "You do not have access to this site.");
    if (!requireCsrf(req, res)) return;
    const id = String(req.params.id || "").trim();
    if (!UUID_RE.test(id)) return sendControlled(req, res, 404, "Not found.");
    const result = await domainSvc.recordClassAttendance(getPool(), {
      actorUserId: ids.actorUserId,
      churchId: ids.churchId,
      tenantContext: ids.tenant,
      enrolmentId: req.body && req.body.enrolmentId,
    });
    if (!result.ok) {
      return redirectWith(res, `/hq/classes/cohorts/${id}`, "error", result.reason || "failed");
    }
    return redirectWith(res, `/hq/classes/cohorts/${id}`, "notice", "attendance_recorded");
  });

  router.post("/hq/classes/cohorts/:id/recommend", rejectApex, gateStaff, async (req, res) => {
    const ids = tenantIds(req);
    if (!ids) return sendControlled(req, res, 403, "You do not have access to this site.");
    if (!requireCsrf(req, res)) return;
    const id = String(req.params.id || "").trim();
    if (!UUID_RE.test(id)) return sendControlled(req, res, 404, "Not found.");
    const result = await domainSvc.recommendClassCompletion(getPool(), {
      actorUserId: ids.actorUserId,
      churchId: ids.churchId,
      tenantContext: ids.tenant,
      enrolmentId: req.body && req.body.enrolmentId,
    });
    if (!result.ok) {
      return redirectWith(res, `/hq/classes/cohorts/${id}`, "error", result.reason || "failed");
    }
    return redirectWith(res, `/hq/classes/cohorts/${id}`, "notice", "completion_recommended");
  });

  router.post("/hq/classes/cohorts/:id/approve", rejectApex, gateStaff, async (req, res) => {
    const ids = tenantIds(req);
    if (!ids) return sendControlled(req, res, 403, "You do not have access to this site.");
    if (!requireCsrf(req, res)) return;
    const id = String(req.params.id || "").trim();
    if (!UUID_RE.test(id)) return sendControlled(req, res, 404, "Not found.");
    const result = await domainSvc.approveClassCompletion(getPool(), {
      actorUserId: ids.actorUserId,
      churchId: ids.churchId,
      tenantContext: ids.tenant,
      enrolmentId: req.body && req.body.enrolmentId,
    });
    if (!result.ok) {
      return redirectWith(res, `/hq/classes/cohorts/${id}`, "error", result.reason || "failed");
    }
    return redirectWith(res, `/hq/classes/cohorts/${id}`, "notice", "completion_approved");
  });

  // ── Departments ─────────────────────────────────────────────────────────

  router.get("/hq/departments", rejectApex, gateStaff, requireDepartmentsView, async (req, res) => {
    const ids = tenantIds(req);
    if (!ids) return sendControlled(req, res, 403, "You do not have access to this site.");
    const listed = await domainSvc.listDepartmentsForBranch(getPool(), {
      actorUserId: ids.actorUserId,
      organizationId: ids.organizationId,
      churchId: ids.churchId,
      branchId: ids.branchId,
      tenantContext: ids.tenant,
    });
    const html = renderV5Ejs(
      "hq/member-journey-departments.ejs",
      await shellLocals(req, res, {
        pageTitle: "Departments",
        activeNav: "member-journey",
        departments: listed.ok ? listed.departments : [],
        notice: req.query.notice || null,
        error: req.query.error || null,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/hq/departments/:id", rejectApex, gateStaff, requireDepartmentsView, async (req, res) => {
    const ids = tenantIds(req);
    if (!ids) return sendControlled(req, res, 403, "You do not have access to this site.");
    const id = String(req.params.id || "").trim();
    if (!UUID_RE.test(id)) return sendControlled(req, res, 404, "Not found.");
    const detail = await domainSvc.getDepartmentDetail(getPool(), {
      actorUserId: ids.actorUserId,
      organizationId: ids.organizationId,
      churchId: ids.churchId,
      branchId: ids.branchId,
      tenantContext: ids.tenant,
      departmentId: id,
    });
    if (!detail.ok || !detail.department) {
      return sendControlled(req, res, detail.status === "forbidden" ? 403 : 404, "Not found.");
    }
    const html = renderV5Ejs(
      "hq/member-journey-department-detail.ejs",
      await shellLocals(req, res, {
        pageTitle: "Department",
        activeNav: "member-journey",
        department: detail.department,
        members: detail.members || [],
        notice: req.query.notice || null,
        error: req.query.error || null,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.post("/hq/departments", rejectApex, gateStaff, async (req, res) => {
    const ids = tenantIds(req);
    if (!ids) return sendControlled(req, res, 403, "You do not have access to this site.");
    if (!requireCsrf(req, res)) return;
    const created = await domainSvc.createDepartment(getPool(), {
      actorUserId: ids.actorUserId,
      organizationId: ids.organizationId,
      churchId: ids.churchId,
      branchId: ids.branchId,
      tenantContext: ids.tenant,
      departmentKey: req.body && req.body.departmentKey,
      displayName: req.body && req.body.displayName,
      ministryId: (req.body && req.body.ministryId) || null,
    });
    if (!created.ok) {
      return redirectWith(res, "/hq/departments", "error", created.reason || "failed");
    }
    return redirectWith(res, `/hq/departments/${created.department.id}`, "notice", "created");
  });

  router.post("/hq/departments/:id/members", rejectApex, gateStaff, async (req, res) => {
    const ids = tenantIds(req);
    if (!ids) return sendControlled(req, res, 403, "You do not have access to this site.");
    if (!requireCsrf(req, res)) return;
    const id = String(req.params.id || "").trim();
    if (!UUID_RE.test(id)) return sendControlled(req, res, 404, "Not found.");
    const result = await domainSvc.addDepartmentMember(getPool(), {
      actorUserId: ids.actorUserId,
      organizationId: ids.organizationId,
      churchId: ids.churchId,
      branchId: ids.branchId,
      tenantContext: ids.tenant,
      departmentId: id,
      memberId: req.body && req.body.memberId,
    });
    if (!result.ok) {
      return redirectWith(res, `/hq/departments/${id}`, "error", result.reason || "failed");
    }
    return redirectWith(res, `/hq/departments/${id}`, "notice", "member_added");
  });

  router.post("/hq/departments/:id/members/remove", rejectApex, gateStaff, async (req, res) => {
    const ids = tenantIds(req);
    if (!ids) return sendControlled(req, res, 403, "You do not have access to this site.");
    if (!requireCsrf(req, res)) return;
    const id = String(req.params.id || "").trim();
    if (!UUID_RE.test(id)) return sendControlled(req, res, 404, "Not found.");
    // reason is optional in body; service does not persist it on membership exit
    const result = await domainSvc.removeDepartmentMember(getPool(), {
      actorUserId: ids.actorUserId,
      churchId: ids.churchId,
      tenantContext: ids.tenant,
      membershipId: req.body && req.body.membershipId,
      reason: (req.body && req.body.reason) || null,
    });
    if (!result.ok) {
      return redirectWith(res, `/hq/departments/${id}`, "error", result.reason || "failed");
    }
    return redirectWith(res, `/hq/departments/${id}`, "notice", "member_removed");
  });

  return router;
}

module.exports = {
  createMemberJourneyAdminRouter,
};
