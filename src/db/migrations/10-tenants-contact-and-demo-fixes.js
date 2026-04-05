"use strict";
module.exports = function run(db) {/** Per-tenant call center / WhatsApp / support email (footers + mini-site). */
try {
  const tenantColNames = () =>
    new Set(db.prepare("PRAGMA table_info(tenants)").all().map((c) => c.name));
  let tc = tenantColNames();
  if (!tc.has("callcenter_phone")) {
    db.exec(
      "ALTER TABLE tenants ADD COLUMN callcenter_phone TEXT NOT NULL DEFAULT '+260211000101'"
    );
    tc = tenantColNames();
  }
  if (!tc.has("whatsapp_phone")) {
    db.exec(
      "ALTER TABLE tenants ADD COLUMN whatsapp_phone TEXT NOT NULL DEFAULT '+260211000102'"
    );
    tc = tenantColNames();
  }
  if (!tc.has("callcenter_email")) {
    db.exec(
      "ALTER TABLE tenants ADD COLUMN callcenter_email TEXT NOT NULL DEFAULT 'info@getproapp.org'"
    );
    tc = tenantColNames();
  }
  if (!tc.has("support_help_phone")) {
    db.exec(
      "ALTER TABLE tenants ADD COLUMN support_help_phone TEXT NOT NULL DEFAULT '+260211000101'"
    );
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] tenants contact columns migration:", e.message);
}

try {
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("tenant_support_help_phone_v1")) {
    db.prepare("UPDATE tenants SET support_help_phone = callcenter_phone").run();
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("tenant_support_help_phone_v1");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] tenant support_help_phone backfill migration:", e.message);
}

try {
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("demo_company_email_invalid_fix_v1")) {
    db.prepare(
      `UPDATE companies SET email = 'info@getproapp.org' WHERE email LIKE '%getproapp.invalid%'`
    ).run();
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("demo_company_email_invalid_fix_v1");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] demo company email fix migration:", e.message);
}
};
