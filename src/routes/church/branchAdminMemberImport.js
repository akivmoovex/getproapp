"use strict";

const multer = require("multer");
const { getPgPool } = require("../../db/pg");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");
const {
  branchAdminLocals,
  flashFromQuery,
  MEMBER_NOTICES,
  noticeMessage,
} = require("./branchAdminShared");
const churchMemberImportService = require("../../services/church/churchMemberImportService");
const { MAX_BYTES } = require("../../church/memberImportUploads");

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
});

function handleImportUpload(req, res, next) {
  importUpload.single("csv_file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).render(
          "church/branch-admin/member_import",
          branchAdminLocals(req, {
            error: "CSV file is too large (max 2 MB).",
            batches: [],
            notice: null,
          })
        );
      }
      return res.status(400).render(
        "church/branch-admin/member_import",
        branchAdminLocals(req, {
          error: "Could not upload CSV.",
          batches: [],
          notice: null,
        })
      );
    }
    if (err) return next(err);
    return next();
  });
}

module.exports = function registerBranchAdminMemberImportRoutes(router) {
  router.get(
    "/branch/members/import",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const pool = getPgPool();
        const org = req.churchContext.organization;
        const branch = req.churchContext.branch;
        const batches = await churchMemberImportService.listImportBatchesForBranch(
          pool,
          org.id,
          branch.id,
          { limit: 25 }
        );
        return res.render(
          "church/branch-admin/member_import",
          branchAdminLocals(req, {
            batches,
            error: null,
            notice: noticeMessage(flashFromQuery(req, MEMBER_NOTICES)),
          })
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  router.post(
    "/branch/members/import/preview",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requireChurchSessionCsrf,
    handleImportUpload,
    async (req, res, next) => {
      try {
        const pool = getPgPool();
        const org = req.churchContext.organization;
        const branch = req.churchContext.branch;
        if (!req.file || !req.file.buffer) {
          const batches = await churchMemberImportService.listImportBatchesForBranch(
            pool,
            org.id,
            branch.id
          );
          return res.status(400).render(
            "church/branch-admin/member_import",
            branchAdminLocals(req, {
              batches,
              error: "Please choose a CSV file to upload.",
              notice: null,
            })
          );
        }

        const result = await churchMemberImportService.previewMemberImport(pool, {
          organizationId: org.id,
          branchId: branch.id,
          platformTenantId: org.platform_tenant_id,
          adminId: req.churchBranchAdmin.admin_id,
          buffer: req.file.buffer,
          originalFilename: req.file.originalname,
          batchKey: String((req.body && req.body.batch_key) || "").trim() || null,
          actorType: "branch_admin",
        });

        return res.redirect(303, `/branch/members/import/${result.batch.id}`);
      } catch (err) {
        if (err && (err.code === "MALFORMED_CSV" || err.code === "TOO_MANY_ROWS" || err.code === "FILE_TOO_LARGE")) {
          const pool = getPgPool();
          const batches = await churchMemberImportService.listImportBatchesForBranch(
            pool,
            req.churchContext.organization.id,
            req.churchContext.branch.id
          );
          return res.status(400).render(
            "church/branch-admin/member_import",
            branchAdminLocals(req, {
              batches,
              error: err.message,
              notice: null,
            })
          );
        }
        return next(err);
      }
    }
  );

  router.get(
    "/branch/members/import/:batchId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const batchId = Number(req.params.batchId);
        if (!Number.isFinite(batchId) || batchId <= 0) {
          return res.status(404).type("text").send("Import batch not found.");
        }
        const pool = getPgPool();
        const org = req.churchContext.organization;
        const branch = req.churchContext.branch;
        const page = Math.max(Number(req.query.page) || 1, 1);
        const diagnostic = await churchMemberImportService.getImportBatchDetail(pool, batchId, {
          organizationId: org.id,
          branchId: branch.id,
          page,
          limit: 75,
        });
        if (!diagnostic) {
          return res.status(404).type("text").send("Import batch not found.");
        }
        return res.render(
          "church/branch-admin/member_import_review",
          branchAdminLocals(req, {
            diagnostic,
            error: null,
            notice: noticeMessage(flashFromQuery(req, MEMBER_NOTICES)),
          })
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  router.post(
    "/branch/members/import/:batchId/decisions",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const batchId = Number(req.params.batchId);
        const pool = getPgPool();
        const org = req.churchContext.organization;
        const branch = req.churchContext.branch;
        const decisions = [];
        const body = req.body || {};
        for (const [key, value] of Object.entries(body)) {
          const m = String(key).match(/^decision_(\d+)$/);
          if (m) {
            decisions.push({ rowId: Number(m[1]), decision: value });
          }
        }
        await churchMemberImportService.updateImportRowDecisions(pool, {
          batchId,
          organizationId: org.id,
          branchId: branch.id,
          decisions,
        });
        const page = Math.max(Number(req.body && req.body.page) || 1, 1);
        const qs = page > 1 ? `?page=${page}&notice=import_decisions_saved` : "?notice=import_decisions_saved";
        return res.redirect(303, `/branch/members/import/${batchId}${qs}`);
      } catch (err) {
        if (err && (err.code === "NOT_FOUND" || err.code === "INVALID_STATUS")) {
          return res.status(400).type("text").send(err.message);
        }
        return next(err);
      }
    }
  );

  router.post(
    "/branch/members/import/:batchId/commit",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const batchId = Number(req.params.batchId);
        const pool = getPgPool();
        const org = req.churchContext.organization;
        const branch = req.churchContext.branch;
        const result = await churchMemberImportService.commitMemberImport(pool, {
          batchId,
          organizationId: org.id,
          branchId: branch.id,
          adminId: req.churchBranchAdmin.admin_id,
          actorType: "branch_admin",
        });
        return res.redirect(
          303,
          `/branch/members/import/${batchId}/summary?notice=${
            result.outcome === "already_committed" ? "import_already_committed" : "import_committed"
          }`
        );
      } catch (err) {
        if (err && (err.code === "NOT_FOUND" || err.code === "INVALID_STATUS")) {
          return res.status(400).type("text").send(err.message);
        }
        return next(err);
      }
    }
  );

  router.get(
    "/branch/members/import/:batchId/summary",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const batchId = Number(req.params.batchId);
        const pool = getPgPool();
        const org = req.churchContext.organization;
        const branch = req.churchContext.branch;
        const page = Math.max(Number(req.query.page) || 1, 1);
        const diagnostic = await churchMemberImportService.getImportBatchDetail(pool, batchId, {
          organizationId: org.id,
          branchId: branch.id,
          page,
          limit: 75,
        });
        if (!diagnostic) {
          return res.status(404).type("text").send("Import batch not found.");
        }
        return res.render(
          "church/branch-admin/member_import_summary",
          branchAdminLocals(req, {
            diagnostic,
            notice: noticeMessage(flashFromQuery(req, MEMBER_NOTICES)),
          })
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  router.get(
    "/branch/members/import/:batchId/errors.csv",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const batchId = Number(req.params.batchId);
        const pool = getPgPool();
        const org = req.churchContext.organization;
        const branch = req.churchContext.branch;
        const diagnostic = await churchMemberImportService.getImportBatchDetail(pool, batchId, {
          organizationId: org.id,
          branchId: branch.id,
        });
        if (!diagnostic) {
          return res.status(404).type("text").send("Import batch not found.");
        }
        const csv = churchMemberImportService.buildErrorExportCsv(diagnostic);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="member-import-${batchId}-errors.csv"`
        );
        return res.status(200).send(csv);
      } catch (err) {
        return next(err);
      }
    }
  );

  router.post(
    "/branch/members/import/:batchId/reverse",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const batchId = Number(req.params.batchId);
        const pool = getPgPool();
        const org = req.churchContext.organization;
        const branch = req.churchContext.branch;
        await churchMemberImportService.reverseMemberImportBatch(pool, {
          batchId,
          organizationId: org.id,
          branchId: branch.id,
          adminId: req.churchBranchAdmin.admin_id,
          actorType: "branch_admin",
          reason: String((req.body && req.body.reason) || "").trim() || null,
        });
        return res.redirect(303, `/branch/members/import/${batchId}/summary?notice=import_reversed`);
      } catch (err) {
        if (err && (err.code === "NOT_FOUND" || err.code === "INVALID_STATUS")) {
          return res.status(400).type("text").send(err.message);
        }
        return next(err);
      }
    }
  );
};
