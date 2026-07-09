# BlessBoard Branch Admin Training

Short checklist for training a new church branch administrator (e.g. Kafue Baptist Church) after super admin provisioning.

**Last updated:** 2026-07-10

Hand off these URLs with the copyable welcome message from the organization detail page after provision.

| Role | URL |
|------|-----|
| Public site | `https://<slug>.blessboard.com` |
| Branch admin login | `https://<slug>.blessboard.com/branch/login` |
| Member registration | `https://<slug>.blessboard.com/register` |

For Kafue Baptist: replace `<slug>` with `kafuebaptist`.

---

## 1. Login

1. Open `https://kafuebaptist.blessboard.com/branch/login`
2. Enter the **username or email** and **temporary password** from the welcome handoff
3. Confirm you reach the branch admin dashboard

**If login fails:** confirm caps lock, use exact username from handoff, or ask platform super admin to reset password.

---

## 2. Change temporary password (if supported)

1. After first login, look for **Change password** or account settings
2. Set a strong password only the branch admin knows
3. Log out and log back in with the new password

**Note:** If self-service password change is not yet available, request a reset through your platform contact.

---

## 3. Edit website content

1. Go to **Website editor** (`/branch/website-editor`)
2. Update **About**, **Mission**, **Vision**, **Contact** blocks
3. Save and click **View public site** (or open `/about` in a new tab)
4. Confirm changes appear on the public site

---

## 4. Add a sermon

1. Open **Sermons** (`/branch/sermons`)
2. Click **Add sermon**
3. Fill title, speaker, date, summary; add video/audio URL if available
4. Save as **draft**, preview, then **publish**
5. Visit public `/sermons` and confirm the sermon appears

**Note:** File upload is URL-only for now (“File upload coming soon” on forms).

---

## 5. Add a resource or form

1. Open **Resources** (`/branch/resources`)
2. Add a resource (PDF link, external form URL, or document link)
3. Publish when ready
4. Members with accounts can access member-only resources after login

---

## 6. Review contact submissions

1. Open **Contact submissions** (`/branch/contact-submissions`)
2. Find new messages from the public contact form
3. Mark as **read** when reviewed, **resolved** when replied to

**Test:** Submit the public contact form yourself from `/contact` while logged out.

---

## 7. Review member registrations

1. Open **Member verification** (`/branch/member-verification`)
2. Review pending registrations from `/register`
3. Check name, phone, and email before approving

---

## 8. Approve or reject members

1. For each pending member, choose **Approve** or **Reject**
2. Approved members can log in to the member portal (if enabled for your branch)
3. Rejected members remain off the active roster

---

## 9. Update giving instructions

1. From **Website editor** or **Giving** settings (if shown), update bank details, mobile money, or online giving links
2. Visit public `/giving` and confirm instructions are clear and accurate
3. Do not paste live API keys or secrets — use public payment links only

---

## 10. Test public pages on phone

On a mobile browser (not logged in as admin):

| Page | Check |
|------|-------|
| `/` | Homepage readable, navigation works |
| `/about` | Text not cut off |
| `/contact` | Form usable, submit works |
| `/register` | Form usable (or closed message if disabled) |
| `/giving` | Instructions readable |
| `/ministries` | Cards/list display correctly |

Use mobile menu (hamburger) if the site uses responsive navigation.

---

## Site settings (optional)

In **Website editor → Site settings**:

- **Member registration enabled** — turn off to show “Registration closed” on `/register`
- Save after toggling

---

## When to contact platform support

- Branch or organization shows as suspended
- Public site returns “Church not found”
- SSL or domain errors in the browser
- Cannot reset branch admin password

Platform super admin console: `https://getproapp.org/admin/church`

---

## Related docs

- [blessboard-pilot-smoke-test.md](./blessboard-pilot-smoke-test.md)
- [blessboard-content-management.md](./blessboard-content-management.md)
- [blessboard-church-onboarding.md](./blessboard-church-onboarding.md)
