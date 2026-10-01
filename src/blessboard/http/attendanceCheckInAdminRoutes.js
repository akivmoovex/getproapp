"use strict";

/**
 * V2.04 attendance check-in HTTP (BB-A04 + functional A05–A09).
 * ALL methods call checkInManual / checkInQr / checkInPeak → validateAttendanceCheckIn.
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const express = require("express");
const QRCode = require("qrcode");

const {
  createRequireBlessBoardPermission,
} = require("./requireBlessBoardPermission");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { createRejectApex } = require("./rejectApex");
const {
  createRequireV5AuthenticatedSession,
} = require("../../platform/http/v5SessionAuthGate");
const { buildBranchAdminShellLocals } = require("./branchAdminShellLocals");
const { CSRF_FIELD, validateCsrf } = require("../../platform/http/v5Csrf");
const {
  SESSION_STATUS,
  VALIDATION_CODE,
  getAttendanceSessionForTenant,
  checkInManual,
  checkInQr,
  checkInPeak,
  issueSessionCheckInQr,
  RESULT: CHECK_RESULT,
} = require("../services/attendance");
const {
  createDbSessionStore,
  countCheckInsBySession,
} = require("../repositories/attendanceSessionRepository");
const {
  createDbCheckInStore,
  createDbTokenStore,
  createDbMemberStore,
  listCheckInsForSession,
  findActiveCheckInBySessionMember,
  findMemberForCheckIn,
} = require("../repositories/attendanceCheckInRepository");
const {
  listMembersForChurch,
} = require("../repositories/memberIdentityRepository");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "blessboard", "v5");
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function renderView(relativePath, data) {
  const filename = path.join(VIEWS_ROOT, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  return ejs.render(source, data, { filename });
}

function presentSession(session) {
  if (!session) return null;
  return {
    ...session,
    statusLabel: String(session.status || "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()),
    title:
      session.title ||
      session.serviceEventRef ||
      "Service session",
  };
}

/**
 * Map shared check-in service results → Stitch A06/A09 presentation kinds.
 * Does not invent backend states — only titles/kinds for existing codes.
 */
function presentCheckInResult(result) {
  if (!result) return null;
  if (!result.ok) {
    const code = result.code;
    let kind = "error";
    let title = "Check-in could not be completed";
    if (
      code === VALIDATION_CODE.SESSION_CLOSED ||
      code === VALIDATION_CODE.SESSION_NOT_OPEN ||
      code === VALIDATION_CODE.SESSION_LOCKED
    ) {
      kind = "closed";
      title = "Check-In Session Closed";
    } else if (code === VALIDATION_CODE.EXPIRED_QR) {
      kind = "expired";
      title = "Invalid or Expired QR Code";
    } else if (code === VALIDATION_CODE.INVALID_QR) {
      kind = "invalid";
      title = "Invalid or Expired QR Code";
    }
    return {
      ok: false,
      code,
      kind,
      title,
      message: messageForCode(code),
    };
  }
  if (result.duplicate) {
    return {
      ok: true,
      code: result.code,
      kind: "duplicate",
      title: "Already Checked In Today",
      message: "Existing attendance returned — no second record created.",
      checkIn: result.checkIn,
      lateArrival: !!(result.checkIn && result.checkIn.lateArrival),
      wrongBranch: !!(result.checkIn && result.checkIn.wrongBranch),
    };
  }
  if (result.lateArrival) {
    return {
      ok: true,
      code: result.code,
      kind: "late",
      title: "Late Arrival Logged",
      message: result.wrongBranch
        ? "Late check-in recorded. Wrong-branch policy noted on the attendance row."
        : "Late arrival recorded through the shared attendance validation contract.",
      checkIn: result.checkIn,
      lateArrival: true,
      wrongBranch: !!result.wrongBranch,
      method: result.method,
    };
  }
  return {
    ok: true,
    code: result.code,
    kind: result.wrongBranch ? "warning" : "success",
    title: result.wrongBranch
      ? "Check-In Confirmed with Notice"
      : "Check-In Confirmed!",
    message: result.wrongBranch
      ? "Attendance saved. Wrong-branch policy noted on the attendance row."
      : "Member checked in successfully.",
    checkIn: result.checkIn,
    lateArrival: false,
    wrongBranch: !!result.wrongBranch,
    method: result.method,
  };
}

