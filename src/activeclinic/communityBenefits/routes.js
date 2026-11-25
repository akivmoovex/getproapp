"use strict";

const crypto = require("crypto");
const { communityBenefitsEnabled } = require("./flags");
const pages = require("./pages");
const service = require("./communityBenefitsService");

function actorFrom(req, allowTestActor) {
  if (req.communityActor) return req.communityActor;
  if (!allowTestActor) return null;
  const raw = req.get("x-community-test-actor");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function registerCommunityBenefitsRoutes(app, deps) {
  const env = (deps && deps.env) || process.env;
  const store = deps && deps.store;
  const allowTestActor = Boolean(deps && deps.allowTestActor);
  const tokens = new Map();

  function gate(req, res, next) {
    if (!communityBenefitsEnabled(env)) {
      res.status(404).type("text/plain").send("Not found");
      return;
    }
    if (!store) {
      res.status(503).type("text/plain").send("Community benefits storage is not available.");
      return;
    }
    next();
  }

  function csrf() {
    const token = crypto.randomBytes(16).toString("hex");
    tokens.set(token, Date.now());
    return token;
  }

  function csrfOk(req) {
    const token = String((req.body && req.body.csrf) || "");
    if (!token || !tokens.has(token)) return false;
    tokens.delete(token);
    return true;
  }

  app.get("/app/community/enroll", gate, (req, res) => {
    res.type("html").send(pages.enrollPage({ csrf: csrf() }));
  });

  app.post("/app/community/enroll", gate, (req, res) => {
    if (!csrfOk(req)) {
      res.status(403).type("html").send(pages.enrollPage({ csrf: csrf(), error: true, message: "The form expired. Start again." }));
      return;
    }
    const created = service.addPerson(store, { displayName: req.body && req.body.display_name });
    if (!created.ok) {
      res.status(400).type("html").send(pages.enrollPage({ csrf: csrf(), error: true, message: "Enter a name to request enrollment." }));
      return;
    }
    const enrolled = service.requestEnrollment(store, { personId: created.person.id });
    res.type("html").send(pages.enrollPage({
      csrf: csrf(),
      nextHref: `/app/community/pass?person=${encodeURIComponent(created.person.id)}`,
      message: enrolled.membership.status === "pending_consent"
        ? "Enrollment is pending consent and identity verification. Membership is not active."
        : "This person already has one membership.",
    }));
  });

  app.get("/app/community/pass", gate, (req, res) => {
    const personId = String(req.query.person || "");
    const member = store.memberships.get(`${service.PROGRAM_ID}:${personId}`);
    res.type("html").send(pages.passPage({
      csrf: csrf(),
      personId,
      status: member ? member.status : "none",
      message: "Pass issuance stays on the server.",
    }));
  });

  app.post("/app/community/pass", gate, (req, res) => {
    const actor = actorFrom(req, allowTestActor);
    if (!actor) {
      res.status(401).type("text/plain").send("Sign in required");
      return;
    }
    if (!csrfOk(req)) {
      res.status(403).type("text/plain").send("CSRF rejected");
      return;
    }
    const issued = service.issuePass(store, { personId: req.body.person_id });
    if (!issued.ok) {
      res.status(404).type("html").send(pages.passPage({ csrf: csrf(), personId: req.body.person_id, message: "No membership is available for a pass." }));
      return;
    }
    res.type("html").send(pages.passPage({
      csrf: csrf(),
      personId: req.body.person_id,
      status: "issued",
      token: issued.token,
      fallbackCode: issued.fallbackCode,
    }));
  });

  app.post("/app/community/pass/rotate", gate, (req, res) => {
    const actor = actorFrom(req, allowTestActor);
    if (!actor) {
      res.status(401).type("text/plain").send("Sign in required");
      return;
    }
    if (!csrfOk(req)) {
      res.status(403).type("text/plain").send("CSRF rejected");
      return;
    }
    const rotated = service.rotatePass(store, { personId: req.body.person_id });
    if (!rotated.ok) {
      res.status(404).type("text/plain").send("Pass not rotated");
      return;
    }
    res.type("html").send(pages.passPage({
      csrf: csrf(),
      personId: req.body.person_id,
      status: "rotated",
      token: rotated.token,
      fallbackCode: rotated.fallbackCode,
    }));
  });

  app.get("/app/reception/community-check-in", gate, (req, res) => {
    const actor = actorFrom(req, allowTestActor);
    if (!allowTestActor && !actor) {
      res.status(401).type("text/plain").send("Sign in required");
      return;
    }
    res.type("html").send(pages.checkInPage({
      csrf: csrf(),
      clinicId: actor && actor.clinicId,
      clinicName: (actor && actor.clinicName) || "Clinic",
      clinics: (deps && deps.clinics) || [],
    }));
  });

  app.post("/app/reception/community-check-in", gate, async (req, res) => {
    const actor = actorFrom(req, allowTestActor);
    if (!actor || (actor.role !== "reception" && actor.role !== "clinic_admin")) {
      res.status(401).type("text/plain").send("Sign in required");
      return;
    }
    if (actor.facilityId && req.body.facility_id && actor.facilityId !== req.body.facility_id) {
      res.status(403).type("text/plain").send("Wrong facility");
      return;
    }
    if (!csrfOk(req)) {
      res.status(403).type("html").send(pages.checkInPage({
        csrf: csrf(),
        clinicId: actor.clinicId,
        clinicName: actor.clinicName,
        clinics: deps.clinics || [],
        error: true,
        message: "The form expired. Start again.",
      }));
      return;
    }
    if (req.body.action === "cancel") {
      res.redirect(303, "/app/reception/community-check-in");
      return;
    }
    const clinicId = String(req.body.clinic_id || actor.clinicId || "");
    if (actor.clinicId && clinicId !== actor.clinicId) {
      res.status(403).type("html").send(pages.checkInPage({
        csrf: csrf(),
        clinicId: actor.clinicId,
        clinicName: actor.clinicName,
        clinics: deps.clinics || [],
        error: true,
        message: "This reception desk cannot open another clinic.",
      }));
      return;
    }
    const presented = service.presentPass(store, { token: req.body.pass_code, clinicId });
    const byFallback = presented.ok ? presented : service.presentPass(store, { fallbackCode: req.body.pass_code, clinicId });
    const result = presented.ok ? presented : byFallback;
    if (!result.ok) {
      res.status(400).type("html").send(pages.checkInPage({
        csrf: csrf(),
        clinicId,
        clinicName: actor.clinicName,
        clinics: deps.clinics || [],
        error: true,
        message: "That code is invalid, expired, or revoked.",
      }));
      return;
    }
    const agreement = (store.agreements || []).find((row) => row.clinicId === clinicId);
    const decision = service.decideEligibility(store, {
      personId: result.presentation.personId,
      clinicId,
      agreementId: agreement && agreement.id,
      serviceCode: req.body.service_code || "consultation",
    });
    let linkMessage = "";
    if (req.body.confirm_link === "yes") {
      const linked = await service.linkMember(store, {
        clinicId,
        actorClinicId: actor.clinicId,
        facilityId: actor.facilityId,
        personId: result.presentation.personId,
        patientId: req.body.patient_id,
        staffRole: actor.role,
        confirmed: true,
        actorId: actor.staffId,
      });
      linkMessage = linked.ok ? " Local chart linked." : ` Link not created (${linked.code}).`;
    }
    const preview = service.previewInvoice(store, {
      personId: result.presentation.personId,
      clinicId,
      agreementId: agreement && agreement.id,
      serviceCode: req.body.service_code || "consultation",
      amountMinor: Number(req.body.amount_minor || 0),
    });
    res.type("html").send(pages.checkInPage({
      csrf: csrf(),
      clinicId,
      clinicName: actor.clinicName,
      clinics: deps.clinics || [],
      decision: decision.decision,
      reason: decision.reason,
      disclosure: preview.ok ? preview.disclosure : "No community discount is applied.",
      message: `${result.presentation.displayName} is ${result.presentation.membershipStatus}.${linkMessage}`,
    }));
  });
}

module.exports = {
  registerCommunityBenefitsRoutes,
};
