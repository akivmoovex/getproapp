package com.getpro.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

/**
 * Launcher search — service + city. Dominant primary action: Search.
 */
@Composable
fun SearchCard(
    serviceText: String,
    cityText: String,
    onServiceChange: (String) -> Unit,
    onCityChange: (String) -> Unit,
    onSearch: () -> Unit,
    modifier: Modifier = Modifier,
) {
    OutlinedCard(modifier = modifier.fillMaxWidth()) {
        Column(
            Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Search professionals", style = MaterialTheme.typography.titleMedium)
            OutlinedTextField(
                value = serviceText,
                onValueChange = onServiceChange,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Service or profession") },
                placeholder = { Text("e.g. Electrician") },
                singleLine = true,
            )
            OutlinedTextField(
                value = cityText,
                onValueChange = onCityChange,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("City") },
                placeholder = { Text("e.g. Lusaka") },
                singleLine = true,
            )
            // TODO: Hook autocomplete lists (parity with web search-lists.json) via ViewModel.
            Button(
                onClick = onSearch,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Search")
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun SearchCardPreview() {
    SearchCard(
        serviceText = "Plumber",
        cityText = "Lusaka",
        onServiceChange = {},
        onCityChange = {},
        onSearch = {},
    )
}
