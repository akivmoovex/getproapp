# GetPro Android UI templates (Jetpack Compose)

Kotlin **templates** for a future `app` module. They are **not** built by this Node repository — copy into an Android Studio project (`com.getpro.app`).

**Requires (typical):**

- Kotlin 1.9+
- Compose BOM + `material3`, `ui`, `foundation`
- `navigation-compose`
- `activity-compose`
- `material-icons-extended` optional (templates use `Icons.Filled.*` from core where possible)

**Suggested:** `minSdk 26`, `compileSdk 34+`, enable Compose in `build.gradle.kts`.

See `docs/android-material3-spec.md` for product context.

## File layout (under `kotlin/com/getpro/app/`)

| Path | Role |
|------|------|
| `MainActivity.kt` | `setContent` + `AppNavigation` + `SampleData` |
| `ui/model/UiModels.kt` | UI models / form state |
| `ui/support/SampleData.kt` | Preview + navigation sample lists |
| `ui/theme/GetProTheme.kt` | `MaterialTheme` wrapper |
| `ui/navigation/Routes.kt` | Route constants |
| `ui/navigation/AppNavigation.kt` | `NavHost` graph |
| `ui/components/*` | Reusable composables (see below) |
| `ui/screens/home/HomeScreen.kt` | Launcher |
| `ui/screens/results/SearchResultsScreen.kt` | Directory results |
| `ui/screens/profile/ProfessionalProfileScreen.kt` | Company profile |
| `ui/screens/category/CategoryScreen.kt` | Category grid |
| `ui/screens/business/BusinessEntryScreen.kt` | Business tab entry |
| `ui/screens/business/JoinBusinessScreen.kt` | Join form |
| `ui/screens/support/ArticleListScreen.kt` | Optional |
| `ui/screens/support/ArticleDetailScreen.kt` | Optional |
| `ui/screens/support/QAScreen.kt` | Optional |

**Components:** `GetProTopAppBar`, `GetProBottomNav`, `SearchCard`, `ProfessionalCard`, `CategoryChipRow`, `ProfileBottomActionBar`, `EmptyResultsCard`, `RequestCallbackSheet` (+ `CallbackSheet` alias).
