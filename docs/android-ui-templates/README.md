# GetPro Android UI templates (Jetpack Compose)

Kotlin **templates** for a future `app` module. They are **not** built by this Node repository — copy into an Android Studio project (`com.getpro.app`).

**Requires (typical):**

- Kotlin 1.9+
- Compose BOM + `material3`, `ui`, `foundation`
- `navigation-compose`
- `activity-compose`
- `lifecycle-viewmodel-compose` + `lifecycle-runtime-ktx` (ViewModels + `viewModel()`)
- `kotlinx-coroutines-android` (for `viewModelScope` / fake delays)
- `material-icons-extended` optional (templates use `Icons.Filled.*` from core where possible)

**Suggested:** `minSdk 26`, `compileSdk 34+`, enable Compose in `build.gradle.kts`.

**Prototype wiring:** `data/` fake repositories + `ui/viewmodel/` + `AppDependencies` service locator. Replace with Hilt + Retrofit when the API is ready.

See `docs/android-material3-spec.md` for product context.

**API & migration (backend alignment):**

- `docs/android-api-contracts.md` — endpoints, request/response shapes, tenant rules
- `docs/android-repository-swap-plan.md` — fake → real swap, errors, migration phases

**Network placeholders (copy into `app` module):** `data/api/*` (Retrofit `GetProApiService`, DTOs, [NetworkResult]), `data/mapper/DtoToUiMappers.kt`. Add Retrofit/OkHttp in Gradle before compiling those files.

## File layout (under `kotlin/com/getpro/app/`)

| Path | Role |
|------|------|
| `MainActivity.kt` | `setContent` + `AppNavigation()` |
| `data/AppDependencies.kt` | Prototype service locator (fake repos) |
| `data/fake/FakeDataSource.kt` | Zambia-relevant sample directory data |
| `data/fake/Fake*Repository.kt` | Fake repository implementations |
| `data/repository/*.kt` | Repository interfaces |
| `ui/state/UiStates.kt` | Per-screen immutable UI state |
| `ui/viewmodel/*ViewModel.kt` | `StateFlow` + fake repo wiring |
| `ui/model/UiModels.kt` | UI models / legacy form state |
| `ui/support/SampleData.kt` | Preview helpers (mirrors `FakeDataSource`) |
| `ui/theme/GetProTheme.kt` | `MaterialTheme` wrapper |
| `ui/navigation/Routes.kt` | Route constants + `buildResultsRoute` |
| `ui/navigation/NavEncoding.kt` | Safe path segments for Nav |
| `ui/navigation/AppNavigation.kt` | `NavHost` + ViewModels + callback sheet |
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
