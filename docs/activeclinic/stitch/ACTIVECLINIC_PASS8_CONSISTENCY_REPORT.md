# DESIGN_SYSTEM_CONSISTENCY_REPORT (Pass 8)

## Intentional exceptions

| Area | Exception | Why |
|------|-----------|-----|
| App primary indigo vs public teal | Separate `--ac-*` vs `--acp-*` | Two Stitch projects |
| Auth navy `--ac-auth-*` | Distinct login chrome | P01 login Stitch |
| Booking status aliases | Extra badge class names | Domain state vocabulary |
| Done badge green `#e3f6ea` | Not aliased to info | Distinct “completed” clinical/booking meaning |
| Choice-card `!important` borders | Kept | Compete with base border utilities |

## Consistency checks (representative)

| Surface | Buttons | Cards | Inputs | Badges | Gutters |
|---------|---------|-------|--------|--------|---------|
| Platform home | `.ac-btn` | feature/CTA | n/a | n/a | `--acp-gutter` |
| Directory | `.ac-btn` | `.acp-clinic-card` | search | n/a | shared |
| Juflona home | pill CTAs | hero/media | n/a | n/a | shared + bottom nav |
| Booking | sticky primary | choice/doctor | forms | status tokens | CTA reservation |
| Portal login | primary | `.acp-auth-card` | PhoneField tokens | n/a | mobile 100% width |
| App shell | `.ac-btn` | metric/record | shell forms | status semantic | `--ac-gutter` mobile |

## Result

No intentional visual redesign. Portal brighter teal (`#0d9488`) normalized to canonical `--acp-primary` (`#006068`) for public/portal unity.
