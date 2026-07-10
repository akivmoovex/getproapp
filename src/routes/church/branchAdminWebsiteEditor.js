"use strict";

const { getPgPool } = require("../../db/pg");
const websiteContentRepo = require("../../db/pg/church/websiteContentRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");
const {
  contentFromForm,
  formFromContent,
  mergeWithFallbacks,
  validateForPublish,
  preparePublicViewModel,
} = require("../../services/church/websiteContentService");
const {
  branchAdminLocals,
  flashFromQuery,
  WEBSITE_NOTICES,
  noticeMessage,
  recordBranchAudit,
} = require("./branchAdminShared");

async function loadEditorForm(pool, req) {
  const org = req.churchContext.organization;
  const branch = req.churchContext.branch;
  const row = await websiteContentRepo.getWebsiteContentForBranch(pool, branch.id);
  const merged = mergeWithFallbacks(row, org, branch);
  return {
    form: formFromContent(merged),
    status: row ? row.status : "draft",
    lastPublishedAt: row ? row.last_published_at : null,
    contentId: row ? row.id : null,
  };
}

module.exports = function registerBranchAdminWebsiteEditorRoutes(router) {
  router.get(
    "/branch/website-editor",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const pool = getPgPool();
        const editor = await loadEditorForm(pool, req);
        return res.render(
          "church/branch-admin/website_editor",
          branchAdminLocals(req, {
            ...editor,
            error: null,
            notice: noticeMessage(flashFromQuery(req, WEBSITE_NOTICES)),
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/website-editor",
    requireChurchBranchHost,
    requireChurchBranchAdminSession, requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const org = req.churchContext.organization;
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const adminId = req.churchBranchAdmin.admin_id;
        const intent = String(req.body._intent || "draft").trim();
        const content = contentFromForm(req.body || {});

        if (intent === "publish") {
          const validation = validateForPublish(content);
          if (!validation.ok) {
            const editor = await loadEditorForm(pool, req);
            return res.status(400).render(
              "church/branch-admin/website_editor",
              branchAdminLocals(req, {
                ...editor,
                form: { ...editor.form, ...formFromContent(content) },
                error: validation.error,
                notice: null,
              })
            );
          }
        }

        const saved = await websiteContentRepo.upsertWebsiteDraftForBranch(pool, branch.id, {
          organization_id: org.id,
          ...content,
          updated_by_admin_id: adminId,
        });

        await recordBranchAudit(pool, req, {
          action: "website_draft_saved",
          entityType: "website_content",
          entityId: saved.id,
          metadata: { status: "draft", branch_name: branch.name },
        });

        if (intent === "publish") {
          const published = await websiteContentRepo.publishWebsiteContentForBranch(
            pool,
            branch.id,
            adminId
          );
          if (!published) {
            const editor = await loadEditorForm(pool, req);
            return res.status(400).render(
              "church/branch-admin/website_editor",
              branchAdminLocals(req, {
                ...editor,
                error: "Website content could not be published.",
                notice: null,
              })
            );
          }
          await recordBranchAudit(pool, req, {
            action: "website_published",
            entityType: "website_content",
            entityId: published.id,
            metadata: { status: "published", branch_name: branch.name },
          });
          return res.redirect(303, "/branch/website-editor?notice=website_published");
        }

        return res.redirect(303, "/branch/website-editor?notice=website_draft_saved");
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/branch/website-preview",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const org = req.churchContext.organization;
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const row = await websiteContentRepo.getWebsiteContentForBranch(pool, branch.id);
        const merged = mergeWithFallbacks(row, org, branch);
        const locals = preparePublicViewModel(org, branch, merged, {
          activePage: "home",
          isPreview: true,
          upcomingEvents: [],
          publicAnnouncements: [],
        });
        return res.render("church/public/home", locals);
      } catch (e) {
        return next(e);
      }
    }
  );
};
