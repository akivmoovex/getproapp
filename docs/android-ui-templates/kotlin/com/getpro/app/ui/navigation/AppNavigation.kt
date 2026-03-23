package com.getpro.app.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.getpro.app.ui.components.GetProTab
import com.getpro.app.ui.model.CategoryUiModel
import com.getpro.app.ui.model.ProfessionalUiModel
import com.getpro.app.ui.model.ProfileUiModel
import com.getpro.app.ui.model.SearchState
import com.getpro.app.ui.screens.business.BusinessEntryScreen
import com.getpro.app.ui.screens.business.JoinBusinessScreen
import com.getpro.app.ui.screens.category.CategoryScreen
import com.getpro.app.ui.screens.home.HomeScreen
import com.getpro.app.ui.screens.profile.ProfessionalProfileScreen
import com.getpro.app.ui.screens.results.SearchResultsScreen

/**
 * Root navigation graph.
 *
 * - **Callback** / **RequestCallbackSheet**: show from Activity or root via `ModalBottomSheet` — not a Nav destination.
 * - **TODO**: pass [SearchState] / results via shared ViewModel or `SavedStateHandle` instead of sample-only [SearchResultsScreen].
 */
@Composable
fun AppNavigation(
    sampleCategories: List<CategoryUiModel>,
    sampleResults: List<ProfessionalUiModel>,
    sampleProfile: ProfileUiModel,
) {
    val navController = rememberNavController()
    var selectedTab by remember { mutableStateOf(GetProTab.Home) }

    NavHost(
        navController = navController,
        startDestination = Routes.HOME,
    ) {
        composable(Routes.HOME) {
            HomeScreen(
                categories = sampleCategories,
                onSearch = { service, city ->
                    // TODO: store query in ViewModel; then navigate to RESULTS
                    navController.navigate(Routes.RESULTS)
                },
                onCategoryClick = { cat ->
                    // TODO: ViewModel: set categorySlug = cat.slug
                    navController.navigate(Routes.RESULTS)
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
        composable(Routes.RESULTS) {
            SearchResultsScreen(
                search = SearchState("", "", null),
                results = sampleResults,
                onBack = { navController.popBackStack() },
                onRefineSearch = { /* TODO: ModalBottomSheet */ },
                onProfessionalClick = { pro ->
                    navController.navigate("${Routes.PROFILE}/${pro.id}")
                },
                onRequestCallback = { /* TODO: show RequestCallbackSheet */ },
            )
        }
        composable(
            route = "${Routes.PROFILE}/{${Routes.ARG_PROFILE_ID}}",
            arguments = listOf(
                navArgument(Routes.ARG_PROFILE_ID) { type = NavType.StringType },
            ),
        ) {
            ProfessionalProfileScreen(
                profile = sampleProfile,
                onBack = { navController.popBackStack() },
                onCall = { /* TODO: dial */ },
                onWhatsApp = { /* TODO */ },
                onRequestContact = { /* TODO: lead */ },
            )
        }
        composable(Routes.CATEGORY_BROWSE) {
            CategoryScreen(
                categories = sampleCategories,
                onCategorySelected = {
                    navController.navigate(Routes.RESULTS)
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
            JoinBusinessScreen(
                onBack = { navController.popBackStack() },
                onSubmit = { /* TODO: ApiRepository.submitSignup */ },
            )
        }
    }
}
