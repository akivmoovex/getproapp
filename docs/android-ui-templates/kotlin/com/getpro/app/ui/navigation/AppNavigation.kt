package com.getpro.app.ui.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.getpro.app.data.AppDependencies
import com.getpro.app.data.model.CallbackSession
import com.getpro.app.data.model.CallbackSource
import com.getpro.app.data.model.SearchParams
import com.getpro.app.ui.components.GetProTab
import com.getpro.app.ui.components.RequestCallbackSheet
import com.getpro.app.ui.screens.business.BusinessEntryScreen
import com.getpro.app.ui.screens.business.JoinBusinessScreen
import com.getpro.app.ui.screens.category.CategoryScreen
import com.getpro.app.ui.screens.home.HomeScreen
import com.getpro.app.ui.screens.profile.ProfessionalProfileScreen
import com.getpro.app.ui.screens.results.SearchResultsScreen
import com.getpro.app.ui.viewmodel.CallbackViewModel
import com.getpro.app.ui.viewmodel.CategoryViewModel
import com.getpro.app.ui.viewmodel.GetProViewModelFactory
import com.getpro.app.ui.viewmodel.HomeViewModel
import com.getpro.app.ui.viewmodel.JoinBusinessViewModel
import com.getpro.app.ui.viewmodel.ProfessionalProfileViewModel
import com.getpro.app.ui.viewmodel.SearchResultsViewModel

/**
 * Root navigation graph with fake repositories + ViewModels.
 *
 * - **Callback** / **RequestCallbackSheet**: modal over the graph (not a Nav destination).
 * - **TODO**: Hilt, deep links, SavedStateHandle for search restore.
 */
