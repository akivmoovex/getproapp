# GetPro Android App — Jetpack Compose & Material 3 Specification

**Product:** GetPro multi-tenant professional directory (Node.js + Express + SSR today).  
**Target:** A **native Android** client that **does not port the web layout** — it re-implements the **core journey** with Material Design 3 and mobile-first patterns.

**Core journey (unchanged):**

1. Search for a professional  
2. View the professional profile  
3. Call or contact the business  

---

## Part 1 — Purpose of this document

This spec is **implementation-ready** for Android engineers: screens, navigation, M3 mapping, package layout, backend touchpoints, and MVP phasing. It is grounded in the current repository (`src/routes/public.js`, `src/routes/api.js`, shared search/cards/callback patterns).

---

## Part 2 — Current product analysis

### 2.1 Public routes (tenant app, `src/routes/public.js`)

| HTTP route | Template / behavior |
|------------|----------------------|
| `GET /` | Home / launcher (`index.ejs`) |
| `GET /directory` | Directory results (`directory.ejs`); query: `q`, `city`, `category` |
| `GET /category/:categorySlug` | Category-scoped results (`category.ejs`) |
| `GET /company/:id` | Company profile (`company.ejs`) |
| `GET /join` | Partner onboarding (`join.ejs`) |
| `GET /articles`, `GET /articles/:slug` | Editorial (`content_index_public`, `content_article`) |
| `GET /guides`, `GET /guides/:slug` | Guides (same article template) |
| `GET /answers`, `GET /answers/:slug` | FAQ (`content_faq`) |
| `GET /sitemap.xml`, `GET /robots.txt` | SEO (non-UI) |
| `GET /:miniSiteSlug` | Company mini-site (same domain; reserved segments excluded) |

Platform / non-consumer routes (not in consumer app): `/admin/*`, `/api/*` (except app-used POSTs), `/healthz`, `/getpro-admin`, apex region gates.

### 2.2 Major UI sections (web, conceptual)

| Area | Web implementation | App analogue |
|------|---------------------|--------------|
| Search | Shared `pro_search_form` partial; service + city + submit; optional hidden `category` | Home search row + results filters |
| Categories | Grid links to `/category/:slug` | Categories destination + chips |
| Results | `directory_company_cards`; count + chips | `LazyColumn` of cards |
| Profile | Hero, about, services, gallery, reviews, lead form, aside contact | Single scroll + bottom actions |
| Empty / no match | `directory_empty_state` + `directory-empty-callback.js` | Results empty state + `CallbackSheet` |
| Join | Multi-step `join.ejs` + `/api/professional-signups` | `JoinBusinessScreen` |

### 2.3 User flows (today)

- **Search → results:** `GET /directory?q=&city=&category=` (SSR).  
- **Category browse → results:** `GET /category/:slug` or directory with category.  
- **Results → profile:** link to `/company/:id` (and mini-site on subdomain).  
- **Profile → call / WhatsApp:** `tel:` / WhatsApp href from tenant + company data.  
- **Profile → lead:** `POST /api/leads` with `company_id`, name, phone, email, message.  
- **No results → callback:** `POST /api/callback-interest` with `tenantId`, `tenantSlug`, name, phone, `context`, `interest_label`.  
- **Join:** `POST /api/professional-signups` with profession, city, name, phone, `vat_or_pacra`, tenant resolution.

### 2.4 Route → mobile app role

| Route | Screen role | Notes |
|-------|-------------|--------|
| `/` | **launcher** | Search entry + shortcuts; not a marketing long-scroll in app |
| `/directory` | **results** | Primary results surface |
| `/directory?…` | **results** | Same screen, state |
| `/category/:slug` | **results** | Filtered list; same pattern as directory |
| `/company/:id` | **profile** | Professional detail |
| `/:miniSiteSlug` | **profile** | Same role as company (optional deep link later) |
| `/join` | **support** | Onboarding |
| `/articles*`, `/guides*`, `/answers*` | **support** | Optional Phase 3 |
| SEO, errors | **support** / system | No first-class screens |

### 2.5 Duplicated responsibilities

- **`/directory` vs `/category/:slug`:** both are **results** with different default filter — app should use **one** `SearchResultsScreen` with parameters (`categorySlug` optional).  
- **Home vs directory search:** web repeats search — app: **launcher** submits into **results** with same query model.

### 2.6 Overloaded web pages (do not mirror 1:1)

