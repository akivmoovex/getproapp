"use strict";

/**
 * Growth scheduled HQ broadcast workflow.
 * Channels: in_app + recorded email (no WhatsApp/SMS/new provider).
 * Foundation: immediate in-app publish only (no scheduled external broadcast).
 */

const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");
const hqBroadcastsRepo = require("../../db/pg/church/hqBroadcastsRepo");
const organizationsRepo = require("../../db/pg/church/organizationsRepo");
const {
  safeBroadcastEmailSubject,
  broadcastStatusLabel,
} = require("../../church/hqBroadcastValidation");
const { hasEntitlement, getOrganisationPlan } = require("./churchEntitlementService");
const churchPackageUsageService = require("./churchPackageUsageService");

const WORKFLOW_STATUSES = Object.freeze([
  "draft",
  "preview",
  "audience_estimate",
  "approval",
  "scheduled",
  "processing",
  "published",
  "partially_failed",
  "failed",
  "cancelled",
]);

function jobKeyForBroadcast(broadcastId, publishAt) {
  const when = publishAt instanceof Date ? publishAt : new Date(publishAt || Date.now());
  return `sched_broadcast:${broadcastId}:${when.toISOString()}`;
}

function parseChannels(broadcast) {
  const raw = broadcast && broadcast.delivery_channels;
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      /* ignore */
    }
  }
  return ["in_app"];
}

async function assertCanScheduleExternalBroadcast(pool, organizationId) {
  const plan = await getOrganisationPlan(pool, organizationId);
  if (!plan) {
    const err = new Error("Organisation not found.");
    err.code = "ORG_NOT_FOUND";
    throw err;
  }
  if (!hasEntitlement(plan, "broadcasts.scheduled")) {
    const err = new Error(
      "Scheduled external broadcasts require Growth. Foundation may publish in-app announcements immediately only."
    );
    err.code = "FOUNDATION_SCHEDULE_FORBIDDEN";
    throw err;
  }
  const churchPilotFeatureFlagService = require("./churchPilotFeatureFlagService");
  await churchPilotFeatureFlagService.assertPilotFeatureAvailable(pool, {
    organizationId,
    flagKey: "broadcasts_scheduled",
    plan,
  });
  return plan;
}

/**
 * Resolve authorised recipients at send time (tenant-scoped, consent-aware).
 * @returns {Promise<Array<{recipient_type:string,recipient_id:number,email:string|null,consent:boolean,branch_id:number|null}>>}
 */
