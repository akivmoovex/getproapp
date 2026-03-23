# Database naming notes (GetPro)

## Companies (directory listings)

The primary directory entity lives in the **`companies`** table. Admin and product copy refer to these as **companies** / **listings**.

## `professional_signups`

The join / partner pipeline table is still named **`professional_signups`** for **migration and compatibility** with existing SQLite files and server code paths.

- **Conceptually** these rows are **partner / company signup** requests before a `companies` row exists.
- A **full table rename** to e.g. `company_signups` would require a coordinated migration and query updates; it was **not** done in the admin “Companies” wording pass.

API route **`POST /api/professional-signups`** is unchanged for the same reason.
