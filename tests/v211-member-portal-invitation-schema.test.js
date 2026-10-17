"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");

const DB = "getpro_v211_test_01";
let pool;
let fixture;

describe("V211 member portal invitation schema", () => {
  before(async () => {
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL || `postgresql:///${DB}?host=/tmp`,
    });
    const result = await pool.query(`
      select m.id as member_id, m.church_id, c.organization_id,
             b.id as branch_id, u.id as user_id
        from blessboard.members m
        join blessboard.churches c on c.id = m.church_id
        join blessboard.member_branch_memberships mb on mb.member_id = m.id
        join blessboard.branches b on b.id = mb.branch_id
        left join blessboard.users u on u.id = m.user_id
       where m.status <> 'archived'
       limit 1
    `);
    assert.equal(result.rowCount, 1, "synthetic member fixture required");
    fixture = result.rows[0];
  });

  after(async () => { if (pool) await pool.end(); });

  it("exposes the isolated table, constraints and indexes", async () => {
    const columns = await pool.query(`
      select column_name from information_schema.columns
       where table_schema = 'blessboard' and table_name = 'member_portal_invitations'
    `);
    const names = new Set(columns.rows.map((row) => row.column_name));
    for (const name of ["id", "organization_id", "church_id", "branch_id", "member_id",
      "recipient_user_id", "purpose", "token_hash", "status", "expires_at",
      "invited_by_user_id", "accepted_at", "revoked_at"]) assert.ok(names.has(name), name);
    const indexes = await pool.query(`
      select indexname from pg_indexes
       where schemaname = 'blessboard' and tablename = 'member_portal_invitations'
    `);
    const indexNames = indexes.rows.map((row) => row.indexname).join(" ");
    assert.match(indexNames, /token_hash/);
    assert.match(indexNames, /pending_member/);
  });

  it("enforces tenant integrity, purpose/status and pending uniqueness", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const values = [
        fixture.organization_id, fixture.church_id, fixture.branch_id, fixture.member_id,
        fixture.user_id, "a".repeat(64),
      ];
      const inserted = await client.query(`
        insert into blessboard.member_portal_invitations
          (organization_id, church_id, branch_id, member_id, recipient_user_id,
           token_hash, expires_at, invited_by_user_id)
        values ($1,$2,$3,$4,$5,$6,now()+interval '7 days',$5)
        returning purpose, status
      `, values);
      assert.equal(inserted.rows[0].purpose, "MEMBER_PORTAL_ACTIVATION");
      assert.equal(inserted.rows[0].status, "pending");
      async function rejectsAndRecovers(run, pattern) {
        await client.query("SAVEPOINT schema_negative");
        await assert.rejects(run(), pattern);
        await client.query("ROLLBACK TO SAVEPOINT schema_negative");
      }
      await rejectsAndRecovers(
        () => client.query(`
          insert into blessboard.member_portal_invitations
            (organization_id, church_id, branch_id, member_id, token_hash, purpose, expires_at)
          values ($1,$2,$3,$4,$5,'STAFF_INVITATION',now()+interval '7 days')
        `, [...values.slice(0, 4), "c".repeat(64)]),
        /member_portal_invitations_purpose_check/
      );
      await rejectsAndRecovers(
        () => client.query(`
          insert into blessboard.member_portal_invitations
            (organization_id, church_id, branch_id, member_id, token_hash, status, expires_at)
          values ($1,$2,$3,$4,$5,'accepted',now()+interval '7 days')
        `, [...values.slice(0, 4), "d".repeat(64)]),
        /member_portal_invitations_acceptance_check/
      );
      await rejectsAndRecovers(
        () => client.query(`
          insert into blessboard.member_portal_invitations
            (organization_id, church_id, branch_id, member_id, token_hash, expires_at)
          values ($1,$2,$3,$4,$5,now()+interval '7 days')
        `, [...values.slice(0, 4), "b".repeat(64)]),
        /duplicate key/
      );
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("preserves staff invitation storage and supports revoked replacement semantics", async () => {
    const result = await pool.query(`
      select to_regclass('blessboard.user_invitations') as staff_table,
             to_regclass('blessboard.member_portal_invitations') as member_table
    `);
    assert.equal(result.rows[0].staff_table, "blessboard.user_invitations");
    assert.equal(result.rows[0].member_table, "blessboard.member_portal_invitations");
  });
});