| Web page | Issue | App handling |
|----------|--------|----------------|
| Home (desktop) | Many marketing blocks | **Launcher** only: search + categories + one help action |
| Company page | Aside + long body | **Profile** stack: header → actions → content → lead |
| Join | Long form | **JoinBusinessScreen** with steps, not a web scroll |

### 2.7 Not first-class in the app

- Full marketing homepage sections (pricing, testimonials, article grids on home).  
- Admin / `getpro-admin` entry.  
- Duplicate “Search” links in multiple nav rows.  
- Web-only affordances: hero photo band, footer sitemap wall.

---

## Part 3 — Android screen architecture

Naming aligns with **Jetpack Compose** and **typed navigation**. These are **not** web route names — they are **app destinations**.

### 3.1 Required screens

#### HomeScreen (launcher)

| | |
|--|--|
| **Purpose** | Fast entry: search by service + city; shortcuts to categories; optional “help call” |
| **Key UI** | `SmallTopAppBar`, search fields (OutlinedTextField), primary “Search”, category chips or compact grid, optional text button “List your business” |
| **Data** | Tenant branding, categories list (`GET` — *needs API*, see Part 10), optional support phone from tenant config |
| **Primary action** | Navigate to `SearchResults` with `q`, `city`, `category` |
| **Secondary** | Open `Category` / `BusinessEntry` / `JoinBusiness` |
| **Nav** | Start destination; back exits app (root) |
| **vs web** | No hero image band; no article strip |

#### SearchResultsScreen

| | |
|--|--|
| **Purpose** | Browse matches; refine query; handle empty state |
| **Key UI** | Top bar + optional filter row (chips), result count, `LazyColumn` of professional cards |
| **Data** | List of companies + review summary (*needs read API*), query state |
| **Primary** | Open `ProfessionalProfile` |
| **Secondary** | Refine search (inline or bottom sheet), empty → `CallbackSheet` |
| **Nav** | From Home; back → Home or previous |
| **vs web** | Single column list; no oversized toolbar |

#### ProfessionalProfileScreen

| | |
|--|--|
| **Purpose** | Conversion: call, WhatsApp, read trust signals, optional lead |
| **Key UI** | Collapsing/scroll header (name, category, location), **sticky bottom bar** or prominent `FilledButton` Call, `OutlinedButton` WhatsApp, sections: about, services, photos carousel, reviews, lead form |
| **Data** | Company by id (*needs read API*), category, reviews, media |
| **Primary** | `Intent.ACTION_DIAL`, WhatsApp intent |
| **Secondary** | Submit lead (`POST /api/leads`) |
| **Nav** | From results; deep link `company/{id}` |
| **vs web** | No duplicate “directory help” block on phone; QR optional later |

#### CategoryScreen

| | |
|--|--|
| **Purpose** | Pick a category → land in results with `category` preset |
| **Key UI** | `LazyVerticalGrid` or list of `AssistChip` / compact cards |
| **Data** | Categories (*needs API*) |
| **Primary** | Navigate to `SearchResults` with `categorySlug` |
| **Secondary** | Search without category |
| **Nav** | Bottom nav “Categories” |
| **vs web** | No separate marketing chrome |

#### CallbackSheet (modal)

| | |
|--|--|
| **Purpose** | Capture interest when search returns no suitable row (parity with `directory_empty_state` + `/api/callback-interest`) |
| **Key UI** | `ModalBottomSheet` with name, phone, submit; success state |
| **Data** | `tenantId`, `tenantSlug`, `context`, `interest_label` (strings aligned with web) |
| **Primary** | `POST /api/callback-interest` |
| **Nav** | Shown from `SearchResults` empty state; dismiss |
| **vs web** | Same logic; native sheet instead of inline card |

#### BusinessEntryScreen

| | |
|--|--|
| **Purpose** | Entry point for “I’m a business” — routes to join or help |
| **Key UI** | Short copy + `FilledButton` “List your business” → `JoinBusinessScreen`; optional link to help / call |
| **Data** | Tenant support copy (static or remote config) |
| **Primary** | Navigate to `JoinBusiness` |
| **Nav** | Bottom nav “Business” |

#### JoinBusinessScreen

| | |
|--|--|
| **Purpose** | Partner signup (parity with `/join` + `/api/professional-signups`) |
| **Key UI** | Stepper or single scroll: profession, city, name, phone, optional VAT/PACRA |
| **Data** | Tenant resolution in body |
| **Primary** | `POST /api/professional-signups` |
| **Nav** | From `BusinessEntry` or deep link |
| **vs web** | Fewer distractions; focus on fields and validation |