async function resolveAudienceRecipients(pool, organizationId, broadcast) {
  const audience = String(broadcast.audience || "members");
  const recipients = [];

  if (audience === "selected_recipients") {
    const rows = await pool.query(
      `SELECT recipient_type, recipient_id
       FROM public.church_hq_broadcast_selected_recipients
       WHERE broadcast_id = $1 AND organization_id = $2`,
      [broadcast.id, organizationId]
    );
    for (const row of rows.rows) {
      const resolved = await resolveOneRecipient(pool, organizationId, row.recipient_type, row.recipient_id);
      if (resolved) recipients.push(resolved);
    }
    return dedupeRecipients(recipients);
  }

  if (audience === "ministry") {
    const r = await pool.query(
      `SELECT DISTINCT m.id AS recipient_id, m.email, m.communication_consent, m.branch_id
       FROM public.church_hq_broadcast_ministry_targets t
       INNER JOIN public.church_member_ministries mm
         ON mm.ministry_id = t.ministry_id AND mm.organization_id = t.organization_id
       INNER JOIN public.church_members m ON m.id = mm.member_id AND m.organization_id = t.organization_id
       WHERE t.broadcast_id = $1 AND t.organization_id = $2
         AND mm.status = 'active' AND m.status = 'verified'`,
      [broadcast.id, organizationId]
    );
    for (const row of r.rows) {
      recipients.push({
        recipient_type: "member",
        recipient_id: row.recipient_id,
        email: row.email || null,
        consent: row.communication_consent !== false,
        branch_id: row.branch_id,
      });
    }
    return dedupeRecipients(recipients);
  }

  if (audience === "department") {
    const r = await pool.query(
      `SELECT DISTINCT m.id AS recipient_id, m.email, m.communication_consent, m.branch_id
       FROM public.church_hq_broadcast_department_targets t
       INNER JOIN public.church_departments d ON d.id = t.department_id AND d.organization_id = t.organization_id
       INNER JOIN public.church_members m ON m.branch_id = d.branch_id AND m.organization_id = t.organization_id
       WHERE t.broadcast_id = $1 AND t.organization_id = $2 AND m.status = 'verified'`,
      [broadcast.id, organizationId]
    );
    for (const row of r.rows) {
      recipients.push({
        recipient_type: "member",
        recipient_id: row.recipient_id,
        email: row.email || null,
        consent: row.communication_consent !== false,
        branch_id: row.branch_id,
      });
    }
    return dedupeRecipients(recipients);
  }

  if (audience === "event") {
    const r = await pool.query(
      `SELECT DISTINCT m.id AS recipient_id, m.email, m.communication_consent, m.branch_id
       FROM public.church_hq_broadcast_event_targets t
       INNER JOIN public.church_events e ON e.id = t.event_id AND e.organization_id = t.organization_id
       INNER JOIN public.church_members m ON m.branch_id = e.branch_id AND m.organization_id = t.organization_id
       WHERE t.broadcast_id = $1 AND t.organization_id = $2 AND m.status = 'verified'`,
      [broadcast.id, organizationId]
    );
    for (const row of r.rows) {
      recipients.push({
        recipient_type: "member",
        recipient_id: row.recipient_id,
        email: row.email || null,
        consent: row.communication_consent !== false,
        branch_id: row.branch_id,
      });
    }
    return dedupeRecipients(recipients);
  }

  const branchIds = await hqBroadcastsRepo.resolveBroadcastTargetBranchIds(pool, organizationId, broadcast);

  if (audience === "public") {
    // Public sites: in-app visibility only (no email fan-out).
    return branchIds.map((branch_id) => ({
      recipient_type: "public_branch",
      recipient_id: branch_id,
      email: null,
      consent: true,
      branch_id,
    }));
  }

  if (audience === "branch_admins") {
    if (!branchIds.length) return [];
    const r = await pool.query(
      `SELECT id, email, communication_consent, branch_id
       FROM public.church_branch_admins
       WHERE organization_id = $1 AND branch_id = ANY($2::bigint[]) AND status = 'active'`,
      [organizationId, branchIds]
    );
    return r.rows.map((row) => ({
      recipient_type: "branch_admin",
      recipient_id: row.id,
      email: row.email || null,
      consent: row.communication_consent !== false,
      branch_id: row.branch_id,
    }));
  }

  if (audience === "leaders") {
    if (!branchIds.length) return [];
    const r = await pool.query(
      `SELECT id, email, communication_consent, branch_id
       FROM public.church_ministry_leaders
       WHERE organization_id = $1 AND branch_id = ANY($2::bigint[]) AND status = 'active'`,
      [organizationId, branchIds]
    );
    return r.rows.map((row) => ({
      recipient_type: "leader",
      recipient_id: row.id,
      email: row.email || null,
      consent: row.communication_consent !== false,
      branch_id: row.branch_id,
    }));
  }

  // members / all_logged_in
  if (!branchIds.length) return [];
  const r = await pool.query(
    `SELECT id, email, communication_consent, branch_id
     FROM public.church_members
     WHERE organization_id = $1 AND branch_id = ANY($2::bigint[]) AND status = 'verified'`,
    [organizationId, branchIds]
  );
  return r.rows.map((row) => ({
    recipient_type: "member",
    recipient_id: row.id,
    email: row.email || null,
    consent: row.communication_consent !== false,
    branch_id: row.branch_id,
  }));
}

