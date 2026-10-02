"use strict";

const eventsRepo = require("../../db/pg/church/eventsRepo");
const eventRegistrationsRepo = require("../../db/pg/church/eventRegistrationsRepo");
const { getEntitlement, hasEntitlement } = require("./churchEntitlementService");

const EVENT_ERRORS = Object.freeze({
  PACKAGE_REQUIRED: "PACKAGE_REQUIRED",
  NOT_FOUND: "NOT_FOUND",
  FULL: "FULL",
  CLOSED: "CLOSED",
  DUPLICATE: "DUPLICATE",
  WINDOW_CLOSED: "WINDOW_CLOSED",
  CONSENT_REQUIRED: "CONSENT_REQUIRED",
  INVALID_TRANSITION: "INVALID_TRANSITION",
  COMPANIONS_NOT_ALLOWED: "COMPANIONS_NOT_ALLOWED",
});

function makeError(code, message) {
  return Object.assign(new Error(message), { code });
}

function assertAdvancedLogistics(plan) {
  if (!hasEntitlement(plan, "events.advanced_logistics")) {
    throw makeError(
      EVENT_ERRORS.PACKAGE_REQUIRED,
      "Advanced event logistics require Growth."
    );
  }
}

function isGrowth(plan) {
  return hasEntitlement(plan, "events.advanced_logistics");
}

function visibleQuestions(questions, answersByQuestionId) {
  return questions.filter((q) => {
    if (!q.branch_parent_question_id) return true;
    const parent = answersByQuestionId[q.branch_parent_question_id];
    if (!parent) return false;
    return (
      String(parent).trim().toLowerCase() ===
      String(q.branch_equals_value || "").trim().toLowerCase()
    );
  });
}

async function enableFoundationRegistration(pool, ctx, eventId, settings) {
  const event = await eventsRepo.findEventByIdForBranch(pool, eventId, ctx.branch_id);
  if (!event) throw makeError(EVENT_ERRORS.NOT_FOUND, "Event not found.");
  return eventRegistrationsRepo.updateEventAdvancedSettings(pool, eventId, ctx.branch_id, {
    capacity: settings.capacity,
    registration_enabled: settings.registration_enabled,
    check_in_enabled: settings.check_in_enabled,
  });
}

async function configureGrowthEvent(pool, ctx, plan, eventId, settings) {
  assertAdvancedLogistics(plan);
  const event = await eventsRepo.findEventByIdForBranch(pool, eventId, ctx.branch_id);
  if (!event) throw makeError(EVENT_ERRORS.NOT_FOUND, "Event not found.");
  if (settings.registration_form_id) {
    const form = await eventRegistrationsRepo.findFormByIdForBranch(
      pool,
      settings.registration_form_id,
      ctx.branch_id
    );
    if (!form) throw makeError(EVENT_ERRORS.NOT_FOUND, "Registration form not found.");
  }
  return eventRegistrationsRepo.updateEventAdvancedSettings(pool, eventId, ctx.branch_id, settings);
}

async function createRegistrationForm(pool, ctx, plan, data) {
  assertAdvancedLogistics(plan);
  return eventRegistrationsRepo.insertForm(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    created_by_admin_id: ctx.admin_id,
    ...data,
  });
}

async function addFormQuestion(pool, ctx, plan, formId, data) {
  assertAdvancedLogistics(plan);
  const form = await eventRegistrationsRepo.findFormByIdForBranch(pool, formId, ctx.branch_id);
  if (!form) throw makeError(EVENT_ERRORS.NOT_FOUND, "Form not found.");
  return eventRegistrationsRepo.insertQuestion(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    form_id: formId,
    ...data,
  });
}

function assertRegistrationWindow(event, growth) {
  if (!growth) return;
  const now = Date.now();
  if (event.registration_opens_at && new Date(event.registration_opens_at).getTime() > now) {
    throw makeError(EVENT_ERRORS.WINDOW_CLOSED, "Registration has not opened yet.");
  }
  if (event.registration_closes_at && new Date(event.registration_closes_at).getTime() < now) {
    throw makeError(EVENT_ERRORS.WINDOW_CLOSED, "Registration window has closed.");
  }
}

