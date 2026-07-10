"use strict";

const { getPgPool } = require("../../db/pg");
const ministryJoinRequestsRepo = require("../../db/pg/church/ministryJoinRequestsRepo");
const ministriesRepo = require("../../db/pg/church/ministriesRepo");
const {
  JOIN_REQUEST_FILTERS,
  LEADER_REVIEW_FILTERS,
  joinRequestStatusLabel,
  leaderRecommendationLabel,
  canLeaderReviewJoinRequest,
  validateLeaderJoinRecommendationBody,
} = require("../../church/ministryJoinRequestValidation");
const { leaderPortalLocals, flashFromQuery, recordLeaderAudit } = require("./leaderShared");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");

function leaderScope(leader) {
  return {
    organization_id: leader.organization_id,
    branch_id: leader.branch_id,
    ministry_id: leader.ministry_id,
  };
}

function parseLeaderRequestFilters(query) {
  const q = String((query && query.q) || "").trim().slice(0, 100);
  const statusRaw = String((query && query.status) || "all").trim();
  const status = JOIN_REQUEST_FILTERS.includes(statusRaw) ? statusRaw : "all";
  const reviewRaw = String((query && query.leader_review) || "all").trim();
  const leader_review = LEADER_REVIEW_FILTERS.includes(reviewRaw) ? reviewRaw : "all";
  const page = Math.max(Number((query && query.page) || 1) || 1, 1);
  return { q, status, leader_review, page };
}

