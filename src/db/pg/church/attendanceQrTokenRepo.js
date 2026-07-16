"use strict";

const crypto = require("crypto");

function generateOpaqueToken() {
  return crypto.randomBytes(24).toString("base64url");
}

/**
 * @param {import("pg").Pool} pool
 * @param {{ organization_id: number, branch_id: number, member_id: number }} fields
 * @returns {Promise<{ token: string, id: number }>}
 */
async function ensureActiveQrTokenForMember(pool, fields) {
  const existing = await pool.query(
    `SELECT id, token
     FROM public.church_member_attendance_qr_tokens
     WHERE branch_id = $1 AND member_id = $2 AND revoked_at IS NULL
     LIMIT 1`,
    [fields.branch_id, fields.member_id]
  );
  if (existing.rows[0]) {
    return { id: existing.rows[0].id, token: existing.rows[0].token };
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = generateOpaqueToken();
    try {
      const r = await pool.query(
        `INSERT INTO public.church_member_attendance_qr_tokens (
           organization_id, branch_id, member_id, token
         ) VALUES ($1, $2, $3, $4)
         RETURNING id, token`,
        [fields.organization_id, fields.branch_id, fields.member_id, token]
      );
      return r.rows[0];
    } catch (err) {
      if (err && err.code === "23505") continue;
      throw err;
    }
  }
  throw new Error("Could not issue attendance QR token.");
}

/**
 * @param {import("pg").Pool} pool
 * @param {string} token
 * @returns {Promise<object | null>}
 */
async function findActiveQrTokenByToken(pool, token) {
  const r = await pool.query(
    `SELECT t.*, m.full_name, m.status AS member_status
     FROM public.church_member_attendance_qr_tokens t
     JOIN public.church_members m ON m.id = t.member_id
     WHERE t.token = $1 AND t.revoked_at IS NULL
     LIMIT 1`,
    [String(token || "").trim()]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} memberId
 * @param {number} branchId
 * @returns {Promise<object | null>}
 */
async function findActiveQrTokenForMemberBranch(pool, memberId, branchId) {
  const r = await pool.query(
    `SELECT id, token, issued_at
     FROM public.church_member_attendance_qr_tokens
     WHERE member_id = $1 AND branch_id = $2 AND revoked_at IS NULL
     LIMIT 1`,
    [memberId, branchId]
  );
  return r.rows[0] ?? null;
}

module.exports = {
  generateOpaqueToken,
  ensureActiveQrTokenForMember,
  findActiveQrTokenByToken,
  findActiveQrTokenForMemberBranch,
};
