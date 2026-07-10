"use strict";

const { getPgPool } = require("../../db/pg");
const resourcesRepo = require("../../db/pg/church/resourcesRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const { branchAdminLocals, flashFromQuery, noticeMessage } = require("./branchAdminShared");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");

const RESOURCE_NOTICES = {
  resource_created: "Resource saved.",
  resource_published: "Resource published.",
  resource_updated: "Resource updated.",
};

const RESOURCE_FILTERS = ["all", "draft", "published"];
const RESOURCE_TYPES = ["study", "document", "form"];

function formFromResource(item) {
  if (!item) {
    return {
      title: "",
      description: "",
      resource_type: "study",
      file_url: "",
      external_url: "",
      visibility: "members",
    };
  }
  return {
    title: item.title,
    description: item.description,
    resource_type: item.resource_type,
    file_url: item.file_url || "",
    external_url: item.external_url || "",
    visibility: item.visibility || "members",
  };
}

module.exports = function registerBranchAdminResourcesRoutes(router) {
  router.get("/branch/resources", requireChurchBranchHost, requireChurchBranchAdminSession, async (req, res, next) => {
    try {
      const branch = req.churchContext.branch;
      const pool = getPgPool();
      const filter = String(req.query.status || "all").trim();
      const typeFilter = String(req.query.type || "all").trim();
      const statusFilter = RESOURCE_FILTERS.includes(filter) ? filter : "all";
      const resourceTypeFilter = RESOURCE_TYPES.includes(typeFilter) ? typeFilter : "all";
      const resources = await resourcesRepo.listResourcesForBranch(pool, branch.id, {
        status: statusFilter,
        resource_type: resourceTypeFilter,
      });
      return res.render(
        "church/branch-admin/resources_management",
        branchAdminLocals(req, {
          resources,
          statusFilter,
          resourceTypeFilter,
          resourceFilters: RESOURCE_FILTERS,
          resourceTypes: RESOURCE_TYPES,
          notice: noticeMessage(flashFromQuery(req, RESOURCE_NOTICES)),
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get("/branch/resources/new", requireChurchBranchHost, requireChurchBranchAdminSession, (req, res) => {
    return res.render(
      "church/branch-admin/resource_form",
      branchAdminLocals(req, { form: formFromResource(null), error: null, isEdit: false, resourceId: null })
    );
  });

  router.post("/branch/resources", requireChurchBranchHost, requireChurchBranchAdminSession, requireChurchSessionCsrf, async (req, res, next) => {
    try {
      const branch = req.churchContext.branch;
      const org = req.churchContext.organization;
      const pool = getPgPool();
      const body = req.body || {};
      const title = String(body.title || "").trim();
      if (!title) {
        return res.render(
          "church/branch-admin/resource_form",
          branchAdminLocals(req, {
            form: formFromResource(body),
            error: "Title is required.",
            isEdit: false,
            resourceId: null,
          })
        );
      }
      const publish = body._intent === "publish";
      const created = await resourcesRepo.createResourceForBranch(pool, {
        organization_id: org.id,
        branch_id: branch.id,
        title,
        description: String(body.description || "").trim(),
        resource_type: String(body.resource_type || "study").trim(),
        file_url: String(body.file_url || "").trim() || null,
        external_url: String(body.external_url || "").trim() || null,
        visibility: String(body.visibility || "members").trim(),
        status: publish ? "published" : "draft",
        created_by_admin_id: req.churchBranchAdmin.id,
      });
      const notice = publish ? "resource_published" : "resource_created";
      return res.redirect(303, `/branch/resources/${created.id}?notice=${notice}`);
    } catch (e) {
      return next(e);
    }
  });

  router.get("/branch/resources/:resourceId", requireChurchBranchHost, requireChurchBranchAdminSession, async (req, res, next) => {
    try {
      const branch = req.churchContext.branch;
      const pool = getPgPool();
      const resource = await resourcesRepo.findResourceByIdForBranch(pool, Number(req.params.resourceId), branch.id);
      if (!resource) return res.status(404).type("text").send("Resource not found.");
      return res.render(
        "church/branch-admin/resource_form",
        branchAdminLocals(req, {
          form: formFromResource(resource),
          error: null,
          isEdit: true,
          resourceId: resource.id,
          resource,
          notice: noticeMessage(flashFromQuery(req, RESOURCE_NOTICES)),
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.post("/branch/resources/:resourceId", requireChurchBranchHost, requireChurchBranchAdminSession, requireChurchSessionCsrf, async (req, res, next) => {
    try {
      const branch = req.churchContext.branch;
      const pool = getPgPool();
      const resourceId = Number(req.params.resourceId);
      const body = req.body || {};
      const title = String(body.title || "").trim();
      if (!title) {
        return res.render(
          "church/branch-admin/resource_form",
          branchAdminLocals(req, {
            form: formFromResource(body),
            error: "Title is required.",
            isEdit: true,
            resourceId,
          })
        );
      }
      const publish = body._intent === "publish";
      await resourcesRepo.updateResourceForBranch(pool, resourceId, branch.id, {
        title,
        description: String(body.description || "").trim(),
        resource_type: String(body.resource_type || "study").trim(),
        file_url: String(body.file_url || "").trim() || null,
        external_url: String(body.external_url || "").trim() || null,
        visibility: String(body.visibility || "members").trim(),
        status: publish ? "published" : String(body.status || "draft"),
        updated_by_admin_id: req.churchBranchAdmin.id,
      });
      const notice = publish ? "resource_published" : "resource_updated";
      return res.redirect(303, `/branch/resources/${resourceId}?notice=${notice}`);
    } catch (e) {
      return next(e);
    }
  });
};