function messageForCode(code) {
  switch (code) {
    case VALIDATION_CODE.SESSION_NOT_OPEN:
    case VALIDATION_CODE.SESSION_CLOSED:
    case VALIDATION_CODE.SESSION_LOCKED:
      return "This session is closed or not open for check-in.";
    case VALIDATION_CODE.MEMBER_NOT_FOUND:
      return "Member not found.";
    case VALIDATION_CODE.MEMBER_NOT_ELIGIBLE:
      return "Member is not eligible for check-in.";
    case VALIDATION_CODE.UNAUTHORIZED:
    case CHECK_RESULT.UNAUTHORIZED:
      return "You are not authorized to check in members.";
    case VALIDATION_CODE.INVALID_QR:
      return "QR token is invalid. Ask a greeter for a fresh display.";
    case VALIDATION_CODE.EXPIRED_QR:
      return "QR token has expired. Refresh the kiosk display and scan again.";
    case VALIDATION_CODE.WRONG_BRANCH:
      return "Wrong-branch policy denied this check-in.";
    case VALIDATION_CODE.TENANT_MISMATCH:
      return "Member or session is outside this church.";
    default:
      return "Check-in failed. Try again.";
  }
}

/** Short greeter-facing ref from opaque token jti — never Stitch demo ids. */
function tokenFingerprint(token) {
  try {
    const payloadB64 = String(token || "").split(".")[0];
    if (!payloadB64) return null;
    const claims = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    );
    const jti = claims && claims.jti ? String(claims.jti) : "";
    if (!jti) return null;
    return jti.replace(/-/g, "").slice(0, 8).toUpperCase();
  } catch (_e) {
    return null;
  }
}

