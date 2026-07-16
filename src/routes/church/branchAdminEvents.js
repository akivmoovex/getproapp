"use strict";

const { getPgPool } = require("../../db/pg");
const eventsRepo = require("../../db/pg/church/eventsRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");
const {
  EVENT_VISIBILITIES,
  eventStatusLabel,
  visibilityLabel,
  validateEventBody,
} = require("../../church/announcementsEventsValidation");
const {
  branchAdminLocals,
  flashFromQuery,
  EVENT_NOTICES,
  noticeMessage,
  recordBranchAudit,
} = require("./branchAdminShared");

const EVENT_FILTERS = ["all", "draft", "published", "cancelled"];

function formFromEvent(item) {
  if (!item) {
    return {
      title: "",
      description: "",
      event_date: "",
      start_time: "",
      end_time: "",
      location: "",
      ministry_or_department: "",
      visibility: "members",
    };
  }
  const eventDate =
    item.event_date instanceof Date
      ? item.event_date.toISOString().slice(0, 10)
      : String(item.event_date || "").slice(0, 10);
  return {
    title: item.title,
    description: item.description,
    event_date: eventDate,
    start_time: item.start_time || item.event_time || "",
    end_time: item.end_time || "",
    location: item.location || item.location_text || "",
    ministry_or_department: item.ministry_or_department || "",
    visibility: item.visibility || "members",
  };
}

function renderFormLocals(req, extra) {
  return branchAdminLocals(req, {
    visibilities: EVENT_VISIBILITIES,
    visibilityLabel,
    eventStatusLabel,
    ...(extra || {}),
  });
}

function formatEventTimeRange(ev) {
  const start = ev.start_time || ev.event_time || "";
  const end = ev.end_time || "";
  if (start && end) return `${start} – ${end}`;
  return start || end || "—";
}

