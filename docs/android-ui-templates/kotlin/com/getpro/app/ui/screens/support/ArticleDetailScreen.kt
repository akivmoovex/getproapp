package com.getpro.app.ui.screens.support

import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.getpro.app.ui.components.GetProTopAppBar
import com.getpro.app.ui.theme.GetProTheme

/**
 * TODO: render HTML body with `AndroidView` + WebView or `HtmlCompat.fromHtml` in `AnnotatedString` (limited).
 */
@Composable
fun ArticleDetailScreen(
    title: String,
    bodyText: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        modifier = modifier,
        topBar = { GetProTopAppBar(title = title, onBack = onBack) },
    ) { padding ->
        Text(
            bodyText,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun ArticleDetailPreview() {
    GetProTheme {
        ArticleDetailScreen(
            title = "Sample article",
            bodyText = "Lorem ipsum…",
            onBack = {},
        )
    }
}
