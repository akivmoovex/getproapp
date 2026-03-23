package com.getpro.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.getpro.app.data.model.SearchParams
import com.getpro.app.data.repository.SearchRepository
import com.getpro.app.ui.state.SearchResultsUiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Directory results for [SearchParams]. TODO: paging, SavedStateHandle restore, API DTOs.
 */
class SearchResultsViewModel(
    private val searchRepository: SearchRepository,
    private val params: SearchParams,
) : ViewModel() {

    private val _uiState = MutableStateFlow(
        SearchResultsUiState(params = params, isLoading = true),
    )
    val uiState: StateFlow<SearchResultsUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            runCatching { searchRepository.search(params) }
                .onSuccess { list ->
                    _uiState.update { it.copy(isLoading = false, results = list) }
                }
                .onFailure { e ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            error = e.message ?: "Search failed",
                        )
                    }
                }
        }
    }
}
