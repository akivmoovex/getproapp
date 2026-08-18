"use strict";

/**
 * Read-only Platform Admin settings summary.
 * Reflects BlessBoard architecture: deployment → organisation tenant → church → HQ/branches.
 * Never exposes secrets, credentials, reset tokens, or production connection strings.
 */

const {
  listPlatformDeployments,
  STATUS: DEPLOY_STATUS,
} = require("./listPlatformDeployments");
const {
  listPlatformPlansCatalogue,
  STATUS: PLAN_STATUS,
} = require("./listPlatformPlansCatalogue");
const { getPlatformDeploymentCode } = require("../config/platformDeploymentCode");
const { SESSION_TTL_MS } = require("../session/sessionToken");
const { MAX_AGE_SECONDS: SUPPORT_MAX_AGE_SECONDS } = require("../http/supportContextCookie");
const { INVITE_TTL_MS } = require("../../blessboard/services/inviteBlessBoardStaff");
const { resolveOtpProvider } = require("../../blessboard/services/otp/otpProviders");
const { DEFAULT_COUNTRY: PHONE_DEFAULT_COUNTRY } = require("../../blessboard/services/normalizeBlessBoardPhone");
const {
  ORGANIZATION_RESERVED_SLUGS,
  BRANCH_HOST_RESERVED_SLUGS,
} = require("../../church/platformProvisioningValidation");
const {
  identityTableExists,
  readIdentityRow,
} = require("../../../db/scripts/lib/databaseIdentity");
const { resolveOutboundEmailStatus } = require("../../activeclinic/services/activeClinicEmailDelivery");

const STATUS = Object.freeze({
  OK: "ok",
  LOOKUP_ERROR: "lookup_error",
});

const PLATFORM_NAME = "BlessBoard";
const DEFAULT_LANGUAGE = "en";
const DEFAULT_TIMEZONE = "Africa/Lusaka";
const DEFAULT_PLAN_KEYS = ["free", "foundation"];
const PASSWORD_POLICY = Object.freeze({
  minLength: 10,
  maxLength: 200,
  summary: "Minimum 10 characters; maximum 200. Passwords are never displayed.",
});

