/**
 * CRM tasks.
 */
const { isSuperAdmin } = require("../../auth");
const {
  ROLES,
  normalizeRole,
  canAccessCrm,
  canMutateCrm,
  canClaimCrmTasks,
} = require("../../auth/roles");
const { CRM_TASK_STATUSES, normalizeCrmTaskStatus, crmTaskStatusLabel } = require("../../crm/crmTaskStatuses");
const { getAdminTenantId, normalizeCrmAttachmentUrl, safeCrmRedirect } = require("./adminShared");
const { getPgPool } = require("../../db/pg");
const crmTasksRepo = require("../../db/pg/crmTasksRepo");
const fieldAgentSubmissionsRepo = require("../../db/pg/fieldAgentSubmissionsRepo");

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
    if (normalizeRole(role) === ROLES.CSR) {
      const st = normalizeCrmTaskStatus(task.status);
      const unassigned = task.owner_id == null && st === "new";
      const isMine = task.owner_id != null && Number(task.owner_id) === Number(uid);
      if (!unassigned && !isMine) return null;
    }
    const isOwner = task.owner_id != null && Number(task.owner_id) === Number(uid);
    const canEdit = canMutateCrm(role) && (isOwner || superU);
    const showClaim =
      canClaimCrmTasks(role) &&
      task.owner_id == null &&
      normalizeCrmTaskStatus(task.status) === "new";

    const comments = await crmTasksRepo.listCommentsForTask(pool, id, tid);
    const tenantUsersForReassign = superU ? await crmTasksRepo.listTenantUsersForCrm(pool, tid) : [];
    const auditLogs = await crmTasksRepo.listAuditForTask(pool, id, tid);

    let fieldAgentProviderSubmission = null;
    if (String(task.source_type || "").trim() === "field_agent_provider" && task.source_ref_id != null) {
      const refId = Number(task.source_ref_id);
      if (Number.isFinite(refId) && refId > 0) {
        fieldAgentProviderSubmission = await fieldAgentSubmissionsRepo.getSubmissionByIdForAdmin(pool, tid, refId);
      }
    }

    return {
      activeNav: "crm",
      task,
      fieldAgentProviderSubmission,
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
    const csrBoard = normalizeRole(role) === ROLES.CSR;
    const rows = csrBoard
      ? await crmTasksRepo.listTasksForBoardCsrScope(pool, tid, uid)
      : await crmTasksRepo.listTasksForBoard(pool, tid);

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
      crmCsrScopedBoard: csrBoard,
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

  async function loadFieldAgentProviderContext(req, taskIdRaw) {
    const pool = getPgPool();
    const tid = getAdminTenantId(req);
    const taskId = Number(taskIdRaw);
    if (!taskId || taskId < 1) return { error: "Invalid task.", status: 400 };
    const task = await crmTasksRepo.getTaskByIdAndTenant(pool, taskId, tid);
    if (!task) return { error: "Not found.", status: 404 };
    if (String(task.source_type || "").trim() !== "field_agent_provider" || task.source_ref_id == null) {
      return { error: "This task is not linked to a field agent provider submission.", status: 400 };
    }
    const refId = Number(task.source_ref_id);
    if (!Number.isFinite(refId) || refId < 1) return { error: "Invalid submission reference.", status: 400 };
    const submission = await fieldAgentSubmissionsRepo.getSubmissionByIdForAdmin(pool, tid, refId);
    if (!submission) return { error: "Submission not found.", status: 404 };
    if (Number(submission.id) !== refId) return { error: "Submission reference mismatch.", status: 400 };
    return { pool, tid, taskId, task, submission };
  }

  router.post("/crm/tasks/:id/field-agent-submission/approve", requireCrmAccess, async (req, res) => {
    if (!canMutateCrm(req.session.adminUser.role)) return res.status(403).type("text").send("Read-only access.");
    const ctx = await loadFieldAgentProviderContext(req, req.params.id);
    if (ctx.error) return res.status(ctx.status).type("text").send(ctx.error);
    const rawCommission = (req.body && req.body.commission_amount) ?? "";
    let commission = 0;
    if (String(rawCommission).trim() !== "") {
      commission = Number(rawCommission);
      if (!Number.isFinite(commission) || commission < 0) {
        return res.status(400).type("text").send("Invalid commission amount.");
      }
    }
    const ok = await fieldAgentSubmissionsRepo.approveFieldAgentSubmission(ctx.pool, {
      tenantId: ctx.tid,
      submissionId: ctx.submission.id,
      commissionAmount: commission,
      auditContext: {
        adminUserId: req.session.adminUser.id,
        metadata: String(rawCommission).trim() !== "" ? { commission_amount: commission } : undefined,
      },
    });
    if (!ok) {
      return res.status(400).type("text").send("Could not approve — submission is not awaiting a decision.");
    }
    try {
      let note = `Field agent provider submission #${Number(ctx.submission.id)} approved.`;
      if (String(rawCommission).trim() !== "") {
        note += ` Commission on approve (informational): ${commission}.`;
      }
      await crmTasksRepo.insertCommentWithAudit(ctx.pool, {
        tenantId: ctx.tid,
        taskId: ctx.taskId,
        userId: req.session.adminUser.id,
        body: note.slice(0, 4000),
      });
    } catch {
      /* informational note only; moderation already succeeded */
    }
    return res.redirect(safeCrmRedirect(req, `/admin/crm/tasks/${ctx.taskId}`));
  });

  router.post("/crm/tasks/:id/field-agent-submission/reject", requireCrmAccess, async (req, res) => {
    if (!canMutateCrm(req.session.adminUser.role)) return res.status(403).type("text").send("Read-only access.");
    const ctx = await loadFieldAgentProviderContext(req, req.params.id);
    if (ctx.error) return res.status(ctx.status).type("text").send(ctx.error);
    const reason = String((req.body && req.body.rejection_reason) || "").trim();
    if (!reason) return res.status(400).type("text").send("Rejection reason is required.");
    const ok = await fieldAgentSubmissionsRepo.rejectFieldAgentSubmission(ctx.pool, {
      tenantId: ctx.tid,
      submissionId: ctx.submission.id,
      rejectionReason: reason,
      auditContext: { adminUserId: req.session.adminUser.id },
    });
    if (!ok) {
      return res.status(400).type("text").send("Could not reject — submission is not awaiting a decision.");
    }
    try {
      let note = `Field agent provider submission #${Number(ctx.submission.id)} rejected.`;
      const snippet = reason.slice(0, 200);
      if (snippet) {
        note += ` Reason (informational): ${snippet}`;
        if (reason.length > 200) note += "…";
      }
      await crmTasksRepo.insertCommentWithAudit(ctx.pool, {
        tenantId: ctx.tid,
        taskId: ctx.taskId,
        userId: req.session.adminUser.id,
        body: note.slice(0, 4000),
      });
    } catch {
      /* informational note only; moderation already succeeded */
    }
    return res.redirect(safeCrmRedirect(req, `/admin/crm/tasks/${ctx.taskId}`));
  });

  router.post("/crm/tasks/:id/field-agent-submission/info-needed", requireCrmAccess, async (req, res) => {
    if (!canMutateCrm(req.session.adminUser.role)) return res.status(403).type("text").send("Read-only access.");
    const ctx = await loadFieldAgentProviderContext(req, req.params.id);
    if (ctx.error) return res.status(ctx.status).type("text").send(ctx.error);
    const ok = await fieldAgentSubmissionsRepo.markFieldAgentSubmissionInfoNeeded(ctx.pool, {
      tenantId: ctx.tid,
      submissionId: ctx.submission.id,
      auditContext: { adminUserId: req.session.adminUser.id },
    });
    if (!ok) {
      return res.status(400).type("text").send("Could not mark info needed — use pending or appealed submissions.");
    }
    try {
      await crmTasksRepo.insertCommentWithAudit(ctx.pool, {
        tenantId: ctx.tid,
        taskId: ctx.taskId,
        userId: req.session.adminUser.id,
        body: `Field agent provider submission #${Number(ctx.submission.id)} marked as info needed.`.slice(0, 4000),
      });
    } catch {
      /* informational */
    }
    return res.redirect(safeCrmRedirect(req, `/admin/crm/tasks/${ctx.taskId}`));
  });

  router.post("/crm/tasks/:id/field-agent-submission/appeal", requireCrmAccess, async (req, res) => {
    if (!canMutateCrm(req.session.adminUser.role)) return res.status(403).type("text").send("Read-only access.");
    const ctx = await loadFieldAgentProviderContext(req, req.params.id);
    if (ctx.error) return res.status(ctx.status).type("text").send(ctx.error);
    const ok = await fieldAgentSubmissionsRepo.markFieldAgentSubmissionAppealed(ctx.pool, {
      tenantId: ctx.tid,
      submissionId: ctx.submission.id,
      auditContext: { adminUserId: req.session.adminUser.id },
    });
    if (!ok) {
      return res.status(400).type("text").send("Could not mark appealed — submission must be rejected.");
    }
    try {
      await crmTasksRepo.insertCommentWithAudit(ctx.pool, {
        tenantId: ctx.tid,
        taskId: ctx.taskId,
        userId: req.session.adminUser.id,
        body: `Field agent provider submission #${Number(ctx.submission.id)} marked as appealed (reopened for review).`.slice(
          0,
          4000
        ),
      });
    } catch {
      /* informational */
    }
    return res.redirect(safeCrmRedirect(req, `/admin/crm/tasks/${ctx.taskId}`));
  });

  router.post("/crm/tasks/:id/field-agent-submission/commission", requireCrmAccess, async (req, res) => {
    if (!canMutateCrm(req.session.adminUser.role)) return res.status(403).type("text").send("Read-only access.");
    const ctx = await loadFieldAgentProviderContext(req, req.params.id);
    if (ctx.error) return res.status(ctx.status).type("text").send(ctx.error);
    const amt = Number((req.body && req.body.commission_amount) ?? "");
    if (!Number.isFinite(amt) || amt < 0) {
      return res.status(400).type("text").send("Invalid commission amount.");
    }
    const ok = await fieldAgentSubmissionsRepo.updateFieldAgentSubmissionCommission(ctx.pool, {
      tenantId: ctx.tid,
      submissionId: ctx.submission.id,
      commissionAmount: amt,
    });
    if (!ok) {
      return res.status(400).type("text").send("Could not update commission — submission must be approved.");
    }
    return res.redirect(safeCrmRedirect(req, `/admin/crm/tasks/${ctx.taskId}`));
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
    if (normalizeRole(req.session.adminUser.role) === ROLES.CSR) {
      const st = normalizeCrmTaskStatus(task.status);
      const unassigned = task.owner_id == null && st === "new";
      const isMine = task.owner_id != null && Number(task.owner_id) === Number(uid);
      if (!unassigned && !isMine) return res.status(403).type("text").send("Forbidden.");
    }

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
