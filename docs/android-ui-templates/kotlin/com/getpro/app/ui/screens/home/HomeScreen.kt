package com.getpro.app.ui.screens.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.getpro.app.ui.components.CategoryChipRow
import com.getpro.app.ui.components.GetProBottomNav
import com.getpro.app.ui.components.GetProTab
import com.getpro.app.ui.components.GetProTopAppBar
import com.getpro.app.ui.components.SearchCard
import com.getpro.app.ui.model.CategoryUiModel
import com.getpro.app.ui.theme.GetProTheme

/**
 * Launcher: search-first. TODO: inject ViewModel for categories + tenant branding.
 */
@Composable
fun HomeScreen(
    categories: List<CategoryUiModel>,
    onSearch: (service: String, city: String) -> Unit,
    onCategoryClick: (CategoryUiModel) -> Unit,
    onBusinessEntryClick: () -> Unit,
    onTabSelect: (GetProTab) -> Unit,
    selectedTab: GetProTab,
    modifier: Modifier = Modifier,
) {
    var service by remember { mutableStateOf("") }
    var city by remember { mutableStateOf("") }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            GetProTopAppBar(title = "GetPro", onBack = null)
        },
        bottomBar = {
            GetProBottomNav(selected = selectedTab, onSelect = onTabSelect)
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item {
                Text(
                    "Find trusted professionals",
                    style = MaterialTheme.typography.headlineSmall,
                )
                Text(
                    "Search by service and city.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            item {
                SearchCard(
                    serviceText = service,
                    cityText = city,
                    onServiceChange = { service = it },
                    onCityChange = { city = it },
                    onSearch = { onSearch(service.trim(), city.trim()) },
                )
            }
            item {
                Text("Categories", style = MaterialTheme.typography.titleMedium)
                CategoryChipRow(
                    categories = categories,
                    onCategoryClick = onCategoryClick,
                )
            }
            item {
                OutlinedCard(modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp)) {
                        Text("Need help choosing?", style = MaterialTheme.typography.titleSmall)
                        Text(
                            "Our team can point you to the right trade.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        // TODO: wire getproTelHref / phone from tenant config.
                    }
                }
            }
            item {
                OutlinedCard(modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp)) {
                        Text("List your business", style = MaterialTheme.typography.titleSmall)
                        Text(
                            "Join the directory and get discovered by customers.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        TextButton(onClick = onBusinessEntryClick) {
                            Text("Get started")
                        }
                    }
                }
            }
        }
    }
}

@Preview(showBackground = true, heightDp = 800, widthDp = 400)
@Composable
private fun HomeScreenPreview() {
    GetProTheme {
        HomeScreen(
            categories = listOf(
                CategoryUiModel("1", "Electrician", "electrician"),
                CategoryUiModel("2", "Plumber", "plumber"),
            ),
            onSearch = { _, _ -> },
            onCategoryClick = {},
            onBusinessEntryClick = {},
            onTabSelect = {},
            selectedTab = GetProTab.Home,
        )
    }
}
