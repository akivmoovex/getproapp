package com.getpro.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.getpro.app.data.repository.CategoryRepository
import com.getpro.app.ui.state.HomeUiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Home: categories + search inputs. TODO: inject real [CategoryRepository] + tenant branding.
 */
class HomeViewModel(
    private val categoryRepository: CategoryRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    init {
        loadCategories()
    }

    fun setServiceInput(value: String) {
        _uiState.update { it.copy(serviceInput = value) }
    }

    fun setCityInput(value: String) {
        _uiState.update { it.copy(cityInput = value) }
    }

    private fun loadCategories() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingCategories = true, categoriesError = null) }
            runCatching { categoryRepository.getCategories() }
                .onSuccess { list ->
                    _uiState.update {
                        it.copy(isLoadingCategories = false, categories = list)
                    }
                }
                .onFailure { e ->
                    _uiState.update {
                        it.copy(
                            isLoadingCategories = false,
                            categoriesError = e.message ?: "Could not load categories",
                        )
                    }
                }
        }
    }
}
