package com.getpro.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.getpro.app.ui.model.ProfessionalUiModel

@Composable
fun ProfessionalCard(
    professional: ProfessionalUiModel,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    ElevatedCard(
        onClick = onClick,
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(
            Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(professional.name, style = MaterialTheme.typography.titleMedium)
            professional.headline?.takeIf { it.isNotBlank() }?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            val meta = listOfNotNull(professional.categoryName, professional.cityOrLocation, professional.ratingLabel)
                .joinToString(" · ")
            if (meta.isNotEmpty()) {
                Text(meta, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.secondary)
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun ProfessionalCardPreview() {
    ProfessionalCard(
        professional = ProfessionalUiModel(
            id = "1",
            name = "Spark Electric Ltd",
            headline = "Residential & commercial electrical",
            categoryName = "Electrician",
            cityOrLocation = "Lusaka",
            ratingLabel = "4.9 · 8 reviews",
        ),
        onClick = {},
    )
}
