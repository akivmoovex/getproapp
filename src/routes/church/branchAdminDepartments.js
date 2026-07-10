"use strict";

const { getPgPool } = require("../../db/pg");
const departmentsRepo = require("../../db/pg/church/departmentsRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");
const {
  departmentStatusLabel,
  validateDepartmentBody,
} = require("../../church/ministriesDepartmentsValidation");
const {
  branchAdminLocals,
  flashFromQuery,
  DEPARTMENT_NOTICES,
  noticeMessage,
  recordBranchAudit,
} = require("./branchAdminShared");

const DEPARTMENT_FILTERS = ["all", "active", "archived"];

function formFromDepartment(item) {
  if (!item) {
    return { name: "", slug: "", purpose: "", leader_name: "", leader_phone: "" };
  }
  return {
    name: item.name,
    slug: item.slug,
    purpose: item.purpose,
    leader_name: item.leader_name,
    leader_phone: item.leader_phone || "",
  };
}

function renderLocals(req, extra) {
  return branchAdminLocals(req, {
    departmentStatusLabel,
    ...(extra || {}),
  });
}

module.exports = function registerBranchAdminDepartmentsRoutes(router) {
  router.get(
    "/branch/departments",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const filter = String(req.query.status || "all").trim();
        const statusFilter = DEPARTMENT_FILTERS.includes(filter) ? filter : "all";
        const departments = await departmentsRepo.listDepartmentsForBranch(pool, branch.id, {
          status: statusFilter,
        });
        return res.render(
          "church/branch-admin/departments_directory",
          renderLocals(req, {
            departments,
            statusFilter,
            departmentFilters: DEPARTMENT_FILTERS,
            notice: noticeMessage(flashFromQuery(req, DEPARTMENT_NOTICES)),
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get("/branch/departments/new", requireChurchBranchHost, requireChurchBranchAdminSession, (req, res) => {
    return res.render(
      "church/branch-admin/department_form",
      renderLocals(req, { form: formFromDepartment(null), error: null, isEdit: false, departmentId: null })
    );
  });

  router.post(
    "/branch/departments",
    requireChurchBranchHost,
    requireChurchBranchAdminSession, requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const validation = validateDepartmentBody(req.body || {});
        const org = req.churchContext.organization;
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const adminId = req.churchBranchAdmin.admin_id;

        if (!validation.ok) {
          return res.status(400).render(
            "church/branch-admin/department_form",
            renderLocals(req, {
              form: validation.form,
              error: validation.error,
              isEdit: false,
              departmentId: null,
            })
          );
        }

        const created = await departmentsRepo.createDepartmentForBranch(pool, {
          organization_id: org.id,
          branch_id: branch.id,
          ...validation.data,
          status: "active",
          created_by_admin_id: adminId,
        });

        await recordBranchAudit(pool, req, {
          action: "department_created",
          entityType: "department",
          entityId: created.id,
          metadata: { name: created.name, status: created.status },
        });

        return res.redirect(303, `/branch/departments/${created.id}?notice=department_created`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/branch/departments/:departmentId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const departmentId = Number(req.params.departmentId);
        if (!Number.isFinite(departmentId) || departmentId <= 0) {
          return res.status(404).type("text").send("Department not found.");
        }
        const pool = getPgPool();
        const department = await departmentsRepo.findDepartmentByIdForBranch(
          pool,
          departmentId,
          req.churchContext.branch.id
        );
        if (!department) return res.status(404).type("text").send("Department not found.");
        return res.render(
          "church/branch-admin/department_profile",
          renderLocals(req, {
            department,
            error: null,
            notice: noticeMessage(flashFromQuery(req, DEPARTMENT_NOTICES)),
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/branch/departments/:departmentId/edit",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const departmentId = Number(req.params.departmentId);
        if (!Number.isFinite(departmentId) || departmentId <= 0) {
          return res.status(404).type("text").send("Department not found.");
        }
        const pool = getPgPool();
        const department = await departmentsRepo.findDepartmentByIdForBranch(
          pool,
          departmentId,
          req.churchContext.branch.id
        );
        if (!department) return res.status(404).type("text").send("Department not found.");
        return res.render(
          "church/branch-admin/department_form",
          renderLocals(req, {
            form: formFromDepartment(department),
            error: null,
            isEdit: true,
            departmentId,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/departments/:departmentId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession, requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const departmentId = Number(req.params.departmentId);
        if (!Number.isFinite(departmentId) || departmentId <= 0) {
          return res.status(404).type("text").send("Department not found.");
        }
        const intent = String(req.body._intent || "save").trim();
        const validation = validateDepartmentBody(req.body || {});
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const adminId = req.churchBranchAdmin.admin_id;

        const existing = await departmentsRepo.findDepartmentByIdForBranch(pool, departmentId, branch.id);
        if (!existing) return res.status(404).type("text").send("Department not found.");

        if (!validation.ok) {
          return res.status(400).render(
            "church/branch-admin/department_form",
            renderLocals(req, {
              form: validation.form,
              error: validation.error,
              isEdit: true,
              departmentId,
            })
          );
        }

        const updated = await departmentsRepo.updateDepartmentForBranch(pool, departmentId, branch.id, {
          ...validation.data,
          updated_by_admin_id: adminId,
        });

        await recordBranchAudit(pool, req, {
          action: "department_updated",
          entityType: "department",
          entityId: departmentId,
          metadata: { name: updated.name, status: updated.status },
        });

        if (intent === "activate") {
          await departmentsRepo.activateDepartmentForBranch(pool, departmentId, branch.id, adminId);
          await recordBranchAudit(pool, req, {
            action: "department_activated",
            entityType: "department",
            entityId: departmentId,
            metadata: { name: updated.name, status: "active" },
          });
          return res.redirect(303, `/branch/departments/${departmentId}?notice=department_activated`);
        }

        return res.redirect(303, `/branch/departments/${departmentId}?notice=department_updated`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/departments/:departmentId/activate",
    requireChurchBranchHost,
    requireChurchBranchAdminSession, requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const departmentId = Number(req.params.departmentId);
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const adminId = req.churchBranchAdmin.admin_id;
        const existing = await departmentsRepo.findDepartmentByIdForBranch(pool, departmentId, branch.id);
        if (!existing) return res.status(404).type("text").send("Department not found.");
        const activated = await departmentsRepo.activateDepartmentForBranch(pool, departmentId, branch.id, adminId);
        if (!activated) {
          return res.status(400).render(
            "church/branch-admin/department_profile",
            renderLocals(req, {
              department: existing,
              error: "Department could not be activated.",
              notice: null,
            })
          );
        }
        await recordBranchAudit(pool, req, {
          action: "department_activated",
          entityType: "department",
          entityId: departmentId,
          metadata: { name: activated.name, status: "active" },
        });
        return res.redirect(303, `/branch/departments/${departmentId}?notice=department_activated`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/departments/:departmentId/archive",
    requireChurchBranchHost,
    requireChurchBranchAdminSession, requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const departmentId = Number(req.params.departmentId);
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const adminId = req.churchBranchAdmin.admin_id;
        const existing = await departmentsRepo.findDepartmentByIdForBranch(pool, departmentId, branch.id);
        if (!existing) return res.status(404).type("text").send("Department not found.");
        const archived = await departmentsRepo.archiveDepartmentForBranch(pool, departmentId, branch.id, adminId);
        if (!archived) {
          return res.status(400).render(
            "church/branch-admin/department_profile",
            renderLocals(req, {
              department: existing,
              error: "Department could not be archived.",
              notice: null,
            })
          );
        }
        await recordBranchAudit(pool, req, {
          action: "department_archived",
          entityType: "department",
          entityId: departmentId,
          metadata: { name: archived.name, status: "archived" },
        });
        return res.redirect(303, `/branch/departments?notice=department_archived`);
      } catch (e) {
        return next(e);
      }
    }
  );
};
