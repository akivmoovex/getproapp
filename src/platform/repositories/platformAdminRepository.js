"use strict";

/**
 * Read-only platform-admin catalogue queries (organizations directory).
 */

/**
 * Build allowlisted WHERE for organization directory filters.
 * @param {{
 *   keyPrefix?: string | null,
 *   product?: string | null,
 *   onboarding?: string | null,
 *   followUp?: string | null,
 *   supportRequested?: boolean | null,
 *   publication?: string | null,
 *   plan?: string | null,
 * }} filters
 * @returns {{ whereSql: string, params: unknown[], joins: string }}
 */
function buildOrganizationDirectoryFilters(filters = {}) {
  const params = [];
  const clauses = [];
  const joins = [];

  const keyPrefix = filters.keyPrefix || null;
  if (keyPrefix) {
    params.push(keyPrefix);
    clauses.push(`o.organization_key LIKE $${params.length} || '%'`);
  }

  const product = filters.product ? String(filters.product).toLowerCase() : null;
  if (product === "blessboard") {
    joins.push(`INNER JOIN platform.products p_filt
         ON p_filt.product_key = 'blessboard'
       INNER JOIN platform.organization_products op_filt
         ON op_filt.organization_id = o.id
        AND op_filt.product_id = p_filt.id
        AND op_filt.status = 'active'`);
  }

  const onboarding = filters.onboarding ? String(filters.onboarding).toLowerCase() : null;
  if (onboarding === "incomplete") {
    joins.push(
      `LEFT JOIN blessboard.organization_onboarding oo_filt ON oo_filt.organization_id = o.id`
    );
    joins.push(`INNER JOIN blessboard.churches c_onb ON c_onb.organization_id = o.id`);
    clauses.push(
      `(oo_filt.organization_id IS NULL OR oo_filt.onboarding_status NOT IN ('completed', 'skipped'))`
    );
  }

  const followUp = filters.followUp ? String(filters.followUp).toLowerCase() : null;
  if (followUp) {
    if (!joins.some((j) => j.includes("oo_filt"))) {
      joins.push(
        `LEFT JOIN blessboard.organization_onboarding oo_filt ON oo_filt.organization_id = o.id`
      );
    }
    params.push(followUp);
    clauses.push(`oo_filt.follow_up_status = $${params.length}`);
  }

  if (filters.supportRequested === true) {
    if (!joins.some((j) => j.includes("oo_filt"))) {
      joins.push(
        `LEFT JOIN blessboard.organization_onboarding oo_filt ON oo_filt.organization_id = o.id`
      );
    }
    clauses.push(`oo_filt.support_requested = TRUE`);
  }

  const publication = filters.publication ? String(filters.publication).toLowerCase() : null;
  if (publication === "unpublished") {
    joins.push(`INNER JOIN blessboard.churches c_pub ON c_pub.organization_id = o.id`);
    clauses.push(`NOT EXISTS (
      SELECT 1 FROM blessboard.public_pages pp
       WHERE pp.church_id = c_pub.id AND pp.status = 'published'
    )`);
  }

  const plan = filters.plan ? String(filters.plan).toLowerCase() : null;
  if (plan) {
    params.push(plan);
    clauses.push(`EXISTS (
      SELECT 1
        FROM platform.organization_subscriptions os
        INNER JOIN platform.plans pl ON pl.id = os.plan_id
       WHERE os.organization_id = o.id
         AND os.status IN ('active', 'trialing', 'past_due')
         AND os.starts_at <= now()
         AND (os.ends_at IS NULL OR os.ends_at > now())
         AND pl.plan_key = $${params.length}
    )`);
  }

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
    joinsSql: joins.length ? joins.join("\n       ") : "",
  };
}

/**
 * @param {{ query: Function }} client
 * @param {{
 *   limit: number,
 *   offset: number,
 *   keyPrefix?: string | null,
 *   product?: string | null,
 *   onboarding?: string | null,
 *   followUp?: string | null,
 *   supportRequested?: boolean | null,
 *   publication?: string | null,
 *   plan?: string | null,
 * }} opts
 */
