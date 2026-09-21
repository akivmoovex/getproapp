# V2.0 BlessBoard Website Editor Bugs

**Branch / environment:** Neuniversity V2.0 testing (`V8`) only  
**Production:** out of scope — do not implement against production  
**Purpose:** Product backlog for BlessBoard (and shared-platform where applicable) website editor functional defects found during V2.0 testing.

Do **not** implement items marked **OPEN — NOT IMPLEMENTED** until explicitly scheduled. Documentation-only entries must not change application code, schema, deployment, or production.

---

## Index

| ID | Title | Product | Status | Priority |
|----|-------|---------|--------|----------|
| **V2-BB-18** | About page — Our Values save error (`unknown_content_key`) | BlessBoard | **OPEN — NOT IMPLEMENTED** | P1 |

---

## V2-BB-18 — About page Our Values save error (`unknown_content_key`)

| Field | Value |
|-------|--------|
| **Bug ID** | V2-BB-18 |
| **Title** | BlessBoard About page — Our Values text cannot save (`unknown_content_key`) |
| **Product** | BlessBoard |
| **Priority** | P1 |
| **Page** | Church mini-website → About |
| **Section** | Our Values |
| **Environment** | Neuniversity V2.0 testing |
| **Status** | **OPEN — NOT IMPLEMENTED** |
| **Added** | 2026-09-21 |
| **Implementation** | None — documentation only |

### Live reference

| Kind | URL / note |
|------|------------|
| Hosted About (draft edit) | https://blessboard.neuniversity.org/c/demo-church-22/demo-c-branch-22/about?website_edit=1&website_mode=draft |

### Reported bug

The website administrator cannot save an edit to the **Our Values** text.

| Field | Value |
|-------|--------|
| **Text entered** | `Template example — replace with your church’s information_22` |
| **Error** | `unknown_content_key` |

### Expected behavior

1. The Our Values text must be editable by an authorized website administrator.
2. The submitted content key must be recognized by the server-side website content registry.
3. The edited text must save successfully as a draft.
4. The updated text must remain correct after refreshing the page and logging in again.
5. The updated text must appear on the public website after authorized publication.
6. Saving this field must not overwrite or remove other About page content.
7. Unicode punctuation, apostrophes, underscores, and ordinary text must be preserved without double HTML encoding.

### Investigation requirements (for future implementation)

1. Reproduce the error on the hosted Neuniversity testing environment.
2. Inspect the Our Values renderer, edit-control field key, client save payload, server-side content-key allowlist, content schema, and persistence handler.
3. Determine why the submitted key produces `unknown_content_key`.
4. Check whether the issue affects the section heading, description, individual value cards, or other About page text fields.
5. Determine whether the same issue exists on other BlessBoard pages or ActiveClinic through shared website editor infrastructure.
6. Fix common content-key registration and validation issues at shared platform level where appropriate.
7. Do **not** bypass server-side content-key validation or introduce an unrestricted content-update endpoint.
8. Preserve tenant/branch isolation, RBAC, CSRF protection, draft/publish lifecycle, and website history.

### Non-goals (explicit)

- Disabling or relaxing content-key allowlisting to “make save work.”  
- Ad-hoc Contact/About-only save endpoints that skip shared registry validation.  
- Production changes while resolving on Neuniversity V2.0 only.

### Future QA acceptance

- [ ] Edit Our Values text successfully as an authorized website admin.
- [ ] Save draft without `unknown_content_key`.
- [ ] Verify text after refresh and re-login.
- [ ] Publish and verify public rendering of the updated text.
- [ ] Confirm other About page content remains unchanged after save.
- [ ] Test special characters and HTML entity handling (Unicode punctuation, apostrophes, underscores; no double encoding).
- [ ] Test unauthorized / unknown content-key updates are rejected.
- [ ] Check shared-platform regression coverage (BlessBoard other pages; ActiveClinic if shared editor keys are involved).

### Status history

| Date | Status | Note |
|------|--------|------|
| 2026-09-21 | **OPEN — NOT IMPLEMENTED** | Documented from V2.0 Bug 18 backlog request. No application, schema, deploy, or production changes. |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-09-21 | Created file; added **V2-BB-18** About page Our Values save error (`unknown_content_key`). |
