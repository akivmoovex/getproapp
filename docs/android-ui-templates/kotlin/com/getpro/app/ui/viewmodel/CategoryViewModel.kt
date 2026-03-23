package com.getpro.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.getpro.app.data.repository.CategoryRepository
import com.getpro.app.ui.state.CategoryBrowseUiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Category browse + filter. TODO: remote config ordering, icons.
 */
class CategoryViewModel(
    private val categoryRepository: CategoryRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(CategoryBrowseUiState(isLoading = true))
    val uiState: StateFlow<CategoryBrowseUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun setFilterText(value: String) {
        _uiState.update { it.copy(filterText = value) }
    }

    private fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            runCatching { categoryRepository.getCategories() }
                .onSuccess { list ->
                    _uiState.update { it.copy(isLoading = false, categories = list) }
                }
                .onFailure { e ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            error = e.message ?: "Could not load categories",
                        )
                    }
                }
        }
    }
}
