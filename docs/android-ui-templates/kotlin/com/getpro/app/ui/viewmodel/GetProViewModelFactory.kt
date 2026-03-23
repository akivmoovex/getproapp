package com.getpro.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.getpro.app.data.AppDependencies
import com.getpro.app.data.model.SearchParams

/**
 * Prototype factories — replace with Hilt / assisted inject when the Android module is wired.
 */
class GetProViewModelFactory(
    private val deps: AppDependencies,
) : ViewModelProvider.Factory {

    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return when {
            modelClass.isAssignableFrom(HomeViewModel::class.java) ->
                HomeViewModel(deps.categoryRepository) as T
            modelClass.isAssignableFrom(CategoryViewModel::class.java) ->
                CategoryViewModel(deps.categoryRepository) as T
            modelClass.isAssignableFrom(CallbackViewModel::class.java) ->
                CallbackViewModel(deps.callbackRepository) as T
            modelClass.isAssignableFrom(JoinBusinessViewModel::class.java) ->
                JoinBusinessViewModel(deps.onboardingRepository) as T
            modelClass.isAssignableFrom(BusinessEntryViewModel::class.java) ->
                BusinessEntryViewModel() as T
            else -> throw IllegalArgumentException(
                "Unknown ViewModel: ${modelClass.name}. Use searchResults() or profile() factory.",
            )
        }
    }

    companion object {
        fun searchResults(deps: AppDependencies, params: SearchParams): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    if (modelClass.isAssignableFrom(SearchResultsViewModel::class.java)) {
                        return SearchResultsViewModel(deps.searchRepository, params) as T
                    }
                    throw IllegalArgumentException("Expected SearchResultsViewModel")
                }
            }

        fun profile(deps: AppDependencies, idOrSlug: String): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    if (modelClass.isAssignableFrom(ProfessionalProfileViewModel::class.java)) {
                        return ProfessionalProfileViewModel(
                            deps.professionalRepository,
                            idOrSlug,
                        ) as T
                    }
                    throw IllegalArgumentException("Expected ProfessionalProfileViewModel")
                }
            }
    }
}
