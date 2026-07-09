# GetPro Church — product overview

GetPro Church is a **multi-tenant church management vertical** under GetPro (`getproapp.org`), operated as a module with its own host namespace:

- Vertical landing: `church.getproapp.org`
- Branch tenant example: `kafuebaptist.church.getproapp.org`

Design personality (from Stitch): **Structured Compassion** — reliable admin tooling with a warm community feel. Brand tokens: Inter typography, GetPro violet `#6C5CE7`, soft light surfaces.

## MVP golden thread

End-to-end flow the MVP must support:

1. **Public visitor discovers church** — public homepage (screen 01) ✅ Phase 1
2. **Visitor registers as member** — Phase 2
3. **Branch admin verifies member** — Phase 3
4. **Verified member logs in** — Phase 2
5. **Member uses portal** — Phase 4
6. **Branch records attendance and giving summary** — Phase 5
7. **Branch submits monthly report** — Phase 6
8. **HQ reviews report** — Phase 7 (design gap: no Stitch export for HQ review)

## Phase 0–1 deliverables (current)

- Church host parsing and middleware
- Core `church_*` schema + sample seed
- Public homepage for vertical apex and branch hosts
- Scoped CSS under `public/church/`
- Documentation in `docs/church/`

## Out of scope for MVP

- Online giving / payment processing
- QR check-in
- Ministry leader portal (46–50)
- Full public marketing site (02–07)
- Platform admin UI (62–68) beyond seed data

## Design references

Stitch exports: `design-reference/stitch-screens/church-flow/` — PNG/HTML/MD are **reference only**; production uses EJS + `public/church/church.css`.