async function registerForEvent(pool, ctx, plan, eventId, data) {
  const event = await eventsRepo.findEventByIdForBranch(pool, eventId, ctx.branch_id);
  if (!event || event.status !== "published") {
    throw makeError(EVENT_ERRORS.NOT_FOUND, "Event not available.");
  }
  if (!event.registration_enabled) {
    throw makeError(EVENT_ERRORS.CLOSED, "Registration is not enabled for this event.");
  }

  const growth = isGrowth(plan);
  assertRegistrationWindow(event, growth);

  if (ctx.member_id) {
    const existing = await eventRegistrationsRepo.findOpenRegistrationForMember(
      pool,
      eventId,
      ctx.member_id
    );
    if (existing) throw makeError(EVENT_ERRORS.DUPLICATE, "Already registered for this event.");
  }

  const companions = growth && event.allow_companions ? data.companions || [] : [];
  if (companions.length && (!growth || !event.allow_companions)) {
    throw makeError(EVENT_ERRORS.COMPANIONS_NOT_ALLOWED, "Companions require Growth family registration.");
  }
  if (growth && event.allow_companions && companions.length > Number(event.max_companions || 0)) {
    throw makeError(EVENT_ERRORS.COMPANIONS_NOT_ALLOWED, "Too many companions for this event.");
  }

  const partySize = 1 + companions.length;
  const activeCount = await eventRegistrationsRepo.countActiveRegistrations(pool, eventId);
  const atCapacity =
    event.capacity != null && activeCount + partySize > Number(event.capacity);

  let status = "registered";
  if (growth && event.requires_approval) status = "pending";
  if (atCapacity) {
    if (growth) status = "waitlisted";
    else throw makeError(EVENT_ERRORS.FULL, "Event is at capacity.");
  }

  let form = null;
  let questions = [];
  if (growth && event.registration_form_id) {
    form = await eventRegistrationsRepo.findFormByIdForBranch(
      pool,
      event.registration_form_id,
      ctx.branch_id
    );
    if (form && String(form.consent_text || "").trim() && !data.consent_accepted) {
      throw makeError(EVENT_ERRORS.CONSENT_REQUIRED, "Consent is required.");
    }
    questions = await eventRegistrationsRepo.listQuestionsForForm(pool, form.id);
  }

  const registration = await eventRegistrationsRepo.insertRegistration(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    event_id: eventId,
    member_id: ctx.member_id || null,
    visitor_name: data.visitor_name || "",
    visitor_email: data.visitor_email || "",
    visitor_phone: data.visitor_phone || "",
    status,
    party_size: partySize,
    consent_accepted_at: data.consent_accepted ? new Date() : null,
  });

  for (const companion of companions) {
    await eventRegistrationsRepo.insertCompanion(pool, {
      organization_id: ctx.organization_id,
      branch_id: ctx.branch_id,
      registration_id: registration.id,
      ...companion,
    });
  }

  if (questions.length && data.answers) {
    const answersById = data.answers;
    const visible = visibleQuestions(questions, answersById);
    for (const q of visible) {
      const answer = answersById[q.id] || answersById[String(q.id)] || "";
      if (q.is_required && !String(answer).trim()) continue;
      await eventRegistrationsRepo.insertAnswer(pool, {
        organization_id: ctx.organization_id,
        branch_id: ctx.branch_id,
        registration_id: registration.id,
        question_id: q.id,
        answer_text: String(answer || ""),
      });
    }
  }

  return registration;
}

async function approveRegistration(pool, ctx, plan, registrationId) {
  assertAdvancedLogistics(plan);
  const reg = await eventRegistrationsRepo.findRegistrationByIdForBranch(
    pool,
    registrationId,
    ctx.branch_id
  );
  if (!reg || !["pending", "waitlisted"].includes(reg.status)) {
    throw makeError(EVENT_ERRORS.INVALID_TRANSITION, "Registration cannot be approved.");
  }
  return eventRegistrationsRepo.updateRegistration(pool, registrationId, {
    status: "approved",
    approved_at: new Date(),
    approved_by_admin_id: ctx.admin_id,
  });
}

async function cancelRegistration(pool, ctx, plan, registrationId, reason, actor) {
  const reg = await eventRegistrationsRepo.findRegistrationByIdForBranch(
    pool,
    registrationId,
    ctx.branch_id
  );
  if (!reg) throw makeError(EVENT_ERRORS.NOT_FOUND, "Registration not found.");
  if (actor === "member" && Number(reg.member_id) !== Number(ctx.member_id)) {
    throw makeError(EVENT_ERRORS.NOT_FOUND, "Registration not found.");
  }
  if (["cancelled", "no_show"].includes(reg.status)) {
    throw makeError(EVENT_ERRORS.INVALID_TRANSITION, "Already cancelled.");
  }
  // Foundation may cancel own registration; Growth also covers waitlisted/pending.
  return eventRegistrationsRepo.updateRegistration(pool, registrationId, {
    status: "cancelled",
    cancelled_at: new Date(),
    cancelled_by_type: actor === "member" ? "member" : "admin",
    cancelled_by_id: actor === "member" ? ctx.member_id : ctx.admin_id,
    cancellation_reason: reason || "",
  });
}