function formatSessionGatheringDate(session) {
  const raw = session && (session.sessionDate || session.session_date);
  if (!raw) return null;
  try {
    const d =
      raw instanceof Date
        ? raw
        : new Date(String(raw).includes("T") ? raw : `${String(raw).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10);
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch (_e) {
    return String(raw).slice(0, 10);
  }
}

function formatSessionStartTime(session) {
  const raw = session && (session.startTime || session.start_time);
  if (raw == null || raw === "") return null;
  const s = String(raw);
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return s.slice(0, 8);
  let h = Number(m[1]);
  const min = m[2];
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${String(h).padStart(2, "0")}:${min} ${ampm}`;
}

async function buildSessionQrDataUrl(token) {
  if (!token) return null;
  try {
    return await QRCode.toDataURL(String(token), {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 512,
      color: { dark: "#0b1c30", light: "#FFFFFF" },
    });
  } catch (_e) {
    return null;
  }
}

function createAttendanceCheckInAdminRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const sendUnavailable = deps.sendUnavailable;
  const isProduction = String(env.NODE_ENV || "") === "production";
  const loginNext = "/branch-admin/attendance/sessions";

  const router = express.Router();
  const requireView = createRequireBlessBoardPermission("attendance.view", null, {
    getPool,
  });
  const requireCheckIn = createRequireBlessBoardPermission(
    "attendance.check_in",
    null,
    { getPool }
  );

  const rejectApex = createRejectApex({
    isApexHost,
    sendUnavailable,
    mode: "unlessTenant",
  });
  const requireSession = createRequireV5AuthenticatedSession({ loginNext });

  function gateView(req, res, next) {
    if (!requireSession(req, res, { loginNext: req.originalUrl || loginNext })) {
      return;
    }
    return requireView(req, res, next);
  }

  function gateCheckIn(req, res, next) {
    if (!requireSession(req, res, { loginNext: req.originalUrl || loginNext })) {
      return;
    }
    return requireCheckIn(req, res, next);
  }

  function validateCsrfPost(req, res) {
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      res.status(403).type("text").send("Invalid security token. Refresh and try again.");
      return false;
    }
    return true;
  }

  function tenantScope(req, res) {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.organization || !tenant.primaryBranch) {
      res.status(403).type("text").send("Church context is required.");
      return null;
    }
    return {
      tenant,
      organizationId: tenant.organization.id,
      churchId: tenant.church.id,
      branchId: tenant.primaryBranch.id,
      branchName:
        tenant.primaryBranch.displayName ||
        tenant.primaryBranch.name ||
        "Branch",
      actorUserId: req.v5Session && req.v5Session.session && req.v5Session.session.userId,
    };
  }

  async function shellLocals(req, res, extra) {
    const base = await buildBranchAdminShellLocals(req, res, {
      getPool,
      env,
      isProduction,
      activeNav: "attendance",
      pageTitle: (extra && extra.pageTitle) || "Attendance Check-In",
    });
    return {
      ...base,
      csrfField: CSRF_FIELD,
      shellKind: "branch",
      ...(extra || {}),
    };
  }

  function checkInDeps() {
    return {
      sessionStore: createDbSessionStore(),
      memberStore: createDbMemberStore(),
      checkInStore: createDbCheckInStore(),
      tokenStore: createDbTokenStore(),
      qrSigningSecret: env.ATTENDANCE_QR_SECRET || env.CSRF_SECRET || env.SESSION_SECRET,
    };
  }

  async function loadOpenSession(req, res, scope, sessionId) {
    if (!UUID_RE.test(sessionId)) {
      res.status(404).type("text").send("Session not found.");
      return null;
    }
    const loaded = await getAttendanceSessionForTenant(
      getPool(),
      {
        sessionId,
        organizationId: scope.organizationId,
        churchId: scope.churchId,
        branchId: scope.branchId,
        actorUserId: scope.actorUserId,
      },
      { sessionStore: createDbSessionStore() }
    );
    if (!loaded.ok) {
      res.status(404).type("text").send("Session not found.");
      return null;
    }
    return presentSession(loaded.session);
  }

  // —— A04 Manual Check-In ——
  router.get(
    "/branch-admin/attendance/sessions/:id/check-in",
    rejectApex,
    gateCheckIn,
    async (req, res) => {
      const scope = tenantScope(req, res);
      if (!scope) return;
      const session = await loadOpenSession(req, res, scope, String(req.params.id || ""));
      if (!session) return;

      const q = String((req.query && req.query.q) || "").trim().slice(0, 100);
      const selectedId = String((req.query && req.query.member) || "").trim();
      let candidates = [];
      let selected = null;
      let existing = null;
      let stats = { total: 0, present: 0, late: 0 };

      try {
        stats = await countCheckInsBySession(getPool(), session.id);
      } catch (_e) {
        /* ignore */
      }

      if (q) {
        try {
          const listed = await listMembersForChurch(getPool(), {
            churchId: scope.churchId,
            q,
            status: "active",
            limit: 8,
          });
          candidates = listed.items || [];
        } catch (_e) {
          candidates = [];
        }
      }

      if (selectedId && UUID_RE.test(selectedId)) {
        try {
          selected = await findMemberForCheckIn(getPool(), selectedId);
          if (selected && selected.churchId !== scope.churchId) selected = null;
          if (selected) {
            existing = await findActiveCheckInBySessionMember(getPool(), {
              sessionId: session.id,
              memberId: selected.id,
            });
          }
        } catch (_e) {
          selected = null;
        }
      }

      const html = renderView(
        "attendance/check-in-manual.ejs",
        await shellLocals(req, res, {
          pageTitle: "Manual Check-In",
          stitchScreen: "BB-A04",
          session,
          branchName: scope.branchName,
          q,
          candidates,
          selected,
          existing,
          stats,
          result: null,
          sessionOpen: session.status === SESSION_STATUS.OPEN,
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  router.post(
    "/branch-admin/attendance/sessions/:id/check-in",
    rejectApex,
    gateCheckIn,
    async (req, res) => {
      const scope = tenantScope(req, res);
      if (!scope) return;
      if (!validateCsrfPost(req, res)) return;
      const sessionId = String(req.params.id || "");
      const session = await loadOpenSession(req, res, scope, sessionId);
      if (!session) return;

      const memberId = String((req.body && req.body.member_id) || "").trim();
      const q = String((req.body && req.body.q) || "").trim().slice(0, 100);
      const result = await checkInManual(
        getPool(),
        {
          organizationId: scope.organizationId,
          churchId: scope.churchId,
          actorUserId: scope.actorUserId,
          sessionId: session.id,
          memberId,
        },
        checkInDeps()
      );
      const presented = presentCheckInResult(result);

      let selected = null;
      let existing = null;
      let candidates = [];
      let stats = { total: 0, present: 0, late: 0 };
      try {
        stats = await countCheckInsBySession(getPool(), session.id);
        if (memberId && UUID_RE.test(memberId)) {
          selected = await findMemberForCheckIn(getPool(), memberId);
          existing = await findActiveCheckInBySessionMember(getPool(), {
            sessionId: session.id,
            memberId,
          });
        }
        if (q) {
          const listed = await listMembersForChurch(getPool(), {
            churchId: scope.churchId,
            q,
            status: "active",
            limit: 8,
          });
          candidates = listed.items || [];
        }
      } catch (_e) {
        /* ignore */
      }

      const html = renderView(
        "attendance/check-in-manual.ejs",
        await shellLocals(req, res, {
          pageTitle: "Manual Check-In",
          stitchScreen: "BB-A04",
          session,
          branchName: scope.branchName,
          q,
          candidates,
          selected,
          existing,
          stats,
          result: presented,
          sessionOpen: session.status === SESSION_STATUS.OPEN,
        })
      );
      return res.status(result.ok ? 200 : 400).type("html").send(html);
    }
  );

  // —— A05 QR Display ——
  router.get(
    "/branch-admin/attendance/sessions/:id/qr",
    rejectApex,
    gateCheckIn,
    async (req, res) => {
      const scope = tenantScope(req, res);
      if (!scope) return;
      const session = await loadOpenSession(req, res, scope, String(req.params.id || ""));
      if (!session) return;

      let qrToken = null;
      let expiresAt = null;
      let qrDataUrl = null;
      let tokenRef = null;
      let stats = { total: 0, present: 0, late: 0 };
      try {
        stats = await countCheckInsBySession(getPool(), session.id);
      } catch (_e) {
        /* ignore */
      }

      if (session.status === SESSION_STATUS.OPEN) {
        const issued = await issueSessionCheckInQr(
          getPool(),
          {
            sessionId: session.id,
            organizationId: scope.organizationId,
            churchId: scope.churchId,
            actorUserId: scope.actorUserId,
            ttlSeconds: 900,
          },
          checkInDeps()
        );
        if (issued.ok) {
          qrToken = issued.token;
          expiresAt = issued.expiresAt;
          tokenRef = tokenFingerprint(qrToken);
          qrDataUrl = await buildSessionQrDataUrl(qrToken);
        }
      }

      const html = renderView(
        "attendance/check-in-qr-display.ejs",
        await shellLocals(req, res, {
          pageTitle: "Attendance QR Display",
          stitchScreen: "BB-A05",
          kioskMode: true,
          session,
          branchName: scope.branchName,
          qrToken,
          qrDataUrl,
          tokenRef,
          expiresAt,
          stats,
          gatheringDateLabel: formatSessionGatheringDate(session),
          gatheringTimeLabel: formatSessionStartTime(session),
          // Capacity is not on the session domain — never invent Stitch demo denominators.
          capacity: null,
          sessionOpen: session.status === SESSION_STATUS.OPEN,
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  // —— A06 Member QR Check-In ——
  router.get(
    "/branch-admin/attendance/sessions/:id/qr/check-in",
    rejectApex,
    gateCheckIn,
    async (req, res) => {
      const scope = tenantScope(req, res);
      if (!scope) return;
      const session = await loadOpenSession(req, res, scope, String(req.params.id || ""));
      if (!session) return;
      const html = renderView(
        "attendance/check-in-qr-member.ejs",
        await shellLocals(req, res, {
          pageTitle: "Member QR Check-In",
          stitchScreen: "BB-A06",
          session,
          branchName: scope.branchName,
          result: null,
          sessionOpen: session.status === SESSION_STATUS.OPEN,
          values: { qr_token: "", member_id: "" },
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  router.post(
    "/branch-admin/attendance/sessions/:id/qr/check-in",
    rejectApex,
    gateCheckIn,
    async (req, res) => {
      const scope = tenantScope(req, res);
      if (!scope) return;
      if (!validateCsrfPost(req, res)) return;
      const session = await loadOpenSession(req, res, scope, String(req.params.id || ""));
      if (!session) return;

      const qrToken = String((req.body && req.body.qr_token) || "").trim();
      const memberId = String((req.body && req.body.member_id) || "").trim() || null;
      const result = await checkInQr(
        getPool(),
        {
          organizationId: scope.organizationId,
          churchId: scope.churchId,
          actorUserId: scope.actorUserId,
          sessionId: session.id,
          memberId,
          qrToken,
        },
        checkInDeps()
      );
      const presented = presentCheckInResult(result);
      const html = renderView(
        "attendance/check-in-qr-member.ejs",
        await shellLocals(req, res, {
          pageTitle: "Member QR Check-In",
          stitchScreen: "BB-A06",
          session,
          branchName: scope.branchName,
          result: presented,
          sessionOpen: session.status === SESSION_STATUS.OPEN,
          values: { qr_token: "", member_id: memberId || "" },
        })
      );
      return res.status(result.ok ? 200 : 400).type("html").send(html);
    }
  );

  // —— A07 Peak Check-In ——
  router.get(
    "/branch-admin/attendance/sessions/:id/peak",
    rejectApex,
    gateCheckIn,
    async (req, res) => {
      const scope = tenantScope(req, res);
      if (!scope) return;
      const session = await loadOpenSession(req, res, scope, String(req.params.id || ""));
      if (!session) return;
      let stats = { total: 0, present: 0, late: 0 };
      let recent = [];
      try {
        stats = await countCheckInsBySession(getPool(), session.id);
        recent = await listCheckInsForSession(getPool(), session.id, 8);
      } catch (_e) {
        recent = [];
      }
      const html = renderView(
        "attendance/check-in-peak.ejs",
        await shellLocals(req, res, {
          pageTitle: "Peak Check-In",
          stitchScreen: "BB-A07",
          session,
          branchName: scope.branchName,
          result: null,
          stats,
          recent,
          sessionOpen: session.status === SESSION_STATUS.OPEN,
          values: { member_ref: "" },
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  router.post(
    "/branch-admin/attendance/sessions/:id/peak",
    rejectApex,
    gateCheckIn,
    async (req, res) => {
      const scope = tenantScope(req, res);
      if (!scope) return;
      if (!validateCsrfPost(req, res)) return;
      const session = await loadOpenSession(req, res, scope, String(req.params.id || ""));
      if (!session) return;

      const memberRef = String((req.body && req.body.member_ref) || "").trim();
      let memberId = memberRef;
      if (memberRef && !UUID_RE.test(memberRef)) {
        try {
          const listed = await listMembersForChurch(getPool(), {
            churchId: scope.churchId,
            q: memberRef,
            status: "active",
            limit: 1,
          });
          memberId =
            listed.items && listed.items[0] ? listed.items[0].id : memberRef;
        } catch (_e) {
          memberId = memberRef;
        }
      }

      const result = await checkInPeak(
        getPool(),
        {
          organizationId: scope.organizationId,
          churchId: scope.churchId,
          actorUserId: scope.actorUserId,
          sessionId: session.id,
          memberId,
        },
        checkInDeps()
      );
      const presented = presentCheckInResult(result);
      let memberBrief = null;
      if (result.ok && result.checkIn) {
        try {
          memberBrief = await findMemberForCheckIn(
            getPool(),
            result.checkIn.memberId
          );
        } catch (_e) {
          memberBrief = null;
        }
      }

      let stats = { total: 0, present: 0, late: 0 };
      let recent = [];
      try {
        stats = await countCheckInsBySession(getPool(), session.id);
        recent = await listCheckInsForSession(getPool(), session.id, 8);
      } catch (_e) {
        recent = [];
      }

      const html = renderView(
        "attendance/check-in-peak.ejs",
        await shellLocals(req, res, {
          pageTitle: "Peak Check-In",
          stitchScreen: "BB-A07",
          session,
          branchName: scope.branchName,
          result: presented,
          memberBrief,
          stats,
          recent,
          sessionOpen: session.status === SESSION_STATUS.OPEN,
          values: { member_ref: "" },
          autofocusNext: true,
        })
      );
      return res.status(result.ok ? 200 : 400).type("html").send(html);
    }
  );

  // —— A08 Live Attendance Roster ——
  router.get(
    "/branch-admin/attendance/sessions/:id/roster",
    rejectApex,
    gateView,
    async (req, res) => {
      const scope = tenantScope(req, res);
      if (!scope) return;
      const session = await loadOpenSession(req, res, scope, String(req.params.id || ""));
      if (!session) return;
      let rows = [];
      let stats = { total: 0, present: 0, late: 0 };
      try {
        rows = await listCheckInsForSession(getPool(), session.id, 200);
        stats = await countCheckInsBySession(getPool(), session.id);
      } catch (_e) {
        rows = [];
      }
      const html = renderView(
        "attendance/check-in-roster.ejs",
        await shellLocals(req, res, {
          pageTitle: "Live Attendance Roster",
          stitchScreen: "BB-A08",
          session,
          branchName: scope.branchName,
          rows,
          stats,
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  return router;
}

module.exports = {
  createAttendanceCheckInAdminRouter,
  presentCheckInResult,
  messageForCode,
  tokenFingerprint,
  formatSessionGatheringDate,
  formatSessionStartTime,
};
