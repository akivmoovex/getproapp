"use strict";

/**
 * BlessBoard V5 member ministries + events participation.
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const express = require("express");

const { createRequireActiveMember } = require("./requireActiveMember");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const {
  CSRF_FIELD,
  issueCsrfToken,
  validateCsrf,
  setCsrfCookie,
} = require("../../platform/http/v5Csrf");
const {
  STATUS,
  listMemberMinistries,
  getMemberMinistry,
  joinMinistry,
  leaveMinistry,
  listMemberEvents,
  getMemberEvent,
  registerForEvent,
  cancelEventRegistration,
} = require("../services/participationService");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "blessboard", "v5");
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function renderMemberView(relativePath, data) {
  const filename = path.join(VIEWS_ROOT, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  return ejs.render(source, data, { filename });
}

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 *   sendUnavailable?: Function,
 * }} deps
 */
function createParticipationMemberRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const sendUnavailable = deps.sendUnavailable;
  const isProduction = String(env.NODE_ENV || "") === "production";

  const router = express.Router();
  const requireMember = createRequireActiveMember({ getPool });

  function rejectApex(req, res, next) {
    if (isApexHost(req)) {
      if (typeof sendUnavailable === "function") return sendUnavailable(req, res);
      return res.status(503).type("text").send("Unavailable");
    }
    return next();
  }

  function shellLocals(req, res, activeNav, extra) {
    const tenant = resolveTenantForAuthorization(req);
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: isProduction });
    const session = req.v5Session && req.v5Session.session ? req.v5Session.session : null;
    const access = req.blessBoardMemberAccess || null;
    const preferred =
      access && access.member && access.member.preferredName
        ? access.member.preferredName
        : session && session.user
          ? session.user.displayName
          : "";
    return {
      pageTitle:
        activeNav === "ministries" ? "Ministries" : activeNav === "events" ? "Events" : "Member",
      activeNav,
      csrfToken,
      churchDisplayName: tenant && tenant.church ? tenant.church.displayName : "",
      branchDisplayName:
        tenant && tenant.primaryBranch ? tenant.primaryBranch.displayName : "",
      displayName: preferred || "",
      ...(extra || {}),
    };
  }

  function memberScope(req) {
    const tenant = resolveTenantForAuthorization(req);
    const access = req.blessBoardMemberAccess;
    if (!tenant || !tenant.church || !tenant.primaryBranch || !access || !access.member) {
      return null;
    }
    return {
      churchId: tenant.church.id,
      branchId: tenant.primaryBranch.id,
      memberId: access.member.id,
    };
  }

  function validateCsrfPost(req, res) {
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      res.status(403).type("text").send("Invalid or missing CSRF token.");
      return false;
    }
    return true;
  }

  // ----- Ministries -----

  router.get("/member/ministries", rejectApex, requireMember, async (req, res) => {
    const scope = memberScope(req);
    if (!scope) {
      return res.status(403).type("text").send("You do not have member access to this site.");
    }
    const listed = await listMemberMinistries(getPool(), scope);
    if (!listed.ok) {
      return res.status(503).type("text").send("Ministries are temporarily unavailable.");
    }
    const html = renderMemberView(
      "participation/member-ministries.ejs",
      shellLocals(req, res, "ministries", {
        items: listed.items,
        saved: String((req.query && req.query.saved) || ""),
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/member/ministries/:id", rejectApex, requireMember, async (req, res) => {
    const scope = memberScope(req);
    if (!scope) {
      return res.status(403).type("text").send("You do not have member access to this site.");
    }
    const id = String(req.params.id || "");
    if (!UUID_RE.test(id)) {
      return res.status(404).type("text").send("Ministry not found.");
    }
    const loaded = await getMemberMinistry(getPool(), { ...scope, id });
    if (!loaded.ok || !loaded.item) {
      const code = loaded.status === STATUS.FORBIDDEN ? 403 : 404;
      return res.status(code).type("text").send("Ministry not found.");
    }
    const html = renderMemberView(
      "participation/member-ministry-detail.ejs",
      shellLocals(req, res, "ministries", {
        item: loaded.item,
        error: null,
        saved: String((req.query && req.query.saved) || ""),
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.post("/member/ministries/:id/join", rejectApex, requireMember, async (req, res) => {
    if (!validateCsrfPost(req, res)) return;
    const scope = memberScope(req);
    if (!scope) {
      return res.status(403).type("text").send("You do not have member access to this site.");
    }
    const id = String(req.params.id || "");
    if (!UUID_RE.test(id)) {
      return res.status(404).type("text").send("Ministry not found.");
    }
    const joined = await joinMinistry(getPool(), {
      ...scope,
      ministryId: id,
      message: req.body && req.body.message,
    });
    if (!joined.ok) {
      const code =
        joined.status === STATUS.CONFLICT
          ? 409
          : joined.status === STATUS.FORBIDDEN
            ? 403
            : joined.status === STATUS.UNAVAILABLE
              ? 400
              : joined.status === STATUS.NOT_FOUND
                ? 404
                : 400;
      return res.status(code).type("text").send("Could not join this ministry.");
    }
    return res.redirect(303, `/member/ministries/${id}?saved=joined`);
  });

  router.post("/member/ministries/:id/leave", rejectApex, requireMember, async (req, res) => {
    if (!validateCsrfPost(req, res)) return;
    const scope = memberScope(req);
    if (!scope) {
      return res.status(403).type("text").send("You do not have member access to this site.");
    }
    const id = String(req.params.id || "");
    if (!UUID_RE.test(id)) {
      return res.status(404).type("text").send("Ministry not found.");
    }
    const left = await leaveMinistry(getPool(), { ...scope, ministryId: id });
    if (!left.ok) {
      return res.status(left.status === STATUS.NOT_FOUND ? 404 : 400).type("text").send("Could not leave.");
    }
    return res.redirect(303, `/member/ministries/${id}?saved=left`);
  });

  // ----- Events -----

  router.get("/member/events", rejectApex, requireMember, async (req, res) => {
    const scope = memberScope(req);
    if (!scope) {
      return res.status(403).type("text").send("You do not have member access to this site.");
    }
    const listed = await listMemberEvents(getPool(), scope);
    if (!listed.ok) {
      return res.status(503).type("text").send("Events are temporarily unavailable.");
    }
    const html = renderMemberView(
      "participation/member-events.ejs",
      shellLocals(req, res, "events", {
        items: listed.items,
        saved: String((req.query && req.query.saved) || ""),
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/member/events/:id", rejectApex, requireMember, async (req, res) => {
    const scope = memberScope(req);
    if (!scope) {
      return res.status(403).type("text").send("You do not have member access to this site.");
    }
    const id = String(req.params.id || "");
    if (!UUID_RE.test(id)) {
      return res.status(404).type("text").send("Event not found.");
    }
    const loaded = await getMemberEvent(getPool(), { ...scope, id });
    if (!loaded.ok || !loaded.item) {
      const code = loaded.status === STATUS.FORBIDDEN ? 403 : 404;
      return res.status(code).type("text").send("Event not found.");
    }
    const html = renderMemberView(
      "participation/member-event-detail.ejs",
      shellLocals(req, res, "events", {
        item: loaded.item,
        error: null,
        saved: String((req.query && req.query.saved) || ""),
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.post("/member/events/:id/register", rejectApex, requireMember, async (req, res) => {
    if (!validateCsrfPost(req, res)) return;
    const scope = memberScope(req);
    if (!scope) {
      return res.status(403).type("text").send("You do not have member access to this site.");
    }
    const id = String(req.params.id || "");
    if (!UUID_RE.test(id)) {
      return res.status(404).type("text").send("Event not found.");
    }
    const registered = await registerForEvent(getPool(), { ...scope, eventId: id });
    if (!registered.ok) {
      const code =
        registered.status === STATUS.CAPACITY_FULL
          ? 409
          : registered.status === STATUS.CONFLICT
            ? 409
            : registered.status === STATUS.FORBIDDEN
              ? 403
              : registered.status === STATUS.NOT_FOUND
                ? 404
                : 400;
      return res.status(code).type("text").send(
        registered.status === STATUS.CAPACITY_FULL
          ? "This event is at capacity."
          : "Could not register for this event."
      );
    }
    return res.redirect(303, `/member/events/${id}?saved=registered`);
  });

  router.post("/member/events/:id/cancel", rejectApex, requireMember, async (req, res) => {
    if (!validateCsrfPost(req, res)) return;
    const scope = memberScope(req);
    if (!scope) {
      return res.status(403).type("text").send("You do not have member access to this site.");
    }
    const id = String(req.params.id || "");
    if (!UUID_RE.test(id)) {
      return res.status(404).type("text").send("Event not found.");
    }
    const cancelled = await cancelEventRegistration(getPool(), { ...scope, eventId: id });
    if (!cancelled.ok) {
      return res
        .status(cancelled.status === STATUS.NOT_FOUND ? 404 : 400)
        .type("text")
        .send("Could not cancel registration.");
    }
    return res.redirect(303, `/member/events/${id}?saved=cancelled`);
  });

  return router;
}

module.exports = {
  createParticipationMemberRouter,
};
