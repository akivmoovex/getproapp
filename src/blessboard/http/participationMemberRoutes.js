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
const { CSRF_FIELD, validateCsrf } = require("../../platform/http/v5Csrf");
const { buildMemberShellLocals } = require("./memberShellLocals");
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
 * Presentation-only action error messages (does not change service rules).
 * @param {string} kind
 * @param {{ status?: string, reason?: string }} result
 */
function participationActionError(kind, result) {
  const status = result && result.status;
  const reason = result && result.reason;
  if (kind === "event-register") {
    if (status === STATUS.CAPACITY_FULL) return "This event is at capacity.";
    if (status === STATUS.CONFLICT) return "You are already registered for this event.";
    if (status === STATUS.UNAVAILABLE || reason === "inactive") {
      return "This event is not open for registration.";
    }
    return "Could not register for this event.";
  }
  if (kind === "event-cancel") {
    return "Could not cancel registration.";
  }
  if (kind === "ministry-join") {
    if (status === STATUS.CONFLICT) return "You already have a membership for this ministry.";
    if (status === STATUS.UNAVAILABLE || reason === "inactive") {
      return "This ministry is not open to join.";
    }
    return "Could not join this ministry.";
  }
  if (kind === "ministry-leave") {
    return "Could not update your ministry membership.";
  }
  return "Something went wrong. Please try again.";
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
    return buildMemberShellLocals(req, res, {
      env,
      isProduction,
      activeNav,
      extra,
    });
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

  async function renderMinistryDetail(req, res, scope, id, extra) {
    const loaded = await getMemberMinistry(getPool(), { ...scope, id });
    if (!loaded.ok || !loaded.item) {
      const code = loaded.status === STATUS.FORBIDDEN ? 403 : 404;
      return res.status(code).type("text").send("Ministry not found.");
    }
    const opts = extra && typeof extra === "object" ? extra : {};
    const statusCode = opts.statusCode || 200;
    const html = renderMemberView(
      "participation/member-ministry-detail.ejs",
      shellLocals(req, res, "ministries", {
        item: loaded.item,
        error: opts.error || null,
        saved: opts.saved != null ? String(opts.saved) : "",
      })
    );
    return res.status(statusCode).type("html").send(html);
  }

  async function renderEventDetail(req, res, scope, id, extra) {
    const loaded = await getMemberEvent(getPool(), { ...scope, id });
    if (!loaded.ok || !loaded.item) {
      const code = loaded.status === STATUS.FORBIDDEN ? 403 : 404;
      return res.status(code).type("text").send("Event not found.");
    }
    const opts = extra && typeof extra === "object" ? extra : {};
    const statusCode = opts.statusCode || 200;
    const html = renderMemberView(
      "participation/member-event-detail.ejs",
      shellLocals(req, res, "events", {
        item: loaded.item,
        error: opts.error || null,
        saved: opts.saved != null ? String(opts.saved) : "",
      })
    );
    return res.status(statusCode).type("html").send(html);
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
    return renderMinistryDetail(req, res, scope, id, {
      saved: String((req.query && req.query.saved) || ""),
    });
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
      if (code === 403 || code === 404) {
        return res.status(code).type("text").send("Could not join this ministry.");
      }
      return renderMinistryDetail(req, res, scope, id, {
        error: participationActionError("ministry-join", joined),
        statusCode: code,
      });
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
      const code = left.status === STATUS.NOT_FOUND ? 404 : 400;
      if (code === 404) {
        return res.status(404).type("text").send("Could not leave.");
      }
      return renderMinistryDetail(req, res, scope, id, {
        error: participationActionError("ministry-leave", left),
        statusCode: code,
      });
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
    return renderEventDetail(req, res, scope, id, {
      saved: String((req.query && req.query.saved) || ""),
    });
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
      if (code === 403 || code === 404) {
        return res.status(code).type("text").send(
          registered.status === STATUS.CAPACITY_FULL
            ? "This event is at capacity."
            : "Could not register for this event."
        );
      }
      return renderEventDetail(req, res, scope, id, {
        error: participationActionError("event-register", registered),
        statusCode: code,
      });
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
      const code = cancelled.status === STATUS.NOT_FOUND ? 404 : 400;
      if (code === 404) {
        return res.status(404).type("text").send("Could not cancel registration.");
      }
      return renderEventDetail(req, res, scope, id, {
        error: participationActionError("event-cancel", cancelled),
        statusCode: code,
      });
    }
    return res.redirect(303, `/member/events/${id}?saved=cancelled`);
  });

  return router;
}

module.exports = {
  createParticipationMemberRouter,
};
