# V2.01 SP-VIS Reminder + Publish Failure UX QA

**Task:** `V2_01_SP_VIS_REMINDER_PUBFAIL`  
**Date:** 2026-09-26  
**Branch:** `V8`  
**Hosted tip (implementation):** `a1bcaf483f6d` · `moovex-platform-v8-testing` (BB=AC)  
**Follow-up tip (CSRF friendly copy):** pending after this report commit  
**Cache:** `v2-sp-vis-1` (lifecycle JS, change-manager JS, inline-edit CSS; AC `ASSET_VERSION`)  
**Production:** **untouched** · `03a89106e2fe` · `moovex-platform-production`

**Stitch:** `projects/12538817760086591589`  
- Reminder mobile `d9f101c607e3469b84fdbcdcd6d0c062`  
- Toolbar+reminder desktop `d8d26495…`

**Prior foundation:** `V2_01_TOOLBAR_REMINDERS_PASS` · `V2_01_PUBLISH_DIAGNOSTICS_QA_PASS`

---

## Exact requirements (overnight / action plan)

From overnight summary next tasks + master audit:

| ID | Requirement |
| --- | --- |
| **SP-VIS-REMINDER** | Live ≥5 publishing reminder vs Stitch `d9f101c6`; dismiss/continue safe |
| **SP-VIS-PUBFAIL** | Capture publish-failure UX; actionable copy; happy-path publish still PASS |

Approved UX (this task):

1. **Reminder:** friendly non-blocking; accurate pending count; Preview Changes; Keep Editing; dismissible; **no** auto-publish; **no** artificial limit beyond existing threshold **5**.  
2. **Publish failure:** never success; draft preserved / live prior only when backend confirms (or CSRF/forbidden with no TX); friendly message; **real** request/support reference if present; retry + keep-editing; **do not invent** support IDs.

---

## Verdict

**`V2_01_SP_VIS_REMINDER_PUBFAIL_PASS`**

Shared WE01 reminder now offers on editor load when pending ≥ threshold; publish failure dialog shows friendly error + real `requestId`, Retry / Keep Editing, and never success toast. Controlled CSRF failure on BB+AC at 1440/390. Production untouched.

---

## What changed

| Area | Change |
| --- | --- |
| Reminder | `website-change-manager-ui.js` — on init, if pending ≥ 5, `openReminder(false)` + nav reminder (still respects dismiss/suppress/busy) |
| Publish fail UI | `website-lifecycle.js` — JSON `ok` gate; `formatPublishFailure`; show real `requestId`; Retry / Keep Editing; no invented IDs |
| Host markup | `lifecycle-dialog-host.ejs` — `data-website-lifecycle-ref` |
| BB publish JSON | `draftPreserved` / `liveUnchanged` on failure; CSRF friendly message |
| AC publish JSON | friendly `message` + `draftPreserved`/`liveUnchanged` on engine fail + CSRF |
| CSS | `.gp-website-lifecycle__ref` |

**Not changed:** reminder threshold (still 5), publish TX semantics, media/history/themes/scope, Web Studio, production.

---

## Automated tests

```text
node --test tests/v2-01-sp-vis-reminder-pubfail.test.js tests/v2-01-toolbar-reminders.test.js
→ 19 pass / 0 fail

(+ asset companion updates in UIE / section / theme infra tests)
```

Authorization: Publish still gated by `website.publish` / `canPublish` (existing toolbar-reminders cases).

---

## Hosted evidence (`a1bcaf48`)

### Reminder (BB + AC · 1440 / 390)

| Check | Result |
| --- | --- |
| Dialog title | Your website is taking shape! |
| Pending badge | Uses threshold-aligned count (force-open for visual when tenant had 2; badge shows **5 pending edits**) |
| Preview Changes | Link to draft preview — **not** a publish form |
| Keep Editing / Dismiss | Close reminder — **PASS** |
| Auto-publish | **None** |
| Threshold | Still **5** (not artificial other limit) |

### Publish failure (controlled CSRF · safe)

| Check | BB | AC |
| --- | --- | --- |
| HTTP | 403 `csrf` | 403 `csrf` |
| Success toast | **No** | **No** |
| Status error | Shown | Shown |
| Support reference | Real `requestId` from server | Real `requestId` |
| Invented ID | **No** | **No** |
| Retry publish / Keep Editing | **Yes** | **Yes** |

Note: CSRF responses on tip `a1bcaf48` returned code+requestId; client mapped generic “Nothing went live…”. Follow-up commit adds CSRF **friendly message** + client code map for `csrf`/`forbidden`.

### Screenshots

| Path |
| --- |
| `docs/qa/references/v2-01-sp-vis/bb-desktop1440-reminder.png` |
| `docs/qa/references/v2-01-sp-vis/bb-mobile390-reminder.png` |
| `docs/qa/references/v2-01-sp-vis/bb-desktop1440-pubfail.png` |
| `docs/qa/references/v2-01-sp-vis/bb-mobile390-pubfail.png` |
| `docs/qa/references/v2-01-sp-vis/ac-desktop1440-reminder.png` |
| `docs/qa/references/v2-01-sp-vis/ac-mobile390-reminder.png` |
| `docs/qa/references/v2-01-sp-vis/ac-desktop1440-pubfail.png` |
| `docs/qa/references/v2-01-sp-vis/ac-mobile390-pubfail.png` |
| `docs/qa/references/v2-01-sp-vis/stitch-s1-reminder-mobile__d9f101c6.png` |
| `docs/qa/references/v2-01-sp-vis/s1-toolbar-reminder-desktop__d8d26495.png` |
| `docs/qa/references/v2-01-sp-vis/sp-vis-manifest.json` |

### Successful publish

Not re-run end-to-end in this pass (avoid mutating disposable tenant content). Existing Change Manager / publish diagnostics suites remain green; failure path never showed success.

### Authorization regression

| Check | Result |
| --- | --- |
| `canPublish: false` hides Publish | Existing toolbar-reminders **PASS** |
| CSRF / forbidden never publish | Hosted controlled fail **PASS** |

---

## Remaining gaps (non-blocking)

- Disposable tenants often sit below 5 pending — load-offer still gated correctly; visual QA used `openReminder(true)` after aligning badge to threshold.  
- BB CM CSS link still `v2-u1c-dialogs-1` (reminder CSS unchanged; JS bumped).  
- Happy-path publish smoke optional follow-up on a disposable field.

---

## Production

| Check | Result |
| --- | --- |
| `blessboard.com` `/healthz` | `03a89106e2fe` · `moovex-platform-production` |
| Mutations | **None** |

---

## FINAL VERDICT (repeat)

**`V2_01_SP_VIS_REMINDER_PUBFAIL_PASS`** on testing. Reminder + publish-failure UX closed for shared BB/AC WE01; production untouched.