@Composable
fun AppNavigation(
    deps: AppDependencies = AppDependencies,
) {
    val navController = rememberNavController()
    var selectedTab by remember { mutableStateOf(GetProTab.Home) }
    val factory = remember(deps) { GetProViewModelFactory(deps) }
    val callbackVm: CallbackViewModel = viewModel(factory = factory)
    val callbackState by callbackVm.uiState.collectAsState()
    var showCallbackSheet by remember { mutableStateOf(false) }

    fun openCallbackSheet(session: CallbackSession = CallbackSession()) {
        callbackVm.reset(session)
        showCallbackSheet = true
    }

    Box(Modifier.fillMaxSize()) {
        NavHost(
            navController = navController,
            startDestination = Routes.HOME,
        ) {
            composable(Routes.HOME) {
                val homeVm: HomeViewModel = viewModel(factory = factory)
                val homeState by homeVm.uiState.collectAsState()
                HomeScreen(
                    state = homeState,
                    onServiceChange = homeVm::setServiceInput,
                    onCityChange = homeVm::setCityInput,
                    onSearch = {
                        navController.navigate(
                            Routes.buildResultsRoute(
                                homeState.serviceInput.trim(),
                                homeState.cityInput.trim(),
                                null,
                            ),
                        )
                    },
                    onCategoryClick = { cat ->
                        navController.navigate(
                            Routes.buildResultsRoute("", "", cat.slug),
                        )
                    },
                    onBusinessEntryClick = { navController.navigate(Routes.BUSINESS_ENTRY) },
                    onTabSelect = { tab ->
                        selectedTab = tab
                        when (tab) {
                            GetProTab.Home -> navController.navigate(Routes.HOME) {
                                popUpTo(Routes.HOME) { inclusive = true }
                            }
                            GetProTab.Categories -> navController.navigate(Routes.CATEGORY_BROWSE)
                            GetProTab.Business -> navController.navigate(Routes.BUSINESS_ENTRY)
                        }
                    },
                    selectedTab = selectedTab,
                )
            }
            composable(
                route = Routes.RESULTS_WITH_ARGS,
                arguments = listOf(
                    navArgument(Routes.ARG_SERVICE) { type = NavType.StringType },
                    navArgument(Routes.ARG_CITY) { type = NavType.StringType },
                    navArgument(Routes.ARG_CATEGORY) { type = NavType.StringType },
                ),
            ) { entry ->
                val service = NavEncoding.decodeSegment(
                    entry.arguments?.getString(Routes.ARG_SERVICE).orEmpty(),
                )
                val city = NavEncoding.decodeSegment(
                    entry.arguments?.getString(Routes.ARG_CITY).orEmpty(),
                )
                val catRaw = NavEncoding.decodeSegment(
                    entry.arguments?.getString(Routes.ARG_CATEGORY).orEmpty(),
                )
                val categorySlug = catRaw.takeIf { it.isNotBlank() }
                val params = SearchParams(service, city, categorySlug)
                val vm: SearchResultsViewModel = viewModel(
                    key = "results_${params.service}_${params.city}_${params.categorySlug}",
                    factory = GetProViewModelFactory.searchResults(deps, params),
                )
                val state by vm.uiState.collectAsState()
                SearchResultsScreen(
                    state = state,
                    onBack = { navController.popBackStack() },
                    onRefineSearch = {
                        navController.navigate(Routes.HOME) { launchSingleTop = true }
                    },
                    onProfessionalClick = { pro ->
                        navController.navigate(
                            "${Routes.PROFILE}/${NavEncoding.encodeSegment(pro.id)}",
                        )
                    },
                    onRequestCallback = {
                        openCallbackSheet(
                            CallbackSession(
                                source = CallbackSource.EmptyResults,
                                searchQuery = params.service,
                                searchCity = params.city,
                            ),
                        )
                    },
                )
            }
            composable(
                route = "${Routes.PROFILE}/{${Routes.ARG_PROFILE_ID}}",
                arguments = listOf(
                    navArgument(Routes.ARG_PROFILE_ID) { type = NavType.StringType },
                ),
            ) { entry ->
                val raw = entry.arguments?.getString(Routes.ARG_PROFILE_ID).orEmpty()
                val idOrSlug = NavEncoding.decodeSegment(raw)
                val vm: ProfessionalProfileViewModel = viewModel(
                    key = "profile_$idOrSlug",
                    factory = GetProViewModelFactory.profile(deps, idOrSlug),
                )
                val state by vm.uiState.collectAsState()
                val profile = state.profile
                ProfessionalProfileScreen(
                    state = state,
                    onBack = { navController.popBackStack() },
                    onCall = {
                        // TODO: Intent.ACTION_DIAL with profile?.phone
                    },
                    onWhatsApp = if (profile?.whatsappHref != null) {
                        { /* TODO: CustomTabs / wa.me */ }
                    } else {
                        null
                    },
                    onRequestContact = {
                        openCallbackSheet(
                            CallbackSession(
                                source = CallbackSource.Profile,
                                companyId = profile?.id,
                            ),
                        )
                    },
                    onRetry = { vm.load() },
                )
            }
            composable(Routes.CATEGORY_BROWSE) {
                val catVm: CategoryViewModel = viewModel(factory = factory)
                val catState by catVm.uiState.collectAsState()
                CategoryScreen(
                    state = catState,
                    onFilterChange = catVm::setFilterText,
                    onCategorySelected = { cat ->
                        navController.navigate(
                            Routes.buildResultsRoute("", "", cat.slug),
                        )
                    },
                    onTabSelect = { tab ->
                        selectedTab = tab
                        when (tab) {
                            GetProTab.Home -> navController.navigate(Routes.HOME)
                            GetProTab.Categories -> { }
                            GetProTab.Business -> navController.navigate(Routes.BUSINESS_ENTRY)
                        }
                    },
                    selectedTab = selectedTab,
                )
            }
            composable(Routes.BUSINESS_ENTRY) {
                BusinessEntryScreen(
                    onBack = { navController.popBackStack() },
                    onListBusiness = { navController.navigate(Routes.JOIN_BUSINESS) },
                )
            }
            composable(Routes.JOIN_BUSINESS) {
                val joinVm: JoinBusinessViewModel = viewModel(factory = factory)
                val joinState by joinVm.uiState.collectAsState()
                JoinBusinessScreen(
                    state = joinState,
                    onProfessionChange = joinVm::setProfession,
                    onCityChange = joinVm::setCity,
                    onBusinessNameChange = joinVm::setBusinessName,
                    onPhoneChange = joinVm::setPhone,
                    onEmailChange = joinVm::setEmail,
                    onSubmit = { joinVm.submit() },
                    onBack = { navController.popBackStack() },
                    onDoneAfterSuccess = {
                        joinVm.reset()
                        navController.popBackStack()
                    },
                )
            }
        }

        if (showCallbackSheet) {
            RequestCallbackSheet(
                state = callbackState,
                onDismiss = {
                    showCallbackSheet = false
                    callbackVm.reset()
                },
                onFullNameChange = callbackVm::setFullName,
                onPhoneChange = callbackVm::setPhone,
                onNoteChange = callbackVm::setNote,
                onSubmit = { callbackVm.submit() },
                onSuccessDone = {
                    showCallbackSheet = false
                    callbackVm.acknowledgeSuccess()
                },
            )
        }
    }
}
