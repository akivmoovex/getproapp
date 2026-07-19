# Foundation & Growth — Agent window schedule

**Date:** 2026-07-19
**Mode:** Documentation only
**Prompt source:** [`FOUNDATION_GROWTH_REMAINING_CURSOR_PROMPTS.md`](./FOUNDATION_GROWTH_REMAINING_CURSOR_PROMPTS.md)
**Queue source:** [`FOUNDATION_GROWTH_IMPLEMENTATION_QUEUE.md`](./FOUNDATION_GROWTH_IMPLEMENTATION_QUEUE.md)

**Constraint:** ≤4 related batches per Agent window. One batch per turn. Stop after each batch. Do not re-run FG-01 or FG-08a.

---

## Window overview

| Window | Reset | Prompt #s | Queue IDs | Focus | Max batches |
|--------|-------|-----------|-----------|-------|------------:|
| **W1** | A | 1–4 | FG-Q01–Q04 | Apex Home + commercial | 4 |
| **W2** | B | 5 | FG-Q05 | Apex For Churches | 1 |
| **W3** | C | 6–9 | FG-Q08–Q11 | Branch content + HQ content | 4 |
| **W4** | D | 10–11 | FG-Q12–Q13 | Growth advanced reports | 2 |
| **W5** | E | 12–13 | FG-Q07, FG-Q06 | Product-gated | 2 |
| **W6** | F | 14–15 | FG-Q14–Q15 | Final audits | 2 |

**Total windows:** 6 · **Total implementation prompts:** 15 · **First prompt:** **1** (FG-Q01)

---

## Execution order

```text
W1: 1 → 2 → 3 → 4
W2: 5
W3: 6 → 7 → 8 → 9
W4: 10 → 11
W5: 12 → 13   (only after product gates; else skip with report)
W6: 14 → 15   (last)
```

---

## Package split

| Package | Prompt #s | Queue IDs |
|---------|-----------|-----------|
| Platform commercial / apex | 1–5, 13 | FG-Q01–Q05, FG-Q06 |
| Foundation | 6–8, 12 | FG-Q08–Q10, FG-Q07 |
| Growth | 9–11 | FG-Q11–Q13 |
| Shared audits | 14–15 | FG-Q14–Q15 |

---

## Do / don’t

| Do | Don’t |
|----|-------|
| Paste window-reset prompt before each window | Dump full project history into batch prompts |
| Run focused tests listed in each prompt | Run the whole suite |
| Create one `BATCH_FG_Q*.md` per batch | Combine apex + unfinished branch in one turn |
| Skip W5 items when product gate closed | Invent `/member/prayer-request` or unchecked create-org POST |
| Claim MATCHED only with Stitch evidence (W6) | Start DEFERRED/MISSING_BACKEND screens |

---

## Backend-blocked / excluded (no windows)

See [`FOUNDATION_GROWTH_BLOCKED_SCREENS.md`](./FOUNDATION_GROWTH_BLOCKED_SCREENS.md).

| Status | Examples |
|--------|----------|
| `MISSING_BACKEND` | Waiting verification; dedicated prayer route; departments; duty roster; monthly reports; HQ roles/templates |
| `DEFERRED` | Forgot password; scheduled comms/reports; offline attendance; surveys; appointments; volunteers |
| `NOT_IN_SCOPE` | Leader portal; Network domain/email/API; banking settings |
| `MISSING_STITCH` | Media; auth-error/account; BA sermons/forms; BA/HQ settings |
| `COMPLETE` | FG-01 Features; FG-08a hub + attendance |

---

## How to start the next coding Agent

1. Open [`FOUNDATION_GROWTH_REMAINING_CURSOR_PROMPTS.md`](./FOUNDATION_GROWTH_REMAINING_CURSOR_PROMPTS.md).
2. Paste **Window-reset prompt A**.
3. Paste **Prompt 1** (FG-Q01 Apex Home).
4. Stop after that batch; continue with Prompt 2 in the same window or a fresh turn.
