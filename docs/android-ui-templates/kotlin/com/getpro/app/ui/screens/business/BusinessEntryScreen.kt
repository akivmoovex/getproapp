package com.getpro.app.ui.screens.business

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.getpro.app.ui.components.GetProTopAppBar
import com.getpro.app.ui.theme.GetProTheme

/**
 * Entry for supply-side: list business → [JoinBusinessScreen].
 * TODO: optional “Already listed? Manage” deep link when accounts exist.
 */
@Composable
fun BusinessEntryScreen(
    onBack: () -> Unit,
    onListBusiness: () -> Unit,
    onManageExisting: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = { GetProTopAppBar(title = "For businesses", onBack = onBack) },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(
                "Reach customers on GetPro",
                style = MaterialTheme.typography.headlineSmall,
            )
            Text(
                "Create a verified listing with a simple profile. Customers search by trade and city.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Button(
                onClick = onListBusiness,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("List your business")
            }
            if (onManageExisting != null) {
                TextButton(onClick = onManageExisting, modifier = Modifier.fillMaxWidth()) {
                    Text("I already have a listing")
                }
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun BusinessEntryPreview() {
    GetProTheme {
        BusinessEntryScreen(onBack = {}, onListBusiness = {})
    }
}
