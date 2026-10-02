"use strict";

/**
 * ActiveClinic patient portal BACKEND_AND_UI routes: AC-P09…P13.
 */

const {
  getPatientCommunicationPreferences,
  updatePatientCommunicationPreferences,
} = require("../services/activeClinicPatientPortalPreferencesService");
const {
  listPatientPrescriptions,
  getPatientPrescription,
  listPatientReferrals,
  getPatientReferral,
  listPatientReleasedResults,
  getPatientReleasedResult,
  RESULT: CLINICAL_READ_RESULT,
} = require("../services/activeClinicPatientPortalClinicalReadService");
const {
  getPatientInvoice,
  RESULT: BILLING_RESULT,
} = require("../services/activeClinicPatientPortalBillingService");
const { validateCsrf, CSRF_FIELD } = require("../../platform/http/v5Csrf");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STITCH = Object.freeze({
  notifications: {
    desktop: "1938bff7a7d54fa5a7d856457864d84d",
    mobile: "1938bff7a7d54fa5a7d856457864d84d",
  },
  prescriptions: { desktop: "ac-p10", mobile: "ac-p10-m" },
  referrals: { desktop: "ac-p11", mobile: "ac-p11-m" },
  documents: { desktop: "ac-p12", mobile: "ac-p12-m" },
  invoiceDetail: {
    desktop: "9f422c33e30c450e9502126ba4012585",
    mobile: "3735516f4ecb4624ac715c6f77e7810b",
  },
});

