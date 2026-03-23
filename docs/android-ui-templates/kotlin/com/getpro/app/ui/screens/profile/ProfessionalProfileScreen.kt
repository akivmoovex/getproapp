package com.getpro.app.ui.screens.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
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
import com.getpro.app.ui.components.ProfileBottomActionBar
import com.getpro.app.ui.model.ProfileUiModel
import com.getpro.app.ui.model.ReviewUiModel
import com.getpro.app.ui.theme.GetProTheme

/**
 * Conversion-focused profile. TODO: carousel for photos, HTML about via AnnotatedString/WebView.
 */
@Composable
fun ProfessionalProfileScreen(
    profile: ProfileUiModel,
    onBack: () -> Unit,
    onCall: () -> Unit,
    onWhatsApp: (() -> Unit)?,
    onRequestContact: () -> Unit,
    onShare: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            GetProTopAppBar(
                title = profile.name,
                onBack = onBack,
                actions = {
                    if (onShare != null) {
                        TextButton(onClick = onShare) { Text("Share") }
                    }
                },
            )
        },
        bottomBar = {
            ProfileBottomActionBar(
                onCall = onCall,
                onWhatsApp = onWhatsApp,
            )
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
                val meta = listOfNotNull(profile.categoryName, profile.location).joinToString(" · ")
                if (meta.isNotEmpty()) {
                    Text(meta, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.secondary)
                }
                profile.headline?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 4.dp))
                }
                profile.yearsInBusiness?.let {
                    Text("$it years in business", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            item {
                profile.aboutHtmlOrText?.takeIf { it.isNotBlank() }?.let { about ->
                    OutlinedCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp)) {
                            Text("About", style = MaterialTheme.typography.titleSmall)
                            Text(about, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }
            item {
                if (profile.servicesLines.isNotEmpty()) {
                    OutlinedCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp)) {
                            Text("Services", style = MaterialTheme.typography.titleSmall)
                            profile.servicesLines.forEach { line ->
                                Text("· $line", style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                    }
                }
            }
            item {
                Text("Reviews", style = MaterialTheme.typography.titleMedium)
                if (profile.reviews.isEmpty()) {
                    Text("No reviews yet.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            items(profile.reviews) { r ->
                ReviewRow(r)
            }
            item {
                OutlinedCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp)) {
                        Text("Request contact", style = MaterialTheme.typography.titleSmall)
                        Text(
                            "Send a message to this business.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Button(
                            onClick = onRequestContact,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 8.dp),
                        ) {
                            Text("Open request form")
                        }
                        // TODO: inline lead form fields → POST /api/leads
                    }
                }
            }
        }
    }
}

@Composable
private fun ReviewRow(review: ReviewUiModel) {
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Text("${review.ratingStars} ★ · ${review.author}", style = MaterialTheme.typography.labelLarge)
            Text(review.body, style = MaterialTheme.typography.bodyMedium)
            review.dateLabel?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Preview(showBackground = true, heightDp = 800, widthDp = 400)
@Composable
private fun ProfessionalProfilePreview() {
    GetProTheme {
        ProfessionalProfileScreen(
            profile = ProfileUiModel(
                id = "1",
                name = "City Electric Co.",
                headline = "Licensed electricians",
                categoryName = "Electrician",
                location = "Lusaka",
                aboutHtmlOrText = "We handle installs, fault finding, and compliance certificates.",
                servicesLines = listOf("Rewiring", "New builds", "Emergency call-outs"),
                reviews = listOf(
                    ReviewUiModel("Jane", 5f, "Quick response and tidy work.", "Mar 2026"),
                ),
                yearsInBusiness = 8,
            ),
            onBack = {},
            onCall = {},
            onWhatsApp = {},
            onRequestContact = {},
        )
    }
}
