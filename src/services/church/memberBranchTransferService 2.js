"use strict";

/**
 * Cross-branch member transfer within one organisation.
 * Preserves member identity (same row id) and appends history + audit.
 */

const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");
const { organisationAllowsBranchPaths } = require("./branchPathRoutingService");
const { normalizeEmail, normalizePhone } = require("../../db/pg/church/membersRepo");

async function listMemberBranchHistory(pool, memberId) {
  const r = await pool.query(
    `SELECT h.*,
            fb.name AS from_branch_name,
            fb.slug AS from_branch_slug,
            tb.name AS to_branch_name,
            tb.slug AS to_branch_slug
     FROM public.church_member_branch_history h
     INNER JOIN public.church_branches fb ON fb.id = h.from_branch_id
     INNER JOIN public.church_branches tb ON tb.id = h.to_branch_id
     WHERE h.member_id = $1
     ORDER BY h.transferred_at DESC, h.id DESC`,
    [memberId]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {{
 *   memberId: number,
 *   fromBranchId: number,
 *   toBranchId: number,
 *   organizationId: number,
 *   organization: object,
 *   actorType?: string,
 *   actorId?: number | null,
 *   reason?: string | null,
 * }} opts
 */
async function transferMemberToBranch(pool, opts) {
  const memberId = Number(opts.memberId);
  const fromBranchId = Number(opts.fromBranchId);
  const toBranchId = Number(opts.toBranchId);
  const organizationId = Number(opts.organizationId);

  if (!Number.isFinite(memberId) || !Number.isFinite(fromBranchId) || !Number.isFinite(toBranchId)) {
    throw Object.assign(new Error("Invalid transfer target."), { code: "INVALID_TRANSFER" });
  }
  if (fromBranchId === toBranchId) {
    throw Object.assign(new Error("Member is already on that branch."), { code: "SAME_BRANCH" });
  }
  if (!organisationAllowsBranchPaths(opts.organization)) {
    throw Object.assign(new Error("Cross-branch transfer requires Growth."), {
      code: "PACKAGE_REQUIRED",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const memberRes = await client.query(
      `SELECT m.* FROM public.church_members m
       WHERE m.id = $1 AND m.branch_id = $2 AND m.organization_id = $3
       FOR UPDATE`,
      [memberId, fromBranchId, organizationId]
    );
    const member = memberRes.rows[0];
    if (!member) {
      throw Object.assign(new Error("Member not found on source branch."), { code: "NOT_FOUND" });
    }

    const toBranchRes = await client.query(
      `SELECT * FROM public.church_branches
       WHERE id = $1 AND organization_id = $2
       LIMIT 1`,
      [toBranchId, organizationId]
    );
    const targetBranch = toBranchRes.rows[0];
    if (!targetBranch) {
      throw Object.assign(new Error("Target branch not found in this organisation."), {
        code: "TARGET_NOT_FOUND",
      });
    }
    if (String(targetBranch.status) !== "active") {
      throw Object.assign(new Error("Target branch is not active."), { code: "TARGET_INACTIVE" });
    }

    // Per-branch uniqueness: block if another pending/verified member already uses email/phone.
    const email = normalizeEmail(member.email);
    const phoneNorm = normalizePhone(member.phone);
    if (email) {
      const clash = await client.query(
        `SELECT id FROM public.church_members
         WHERE branch_id = $1
           AND status IN ('pending', 'verified')
           AND lower(trim(email)) = $2
           AND id <> $3
         LIMIT 1`,
        [toBranchId, email, memberId]
      );
      if (clash.rows[0]) {
        throw Object.assign(new Error("A member with this email already exists on the target branch."), {
          code: "DUPLICATE_EMAIL",
        });
      }
    }
    if (phoneNorm) {
      const clash = await client.query(
        `SELECT id FROM public.church_members
         WHERE branch_id = $1
           AND status IN ('pending', 'verified')
           AND phone_normalized = $2
           AND id <> $3
         LIMIT 1`,
        [toBranchId, phoneNorm, memberId]
      );
      if (clash.rows[0]) {
        throw Object.assign(new Error("A member with this phone already exists on the target branch."), {
          code: "DUPLICATE_PHONE",
        });
      }
    }

    const previousStatus = member.status;
    await client.query(
      `UPDATE public.church_members
       SET branch_id = $1, security_version = security_version + 1, updated_at = now()
       WHERE id = $2 AND branch_id = $3`,
      [toBranchId, memberId, fromBranchId]
    );

    const history = await client.query(
      `INSERT INTO public.church_member_branch_history (
         organization_id, member_id, from_branch_id, to_branch_id,
         transferred_by_actor_type, transferred_by_actor_id, reason, previous_status, metadata_json
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       RETURNING *`,
      [
        organizationId,
        memberId,
        fromBranchId,
        toBranchId,
        opts.actorType || "branch_admin",
        opts.actorId || null,
        opts.reason ? String(opts.reason).trim().slice(0, 2000) : null,
        previousStatus,
        JSON.stringify({
          member_email: email || null,
          member_full_name: member.full_name || null,
        }),
      ]
    );

    await auditLogsRepo.insertAuditLog(client, {
      organization_id: organizationId,
      branch_id: toBranchId,
      actor_type: opts.actorType || "branch_admin",
      actor_id: opts.actorId || null,
      action: "member_transferred_branch",
      entity_type: "church_member",
      entity_id: memberId,
      target_label: member.full_name || null,
      metadata_json: {
        from_branch_id: fromBranchId,
        to_branch_id: toBranchId,
        previous_status: previousStatus,
        history_id: history.rows[0].id,
        reason: opts.reason || null,
        security_version_bumped: true,
      },
    });

    await client.query("COMMIT");
    return {
      member: { ...member, branch_id: toBranchId },
      history: history.rows[0],
      fromBranchId,
      toBranchId,
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  transferMemberToBranch,
  listMemberBranchHistory,
};
