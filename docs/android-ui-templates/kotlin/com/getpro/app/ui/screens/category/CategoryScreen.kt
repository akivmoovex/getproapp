package com.getpro.app.ui.screens.category

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.getpro.app.ui.components.GetProBottomNav
import com.getpro.app.ui.components.GetProTab
import com.getpro.app.ui.components.GetProTopAppBar
import com.getpro.app.ui.model.CategoryUiModel
import com.getpro.app.ui.state.CategoryBrowseUiState
import com.getpro.app.ui.theme.GetProTheme

/**
 * Browse categories → opens results with [CategoryUiModel.slug].
 */
@Composable
fun CategoryScreen(
    state: CategoryBrowseUiState,
    onFilterChange: (String) -> Unit,
    onCategorySelected: (CategoryUiModel) -> Unit,
    onTabSelect: (GetProTab) -> Unit,
    selectedTab: GetProTab,
    modifier: Modifier = Modifier,
) {
    val filter = state.filterText
    val categories = state.categories
    val filtered = remember(filter, categories) {
        if (filter.isBlank()) categories
        else categories.filter { it.name.contains(filter, ignoreCase = true) }
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = { GetProTopAppBar(title = "Categories", onBack = null) },
        bottomBar = { GetProBottomNav(selected = selectedTab, onSelect = onTabSelect) },
    ) { padding ->
        LazyVerticalGrid(
            columns = GridCells.Adaptive(minSize = 148.dp),
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (state.isLoading) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Text(
                        "Loading categories…",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            state.error?.let { err ->
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Text(err, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
            item(span = { GridItemSpan(maxLineSpan) }) {
                OutlinedTextField(
                    value = filter,
                    onValueChange = onFilterChange,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Filter categories") },
                    singleLine = true,
                )
            }
            items(filtered, key = { it.id }) { cat ->
                ElevatedCard(
                    onClick = { onCategorySelected(cat) },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        cat.name,
                        style = MaterialTheme.typography.titleSmall,
                        modifier = Modifier.padding(16.dp),
                    )
                }
            }
        }
    }
}

@Preview(showBackground = true, heightDp = 700, widthDp = 400)
@Composable
private fun CategoryScreenPreview() {
    GetProTheme {
        CategoryScreen(
            state = CategoryBrowseUiState(
                categories = List(8) { i ->
                    CategoryUiModel("$i", "Category $i", "cat-$i")
                },
            ),
            onFilterChange = {},
            onCategorySelected = {},
            onTabSelect = {},
            selectedTab = GetProTab.Categories,
        )
    }
}