async function listOrganizationDirectoryPage(client, opts) {
  const limit = opts.limit;
  const offset = opts.offset;
  const built = buildOrganizationDirectoryFilters(opts);
  const params = [...built.params, limit, offset];
  const limitIdx = built.params.length + 1;
  const offsetIdx = built.params.length + 2;

  const r = await client.query(
    `SELECT
        o.organization_key,
        o.display_name,
        o.data_environment,
        o.status AS organization_status,
        op.status AS enrolment_status,
        d.hostname AS canonical_hostname,
        d.deployment_id AS deployment_code,
        c.church_key,
        c.status AS church_status,
        COALESCE(bc.active_branch_count, 0)::int AS active_branch_count,
        oo.onboarding_status,
        oo.follow_up_status,
        oo.support_requested,
        oo.next_follow_up_at,
        o.created_at AS organization_created_at,
        plan_row.plan_key,
        plan_row.subscription_status,
        plan_row.subscription_starts_at,
        plan_row.subscription_ends_at,
        fb.first_branch_name,
        fb.first_branch_key,
        ra.registration_application_id,
        COALESCE(pub.published_pages, 0)::int AS published_pages,
        COALESCE(pub.draft_pages, 0)::int AS draft_pages
       FROM platform.organizations o
       ${built.joinsSql}
       LEFT JOIN platform.products p
         ON p.product_key = 'blessboard'
       LEFT JOIN platform.organization_products op
         ON op.organization_id = o.id
        AND op.product_id = p.id
       LEFT JOIN LATERAL (
         SELECT dom.hostname, dom.deployment_id
           FROM platform.domains dom
          WHERE dom.organization_id = o.id
            AND dom.product_id = p.id
            AND dom.domain_type = 'canonical'
          ORDER BY
            CASE WHEN dom.is_primary THEN 0 ELSE 1 END,
            CASE WHEN dom.status = 'active' THEN 0 ELSE 1 END,
            dom.hostname ASC
          LIMIT 1
       ) d ON TRUE
       LEFT JOIN blessboard.churches c
         ON c.organization_id = o.id
       LEFT JOIN blessboard.organization_onboarding oo
         ON oo.organization_id = o.id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS active_branch_count
           FROM blessboard.branches b
          WHERE b.church_id = c.id
            AND b.status = 'active'
       ) bc ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*) FILTER (WHERE pp.status = 'draft')::int AS draft_pages,
           COUNT(*) FILTER (WHERE pp.status = 'published')::int AS published_pages
           FROM blessboard.public_pages pp
          WHERE pp.church_id = c.id
       ) pub ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           pl.plan_key,
           os.status AS subscription_status,
           os.starts_at AS subscription_starts_at,
           os.ends_at AS subscription_ends_at
           FROM platform.organization_subscriptions os
           INNER JOIN platform.plans pl ON pl.id = os.plan_id
          WHERE os.organization_id = o.id
            AND os.status IN ('active', 'trialing', 'past_due')
            AND os.starts_at <= now()
            AND (os.ends_at IS NULL OR os.ends_at > now())
          ORDER BY
            CASE os.status
              WHEN 'trialing' THEN 0
              WHEN 'past_due' THEN 1
              ELSE 2
            END,
            os.created_at DESC
          LIMIT 1
       ) plan_row ON TRUE
       LEFT JOIN LATERAL (
         SELECT b.display_name AS first_branch_name, b.branch_key AS first_branch_key
           FROM blessboard.branches b
          WHERE b.church_id = c.id
            AND b.status = 'active'
          ORDER BY
            CASE
              WHEN b.branch_type = 'hq' OR b.branch_key = 'hq' THEN 0
              ELSE 1
            END,
            b.created_at ASC
          LIMIT 1
       ) fb ON TRUE
       LEFT JOIN LATERAL (
         SELECT a.id AS registration_application_id
           FROM blessboard.platform_church_registration_applications a
          WHERE a.organization_id = o.id
          ORDER BY a.created_at DESC
          LIMIT 1
       ) ra ON TRUE
      ${built.whereSql}
      ORDER BY o.organization_key ASC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );
  return r.rows;
}

/**
 * @param {{ query: Function }} client
 * @param {{
 *   keyPrefix?: string | null,
 *   product?: string | null,
 *   onboarding?: string | null,
 *   followUp?: string | null,
 *   supportRequested?: boolean | null,
 *   publication?: string | null,
 *   plan?: string | null,
 * }} opts
 */
async function countOrganizationDirectory(client, opts) {
  const built = buildOrganizationDirectoryFilters(opts);
  const r = await client.query(
    `SELECT COUNT(DISTINCT o.id)::int AS total
       FROM platform.organizations o
       ${built.joinsSql}
      ${built.whereSql}`,
    built.params
  );
  return r.rows[0] ? Number(r.rows[0].total) : 0;
}

/**
 * Real directory + registration-ops totals for the platform-admin dashboard.
 * Bounded aggregate subqueries only — no N+1, no revenue, no invented health.
 * Growth-offer metrics soft-degrade to zero when the offers table is not yet migrated.
 * @param {{ query: Function }} client
 */
async function countOrganizationDirectoryStats(client) {
  const offersRel = await client.query(
    `SELECT to_regclass('blessboard.organization_growth_trial_offers') IS NOT NULL AS ok`
  );
  const hasGrowthOffersTable = Boolean(offersRel.rows[0] && offersRel.rows[0].ok);

  const growthOfferSelects = hasGrowthOffersTable
    ? `
        (
          SELECT COUNT(*)::int
            FROM platform.organizations o2
            INNER JOIN platform.organization_subscriptions os
              ON os.organization_id = o2.id AND os.product_key = 'blessboard'
            INNER JOIN platform.plans pl ON pl.id = os.plan_id AND pl.plan_key = 'free'
           WHERE os.status = 'active'
             AND (os.ends_at IS NULL OR os.ends_at > now())
             AND NOT EXISTS (
               SELECT 1 FROM blessboard.organization_growth_trial_offers oft
                WHERE oft.organization_id = o2.id
                  AND oft.is_exception = false
                  AND oft.status IN ('accepted', 'active', 'expired', 'consumed')
             )
             AND NOT EXISTS (
               SELECT 1 FROM blessboard.organization_growth_trial_offers oft2
                WHERE oft2.organization_id = o2.id AND oft2.status = 'offered'
             )
        ) AS foundation_eligible_for_growth_trial,
        (
          SELECT COUNT(*)::int
            FROM blessboard.organization_growth_trial_offers oft
           WHERE oft.status = 'offered'
        ) AS growth_trial_offers_pending,
        (
          SELECT COUNT(*)::int
            FROM blessboard.organization_growth_trial_offers oft
           WHERE oft.status = 'active'
        ) AS foundation_origin_active_trials,
        (
          SELECT COUNT(*)::int
            FROM blessboard.organization_growth_trial_offers oft
           WHERE oft.is_exception = false
             AND oft.status IN ('accepted', 'active', 'expired', 'consumed')
        ) AS foundation_trial_offers_consumed,`
    : `
        0::int AS foundation_eligible_for_growth_trial,
        0::int AS growth_trial_offers_pending,
        0::int AS foundation_origin_active_trials,
        0::int AS foundation_trial_offers_consumed,`;

  const r = await client.query(
    `SELECT
        COUNT(o.id)::int AS total_organizations,
        COUNT(c.id)::int AS organizations_with_church,
        (
          SELECT COUNT(*)::int
            FROM blessboard.platform_church_registration_applications a
           WHERE a.selected_plan = 'foundation'
             AND a.application_status = 'closed'
             AND a.provisioning_status = 'provisioned'
             AND COALESCE(a.provisioned_at, a.updated_at) >= now() - interval '7 days'
        ) AS recent_foundation_registrations,
        (
          SELECT COUNT(*)::int
            FROM platform.organization_subscriptions os
            INNER JOIN platform.plans pl ON pl.id = os.plan_id
           WHERE os.product_key = 'blessboard'
             AND pl.plan_key = 'growth'
             AND os.status = 'trialing'
             AND os.starts_at <= now()
             AND (os.ends_at IS NULL OR os.ends_at > now())
        ) AS active_growth_trials,
        (
          SELECT COUNT(*)::int
            FROM platform.organization_subscriptions os
            INNER JOIN platform.plans pl ON pl.id = os.plan_id
           WHERE os.product_key = 'blessboard'
             AND pl.plan_key = 'growth'
             AND os.status = 'trialing'
             AND os.ends_at IS NOT NULL
             AND os.ends_at > now()
             AND os.ends_at <= now() + interval '7 days'
        ) AS growth_trials_ending_soon,
        (
          SELECT COUNT(*)::int
            FROM platform.organization_subscriptions os
            INNER JOIN platform.plans pl ON pl.id = os.plan_id
           WHERE os.product_key = 'blessboard'
             AND pl.plan_key = 'growth'
             AND os.status = 'past_due'
             AND os.starts_at <= now()
             AND os.ends_at IS NOT NULL
             AND os.ends_at > now()
        ) AS growth_subscriptions_in_grace,
        (
          SELECT COUNT(*)::int
            FROM blessboard.platform_church_registration_applications a
            LEFT JOIN blessboard.organization_onboarding oo
              ON oo.organization_id = a.organization_id
           WHERE a.application_status IN ('submitted', 'duplicate_review')
              OR a.provisioning_status = 'provisioning_failed'
              OR COALESCE(oo.support_requested, a.support_requested, false) = TRUE
              OR COALESCE(oo.follow_up_status, a.follow_up_status) IN (
                   'new', 'call_pending', 'needs_help'
                 )
        ) AS registrations_requiring_review,
        (
          SELECT COUNT(*)::int
            FROM blessboard.platform_church_registration_applications a
           WHERE a.selected_plan = 'network'
             AND COALESCE(a.support_requested, false) = TRUE
             AND a.organization_id IS NULL
             AND a.application_status IN ('submitted', 'duplicate_review')
        ) AS pending_network_support_requests,
        (
          SELECT COUNT(*)::int
            FROM blessboard.platform_church_registration_applications a
           WHERE a.application_status IN ('submitted', 'duplicate_review')
             AND a.created_at >= now() - interval '7 days'
        ) AS new_registrations_7d,
        (
          SELECT COUNT(*)::int
            FROM blessboard.platform_church_registration_applications a
           WHERE a.provisioning_status = 'provisioning_failed'
        ) AS provisioning_failures,
        ${growthOfferSelects}
        (
          SELECT COUNT(*)::int
            FROM platform.organization_subscriptions os
            INNER JOIN platform.plans pl ON pl.id = os.plan_id
           WHERE os.product_key = 'blessboard'
             AND pl.plan_key = 'growth'
             AND os.status = 'active'
             AND (os.ends_at IS NULL OR os.ends_at > now())
             AND (
               os.billing_payment_status IN ('externally_paid', 'succeeded')
               OR os.ends_at IS NULL
             )
        ) AS paid_growth_subscriptions,
        (
          SELECT COUNT(*)::int
            FROM blessboard.platform_church_registration_applications a
           WHERE a.selected_plan = 'network'
             AND a.organization_id IS NULL
             AND a.follow_up_status = 'validation_pending'
        ) AS network_validation_pending,
        (
          SELECT COUNT(*)::int
            FROM blessboard.platform_church_registration_applications a
           WHERE a.selected_plan = 'network'
             AND a.organization_id IS NULL
             AND a.follow_up_status = 'validation_in_progress'
        ) AS network_validation_in_progress,
        (
          SELECT COUNT(*)::int
            FROM blessboard.platform_church_registration_applications a
           WHERE a.selected_plan = 'network'
             AND a.organization_id IS NULL
             AND a.follow_up_status = 'awaiting_customer'
        ) AS network_awaiting_applicant,
        (
          SELECT COUNT(*)::int
            FROM blessboard.platform_church_registration_applications a
           WHERE a.selected_plan = 'network'
             AND a.organization_id IS NULL
             AND a.follow_up_status = 'approved_for_provision'
        ) AS network_approved_not_provisioned,
        (
          SELECT COUNT(*)::int
            FROM blessboard.platform_church_registration_applications a
           WHERE a.selected_plan = 'network'
             AND a.organization_id IS NULL
             AND a.follow_up_status IN ('validation_pending', 'contact_pending')
             AND a.next_follow_up_at IS NOT NULL
             AND a.next_follow_up_at < now()
        ) AS network_first_contact_overdue
       FROM platform.organizations o
       LEFT JOIN blessboard.churches c
         ON c.organization_id = o.id`
  );
  const row = r.rows[0] || {};
  return {
    totalOrganizations: Number(row.total_organizations) || 0,
    organizationsWithChurch: Number(row.organizations_with_church) || 0,
    recentFoundationRegistrations: Number(row.recent_foundation_registrations) || 0,
    activeGrowthTrials: Number(row.active_growth_trials) || 0,
    growthTrialsEndingSoon: Number(row.growth_trials_ending_soon) || 0,
    growthSubscriptionsInGrace: Number(row.growth_subscriptions_in_grace) || 0,
    registrationsRequiringReview: Number(row.registrations_requiring_review) || 0,
    pendingNetworkSupportRequests: Number(row.pending_network_support_requests) || 0,
    newRegistrations7d: Number(row.new_registrations_7d) || 0,
    provisioningFailures: Number(row.provisioning_failures) || 0,
    foundationEligibleForGrowthTrial: Number(row.foundation_eligible_for_growth_trial) || 0,
    growthTrialOffersPending: Number(row.growth_trial_offers_pending) || 0,
    foundationOriginActiveTrials: Number(row.foundation_origin_active_trials) || 0,
    foundationTrialOffersConsumed: Number(row.foundation_trial_offers_consumed) || 0,
    paidGrowthSubscriptions: Number(row.paid_growth_subscriptions) || 0,
    networkValidationPending: Number(row.network_validation_pending) || 0,
    networkValidationInProgress: Number(row.network_validation_in_progress) || 0,
    networkAwaitingApplicant: Number(row.network_awaiting_applicant) || 0,
    networkApprovedNotProvisioned: Number(row.network_approved_not_provisioned) || 0,
    networkFirstContactOverdue: Number(row.network_first_contact_overdue) || 0,
    growthOffersTablePresent: hasGrowthOffersTable,
  };
}

/**
 * Bounded registration + onboarding aggregates for the platform-admin dashboard.
 * Integers / medians only — no PII columns selected.
 * Window is [rangeStart, rangeEndExclusive) in UTC.
 * @param {{ query: Function }} client
 * @param {{ rangeStart: string|Date, rangeEndExclusive: string|Date }} opts
 */
async function countRegistrationOnboardingAnalytics(client, opts) {
  const rangeStart = opts && opts.rangeStart;
  const rangeEndExclusive = opts && opts.rangeEndExclusive;
  const [
    r,
    trials,
    conversions,
    downgrades,
    onboarding,
    medianRegToOnboard,
    medianNetworkContact,
  ] = await Promise.all([
    client.query(
      `SELECT
          COUNT(*) FILTER (WHERE a.selected_plan = 'foundation')::int AS submissions_foundation,
          COUNT(*) FILTER (WHERE a.selected_plan = 'growth')::int AS submissions_growth,
          COUNT(*) FILTER (WHERE a.selected_plan = 'network')::int AS submissions_network,
          COUNT(*)::int AS submissions_total,
          COUNT(*) FILTER (
            WHERE a.selected_plan IN ('foundation', 'growth')
          )::int AS auto_plan_submissions,
          COUNT(*) FILTER (
            WHERE a.selected_plan IN ('foundation', 'growth')
              AND a.provisioning_status = 'provisioned'
          )::int AS auto_provision_success,
          COUNT(*) FILTER (
            WHERE a.selected_plan IN ('foundation', 'growth')
              AND a.provisioning_status = 'provisioning_failed'
          )::int AS auto_provision_failed,
          COUNT(*) FILTER (
            WHERE a.application_status = 'duplicate_review'
               OR a.risk_decision = 'review_required'
          )::int AS review_required,
          COUNT(*) FILTER (
            WHERE a.selected_plan = 'network'
              AND COALESCE(a.support_requested, false) = TRUE
          )::int AS network_contact_requests
         FROM blessboard.platform_church_registration_applications a
        WHERE a.created_at >= $1::timestamptz
          AND a.created_at < $2::timestamptz`,
      [rangeStart, rangeEndExclusive]
    ),
    client.query(
      `SELECT COUNT(*)::int AS growth_trial_starts
         FROM platform.organization_subscriptions os
         INNER JOIN platform.plans pl ON pl.id = os.plan_id
        WHERE os.product_key = 'blessboard'
          AND pl.plan_key = 'growth'
          AND os.starts_at >= $1::timestamptz
          AND os.starts_at < $2::timestamptz`,
      [rangeStart, rangeEndExclusive]
    ),
    client.query(
      `SELECT COUNT(*)::int AS growth_trial_conversions
         FROM platform.audit_events ae
        WHERE ae.action_key = 'billing.paid_activated'
          AND ae.created_at >= $1::timestamptz
          AND ae.created_at < $2::timestamptz
          AND (
            ae.metadata_json->>'source' = 'trial_conversion'
            OR ae.metadata_json->>'reason_code' = 'trial_conversion'
          )`,
      [rangeStart, rangeEndExclusive]
    ),
    client.query(
      `SELECT COUNT(*)::int AS growth_downgrades
         FROM platform.audit_events ae
        WHERE ae.action_key = 'subscription.trial_downgraded_to_foundation'
          AND ae.created_at >= $1::timestamptz
          AND ae.created_at < $2::timestamptz`,
      [rangeStart, rangeEndExclusive]
    ),
    client.query(
      `SELECT
          COUNT(*) FILTER (
            WHERE oo.onboarding_started_at >= $1::timestamptz
              AND oo.onboarding_started_at < $2::timestamptz
          )::int AS onboarding_started,
          COUNT(*) FILTER (
            WHERE oo.onboarding_completed_at >= $1::timestamptz
              AND oo.onboarding_completed_at < $2::timestamptz
          )::int AS onboarding_completed
         FROM blessboard.organization_onboarding oo`,
      [rangeStart, rangeEndExclusive]
    ),
    client.query(
      `SELECT
          percentile_cont(0.5) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (oo.onboarding_completed_at - a.created_at))
          ) AS median_seconds
         FROM blessboard.organization_onboarding oo
         INNER JOIN blessboard.platform_church_registration_applications a
           ON a.id = oo.registration_application_id
        WHERE oo.onboarding_completed_at IS NOT NULL
          AND oo.onboarding_completed_at >= $1::timestamptz
          AND oo.onboarding_completed_at < $2::timestamptz
          AND a.created_at IS NOT NULL
          AND oo.onboarding_completed_at >= a.created_at`,
      [rangeStart, rangeEndExclusive]
    ),
    client.query(
      `SELECT
          percentile_cont(0.5) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (a.first_contacted_at - a.created_at))
          ) AS median_seconds
         FROM blessboard.platform_church_registration_applications a
        WHERE a.selected_plan = 'network'
          AND COALESCE(a.support_requested, false) = TRUE
          AND a.first_contacted_at IS NOT NULL
          AND a.first_contacted_at >= $1::timestamptz
          AND a.first_contacted_at < $2::timestamptz
          AND a.first_contacted_at >= a.created_at`,
      [rangeStart, rangeEndExclusive]
    ),
  ]);

  const row = r.rows[0] || {};
  const autoSubmissions = Number(row.auto_plan_submissions) || 0;
  const autoSuccess = Number(row.auto_provision_success) || 0;

  return {
    submissionsByPlan: {
      foundation: Number(row.submissions_foundation) || 0,
      growth: Number(row.submissions_growth) || 0,
      network: Number(row.submissions_network) || 0,
    },
    submissionsTotal: Number(row.submissions_total) || 0,
    autoPlanSubmissions: autoSubmissions,
    autoProvisionSuccess: autoSuccess,
    autoProvisionFailed: Number(row.auto_provision_failed) || 0,
    registrationCompletionRate:
      autoSubmissions > 0 ? autoSuccess / autoSubmissions : null,
    reviewRequired: Number(row.review_required) || 0,
    networkContactRequests: Number(row.network_contact_requests) || 0,
    growthTrialStarts: Number(trials.rows[0]?.growth_trial_starts) || 0,
    growthTrialConversionsRecorded:
      Number(conversions.rows[0]?.growth_trial_conversions) || 0,
    growthDowngrades: Number(downgrades.rows[0]?.growth_downgrades) || 0,
    onboardingStarted: Number(onboarding.rows[0]?.onboarding_started) || 0,
    onboardingCompleted: Number(onboarding.rows[0]?.onboarding_completed) || 0,
    medianSecondsRegistrationToOnboardingComplete:
      medianRegToOnboard.rows[0]?.median_seconds != null
        ? Number(medianRegToOnboard.rows[0].median_seconds)
        : null,
    medianSecondsNetworkRequestToFirstContact:
      medianNetworkContact.rows[0]?.median_seconds != null
        ? Number(medianNetworkContact.rows[0].median_seconds)
        : null,
  };
}

/**
 * @param {{ query: Function }} client
 * @param {string} organizationKey
 */
async function findOrganizationDirectoryByKey(client, organizationKey) {
  const r = await client.query(
    `SELECT
        o.organization_key,
        o.display_name,
        o.data_environment,
        o.status AS organization_status,
        op.status AS enrolment_status,
        d.hostname AS canonical_hostname,
        d.deployment_id AS deployment_code,
        c.church_key,
        c.status AS church_status,
        COALESCE(bc.active_branch_count, 0)::int AS active_branch_count
       FROM platform.organizations o
       LEFT JOIN platform.products p
         ON p.product_key = 'blessboard'
       LEFT JOIN platform.organization_products op
         ON op.organization_id = o.id
        AND op.product_id = p.id
       LEFT JOIN LATERAL (
         SELECT dom.hostname, dom.deployment_id
           FROM platform.domains dom
          WHERE dom.organization_id = o.id
            AND dom.product_id = p.id
            AND dom.domain_type = 'canonical'
          ORDER BY
            CASE WHEN dom.is_primary THEN 0 ELSE 1 END,
            CASE WHEN dom.status = 'active' THEN 0 ELSE 1 END,
            dom.hostname ASC
          LIMIT 1
       ) d ON TRUE
       LEFT JOIN blessboard.churches c
         ON c.organization_id = o.id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS active_branch_count
           FROM blessboard.branches b
          WHERE b.church_id = c.id
            AND b.status = 'active'
       ) bc ON TRUE
      WHERE o.organization_key = $1
      LIMIT 1`,
    [organizationKey]
  );
  return r.rows[0] || null;
}

/**
 * Safe branch catalogue rows for an organization key (no UUIDs).
 * Bounded to 100 rows.
 * @param {{ query: Function }} client
 * @param {string} organizationKey
 */
async function listBranchesForOrganizationKey(client, organizationKey) {
  const r = await client.query(
    `SELECT
        b.branch_key,
        b.display_name,
        b.branch_type,
        b.status,
        b.is_primary,
        b.country_code
       FROM platform.organizations o
       INNER JOIN blessboard.churches c
         ON c.organization_id = o.id
       INNER JOIN blessboard.branches b
         ON b.church_id = c.id
      WHERE o.organization_key = $1
      ORDER BY
        CASE WHEN b.branch_type = 'hq' THEN 0 ELSE 1 END,
        CASE WHEN b.is_primary THEN 0 ELSE 1 END,
        b.branch_key ASC
      LIMIT 100`,
    [organizationKey]
  );
  return r.rows;
}

/**
 * Safe domain rows for an organization key (no UUIDs).
 * Bounded to 100 rows.
 * @param {{ query: Function }} client
 * @param {string} organizationKey
 */
async function listDomainsForOrganizationKey(client, organizationKey) {
  const r = await client.query(
    `SELECT
        d.hostname,
        d.domain_type,
        d.status,
        d.is_primary,
        d.deployment_id AS deployment_code,
        (d.verified_at IS NOT NULL) AS is_verified
       FROM platform.organizations o
       INNER JOIN platform.domains d
         ON d.organization_id = o.id
      WHERE o.organization_key = $1
      ORDER BY
        CASE WHEN d.is_primary THEN 0 ELSE 1 END,
        CASE WHEN d.domain_type = 'canonical' THEN 0 ELSE 1 END,
        d.hostname ASC
      LIMIT 100`,
    [organizationKey]
  );
  return r.rows;
}

/**
 * Safe deployment registry rows (no session cookie names or secrets).
 * Bounded to 100 rows.
 * @param {{ query: Function }} client
 */
async function listDeploymentsSafe(client) {
  const r = await client.query(
    `SELECT
        deployment_code,
        application_code,
        release_version,
        canonical_domain,
        environment_code,
        status,
        jobs_enabled,
        database_access_mode
       FROM platform.deployments
      ORDER BY deployment_code ASC
      LIMIT 100`
  );
  return r.rows;
}

/**
 * Single deployment row — safe catalogue columns only (no cookie-identity column).
 * @param {{ query: Function }} client
 * @param {string} deploymentCode
 */
async function findDeploymentSafeByCode(client, deploymentCode) {
  const r = await client.query(
    `SELECT
        deployment_code,
        application_code,
        release_version,
        canonical_domain,
        environment_code,
        status,
        jobs_enabled,
        database_access_mode
       FROM platform.deployments
      WHERE deployment_code = $1
      LIMIT 1`,
    [deploymentCode]
  );
  return r.rows[0] || null;
}

/**
 * Domains owned by a deployment — safe fields only (no UUIDs/secrets).
 * @param {{ query: Function }} client
 * @param {string} deploymentCode
 * @param {number} [limit]
 */
async function listDomainsForDeploymentSafe(client, deploymentCode, limit) {
  const lim = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 100;
  const r = await client.query(
    `SELECT
        d.hostname,
        d.domain_type,
        d.status,
        d.is_primary,
        d.deployment_id AS deployment_code,
        (d.verified_at IS NOT NULL) AS is_verified,
        p.product_key,
        p.display_name AS product_display_name,
        o.organization_key,
        o.display_name AS organization_display_name
       FROM platform.domains d
       INNER JOIN platform.products p
         ON p.id = d.product_id
       LEFT JOIN platform.organizations o
         ON o.id = d.organization_id
      WHERE d.deployment_id = $1
      ORDER BY
        CASE WHEN d.is_primary THEN 0 ELSE 1 END,
        CASE WHEN d.domain_type = 'canonical' THEN 0 ELSE 1 END,
        d.hostname ASC
      LIMIT $2`,
    [deploymentCode, lim]
  );
  return r.rows;
}

/**
 * Product catalogue row by product_key (safe display fields).
 * @param {{ query: Function }} client
 * @param {string} productKey
 */
async function findProductSafeByKey(client, productKey) {
  const r = await client.query(
    `SELECT product_key, display_name, status
       FROM platform.products
      WHERE product_key = $1
      LIMIT 1`,
    [productKey]
  );
  return r.rows[0] || null;
}

/**
 * Subscription directory rows (no UUIDs). Bounded page.
 * @param {{ query: Function }} client
 * @param {{
 *   limit: number,
 *   offset: number,
 *   keyPrefix?: string | null,
 *   status?: string | null,
 *   productKey?: string,
 * }} opts
 */
async function listSubscriptionsDirectoryPage(client, opts) {
  const limit = opts.limit;
  const offset = opts.offset;
  const keyPrefix = opts.keyPrefix || null;
  const status = opts.status || null;
  const productKey = opts.productKey || "blessboard";
  const planKey = opts.planKey || null;
  const endingSoon = opts.endingSoon === true;

  const r = await client.query(
    `SELECT
        o.organization_key,
        o.display_name AS organization_display_name,
        o.status AS organization_status,
        s.product_key,
        s.status AS subscription_status,
        s.starts_at,
        s.ends_at,
        s.notes,
        s.trial_source,
        s.billing_payment_status,
        p.plan_key,
        p.display_name AS plan_display_name,
        p.status AS plan_status
       FROM platform.organization_subscriptions s
       INNER JOIN platform.organizations o
         ON o.id = s.organization_id
       INNER JOIN platform.plans p
         ON p.id = s.plan_id
      WHERE s.product_key = $1
        AND ($2::text IS NULL OR o.organization_key LIKE $2 || '%')
        AND ($3::text IS NULL OR s.status = $3)
        AND ($4::text IS NULL OR p.plan_key = $4)
        AND (
          $5::boolean IS NOT TRUE
          OR (
            s.ends_at IS NOT NULL
            AND s.ends_at > now()
            AND s.ends_at <= now() + interval '7 days'
            AND s.status IN ('active', 'trialing', 'past_due')
          )
        )
        AND ($8::text IS NULL OR s.trial_source = $8)
      ORDER BY o.organization_key ASC, s.starts_at DESC
      LIMIT $6 OFFSET $7`,
    [
      productKey,
      keyPrefix,
      status,
      planKey,
      endingSoon,
      limit,
      offset,
      opts.trialSource || null,
    ]
  );
  return r.rows;
}

/**
 * @param {{ query: Function }} client
 * @param {{
 *   keyPrefix?: string | null,
 *   status?: string | null,
 *   productKey?: string,
 *   planKey?: string | null,
 *   endingSoon?: boolean,
 * }} opts
 */
async function countSubscriptionsDirectory(client, opts) {
  const keyPrefix = opts.keyPrefix || null;
  const status = opts.status || null;
  const productKey = opts.productKey || "blessboard";
  const planKey = opts.planKey || null;
  const endingSoon = opts.endingSoon === true;
  const r = await client.query(
    `SELECT COUNT(*)::int AS total
       FROM platform.organization_subscriptions s
       INNER JOIN platform.organizations o
         ON o.id = s.organization_id
       INNER JOIN platform.plans p
         ON p.id = s.plan_id
      WHERE s.product_key = $1
        AND ($2::text IS NULL OR o.organization_key LIKE $2 || '%')
        AND ($3::text IS NULL OR s.status = $3)
        AND ($4::text IS NULL OR p.plan_key = $4)
        AND (
          $5::boolean IS NOT TRUE
          OR (
            s.ends_at IS NOT NULL
            AND s.ends_at > now()
            AND s.ends_at <= now() + interval '7 days'
            AND s.status IN ('active', 'trialing', 'past_due')
          )
        )
        AND ($6::text IS NULL OR s.trial_source = $6)`,
    [productKey, keyPrefix, status, planKey, endingSoon, opts.trialSource || null]
  );
  return r.rows[0] ? Number(r.rows[0].total) : 0;
}

/**
 * @param {{ query: Function }} client
 * @param {{
 *   limit: number,
 *   offset: number,
 *   hostnamePrefix?: string | null,
 *   orgKeyPrefix?: string | null,
 *   status?: string | null,
 *   domainType?: string | null,
 *   verified?: boolean | null,
 *   productKey?: string,
 * }} opts
 */
async function listDomainsDirectoryPage(client, opts) {
  const limit = opts.limit;
  const offset = opts.offset;
  const hostnamePrefix = opts.hostnamePrefix || null;
  const orgKeyPrefix = opts.orgKeyPrefix || null;
  const status = opts.status || null;
  const domainType = opts.domainType || null;
  const verified = opts.verified == null ? null : Boolean(opts.verified);
  const productKey = opts.productKey || "blessboard";

  const r = await client.query(
    `SELECT
        d.hostname,
        d.domain_type,
        d.status,
        d.is_primary,
        d.deployment_id AS deployment_code,
        (d.verified_at IS NOT NULL) AS is_verified,
        p.product_key,
        p.display_name AS product_display_name,
        o.organization_key,
        o.display_name AS organization_display_name,
        o.status AS organization_status
       FROM platform.domains d
       INNER JOIN platform.products p
         ON p.id = d.product_id
       LEFT JOIN platform.organizations o
         ON o.id = d.organization_id
      WHERE p.product_key = $1
        AND ($2::text IS NULL OR d.hostname LIKE $2 || '%')
        AND ($3::text IS NULL OR o.organization_key LIKE $3 || '%')
        AND ($4::text IS NULL OR d.status = $4)
        AND ($5::text IS NULL OR d.domain_type = $5)
        AND (
          $6::boolean IS NULL
          OR ($6::boolean = TRUE AND d.verified_at IS NOT NULL)
          OR ($6::boolean = FALSE AND d.verified_at IS NULL)
        )
      ORDER BY
        CASE WHEN d.is_primary THEN 0 ELSE 1 END,
        CASE WHEN d.domain_type = 'canonical' THEN 0 ELSE 1 END,
        d.hostname ASC
      LIMIT $7 OFFSET $8`,
    [productKey, hostnamePrefix, orgKeyPrefix, status, domainType, verified, limit, offset]
  );
  return r.rows;
}

/**
 * @param {{ query: Function }} client
 * @param {{
 *   hostnamePrefix?: string | null,
 *   orgKeyPrefix?: string | null,
 *   status?: string | null,
 *   domainType?: string | null,
 *   verified?: boolean | null,
 *   productKey?: string,
 * }} opts
 */
async function countDomainsDirectory(client, opts) {
  const hostnamePrefix = opts.hostnamePrefix || null;
  const orgKeyPrefix = opts.orgKeyPrefix || null;
  const status = opts.status || null;
  const domainType = opts.domainType || null;
  const verified = opts.verified == null ? null : Boolean(opts.verified);
  const productKey = opts.productKey || "blessboard";
  const r = await client.query(
    `SELECT COUNT(*)::int AS total
       FROM platform.domains d
       INNER JOIN platform.products p
         ON p.id = d.product_id
       LEFT JOIN platform.organizations o
         ON o.id = d.organization_id
      WHERE p.product_key = $1
        AND ($2::text IS NULL OR d.hostname LIKE $2 || '%')
        AND ($3::text IS NULL OR o.organization_key LIKE $3 || '%')
        AND ($4::text IS NULL OR d.status = $4)
        AND ($5::text IS NULL OR d.domain_type = $5)
        AND (
          $6::boolean IS NULL
          OR ($6::boolean = TRUE AND d.verified_at IS NOT NULL)
          OR ($6::boolean = FALSE AND d.verified_at IS NULL)
        )`,
    [productKey, hostnamePrefix, orgKeyPrefix, status, domainType, verified]
  );
  return r.rows[0] ? Number(r.rows[0].total) : 0;
}

module.exports = {
  buildOrganizationDirectoryFilters,
  listOrganizationDirectoryPage,
  countOrganizationDirectory,
  countOrganizationDirectoryStats,
  countRegistrationOnboardingAnalytics,
  findOrganizationDirectoryByKey,
  listBranchesForOrganizationKey,
  listDomainsForOrganizationKey,
  listDeploymentsSafe,
  findDeploymentSafeByCode,
  listDomainsForDeploymentSafe,
  findProductSafeByKey,
  listSubscriptionsDirectoryPage,
  countSubscriptionsDirectory,
  listDomainsDirectoryPage,
  countDomainsDirectory,
};
