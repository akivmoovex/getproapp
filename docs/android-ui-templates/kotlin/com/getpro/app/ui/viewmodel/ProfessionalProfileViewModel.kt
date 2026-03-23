package com.getpro.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.getpro.app.data.repository.ProfessionalRepository
import com.getpro.app.ui.state.ProfessionalProfileUiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Profile detail by id or slug. TODO: reviews API, gallery, HTML about via WebView.
 */
class ProfessionalProfileViewModel(
    private val professionalRepository: ProfessionalRepository,
    private val idOrSlug: String,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ProfessionalProfileUiState(isLoading = true))
    val uiState: StateFlow<ProfessionalProfileUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            runCatching { professionalRepository.getByIdOrSlug(idOrSlug) }
                .onSuccess { profile ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            profile = profile,
                            error = if (profile == null) "Company not found" else null,
                        )
                    }
                }
                .onFailure { e ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            profile = null,
                            error = e.message ?: "Could not load profile",
                        )
                    }
                }
        }
    }
}