module.exports = function registerBranchAdminEventsRoutes(router) {
  router.get("/branch/events", requireChurchBranchHost, requireChurchBranchAdminSession, async (req, res, next) => {
    try {
      const branch = req.churchContext.branch;
      const pool = getPgPool();
      const filter = String(req.query.status || "all").trim();
      const statusFilter = EVENT_FILTERS.includes(filter) ? filter : "all";
      const events = await eventsRepo.listEventsForBranch(pool, branch.id, { status: statusFilter });
      return res.render(
        "church/branch-admin/events_management",
        renderFormLocals(req, {
          events,
          statusFilter,
          eventFilters: EVENT_FILTERS,
          formatEventTimeRange,
          notice: noticeMessage(flashFromQuery(req, EVENT_NOTICES)),
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get("/branch/events/new", requireChurchBranchHost, requireChurchBranchAdminSession, (req, res) => {
    return res.render(
      "church/branch-admin/event_form",
      renderFormLocals(req, {
        form: formFromEvent(null),
        error: null,
        isEdit: false,
        eventId: null,
      })
    );
  });

  router.post("/branch/events", requireChurchBranchHost, requireChurchBranchAdminSession, requireChurchSessionCsrf, async (req, res, next) => {
    try {
      const validation = validateEventBody(req.body || {});
      const intent = String(req.body._intent || "draft").trim();
      const publishNow = intent === "publish";
      const org = req.churchContext.organization;
      const branch = req.churchContext.branch;
      const pool = getPgPool();
      const adminId = req.churchBranchAdmin.admin_id;

      if (!validation.ok) {
        return res.status(400).render(
          "church/branch-admin/event_form",
          renderFormLocals(req, {
            form: validation.form,
            error: validation.error,
            isEdit: false,
            eventId: null,
          })
        );
      }

      const created = await eventsRepo.createEventForBranch(pool, {
        organization_id: org.id,
        branch_id: branch.id,
        ...validation.data,
        status: publishNow ? "published" : "draft",
        created_by_admin_id: adminId,
      });

      await recordBranchAudit(pool, req, {
        action: "event_created",
        entityType: "event",
        entityId: created.id,
        metadata: { status: created.status, title: created.title },
      });

      if (publishNow) {
        await recordBranchAudit(pool, req, {
          action: "event_published",
          entityType: "event",
          entityId: created.id,
          metadata: { status: "published", title: created.title },
        });
      }

      const notice = publishNow ? "event_published" : "event_created";
      return res.redirect(303, `/branch/events/${created.id}?notice=${notice}`);
    } catch (e) {
      return next(e);
    }
  });

  router.get(
    "/branch/events/:eventId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const eventId = Number(req.params.eventId);
        if (!Number.isFinite(eventId) || eventId <= 0) {
          return res.status(404).type("text").send("Event not found.");
        }
        const pool = getPgPool();
        const item = await eventsRepo.findEventByIdForBranch(pool, eventId, req.churchContext.branch.id);
        if (!item) {
          return res.status(404).type("text").send("Event not found.");
        }
        const { getOrganisationPlan } = require("../../services/church/churchEntitlementService");
        const growthAdvancedEventsService = require("../../services/church/growthAdvancedEventsService");
        const plan = await getOrganisationPlan(pool, req.churchContext.organization.id);
        const ops = await growthAdvancedEventsService.loadEventOps(
          pool,
          {
            organization_id: req.churchContext.organization.id,
            branch_id: req.churchContext.branch.id,
            admin_id: req.churchBranchAdmin.admin_id,
          },
          plan,
          eventId
        );
        return res.render(
          "church/branch-admin/event_detail",
          renderFormLocals(req, {
            eventItem: item,
            formatEventTimeRange,
            notice: noticeMessage(flashFromQuery(req, EVENT_NOTICES)),
            error: null,
            registrations: ops.registrations,
            checkIns: ops.checkIns,
            volunteerNeeds: ops.volunteerNeeds,
            followUps: ops.followUps,
            forms: ops.forms,
            growthAdvanced: ops.growth,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/branch/events/:eventId/edit",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const eventId = Number(req.params.eventId);
        if (!Number.isFinite(eventId) || eventId <= 0) {
          return res.status(404).type("text").send("Event not found.");
        }
        const pool = getPgPool();
        const item = await eventsRepo.findEventByIdForBranch(pool, eventId, req.churchContext.branch.id);
        if (!item) {
          return res.status(404).type("text").send("Event not found.");
        }
        if (item.status === "cancelled") {
          return res.redirect(303, `/branch/events/${eventId}`);
        }
        return res.render(
          "church/branch-admin/event_form",
          renderFormLocals(req, {
            form: formFromEvent(item),
            error: null,
            isEdit: true,
            eventId: item.id,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/events/:eventId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession, requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const eventId = Number(req.params.eventId);
        if (!Number.isFinite(eventId) || eventId <= 0) {
          return res.status(404).type("text").send("Event not found.");
        }
        const validation = validateEventBody(req.body || {});
        const intent = String(req.body._intent || "draft").trim();
        const publishNow = intent === "publish";
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const adminId = req.churchBranchAdmin.admin_id;

        const existing = await eventsRepo.findEventByIdForBranch(pool, eventId, branch.id);
        if (!existing) {
          return res.status(404).type("text").send("Event not found.");
        }
        if (existing.status === "cancelled") {
          return res.redirect(303, `/branch/events/${eventId}`);
        }

        if (!validation.ok) {
          return res.status(400).render(
            "church/branch-admin/event_form",
            renderFormLocals(req, {
              form: validation.form,
              error: validation.error,
              isEdit: true,
              eventId,
            })
          );
        }

        const updated = await eventsRepo.updateEventForBranch(pool, eventId, branch.id, {
          ...validation.data,
          updated_by_admin_id: adminId,
        });

        await recordBranchAudit(pool, req, {
          action: "event_updated",
          entityType: "event",
          entityId: eventId,
          metadata: { status: updated.status, title: updated.title },
        });

        if (publishNow) {
          const published = await eventsRepo.publishEventForBranch(pool, eventId, branch.id, adminId);
          if (published) {
            await recordBranchAudit(pool, req, {
              action: "event_published",
              entityType: "event",
              entityId: eventId,
              metadata: { status: "published", title: published.title },
            });
          }
          return res.redirect(303, `/branch/events/${eventId}?notice=event_published`);
        }

        return res.redirect(303, `/branch/events/${eventId}?notice=event_updated`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/events/:eventId/publish",
    requireChurchBranchHost,
    requireChurchBranchAdminSession, requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const eventId = Number(req.params.eventId);
        if (!Number.isFinite(eventId) || eventId <= 0) {
          return res.status(404).type("text").send("Event not found.");
        }
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const adminId = req.churchBranchAdmin.admin_id;
        const existing = await eventsRepo.findEventByIdForBranch(pool, eventId, branch.id);
        if (!existing) {
          return res.status(404).type("text").send("Event not found.");
        }
        if (existing.status === "cancelled") {
          return res.redirect(303, `/branch/events/${eventId}`);
        }

        const published = await eventsRepo.publishEventForBranch(pool, eventId, branch.id, adminId);
        if (!published) {
          return res.status(400).render(
            "church/branch-admin/event_detail",
            renderFormLocals(req, {
              eventItem: existing,
              formatEventTimeRange,
              error: "Event could not be published.",
              notice: null,
            })
          );
        }

        await recordBranchAudit(pool, req, {
          action: "event_published",
          entityType: "event",
          entityId: eventId,
          metadata: { status: "published", title: published.title },
        });

        return res.redirect(303, `/branch/events/${eventId}?notice=event_published`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/events/:eventId/cancel",
    requireChurchBranchHost,
    requireChurchBranchAdminSession, requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const eventId = Number(req.params.eventId);
        if (!Number.isFinite(eventId) || eventId <= 0) {
          return res.status(404).type("text").send("Event not found.");
        }
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const adminId = req.churchBranchAdmin.admin_id;
        const existing = await eventsRepo.findEventByIdForBranch(pool, eventId, branch.id);
        if (!existing) {
          return res.status(404).type("text").send("Event not found.");
        }

        const cancelled = await eventsRepo.cancelEventForBranch(pool, eventId, branch.id, adminId);
        if (!cancelled) {
          return res.status(400).render(
            "church/branch-admin/event_detail",
            renderFormLocals(req, {
              eventItem: existing,
              formatEventTimeRange,
              error: "Event could not be cancelled.",
              notice: null,
            })
          );
        }

        await recordBranchAudit(pool, req, {
          action: "event_cancelled",
          entityType: "event",
          entityId: eventId,
          metadata: { status: "cancelled", title: cancelled.title },
        });

        return res.redirect(303, `/branch/events?notice=event_cancelled`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/events/:eventId/registration-settings",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const eventId = Number(req.params.eventId);
        const {
          validateFoundationEventSettings,
          validateGrowthEventSettings,
        } = require("../../church/growthAdvancedEventsValidation");
        const growthAdvancedEventsService = require("../../services/church/growthAdvancedEventsService");
        const { getOrganisationPlan } = require("../../services/church/churchEntitlementService");
        const pool = getPgPool();
        const plan = await getOrganisationPlan(pool, req.churchContext.organization.id);
        const ctx = {
          organization_id: req.churchContext.organization.id,
          branch_id: req.churchContext.branch.id,
          admin_id: req.churchBranchAdmin.admin_id,
        };
        if (growthAdvancedEventsService.isGrowth(plan)) {
          const validated = validateGrowthEventSettings(req.body);
          if (!validated.ok) return res.status(400).type("text").send(validated.error);
          await growthAdvancedEventsService.configureGrowthEvent(
            pool,
            ctx,
            plan,
            eventId,
            validated.data
          );
        } else {
          const validated = validateFoundationEventSettings(req.body);
          if (!validated.ok) return res.status(400).type("text").send(validated.error);
          await growthAdvancedEventsService.enableFoundationRegistration(
            pool,
            ctx,
            eventId,
            validated.data
          );
        }
        return res.redirect(303, `/branch/events/${eventId}?notice=event_updated`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/events/:eventId/registrations",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const eventId = Number(req.params.eventId);
        const growthAdvancedEventsService = require("../../services/church/growthAdvancedEventsService");
        const { validateRegistrationBody } = require("../../church/growthAdvancedEventsValidation");
        const { getOrganisationPlan } = require("../../services/church/churchEntitlementService");
        const pool = getPgPool();
        const plan = await getOrganisationPlan(pool, req.churchContext.organization.id);
        const validated = validateRegistrationBody(req.body);
        const memberId = Number(req.body && req.body.member_id);
        await growthAdvancedEventsService.registerForEvent(
          pool,
          {
            organization_id: req.churchContext.organization.id,
            branch_id: req.churchContext.branch.id,
            admin_id: req.churchBranchAdmin.admin_id,
            member_id: Number.isFinite(memberId) && memberId > 0 ? memberId : null,
          },
          plan,
          eventId,
          validated.data
        );
        return res.redirect(303, `/branch/events/${eventId}?notice=event_updated`);
      } catch (e) {
        if (e.code === "FULL" || e.code === "DUPLICATE" || e.code === "WINDOW_CLOSED") {
          return res.status(409).type("text").send(e.message);
        }
        return next(e);
      }
    }
  );

  router.post(
    "/branch/events/:eventId/registrations/:registrationId/check-in",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const growthAdvancedEventsService = require("../../services/church/growthAdvancedEventsService");
        await growthAdvancedEventsService.checkInRegistration(
          getPgPool(),
          {
            organization_id: req.churchContext.organization.id,
            branch_id: req.churchContext.branch.id,
            admin_id: req.churchBranchAdmin.admin_id,
          },
          Number(req.params.eventId),
          Number(req.params.registrationId)
        );
        return res.redirect(303, `/branch/events/${req.params.eventId}?notice=event_updated`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/events/:eventId/registrations/:registrationId/cancel",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const growthAdvancedEventsService = require("../../services/church/growthAdvancedEventsService");
        const { getOrganisationPlan } = require("../../services/church/churchEntitlementService");
        const pool = getPgPool();
        const plan = await getOrganisationPlan(pool, req.churchContext.organization.id);
        await growthAdvancedEventsService.cancelRegistration(
          pool,
          {
            organization_id: req.churchContext.organization.id,
            branch_id: req.churchContext.branch.id,
            admin_id: req.churchBranchAdmin.admin_id,
          },
          plan,
          Number(req.params.registrationId),
          String((req.body && req.body.cancellation_reason) || ""),
          "admin"
        );
        return res.redirect(303, `/branch/events/${req.params.eventId}?notice=event_updated`);
      } catch (e) {
        return next(e);
      }
    }
  );
};
