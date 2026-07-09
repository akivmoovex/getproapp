"use strict";

const { getPgPool } = require("../../db/pg");
const dutyRosterRepo = require("../../db/pg/church/dutyRosterRepo");
const membersRepo = require("../../db/pg/church/membersRepo");
const ministriesRepo = require("../../db/pg/church/ministriesRepo");
const departmentsRepo = require("../../db/pg/church/departmentsRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const {
  ROLE_EXAMPLES,
  dutyStatusLabel,
  formatDutyDate,
  assignedMemberDisplay,
  validateDutyBody,
} = require("../../church/dutyRosterValidation");
const {
  branchAdminLocals,
  flashFromQuery,
  DUTY_NOTICES,
  noticeMessage,
  recordBranchAudit,
} = require("./branchAdminShared");

const DUTY_FILTERS = ["all", "draft", "confirmed", "cancelled"];

function formFromDuty(item) {
  if (!item) {
    return {
      duty_date: "",
      service_name: "",
      role_name: "",
      assigned_member_id: "",
      assigned_member_name: "",
      ministry_id: "",
      department_id: "",
      notes: "",
    };
  }
  const dutyDate =
    item.duty_date instanceof Date
      ? item.duty_date.toISOString().slice(0, 10)
      : String(item.duty_date || "").slice(0, 10);
  return {
    duty_date: dutyDate,
    service_name: item.service_name,
    role_name: item.role_name,
    assigned_member_id: item.assigned_member_id ? String(item.assigned_member_id) : "",
    assigned_member_name: item.assigned_member_name || "",
    ministry_id: item.ministry_id ? String(item.ministry_id) : "",
    department_id: item.department_id ? String(item.department_id) : "",
    notes: item.notes || "",
  };
}

function renderLocals(req, extra) {
  return branchAdminLocals(req, {
    roleExamples: ROLE_EXAMPLES,
    dutyStatusLabel,
    formatDutyDate,
    assignedMemberDisplay,
    ...(extra || {}),
  });
}

async function loadFormOptions(pool, branchId) {
  const [members, ministries, departments] = await Promise.all([
    membersRepo.listVerifiedMembersForBranch(pool, branchId),
    ministriesRepo.listMinistriesForBranch(pool, branchId, { status: "published" }),
    departmentsRepo.listDepartmentsForBranch(pool, branchId, { status: "active" }),
  ]);
  return { members, ministries, departments };
}

