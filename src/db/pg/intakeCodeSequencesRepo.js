"use strict";

/**
 * Transactional next value for client/project public codes (matches SQLite intake_code_sequences).
 */
async function bumpAndReturnSeq(pool, tenantId, scope) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sel = await client.query(
      `SELECT next_seq FROM public.intake_code_sequences WHERE tenant_id = $1 AND scope = $2 FOR UPDATE`,
      [tenantId, scope]
    );
    let n;
    if (sel.rows.length === 0) {
      await client.query(
        `INSERT INTO public.intake_code_sequences (tenant_id, scope, next_seq) VALUES ($1, $2, 2)`,
        [tenantId, scope]
      );
      n = 1;
    } else {
      n = sel.rows[0].next_seq;
      await client.query(
        `UPDATE public.intake_code_sequences SET next_seq = next_seq + 1 WHERE tenant_id = $1 AND scope = $2`,
        [tenantId, scope]
      );
    }
    await client.query("COMMIT");
    return n;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { bumpAndReturnSeq };
