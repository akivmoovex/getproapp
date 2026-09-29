"use strict";

const surveysRepo = require("../../db/pg/church/surveysRepo");
const prayerRequestsRepo = require("../../db/pg/church/prayerRequestsRepo");
const pastoralCareRepo = require("../../db/pg/church/pastoralCareRepo");
const appointmentsRepo = require("../../db/pg/church/appointmentsRepo");
const { getEntitlement } = require("./churchEntitlementService");

const SURVEY_ERRORS = Object.freeze({
  PACKAGE_REQUIRED: "PACKAGE_REQUIRED",
  FOUNDATION_RESTRICTED: "FOUNDATION_RESTRICTED",
  NOT_FOUND: "NOT_FOUND",
  CONSENT_REQUIRED: "CONSENT_REQUIRED",
  INVALID_TRANSITION: "INVALID_TRANSITION",
  PERMISSION_DENIED: "PERMISSION_DENIED",
});

function makeError(code, message) {
  return Object.assign(new Error(message), { code });
}

function assertCustomSurveys(plan) {
  if (getEntitlement(plan, "surveys.custom") !== true) {
    throw makeError(
      SURVEY_ERRORS.PACKAGE_REQUIRED,
      "Custom surveys require Growth. Foundation is limited to standard templates."
    );
  }
}

function isFoundationLimited(plan) {
  return getEntitlement(plan, "surveys.custom") === "limited";
}

function canViewSensitiveResponses(admin, surveyOrSession) {
  const audience = surveyOrSession.authorised_audience || "branch_admin";
  if (audience === "branch_admin") return true;
  if (audience === "pastoral") return Boolean(admin && admin.can_access_pastoral);
  if (audience === "supervisor") return Boolean(admin && admin.can_supervise_pastoral);
  return false;
}

function visibleQuestions(questions, answersByQuestionId) {
  return questions.filter((q) => {
    if (!q.branch_parent_question_id) return true;
    const parentAnswer = answersByQuestionId[q.branch_parent_question_id];
    if (!parentAnswer) return false;
    const expected = String(q.branch_equals_value || "").trim().toLowerCase();
    const actual = String(parentAnswer.answer_text || "").trim().toLowerCase();
    return expected === actual;
  });
}

async function createSurvey(pool, ctx, plan, data) {
  assertCustomSurveys(plan);
  if (isFoundationLimited(plan) && !data.is_template) {
    throw makeError(SURVEY_ERRORS.FOUNDATION_RESTRICTED, "Foundation may only use standard templates.");
  }
  return surveysRepo.insertSurvey(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    created_by_admin_id: ctx.admin_id,
    ...data,
  });
}

async function addQuestion(pool, ctx, plan, surveyId, data) {
  assertCustomSurveys(plan);
  const survey = await surveysRepo.findSurveyByIdForBranch(pool, surveyId, ctx.branch_id);
  if (!survey) throw makeError(SURVEY_ERRORS.NOT_FOUND, "Survey not found.");
  if (survey.is_template && isFoundationLimited(plan)) {
    throw makeError(SURVEY_ERRORS.FOUNDATION_RESTRICTED, "Cannot modify Foundation standard templates.");
  }
  return surveysRepo.insertQuestion(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    survey_id: surveyId,
    ...data,
  });
}

async function activateSurvey(pool, ctx, plan, surveyId) {
  assertCustomSurveys(plan);
  const survey = await surveysRepo.findSurveyByIdForBranch(pool, surveyId, ctx.branch_id);
  if (!survey) throw makeError(SURVEY_ERRORS.NOT_FOUND, "Survey not found.");
  if (!String(survey.consent_text || "").trim()) {
    throw makeError(SURVEY_ERRORS.CONSENT_REQUIRED, "Consent text is required before activation.");
  }
  return surveysRepo.updateSurvey(pool, surveyId, ctx.branch_id, { status: "active" });
}

