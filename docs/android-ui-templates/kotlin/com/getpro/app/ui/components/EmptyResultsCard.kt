package com.getpro.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

@Composable
fun EmptyResultsCard(
    title: String,
    message: String,
    onRequestCallback: () -> Unit,
    modifier: Modifier = Modifier,
) {
    OutlinedCard(modifier = modifier.fillMaxWidth()) {
        Column(
            Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(
                message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Button(onClick = onRequestCallback, modifier = Modifier.fillMaxWidth()) {
                Text("Request a call")
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun EmptyResultsCardPreview() {
    EmptyResultsCard(
        title = "No matches yet",
        message = "Leave your details — we’ll help connect you with a professional.",
        onRequestCallback = {},
    )
}
