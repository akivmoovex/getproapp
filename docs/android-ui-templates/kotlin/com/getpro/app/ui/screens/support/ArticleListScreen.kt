package com.getpro.app.ui.screens.support

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.getpro.app.ui.components.GetProTopAppBar
import com.getpro.app.ui.model.ArticleUiModel
import com.getpro.app.ui.theme.GetProTheme

@Composable
fun ArticleListScreen(
    articles: List<ArticleUiModel>,
    onBack: () -> Unit,
    onArticleClick: (ArticleUiModel) -> Unit,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = { GetProTopAppBar(title = "Articles", onBack = onBack) },
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(16.dp),
        ) {
            items(articles, key = { it.slug }) { a ->
                OutlinedCard(
                    modifier = Modifier
                        .padding(bottom = 8.dp)
                        .clickable { onArticleClick(a) },
                ) {
                    Text(a.title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(16.dp))
                    a.excerpt?.let {
                        Text(
                            it,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 0.dp),
                        )
                    }
                }
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun ArticleListPreview() {
    GetProTheme {
        ArticleListScreen(
            articles = listOf(
                ArticleUiModel("hire-electrician", "How to hire an electrician", "Short excerpt…"),
            ),
            onBack = {},
            onArticleClick = {},
        )
    }
}