async function processRecurringSurveys(pool, plan, at) {
  assertCustomSurveys(plan);
  const due = await surveysRepo.listDueRecurringSurveys(pool, at || new Date());
  const processed = [];
  for (const survey of due) {
    const interval = Number(survey.recurrence_interval_days || 0);
    if (!interval) continue;
    const next = new Date((at || new Date()).getTime() + interval * 24 * 60 * 60 * 1000);
    const updated = await surveysRepo.updateSurvey(pool, survey.id, survey.branch_id, {
      next_run_at: next,
      status: "active",
    });
    processed.push(updated);
  }
  return processed;
}

async function startOrResumeSession(pool, ctx, plan, surveyId, consentAccepted) {
  // Members on Growth take custom surveys; Foundation members may take active template surveys only.
  const survey = await surveysRepo.findSurveyByIdForBranch(pool, surveyId, ctx.branch_id);
  if (!survey || survey.status !== "active") {
    throw makeError(SURVEY_ERRORS.NOT_FOUND, "Survey not available.");
  }
  const custom = getEntitlement(plan, "surveys.custom");
  if (custom !== true && !survey.is_template) {
    throw makeError(
      SURVEY_ERRORS.FOUNDATION_RESTRICTED,
      "Foundation members may only complete standard template surveys."
    );
  }

  let session = await surveysRepo.findOpenSessionForMember(pool, surveyId, ctx.member_id);
  if (session) return session;

  if (String(survey.consent_text || "").trim() && !consentAccepted) {
    throw makeError(SURVEY_ERRORS.CONSENT_REQUIRED, "Consent is required to start this survey.");
  }

  return surveysRepo.insertSession(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    survey_id: surveyId,
    member_id: ctx.member_id,
    consent_accepted_at: consentAccepted ? new Date() : null,
  });
}

async function saveAnswer(pool, ctx, plan, sessionId, answerData) {
  const session = await surveysRepo.findSessionByIdForMember(pool, sessionId, ctx.member_id);
  if (!session || session.status !== "in_progress") {
    throw makeError(SURVEY_ERRORS.NOT_FOUND, "Survey session not found.");
  }
  const questions = await surveysRepo.listQuestionsForSurvey(pool, session.survey_id);
  const question = questions.find((q) => Number(q.id) === Number(answerData.question_id));
  if (!question) throw makeError(SURVEY_ERRORS.NOT_FOUND, "Question not found.");

  const answer = await surveysRepo.upsertAnswer(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    session_id: sessionId,
    question_id: answerData.question_id,
    answer_text: answerData.answer_text,
    answer_json: answerData.answer_json,
  });
  await surveysRepo.updateSession(pool, sessionId, { current_question_id: answerData.question_id });
  return answer;
}

async function routeOnSubmit(pool, ctx, survey, session, answers) {
  const route = survey.route_on_submit || "none";
  if (route === "none") return {};

  const summary = answers
    .map((a) => `${a.prompt}: ${a.answer_text}`)
    .join("\n")
    .slice(0, 2000);

  if (route === "prayer_request") {
    const prayer = await prayerRequestsRepo.createPrayerRequest(pool, {
      organization_id: ctx.organization_id,
      branch_id: ctx.branch_id,
      member_id: session.member_id,
      prayer_topic: `Survey: ${survey.title}`.slice(0, 200),
      details: summary,
      urgency: "normal",
      privacy_level: survey.sensitivity === "sensitive" ? "private_to_pastor" : "prayer_team",
    });
    return { linked_prayer_request_id: prayer.id };
  }

  if (route === "care_case") {
    const existing = await pastoralCareRepo.findOpenPastoralCaseForMember(
      pool,
      ctx.branch_id,
      session.member_id
    );
    if (existing) return { linked_pastoral_case_id: existing.id };
    const pastoralCase = await pastoralCareRepo.createPastoralCase(pool, {
      organization_id: ctx.organization_id,
      branch_id: ctx.branch_id,
      member_id: session.member_id,
      title: `Survey follow-up: ${survey.title}`.slice(0, 200),
      summary,
      next_action: "Review survey response and contact member.",
      opened_by_admin_id: null,
    });
    return { linked_pastoral_case_id: pastoralCase.id };
  }

  if (route === "appointment_request") {
    const settings = await appointmentsRepo.getSettingsWithDefaults(pool, ctx.branch_id);
    // Create a placeholder requested appointment for the first active minister with availability,
    // or skip if none — tests will supply a minister via routing helper when needed.
    const availability = await appointmentsRepo.listAvailabilityForBranch(pool, ctx.branch_id);
    const ministerId = availability[0] && availability[0].minister_admin_id;
    if (!ministerId) return {};
    const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    startsAt.setMinutes(0, 0, 0);
    const duration = Number(settings.default_duration_minutes || 30);
    const endsAt = new Date(startsAt.getTime() + duration * 60 * 1000);
    const appointment = await appointmentsRepo.insertAppointment(pool, {
      organization_id: ctx.organization_id,
      branch_id: ctx.branch_id,
      member_id: session.member_id,
      minister_admin_id: ministerId,
      starts_at: startsAt,
      ends_at: endsAt,
      duration_minutes: duration,
      buffer_minutes: Number(settings.buffer_minutes || 0),
      status: "requested",
      purpose: `Survey: ${survey.title}`.slice(0, 200),
      member_request_note: summary.slice(0, 500),
    });
    return { linked_appointment_id: appointment.id };
  }

  return {};
}

