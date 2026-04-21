# QA standard test script (non-technical)

**How to use this document:** Execute tests in a **staging** environment that mirrors production. Record **Pass** or **Fail** in the rightmost column. Use the **Notes** column for screenshots, URLs, and exact error text.

**Prerequisites (global):**

- You have URLs for at least one **Enabled** regional tenant (for example Zambia) and test accounts for admin roles.
- Browser: use a fresh private/incognito window when switching personas so sessions do not mix.

---

## Test cases

| ID | Module / feature | Preconditions | Steps (exact) | Expected result (plain language) | Pass / Fail | Notes |
|----|------------------|---------------|---------------|-----------------------------------|---------------|-------|
| P-01 | Public home | Regional tenant Enabled | Open regional home URL (subdomain). | You see the marketplace home (not “region not available”). | | |
| P-02 | Public directory | Same | Click or go to `/directory` on that host. | Directory page loads with categories or empty state; no server error page. | | |
| P-03 | Company profile | A company exists in that region | Open `/company/{id}` with a real id from admin. | Company profile loads with contact area; 404 only if id invalid. | | |
| P-04 | Join page | Same | Open `/join`. | Join page loads; you can see the form. | | |
| P-05 | Public lead API (browser network) | Company page open | Submit the on-page contact form that posts to `/api/leads` (or use approved API client). Use valid `company_id`. | Success response; in admin, a new lead appears for that company (may take seconds). | | |
| P-06 | Join signup API | — | Submit join form that posts to `/api/professional-signups` with required fields. | Success; admin shows partner signup or CRM task (per setup). | | |
| P-07 | Sitemap | Same tenant | Open `/sitemap.xml`. | XML document downloads or displays; not an HTML error page. | | |
| P-08 | Disabled region gate | Use a tenant marked Disabled (or staging flag) | Open public home on that host (not the sign-in hub path). | You see a message that the region is not available (503 text). | | |
| FA-01 | Field agent signup | No field agent session | Open `/field-agent/signup`; register new username/password. | You reach the field agent dashboard; logout exists. | | |
| FA-02 | Field agent login | Existing field agent | Open `/field-agent/login`; sign in. | Dashboard loads with metrics/cards. | | |
| FA-03 | Field agent logout | Logged in as FA | Click/logout control that posts logout. | You return to public area; dashboard should require login again. | | |
| FA-04 | Add contact — required fields | Logged in as FA | Open `/field-agent/add-contact`; submit with empty required fields. | Form or server shows a clear “missing required fields” style error; no success. | | |
| FA-05 | Add contact — duplicate phone | Phone already used by listing or submission | Complete form with duplicate phone; submit. | You see “Service provider exists in system” (or equivalent) and **no** new duplicate submission. | | |
| FA-06 | Add contact — check-phone API | Logged in as FA | Enter phone; trigger duplicate check (UI button if present). | UI shows duplicate warning before submit when phone matches existing records. | | |
| FA-07 | Add contact — happy path | Unique phone, valid images | Fill all required fields; 1 profile photo; 2+ work photos; submit. | Redirect to dashboard with success; submission visible in FA dashboard/history. | | |
| FA-08 | Callback flow | Logged in as FA | Open `/field-agent/call-me-back`; submit valid details. | Confirmation or success path; record appears for admins in callback analytics/listing (if you have access). | | |
| CP-01 | Company portal login | Company personnel user exists | Open `/company/login` (or `/provider/login`). | Login form loads. | | |
| CP-02 | Company portal auth | Valid credentials | Sign in. | You reach the leads list (`/company/leads` or `/provider/leads`). | | |
| CP-03 | Company portal wrong password | Invalid password | Attempt login several times. | After threshold, you see a “too many attempts” style message; login blocked temporarily. | | |
| CP-04 | Lead list scopes | At least one assignment | Switch list tabs/filters: active / declined / completed / all as offered. | Lists change without error; only this company’s leads appear. | | |
| CP-05 | Lead detail + action | Assignment in active list | Open a lead; perform an allowed action (accept/decline/complete — whichever UI shows). | Status updates; no permission error for valid user. | | |
| AD-01 | Admin login | Admin username/password | Open `/admin/login` or `/getpro-admin` entry; sign in. | Admin dashboard loads. | | |
| AD-02 | Dashboard visibility | Logged in as admin | Open `/admin/dashboard`. | You see lead statistics and (if role allows) CRM snapshot. | | |
| AD-03 | Categories (manager) | super_admin or tenant_manager | Open `/admin/categories`. | List loads; you can add/edit if your role is allowed. | | |
| AD-04 | Categories (editor) | tenant_editor | Open `/admin/categories`. | Access denied (403) — editors do not manage categories. | | |
| AD-05 | Cities | tenant_editor or CSR | Open `/admin/cities`. | List loads for permitted roles. | | |
| AD-06 | Companies | tenant_editor | Open `/admin/companies`. | List loads; viewer role should be redirected (see V-01). | | |
| AD-07 | Leads | tenant_viewer | Open `/admin/leads`. | List loads (viewers allowed here). | | |
| CRM-01 | CRM board | csr or editor | Open `/admin/crm`. | Task board loads. | | |
| CRM-02 | CRM claim | CSR user, unassigned task | Claim a new task from pool (if UI shows Claim). | Task becomes yours; detail page allows edits. | | |
| CRM-03 | CRM read-only | tenant_viewer | Open `/admin/crm`; try to post a comment or change status (if buttons visible). | Mutation blocked with read-only or permission message. | | |
| IN-01 | Intake — new client | role with intake write | Open `/admin/project-intake`; create a new client with valid phone. | Client saved; searchable on next search step. | | |
| IN-02 | Intake — new project | Client exists | Create project with city from allowed list and category. | Project saved in draft/appropriate status. | | |
| IN-03 | Intake — viewer blocked | tenant_viewer | Attempt to POST create client (use UI save). | “Read-only access” or similar — no create. | | |
| IN-04 | Project images | Project with upload step | Attach images within limit (count/size). | Images attach; breaking limit shows friendly error. | | |
| IN-05 | Publish + assign | Published project workflow in your env | Complete publish flow; assign at least one company. | Company portal shows assignment for that company. | | |
| CL-01 | Client deal form (anonymous) | Enabled tenant | Open `/client/deals/new`; submit minimal invalid form. | Clear validation message; stays on form. | | |
| CL-02 | Client deal success | Valid form | Submit complete valid form with allowed images. | Success page shows project code. | | |
| CL-03 | Client review | Closed job with code | Open `/client/review`; enter project code + matching phone + rating. | Thank-you notice; duplicate review shows duplicate message. | | |
| CT-01 | Content list | admin | Open `/admin/content`. | Pages list loads. | | |
| CT-02 | Content write | tenant_manager | Create or edit an article/guide/faq. | Saves without 403; appears on public site when published (if applicable). | | |
| CT-03 | Content write blocked | tenant_editor | Attempt `/admin/content/new`. | 403 permission message. | | |
| TS-01 | Tenant settings | tenant_manager | Open `/admin/settings/tenant/{yourTenantId}`. | Form loads; save contact phone/email. | | |
| TS-02 | Tenant settings blocked | tenant_editor | Attempt same URL. | Access denied. | | |
| SU-01 | Super console | super_admin | Open `/admin/super`. | Super admin tenant list/console loads. | | |
| SU-02 | Super blocked | tenant_manager | Open `/admin/super`. | “Super admin access required.” | | |
| SU-03 | Finance CFO | super_admin | Open `/admin/finance/summary` (or CFO route in menu). | Finance view loads. | | |
| SU-04 | Finance blocked | tenant_manager | Open `/admin/finance/summary`. | Access denied (super only). | | |
| V-01 | Viewer redirect | tenant_viewer | Open `/admin/companies`. | Browser ends up on `/admin/leads` (redirect), not company list. | | |
| V-02 | Viewer POST | tenant_viewer | Attempt any mutating action in directory (if UI exposes). | 403 read-only message. | | |
| FIN-01 | Finance viewer | finance_viewer | Open pay-run main list `/admin/field-agent-pay-runs`. | Limited access message / 403; finance dashboard routes may still work. | | |
| FIN-02 | Pay run workflow | tenant_manager | Open pay-run list; attempt “new” or lock action available to role. | Action succeeds or shows business validation (not 403). | | |
| FA-ADM-01 | Field-agent analytics | csr | Open `/admin/field-agent-analytics`. | Page loads (CRM access). | | |
| FA-ADM-02 | Bulk correction | tenant_editor | Attempt analytics correction tool requiring manager. | Denied if UI present. | | |
| ERR-01 | Session expiry | Logged in as admin | Clear cookies mid-task; click a protected admin link. | Redirect to login. | | |

---

## Tips for testers

- **Always note the exact URL and region** (subdomain) when reporting bugs.
- If a test requires seed data you do not have, mark **Blocked** in Notes and list the missing data.
- **Do not** test destructive super-admin DB tools on production.