function ministryDepartmentLabel(duty) {
  if (!duty) return "—";
  const parts = [duty.ministry_name, duty.department_name].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

async function validateMemberAssignment(pool, branchId, assignedMemberId) {
  if (!assignedMemberId) return { ok: true };
  const member = await membersRepo.findMemberByIdForBranch(pool, assignedMemberId, branchId);
  if (!member || member.status !== "verified") {
    return { ok: false, error: "Selected member is not a verified member of this branch." };
  }
  return { ok: true };
}

module.exports = function registerBranchAdminDutyRosterRoutes(router) {
  router.get("/branch/duty-roster", requireChurchBranchHost, requireChurchBranchAdminSession, async (req, res, next) => {
    try {
      const branch = req.churchContext.branch;
      const pool = getPgPool();
      const filter = String(req.query.status || "all").trim();
      const statusFilter = DUTY_FILTERS.includes(filter) ? filter : "all";
      const [upcomingDuties, pastDuties] = await Promise.all([
        dutyRosterRepo.listDutiesForBranch(pool, branch.id, {
          status: statusFilter,
          timeframe: "upcoming",
        }),
        dutyRosterRepo.listDutiesForBranch(pool, branch.id, {
          status: statusFilter,
          timeframe: "past",
        }),
      ]);
      return res.render(
        "church/branch-admin/duty_roster",
        renderLocals(req, {
          upcomingDuties,
          pastDuties,
          statusFilter,
          dutyFilters: DUTY_FILTERS,
          ministryDepartmentLabel,
          notice: noticeMessage(flashFromQuery(req, DUTY_NOTICES)),
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get("/branch/duty-roster/new", requireChurchBranchHost, requireChurchBranchAdminSession, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const formOptions = await loadFormOptions(pool, req.churchContext.branch.id);
      return res.render(
        "church/branch-admin/duty_roster_form",
        renderLocals(req, {
          form: formFromDuty(null),
          error: null,
          isEdit: false,
          dutyId: null,
          ...formOptions,
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.post("/branch/duty-roster", requireChurchBranchHost, requireChurchBranchAdminSession, async (req, res, next) => {
    try {
      const intent = String(req.body._intent || "draft").trim();
      const validation = validateDutyBody(req.body, { forConfirm: intent === "confirm" });
      const org = req.churchContext.organization;
      const branch = req.churchContext.branch;
      const pool = getPgPool();
      const adminId = req.churchBranchAdmin.admin_id;

      if (!validation.ok) {
        const formOptions = await loadFormOptions(pool, branch.id);
        return res.status(400).render(
          "church/branch-admin/duty_roster_form",
          renderLocals(req, {
            form: validation.form,
            error: validation.error,
            isEdit: false,
            dutyId: null,
            ...formOptions,
          })
        );
      }

      if (validation.data.assigned_member_id) {
        const memberCheck = await validateMemberAssignment(pool, branch.id, validation.data.assigned_member_id);
        if (!memberCheck.ok) {
          const formOptions = await loadFormOptions(pool, branch.id);
          return res.status(400).render(
            "church/branch-admin/duty_roster_form",
            renderLocals(req, {
              form: validation.form,
              error: memberCheck.error,
              isEdit: false,
              dutyId: null,
              ...formOptions,
            })
          );
        }
      }

      const created = await dutyRosterRepo.createDutyForBranch(pool, {
        organization_id: org.id,
        branch_id: branch.id,
        ...validation.data,
        status: intent === "confirm" ? "confirmed" : "draft",
        created_by_admin_id: adminId,
      });

      await recordBranchAudit(pool, req, {
        action: "duty_created",
        entityType: "duty",
        entityId: created.id,
        metadata: {
          role_name: created.role_name,
          service_name: created.service_name,
          duty_date: String(created.duty_date).slice(0, 10),
          status: created.status,
        },
      });

      if (intent === "confirm") {
        await recordBranchAudit(pool, req, {
          action: "duty_confirmed",
          entityType: "duty",
          entityId: created.id,
          metadata: {
            role_name: created.role_name,
            service_name: created.service_name,
            duty_date: String(created.duty_date).slice(0, 10),
            status: "confirmed",
          },
        });
      }

      const notice = intent === "confirm" ? "duty_confirmed" : "duty_created";
      return res.redirect(303, `/branch/duty-roster/${created.id}?notice=${notice}`);
    } catch (e) {
      return next(e);
    }
  });

  router.get(
    "/branch/duty-roster/:dutyId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const dutyId = Number(req.params.dutyId);
        if (!Number.isFinite(dutyId) || dutyId <= 0) {
          return res.status(404).type("text").send("Duty not found.");
        }
        const pool = getPgPool();
        const duty = await dutyRosterRepo.findDutyByIdForBranch(
          pool,
          dutyId,
          req.churchContext.branch.id
        );
        if (!duty) return res.status(404).type("text").send("Duty not found.");
        return res.render(
          "church/branch-admin/duty_roster_detail",
          renderLocals(req, {
            duty,
            ministryDepartmentLabel,
            error: null,
            notice: noticeMessage(flashFromQuery(req, DUTY_NOTICES)),
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/branch/duty-roster/:dutyId/edit",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const dutyId = Number(req.params.dutyId);
        if (!Number.isFinite(dutyId) || dutyId <= 0) {
          return res.status(404).type("text").send("Duty not found.");
        }
        const pool = getPgPool();
        const branchId = req.churchContext.branch.id;
        const duty = await dutyRosterRepo.findDutyByIdForBranch(pool, dutyId, branchId);
        if (!duty) return res.status(404).type("text").send("Duty not found.");
        if (duty.status === "cancelled") {
          return res.redirect(303, `/branch/duty-roster/${dutyId}`);
        }
        const formOptions = await loadFormOptions(pool, branchId);
        return res.render(
          "church/branch-admin/duty_roster_form",
          renderLocals(req, {
            form: formFromDuty(duty),
            error: null,
            isEdit: true,
            dutyId,
            ...formOptions,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/duty-roster/:dutyId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const dutyId = Number(req.params.dutyId);
        if (!Number.isFinite(dutyId) || dutyId <= 0) {
          return res.status(404).type("text").send("Duty not found.");
        }
        const intent = String(req.body._intent || "draft").trim();
        const validation = validateDutyBody(req.body, { forConfirm: intent === "confirm" });
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const adminId = req.churchBranchAdmin.admin_id;

        const existing = await dutyRosterRepo.findDutyByIdForBranch(pool, dutyId, branch.id);
        if (!existing) return res.status(404).type("text").send("Duty not found.");
        if (existing.status === "cancelled") {
          return res.redirect(303, `/branch/duty-roster/${dutyId}`);
        }

        if (!validation.ok) {
          const formOptions = await loadFormOptions(pool, branch.id);
          return res.status(400).render(
            "church/branch-admin/duty_roster_form",
            renderLocals(req, {
              form: validation.form,
              error: validation.error,
              isEdit: true,
              dutyId,
              ...formOptions,
            })
          );
        }

        if (validation.data.assigned_member_id) {
          const memberCheck = await validateMemberAssignment(pool, branch.id, validation.data.assigned_member_id);
          if (!memberCheck.ok) {
            const formOptions = await loadFormOptions(pool, branch.id);
            return res.status(400).render(
              "church/branch-admin/duty_roster_form",
              renderLocals(req, {
                form: validation.form,
                error: memberCheck.error,
                isEdit: true,
                dutyId,
                ...formOptions,
              })
            );
          }
        }

        const updated = await dutyRosterRepo.updateDutyForBranch(pool, dutyId, branch.id, {
          ...validation.data,
          updated_by_admin_id: adminId,
        });

        if (!updated) {
          return res.status(400).render(
            "church/branch-admin/duty_roster_detail",
            renderLocals(req, {
              duty: existing,
              ministryDepartmentLabel,
              error: "Duty could not be updated.",
              notice: null,
            })
          );
        }

        await recordBranchAudit(pool, req, {
          action: "duty_updated",
          entityType: "duty",
          entityId: dutyId,
          metadata: {
            role_name: updated.role_name,
            service_name: updated.service_name,
            duty_date: String(updated.duty_date).slice(0, 10),
            status: updated.status,
          },
        });

        if (intent === "confirm") {
          const confirmed = await dutyRosterRepo.confirmDutyForBranch(pool, dutyId, branch.id, adminId);
          if (!confirmed) {
            return res.status(400).render(
              "church/branch-admin/duty_roster_detail",
              renderLocals(req, {
                duty: updated,
                ministryDepartmentLabel,
                error: "Select a verified member to confirm this duty.",
                notice: null,
              })
            );
          }
          await recordBranchAudit(pool, req, {
            action: "duty_confirmed",
            entityType: "duty",
            entityId: dutyId,
            metadata: {
              role_name: confirmed.role_name,
              service_name: confirmed.service_name,
              duty_date: String(confirmed.duty_date).slice(0, 10),
              status: "confirmed",
            },
          });
          return res.redirect(303, `/branch/duty-roster/${dutyId}?notice=duty_confirmed`);
        }

        return res.redirect(303, `/branch/duty-roster/${dutyId}?notice=duty_updated`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/duty-roster/:dutyId/confirm",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const dutyId = Number(req.params.dutyId);
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const adminId = req.churchBranchAdmin.admin_id;
        const existing = await dutyRosterRepo.findDutyByIdForBranch(pool, dutyId, branch.id);
        if (!existing) return res.status(404).type("text").send("Duty not found.");
        if (!existing.assigned_member_id) {
          return res.status(400).render(
            "church/branch-admin/duty_roster_detail",
            renderLocals(req, {
              duty: existing,
              ministryDepartmentLabel,
              error: "Select a verified member before confirming.",
              notice: null,
            })
          );
        }
        const confirmed = await dutyRosterRepo.confirmDutyForBranch(pool, dutyId, branch.id, adminId);
        if (!confirmed) {
          return res.status(400).render(
            "church/branch-admin/duty_roster_detail",
            renderLocals(req, {
              duty: existing,
              ministryDepartmentLabel,
              error: "Duty could not be confirmed.",
              notice: null,
            })
          );
        }
        await recordBranchAudit(pool, req, {
          action: "duty_confirmed",
          entityType: "duty",
          entityId: dutyId,
          metadata: {
            role_name: confirmed.role_name,
            service_name: confirmed.service_name,
            duty_date: String(confirmed.duty_date).slice(0, 10),
            status: "confirmed",
          },
        });
        return res.redirect(303, `/branch/duty-roster/${dutyId}?notice=duty_confirmed`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/duty-roster/:dutyId/cancel",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const dutyId = Number(req.params.dutyId);
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const adminId = req.churchBranchAdmin.admin_id;
        const existing = await dutyRosterRepo.findDutyByIdForBranch(pool, dutyId, branch.id);
        if (!existing) return res.status(404).type("text").send("Duty not found.");
        const cancelled = await dutyRosterRepo.cancelDutyForBranch(pool, dutyId, branch.id, adminId);
        if (!cancelled) {
          return res.status(400).render(
            "church/branch-admin/duty_roster_detail",
            renderLocals(req, {
              duty: existing,
              ministryDepartmentLabel,
              error: "Duty could not be cancelled.",
              notice: null,
            })
          );
        }
        await recordBranchAudit(pool, req, {
          action: "duty_cancelled",
          entityType: "duty",
          entityId: dutyId,
          metadata: {
            role_name: cancelled.role_name,
            service_name: cancelled.service_name,
            duty_date: String(cancelled.duty_date).slice(0, 10),
            status: "cancelled",
          },
        });
        return res.redirect(303, `/branch/duty-roster?notice=duty_cancelled`);
      } catch (e) {
        return next(e);
      }
    }
  );
};
