package com.getpro.app.ui.screens.results

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.getpro.app.ui.components.EmptyResultsCard
import com.getpro.app.ui.components.GetProTopAppBar
import com.getpro.app.ui.components.ProfessionalCard
import com.getpro.app.ui.model.ProfessionalUiModel
import com.getpro.app.ui.model.SearchState
import com.getpro.app.ui.state.SearchResultsUiState
import com.getpro.app.ui.theme.GetProTheme

/**
 * Directory results driven by [SearchResultsViewModel]. TODO: paging, pull-to-refresh, API mapping.
 */
@Composable
fun SearchResultsScreen(
    state: SearchResultsUiState,
    onBack: () -> Unit,
    onRefineSearch: () -> Unit,
    onProfessionalClick: (ProfessionalUiModel) -> Unit,
    onRequestCallback: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val search = SearchState(
        state.params.service,
        state.params.city,
        state.params.categorySlug,
    )
    val results = state.results
    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            GetProTopAppBar(title = "Results", onBack = onBack)
        },
        floatingActionButton = {
            FloatingActionButton(onClick = onRefineSearch) {
                Icon(Icons.Filled.Edit, contentDescription = "Refine search")
            }
        },
    ) { padding ->
        if (state.isLoading && results.isEmpty()) {
            Box(
                Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator()
            }
            return@Scaffold
        }
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                state.error?.let { err ->
                    Text(
                        err,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(bottom = 8.dp),
                    )
                }
                val summary = buildString {
                    if (search.queryService.isNotBlank()) append(search.queryService)
                    if (search.queryCity.isNotBlank()) {
                        if (isNotEmpty()) append(" · ")
                        append(search.queryCity)
                    }
                    search.categorySlug?.let {
                        if (isNotEmpty()) append(" · ")
                        append(it)
                    }
                }.ifBlank { "All listings" }
                Text(
                    summary,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    "${results.size} found",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
            if (results.isEmpty()) {
                item {
                    EmptyResultsCard(
                        title = "No professionals found",
                        message = "Try adjusting your search — or leave your details and we’ll help.",
                        onRequestCallback = onRequestCallback,
                    )
                }
            } else {
                items(results, key = { it.id }) { pro ->
                    ProfessionalCard(
                        professional = pro,
                        onClick = { onProfessionalClick(pro) },
                    )
                }
            }
        }
    }
}

@Preview(showBackground = true, heightDp = 700, widthDp = 400)
@Composable
private fun SearchResultsPreview() {
    GetProTheme {
        SearchResultsScreen(
            state = SearchResultsUiState(
                params = com.getpro.app.data.model.SearchParams("Electrician", "Lusaka", null),
                results = listOf(
                    ProfessionalUiModel(
                        id = "1",
                        name = "Bright Sparks",
                        headline = "Domestic & commercial",
                        categoryName = "Electrician",
                        cityOrLocation = "Lusaka",
                        ratingLabel = "4.8 · 5 reviews",
                    ),
                ),
            ),
            onBack = {},
            onRefineSearch = {},
            onProfessionalClick = {},
            onRequestCallback = {},
        )
    }
}

@Preview(showBackground = true, heightDp = 700, widthDp = 400)
@Composable
private fun SearchResultsEmptyPreview() {
    GetProTheme {
        SearchResultsScreen(
            state = SearchResultsUiState(
                params = com.getpro.app.data.model.SearchParams("", "", null),
                results = emptyList(),
            ),
            onBack = {},
            onRefineSearch = {},
            onProfessionalClick = {},
            onRequestCallback = {},
        )
    }
}
