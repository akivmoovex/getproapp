"use strict";

/**
 * Staff routes for AC-P05 visit summary release preview + release.
 * Mounted under clinical encounter workflow. Not patient-accessible.
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
  buildPatientSafeProjection,
  releaseVisitSummary,
  getReleaseForEncounter,
  PERM,
  RESULT,
} = require("../services/activeClinicVisitSummaryReleaseService");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function authOrgId(auth) {
  return auth && auth.organization && auth.organization.id;
}

function actorFromAuth(auth) {
  return {
    staffMemberId: auth && auth.staffMember && auth.staffMember.id,
    platformIdentityId: auth && auth.platformIdentity && auth.platformIdentity.id,
  };
}

function errorMessage(code) {
  switch (code) {
    case RESULT.ALREADY_RELEASED:
      return "A visit summary has already been released for this encounter.";
    case RESULT.EMPTY_PROJECTION:
      return "Nothing patient-safe is available to release yet. Sign a consultation note or add release text first.";
    case RESULT.ENCOUNTER_NOT_FOUND:
      return "Encounter was not found.";
    default:
      return "Unable to release visit summary.";
  }
}

/**
 * @param {import('express').Express} app
 * @param {{ getPool: Function, env: NodeJS.ProcessEnv, isProduction: boolean }} deps
 */
function registerActiveClinicVisitSummaryStaffRoutes(app, deps) {
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
      activeNav: "clinical",
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
    "/app/clinical/encounter/:encounterId/visit-summary/release",
    requireAuth,
    requirePermission(PERM.RELEASE),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const organizationId = authOrgId(auth);
        const encounterId = String(req.params.encounterId || "");
        if (!UUID_RE.test(encounterId)) {
          return res.status(404).type("html").send(
            renderSimpleState("Encounter not found", "That encounter could not be found.", {
              linkHref: "/app/clinical",
              linkLabel: "Back to clinical",
              state: "not-found",
            })
          );
        }

        const existing = await getReleaseForEncounter(getPool(), {
          organizationId,
          encounterId,
        });
        const built = await buildPatientSafeProjection(getPool(), {
          organizationId,
          encounterId,
          actor: actorFromAuth(auth),
        });
        if (!built.ok) {
          return res.status(404).type("html").send(
            renderSimpleState("Encounter not found", errorMessage(built.code), {
              linkHref: "/app/clinical",
              linkLabel: "Back to clinical",
              state: "not-found",
            })
          );
        }

        return await renderShell(req, res, {
          content: "app/visit-summary-release-content.ejs",
          pageHeader: {
            title: "Release visit summary",
            description:
              "Review the patient-safe summary exactly as it will appear in the patient portal.",
          },
          breadcrumbs: [
            { label: "Clinical", href: "/app/clinical" },
            {
              label: "Encounter",
              href: `/app/clinical/encounter/${encodeURIComponent(encounterId)}`,
            },
            { label: "Release visit summary" },
          ],
          pageData: {
            catalogue: {
              encounter: built.encounter,
              projection: built.projection,
              hasContent: built.hasContent,
              signedConsultationPresent: built.signedConsultationPresent,
              alreadyReleased: existing.ok,
              existingRelease: existing.ok ? existing.release : null,
              formAction: `/app/clinical/encounter/${encodeURIComponent(
                encounterId
              )}/visit-summary/release`,
              cancelHref: `/app/clinical/encounter/${encodeURIComponent(encounterId)}`,
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
    "/app/clinical/encounter/:encounterId/visit-summary/release",
    requireAuth,
    requirePermission(PERM.RELEASE),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        if (!validateCsrf(req, req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Invalid CSRF token");
        }
        const organizationId = authOrgId(auth);
        const encounterId = String(req.params.encounterId || "");
        const body = req.body || {};
        const overrides = {
          reasonForVisit: String(body.reason_for_visit || "").trim(),
          assessmentSummary: String(body.assessment_summary || "").trim(),
          careProvided: String(body.care_provided || "").trim(),
          patientInstructions: String(body.patient_instructions || "").trim(),
          followUp: String(body.follow_up || "").trim(),
          practitionerDisplayName: String(body.practitioner_display_name || "").trim(),
          serviceLabel: String(body.service_label || "").trim(),
        };

        const released = await releaseVisitSummary(getPool(), {
          organizationId,
          encounterId,
          actor: actorFromAuth(auth),
          overrides,
        });

        if (!released.ok) {
          const built = await buildPatientSafeProjection(getPool(), {
            organizationId,
            encounterId,
            actor: actorFromAuth(auth),
            overrides,
          });
          return await renderShell(req, res, {
            status: 400,
            content: "app/visit-summary-release-content.ejs",
            pageHeader: { title: "Release visit summary" },
            breadcrumbs: [
              { label: "Clinical", href: "/app/clinical" },
              { label: "Release visit summary" },
            ],
            pageData: {
              catalogue: {
                encounter: built.ok ? built.encounter : null,
                projection: built.ok ? built.projection : overrides,
                hasContent: built.ok ? built.hasContent : false,
                signedConsultationPresent: built.ok
                  ? built.signedConsultationPresent
                  : false,
                alreadyReleased: released.code === RESULT.ALREADY_RELEASED,
                existingRelease:
                  released.code === RESULT.ALREADY_RELEASED
                    ? released.release
                    : null,
                formAction: `/app/clinical/encounter/${encodeURIComponent(
                  encounterId
                )}/visit-summary/release`,
                cancelHref: `/app/clinical/encounter/${encodeURIComponent(
                  encounterId
                )}`,
                error: errorMessage(released.code),
              },
            },
          });
        }

        return res.redirect(
          303,
          `/app/clinical/encounter/${encodeURIComponent(encounterId)}?visit_summary=1`
        );
      } catch (err) {
        return next(err);
      }
    }
  );
}

module.exports = {
  registerActiveClinicVisitSummaryStaffRoutes,
  PERM,
};
