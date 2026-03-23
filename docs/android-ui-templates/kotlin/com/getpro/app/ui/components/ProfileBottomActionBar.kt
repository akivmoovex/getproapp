package com.getpro.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

@Composable
fun ProfileBottomActionBar(
    onCall: () -> Unit,
    onWhatsApp: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        tonalElevation = 3.dp,
        shadowElevation = 8.dp,
        color = MaterialTheme.colorScheme.surface,
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Button(
                onClick = onCall,
                modifier = Modifier.weight(1f),
            ) {
                Text("Call")
            }
            if (onWhatsApp != null) {
                OutlinedButton(
                    onClick = onWhatsApp,
                    modifier = Modifier.weight(1f),
                ) {
                    Text("WhatsApp")
                }
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun ProfileBottomActionBarPreview() {
    ProfileBottomActionBar(onCall = {}, onWhatsApp = {})
}