async function submitSession(pool, ctx, plan, sessionId) {
  const session = await surveysRepo.findSessionByIdForMember(pool, sessionId, ctx.member_id);
  if (!session || session.status !== "in_progress") {
    throw makeError(SURVEY_ERRORS.NOT_FOUND, "Survey session not found.");
  }
  const survey = await surveysRepo.findSurveyByIdForBranch(pool, session.survey_id, ctx.branch_id);
  if (!survey) throw makeError(SURVEY_ERRORS.NOT_FOUND, "Survey not found.");
  if (String(survey.consent_text || "").trim() && !session.consent_accepted_at) {
    throw makeError(SURVEY_ERRORS.CONSENT_REQUIRED, "Consent is required before submit.");
  }

  const answers = await surveysRepo.listAnswersForSession(pool, sessionId);
  const links = await routeOnSubmit(pool, ctx, survey, session, answers);
  const updated = await surveysRepo.updateSession(pool, sessionId, {
    status: "submitted",
    submitted_at: new Date(),
    ...links,
  });
  return { session: updated, links };
}

async function loadSessionForMember(pool, ctx, sessionId) {
  const session = await surveysRepo.findSessionByIdForMember(pool, sessionId, ctx.member_id);
  if (!session) throw makeError(SURVEY_ERRORS.NOT_FOUND, "Survey session not found.");
  const questions = await surveysRepo.listQuestionsForSurvey(pool, session.survey_id);
  const answers = await surveysRepo.listAnswersForSession(pool, sessionId);
  const answersByQuestionId = {};
  for (const a of answers) answersByQuestionId[a.question_id] = a;
  return {
    session,
    questions: visibleQuestions(questions, answersByQuestionId),
    allQuestions: questions,
    answers,
  };
}

async function loadResponseForAdmin(pool, ctx, plan, sessionId) {
  assertCustomSurveys(plan);
  const session = await surveysRepo.findSessionByIdForBranch(pool, sessionId, ctx.branch_id);
  if (!session) throw makeError(SURVEY_ERRORS.NOT_FOUND, "Response not found.");
  if (session.sensitivity === "sensitive" && !canViewSensitiveResponses(ctx, session)) {
    throw makeError(
      SURVEY_ERRORS.PERMISSION_DENIED,
      `Sensitive responses are limited to ${session.authorised_audience} audience.`
    );
  }
  const answers = await surveysRepo.listAnswersForSession(pool, sessionId);
  return { session, answers };
}

async function loadDashboard(pool, ctx, plan) {
  assertCustomSurveys(plan);
  const surveys = await surveysRepo.listSurveysForBranch(pool, ctx.branch_id);
  return { surveys };
}

module.exports = {
  SURVEY_ERRORS,
  assertCustomSurveys,
  isFoundationLimited,
  canViewSensitiveResponses,
  visibleQuestions,
  createSurvey,
  addQuestion,
  activateSurvey,
  processRecurringSurveys,
  startOrResumeSession,
  saveAnswer,
  submitSession,
  loadSessionForMember,
  loadResponseForAdmin,
  loadDashboard,
};