async function checkInRegistration(pool, ctx, eventId, registrationId) {
  const event = await eventsRepo.findEventByIdForBranch(pool, eventId, ctx.branch_id);
  if (!event || !event.check_in_enabled) {
    throw makeError(EVENT_ERRORS.CLOSED, "Check-in is not enabled for this event.");
  }
  const reg = await eventRegistrationsRepo.findRegistrationByIdForBranch(
    pool,
    registrationId,
    ctx.branch_id
  );
  if (!reg || Number(reg.event_id) !== Number(eventId)) {
    throw makeError(EVENT_ERRORS.NOT_FOUND, "Registration not found.");
  }
  if (!["registered", "approved", "pending"].includes(reg.status)) {
    throw makeError(EVENT_ERRORS.INVALID_TRANSITION, "Cannot check in this registration.");
  }
  await eventRegistrationsRepo.updateRegistration(pool, registrationId, {
    status: "checked_in",
    checked_in_at: new Date(),
  });
  return eventRegistrationsRepo.insertCheckIn(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    event_id: eventId,
    registration_id: registrationId,
    member_id: reg.member_id,
    visitor_name: reg.visitor_name || "",
    method: "registration",
    checked_in_by_admin_id: ctx.admin_id,
  });
}

async function markNoShow(pool, ctx, plan, registrationId) {
  assertAdvancedLogistics(plan);
  const reg = await eventRegistrationsRepo.findRegistrationByIdForBranch(
    pool,
    registrationId,
    ctx.branch_id
  );
  if (!reg || !["registered", "approved", "pending"].includes(reg.status)) {
    throw makeError(EVENT_ERRORS.INVALID_TRANSITION, "Cannot mark no-show.");
  }
  return eventRegistrationsRepo.updateRegistration(pool, registrationId, {
    status: "no_show",
    no_show_marked_at: new Date(),
    no_show_marked_by_admin_id: ctx.admin_id,
  });
}

async function addVolunteerNeed(pool, ctx, plan, eventId, fields) {
  assertAdvancedLogistics(plan);
  const event = await eventsRepo.findEventByIdForBranch(pool, eventId, ctx.branch_id);
  if (!event) throw makeError(EVENT_ERRORS.NOT_FOUND, "Event not found.");
  return eventRegistrationsRepo.insertVolunteerNeed(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    event_id: eventId,
    ...fields,
  });
}

async function submitFeedback(pool, ctx, plan, eventId, fields) {
  assertAdvancedLogistics(plan);
  const event = await eventsRepo.findEventByIdForBranch(pool, eventId, ctx.branch_id);
  if (!event || !event.feedback_enabled) {
    throw makeError(EVENT_ERRORS.CLOSED, "Feedback is not enabled.");
  }
  return eventRegistrationsRepo.insertFeedback(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    event_id: eventId,
    member_id: ctx.member_id || null,
    ...fields,
  });
}

async function createVisitorFollowUp(pool, ctx, plan, eventId, fields) {
  assertAdvancedLogistics(plan);
  const event = await eventsRepo.findEventByIdForBranch(pool, eventId, ctx.branch_id);
  if (!event) throw makeError(EVENT_ERRORS.NOT_FOUND, "Event not found.");
  return eventRegistrationsRepo.insertVisitorFollowUp(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    event_id: eventId,
    ...fields,
  });
}

async function loadEventOps(pool, ctx, plan, eventId) {
  const event = await eventsRepo.findEventByIdForBranch(pool, eventId, ctx.branch_id);
  if (!event) throw makeError(EVENT_ERRORS.NOT_FOUND, "Event not found.");
  const registrations = await eventRegistrationsRepo.listRegistrationsForEvent(pool, eventId);
  const checkIns = await eventRegistrationsRepo.listCheckInsForEvent(pool, eventId);
  const growth = isGrowth(plan);
  const volunteerNeeds = growth
    ? await eventRegistrationsRepo.listVolunteerNeedsForEvent(pool, eventId)
    : [];
  const followUps = growth
    ? await eventRegistrationsRepo.listVisitorFollowUpsForEvent(pool, eventId)
    : [];
  const forms = growth ? await eventRegistrationsRepo.listFormsForBranch(pool, ctx.branch_id) : [];
  return { event, registrations, checkIns, volunteerNeeds, followUps, forms, growth };
}

async function loadLogisticsDashboard(pool, ctx, plan) {
  assertAdvancedLogistics(plan);
  const forms = await eventRegistrationsRepo.listFormsForBranch(pool, ctx.branch_id);
  const events = await eventsRepo.listEventsForBranch(pool, ctx.branch_id, { status: "published" });
  return { forms, events };
}

module.exports = {
  EVENT_ERRORS,
  assertAdvancedLogistics,
  isGrowth,
  visibleQuestions,
  enableFoundationRegistration,
  configureGrowthEvent,
  createRegistrationForm,
  addFormQuestion,
  registerForEvent,
  approveRegistration,
  cancelRegistration,
  checkInRegistration,
  markNoShow,
  addVolunteerNeed,
  submitFeedback,
  createVisitorFollowUp,
  loadEventOps,
  loadLogisticsDashboard,
  getEntitlement,
};