async function resolveOneRecipient(pool, organizationId, recipientType, recipientId) {
  if (recipientType === "member") {
    const r = await pool.query(
      `SELECT id, email, communication_consent, branch_id, status
       FROM public.church_members WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [recipientId, organizationId]
    );
    const row = r.rows[0];
    if (!row || row.status !== "verified") return null;
    return {
      recipient_type: "member",
      recipient_id: row.id,
      email: row.email || null,
      consent: row.communication_consent !== false,
      branch_id: row.branch_id,
    };
  }
  if (recipientType === "branch_admin") {
    const r = await pool.query(
      `SELECT id, email, communication_consent, branch_id, status
       FROM public.church_branch_admins WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [recipientId, organizationId]
    );
    const row = r.rows[0];
    if (!row || row.status !== "active") return null;
    return {
      recipient_type: "branch_admin",
      recipient_id: row.id,
      email: row.email || null,
      consent: row.communication_consent !== false,
      branch_id: row.branch_id,
    };
  }
  if (recipientType === "hq_admin") {
    const r = await pool.query(
      `SELECT id, email, communication_consent, status
       FROM public.church_hq_admins WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [recipientId, organizationId]
    );
    const row = r.rows[0];
    if (!row || row.status !== "active") return null;
    return {
      recipient_type: "hq_admin",
      recipient_id: row.id,
      email: row.email || null,
      consent: row.communication_consent !== false,
      branch_id: null,
    };
  }
  if (recipientType === "leader") {
    const r = await pool.query(
      `SELECT id, email, communication_consent, branch_id, status
       FROM public.church_ministry_leaders WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [recipientId, organizationId]
    );
    const row = r.rows[0];
    if (!row || row.status !== "active") return null;
    return {
      recipient_type: "leader",
      recipient_id: row.id,
      email: row.email || null,
      consent: row.communication_consent !== false,
      branch_id: row.branch_id,
    };
  }
  return null;
}

