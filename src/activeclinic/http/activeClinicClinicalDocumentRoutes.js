"use strict";

/**
 * ActiveClinic ACN18 Clinical Documents HTTP routes.
 * Canonical: /app/clinical/patients/:patientId/documents*
 * Does NOT replace B2-06 consultation workspace. No public/patient routes.
 * Binary attachments deferred (no private clinical object storage).
 *
 * RBAC:
 *   view     → activeclinic.clinical_document.view
 *   create/edit draft → activeclinic.clinical_document.create
 *   finalize → activeclinic.clinical_document.finalize
 */

const {
  issueCsrfToken,
  setCsrfCookie,
  validateCsrf,
  CSRF_FIELD,
} = require("../../platform/http/v5Csrf");
const {
  createRequireActiveClinicAuth,
} = require("./loadActiveClinicAuth");
const {
  createRequireActiveClinicPermission,
  renderSimpleState,
} = require("./activeClinicPermissionMiddleware");
const {
  buildActiveClinicShellViewModel,
} = require("../services/buildActiveClinicShellViewModel");
const {
  renderActiveClinicAppPage,
} = require("./renderActiveClinicShell");
const {
  createClinicalDocument,
  updateClinicalDocumentDraft,
  finalizeClinicalDocument,
  getClinicalDocument,
  listClinicalDocuments,
  listEncountersForDocumentForm,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  STATUSES,
  STATUS_LABELS,
  PERM,
  RESULT,
} = require("../services/activeClinicClinicalDocumentService");
const {
  getPatientByOrgAndId,
} = require("../services/activeClinicPatientService");

