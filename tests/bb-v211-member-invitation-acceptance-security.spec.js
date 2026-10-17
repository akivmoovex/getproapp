"use strict";

const { test, expect } = require("@playwright/test");
const { Pool } = require("pg");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { issueMemberPortalInvitation, PURPOSE } = require("../src/blessboard/services/memberPortalInvitationService");

test("member invitation acceptance enforces recipient ownership and one-time use", async ({ browser }) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || "postgresql:///getpro_v211_test_01?host=/tmp" });
  const suffix = `${process.pid}.${Date.now()}`;
  const password = "V211-playwright-password!";
  const accounts = [];
  let memberId;
  let wrongMemberId;
  let invitationId;
  try {
    const context = (await pool.query(`
      select c.id church_id,c.organization_id,b.id branch_id
        from blessboard.churches c join blessboard.branches b
          on b.church_id=c.id and b.is_primary=true and b.status='active'
       where c.status='active' limit 1
    `)).rows[0];
    expect(context).toBeTruthy();
    async function user(label) {
      const email = `v211-accept-${label}-${suffix}@example.invalid`;
      const result = await createBlessBoardUser(pool, { email, displayName: `V211 Accept ${label}`, password });
      expect(result.ok).toBeTruthy();
      accounts.push(result.user.id);
      return { id: result.user.id, email };
    }
    const recipient = await user("recipient");
    const wrong = await user("wrong");
    const admin = await user("issuer");
    await pool.query(`
      insert into blessboard.user_role_assignments
        (user_id,organization_id,church_id,role_id,scope_type,scope_id,status,assignment_origin,assignment_reason)
      select $1,$2,$3,r.id,'church',$3,'active','manual','V211 acceptance issuer'
        from blessboard.roles r where r.role_key='church_system_administrator' and r.is_active=true
    `, [admin.id, context.organization_id, context.church_id]);
    for (const memberUser of [recipient, wrong]) {
      await pool.query(`
        insert into blessboard.user_role_assignments
          (user_id,organization_id,church_id,role_id,scope_type,scope_id,status,assignment_origin,assignment_reason)
        select $1,$2,$3,r.id,'church',$3,'active','manual','V211 acceptance member context'
          from blessboard.roles r where r.role_key='member' and r.is_active=true
      `, [memberUser.id, context.organization_id, context.church_id]);
    }
    memberId = (await pool.query(`
      insert into blessboard.members
        (church_id,user_id,first_name,last_name,email_normalized,email_display,status,portal_access_status)
      values ($1,$2,'V211','Recipient',$3,$3,'active','not_activated') returning id
    `, [context.church_id, recipient.id, recipient.email])).rows[0].id;
    wrongMemberId = (await pool.query(`
      insert into blessboard.members
        (church_id,user_id,first_name,last_name,email_normalized,email_display,status,portal_access_status)
      values ($1,$2,'V211','Wrong User',$3,$3,'active','not_activated') returning id
    `, [context.church_id, wrong.id, wrong.email])).rows[0].id;
    await pool.query(`
      insert into blessboard.member_branch_memberships
        (member_id,branch_id,membership_status,is_primary,joined_at)
      values ($1,$2,'active',true,now())
    `, [memberId, context.branch_id]);
    await pool.query(`
      insert into blessboard.member_branch_memberships
        (member_id,branch_id,membership_status,is_primary,joined_at)
      values ($1,$2,'active',true,now())
    `, [wrongMemberId, context.branch_id]);
    const issued = await issueMemberPortalInvitation(pool, {
      actorUserId: admin.id, organizationId: context.organization_id, churchId: context.church_id,
      branchId: context.branch_id, memberId, purpose: PURPOSE,
    });
    expect(issued.ok).toBeTruthy();
    invitationId = issued.invitationId;
    const token = issued.rawToken;
    expect(token).toBeTruthy();
    const url = `/member-invite/accept?token=${encodeURIComponent(token)}`;
    const observed = [];
    function monitor(page) {
      page.on("request", (request) => {
        if (!request.url().startsWith("http://127.0.0.1:4175")) {
          observed.push({ url: request.url(), referrer: request.headers().referer || "" });
        }
      });
      return page.route("**/*", async (route) => route.request().url().startsWith("http://127.0.0.1:4175")
        ? route.continue() : route.abort());
    }
    async function login(page, account) {
      await page.goto("/login");
      await page.getByLabel("Email address").fill(account.email);
      await page.getByRole("textbox", { name: "Password" }).fill(password);
      await page.getByRole("button", { name: "Sign in" }).click();
    }
    async function assertStorage(page) {
      const storage = await page.evaluate(async () => ({
        local: Object.values(localStorage), session: Object.values(sessionStorage),
        indexedDb: typeof indexedDB === "undefined" ? null : (await indexedDB.databases()).map((db) => db.name),
        caches: typeof caches === "undefined" ? null : await caches.keys(), cookies: document.cookie,
      }));
      const serialized = JSON.stringify(storage);
      expect(serialized).not.toContain(token);
      expect(serialized).not.toContain(encodeURIComponent(token));
    }

    const anonymous = await browser.newContext();
    const anonymousPage = await anonymous.newPage();
    await monitor(anonymousPage);
    const anonymousResponse = await anonymousPage.goto(url);
    expect(anonymousResponse.status()).toBe(401);
    await expect(anonymousPage.getByRole("heading", { name: "Sign in required" })).toBeVisible();
    await assertStorage(anonymousPage);
    await anonymous.close();
    let state = (await pool.query("select portal_access_status from blessboard.members where id=$1", [memberId])).rows[0];
    expect(state.portal_access_status).toBe("not_activated");

    const wrongContext = await browser.newContext();
    const wrongPage = await wrongContext.newPage();
    await monitor(wrongPage);
    await login(wrongPage, wrong);
    await wrongPage.goto(url);
    await expect(wrongPage.getByRole("button", { name: "Accept invitation" })).toBeVisible();
    const wrongResponsePromise = wrongPage.waitForResponse((response) =>
      response.url().endsWith("/member-invite/accept") && response.request().method() === "POST");
    await wrongPage.getByRole("button", { name: "Accept invitation" }).click();
    const wrongResponse = await wrongResponsePromise;
    expect(wrongResponse.status()).toBe(400);
    await expect(wrongPage.getByRole("heading", { name: "Invitation unavailable" })).toBeVisible();
    await assertStorage(wrongPage);
    await wrongContext.close();
    state = (await pool.query("select portal_access_status,user_id from blessboard.members where id=$1", [memberId])).rows[0];
    expect(state.portal_access_status).toBe("not_activated");
    expect(String(state.user_id)).toBe(String(recipient.id));
    expect((await pool.query("select status from blessboard.member_portal_invitations where id=$1", [invitationId])).rows[0].status).toBe("pending");

    const recipientContext = await browser.newContext();
    const recipientPage = await recipientContext.newPage();
    await monitor(recipientPage);
    await login(recipientPage, recipient);
    await recipientPage.goto(url);
    await expect(recipientPage.getByRole("button", { name: "Accept invitation" })).toBeVisible();
    const acceptResponsePromise = recipientPage.waitForResponse((response) =>
      response.url().endsWith("/member-invite/accept") && response.request().method() === "POST");
    await recipientPage.getByRole("button", { name: "Accept invitation" }).click();
    const acceptResponse = await acceptResponsePromise;
    expect(acceptResponse.status()).toBe(200);
    expect(acceptResponse.headers()["cache-control"]).toContain("no-store");
    expect(acceptResponse.headers()["referrer-policy"]).toBe("no-referrer");
    await expect(recipientPage.getByRole("heading", { name: "Member access activated" })).toBeVisible();
    await recipientPage.goto("/member");
    expect(recipientPage.url()).toContain("/member");
    await assertStorage(recipientPage);
    state = (await pool.query("select portal_access_status,user_id from blessboard.members where id=$1", [memberId])).rows[0];
    expect(state.portal_access_status).toBe("active");
    expect(String(state.user_id)).toBe(String(recipient.id));
    expect((await pool.query("select status from blessboard.member_portal_invitations where id=$1", [invitationId])).rows[0].status).toBe("accepted");
    expect((await pool.query(`
      select count(*)::int count from blessboard.user_role_assignments
       where user_id=$1 and role_id in (select id from blessboard.roles where role_key in ('branch_admin','branch_administrator','church_hq_admin','church_system_administrator'))
    `, [recipient.id])).rows[0].count).toBe(0);

    const replay = await recipientPage.goto(url);
    expect(replay.status()).toBe(200);
    await expect(recipientPage.getByRole("button", { name: "Accept invitation" })).toBeVisible();
    const replayResponsePromise = recipientPage.waitForResponse((response) =>
      response.url().endsWith("/member-invite/accept") && response.request().method() === "POST");
    await recipientPage.getByRole("button", { name: "Accept invitation" }).click();
    const replayResponse = await replayResponsePromise;
    expect(replayResponse.status()).toBe(400);
    await expect(recipientPage.getByRole("heading", { name: "Invitation unavailable" })).toBeVisible();
    await assertStorage(recipientPage);
    await recipientContext.close();
    expect(observed.every((entry) => !entry.url.includes(token) && !entry.referrer.includes(token))).toBeTruthy();
  } finally {
    if (memberId) await pool.query("delete from blessboard.member_portal_invitations where member_id=$1", [memberId]);
    if (memberId) await pool.query("delete from blessboard.member_branch_memberships where member_id=$1", [memberId]);
    if (memberId) await pool.query("delete from blessboard.members where id=$1", [memberId]);
    if (wrongMemberId) await pool.query("delete from blessboard.member_branch_memberships where member_id=$1", [wrongMemberId]);
    if (wrongMemberId) await pool.query("delete from blessboard.members where id=$1", [wrongMemberId]);
    for (const id of accounts) {
      await pool.query("delete from platform.deployment_sessions where user_id=$1", [id]);
      await pool.query("delete from blessboard.user_role_assignments where user_id=$1", [id]);
      await pool.query("delete from blessboard.users where id=$1", [id]);
    }
    await pool.end();
  }
});
