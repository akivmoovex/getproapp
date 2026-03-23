package com.getpro.app.ui.state

import com.getpro.app.data.model.SearchParams
import com.getpro.app.ui.model.CategoryUiModel
import com.getpro.app.ui.model.CallbackSheetStage
import com.getpro.app.ui.model.ProfessionalUiModel
import com.getpro.app.ui.model.ProfileUiModel

data class HomeUiState(
    val serviceInput: String = "",
    val cityInput: String = "",
    val categories: List<CategoryUiModel> = emptyList(),
    val isLoadingCategories: Boolean = false,
    val categoriesError: String? = null,
)

data class SearchResultsUiState(
    val params: SearchParams,
    val results: List<ProfessionalUiModel> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
)

data class ProfessionalProfileUiState(
    val profile: ProfileUiModel? = null,
    val isLoading: Boolean = false,
    val error: String? = null,
)

data class CategoryBrowseUiState(
    val categories: List<CategoryUiModel> = emptyList(),
    val filterText: String = "",
    val isLoading: Boolean = false,
    val error: String? = null,
)

data class CallbackUiState(
    val fullName: String = "",
    val phone: String = "",
    val note: String = "",
    val stage: CallbackSheetStage = CallbackSheetStage.Form,
    val nameError: String? = null,
    val phoneError: String? = null,
    val isSubmitting: Boolean = false,
    val submitError: String? = null,
)

data class JoinBusinessUiState(
    val profession: String = "",
    val city: String = "",
    val businessName: String = "",
    val phone: String = "",
    val email: String = "",
    val professionError: String? = null,
    val cityError: String? = null,
    val businessNameError: String? = null,
    val phoneError: String? = null,
    val emailError: String? = null,
    val isSubmitting: Boolean = false,
    val submitError: String? = null,
    val completed: Boolean = false,
)
