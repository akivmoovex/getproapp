"use strict";

const crypto = require("crypto");
const { communityBenefitsEnabled } = require("./flags");
const pages = require("./pages");
const service = require("./communityBenefitsService");

function staffRole(actor) {
  return Boolean(actor && (actor.role === "reception" || actor.role === "clinic_admin"));
}

function canReadPass(actor, personId) {
  if (staffRole(actor)) return true;
  return Boolean(actor && actor.personId && actor.personId === personId);
}

function minorUnits(value) {
  const text = String(value == null ? "" : value).trim();
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isInteger(parsed) ? parsed : null;
}

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
    const actor = actorFrom(req, allowTestActor);
    if (!canReadPass(actor, personId)) {
      res.status(401).type("text/plain").send("Sign in required");
      return;
    }
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
    const personId = String((req.body && req.body.person_id) || "");
    if (!actor) {
      res.status(401).type("text/plain").send("Sign in required");
      return;
    }
    if (!canReadPass(actor, personId)) {
      res.status(403).type("text/plain").send("This pass belongs to another person");
      return;
    }
    if (!csrfOk(req)) {
      res.status(403).type("text/plain").send("CSRF rejected");
      return;
    }
    const issued = service.issuePass(store, { personId });
    if (!issued.ok) {
      res.status(404).type("html").send(pages.passPage({ csrf: csrf(), personId, message: "No membership is available for a pass." }));
      return;
    }
    const member = store.memberships.get(`${service.PROGRAM_ID}:${personId}`);
    res.type("html").send(pages.passPage({
      csrf: csrf(),
      personId,
      status: member ? member.status : "none",
      token: issued.token,
      fallbackCode: issued.fallbackCode,
    }));
  });

  app.post("/app/community/pass/rotate", gate, (req, res) => {
    const actor = actorFrom(req, allowTestActor);
    const personId = String((req.body && req.body.person_id) || "");
    if (!actor) {
      res.status(401).type("text/plain").send("Sign in required");
      return;
    }
    if (!canReadPass(actor, personId)) {
      res.status(403).type("text/plain").send("This pass belongs to another person");
      return;
    }
    if (!csrfOk(req)) {
      res.status(403).type("text/plain").send("CSRF rejected");
      return;
    }
    const rotated = service.rotatePass(store, { personId });
    if (!rotated.ok) {
      res.status(404).type("text/plain").send("Pass not rotated");
      return;
    }
    const member = store.memberships.get(`${service.PROGRAM_ID}:${personId}`);
    res.type("html").send(pages.passPage({
      csrf: csrf(),
      personId,
      status: member ? member.status : "none",
      token: rotated.token,
      fallbackCode: rotated.fallbackCode,
    }));
  });

  app.get("/app/reception/community-check-in", gate, (req, res) => {
    const actor = actorFrom(req, allowTestActor);
    if (!staffRole(actor)) {
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
    if (!actor || !staffRole(actor)) {
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
    if (req.body.action === "search") {
      const found = service.searchLocalPatients(store, {
        clinicId,
        actorClinicId: actor.clinicId,
        facilityId: actor.facilityId,
        staffRole: actor.role,
        actorId: actor.staffId,
        name: req.body.patient_name,
        phone: req.body.patient_phone,
      });
      const text = !found.ok
        ? "Enter a name of at least 2 characters or a phone of at least 4 digits."
        : found.outcome === "none"
          ? "No local patient matches this clinic."
          : found.outcome === "ambiguous"
            ? "More than one local patient matches. Confirm the chart explicitly."
            : "One local patient matches. Confirm the chart before linking.";
      res.type("html").send(pages.checkInPage({
        csrf: csrf(),
        clinicId,
        clinicName: actor.clinicName,
        clinics: deps.clinics || [],
        error: !found.ok || found.outcome !== "one",
        message: text,
        candidates: found.ok ? found.candidates : [],
        disclosure: "No community discount is applied.",
      }));
      return;
    }
    if (req.body.action === "settlement") {
      const batch = await service.planSettlementBatch(store, {
        batchKey: `clinic:${clinicId}`,
        clinicId,
        actorClinicId: actor.clinicId,
        staffRole: actor.role,
        actorId: actor.staffId,
      });
      const refused = service.commitSettlement(store);
      res.type("html").send(pages.checkInPage({
        csrf: csrf(),
        clinicId,
        clinicName: actor.clinicName,
        clinics: deps.clinics || [],
        settlement: batch.ok ? `${batch.batch.status} ${batch.batch.contributionMinor} ngwee` : batch.code,
        disclosure: refused.posted ? "Settlement posted." : "No settlement is posted.",
        message: "Settlement remains pending approval.",
      }));
      return;
    }
    const presented = service.presentPass(store, { token: req.body.pass_code, clinicId, actorId: actor.staffId });
    const byFallback = presented.ok ? presented : service.presentPass(store, { fallbackCode: req.body.pass_code, clinicId, actorId: actor.staffId });
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
    const agreement = service.selectAgreementForClinic(store, clinicId);
    const amountMinor = minorUnits(req.body.amount_minor);
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
    let disclosure = "No community discount is applied.";
    let amountError = amountMinor == null;
    if (amountMinor != null) {
      const preview = service.previewInvoice(store, {
        personId: result.presentation.personId,
        clinicId,
        agreementId: agreement && agreement.id,
        serviceCode: req.body.service_code || "consultation",
        amountMinor,
      });
      if (!preview.ok) amountError = true;
      else disclosure = preview.disclosure;
    }
    const identity = `${result.presentation.displayName} is ${result.presentation.membershipStatus}.${linkMessage}`;
    res.type("html").send(pages.checkInPage({
      csrf: csrf(),
      clinicId,
      clinicName: actor.clinicName,
      clinics: deps.clinics || [],
      decision: decision.decision,
      reason: decision.reason,
      disclosure,
      error: amountError,
      message: amountError ? `Enter the quoted amount in whole ngwee. ${identity}` : identity,
    }));
  });
}

module.exports = {
  registerCommunityBenefitsRoutes,
};
