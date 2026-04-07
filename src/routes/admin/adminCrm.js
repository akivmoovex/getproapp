/**
 * CRM tasks.
 */
const { isSuperAdmin } = require("../../auth");
const { canAccessCrm, canMutateCrm, canClaimCrmTasks } = require("../../auth/roles");
const { CRM_TASK_STATUSES, normalizeCrmTaskStatus, crmTaskStatusLabel } = require("../../crm/crmTaskStatuses");
const { getAdminTenantId, normalizeCrmAttachmentUrl, safeCrmRedirect } = require("./adminShared");
const { getPgPool } = require("../../db/pg");
const crmTasksRepo = require("../../db/pg/crmTasksRepo");

module.exports = function registerAdminCrmRoutes(router) {
  function requireCrmAccess(req, res, next) {
    if (!req.session.adminUser) return res.redirect("/admin/login");
    if (!canAccessCrm(req.session.adminUser.role)) {
      return res.status(403).type("text").send("CRM is not available for your role.");
    }
    return next();
  }

  async function loadCrmTaskDetailData(req, rawId) {
    const pool = getPgPool();
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const role = req.session.adminUser.role;
    const superU = isSuperAdmin(role);
    const id = Number(rawId);
    if (!id || id < 1) return null;
    const task = await crmTasksRepo.getTaskByIdAndTenant(pool, id, tid);
    if (!task) return null;
    const isOwner = task.owner_id != null && Number(task.owner_id) === Number(uid);
    const canEdit = canMutateCrm(role) && (isOwner || superU);
    const showClaim =
      canClaimCrmTasks(role) &&
      task.owner_id == null &&
      normalizeCrmTaskStatus(task.status) === "new";

    const comments = await crmTasksRepo.listCommentsForTask(pool, id, tid);
    const tenantUsersForReassign = superU ? await crmTasksRepo.listTenantUsersForCrm(pool, tid) : [];
    const auditLogs = await crmTasksRepo.listAuditForTask(pool, id, tid);

    return {
      activeNav: "crm",
      task,
      comments,
      auditLogs,
      crmTaskStatusLabel,
      CRM_TASK_STATUSES,
      currentStatus: normalizeCrmTaskStatus(task.status),
      canEdit,
      isOwner,
      showClaim,
      canMutateCrm: canMutateCrm(role),
      canClaimCrmTasks: canClaimCrmTasks(role),
      isSuperCrm: superU,
      tenantUsersForReassign,
    };
  }

  router.get("/crm", requireCrmAccess, async (req, res) => {
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const role = req.session.adminUser.role;
    const superU = isSuperAdmin(role);

    const pool = getPgPool();
    const rows = await crmTasksRepo.listTasksForBoard(pool, tid);

    for (const t of rows) {
      t.canDrag =
        canMutateCrm(role) &&
        (superU ||
          (!t.owner_id && normalizeCrmTaskStatus(t.status) === "new" && canClaimCrmTasks(role)) ||
          (t.owner_id != null && Number(t.owner_id) === Number(uid)));
    }

    const tasksByStatus = {};
    for (const s of CRM_TASK_STATUSES) tasksByStatus[s] = [];
    for (const t of rows) {
      const st = normalizeCrmTaskStatus(t.status);
      if (tasksByStatus[st]) tasksByStatus[st].push(t);
    }

    let crmTenantUsers = await crmTasksRepo.listTenantUsersForCrm(pool, tid);
    if (!crmTenantUsers.length) {
      const uname = req.session.adminUser.username || "You";
      crmTenantUsers = [{ id: uid, username: uname }];
    }

    const unassignedTasks = rows.filter(
      (t) => t.owner_id == null && normalizeCrmTaskStatus(t.status) === "new"
    );

    return res.render("admin/crm", {
      activeNav: "crm",
      tasksByStatus,
      unassignedTasks,
      CRM_TASK_STATUSES,
      crmTaskStatusLabel,
      canMutateCrm: canMutateCrm(role),
      canClaimCrmTasks: canClaimCrmTasks(role),
      isSuperCrm: superU,
      currentUserId: uid,
      currentUsername: req.session.adminUser.username || "",
      crmTenantUsers,
    });
  });

  router.get("/crm/tasks/:id/panel", requireCrmAccess, async (req, res) => {
    const data = await loadCrmTaskDetailData(req, req.params.id);
    if (!data) return res.status(404).type("text").send("Not found");
    return res.render("admin/crm_task_panel", { ...data, overlayMode: true });
  });

  router.get("/crm/tasks/:id", requireCrmAccess, async (req, res) => {
    const data = await loadCrmTaskDetailData(req, req.params.id);
    if (!data) return res.status(404).send("Task not found");
    return res.render("admin/crm_task_detail", { ...data, overlayMode: false });
  });

  router.post("/crm/tasks", requireCrmAccess, async (req, res) => {
    if (!canMutateCrm(req.session.adminUser.role)) return res.status(403).type("text").send("Read-only access.");
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const title = String((req.body && req.body.title) || "").trim().slice(0, 200);
    const description = String((req.body && req.body.description) || "").trim().slice(0, 8000);
    const attachment_url = normalizeCrmAttachmentUrl(req.body && req.body.attachment_url);
    if (!title) return res.status(400).send("Title is required.");

    const rawOwner = req.body && req.body.owner_id;
    let ownerId = null;
    if (rawOwner !== "" && rawOwner !== undefined && rawOwner !== null) {
      const n = Number(rawOwner);
      if (n && n > 0) ownerId = n;
    }
    const pool = getPgPool();
    if (ownerId != null) {
      if (!(await crmTasksRepo.userIsInTenant(pool, null, ownerId, tid))) {
        return res.status(400).send("Invalid assignee.");
      }
    }
    const status = ownerId != null ? "in_progress" : "new";

    try {
      await crmTasksRepo.createTaskWithAudit(pool, {
        tenantId: tid,
        title,
        description,
        status,
        ownerId,
        createdById: uid,
        attachmentUrl: attachment_url,
      });
    } catch (e) {
      return res.status(400).send(e.message || "Could not create task");
    }
    return res.redirect("/admin/crm");
  });

  router.post("/crm/tasks/:id/fields", requireCrmAccess, async (req, res) => {
    if (!canMutateCrm(req.session.adminUser.role)) return res.status(403).type("text").send("Read-only access.");
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id.");
    const pool = getPgPool();
    const task = await crmTasksRepo.getTaskByIdAndTenant(pool, id, tid);
    if (!task) return res.status(404).send("Not found.");
    const role = req.session.adminUser.role;
    const superU = isSuperAdmin(role);
    const isOwner = task.owner_id != null && Number(task.owner_id) === Number(uid);
    if (!superU && !isOwner) return res.status(403).type("text").send("Forbidden.");
    const title = String((req.body && req.body.title) || "").trim().slice(0, 200);
    const description = String((req.body && req.body.description) || "").trim().slice(0, 8000);
    const attachment_url = normalizeCrmAttachmentUrl(req.body && req.body.attachment_url);
    if (!title) return res.status(400).send("Title is required.");
    try {
      const ok = await crmTasksRepo.updateTaskFieldsWithAudit(pool, {
        tenantId: tid,
        taskId: id,
        userId: uid,
        title,
        description,
        attachmentUrl: attachment_url,
      });
      if (!ok) return res.status(404).send("Not found.");
    } catch (e) {
      return res.status(400).send(e.message || "Could not save");
    }
    return res.redirect(safeCrmRedirect(req, `/admin/crm/tasks/${id}`));
  });

  router.post("/crm/tasks/:id/claim", requireCrmAccess, async (req, res) => {
    if (!canClaimCrmTasks(req.session.adminUser.role)) {
      return res.status(403).type("text").send("You cannot claim tasks.");
    }
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id");
    const pool = getPgPool();
    const task = await crmTasksRepo.getTaskByIdAndTenant(pool, id, tid);
    if (!task) return res.status(404).send("Not found");
    if (task.owner_id != null) return res.status(400).send("Task already assigned.");
    try {
      const ok = await crmTasksRepo.claimTaskWithAudit(pool, { tenantId: tid, taskId: id, userId: uid });
      if (!ok) return res.status(400).send("Could not claim");
    } catch (e) {
      return res.status(400).send(e.message || "Could not claim");
    }
    return res.redirect(safeCrmRedirect(req, `/admin/crm/tasks/${id}`));
  });

  router.post("/crm/tasks/:id/status", requireCrmAccess, async (req, res) => {
    if (!canMutateCrm(req.session.adminUser.role)) return res.status(403).type("text").send("Read-only access.");
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const id = Number(req.params.id);
    const status = normalizeCrmTaskStatus(req.body && req.body.status);
    const pool = getPgPool();
    const task = await crmTasksRepo.getTaskByIdAndTenant(pool, id, tid);
    if (!task) return res.status(404).send("Not found");
    if (task.owner_id == null || Number(task.owner_id) !== Number(uid)) {
      if (!isSuperAdmin(req.session.adminUser.role)) {
        return res.status(403).type("text").send("Only the task owner can change status.");
      }
    }
    const prev = task.status;
    try {
      const ok = await crmTasksRepo.updateTaskStatusWithAudit(pool, {
        tenantId: tid,
        taskId: id,
        userId: uid,
        status,
        prevStatus: prev,
      });
      if (!ok) return res.status(404).send("Not found");
    } catch (e) {
      return res.status(400).send(e.message || "Could not update");
    }
    return res.redirect(safeCrmRedirect(req, `/admin/crm/tasks/${id}`));
  });

  router.post("/crm/tasks/:id/move", requireCrmAccess, async (req, res) => {
    if (!canMutateCrm(req.session.adminUser.role)) {
      return res.status(403).json({ error: "Read-only access." });
    }
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const role = req.session.adminUser.role;
    const superU = isSuperAdmin(role);
    const id = Number(req.params.id);
    const newStatus = normalizeCrmTaskStatus(req.body && req.body.status);
    if (!id || id < 1) return res.status(400).json({ error: "Invalid id" });

    const pool = getPgPool();
    const task = await crmTasksRepo.getTaskByIdAndTenant(pool, id, tid);
    if (!task) return res.status(404).json({ error: "Not found" });

    const prev = normalizeCrmTaskStatus(task.status);
    if (prev === newStatus) return res.json({ ok: true });

    if (!superU) {
      if (!task.owner_id) {
        if (prev !== "new") return res.status(403).json({ error: "Forbidden" });
        if (newStatus === "new") return res.json({ ok: true });
        if (!canClaimCrmTasks(role)) return res.status(403).json({ error: "Cannot claim" });
      } else if (Number(task.owner_id) !== Number(uid)) {
        return res.status(403).json({ error: "Only the owner can move this task" });
      }
    }

    let nextOwnerId = task.owner_id;
    if (newStatus === "new") {
      if (superU) {
        nextOwnerId = null;
      } else if (task.owner_id) {
        return res.status(403).json({ error: "Cannot move to unassigned pool" });
      }
    } else if (!task.owner_id) {
      nextOwnerId = uid;
    }

    try {
      await crmTasksRepo.moveKanbanWithAudit(pool, {
        tenantId: tid,
        taskId: id,
        userId: uid,
        newStatus,
        prevStatus: prev,
        task,
        nextOwnerId,
      });
    } catch (e) {
      return res.status(400).json({ error: e.message || "Could not move" });
    }
    return res.json({ ok: true });
  });

  router.post("/crm/tasks/:id/reassign", requireCrmAccess, async (req, res) => {
    if (!isSuperAdmin(req.session.adminUser.role)) {
      return res.status(403).type("text").send("Only super admin can reassign.");
    }
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id");
    const raw = req.body && req.body.owner_id;
    const newOwnerId =
      raw === "" || raw === undefined || raw === null ? null : Number(raw);
    if (newOwnerId != null && (!newOwnerId || newOwnerId < 1)) {
      return res.status(400).send("Invalid user.");
    }

    const pool = getPgPool();
    const task = await crmTasksRepo.getTaskByIdAndTenant(pool, id, tid);
    if (!task) return res.status(404).send("Not found");

    if (newOwnerId != null) {
      if (!(await crmTasksRepo.userIsInTenant(pool, null, newOwnerId, tid))) {
        return res.status(400).send("User not in this tenant.");
      }
    }

    const prevOwner = task.owner_id;
    let nextStatus = normalizeCrmTaskStatus(task.status);
    if (newOwnerId == null) {
      nextStatus = "new";
    } else if (nextStatus === "new") {
      nextStatus = "in_progress";
    }

    try {
      const ok = await crmTasksRepo.reassignTaskWithAudit(pool, {
        tenantId: tid,
        taskId: id,
        userId: uid,
        newOwnerId,
        nextStatus,
        prevOwner,
      });
      if (!ok) return res.status(404).send("Not found");
    } catch (e) {
      return res.status(400).send(e.message || "Could not reassign");
    }
    return res.redirect(safeCrmRedirect(req, `/admin/crm/tasks/${id}`));
  });

  router.post("/crm/tasks/:id/comments", requireCrmAccess, async (req, res) => {
    if (!canMutateCrm(req.session.adminUser.role)) {
      return res.status(403).type("text").send("Read-only access.");
    }
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const id = Number(req.params.id);
    const body = String((req.body && req.body.body) || "").trim().slice(0, 4000);
    if (!id || id < 1) return res.status(400).send("Invalid id");
    if (!body) return res.status(400).send("Comment is required.");

    const pool = getPgPool();
    const task = await crmTasksRepo.getTaskByIdAndTenant(pool, id, tid);
    if (!task) return res.status(404).send("Not found");

    try {
      await crmTasksRepo.insertCommentWithAudit(pool, {
        tenantId: tid,
        taskId: id,
        userId: uid,
        body,
      });
    } catch (e) {
      return res.status(400).send(e.message || "Could not save comment");
    }
    return res.redirect(safeCrmRedirect(req, `/admin/crm/tasks/${id}`));
  });
};