function registerPatientPortalMissingFunctionalityRoutes(app, ctx) {
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

  function clinicPayload(clinicCtx, clinicKey, csrfToken, extra) {
    return patientViewPayload(
      clinicCtx || { clinicKey, clinic: null },
      csrfToken,
      extra
    );
  }

  function notFoundPage(res, clinicCtx, clinicKey, csrfToken, auth) {
    return res.status(404).type("html").send(
      renderPatientView(
        "patient/not-found",
        clinicPayload(clinicCtx, clinicKey, csrfToken, {
          patientAuth: auth,
          activeNav: null,
        })
      )
    );
  }

  // —— AC-P09 / AC-SEC-01 — communication prefs via existing platform store ——
  const CLINICAL_CONSENT_NOTE =
    "Clinical and treatment consent is recorded by clinic staff on your medical record. You cannot grant, withdraw, or change clinical consent in this portal. Contact the clinic for consent changes.";

  function notificationsLocals(auth, extras) {
    return {
      patientAuth: auth,
      activeNav: "notifications",
      stitch: STITCH.notifications,
      prefsMode: "existing_store",
      clinicalConsentNote: CLINICAL_CONSENT_NOTE,
      ...(extras || {}),
    };
  }

  app.get(
    "/clinics/:clinicKey/patient/notifications",
    loadPatientAuth,
    requirePatientAuth,
    async (req, res, next) => {
      try {
        const auth = req.activeClinicPatientAuth;
        const clinicCtx = await resolveClinicContext(req.params.clinicKey);
        const csrfToken = issuePageCsrf(res, env, isProduction);
        let preferences = null;
        let error = null;
        if (!auth.patient || !auth.patient.id) {
          error = "Link a patient record to manage communication preferences.";
        } else {
          const loaded = await getPatientCommunicationPreferences(getPool(), {
            organizationId: auth.organization.id,
            patientId: auth.patient.id,
          });
          preferences = loaded.ok ? loaded.preferences : null;
          if (!loaded.ok) error = "Unable to load preferences.";
        }
        // Never honor ?saved=1 as success — success only after real POST persist.
        return res.status(200).type("html").send(
          renderPatientView(
            "patient/notifications",
            clinicPayload(
              clinicCtx,
              req.params.clinicKey,
              csrfToken,
              notificationsLocals(auth, { preferences, error, success: null })
            )
          )
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/clinics/:clinicKey/patient/notifications",
    loadPatientAuth,
    requirePatientAuth,
    async (req, res, next) => {
      try {
        const auth = req.activeClinicPatientAuth;
        const clinicKey = req.params.clinicKey;
        const clinicCtx = await resolveClinicContext(clinicKey);
        const csrfToken = issuePageCsrf(res, env, isProduction);
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send(
            renderPatientView(
              "patient/notifications",
              clinicPayload(
                clinicCtx,
                clinicKey,
                csrfToken,
                notificationsLocals(auth, {
                  preferences: null,
                  error: "Invalid security token. Please try again.",
                })
              )
            )
          );
        }
        if (!auth.patient || !auth.patient.id) {
          return res.status(400).type("html").send(
            renderPatientView(
              "patient/notifications",
              clinicPayload(
                clinicCtx,
                clinicKey,
                csrfToken,
                notificationsLocals(auth, {
                  preferences: null,
                  error: "Link a patient record to manage communication preferences.",
                })
              )
            )
          );
        }
        const updated = await updatePatientCommunicationPreferences(getPool(), {
          organizationId: auth.organization.id,
          patientId: auth.patient.id,
          actorIdentityId: auth.platformIdentity && auth.platformIdentity.id,
          body: req.body || {},
        });
        if (!updated.ok) {
          return res.status(400).type("html").send(
            renderPatientView(
              "patient/notifications",
              clinicPayload(
                clinicCtx,
                clinicKey,
                csrfToken,
                notificationsLocals(auth, {
                  preferences: updated.preferences,
                  error: "Unable to save communication preferences.",
                })
              )
            )
          );
        }
        // Real persist only — success banner after authoritative write (no fake PRG query).
        return res.status(200).type("html").send(
          renderPatientView(
            "patient/notifications",
            clinicPayload(
              clinicCtx,
              clinicKey,
              csrfToken,
              notificationsLocals(auth, {
                preferences: updated.preferences,
                success: "Communication preferences saved.",
              })
            )
          )
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  // —— AC-P10 prescriptions ——
  app.get(
    "/clinics/:clinicKey/patient/prescriptions",
    loadPatientAuth,
    requirePatientAuth,
    async (req, res, next) => {
      try {
        const auth = req.activeClinicPatientAuth;
        const clinicCtx = await resolveClinicContext(req.params.clinicKey);
        const csrfToken = issuePageCsrf(res, env, isProduction);
        if (!auth.patient || !auth.patient.id) {
          return res.status(200).type("html").send(
            renderPatientView(
              "patient/prescriptions",
              clinicPayload(clinicCtx, req.params.clinicKey, csrfToken, {
                patientAuth: auth,
                activeNav: "prescriptions",
                prescriptions: [],
                stitch: STITCH.prescriptions,
                error: "Link a patient record to view prescriptions.",
              })
            )
          );
        }
        const listed = await listPatientPrescriptions(getPool(), {
          organizationId: auth.organization.id,
          patientId: auth.patient.id,
        });
        return res.status(200).type("html").send(
          renderPatientView(
            "patient/prescriptions",
            clinicPayload(clinicCtx, req.params.clinicKey, csrfToken, {
              patientAuth: auth,
              activeNav: "prescriptions",
              prescriptions: listed.ok ? listed.prescriptions : [],
              stitch: STITCH.prescriptions,
            })
          )
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/clinics/:clinicKey/patient/prescriptions/:prescriptionId",
    loadPatientAuth,
    requirePatientAuth,
    async (req, res, next) => {
      try {
        const auth = req.activeClinicPatientAuth;
        const clinicCtx = await resolveClinicContext(req.params.clinicKey);
        const csrfToken = issuePageCsrf(res, env, isProduction);
        const prescriptionId = String(req.params.prescriptionId || "");
        if (
          !auth.patient ||
          !auth.patient.id ||
          !UUID_RE.test(prescriptionId)
        ) {
          return notFoundPage(
            res,
            clinicCtx,
            req.params.clinicKey,
            csrfToken,
            auth
          );
        }
        const got = await getPatientPrescription(getPool(), {
          organizationId: auth.organization.id,
          patientId: auth.patient.id,
          prescriptionId,
        });
        if (!got.ok || got.code === CLINICAL_READ_RESULT.NOT_FOUND) {
          return notFoundPage(
            res,
            clinicCtx,
            req.params.clinicKey,
            csrfToken,
            auth
          );
        }
        return res.status(200).type("html").send(
          renderPatientView(
            "patient/prescription-detail",
            clinicPayload(clinicCtx, req.params.clinicKey, csrfToken, {
              patientAuth: auth,
              activeNav: "prescriptions",
              prescription: got.prescription,
              stitch: STITCH.prescriptions,
            })
          )
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  // —— AC-P11 referrals ——
  app.get(
    "/clinics/:clinicKey/patient/referrals",
    loadPatientAuth,
    requirePatientAuth,
    async (req, res, next) => {
      try {
        const auth = req.activeClinicPatientAuth;
        const clinicCtx = await resolveClinicContext(req.params.clinicKey);
        const csrfToken = issuePageCsrf(res, env, isProduction);
        if (!auth.patient || !auth.patient.id) {
          return res.status(200).type("html").send(
            renderPatientView(
              "patient/referrals",
              clinicPayload(clinicCtx, req.params.clinicKey, csrfToken, {
                patientAuth: auth,
                activeNav: "referrals",
                referrals: [],
                stitch: STITCH.referrals,
                error: "Link a patient record to view referrals.",
              })
            )
          );
        }
        const listed = await listPatientReferrals(getPool(), {
          organizationId: auth.organization.id,
          patientId: auth.patient.id,
        });
        return res.status(200).type("html").send(
          renderPatientView(
            "patient/referrals",
            clinicPayload(clinicCtx, req.params.clinicKey, csrfToken, {
              patientAuth: auth,
              activeNav: "referrals",
              referrals: listed.ok ? listed.referrals : [],
              stitch: STITCH.referrals,
            })
          )
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/clinics/:clinicKey/patient/referrals/:referralId",
    loadPatientAuth,
    requirePatientAuth,
    async (req, res, next) => {
      try {
        const auth = req.activeClinicPatientAuth;
        const clinicCtx = await resolveClinicContext(req.params.clinicKey);
        const csrfToken = issuePageCsrf(res, env, isProduction);
        const referralId = String(req.params.referralId || "");
        if (!auth.patient || !auth.patient.id || !UUID_RE.test(referralId)) {
          return notFoundPage(
            res,
            clinicCtx,
            req.params.clinicKey,
            csrfToken,
            auth
          );
        }
        const got = await getPatientReferral(getPool(), {
          organizationId: auth.organization.id,
          patientId: auth.patient.id,
          referralId,
        });
        if (!got.ok || got.code === CLINICAL_READ_RESULT.NOT_FOUND) {
          return notFoundPage(
            res,
            clinicCtx,
            req.params.clinicKey,
            csrfToken,
            auth
          );
        }
        return res.status(200).type("html").send(
          renderPatientView(
            "patient/referral-detail",
            clinicPayload(clinicCtx, req.params.clinicKey, csrfToken, {
              patientAuth: auth,
              activeNav: "referrals",
              referral: got.referral,
              stitch: STITCH.referrals,
            })
          )
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  // —— AC-P12 documents & results (released diagnostics only) ——
  app.get(
    "/clinics/:clinicKey/patient/documents",
    loadPatientAuth,
    requirePatientAuth,
    async (req, res, next) => {
      try {
        const auth = req.activeClinicPatientAuth;
        const clinicCtx = await resolveClinicContext(req.params.clinicKey);
        const csrfToken = issuePageCsrf(res, env, isProduction);
        if (!auth.patient || !auth.patient.id) {
          return res.status(200).type("html").send(
            renderPatientView(
              "patient/documents",
              clinicPayload(clinicCtx, req.params.clinicKey, csrfToken, {
                patientAuth: auth,
                activeNav: "documents",
                results: [],
                stitch: STITCH.documents,
                error: "Link a patient record to view results.",
              })
            )
          );
        }
        const listed = await listPatientReleasedResults(getPool(), {
          organizationId: auth.organization.id,
          patientId: auth.patient.id,
        });
        return res.status(200).type("html").send(
          renderPatientView(
            "patient/documents",
            clinicPayload(clinicCtx, req.params.clinicKey, csrfToken, {
              patientAuth: auth,
              activeNav: "documents",
              results: listed.ok ? listed.results : [],
              stitch: STITCH.documents,
            })
          )
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/clinics/:clinicKey/patient/documents/:modality/:resultId",
    loadPatientAuth,
    requirePatientAuth,
    async (req, res, next) => {
      try {
        const auth = req.activeClinicPatientAuth;
        const clinicCtx = await resolveClinicContext(req.params.clinicKey);
        const csrfToken = issuePageCsrf(res, env, isProduction);
        const resultId = String(req.params.resultId || "");
        const modality = String(req.params.modality || "").toLowerCase();
        if (
          !auth.patient ||
          !auth.patient.id ||
          !UUID_RE.test(resultId) ||
          (modality !== "laboratory" && modality !== "radiology")
        ) {
          return notFoundPage(
            res,
            clinicCtx,
            req.params.clinicKey,
            csrfToken,
            auth
          );
        }
        const got = await getPatientReleasedResult(getPool(), {
          organizationId: auth.organization.id,
          patientId: auth.patient.id,
          resultId,
          modality,
        });
        if (!got.ok || got.code === CLINICAL_READ_RESULT.NOT_FOUND) {
          return notFoundPage(
            res,
            clinicCtx,
            req.params.clinicKey,
            csrfToken,
            auth
          );
        }
        return res.status(200).type("html").send(
          renderPatientView(
            "patient/document-detail",
            clinicPayload(clinicCtx, req.params.clinicKey, csrfToken, {
              patientAuth: auth,
              activeNav: "documents",
              result: got.result,
              stitch: STITCH.documents,
            })
          )
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  // —— AC-P13 invoice detail ——
  app.get(
    "/clinics/:clinicKey/patient/invoices/:invoiceId",
    loadPatientAuth,
    requirePatientAuth,
    async (req, res, next) => {
      try {
        const auth = req.activeClinicPatientAuth;
        const clinicCtx = await resolveClinicContext(req.params.clinicKey);
        const csrfToken = issuePageCsrf(res, env, isProduction);
        const invoiceId = String(req.params.invoiceId || "");
        if (!auth.patient || !auth.patient.id || !UUID_RE.test(invoiceId)) {
          return notFoundPage(
            res,
            clinicCtx,
            req.params.clinicKey,
            csrfToken,
            auth
          );
        }
        const got = await getPatientInvoice(getPool(), {
          organizationId: auth.organization.id,
          patientId: auth.patient.id,
          invoiceId,
        });
        if (!got.ok || got.code === BILLING_RESULT.NOT_FOUND) {
          return notFoundPage(
            res,
            clinicCtx,
            req.params.clinicKey,
            csrfToken,
            auth
          );
        }
        return res.status(200).type("html").send(
          renderPatientView(
            "patient/invoice-detail",
            clinicPayload(clinicCtx, req.params.clinicKey, csrfToken, {
              patientAuth: auth,
              activeNav: "invoices",
              invoice: got.invoice,
              stitch: STITCH.invoiceDetail,
            })
          )
        );
      } catch (err) {
        return next(err);
      }
    }
  );
}

module.exports = {
  registerPatientPortalMissingFunctionalityRoutes,
  STITCH,
};
