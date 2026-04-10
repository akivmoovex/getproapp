"use strict";

async function insertCallbackLead(pool, client, row) {
  const q = client || pool;
  const r = await q.query(
    `
    INSERT INTO public.field_agent_callback_leads (
      tenant_id, field_agent_id, first_name, last_name, phone, email, location_city
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id
    `,
    [
      row.tenantId,
      row.fieldAgentId,
      row.firstName,
      row.lastName,
      row.phone,
      row.email,
      row.locationCity,
    ]
  );
  return Number(r.rows[0].id);
}

module.exports = { insertCallbackLead };
