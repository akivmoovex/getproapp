# V2.03 — ActiveClinic Batch 1 Stitch Parity

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_AC_BATCH1_STITCH_PARITY` |
| **Date** | 2026-09-26 |
| **Branch** | `V10` |
| **Stitch project** | [Operational Design System](https://stitch.withgoogle.com/projects/12134201997833374170) (`12134201997833374170`) |
| **Scope** | Visual parity only — ACN01–16, ACN21–23, ACN25–26 |
| **Viewports** | Desktop **1440px**, Mobile **390px** |
| **Production** | Not modified |
| **Verdict** | **`V2_03_AC_BATCH1_STITCH_PARITY_COMPLETE_WITH_GAPS`** |

---

## 1. Frozen colour tokens (authenticated shell)

Applied in `public/activeclinic/ac-app.css` (`:root` overrides for staff app):

| Token | Hex |
|-------|-----|
| Primary | `#2563EB` |
| Primary strong | `#1D4ED8` |
| Primary soft | `#EFF6FF` |
| Success | `#16A34A` / `#F0FDF4` |
| Warning | `#D97706` / `#FFFBEB` |
| Danger | `#DC2626` / `#FEF2F2` |
| Ink | `#111827` |
| Muted | `#6B7280` |
| Border | `#E5E7EB` |
| Page / surface | `#F8FAFC` / `#FFFFFF` |
| Neutral muted | `#F3F4F6` |
| Teal | `#0F766E` / `#F0FDFA` |

Also aligned: sidebar/bottom-nav active → teal; status badges; secondary button (teal soft); info flash → primary soft.

Asset bust: `SHELL_ASSET_VERSION = v2-03-b1-parity-01`.

---

## 2. Parity fixes applied this pass

| Area | Change |
|------|--------|
| Tokens | Frozen palette + status chip colours on authenticated shell |
| Nav chrome | Active sidebar/drawer/bottom-nav use teal accent |
| ACN02 Services | Labels/columns/chips match ODS (stats, filters, booking channel, export link to `/app/data`) |
| ACN10 / ACN08 IDs | Batch 1 ODS screen IDs wired (B2 markers retained where dual-surface) |
| ACN21–23 IDs | Re-pointed from Juflona pilot IDs to ODS Batch 1 screen IDs |
| Billing tests | Assert ODS stitch IDs |

---

## 3. Matrix

Legend — **Pass** / **Partial** / **Gap** / **N/A** (no Stitch frame for that viewport).

| Screen | Desktop | Mobile | Functional | RBAC | Persistence | Parity | Gap |
|--------|---------|--------|------------|------|-------------|--------|-----|
| ACN01 Clinic Setup Checklist | Pass | Pass | Pass | Pass | Pass | Partial | Stitch 8-step marketing cards / publication simulator not rebuilt; fact-driven checklist retained |
| ACN02 Services & Pricing | Pass | Pass | Pass | Pass | Pass | Pass | Practitioner filter column simplified vs Stitch “All Practitioners” dropdown |
| ACN03 Add/Edit Service | Pass | N/A | Pass | Pass | Pass | Partial | Mobile frame absent in Stitch; desktop form density close |
| ACN04 Practitioners Directory | Pass | Pass | Pass | Pass | Pass | Partial | Credential/specialty chrome denser in Stitch |
| ACN05 Practitioner Availability | Pass | Pass | Pass | Pass | Pass | Partial | Weekly grid visual weight lighter than Stitch |
| ACN06 Appointment Calendar | Pass | Pass | Pass | Pass | Pass | Partial | Week grid chrome shared with B2; blocked-time styling simpler |
| ACN07 Create Appointment | Pass | N/A | Pass | Pass | Pass | Partial | Conflict validator panel less illustrated than Stitch |
| ACN08 Appointment Detail | Pass | N/A* | Pass | Pass | Pass | Partial | Dual-marked AC-B2-05; ODS desktop ID wired; no ODS mobile frame |
| ACN09 Booking Requests | Pass | N/A | Pass | Pass | Pass | Partial | Review actions denser in Stitch |
| ACN10 Patient Directory | Pass | Pass | Pass | Pass | Pass | Partial | Dual-marked AC-B2-02; ODS IDs wired; some B2 columns unsupported |
| ACN11 Patient Profile & Consent | Pass | Pass | Pass | Pass | Pass | Partial | Consent ledger UI plainer than Stitch history cards |
| ACN12 Patient Check-in | Pass | Pass | Pass | Pass | Pass | Partial | Stepper chrome lighter |
| ACN13 Live Patient Queue | Pass | Pass | Pass | Pass | Pass | Partial | Call-next emphasis weaker than Stitch |
| ACN14 Practitioner Worklist | Pass | Pass | Pass | Pass | Pass | Partial | Task cards vs Stitch priority lanes |
| ACN15 Clinical Encounter | Pass | Pass | Pass | Pass | Pass | Partial | Workspace panels less segmented |
| ACN16 Follow-up Worklist | Pass | Pass | Pass | Pass | Pass | Partial | Filter chips / overdue emphasis lighter |
| ACN21 Invoices & Ledgers | Pass | Pass | Pass | Pass | Pass | Partial | Ledger summary strip simpler than Stitch |
| ACN22 Create/Edit Invoice | Pass | N/A | Pass | Pass | Pass | Partial | Line editor denser in Stitch |
| ACN23 Payment & Receipt | Pass | Pass | Pass | Pass | Pass | Partial | Receipt print chrome functional; Stitch “Statutory” wording intentionally not used (product: Receipt) |
| ACN25 Performance Dashboard | Pass | Pass | Pass | Pass | Pass | Partial | Chart/illustration weight lower; KPI cards present |
| ACN26 Data Import/Export | Pass | Pass | Pass | Pass | Pass | Partial | Job history table plainer; preview/commit flow complete |

\*ACN08 mobile: no dedicated ODS mobile screen; B2 mobile ID retained as fallback.

---

## 4. Remaining justified gaps (not fixed)

1. **ACN01** — Do not invent cosmetic Stitch marketing checklist steps that are not fact-driven.
2. **Dual B2 surfaces** — ACN08/ACN10 share Batch 2 workspace chrome; Batch 1 ODS IDs are attributed without redesigning B2 layouts.
3. **ACN23 naming** — Product keeps **Receipt** (not “Statutory Receipt”) per billing pass.
4. **Stitch-only decorative** — Connectivity meters, HPCZ compliance banners, and illustrated empty graphics not copied where they imply false operational state.
5. **Viewports without Stitch frames** — ACN03/07/08/09/22 mobile marked N/A or fallback.

---

## 5. Verification

- Stitch inventory confirmed via MCP `list_screens` on `12134201997833374170`.
- Design foundation + ACN02 desktop screenshots reviewed against frozen palette.
- Batch1a billing stitch-marker assertions updated to ODS IDs.
- Production hosts unchanged.

---

## 6. Final marker

**`V2_03_AC_BATCH1_STITCH_PARITY_COMPLETE_WITH_GAPS`**