function dedupeRecipients(list) {
  const seen = new Set();
  const out = [];
  for (const r of list) {
    const key = `${r.recipient_type}:${r.recipient_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

async function setWorkflowStatus(pool, broadcastId, organizationId, status, extra = {}) {
  const r = await pool.query(
    `UPDATE public.church_hq_broadcasts
     SET status = $3,
         audience_estimate_json = COALESCE($4::jsonb, audience_estimate_json),
         approved_at = COALESCE($5, approved_at),
         approved_by_hq_admin_id = COALESCE($6, approved_by_hq_admin_id),
         cancelled_at = COALESCE($7, cancelled_at),
         job_key = COALESCE($8, job_key),
         last_error = $9,
         delivery_channels = COALESCE($10::jsonb, delivery_channels),
         updated_at = now()
     WHERE id = $1 AND organization_id = $2
     RETURNING *`,
    [
      broadcastId,
      organizationId,
      status,
      extra.audience_estimate_json ? JSON.stringify(extra.audience_estimate_json) : null,
      extra.approved_at || null,
      extra.approved_by_hq_admin_id || null,
      extra.cancelled_at || null,
      extra.job_key || null,
      extra.last_error != null ? String(extra.last_error).slice(0, 1000) : null,
      extra.delivery_channels ? JSON.stringify(extra.delivery_channels) : null,
    ]
  );
  return r.rows[0] || null;
}

async function moveToPreview(pool, broadcastId, organizationId) {
  const broadcast = await hqBroadcastsRepo.findBroadcastByIdForOrganization(pool, broadcastId, organizationId);
  if (!broadcast || !["draft", "preview"].includes(broadcast.status)) {
    const err = new Error("Broadcast must be a draft to open preview.");
    err.code = "INVALID_STATUS";
    throw err;
  }
  return setWorkflowStatus(pool, broadcastId, organizationId, "preview");
}

async function computeAndStoreAudienceEstimate(pool, broadcastId, organizationId) {
  const broadcast = await hqBroadcastsRepo.findBroadcastByIdForOrganization(pool, broadcastId, organizationId);
  if (!broadcast || !["draft", "preview", "audience_estimate", "approval"].includes(broadcast.status)) {
    const err = new Error("Broadcast is not ready for audience estimate.");
    err.code = "INVALID_STATUS";
    throw err;
  }
  const estimate = await hqBroadcastsRepo.estimateBroadcastAudience(pool, organizationId, broadcast);
  return setWorkflowStatus(pool, broadcastId, organizationId, "audience_estimate", {
    audience_estimate_json: { ...estimate, computed_at: new Date().toISOString() },
  });
}

async function submitForApproval(pool, broadcastId, organizationId) {
  let broadcast = await hqBroadcastsRepo.findBroadcastByIdForOrganization(pool, broadcastId, organizationId);
  if (!broadcast) {
    const err = new Error("Broadcast not found.");
    err.code = "NOT_FOUND";
    throw err;
  }
  if (!broadcast.audience_estimate_json) {
    broadcast = await computeAndStoreAudienceEstimate(pool, broadcastId, organizationId);
  }
  return setWorkflowStatus(pool, broadcastId, organizationId, "approval");
}

/**
 * Approve publish confirmation.
 * Growth + future publish_at → scheduled (may include email).
 * Immediate → process now (in_app; email only when Growth + email channel).
 */
async function approveBroadcast(pool, opts) {
  const {
    broadcastId,
    organizationId,
    hqAdminId,
    at = new Date(),
    forceSchedule = null,
  } = opts;
  const broadcast = await hqBroadcastsRepo.findBroadcastByIdForOrganization(pool, broadcastId, organizationId);
  if (!broadcast) {
    const err = new Error("Broadcast not found.");
    err.code = "NOT_FOUND";
    throw err;
  }
  if (!["draft", "preview", "audience_estimate", "approval"].includes(broadcast.status)) {
    const err = new Error("Broadcast cannot be approved from its current status.");
    err.code = "INVALID_STATUS";
    throw err;
  }

  const publishAt = broadcast.publish_at ? new Date(broadcast.publish_at) : at;
  const isFuture = publishAt.getTime() > at.getTime() + 2 * 60 * 1000;
  const schedule = forceSchedule != null ? Boolean(forceSchedule) : isFuture;

  let channels = parseChannels(broadcast);
  if (schedule || channels.includes("email")) {
    await assertCanScheduleExternalBroadcast(pool, organizationId);
    if (!channels.includes("email") && schedule) {
      channels = ["in_app", "email"];
    }
  } else {
    // Foundation / immediate: in-app only
    channels = ["in_app"];
  }

  if (!broadcast.audience_estimate_json) {
    const estimate = await hqBroadcastsRepo.estimateBroadcastAudience(pool, organizationId, broadcast);
    await setWorkflowStatus(pool, broadcastId, organizationId, broadcast.status, {
      audience_estimate_json: { ...estimate, computed_at: new Date().toISOString() },
    });
  }

  await auditLogsRepo.insertAuditLog(pool, {
    organization_id: organizationId,
    branch_id: null,
    actor_type: "hq_admin",
    actor_id: hqAdminId || null,
    action: "hq_broadcast_approved",
    entity_type: "hq_broadcast",
    entity_id: broadcastId,
    target_label: broadcast.title,
    metadata_json: {
      publish_at: publishAt.toISOString(),
      schedule,
      channels,
      estimate: broadcast.audience_estimate_json || null,
    },
  });

  if (schedule) {
    const jobKey = jobKeyForBroadcast(broadcastId, publishAt);
    const scheduled = await setWorkflowStatus(pool, broadcastId, organizationId, "scheduled", {
      approved_at: at,
      approved_by_hq_admin_id: hqAdminId || null,
      job_key: jobKey,
      delivery_channels: channels,
      last_error: null,
    });
    await pool.query(
      `UPDATE public.church_hq_broadcasts SET publish_at = $2 WHERE id = $1 AND organization_id = $3`,
      [broadcastId, publishAt.toISOString(), organizationId]
    );
    return { outcome: "scheduled", broadcast: scheduled || broadcast };
  }

  await setWorkflowStatus(pool, broadcastId, organizationId, "approval", {
    approved_at: at,
    approved_by_hq_admin_id: hqAdminId || null,
    delivery_channels: channels,
  });
  const result = await processBroadcastDelivery(pool, broadcastId, organizationId, { at });
  return { outcome: result.outcome, broadcast: result.broadcast, ...result };
}

async function cancelScheduledBroadcast(pool, broadcastId, organizationId, hqAdminId) {
  const broadcast = await hqBroadcastsRepo.findBroadcastByIdForOrganization(pool, broadcastId, organizationId);
  if (!broadcast) {
    const err = new Error("Broadcast not found.");
    err.code = "NOT_FOUND";
    throw err;
  }
  if (!["scheduled", "approval", "preview", "audience_estimate"].includes(broadcast.status)) {
    const err = new Error("Only scheduled or awaiting-approval broadcasts can be cancelled.");
    err.code = "INVALID_STATUS";
    throw err;
  }
  const cancelled = await setWorkflowStatus(pool, broadcastId, organizationId, "cancelled", {
    cancelled_at: new Date(),
    last_error: null,
  });
  await auditLogsRepo.insertAuditLog(pool, {
    organization_id: organizationId,
    branch_id: null,
    actor_type: "hq_admin",
    actor_id: hqAdminId || null,
    action: "hq_broadcast_cancelled",
    entity_type: "hq_broadcast",
    entity_id: broadcastId,
    target_label: broadcast.title,
    metadata_json: { previous_status: broadcast.status },
  });
  return cancelled;
}

async function insertDelivery(pool, row) {
  try {
    const r = await pool.query(
      `INSERT INTO public.church_hq_broadcast_deliveries (
         organization_id, broadcast_id, channel, recipient_type, recipient_id,
         recipient_email, status, idempotency_key, error_message, delivered_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING *`,
      [
        row.organization_id,
        row.broadcast_id,
        row.channel,
        row.recipient_type,
        row.recipient_id,
        row.recipient_email || null,
        row.status,
        row.idempotency_key,
        row.error_message || null,
        row.status === "delivered" ? new Date().toISOString() : null,
      ]
    );
    return r.rows[0] || null;
  } catch (err) {
    if (err && err.code === "23505") return null;
    throw err;
  }
}

/**
 * Process a broadcast to in_app (+ optional recorded email). Idempotent via delivery keys + job_key.
 */
async function processBroadcastDelivery(pool, broadcastId, organizationId, opts = {}) {
  const at = opts.at instanceof Date ? opts.at : new Date();
  const broadcast = await hqBroadcastsRepo.findBroadcastByIdForOrganization(pool, broadcastId, organizationId);
  if (!broadcast) {
    return { outcome: "not_found" };
  }

  // Claim processing (prevent duplicate concurrent jobs).
  if (broadcast.status === "scheduled" || broadcast.status === "approval" || broadcast.status === "partially_failed" || broadcast.status === "failed") {
    const claim = await pool.query(
      `UPDATE public.church_hq_broadcasts
       SET status = 'processing', updated_at = now(), last_error = NULL
       WHERE id = $1 AND organization_id = $2
         AND status IN ('scheduled', 'approval', 'partially_failed', 'failed')
       RETURNING *`,
      [broadcastId, organizationId]
    );
    if (!claim.rows[0] && broadcast.status !== "processing") {
      return { outcome: "duplicate_job", broadcast };
    }
  } else if (broadcast.status === "processing" && !opts.retry) {
    return { outcome: "duplicate_job", broadcast };
  } else if (broadcast.status === "published") {
    return { outcome: "duplicate_job", broadcast };
  }

  // Re-check schedule entitlement if email channel present.
  const channels = parseChannels(broadcast);
  if (channels.includes("email")) {
    try {
      await assertCanScheduleExternalBroadcast(pool, organizationId);
    } catch (err) {
      if (err && err.code === "FOUNDATION_SCHEDULE_FORBIDDEN") {
        // Downgrade to in-app only
        channels.splice(0, channels.length, "in_app");
        await pool.query(
          `UPDATE public.church_hq_broadcasts SET delivery_channels = $2::jsonb WHERE id = $1`,
          [broadcastId, JSON.stringify(channels)]
        );
      } else {
        throw err;
      }
    }
  }

  const recipients = await resolveAudienceRecipients(pool, organizationId, broadcast);
  const org = await organizationsRepo.findOrganizationById(pool, organizationId);
  const emailSubject = safeBroadcastEmailSubject(org && org.name, broadcast.category);

  let delivered = 0;
  let failed = 0;
  let skipped = 0;

  for (const rec of recipients) {
    // Re-evaluate authorisation at send time
    const stillAuth =
      rec.recipient_type === "public_branch"
        ? rec
        : await resolveOneRecipient(pool, organizationId, rec.recipient_type, rec.recipient_id);
    if (!stillAuth) {
      for (const channel of channels) {
        const inserted = await insertDelivery(pool, {
          organization_id: organizationId,
          broadcast_id: broadcastId,
          channel,
          recipient_type: rec.recipient_type,
          recipient_id: rec.recipient_id,
          status: "skipped_unauthorised",
          idempotency_key: `bcast:${broadcastId}:${channel}:${rec.recipient_type}:${rec.recipient_id}`,
          error_message: "Permission removed or recipient deleted before send.",
        });
        if (inserted) skipped += 1;
      }
      continue;
    }

    if (channels.includes("in_app")) {
      const key = `bcast:${broadcastId}:in_app:${stillAuth.recipient_type}:${stillAuth.recipient_id}`;
      const inserted = await insertDelivery(pool, {
        organization_id: organizationId,
        broadcast_id: broadcastId,
        channel: "in_app",
        recipient_type: stillAuth.recipient_type,
        recipient_id: stillAuth.recipient_id,
        recipient_email: stillAuth.email,
        status: "delivered",
        idempotency_key: key,
      });
      if (inserted) delivered += 1;
    }

    if (channels.includes("email")) {
      const key = `bcast:${broadcastId}:email:${stillAuth.recipient_type}:${stillAuth.recipient_id}`;
      if (!stillAuth.consent) {
        const inserted = await insertDelivery(pool, {
          organization_id: organizationId,
          broadcast_id: broadcastId,
          channel: "email",
          recipient_type: stillAuth.recipient_type,
          recipient_id: stillAuth.recipient_id,
          recipient_email: stillAuth.email,
          status: "skipped_consent",
          idempotency_key: key,
          error_message: "Communication consent not granted.",
        });
        if (inserted) skipped += 1;
        continue;
      }
      if (!stillAuth.email) {
        const inserted = await insertDelivery(pool, {
          organization_id: organizationId,
          broadcast_id: broadcastId,
          channel: "email",
          recipient_type: stillAuth.recipient_type,
          recipient_id: stillAuth.recipient_id,
          status: "skipped_unauthorised",
          idempotency_key: key,
          error_message: "No email address.",
        });
        if (inserted) skipped += 1;
        continue;
      }

      try {
        await churchPackageUsageService.recordExternalEmailSend(pool, {
          organizationId,
          category: "hq_broadcast",
          count: 1,
          at,
          actorType: "system",
          actorId: null,
        });
        const inserted = await insertDelivery(pool, {
          organization_id: organizationId,
          broadcast_id: broadcastId,
          channel: "email",
          recipient_type: stillAuth.recipient_type,
          recipient_id: stillAuth.recipient_id,
          recipient_email: stillAuth.email,
          status: "delivered",
          idempotency_key: key,
        });
        if (inserted) {
          delivered += 1;
          // Subject stored only as non-confidential metadata via audit aggregate, not per row
          void emailSubject;
        }
      } catch (err) {
        if (err && err.code === "PACKAGE_EXTERNAL_EMAIL_LIMIT") {
          const inserted = await insertDelivery(pool, {
            organization_id: organizationId,
            broadcast_id: broadcastId,
            channel: "email",
            recipient_type: stillAuth.recipient_type,
            recipient_id: stillAuth.recipient_id,
            recipient_email: stillAuth.email,
            status: "skipped_quota",
            idempotency_key: key,
            error_message: err.message,
          });
          if (inserted) skipped += 1;
        } else {
          const inserted = await insertDelivery(pool, {
            organization_id: organizationId,
            broadcast_id: broadcastId,
            channel: "email",
            recipient_type: stillAuth.recipient_type,
            recipient_id: stillAuth.recipient_id,
            recipient_email: stillAuth.email,
            status: "failed",
            idempotency_key: key,
            error_message: String(err.message || "email failed").slice(0, 500),
          });
          if (inserted) failed += 1;
          else failed += 1;
        }
      }
    }
  }

  let finalStatus = "published";
  if (failed > 0 && delivered === 0) finalStatus = "failed";
  else if (failed > 0 || (skipped > 0 && channels.includes("email") && delivered === 0 && failed === 0 && recipients.length)) {
    // partial: some email/in_app delivered, some failed
    if (failed > 0 && delivered > 0) finalStatus = "partially_failed";
    else if (failed > 0) finalStatus = "failed";
    else finalStatus = "published";
  }

  // Force partial when mix of delivered and failed
  if (delivered > 0 && failed > 0) finalStatus = "partially_failed";
  if (delivered === 0 && failed === 0 && recipients.length === 0) finalStatus = "published";

  const updated = await pool.query(
    `UPDATE public.church_hq_broadcasts
     SET status = $3,
         publish_at = COALESCE(publish_at, $4),
         last_error = $5,
         updated_at = now()
     WHERE id = $1 AND organization_id = $2
     RETURNING *`,
    [
      broadcastId,
      organizationId,
      finalStatus,
      at.toISOString(),
      failed ? `${failed} delivery failure(s)` : null,
    ]
  );

  await auditLogsRepo.insertAuditLog(pool, {
    organization_id: organizationId,
    branch_id: null,
    actor_type: "system",
    actor_id: null,
    action: "hq_broadcast_delivery_completed",
    entity_type: "hq_broadcast",
    entity_id: broadcastId,
    target_label: broadcast.title,
    metadata_json: {
      outcome: finalStatus,
      delivered,
      failed,
      skipped,
      channels,
      email_subject: emailSubject,
    },
  });

  return {
    outcome: finalStatus,
    broadcast: updated.rows[0],
    delivered,
    failed,
    skipped,
    emailSubject,
  };
}

/**
 * Retry failed email deliveries only; never duplicate successful idempotency keys.
 */
async function retryFailedDeliveries(pool, broadcastId, organizationId) {
  const broadcast = await hqBroadcastsRepo.findBroadcastByIdForOrganization(pool, broadcastId, organizationId);
  if (!broadcast) {
    const err = new Error("Broadcast not found.");
    err.code = "NOT_FOUND";
    throw err;
  }
  if (!["partially_failed", "failed"].includes(broadcast.status)) {
    const err = new Error("Only failed or partially failed broadcasts can be retried.");
    err.code = "INVALID_STATUS";
    throw err;
  }

  const failed = await pool.query(
    `SELECT * FROM public.church_hq_broadcast_deliveries
     WHERE broadcast_id = $1 AND organization_id = $2 AND status = 'failed'`,
    [broadcastId, organizationId]
  );

  let delivered = 0;
  let stillFailed = 0;
  const at = new Date();
  for (const row of failed.rows) {
    const stillAuth = await resolveOneRecipient(pool, organizationId, row.recipient_type, row.recipient_id);
    if (!stillAuth || !stillAuth.consent || !stillAuth.email) {
      await pool.query(
        `UPDATE public.church_hq_broadcast_deliveries
         SET status = 'skipped_unauthorised',
             error_message = 'Recipient no longer authorised or consented.',
             delivered_at = NULL
         WHERE id = $1`,
        [row.id]
      );
      continue;
    }
    try {
      await churchPackageUsageService.recordExternalEmailSend(pool, {
        organizationId,
        category: "hq_broadcast",
        count: 1,
        at,
      });
      await pool.query(
        `UPDATE public.church_hq_broadcast_deliveries
         SET status = 'delivered',
             recipient_email = $2,
             error_message = NULL,
             delivered_at = now()
         WHERE id = $1 AND status = 'failed'`,
        [row.id, stillAuth.email]
      );
      delivered += 1;
    } catch (err) {
      stillFailed += 1;
      await pool.query(
        `UPDATE public.church_hq_broadcast_deliveries
         SET error_message = $2
         WHERE id = $1`,
        [row.id, String(err.message || "retry failed").slice(0, 500)]
      );
    }
  }

  // Remaining failed?
  const rem = await pool.query(
    `SELECT COUNT(*)::int AS c FROM public.church_hq_broadcast_deliveries
     WHERE broadcast_id = $1 AND organization_id = $2 AND status = 'failed'`,
    [broadcastId, organizationId]
  );
  const remaining = rem.rows[0] ? rem.rows[0].c : 0;
  const finalStatus = remaining > 0 ? (delivered > 0 ? "partially_failed" : "failed") : "published";
  await pool.query(
    `UPDATE public.church_hq_broadcasts SET status = $3, last_error = $4, updated_at = now()
     WHERE id = $1 AND organization_id = $2`,
    [broadcastId, organizationId, finalStatus, remaining ? `${remaining} remaining failure(s)` : null]
  );

  await auditLogsRepo.insertAuditLog(pool, {
    organization_id: organizationId,
    branch_id: null,
    actor_type: "system",
    actor_id: null,
    action: "hq_broadcast_delivery_retried",
    entity_type: "hq_broadcast",
    entity_id: broadcastId,
    target_label: broadcast.title,
    metadata_json: { delivered, stillFailed, remaining, finalStatus },
  });

  return { outcome: finalStatus, delivered, stillFailed, remaining };
}

async function processDueScheduledBroadcasts(pool, opts = {}) {
  const at = opts.at instanceof Date ? opts.at : new Date();
  const limit = Math.min(Math.max(Number(opts.limit) || 25, 1), 100);
  const due = await pool.query(
    `SELECT id, organization_id FROM public.church_hq_broadcasts
     WHERE status = 'scheduled'
       AND publish_at IS NOT NULL
       AND publish_at <= $1
     ORDER BY publish_at ASC, id ASC
     LIMIT $2`,
    [at.toISOString(), limit]
  );
  const processed = [];
  for (const row of due.rows) {
    try {
      const churchPilotFeatureFlagService = require("./churchPilotFeatureFlagService");
      await churchPilotFeatureFlagService.assertPilotFeatureAvailable(pool, {
        organizationId: row.organization_id,
        flagKey: "broadcasts_scheduled",
        at,
      });
    } catch (err) {
      processed.push({
        broadcastId: row.id,
        organizationId: row.organization_id,
        outcome: "skipped_pilot_flag",
        error: err && err.message,
      });
      continue;
    }
    const result = await processBroadcastDelivery(pool, row.id, row.organization_id, { at });
    processed.push({
      broadcastId: row.id,
      organizationId: row.organization_id,
      ...result,
    });
  }
  return { at: at.toISOString(), processed, count: processed.length };
}

async function listScheduledBroadcasts(pool, organizationId) {
  const r = await pool.query(
    `SELECT * FROM public.church_hq_broadcasts
     WHERE organization_id = $1
       AND status IN ('scheduled', 'processing', 'approval', 'audience_estimate', 'preview', 'partially_failed', 'failed', 'cancelled')
     ORDER BY COALESCE(publish_at, updated_at) DESC, id DESC
     LIMIT 100`,
    [organizationId]
  );
  return r.rows;
}

async function listDeliveries(pool, broadcastId, organizationId, opts = {}) {
  const page = Math.max(Number(opts.page) || 1, 1);
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 100);
  const offset = (page - 1) * limit;
  const [rows, countR] = await Promise.all([
    pool.query(
      `SELECT * FROM public.church_hq_broadcast_deliveries
       WHERE broadcast_id = $1 AND organization_id = $2
       ORDER BY id ASC
       LIMIT $3 OFFSET $4`,
      [broadcastId, organizationId, limit, offset]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS n FROM public.church_hq_broadcast_deliveries
       WHERE broadcast_id = $1 AND organization_id = $2`,
      [broadcastId, organizationId]
    ),
  ]);
  const total = Number(countR.rows[0] && countR.rows[0].n) || 0;
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  return {
    rows: rows.rows,
    page,
    limit,
    total,
    totalPages,
    hasMore: page < totalPages,
  };
}

module.exports = {
  WORKFLOW_STATUSES,
  jobKeyForBroadcast,
  assertCanScheduleExternalBroadcast,
  resolveAudienceRecipients,
  moveToPreview,
  computeAndStoreAudienceEstimate,
  submitForApproval,
  approveBroadcast,
  cancelScheduledBroadcast,
  processBroadcastDelivery,
  retryFailedDeliveries,
  processDueScheduledBroadcasts,
  listScheduledBroadcasts,
  listDeliveries,
  safeBroadcastEmailSubject,
  broadcastStatusLabel,
  parseChannels,
};
