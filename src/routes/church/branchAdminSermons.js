"use strict";

const { getPgPool } = require("../../db/pg");
const sermonsRepo = require("../../db/pg/church/sermonsRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const { branchAdminLocals, flashFromQuery, noticeMessage } = require("./branchAdminShared");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");

const SERMON_NOTICES = {
  sermon_created: "Sermon saved.",
  sermon_published: "Sermon published.",
  sermon_updated: "Sermon updated.",
};

const SERMON_FILTERS = ["all", "draft", "published"];

function formFromSermon(item) {
  if (!item) {
    return {
      title: "",
      speaker: "",
      sermon_date: "",
      description: "",
      media_url: "",
      scripture: "",
      category: "Sunday Sermon",
    };
  }
  const sermonDate =
    item.sermon_date instanceof Date
      ? item.sermon_date.toISOString().slice(0, 10)
      : String(item.sermon_date || "").slice(0, 10);
  return {
    title: item.title,
    speaker: item.speaker,
    sermon_date: sermonDate,
    description: item.description,
    media_url: item.media_url || "",
    scripture: item.scripture || "",
    category: item.category || "Sunday Sermon",
  };
}

module.exports = function registerBranchAdminSermonsRoutes(router) {
  router.get("/branch/site", requireChurchBranchHost, requireChurchBranchAdminSession, (req, res) => {
    return res.redirect(303, "/branch/website-editor");
  });

  router.get("/branch/sermons", requireChurchBranchHost, requireChurchBranchAdminSession, async (req, res, next) => {
    try {
      const branch = req.churchContext.branch;
      const pool = getPgPool();
      const filter = String(req.query.status || "all").trim();
      const statusFilter = SERMON_FILTERS.includes(filter) ? filter : "all";
      const sermons = await sermonsRepo.listSermonsForBranch(pool, branch.id, { status: statusFilter });
      return res.render(
        "church/branch-admin/sermons_management",
        branchAdminLocals(req, {
          sermons,
          statusFilter,
          sermonFilters: SERMON_FILTERS,
          notice: noticeMessage(flashFromQuery(req, SERMON_NOTICES)),
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get("/branch/sermons/new", requireChurchBranchHost, requireChurchBranchAdminSession, (req, res) => {
    return res.render(
      "church/branch-admin/sermon_form",
      branchAdminLocals(req, { form: formFromSermon(null), error: null, isEdit: false, sermonId: null })
    );
  });

  router.post("/branch/sermons", requireChurchBranchHost, requireChurchBranchAdminSession, requireChurchSessionCsrf, async (req, res, next) => {
    try {
      const branch = req.churchContext.branch;
      const org = req.churchContext.organization;
      const pool = getPgPool();
      const body = req.body || {};
      const title = String(body.title || "").trim();
      if (!title) {
        return res.render(
          "church/branch-admin/sermon_form",
          branchAdminLocals(req, {
            form: formFromSermon(body),
            error: "Title is required.",
            isEdit: false,
            sermonId: null,
          })
        );
      }
      const publish = body._intent === "publish";
      const created = await sermonsRepo.createSermonForBranch(pool, {
        organization_id: org.id,
        branch_id: branch.id,
        title,
        speaker: String(body.speaker || "").trim(),
        sermon_date: String(body.sermon_date || "").trim() || null,
        description: String(body.description || "").trim(),
        media_url: String(body.media_url || "").trim() || null,
        scripture: String(body.scripture || "").trim() || null,
        category: String(body.category || "Sunday Sermon").trim(),
        status: publish ? "published" : "draft",
        created_by_admin_id: req.churchBranchAdmin.id,
      });
      const notice = publish ? "sermon_published" : "sermon_created";
      return res.redirect(303, `/branch/sermons/${created.id}?notice=${notice}`);
    } catch (e) {
      return next(e);
    }
  });

  router.get("/branch/sermons/:sermonId", requireChurchBranchHost, requireChurchBranchAdminSession, async (req, res, next) => {
    try {
      const branch = req.churchContext.branch;
      const pool = getPgPool();
      const sermon = await sermonsRepo.findSermonByIdForBranch(pool, Number(req.params.sermonId), branch.id);
      if (!sermon) return res.status(404).type("text").send("Sermon not found.");
      return res.render(
        "church/branch-admin/sermon_form",
        branchAdminLocals(req, {
          form: formFromSermon(sermon),
          error: null,
          isEdit: true,
          sermonId: sermon.id,
          sermon,
          notice: noticeMessage(flashFromQuery(req, SERMON_NOTICES)),
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.post("/branch/sermons/:sermonId", requireChurchBranchHost, requireChurchBranchAdminSession, requireChurchSessionCsrf, async (req, res, next) => {
    try {
      const branch = req.churchContext.branch;
      const pool = getPgPool();
      const sermonId = Number(req.params.sermonId);
      const body = req.body || {};
      const title = String(body.title || "").trim();
      if (!title) {
        return res.render(
          "church/branch-admin/sermon_form",
          branchAdminLocals(req, {
            form: formFromSermon(body),
            error: "Title is required.",
            isEdit: true,
            sermonId,
          })
        );
      }
      const publish = body._intent === "publish";
      await sermonsRepo.updateSermonForBranch(pool, sermonId, branch.id, {
        title,
        speaker: String(body.speaker || "").trim(),
        sermon_date: String(body.sermon_date || "").trim() || null,
        description: String(body.description || "").trim(),
        media_url: String(body.media_url || "").trim() || null,
        scripture: String(body.scripture || "").trim() || null,
        category: String(body.category || "Sunday Sermon").trim(),
        status: publish ? "published" : String(body.status || "draft"),
        updated_by_admin_id: req.churchBranchAdmin.id,
      });
      const notice = publish ? "sermon_published" : "sermon_updated";
      return res.redirect(303, `/branch/sermons/${sermonId}?notice=${notice}`);
    } catch (e) {
      return next(e);
    }
  });
};