function hoursLabel(ms) {
  const hours = Math.round(Number(ms) / (60 * 60 * 1000));
  if (!Number.isFinite(hours) || hours <= 0) return "Configured";
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

function minutesLabel(seconds) {
  const mins = Math.round(Number(seconds) / 60);
  if (!Number.isFinite(mins) || mins <= 0) return "Configured";
  return mins === 1 ? "1 minute" : `${mins} minutes`;
}

function daysLabel(ms) {
  const days = Math.round(Number(ms) / (24 * 60 * 60 * 1000));
  if (!Number.isFinite(days) || days <= 0) return "Configured";
  return days === 1 ? "1 day" : `${days} days`;
}

function featureLimit(features, key) {
  const row = (features || []).find((f) => String(f.featureKey) === key);
  if (!row) return null;
  if (row.limitValue != null && Number.isFinite(Number(row.limitValue))) {
    return Number(row.limitValue);
  }
  if (row.booleanValue != null) return Boolean(row.booleanValue);
  return null;
}

function formatLimit(value, unit) {
  if (value == null) return "Not published on default plan";
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  if (Number(value) >= 99999) return "Unlimited";
  return unit ? `${value} ${unit}` : String(value);
}

function providerStatusLabel(configured, reason) {
  if (configured) return { state: "configured", label: "Configured" };
  return {
    state: "unavailable",
    label: reason ? `Unavailable (${reason})` : "Unavailable",
  };
}

function resolveSmsStatus(env) {
  const e = env || process.env;
  const otp = resolveOtpProvider(e);
  const name = String((otp && otp.name) || "unknown");
  if (name === "test") {
    return providerStatusLabel(true, null);
  }
  if (name === "infobip" || name === "twilio") {
    return providerStatusLabel(false, "adapter_not_enabled");
  }
  return providerStatusLabel(false, "not_configured");
}

function resolveEmailStatus(env) {
  return resolveOutboundEmailStatus(env);
}

function resolveWhatsAppStatus() {
  return {
    state: "manual_only",
    label: "Manual wa.me sharing only (no Business API)",
  };
}

function pickDefaultPlan(plans) {
  const list = Array.isArray(plans) ? plans : [];
  for (const key of DEFAULT_PLAN_KEYS) {
    const hit = list.find(
      (p) => String(p.planKey) === key && p.isActive !== false
    );
    if (hit) return hit;
  }
  return list.find((p) => p.isActive) || list[0] || null;
}

/**
 * @param {{ query: Function }} db
 * @param {NodeJS.ProcessEnv | Record<string, string|undefined>} env
 */
async function getPlatformAdminSettingsView(db, env) {
  const e = env || process.env;
  try {
    const deployList = await listPlatformDeployments(db, e);
    if (!deployList.ok || deployList.status === DEPLOY_STATUS.LOOKUP_ERROR) {
      return { ok: false, status: STATUS.LOOKUP_ERROR, settings: null };
    }

    const currentDeploymentCode =
      deployList.currentDeploymentCode ||
      (() => {
        const id = getPlatformDeploymentCode(e);
        return id && id.ok ? id.code : "";
      })();
    const current =
      (deployList.deployments || []).find(
        (d) => d.deploymentCode === currentDeploymentCode
      ) || null;

    const plansResult = await listPlatformPlansCatalogue(db, {
      includeInactive: false,
    });
    const plans =
      plansResult.ok && plansResult.status !== PLAN_STATUS.LOOKUP_ERROR
        ? plansResult.plans || []
        : [];
    const defaultPlan = pickDefaultPlan(plans);
    const features = (defaultPlan && defaultPlan.features) || [];

    let identity = null;
    try {
      if (db && typeof db.query === "function" && (await identityTableExists(db))) {
        const row = await readIdentityRow(db);
        if (row) {
          identity = {
            identityKey: row.identity_key ? String(row.identity_key) : null,
            environmentCode: row.environment_code
              ? String(row.environment_code)
              : null,
            databaseName: row.database_name ? String(row.database_name) : null,
          };
        }
      }
    } catch {
      identity = null;
    }

    let migrationCount = null;
    let latestMigration = null;
    try {
      const mig = await db.query(
        `SELECT COUNT(*)::int AS n,
                MAX(filename) AS latest_filename
           FROM platform.schema_migrations`
      );
      migrationCount = Number(mig.rows[0] && mig.rows[0].n) || 0;
      latestMigration =
        mig.rows[0] && mig.rows[0].latest_filename
          ? String(mig.rows[0].latest_filename)
          : null;
    } catch {
      migrationCount = null;
      latestMigration = null;
    }

    const otpProvider = resolveOtpProvider(e);
    const otpName = String((otpProvider && otpProvider.name) || "unknown");
    const sms = resolveSmsStatus(e);
    const email = resolveEmailStatus(e);
    const whatsapp = resolveWhatsAppStatus();

    const canonicalDomain =
      (current && current.canonicalDomain) || "blessboard.org";
    const hostnamePattern = `{organization}.${canonicalDomain}`;

    const deploymentEnv = String(
      e.DEPLOYMENT_ENV ||
        (identity && identity.environmentCode) ||
        (current && current.environmentCode) ||
        "unknown"
    )
      .trim()
      .toLowerCase();

    const settings = {
      architecture: {
        model: [
          "Platform deployment",
          "Organisation tenant",
          "Church",
          "HQ and branches (scopes)",
        ],
        rules: [
          "Organisation is the tenant.",
          "Church belongs to the organisation.",
          "HQ and branches are scopes inside the tenant — not separate deployments.",
          "One deployment may serve many organisations.",
          "Creating an organisation does not create a new deployment record.",
        ],
      },
      general: {
        platformName: PLATFORM_NAME,
        supportContact: String(e.BLESSBOARD_SUPPORT_CONTACT || "Configured via operations runbook").slice(
          0,
          120
        ),
        defaultCountry: PHONE_DEFAULT_COUNTRY || "ZM",
        defaultTimezone: DEFAULT_TIMEZONE,
        defaultPhoneCountryCode: PHONE_DEFAULT_COUNTRY || "ZM",
        defaultLanguage: DEFAULT_LANGUAGE,
      },
      organisationDefaults: {
        defaultPlanKey: defaultPlan ? defaultPlan.planKey : "free",
        defaultPlanDisplay: defaultPlan
          ? defaultPlan.displayName || defaultPlan.planKey
          : "Foundation",
        branchAllowance: formatLimit(
          featureLimit(features, "max_branches"),
          "branches"
        ),
        memberLimit: formatLimit(featureLimit(features, "max_members"), "members"),
        administratorLimit: formatLimit(
          featureLimit(features, "max_admins") != null
            ? featureLimit(features, "max_admins")
            : featureLimit(features, "max_staff"),
          "administrators"
        ),
        storageAllowance: formatLimit(
          featureLimit(features, "storage_limit_mb") != null
            ? featureLimit(features, "storage_limit_mb")
            : featureLimit(features, "storage_mb"),
          "MB"
        ),
        websiteDefaultState:
          featureLimit(features, "public_website") === false
            ? "Disabled on default plan"
            : "Published Foundation website available when entitled",
        registrationApprovalPolicy:
          "Platform Admin review required before church provisioning completes",
        hostnamePattern,
        organizationReserved: Array.from(ORGANIZATION_RESERVED_SLUGS).sort(),
        hostReserved: Array.from(BRANCH_HOST_RESERVED_SLUGS).sort(),
        provisionOrganizationsHref: "/admin/organizations/new",
      },
      identityAuth: {
        phoneFirstLogin: "Enabled — phone is the preferred staff identifier",
        emailFallback: "Enabled when email is present on the account",
        otpProvider: otpName,
        otpProviderStatus:
          otpName === "test"
            ? "Test provider (non-production)"
            : otpName === "infobip" || otpName === "twilio"
              ? "Named provider selected; adapter not enabled"
              : "Unavailable",
        passwordPolicy: PASSWORD_POLICY.summary,
        passwordMinLength: PASSWORD_POLICY.minLength,
        sessionDuration: hoursLabel(SESSION_TTL_MS),
        supportModeDuration: minutesLabel(SUPPORT_MAX_AGE_SECONDS),
      },
      communications: {
        sms: sms.label,
        smsState: sms.state,
        whatsapp: whatsapp.label,
        whatsappState: whatsapp.state,
        email: email.label,
        emailState: email.state,
        manualWhatsAppSharing: "Supported via wa.me links for invitation sharing",
        invitationExpiry: daysLabel(INVITE_TTL_MS),
      },
      security: {
        platformAdminAccess:
          "Apex Platform Admin role with RBAC platform.* permissions",
        supportModeRestrictions:
          "Time-boxed support context; no password view; audited entry and exit",
        auditStatus: "platform.audit_events recording for sensitive Platform Admin actions",
        confidentialExclusions:
          "Finance transaction detail and pastoral/welfare confidential domains are excluded from Platform Admin and support-mode surfaces",
      },
      systemHealth: {
        environment: deploymentEnv,
        identityKey: identity && identity.identityKey ? identity.identityKey : "—",
        identityEnvironment:
          identity && identity.environmentCode ? identity.environmentCode : "—",
        deploymentCode: currentDeploymentCode || "—",
        deploymentProfile:
          current && current.releaseVersion
            ? String(current.releaseVersion)
            : "BlessBoard V5 foundation",
        canonicalDomain,
        migrationCount,
        latestMigration,
        backgroundJobs: "No operator job console in this shell",
        providerHealth: {
          otp: otpName,
          sms: sms.state,
          email: email.state,
          whatsapp: whatsapp.state,
        },
      },
      rolesAndAccess: {
        roleCount: null,
        permissionCount: null,
        sensitiveAssignmentCount: null,
        accessHealthWarnings: null,
        rolesHref: "/admin/roles",
        accessHealthHref: "/admin/access-health",
      },
      links: {
        organizationsNew: "/admin/organizations/new",
        organizations: "/admin/organizations",
        deployments: "/admin/system/deployments",
        plans: "/admin/plans",
        domains: "/admin/domains",
        roles: "/admin/roles",
        accessHealth: "/admin/access-health",
      },
    };

    // Attempt to load roles/access summary (best-effort)
    try {
      const rolesCountRes = await db.query(
        `SELECT COUNT(*)::int AS n FROM blessboard.roles WHERE is_active = true`
      );
      settings.rolesAndAccess.roleCount = Number(rolesCountRes.rows[0] && rolesCountRes.rows[0].n) || 0;

      const permsCountRes = await db.query(
        `SELECT COUNT(*)::int AS n FROM blessboard.permissions WHERE is_active = true`
      );
      settings.rolesAndAccess.permissionCount = Number(permsCountRes.rows[0] && permsCountRes.rows[0].n) || 0;

      const sensitiveCountRes = await db.query(
        `SELECT COUNT(*)::int AS n
           FROM blessboard.user_role_assignments ura
           JOIN blessboard.roles r ON r.id = ura.role_id
          WHERE r.is_sensitive = true
            AND ura.status = 'active'
            AND ura.revoked_at IS NULL`
      );
      settings.rolesAndAccess.sensitiveAssignmentCount =
        Number(sensitiveCountRes.rows[0] && sensitiveCountRes.rows[0].n) || 0;

      const warningCountRes = await db.query(
        `SELECT COUNT(*)::int AS n
           FROM (
             SELECT 1 FROM blessboard.user_role_assignments WHERE status = 'expired'
             UNION ALL
             SELECT 1 FROM blessboard.user_role_assignments WHERE status = 'revoked' OR revoked_at IS NOT NULL
           ) sub`
      );
      settings.rolesAndAccess.accessHealthWarnings =
        Number(warningCountRes.rows[0] && warningCountRes.rows[0].n) || 0;
    } catch {
      // Best-effort only; leave nulls if query fails
    }

    return { ok: true, status: STATUS.OK, settings };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, settings: null };
  }
}

module.exports = {
  STATUS,
  getPlatformAdminSettingsView,
  PASSWORD_POLICY,
};
