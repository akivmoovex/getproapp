# Android UI mapping (web design system → Material 3 / Compose)

**Purpose:** First-pass **conceptual bridge** between the **stable web design system** (`docs/DESIGN_SYSTEM.md`, `public/theme.css`, `public/design-system.css`) and a **native Android** client using **Material 3** and **Jetpack Compose**, without duplicating full specs elsewhere.

**Grounded in repo docs:**

- **`docs/DESIGN_SYSTEM.md`** — tokens, BEM blocks, buttons, forms, state blocks.  
- **`docs/MATERIAL_DESIGN_3.md`** — how web maps M3 tokens (`--md-sys-*`).  
- **`docs/MOBILE_SCREEN_INVENTORY.md`** — route → screen role (launcher / results / profile / support).  
- **`docs/android-material3-spec.md`** — Android product + journey.  
- **`docs/android-api-contracts.md`** — backend ↔ app flows.  
- **`docs/android-ui-templates/README.md`** — Compose template layout (`com.getpro.app`).  

**Assumption:** Future app uses **Compose + Material3** as in `docs/android-ui-templates/` unless the team explicitly chooses otherwise.

---

## 1. Design-system concept → Android (Material 3) concept

| Web (GetPro) | Android analogue | Notes |
|--------------|------------------|--------|
| **`--color-primary` / `--wf-primary`** | `MaterialTheme.colorScheme.primary` | Map tenant/brand in `GetProTheme.kt` (see templates). |
| **Surface / `--color-bg`, `--color-surface`** | `colorScheme.background`, `surface`, `surfaceContainer*` | Layered surfaces per M3. |
| **Text primary / muted** | `onSurface`, `onSurfaceVariant` | Don’t hardcode grays; use roles. |
| **Success / error / info (flash, state blocks)** | `ColorScheme` custom extensions or semantic slots | Align emotionally with web; exact hex may differ for platform. |
| **`.btn.btn--primary`** | `Button` (filled) / `FilledButton` | One primary action per compact view when possible. |
| **`.btn.btn--secondary`** | `OutlinedButton` / tonal variant | Match outline + brand border intent. |
| **`.btn.btn--text`** | `TextButton` | Low-emphasis links and tool actions. |
| **`.card` / directory cards** | `Card` + `ListItem` or custom row | Web card is full-row link; Android may use ripple + click on row. |
| **`.input-field*`** | `OutlinedTextField` + label/supporting text | Same semantics: label, error, help. |
| **`.form-step` / admin rhythm** | `Column` spacing + `Stepper` only if product needs steps | Public web join is multi-step; map to M3 step patterns if needed. |
| **`.flash` / `.state-block*`** | `Snackbar`, `AssistChip`+banner, or inline `Text` in semantic color | Prefer non-blocking for info; `Snackbar` for transient success. |
| **M3 modal shell (web)** | `ModalBottomSheet`, `Dialog` | Region picker / callbacks — see `RequestCallbackSheet` in templates. |
| **Elevation (`--elevation-*`, `--md-sys-elevation-*`)** | `CardDefaults.cardElevation`, `tonalElevation` | Keep subtle; web avoids heavy shadows. |

**Naming discipline (Android):** Prefer **feature + role** in composable names aligned with templates: `GetProTopAppBar`, `ProfessionalCard`, `SearchCard`, `ProfileBottomActionBar`, `EmptyResultsCard`, `RequestCallbackSheet` (`docs/android-ui-templates/README.md`).

---

## 2. Token / category mapping (conceptual)

| Category | Web source | Android |
|----------|------------|---------|
| **Color roles** | `--color-*`, `--flash-*`, `--md-sys-color-*` in `theme.css` | `ColorScheme` + light/dark if needed; tenant tint in theme layer. |
| **Typography** | `--font-family-body`, `--text-xs`…`--text-xl`, `--typo-*` | `Typography` scale: `display`, `headline`, `title`, `body`, `label` — map web “section title” → `titleLarge` / `titleMedium` consistently. |
| **Spacing** | `--space-*`, `--gp-ds-space-*`, `--md-sys-spacing-*` | `Dp` via `dimensionResource` or theme spacing constants; keep **8dp rhythm** where web uses `--space-1` (8px). |
| **Shape / corners** | `--radius-sm`…`--radius-xl`, `--md-sys-shape-corner-*` | `Shapes` / `RoundedCornerShape` — cards **medium** (12dp) aligned with web cards. |
| **Elevation** | `--elevation-sm/md`, M3 elevation tokens | M3 surface tonal elevation; avoid iOS-style heavy shadow. |
| **State** | `.status-message--*`, focus rings | `InteractionSource`, `contentColorFor`, error color on fields. |

**Shared conceptually:** semantic color meaning, spacing rhythm, one primary CTA per screen where possible.

**Platform-native:** exact font files (Inter vs Roboto), motion curves, haptics, back gesture — **do not** force web pixel parity.

---

## 3. Screen groups (product surfaces)

Aligned with **`docs/MOBILE_SCREEN_INVENTORY.md`** and Compose templates under `docs/android-ui-templates/kotlin/...`.

### 3.1 Launcher — home / discovery