### 3.2 Optional screens (Phase 3)

| Screen | Purpose |
|--------|---------|
| **ArticleListScreen** | Lists published articles (`kind=article`) |
| **ArticleDetailScreen** | HTML or rich text body from CMS |
| **QAScreen** | FAQ list + detail |

Implement as **nested graph** under “Help” or overflow — not in bottom bar by default.

---

## Part 4 — Navigation structure

### 4.1 Bottom navigation (3 items — recommended)

| Item | Destination | Rationale |
|------|-------------|-----------|
| **Home** | `HomeScreen` | Launcher / search |
| **Categories** | `CategoryScreen` | Fast slice into results without typing |
| **Business** | `BusinessEntryScreen` | Join + list business; matches product “supply side” |

**Removed vs web:** no parallel “Search” and “Categories” both pointing to `/directory`; **Categories** is explicit; **Home** owns search.

### 4.2 Graph (primary funnel)

```
Home --search--> SearchResults --tap--> ProfessionalProfile --call/whatsapp--> (system)
                      |
                      +--empty--> CallbackSheet (modal)
```

```
Home --category chip--> SearchResults (preset category)
Categories --select--> SearchResults (preset category)
```

### 4.3 Why this structure

- **One primary funnel** (search → profile → call) with **minimal tabs**.  
- **Categories** as its own tab avoids burying browse behind search.  
- **Business** isolates onboarding from consumer search (support role).  
- **Articles/Q&A** are not in the bottom bar — they are **support** and would dilute conversion.

### 4.4 Removed compared to web

- Full multi-link header (Search, Categories, List…) collapsed into **bottom nav + top app bar actions**.  
- Footer-heavy “learn more” — optional single overflow menu.  
- Region globe (if needed later: **settings** or first-run).

---

## Part 5 — Material 3 component mapping

| Web (GetPro) | Material 3 (Compose) | Why |
|--------------|----------------------|-----|
| Site header / app bar | `TopAppBar` / `SmallTopAppBar` | Standard system insets, title + actions |
| Search form | `OutlinedTextField` + `FilledButton` | Touch-friendly, clear affordance |
| Category grid links | `FilterChip` / `AssistChip` or `Card` in `LazyVerticalGrid` | Scannable, compact |
| Directory cards | `OutlinedCard` or `ElevatedCard` in `LazyColumn` | List semantics; one tap target per row |
| Primary CTA | `Button` (filled) | Single primary per screen |
| Secondary | `OutlinedButton` or `TextButton` | Clear hierarchy |
| Callback block | `ModalBottomSheet` + `ModalBottomSheetLayout` | Native transient task |
| Long profile | `LazyColumn` + sticky header or `PinnedScrollBehavior` | Performance |
| Web lead form | `TextField` + validation in column | Same data as `/api/leads` |

---

## Part 6 — Screen-by-screen Compose structure (pseudo-code)

### HomeScreen

```kotlin
Scaffold(
    topBar = {
        SmallTopAppBar(
            title = { Text("GetPro") },
            actions = { /* region/help overflow optional */ }
        )
    }
) { padding ->
    LazyColumn(Modifier.padding(padding)) {
        item { HeadlineBlock() } // short title + subtitle
        item { SearchCard(
            onSearch = { q, city -> nav.navigate(Results(q, city, null)) }
        ) }
        item { CategoryShortcutsRow(categories, onNavigate) }
        item { TextButton(onClick = { nav.navigate(BusinessEntry) }) { Text("List your business") } }
    }
}
```

### SearchResultsScreen

```kotlin
Scaffold(
    topBar = {
        TopAppBar(
            title = { Text("Results") },
            navigationIcon = { BackButton() }
        )
    },
    floatingActionButton = {
        // Optional: refine — or embed filter row in content
        SmallFloatingActionButton(onClick = { showRefineSheet = true }) { Icon(Icons.Default.Tune) }
    }
) { padding ->
    LazyColumn(Modifier.padding(padding)) {
        item { ResultsSummary(count = state.total) }
        chipsRow(state.filters)
        if (state.items.isEmpty()) {
            item { EmptyState(onRequestCallback = { showCallbackSheet = true }) }
        } else {
            items(state.items) { company ->
                ProfessionalCard(company, onClick = { nav.navigate(Profile(company.id)) })
            }
        }
    }
    if (showCallbackSheet) CallbackSheet(onDismiss = { ... })
}
```

