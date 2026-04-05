/**
 * CRM tasks.
 */
const { isSuperAdmin } = require("../../auth");
const { canAccessCrm, canMutateCrm, canClaimCrmTasks } = require("../../auth/roles");
const { CRM_TASK_STATUSES, normalizeCrmTaskStatus, crmTaskStatusLabel } = require("../../crm/crmTaskStatuses");
const { insertCrmAudit } = require("../../crm/crmAudit");
const { adminUserIsInTenant } = require("../../auth/adminUserTenants");
const { getAdminTenantId, normalizeCrmAttachmentUrl, safeCrmRedirect } = require("./adminShared");

module.exports = function registerAdminCrmRoutes(router, deps) {
  const { db } = deps;
  function requireCrmAccess(req, res, next) {
    if (!req.session.adminUser) return res.redirect("/admin/login");
    if (!canAccessCrm(req.session.adminUser.role)) {
      return res.status(403).type("text").send("CRM is not available for your role.");
    }
    return next();
  }

  function getTenantUsersForCrm(dbConn, tenantId) {
    const tid = Number(tenantId);
    return dbConn
      .prepare(
        `SELECT DISTINCT u.id, u.username
         FROM admin_users u
         LEFT JOIN admin_user_tenant_roles m ON m.admin_user_id = u.id AND m.tenant_id = ?
         WHERE COALESCE(u.enabled, 1) = 1 AND (m.tenant_id IS NOT NULL OR u.tenant_id = ?)
         ORDER BY u.username COLLATE NOCASE ASC`
      )
      .all(tid, tid);
  }

  function loadCrmTaskDetailData(req, rawId) {
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const role = req.session.adminUser.role;
    const superU = isSuperAdmin(role);
    const id = Number(rawId);
    if (!id || id < 1) return null;
    const task = db
      .prepare(
        `
        SELECT t.*, o.username AS owner_username, c.username AS creator_username
        FROM crm_tasks t
        LEFT JOIN admin_users o ON o.id = t.owner_id
        LEFT JOIN admin_users c ON c.id = t.created_by_id
        WHERE t.id = ? AND t.tenant_id = ?
        `
      )
      .get(id, tid);
    if (!task) return null;
    const isOwner = task.owner_id != null && Number(task.owner_id) === Number(uid);
    const canEdit = canMutateCrm(role) && (isOwner || superU);
    const showClaim =
      canClaimCrmTasks(role) &&
      task.owner_id == null &&
      normalizeCrmTaskStatus(task.status) === "new";

    const comments = db
      .prepare(
        `
        SELECT c.*, u.username AS author_username
        FROM crm_task_comments c
        LEFT JOIN admin_users u ON u.id = c.user_id
        WHERE c.task_id = ? AND c.tenant_id = ?
        ORDER BY datetime(c.created_at) ASC, c.id ASC
        `
      )
      .all(id, tid);

    const tenantUsersForReassign = superU ? getTenantUsersForCrm(db, tid) : [];

    const auditLogs = db
      .prepare(
        `
        SELECT a.*, u.username AS actor_username
        FROM crm_audit_logs a
        LEFT JOIN admin_users u ON u.id = a.user_id
        WHERE a.task_id = ? AND a.tenant_id = ?
        ORDER BY datetime(a.created_at) DESC, a.id DESC
        `
      )
      .all(id, tid);

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

  router.get("/crm", requireCrmAccess, (req, res) => {
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const role = req.session.adminUser.role;
    const superU = isSuperAdmin(role);

    const rows = db
      .prepare(
        `
        SELECT t.*, u.username AS owner_username
        FROM crm_tasks t
        LEFT JOIN admin_users u ON u.id = t.owner_id
        WHERE t.tenant_id = ?
        ORDER BY datetime(t.updated_at) DESC
        `
      )
      .all(tid);

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

    let crmTenantUsers = getTenantUsersForCrm(db, tid);
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

  router.get("/crm/tasks/:id/panel", requireCrmAccess, (req, res) => {
    const data = loadCrmTaskDetailData(req, req.params.id);
    if (!data) return res.status(404).type("text").send("Not found");
    return res.render("admin/crm_task_panel", { ...data, overlayMode: true });
  });

  router.get("/crm/tasks/:id", requireCrmAccess, (req, res) => {
    const data = loadCrmTaskDetailData(req, req.params.id);
    if (!data) return res.status(404).send("Task not found");
    return res.render("admin/crm_task_detail", { ...data, overlayMode: false });
  });

  router.post("/crm/tasks", requireCrmAccess, (req, res) => {
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
    if (ownerId != null) {
      if (!adminUserIsInTenant(db, ownerId, tid)) return res.status(400).send("Invalid assignee.");
    }
    const status = ownerId != null ? "in_progress" : "new";

    let taskId;
    try {
      db.transaction(() => {
        const r = db
          .prepare(
            `
            INSERT INTO crm_tasks (tenant_id, title, description, status, owner_id, created_by_id, attachment_url, source_type, source_ref_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', NULL)
            `
          )
          .run(tid, title, description, status, ownerId, uid, attachment_url);
        taskId = Number(r.lastInsertRowid);
        insertCrmAudit(db, {
          tenantId: tid,
          taskId,
          userId: uid,
          actionType: "task_created",
          details: JSON.stringify({
            title,
            attachment_url: attachment_url || undefined,
            owner_id: ownerId,
            status,
          }),
        });
      })();
    } catch (e) {
      return res.status(400).send(e.message || "Could not create task");
    }
    return res.redirect("/admin/crm");
  });

  router.post("/crm/tasks/:id/fields", requireCrmAccess, (req, res) => {
    if (!canMutateCrm(req.session.adminUser.role)) return res.status(403).type("text").send("Read-only access.");
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id.");
    const task = db.prepare("SELECT * FROM crm_tasks WHERE id = ? AND tenant_id = ?").get(id, tid);
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
      db.transaction(() => {
        db.prepare(
          `UPDATE crm_tasks SET title = ?, description = ?, attachment_url = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`
        ).run(title, description, attachment_url, id, tid);
        insertCrmAudit(db, {
          tenantId: tid,
          taskId: id,
          userId: uid,
          actionType: "task_fields_updated",
          details: JSON.stringify({ title }),
        });
      })();
    } catch (e) {
      return res.status(400).send(e.message || "Could not save");
    }
    return res.redirect(safeCrmRedirect(req, `/admin/crm/tasks/${id}`));
  });

  router.post("/crm/tasks/:id/claim", requireCrmAccess, (req, res) => {
    if (!canClaimCrmTasks(req.session.adminUser.role)) {
      return res.status(403).type("text").send("You cannot claim tasks.");
    }
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id");
    const task = db.prepare("SELECT * FROM crm_tasks WHERE id = ? AND tenant_id = ?").get(id, tid);
    if (!task) return res.status(404).send("Not found");
    if (task.owner_id != null) return res.status(400).send("Task already assigned.");
    try {
      db.transaction(() => {
        db.prepare(
          `
          UPDATE crm_tasks SET owner_id = ?, status = 'in_progress', updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
          `
        ).run(uid, id, tid);
        insertCrmAudit(db, {
          tenantId: tid,
          taskId: id,
          userId: uid,
          actionType: "assignment",
          details: JSON.stringify({ owner_id: uid, action: "claim" }),
        });
      })();
    } catch (e) {
      return res.status(400).send(e.message || "Could not claim");
    }
    return res.redirect(safeCrmRedirect(req, `/admin/crm/tasks/${id}`));
  });

  router.post("/crm/tasks/:id/status", requireCrmAccess, (req, res) => {
    if (!canMutateCrm(req.session.adminUser.role)) return res.status(403).type("text").send("Read-only access.");
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const id = Number(req.params.id);
    const status = normalizeCrmTaskStatus(req.body && req.body.status);
    const task = db.prepare("SELECT * FROM crm_tasks WHERE id = ? AND tenant_id = ?").get(id, tid);
    if (!task) return res.status(404).send("Not found");
    if (task.owner_id == null || Number(task.owner_id) !== Number(uid)) {
      if (!isSuperAdmin(req.session.adminUser.role)) {
        return res.status(403).type("text").send("Only the task owner can change status.");
      }
    }
    const prev = task.status;
    try {
      db.transaction(() => {
        db.prepare(
          `UPDATE crm_tasks SET status = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`
        ).run(status, id, tid);
        insertCrmAudit(db, {
          tenantId: tid,
          taskId: id,
          userId: uid,
          actionType: "status_change",
          details: JSON.stringify({ from: prev, to: status }),
        });
      })();
    } catch (e) {
      return res.status(400).send(e.message || "Could not update");
    }
    return res.redirect(safeCrmRedirect(req, `/admin/crm/tasks/${id}`));
  });

  router.post("/crm/tasks/:id/move", requireCrmAccess, (req, res) => {
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

    const task = db.prepare("SELECT * FROM crm_tasks WHERE id = ? AND tenant_id = ?").get(id, tid);
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
      db.transaction(() => {
        db.prepare(
          `UPDATE crm_tasks SET status = ?, owner_id = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`
        ).run(newStatus, nextOwnerId, id, tid);
        insertCrmAudit(db, {
          tenantId: tid,
          taskId: id,
          userId: uid,
          actionType: "status_change",
          details: JSON.stringify({ from: prev, to: newStatus, via: "kanban" }),
        });
        if (!task.owner_id && nextOwnerId) {
          insertCrmAudit(db, {
            tenantId: tid,
            taskId: id,
            userId: uid,
            actionType: "assignment",
            details: JSON.stringify({ owner_id: nextOwnerId, action: "claim_kanban" }),
          });
        }
        if (task.owner_id && nextOwnerId == null) {
          insertCrmAudit(db, {
            tenantId: tid,
            taskId: id,
            userId: uid,
            actionType: "assignment",
            details: JSON.stringify({ from_owner_id: task.owner_id, action: "unassign_kanban" }),
          });
        }
      })();
    } catch (e) {
      return res.status(400).json({ error: e.message || "Could not move" });
    }
    return res.json({ ok: true });
  });

  router.post("/crm/tasks/:id/reassign", requireCrmAccess, (req, res) => {
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

    const task = db.prepare("SELECT * FROM crm_tasks WHERE id = ? AND tenant_id = ?").get(id, tid);
    if (!task) return res.status(404).send("Not found");

    if (newOwnerId != null) {
      if (!adminUserIsInTenant(db, newOwnerId, tid)) return res.status(400).send("User not in this tenant.");
    }

    const prevOwner = task.owner_id;
    let nextStatus = normalizeCrmTaskStatus(task.status);
    if (newOwnerId == null) {
      nextStatus = "new";
    } else if (nextStatus === "new") {
      nextStatus = "in_progress";
    }

    try {
      db.transaction(() => {
        db.prepare(
          `UPDATE crm_tasks SET owner_id = ?, status = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`
        ).run(newOwnerId, nextStatus, id, tid);
        insertCrmAudit(db, {
          tenantId: tid,
          taskId: id,
          userId: uid,
          actionType: "assignment",
          details: JSON.stringify({ from_owner_id: prevOwner, to_owner_id: newOwnerId }),
        });
      })();
    } catch (e) {
      return res.status(400).send(e.message || "Could not reassign");
    }
    return res.redirect(safeCrmRedirect(req, `/admin/crm/tasks/${id}`));
  });

  router.post("/crm/tasks/:id/comments", requireCrmAccess, (req, res) => {
    if (!canMutateCrm(req.session.adminUser.role)) {
      return res.status(403).type("text").send("Read-only access.");
    }
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const id = Number(req.params.id);
    const body = String((req.body && req.body.body) || "").trim().slice(0, 4000);
    if (!id || id < 1) return res.status(400).send("Invalid id");
    if (!body) return res.status(400).send("Comment is required.");

    const task = db.prepare("SELECT id FROM crm_tasks WHERE id = ? AND tenant_id = ?").get(id, tid);
    if (!task) return res.status(404).send("Not found");

    try {
      db.prepare(
        `INSERT INTO crm_task_comments (tenant_id, task_id, user_id, body) VALUES (?, ?, ?, ?)`
      ).run(tid, id, uid, body);
      insertCrmAudit(db, {
        tenantId: tid,
        taskId: id,
        userId: uid,
        actionType: "comment",
        details: JSON.stringify({ length: body.length }),
      });
    } catch (e) {
      return res.status(400).send(e.message || "Could not save comment");
    }
    return res.redirect(safeCrmRedirect(req, `/admin/crm/tasks/${id}`));
  });
};