function buildLeaderRequestsQuery(filters, page) {
  const f = filters || {};
  const pageNum = page != null ? Number(page) || 1 : Number(f.page) || 1;
  const params = new URLSearchParams();
  if (f.q) params.set("q", f.q);
  if (f.status && f.status !== "all") params.set("status", f.status);
  if (f.leader_review && f.leader_review !== "all") params.set("leader_review", f.leader_review);
  if (pageNum > 1) params.set("page", String(pageNum));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function recommendationNotice(req) {
  const notice = String((req.query && req.query.notice) || "").trim();
  if (notice === "recommendation_saved") {
    return "Your recommendation was saved. Branch administrators retain final approval.";
  }
  return flashFromQuery(req);
}

/**
 * @param {import("express").Router} router
 * @param {{
 *   requireChurchLeaderSession: Function,
 *   ensureLeaderStillActive: Function,
 *   requireLeaderMinistry: Function,
 * }} mw
 */
function registerLeaderJoinRequestRoutes(router, mw) {
  const { requireChurchLeaderSession, ensureLeaderStillActive, requireLeaderMinistry } = mw;

  router.get(
    "/leader/requests",
    requireChurchLeaderSession,
    ensureLeaderStillActive,
    requireLeaderMinistry,
    async (req, res, next) => {
      try {
        const leader = req.churchLeader;
        const pool = getPgPool();
        const ministry = await ministriesRepo.findMinistryByIdForBranch(
          pool,
          leader.ministry_id,
          leader.branch_id
        );
        const filters = parseLeaderRequestFilters(req.query || {});
        const scope = leaderScope(leader);
        const [list, pendingCount] = await Promise.all([
          ministryJoinRequestsRepo.listJoinRequestsForMinistryLeader(pool, scope, {
            q: filters.q,
            status: filters.status,
            leaderReview: filters.leader_review,
            page: filters.page,
          }),
          ministryJoinRequestsRepo.countOpenJoinRequestsAwaitingLeaderReview(pool, scope),
        ]);

        return res.render(
          "church/leader/join_requests",
          leaderPortalLocals(req, {
            pageTitle: "Leader Join Request Review",
            ministry,
            requests: list.rows,
            total: list.total,
            page: list.page,
            pageSize: list.pageSize,
            totalPages: list.totalPages,
            pendingCount,
            filters,
            buildQuery: buildLeaderRequestsQuery,
            joinRequestStatusLabel,
            leaderRecommendationLabel,
            notice: recommendationNotice(req),
            error: null,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/leader/requests/:requestId",
    requireChurchLeaderSession,
    ensureLeaderStillActive,
    requireLeaderMinistry,
    async (req, res, next) => {
      try {
        const requestId = Number(req.params.requestId);
        if (!Number.isFinite(requestId) || requestId <= 0) {
          return res.status(404).type("text").send("Join request not found.");
        }

        const leader = req.churchLeader;
        const pool = getPgPool();
        const ministry = await ministriesRepo.findMinistryByIdForBranch(
          pool,
          leader.ministry_id,
          leader.branch_id
        );
        const item = await ministryJoinRequestsRepo.findJoinRequestByIdForMinistryLeader(
          pool,
          requestId,
          leaderScope(leader)
        );
        if (!item) {
          return res.status(404).type("text").send("Join request not found.");
        }

        return res.render(
          "church/leader/join_request_detail",
          leaderPortalLocals(req, {
            pageTitle: "Join request review",
            ministry,
            joinRequest: item,
            joinRequestStatusLabel,
            leaderRecommendationLabel,
            canReview: canLeaderReviewJoinRequest(item.status),
            form: {
              recommendation: item.leader_recommendation || "",
              leader_comment: item.leader_comment || "",
            },
            notice: recommendationNotice(req),
            error: null,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/leader/requests/:requestId/recommend",
    requireChurchLeaderSession,
    ensureLeaderStillActive,
    requireLeaderMinistry,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const requestId = Number(req.params.requestId);
        if (!Number.isFinite(requestId) || requestId <= 0) {
          return res.status(404).type("text").send("Join request not found.");
        }

        const leader = req.churchLeader;
        const pool = getPgPool();
        const scope = leaderScope(leader);
        const ministry = await ministriesRepo.findMinistryByIdForBranch(
          pool,
          leader.ministry_id,
          leader.branch_id
        );
        const existing = await ministryJoinRequestsRepo.findJoinRequestByIdForMinistryLeader(
          pool,
          requestId,
          scope
        );
        if (!existing) {
          return res.status(404).type("text").send("Join request not found.");
        }

        const renderDetail = (status, error, form) =>
          res.status(status).render(
            "church/leader/join_request_detail",
            leaderPortalLocals(req, {
              pageTitle: "Join request review",
              ministry,
              joinRequest: existing,
              joinRequestStatusLabel,
              leaderRecommendationLabel,
              canReview: canLeaderReviewJoinRequest(existing.status),
              form,
              notice: null,
              error,
            })
          );

        if (!canLeaderReviewJoinRequest(existing.status)) {
          return renderDetail(
            400,
            "This join request is no longer open for leader recommendation.",
            {
              recommendation: existing.leader_recommendation || "",
              leader_comment: existing.leader_comment || "",
            }
          );
        }

        const validation = validateLeaderJoinRecommendationBody(req.body || {});
        if (!validation.ok) {
          return renderDetail(400, validation.error, validation.form);
        }

        const updated = await ministryJoinRequestsRepo.saveLeaderRecommendationForMinistry(
          pool,
          requestId,
          scope,
          {
            recommendation: validation.data.recommendation,
            leader_comment: validation.data.leader_comment,
            leader_reviewer_id: leader.leader_id,
          }
        );
        if (!updated) {
          return renderDetail(
            400,
            "This join request is no longer open for leader recommendation.",
            validation.form
          );
        }

        await recordLeaderAudit(pool, req, {
          action: "ministry_join_request_leader_reviewed",
          entityType: "ministry_join_request",
          entityId: updated.id,
          metadata: {
            request_id: updated.id,
            ministry_id: updated.ministry_id,
            member_id: updated.member_id,
            recommendation: updated.leader_recommendation,
            leader_reviewer_id: leader.leader_id,
          },
        });

        return res.redirect(303, `/leader/requests/${updated.id}?notice=recommendation_saved`);
      } catch (e) {
        return next(e);
      }
    }
  );
}

module.exports = registerLeaderJoinRequestRoutes;
