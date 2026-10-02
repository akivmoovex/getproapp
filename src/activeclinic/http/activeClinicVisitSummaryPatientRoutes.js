"use strict";

/**
 * AC-P05 patient portal visit summary route registration helpers.
 * Called from activeClinicPatientPortalRoutes with shared portal helpers.
 */

const {
  getReleasedSummaryForPatient,
  listReleasedSummariesForPatient,
  findReleaseLinkedToBooking,
  RESULT,
} = require("../services/activeClinicVisitSummaryReleaseService");

const STITCH = Object.freeze({
  desktop: "cd4b21d6860843c6b6862f92326857af",
  mobile: "5df55128997f4b9b916852f26b972bb5",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @param {import('express').Express} app
 * @param {object} ctx
 */
function registerVisitSummaryPatientRoutes(app, ctx) {
  const {
    getPool,
    env,
    isProduction,
    loadPatientAuth,
    requirePatientAuth,
    resolveClinicContext,
    issuePageCsrf,
    renderPatientView,
    patientViewPayload,
  } = ctx;

  app.get(
    "/clinics/:clinicKey/patient/visit-summaries",
    loadPatientAuth,
    requirePatientAuth,
    async (req, res, next) => {
      try {
        const auth = req.activeClinicPatientAuth;
        const clinicCtx = await resolveClinicContext(req.params.clinicKey);
        const csrfToken = issuePageCsrf(res, env, isProduction);

        if (!auth.patient || !auth.patient.id || !auth.organization || !auth.organization.id) {
          return res.status(200).type("html").send(
            renderPatientView(
              "patient/visit-summaries",
              patientViewPayload(
                clinicCtx || { clinicKey: req.params.clinicKey, clinic: null },
                csrfToken,
                {
                  patientAuth: auth,
                  activeNav: "visit-summaries",
                  visitSummaries: [],
                  stitch: STITCH,
                  pdfDeferred: true,
                  error: "Link a patient record to view visit summaries.",
                }
              )
            )
          );
        }

        const listed = await listReleasedSummariesForPatient(getPool(), {
          organizationId: auth.organization.id,
          patientId: auth.patient.id,
        });

        return res.status(200).type("html").send(
          renderPatientView(
            "patient/visit-summaries",
            patientViewPayload(
              clinicCtx || { clinicKey: req.params.clinicKey, clinic: null },
              csrfToken,
              {
                patientAuth: auth,
                activeNav: "visit-summaries",
                visitSummaries: listed.ok ? listed.releases : [],
                stitch: STITCH,
                pdfDeferred: true,
              }
            )
          )
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/clinics/:clinicKey/patient/visit-summaries/:summaryId",
    loadPatientAuth,
    requirePatientAuth,
    async (req, res, next) => {
      try {
        const auth = req.activeClinicPatientAuth;
        const clinicCtx = await resolveClinicContext(req.params.clinicKey);
        const csrfToken = issuePageCsrf(res, env, isProduction);
        const summaryId = String(req.params.summaryId || "");

        if (
          !auth.patient ||
          !auth.patient.id ||
          !auth.organization ||
          !auth.organization.id ||
          !UUID_RE.test(summaryId)
        ) {
          return res.status(404).type("html").send(
            renderPatientView(
              "patient/not-found",
              patientViewPayload(
                clinicCtx || { clinicKey: req.params.clinicKey, clinic: null },
                csrfToken,
                {
                  patientAuth: auth,
                  activeNav: "visit-summaries",
                  notFoundKind: "visit-summary",
                }
              )
            )
          );
        }

        const loaded = await getReleasedSummaryForPatient(getPool(), {
          organizationId: auth.organization.id,
          patientId: auth.patient.id,
          summaryId,
        });

        if (!loaded.ok) {
          return res.status(404).type("html").send(
            renderPatientView(
              "patient/not-found",
              patientViewPayload(
                clinicCtx || { clinicKey: req.params.clinicKey, clinic: null },
                csrfToken,
                {
                  patientAuth: auth,
                  activeNav: "visit-summaries",
                  notFoundKind: "visit-summary",
                }
              )
            )
          );
        }

        return res.status(200).type("html").send(
          renderPatientView(
            "patient/visit-summary",
            patientViewPayload(
              clinicCtx || { clinicKey: req.params.clinicKey, clinic: null },
              csrfToken,
              {
                patientAuth: auth,
                activeNav: "visit-summaries",
                visitSummary: loaded.release,
                snapshot: loaded.release.snapshot || {},
                stitch: STITCH,
                pdfDeferred: true,
              }
            )
          )
        );
      } catch (err) {
        return next(err);
      }
    }
  );
}

module.exports = {
  registerVisitSummaryPatientRoutes,
  findReleaseLinkedToBooking,
  STITCH,
  RESULT,
};