const STITCH = Object.freeze({
  desktop: "9b5d55cc2e8445f5bf97ef98f00cf8d3",
  mobile: "ee65f85e2f484eb9b147dc06c97949ad",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorMessageForCode(code) {
  switch (code) {
    case RESULT.FINAL_IMMUTABLE:
      return "Final documents cannot be edited.";
    case RESULT.NOT_DRAFT:
      return "Only draft documents can be finalized.";
    case RESULT.PATIENT_NOT_FOUND:
      return "Patient was not found in this organization.";
    case RESULT.FACILITY_NOT_FOUND:
    case RESULT.FACILITY_MISMATCH:
      return "Facility was not found in this organization.";
    case RESULT.ENCOUNTER_NOT_FOUND:
    case RESULT.ENCOUNTER_MISMATCH:
      return "Encounter must belong to this patient and facility.";
    case RESULT.NOT_FOUND:
      return "Document was not found.";
    case RESULT.INVALID_TYPE:
      return "Choose a valid document type.";
    case RESULT.INVALID_INPUT:
      return "Check required fields and try again.";
    case RESULT.STAFF_REQUIRED:
      return "Staff context is required.";
    default:
      return "Unable to save clinical document.";
  }
}

function authOrgId(auth) {
  return auth && auth.organization && auth.organization.id;
}

function actorFromAuth(auth) {
  return {
    staffMemberId: auth && auth.staffMember && auth.staffMember.id,
    platformIdentityId: auth && auth.platformIdentity && auth.platformIdentity.id,
  };
}

function selectedFacilityId(auth) {
  return auth && auth.selectedFacility && auth.selectedFacility.id;
}

function parseDocBody(body) {
  const b = body || {};
  return {
    documentType: String(b.document_type || b.documentType || "").trim(),
    title: String(b.title || "").trim(),
    bodyText: String(b.body_text || b.bodyText || b.description || "").trim(),
    documentDate: String(b.document_date || b.documentDate || "").trim(),
    encounterId: String(b.encounter_id || b.encounterId || "").trim() || null,
    facilityId: String(b.facility_id || b.facilityId || "").trim() || null,
  };
}

function typeOptions() {
  return DOCUMENT_TYPES.map((value) => ({
    value,
    label: DOCUMENT_TYPE_LABELS[value] || value,
  }));
}

function statusOptions() {
  return STATUSES.map((value) => ({
    value,
    label: STATUS_LABELS[value] || value,
  }));
}

function hasPerm(auth, key) {
  const perms = (auth && auth.permissions) || [];
  return Array.isArray(perms) && perms.includes(key);
}

/**
 * @param {import('express').Express} app
 * @param {{ getPool: Function, env: NodeJS.ProcessEnv, isProduction: boolean }} deps
 */
function registerActiveClinicClinicalDocumentRoutes(app, deps) {
  const getPool = deps.getPool;
  const env = deps.env;
  const isProduction = deps.isProduction;
  const requireAuth = createRequireActiveClinicAuth({ env, isProduction });
  const requirePermission = createRequireActiveClinicPermission({
    getPool,
    env,
    isProduction,
  });

  function issuePageCsrf(res) {
    const token = issueCsrfToken(env);
    setCsrfCookie(res, token, { secure: isProduction, env });
    return token;
  }

  async function renderShell(req, res, options) {
    const csrfToken = issuePageCsrf(res);
    const shell = await buildActiveClinicShellViewModel(getPool(), {
      req,
      auth: req.activeClinicAuth,
      csrfToken,
      activeNav: options.activeNav || "clinical",
      pageHeader: options.pageHeader,
      breadcrumbs: options.breadcrumbs,
      flash: options.flash || null,
      pageData: Object.assign({}, options.pageData || {}, {
        csrfField: CSRF_FIELD,
      }),
    });
    if (shell.selectedFacility && req.activeClinicAuth) {
      req.activeClinicAuth.selectedFacility = shell.selectedFacility;
    }
    const html = renderActiveClinicAppPage(options.content, shell);
    return res.status(options.status || 200).type("html").send(html);
  }

  app.get(
    "/app/clinical/patients/:patientId/documents",
    requireAuth,
    requirePermission(PERM.VIEW),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const organizationId = authOrgId(auth);
        const patientId = String(req.params.patientId || "");
        if (!UUID_RE.test(patientId)) {
          return renderSimpleState(res, {
            status: 404,
            title: "Patient not found",
            message: "That patient could not be found.",
            linkHref: "/app/clinical",
            linkLabel: "Back to clinical",
          });
        }

        const listed = await listClinicalDocuments(getPool(), {
          organizationId,
          patientId,
          facilityId: req.query.facility || null,
          encounterId: req.query.encounter || null,
          documentType: req.query.type || null,
          status: req.query.status || null,
          q: req.query.q || null,
        });
        if (!listed.ok) {
          return renderSimpleState(res, {
            status: listed.code === RESULT.PATIENT_NOT_FOUND ? 404 : 400,
            title: "Documents unavailable",
            message: errorMessageForCode(listed.code),
            linkHref: "/app/clinical",
            linkLabel: "Back to clinical",
          });
        }

        const canCreate = hasPerm(auth, PERM.CREATE);
        const patient = listed.patient;
        const encounterHref = req.query.encounter
          ? `/app/clinical/encounter/${encodeURIComponent(String(req.query.encounter))}`
          : "/app/clinical";
        const listBase = `/app/clinical/patients/${encodeURIComponent(patientId)}/documents`;

        return await renderShell(req, res, {
          content: "app/clinical-documents-list-content.ejs",
          pageHeader: {
            title: "Clinical Documents",
            description: `Clinical records for ${patient.displayName || "patient"}.`,
            actions: canCreate
              ? [
                  {
                    label: "Add Document",
                    href: `${listBase}/new${
                      req.query.encounter
                        ? `?encounter=${encodeURIComponent(String(req.query.encounter))}`
                        : ""
                    }`,
                  },
                ]
              : [],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Clinical", href: "/app/clinical" },
            { label: "Documents" },
          ],
          pageData: {
            catalogue: {
              patient,
              documents: listed.documents,
              filters: {
                q: String(req.query.q || ""),
                type: String(req.query.type || ""),
                status: String(req.query.status || ""),
                encounter: String(req.query.encounter || ""),
                facility: String(req.query.facility || ""),
              },
              filterOptions: {
                types: typeOptions(),
                statuses: statusOptions(),
              },
              canCreate,
              canFinalize: hasPerm(auth, PERM.FINALIZE),
              binaryAttachmentsDeferred: true,
              backHref: encounterHref,
              stitch: STITCH,
            },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/clinical/patients/:patientId/documents/new",
    requireAuth,
    requirePermission(PERM.CREATE),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const organizationId = authOrgId(auth);
        const patientId = String(req.params.patientId || "");
        if (!UUID_RE.test(patientId)) {
          return renderSimpleState(res, {
            status: 404,
            title: "Patient not found",
            message: "That patient could not be found.",
            linkHref: "/app/clinical",
            linkLabel: "Back to clinical",
          });
        }
        const got = await getPatientByOrgAndId(getPool(), {
          organizationId,
          patientId,
        });
        if (!got.ok) {
          return renderSimpleState(res, {
            status: 404,
            title: "Patient not found",
            message: errorMessageForCode(RESULT.PATIENT_NOT_FOUND),
            linkHref: "/app/clinical",
            linkLabel: "Back to clinical",
          });
        }
        const facilityId = selectedFacilityId(auth);
        const encounters = await listEncountersForDocumentForm(getPool(), {
          organizationId,
          patientId,
          facilityId,
        });
        const prefillEncounter = String(req.query.encounter || "");
        const listBase = `/app/clinical/patients/${encodeURIComponent(patientId)}/documents`;

        return await renderShell(req, res, {
          content: "app/clinical-document-form-content.ejs",
          pageHeader: {
            title: "Add clinical document",
            description: "Create a draft clinical document for this patient.",
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Clinical", href: "/app/clinical" },
            { label: "Documents", href: listBase },
            { label: "New" },
          ],
          pageData: {
            catalogue: {
              mode: "create",
              patient: got.patient,
              document: {
                documentType: "clinical_note",
                title: "",
                bodyText: "",
                documentDate: "",
                encounterId: UUID_RE.test(prefillEncounter) ? prefillEncounter : "",
              },
              encounters: encounters.ok ? encounters.encounters : [],
              types: typeOptions(),
              facilityId,
              binaryAttachmentsDeferred: true,
              formAction: listBase,
              cancelHref: listBase,
              stitch: STITCH,
              error: null,
            },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/clinical/patients/:patientId/documents",
    requireAuth,
    requirePermission(PERM.CREATE),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        if (!validateCsrf(req, req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Invalid CSRF token");
        }
        const organizationId = authOrgId(auth);
        const patientId = String(req.params.patientId || "");
        const fields = parseDocBody(req.body);
        const facilityId = fields.facilityId || selectedFacilityId(auth);
        const intent = String(req.body.intent || "draft").trim();
        const listBase = `/app/clinical/patients/${encodeURIComponent(patientId)}/documents`;

        const created = await createClinicalDocument(getPool(), {
          organizationId,
          patientId,
          facilityId,
          encounterId: fields.encounterId,
          documentType: fields.documentType,
          title: fields.title,
          bodyText: fields.bodyText,
          documentDate: fields.documentDate,
          actor: actorFromAuth(auth),
        });

        if (!created.ok) {
          const got = await getPatientByOrgAndId(getPool(), {
            organizationId,
            patientId,
          });
          const encounters = await listEncountersForDocumentForm(getPool(), {
            organizationId,
            patientId,
            facilityId,
          });
          return await renderShell(req, res, {
            status: 400,
            content: "app/clinical-document-form-content.ejs",
            pageHeader: { title: "Add clinical document" },
            breadcrumbs: [
              { label: "Clinical", href: "/app/clinical" },
              { label: "Documents", href: listBase },
              { label: "New" },
            ],
            pageData: {
              catalogue: {
                mode: "create",
                patient: got.ok ? got.patient : null,
                document: fields,
                encounters: encounters.ok ? encounters.encounters : [],
                types: typeOptions(),
                facilityId,
                binaryAttachmentsDeferred: true,
                formAction: listBase,
                cancelHref: listBase,
                stitch: STITCH,
                error: errorMessageForCode(created.code),
              },
            },
          });
        }

        if (intent === "finalize" && hasPerm(auth, PERM.FINALIZE)) {
          await finalizeClinicalDocument(getPool(), {
            organizationId,
            documentId: created.document.id,
            patientId,
            actor: actorFromAuth(auth),
          });
        }

        return res.redirect(
          303,
          `${listBase}/${encodeURIComponent(created.document.id)}?ok=1`
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/clinical/patients/:patientId/documents/:documentId",
    requireAuth,
    requirePermission(PERM.VIEW),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const organizationId = authOrgId(auth);
        const patientId = String(req.params.patientId || "");
        const documentId = String(req.params.documentId || "");
        const listBase = `/app/clinical/patients/${encodeURIComponent(patientId)}/documents`;
        const loaded = await getClinicalDocument(getPool(), {
          organizationId,
          documentId,
          patientId,
        });
        if (!loaded.ok) {
          return renderSimpleState(res, {
            status: 404,
            title: "Document not found",
            message: errorMessageForCode(loaded.code),
            linkHref: listBase,
            linkLabel: "Back to documents",
          });
        }
        const canEdit = loaded.document.isDraft && hasPerm(auth, PERM.CREATE);
        const canFinalize =
          loaded.document.isDraft && hasPerm(auth, PERM.FINALIZE);
        return await renderShell(req, res, {
          content: "app/clinical-document-detail-content.ejs",
          pageHeader: {
            title: loaded.document.title,
            actions: canEdit
              ? [
                  {
                    label: "Edit Draft",
                    href: `${listBase}/${encodeURIComponent(documentId)}/edit`,
                  },
                ]
              : [],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Clinical", href: "/app/clinical" },
            { label: "Documents", href: listBase },
            { label: loaded.document.title },
          ],
          flash:
            req.query && req.query.ok === "1"
              ? { type: "success", message: "Document saved." }
              : null,
          pageData: {
            catalogue: {
              document: loaded.document,
              events: loaded.events,
              canEdit,
              canFinalize,
              binaryAttachmentsDeferred: true,
              finalizeAction: `${listBase}/${encodeURIComponent(documentId)}/finalize`,
              listHref: listBase,
              stitch: STITCH,
              flashOk: String(req.query.ok || "") === "1",
            },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/clinical/patients/:patientId/documents/:documentId/edit",
    requireAuth,
    requirePermission(PERM.CREATE),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const organizationId = authOrgId(auth);
        const patientId = String(req.params.patientId || "");
        const documentId = String(req.params.documentId || "");
        const listBase = `/app/clinical/patients/${encodeURIComponent(patientId)}/documents`;
        const loaded = await getClinicalDocument(getPool(), {
          organizationId,
          documentId,
          patientId,
        });
        if (!loaded.ok) {
          return renderSimpleState(res, {
            status: 404,
            title: "Document not found",
            message: errorMessageForCode(loaded.code),
            linkHref: listBase,
            linkLabel: "Back to documents",
          });
        }
        if (!loaded.document.isDraft) {
          return res.redirect(
            303,
            `${listBase}/${encodeURIComponent(documentId)}`
          );
        }
        const encounters = await listEncountersForDocumentForm(getPool(), {
          organizationId,
          patientId,
          facilityId: loaded.document.facilityId,
        });
        return await renderShell(req, res, {
          content: "app/clinical-document-form-content.ejs",
          pageHeader: { title: "Edit draft document" },
          breadcrumbs: [
            { label: "Clinical", href: "/app/clinical" },
            { label: "Documents", href: listBase },
            { label: "Edit" },
          ],
          pageData: {
            catalogue: {
              mode: "edit",
              patient: {
                id: loaded.document.patientId,
                patientNumber: loaded.document.patientNumber,
                displayName: loaded.document.patientDisplayName,
              },
              document: {
                documentType: loaded.document.documentType,
                title: loaded.document.title,
                bodyText: loaded.document.bodyText || "",
                documentDate: loaded.document.documentDate
                  ? String(loaded.document.documentDate).slice(0, 10)
                  : "",
                encounterId: loaded.document.encounterId || "",
              },
              encounters: encounters.ok ? encounters.encounters : [],
              types: typeOptions(),
              facilityId: loaded.document.facilityId,
              binaryAttachmentsDeferred: true,
              formAction: `${listBase}/${encodeURIComponent(documentId)}`,
              cancelHref: `${listBase}/${encodeURIComponent(documentId)}`,
              stitch: STITCH,
              error: null,
            },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/clinical/patients/:patientId/documents/:documentId",
    requireAuth,
    requirePermission(PERM.CREATE),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        if (!validateCsrf(req, req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Invalid CSRF token");
        }
        const organizationId = authOrgId(auth);
        const patientId = String(req.params.patientId || "");
        const documentId = String(req.params.documentId || "");
        const fields = parseDocBody(req.body);
        const intent = String(req.body.intent || "draft").trim();
        const listBase = `/app/clinical/patients/${encodeURIComponent(patientId)}/documents`;

        const updated = await updateClinicalDocumentDraft(getPool(), {
          organizationId,
          documentId,
          patientId,
          encounterId: fields.encounterId,
          documentType: fields.documentType,
          title: fields.title,
          bodyText: fields.bodyText,
          documentDate: fields.documentDate,
          actor: actorFromAuth(auth),
        });

        if (!updated.ok) {
          if (updated.code === RESULT.FINAL_IMMUTABLE) {
            return res.redirect(
              303,
              `${listBase}/${encodeURIComponent(documentId)}`
            );
          }
          const encounters = await listEncountersForDocumentForm(getPool(), {
            organizationId,
            patientId,
            facilityId: selectedFacilityId(auth),
          });
          return await renderShell(req, res, {
            status: 400,
            content: "app/clinical-document-form-content.ejs",
            pageHeader: { title: "Edit draft document" },
            breadcrumbs: [
              { label: "Clinical", href: "/app/clinical" },
              { label: "Documents", href: listBase },
              { label: "Edit" },
            ],
            pageData: {
              catalogue: {
                mode: "edit",
                patient: { id: patientId },
                document: fields,
                encounters: encounters.ok ? encounters.encounters : [],
                types: typeOptions(),
                facilityId: selectedFacilityId(auth),
                binaryAttachmentsDeferred: true,
                formAction: `${listBase}/${encodeURIComponent(documentId)}`,
                cancelHref: `${listBase}/${encodeURIComponent(documentId)}`,
                stitch: STITCH,
                error: errorMessageForCode(updated.code),
              },
            },
          });
        }

        if (intent === "finalize" && hasPerm(auth, PERM.FINALIZE)) {
          await finalizeClinicalDocument(getPool(), {
            organizationId,
            documentId,
            patientId,
            actor: actorFromAuth(auth),
          });
        }

        return res.redirect(
          303,
          `${listBase}/${encodeURIComponent(documentId)}?ok=1`
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/clinical/patients/:patientId/documents/:documentId/finalize",
    requireAuth,
    requirePermission(PERM.FINALIZE),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        if (!validateCsrf(req, req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Invalid CSRF token");
        }
        const organizationId = authOrgId(auth);
        const patientId = String(req.params.patientId || "");
        const documentId = String(req.params.documentId || "");
        await finalizeClinicalDocument(getPool(), {
          organizationId,
          documentId,
          patientId,
          actor: actorFromAuth(auth),
        });
        return res.redirect(
          303,
          `/app/clinical/patients/${encodeURIComponent(patientId)}/documents/${encodeURIComponent(
            documentId
          )}?ok=1`
        );
      } catch (err) {
        return next(err);
      }
    }
  );
}

module.exports = {
  registerActiveClinicClinicalDocumentRoutes,
  STITCH,
  PERM,
};
