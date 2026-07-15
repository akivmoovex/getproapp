"use strict";

const { getPgPool } = require("../../db/pg");
const ministryLeadersRepo = require("../../db/pg/church/ministryLeadersRepo");
const ministriesRepo = require("../../db/pg/church/ministriesRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { hashLeaderPassword } = require("../../church/leaderAuth");
const { requireChurchBranchHost } = require("./auth");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");
const {
  LEADER_ROLES,
  leaderRoleLabel,
  leaderStatusLabel,
  validateLeaderCreateBody,
  validateLeaderUpdateBody,
  validatePasswordResetBody,
} = require("../../church/leaderManagementValidation");
const {
  branchAdminLocals,
  flashFromQuery,
  LEADER_NOTICES,
  noticeMessage,
  recordBranchAudit,
} = require("./branchAdminShared");

const LEADER_FILTERS = ["all", "active", "inactive"];

function formFromLeader(item, defaults = {}) {
  if (!item) {
    return {
      full_name: "",
      email: "",
      phone: "",
      ministry_id: defaults.ministry_id ? String(defaults.ministry_id) : "",
      role: "ministry_leader",
      status: "active",
      notes: "",
      temporary_password: "",
    };
  }
  return {
    full_name: item.full_name,
    email: item.email,
    phone: item.phone || "",
    ministry_id: item.ministry_id ? String(item.ministry_id) : "",
    role: item.role || "ministry_leader",
    status: item.status || "active",
    notes: item.notes || "",
    temporary_password: "",
  };
}

function renderLocals(req, extra) {
  return branchAdminLocals(req, {
    leaderRoles: LEADER_ROLES,
    leaderRoleLabel,
    leaderStatusLabel,
    ...(extra || {}),
  });
}

async function loadMinistriesForForm(pool, branchId) {
  return ministriesRepo.listMinistriesForBranch(pool, branchId, { status: "all" });
}

async function validateMinistryAssignment(pool, ministryId, branchId) {
  const ministry = await ministriesRepo.findMinistryByIdForBranch(pool, ministryId, branchId);
  if (!ministry) {
    return { ok: false, error: "Selected ministry does not belong to this branch." };
  }
  return { ok: true, ministry };
}

async function validateLeaderIdentifiers(pool, branchId, email, phone, excludeLeaderId) {
  const conflict = await ministryLeadersRepo.findLeaderConflictForBranch(pool, branchId, {
    email,
    phone,
    excludeLeaderId,
  });
  if (conflict) {
    return {
      ok: false,
      error: `Another leader (${conflict.full_name}) already uses this email or phone.`,
    };
  }
  return { ok: true };
}

module.exports = function registerBranchAdminLeadersRoutes(router) {
  router.get("/branch/leaders", requireChurchBranchHost, requireChurchBranchAdminSession, async (req, res, next) => {
    try {
      const branch = req.churchContext.branch;
      const pool = getPgPool();
      const filter = String(req.query.status || "all").trim();
      const statusFilter = LEADER_FILTERS.includes(filter) ? filter : "all";
      const leaders = await ministryLeadersRepo.listLeadersForBranch(pool, branch.id, {
        status: statusFilter,
      });
      return res.render(
        "church/branch-admin/leaders_directory",
        renderLocals(req, {
          leaders,
          statusFilter,
          leaderFilters: LEADER_FILTERS,
          notice: noticeMessage(flashFromQuery(req, LEADER_NOTICES)),
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get("/branch/leaders/new", requireChurchBranchHost, requireChurchBranchAdminSession, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const ministryId = Number(req.query.ministry_id);
      const ministries = await loadMinistriesForForm(pool, req.churchContext.branch.id);
      return res.render(
        "church/branch-admin/leader_form",
        renderLocals(req, {
          form: formFromLeader(null, {
            ministry_id: Number.isFinite(ministryId) && ministryId > 0 ? ministryId : null,
          }),
          ministries,
          error: null,
          isEdit: false,
          leaderId: null,
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.post("/branch/leaders", requireChurchBranchHost, requireChurchBranchAdminSession, requireChurchSessionCsrf, async (req, res, next) => {
    try {
      const validation = validateLeaderCreateBody(req.body || {});
      const org = req.churchContext.organization;
      const branch = req.churchContext.branch;
      const pool = getPgPool();
      const adminId = req.churchBranchAdmin.admin_id;
      const ministries = await loadMinistriesForForm(pool, branch.id);

      if (!validation.ok) {
        return res.status(400).render(
          "church/branch-admin/leader_form",
          renderLocals(req, {
            form: validation.form,
            ministries,
            error: validation.error,
            isEdit: false,
            leaderId: null,
          })
        );
      }

      const ministryCheck = await validateMinistryAssignment(pool, validation.data.ministry_id, branch.id);
      if (!ministryCheck.ok) {
        return res.status(400).render(
          "church/branch-admin/leader_form",
          renderLocals(req, {
            form: validation.form,
            ministries,
            error: ministryCheck.error,
            isEdit: false,
            leaderId: null,
          })
        );
      }

      const identCheck = await validateLeaderIdentifiers(
        pool,
        branch.id,
        validation.data.email,
        validation.data.phone
      );
      if (!identCheck.ok) {
        return res.status(400).render(
          "church/branch-admin/leader_form",
          renderLocals(req, {
            form: validation.form,
            ministries,
            error: identCheck.error,
            isEdit: false,
            leaderId: null,
          })
        );
      }

      const passwordHash = await hashLeaderPassword(validation.data.password);
      const created = await ministryLeadersRepo.createLeaderForBranch(pool, {
        organization_id: org.id,
        branch_id: branch.id,
        ...validation.data,
        password_hash: passwordHash,
        created_by_admin_id: adminId,
      });

      await recordBranchAudit(pool, req, {
        action: "ministry_leader_created",
        entityType: "ministry_leader",
        entityId: created.id,
        metadata: {
          name: created.full_name,
          ministry_id: created.ministry_id,
          status: created.status,
        },
      });

      return res.redirect(303, `/branch/leaders/${created.id}?notice=leader_created`);
    } catch (e) {
      if (e && e.code === "FOUNDATION_ADMIN_LIMIT") {
        try {
          const pool = getPgPool();
          const branch = req.churchContext.branch;
          const ministries = await ministriesRepo.listMinistriesForBranch(pool, branch.id);
          return res.status(400).render(
            "church/branch-admin/leader_form",
            renderLocals(req, {
              form: req.body || {},
              ministries,
              error: e.message,
              isEdit: false,
              leaderId: null,
            })
          );
        } catch {
          return res.status(400).type("text").send(e.message);
        }
      }
      return next(e);
    }
  });

  router.get(
    "/branch/leaders/:leaderId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const leaderId = Number(req.params.leaderId);
        if (!Number.isFinite(leaderId) || leaderId <= 0) {
          return res.status(404).type("text").send("Leader not found.");
        }
        const pool = getPgPool();
        const leader = await ministryLeadersRepo.findLeaderByIdForBranch(
          pool,
          leaderId,
          req.churchContext.branch.id
        );
        if (!leader) return res.status(404).type("text").send("Leader not found.");
        const stats = await ministryLeadersRepo.countLeaderActivityStats(pool, leaderId);
        return res.render(
          "church/branch-admin/leader_profile",
          renderLocals(req, {
            leader,
            stats,
            passwordError: null,
            notice: noticeMessage(flashFromQuery(req, LEADER_NOTICES)),
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/branch/leaders/:leaderId/edit",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const leaderId = Number(req.params.leaderId);
        if (!Number.isFinite(leaderId) || leaderId <= 0) {
          return res.status(404).type("text").send("Leader not found.");
        }
        const pool = getPgPool();
        const branchId = req.churchContext.branch.id;
        const leader = await ministryLeadersRepo.findLeaderByIdForBranch(pool, leaderId, branchId);
        if (!leader) return res.status(404).type("text").send("Leader not found.");
        const ministries = await loadMinistriesForForm(pool, branchId);
        return res.render(
          "church/branch-admin/leader_form",
          renderLocals(req, {
            form: formFromLeader(leader),
            ministries,
            error: null,
            isEdit: true,
            leaderId,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/leaders/:leaderId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession, requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const leaderId = Number(req.params.leaderId);
        if (!Number.isFinite(leaderId) || leaderId <= 0) {
          return res.status(404).type("text").send("Leader not found.");
        }
        const validation = validateLeaderUpdateBody(req.body || {});
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const adminId = req.churchBranchAdmin.admin_id;

        const existing = await ministryLeadersRepo.findLeaderByIdForBranch(pool, leaderId, branch.id);
        if (!existing) return res.status(404).type("text").send("Leader not found.");

        const ministries = await loadMinistriesForForm(pool, branch.id);
        if (!validation.ok) {
          return res.status(400).render(
            "church/branch-admin/leader_form",
            renderLocals(req, {
              form: validation.form,
              ministries,
              error: validation.error,
              isEdit: true,
              leaderId,
            })
          );
        }

        const ministryCheck = await validateMinistryAssignment(pool, validation.data.ministry_id, branch.id);
        if (!ministryCheck.ok) {
          return res.status(400).render(
            "church/branch-admin/leader_form",
            renderLocals(req, {
              form: validation.form,
              ministries,
              error: ministryCheck.error,
              isEdit: true,
              leaderId,
            })
          );
        }

        const identCheck = await validateLeaderIdentifiers(
          pool,
          branch.id,
          validation.data.email,
          validation.data.phone,
          leaderId
        );
        if (!identCheck.ok) {
          return res.status(400).render(
            "church/branch-admin/leader_form",
            renderLocals(req, {
              form: validation.form,
              ministries,
              error: identCheck.error,
              isEdit: true,
              leaderId,
            })
          );
        }

        const updated = await ministryLeadersRepo.updateLeaderForBranch(pool, leaderId, branch.id, {
          ...validation.data,
          updated_by_admin_id: adminId,
        });

        await recordBranchAudit(pool, req, {
          action: "ministry_leader_updated",
          entityType: "ministry_leader",
          entityId: leaderId,
          metadata: {
            name: updated.full_name,
            ministry_id: updated.ministry_id,
            status: updated.status,
          },
        });

        return res.redirect(303, `/branch/leaders/${leaderId}?notice=leader_updated`);
      } catch (e) {
        if (e && e.code === "FOUNDATION_ADMIN_LIMIT") {
          try {
            const pool = getPgPool();
            const branch = req.churchContext.branch;
            const ministries = await ministriesRepo.listMinistriesForBranch(pool, branch.id);
            return res.status(400).render(
              "church/branch-admin/leader_form",
              renderLocals(req, {
                form: req.body || {},
                ministries,
                error: e.message,
                isEdit: true,
                leaderId: Number(req.params.leaderId),
              })
            );
          } catch {
            /* fall through */
          }
        }
        return next(e);
      }
    }
  );

  router.post(
    "/branch/leaders/:leaderId/activate",
    requireChurchBranchHost,
    requireChurchBranchAdminSession, requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const leaderId = Number(req.params.leaderId);
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const adminId = req.churchBranchAdmin.admin_id;
        const existing = await ministryLeadersRepo.findLeaderByIdForBranch(pool, leaderId, branch.id);
        if (!existing) return res.status(404).type("text").send("Leader not found.");
        const activated = await ministryLeadersRepo.activateLeaderForBranch(
          pool,
          leaderId,
          branch.id,
          adminId
        );
        if (!activated) {
          return res.redirect(303, `/branch/leaders/${leaderId}?notice=leader_activate_failed`);
        }
        await recordBranchAudit(pool, req, {
          action: "ministry_leader_activated",
          entityType: "ministry_leader",
          entityId: leaderId,
          metadata: {
            name: activated.full_name,
            ministry_id: activated.ministry_id,
            status: "active",
          },
        });
        return res.redirect(303, `/branch/leaders/${leaderId}?notice=leader_activated`);
      } catch (e) {
        if (e && e.code === "FOUNDATION_ADMIN_LIMIT") {
          return res.status(400).type("text").send(e.message);
        }
        return next(e);
      }
    }
  );

  router.post(
    "/branch/leaders/:leaderId/deactivate",
    requireChurchBranchHost,
    requireChurchBranchAdminSession, requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const leaderId = Number(req.params.leaderId);
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const adminId = req.churchBranchAdmin.admin_id;
        const existing = await ministryLeadersRepo.findLeaderByIdForBranch(pool, leaderId, branch.id);
        if (!existing) return res.status(404).type("text").send("Leader not found.");
        const deactivated = await ministryLeadersRepo.deactivateLeaderForBranch(
          pool,
          leaderId,
          branch.id,
          adminId
        );
        if (!deactivated) {
          return res.redirect(303, `/branch/leaders/${leaderId}?notice=leader_deactivate_failed`);
        }
        await recordBranchAudit(pool, req, {
          action: "ministry_leader_deactivated",
          entityType: "ministry_leader",
          entityId: leaderId,
          metadata: {
            name: deactivated.full_name,
            ministry_id: deactivated.ministry_id,
            status: "inactive",
          },
        });
        return res.redirect(303, `/branch/leaders/${leaderId}?notice=leader_deactivated`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/leaders/:leaderId/reset-password",
    requireChurchBranchHost,
    requireChurchBranchAdminSession, requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const leaderId = Number(req.params.leaderId);
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const adminId = req.churchBranchAdmin.admin_id;
        const existing = await ministryLeadersRepo.findLeaderByIdForBranch(pool, leaderId, branch.id);
        if (!existing) return res.status(404).type("text").send("Leader not found.");

        const validation = validatePasswordResetBody(req.body);
        if (!validation.ok) {
          const stats = await ministryLeadersRepo.countLeaderActivityStats(pool, leaderId);
          return res.status(400).render(
            "church/branch-admin/leader_profile",
            renderLocals(req, {
              leader: existing,
              stats,
              passwordError: validation.error,
              notice: null,
            })
          );
        }

        const passwordHash = await hashLeaderPassword(validation.password);
        const updated = await ministryLeadersRepo.resetLeaderPasswordForBranch(
          pool,
          leaderId,
          branch.id,
          passwordHash,
          adminId
        );
        if (!updated) {
          return res.redirect(303, `/branch/leaders/${leaderId}?notice=leader_password_reset_failed`);
        }

        await recordBranchAudit(pool, req, {
          action: "ministry_leader_password_reset",
          entityType: "ministry_leader",
          entityId: leaderId,
          metadata: {
            name: updated.full_name,
            ministry_id: updated.ministry_id,
            status: updated.status,
          },
        });

        return res.redirect(303, `/branch/leaders/${leaderId}?notice=leader_password_reset`);
      } catch (e) {
        return next(e);
      }
    }
  );
};
