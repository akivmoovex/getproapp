package com.getpro.app.ui.screens.support

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.getpro.app.ui.components.GetProTopAppBar
import com.getpro.app.ui.model.QaItemUiModel
import com.getpro.app.ui.theme.GetProTheme

@Composable
fun QAScreen(
    items: List<QaItemUiModel>,
    onBack: () -> Unit,
    onOpenQuestion: (QaItemUiModel) -> Unit,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = { GetProTopAppBar(title = "Questions & answers", onBack = onBack) },
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(16.dp),
        ) {
            items(items, key = { it.slug }) { q ->
                OutlinedCard(modifier = Modifier.padding(bottom = 8.dp)) {
                    Text(q.question, style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(16.dp))
                    Text(
                        q.answerPreview,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 16.dp),
                    )
                    TextButton(onClick = { onOpenQuestion(q) }, modifier = Modifier.padding(8.dp)) {
                        Text("Read answer")
                    }
                }
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun QAPreview() {
    GetProTheme {
        QAScreen(
            items = listOf(
                QaItemUiModel("how-to-book", "How do I book a service?", "Browse the directory and…"),
            ),
            onBack = {},
            onOpenQuestion = {},
        )
    }
}