### ProfessionalProfileScreen

```kotlin
Scaffold(
    topBar = { TopAppBar(title = { Text(company.name) }, navigationIcon = { BackButton() }) },
    bottomBar = {
        Surface(tonalElevation = 3.dp) {
            Row(Modifier.padding(16.dp).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = dial, modifier = Modifier.weight(1f)) { Text("Call") }
                OutlinedButton(onClick = whatsapp, modifier = Modifier.weight(1f)) { Text("WhatsApp") }
            }
        }
    }
) { padding ->
    LazyColumn(Modifier.padding(padding)) {
        item { ProfileHeader(company) }
        item { AboutSection(company.about) }
        if (company.services.isNotEmpty()) item { ServicesList(company.services) }
        item { ReviewsSection(reviews) }
        item { LeadFormCard(onSubmit = { postLead(...) }) }
    }
}
```

### CategoryScreen

```kotlin
Scaffold(
    topBar = { SmallTopAppBar(title = { Text("Categories") }) },
    bottomBar = { /* same bottom nav host */ }
) { padding ->
    LazyVerticalGrid(
        columns = GridCells.Adaptive(minSize = 160.dp),
        Modifier.padding(padding),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(categories) { cat ->
            AssistChip(
                onClick = { nav.navigate(Results(category = cat.slug)) },
                label = { Text(cat.name) }
            )
        }
    }
}
```

---

## Part 7 — UX simplification rules (explicit non-porting)

| Web element | App decision |
|-------------|--------------|
| Long homepage hero + marketing | **Removed** from launcher; optional brand color only |
| Pricing awareness blocks | **Removed** |
| Testimonial walls | **Removed** |
| Articles + guides on home | **Removed** from launcher; optional Phase 3 “Help” |
| Q&A on main screens | **Removed** |
| Admin / getpro-admin | **Never** linked |
| Oversized category tiles | **Replaced** with chips or dense grid |
| Cluttered filters | **Collapsed** to chips + “Refine” sheet |
| Directory toolbar duplicate | **Single** search model on Home + Results |
| Company sidebar QR / support | **Delayed** — settings or “More” if needed |

---

## Part 8 — Design system (Material 3 tokens)

### Color roles (map from tenant theme)

| Role | Usage |
|------|--------|
| `primary` | Brand / primary buttons |
| `onPrimary` | Text on primary |
| `surface` | Cards, sheets |
| `onSurface` | Primary text |
| `surfaceVariant` | Subtle backgrounds |
| `outline` | Borders, dividers |
| `background` | Screen behind scroll |

Tenant-specific **primary** should come from remote config or build flavor per region (e.g. Zambia vs Israel).

### Shape

| Element | Suggested corner radius |
|---------|-------------------------|
| Buttons | `full` (pill) or 20.dp — pick one system-wide |
| Cards | 12.dp |
| Bottom sheet | 16.dp top |

### Spacing scale

Use **4dp grid:** 4, 8, 12, 16, 24, 32.

### Touch targets

Minimum **48dp** height for interactive elements (`Modifier.minimumInteractiveComponentSize()`).

### Typography (Material 3)

| Token | Use |
|-------|-----|
| `titleLarge` / `titleMedium` | Screen titles, company name |
| `bodyMedium` | Descriptions, reviews |
| `labelLarge` | Buttons, chips |
| `headlineSmall` | Empty state titles |

---

## Part 9 — Package structure

```
com.getpro.app/
├── MainActivity.kt                 # Entry + setContent + NavHost
├── data/
│   ├── remote/                     # Retrofit/Ktor, DTOs, ApiService
│   ├── local/                      # DataStore, optional cache
│   └── repository/                 # Impls
├── domain/
│   ├── model/                      # Company, Category, SearchQuery, Tenant
│   └── usecase/                    # SearchProfessionals, GetProfile, SubmitLead, etc.
├── ui/
│   ├── theme/                      # Theme.kt, Color.kt, Type.kt
│   ├── navigation/                 # NavGraph, routes, deep links
│   ├── components/                 # ProfessionalCard, EmptyState, CallbackSheetContent
│   └── screens/
│       ├── home/
│       ├── results/
│       ├── profile/
│       ├── category/
│       ├── business/
│       └── join/
└── di/                             # Hilt modules (optional)
```

### Responsibilities