| | |
|--|--|
| **Web routes** | `GET /` |
| **Screen role** | `launcher` |
| **Template** | `HomeScreen.kt`, `HomeViewModel.kt` |
| **Purpose** | Search-first entry; shortcuts to directory/categories. |
| **Entry** | Cold start, deep link to home. |
| **Major regions** | Top bar, search row, category shortcuts, optional compact help link. |
| **Primary actions** | Submit search → results; open directory. |
| **Reusable components** | `GetProTopAppBar`, `SearchCard`, `CategoryChipRow`, `GetProBottomNav` (if used). |
| **Perf notes** | Mirror web: **no** heavy media ATF; LCP = hero/search equivalent — keep first frame light. |

### 3.2 Results — directory / search / category

| | |
|--|--|
| **Web routes** | `GET /directory`, `GET /directory?…`, `GET /category/:slug` |
| **Screen role** | `results` |
| **Templates** | `SearchResultsScreen.kt`, `CategoryScreen.kt`, `SearchResultsViewModel`, `CategoryViewModel` |
| **Purpose** | List professionals; filters/chips; count. |
| **Entry** | Search from home; category deep link. |
| **Major regions** | Toolbar + chips, `LazyColumn` of cards, FAB refine (web has FAB). |
| **Primary actions** | Open profile; refine search. |
| **Reusable components** | `ProfessionalCard`, `EmptyResultsCard`, `RequestCallbackSheet` (callback parity with empty state). |
| **Perf notes** | **LazyColumn** / pagination mindset; avoid recomputing full list on every keystroke; align with web **guarded** JS (no heavy global work). |

### 3.3 Profile — company mini-site / company id

| | |
|--|--|
| **Web routes** | `GET /:miniSiteSlug`, `GET /company/:id` (same `company.ejs`) |
| **Screen role** | `profile` |
| **Template** | `ProfessionalProfileScreen.kt`, `ProfessionalProfileViewModel.kt` |
| **Purpose** | Credibility + contact + optional lead. |
| **Entry** | Card tap; deep link. |
| **Major regions** | Header (name, headline, logo), body sections, **bottom action bar** (call / WhatsApp), lead sheet optional. |
| **Primary actions** | Call, WhatsApp, request contact. |
| **Reusable components** | `ProfileBottomActionBar`, fields for lead form. |
| **Perf notes** | Logo **high priority** if shown; gallery **lazy** — match web `loading` / aspect-ratio discipline. |

### 3.4 Join / onboarding — business signup

| | |
|--|--|
| **Web routes** | `GET /join` |
| **Screen role** | `support` (inventory) — onboarding flow |
| **Templates** | `BusinessEntryScreen.kt`, `JoinBusinessScreen.kt`, `JoinBusinessViewModel.kt` |
| **Purpose** | Capture business signup; `POST /api/professional-signups`. |
| **Entry** | Deep link `/join`; nav from “list business”. |
| **Major regions** | Steps/forms, validation, success. |
| **Primary actions** | Submit application. |
| **Reusable components** | Form fields aligned with `input-field` semantics. |
| **Perf notes** | Match web: **route-scoped** `join.js` — don’t load onboarding code on launcher. |

### 3.5 Callback / lead / contact

| | |
|--|--|
| **Web** | Lead `POST /api/leads`; callback `POST /api/callback-interest` (empty state + join flows). |
| **Templates** | `CallbackViewModel.kt`, `RequestCallbackSheet`, `CallbackRepository` |
| **Purpose** | Capture interest without full profile visit. |
| **Parity** | Same JSON contracts as **`docs/android-api-contracts.md`** / callback docs. |

### 3.6 Profile (user) / optional support content

| | |
|--|--|
| **Web** | Articles, guides, Q&A — **support** role. |
| **Templates** | `ArticleListScreen`, `ArticleDetailScreen`, `QAScreen` (optional). |
| **Note** | Secondary to core loop; JSON/WebView TBD per **`docs/android-api-contracts.md`**. |

---

## 4. Web ↔ Android parity

| Stay aligned (brand + UX) | Intentionally different (native) |
|---------------------------|----------------------------------|
| Primary brand color / trust tone | Roboto / system typography, not Inter |
| Core loop: search → list → profile → contact | Bottom nav, system back, sheets |
| Form labels and validation messages | Platform IME, focus, accessibility |
| Spacing rhythm (8dp-like) | Exact dp values from Material spacing |
| Semantic success/error for submit | Snackbar duration, platform sound/haptics |

**Strict parity is harmful when:** it forces web layout (multi-column desktop blocks), web font loading, or non-standard gestures on Android.

---

## 5. Implementation staging plan

| Phase | Focus | Deliverables |
|-------|--------|----------------|
| **1** | Tokens + components | `GetProTheme.kt` color/spacing/typography mapping table; reusable composables list aligned with §1–2. |
| **2** | Screen templates | Wireframes or Compose previews for Launcher, Results, Profile, Join — mirror `Routes.kt` / `AppNavigation.kt`. |
| **3** | Compose-ready specs | Stable props for each screen + ViewModel contracts; empty/error/loading states. |
| **4** | Data + API | Swap fakes per **`docs/android-repository-swap-plan.md`** (if present) and **`docs/android-api-contracts.md`**. |

---

## 6. References (read next)

- **`docs/android-ui-templates/README.md`** — file layout and component names.  
- **`docs/android-material3-spec.md`** — full Android product spec.  
- **`docs/MOBILE_SCREEN_INVENTORY.md`** — route → screen role (launcher / results / profile / support).  
- **`docs/android-onboarding-api.md`**, **`docs/android-profile-api.md`** — read contracts for flows you implement.  
- **Web:** **`docs/DESIGN_SYSTEM.md`** — single source for web semantics this mapping mirrors.
