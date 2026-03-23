package com.getpro.app.ui.components

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.getpro.app.ui.model.CategoryUiModel

/**
 * Horizontal leading categories — compact, not oversized tiles.
 */
@Composable
fun CategoryChipRow(
    categories: List<CategoryUiModel>,
    onCategoryClick: (CategoryUiModel) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        categories.forEach { cat ->
            AssistChip(
                onClick = { onCategoryClick(cat) },
                label = {
                    Text(cat.name, style = MaterialTheme.typography.labelLarge)
                },
                colors = AssistChipDefaults.assistChipColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                ),
            )
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun CategoryChipRowPreview() {
    CategoryChipRow(
        categories = listOf(
            CategoryUiModel("1", "Electrician", "electrician"),
            CategoryUiModel("2", "Plumber", "plumber"),
        ),
        onCategoryClick = {},
    )
}