- **data:** HTTP, JSON, error mapping; no UI.  
- **domain:** pure use cases + models; testable.  
- **ui:** Compose only; state via `ViewModel` + `UiState`.  
- **navigation:** single source of truth for routes.

---

## Part 10 — API requirements (grounded in current backend)

### Existing JSON APIs (`/api/*`)

| Endpoint | Method | Body (summary) | Use in app |
|----------|--------|----------------|------------|
| `/api/leads` | POST | `company_id`, `name`, `phone`, `email`, `message` | Profile lead submit |
| `/api/professional-signups` | POST | `profession`, `city`, `name`, `phone`, `vat_or_pacra`, `tenantId` + `tenantSlug` | Join business |
| `/api/callback-interest` | POST | `name`, `phone`, `tenantId`, `tenantSlug`, `context`, `interest_label` (+ optional `cityName`) | Callback sheet / empty |

**Validation:** Zambia (`zm`) phone rules enforced server-side — mirror client-side for UX.

### Read paths (SSR today — **app needs JSON or BFF**)

The web renders directory and company via **EJS + SQL** in `public.js` — there is **no** stable public JSON list for:

- Categories for tenant  
- Search results (companies) for `q`, `city`, `category`  
- Company detail by `id`  
- Reviews / media for company  

**Recommended implementation (backend):**

Add versioned read endpoints, e.g.:

| Proposed endpoint | Purpose |
|-------------------|---------|
| `GET /api/v1/categories` | List categories for `tenant` (host header or `X-Tenant-Id`) |
| `GET /api/v1/directory` | Query params: `q`, `city`, `category` — same semantics as `GET /directory` |
| `GET /api/v1/companies/:id` | Profile DTO + category + review stats + media |

**Alternative:** Short-term **WebView** for non-MVP flows only — **not** recommended for core funnel.

### Android use case mapping

| Use case | Backend |
|----------|---------|
| `LoadCategories` | `GET /api/v1/categories` (new) |
| `SearchProfessionals` | `GET /api/v1/directory` (new) |
| `GetProfessionalProfile` | `GET /api/v1/companies/:id` (new) |
| `SubmitLead` | `POST /api/leads` (exists) |
| `SubmitCallbackInterest` | `POST /api/callback-interest` (exists) |
| `SubmitProfessionalSignup` | `POST /api/professional-signups` (exists) |

**Tenant resolution:** Match web — host-based tenant (`tenant` middleware) or explicit `tenantId`/`tenantSlug` in body for writes; reads should use same tenant as app build config.

---

## Part 11 — MVP build plan

### Phase 1 — Core funnel (ship first)

- **HomeScreen** + **SearchResultsScreen** + **ProfessionalProfileScreen** + **CallbackSheet**  
- Wire **POST** APIs that already exist; add **minimum read API** (or one combined `/api/v1/directory` + `/api/v1/companies/:id`) for MVP.

**Why first:** Delivers the product promise (search → profile → call) and validates backend contract.

### Phase 2 — Categories + business

- **CategoryScreen** + **BusinessEntryScreen** + **JoinBusinessScreen**  
- Categories depend on read API; join uses existing POST.

**Why second:** Browse path and supply-side without blocking consumer MVP.

### Phase 3 — Help / content

- **ArticleListScreen**, **ArticleDetailScreen**, **QAScreen**  
- Requires content JSON or HTML pipeline (or WebView fallback).

**Why last:** Support role; does not block conversion.

---

## Part 12 — Final summary

1. **Screen architecture:** Launcher → Results → Profile; **Callback** as sheet; **Categories** as browse; **Business** tab for join/support.  
2. **Navigation model:** Bottom nav (Home, Categories, Business) + stack for results/profile; **no** web-style footer nav.  
3. **Key UX improvements:** Single-column focus, native dial/WhatsApp, bottom actions on profile, **no** marketing homepage in app.  
4. **Intentionally NOT ported:** Long homepage, pricing, testimonials, mixed articles on home, admin links, web-only hero.  
5. **Why better on Android:** Material 3 patterns, **48dp** targets, **one primary action** per step, **ModalBottomSheet** for callbacks, **LazyColumn** performance — aligned with **call/contact conversion** rather than page parity.

---

## Document control

| Version | Date | Notes |
|---------|------|--------|
| 1.0 | 2026-03-20 | Initial spec aligned with GetPro repo routes and `/api` |

*Update when `public.js` routes or `api.js` contracts change.*
