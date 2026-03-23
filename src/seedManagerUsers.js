const bcrypt = require("bcryptjs");
const { ROLES } = require("./roles");
const { TENANT_DEMO, TENANT_ZM } = require("./tenantIds");
const { upsertMembership } = require("./adminUserTenants");

/**
 * Idempotent: Martin, Faith, Daisy as tenant_manager on Demo + Zambia (weak password for demo only).
 * Set SEED_MANAGER_USERS=0 to skip.
 */
function seedManagerUsers(db) {
  if (process.env.SEED_MANAGER_USERS === "0") return;

  const hash = (p) => bcrypt.hashSync(p, 12);
  const ins = db.prepare(
    "INSERT INTO admin_users (username, password_hash, role, tenant_id, enabled, display_name) VALUES (?, ?, ?, ?, 1, ?)"
  );
  const updName = db.prepare("UPDATE admin_users SET display_name = ? WHERE id = ?");
  const updPw = db.prepare("UPDATE admin_users SET password_hash = ? WHERE id = ?");

  const people = [
    { username: "martin", displayName: "Martin Ndemena" },
    { username: "faith", displayName: "Faith Lutangu" },
    { username: "daisy", displayName: "Daisy Namuyemba" },
  ];

  const tenantIds = [TENANT_DEMO, TENANT_ZM];

  for (const p of people) {
    const u = String(p.username || "").toLowerCase().trim();
    if (!u) continue;
    let row = db.prepare("SELECT id FROM admin_users WHERE username = ?").get(u);
    if (!row) {
      ins.run(u, hash("1234"), ROLES.TENANT_MANAGER, TENANT_ZM, p.displayName);
      row = db.prepare("SELECT id FROM admin_users WHERE username = ?").get(u);
    } else {
      updName.run(p.displayName, row.id);
      updPw.run(hash("1234"), row.id);
    }
    const uid = Number(row.id);
    if (!uid) continue;
    for (const tid of tenantIds) {
      upsertMembership(db, uid, tid, ROLES.TENANT_MANAGER);
    }
    db.prepare("UPDATE admin_users SET role = ?, tenant_id = ? WHERE id = ?").run(ROLES.TENANT_MANAGER, TENANT_ZM, uid);
  }
}

module.exports = { seedManagerUsers };
