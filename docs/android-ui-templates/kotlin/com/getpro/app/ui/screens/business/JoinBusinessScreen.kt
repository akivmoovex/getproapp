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
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.getpro.app.ui.components.GetProTopAppBar
import com.getpro.app.ui.state.JoinBusinessUiState
import com.getpro.app.ui.theme.GetProTheme

/**
 * Simplified join vs web `/join` — state from [com.getpro.app.ui.viewmodel.JoinBusinessViewModel] (POST `/api/professional-signups` via repository).
 */
@Composable
fun JoinBusinessScreen(
    state: JoinBusinessUiState,
    onProfessionChange: (String) -> Unit,
    onCityChange: (String) -> Unit,
    onBusinessNameChange: (String) -> Unit,
    onPhoneChange: (String) -> Unit,
    onEmailChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onBack: () -> Unit,
    onDoneAfterSuccess: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = { GetProTopAppBar(title = "Apply to list", onBack = onBack) },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (state.completed) {
                Text(
                    "Application received",
                    style = MaterialTheme.typography.headlineSmall,
                )
                Text(
                    "Thanks — we’ll review your details and get in touch.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Button(
                    onClick = onDoneAfterSuccess,
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                ) {
                    Text("Done")
                }
            } else {
            Text(
                "Tell us about your business",
                style = MaterialTheme.typography.titleMedium,
            )
            state.submitError?.let { err ->
                Text(err, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            OutlinedTextField(
                value = state.profession,
                onValueChange = onProfessionChange,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Service / profession") },
                singleLine = true,
                isError = state.professionError != null,
                supportingText = { state.professionError?.let { Text(it) } },
            )
            OutlinedTextField(
                value = state.city,
                onValueChange = onCityChange,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("City") },
                singleLine = true,
                isError = state.cityError != null,
                supportingText = { state.cityError?.let { Text(it) } },
            )
            OutlinedTextField(
                value = state.businessName,
                onValueChange = onBusinessNameChange,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Business name") },
                singleLine = true,
                isError = state.businessNameError != null,
                supportingText = { state.businessNameError?.let { Text(it) } },
            )
            OutlinedTextField(
                value = state.phone,
                onValueChange = onPhoneChange,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Phone") },
                singleLine = true,
                isError = state.phoneError != null,
                supportingText = { state.phoneError?.let { Text(it) } },
            )
            OutlinedTextField(
                value = state.email,
                onValueChange = onEmailChange,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Email (optional)") },
                singleLine = true,
                isError = state.emailError != null,
                supportingText = { state.emailError?.let { Text(it) } },
            )
            Button(
                onClick = onSubmit,
                enabled = !state.isSubmitting,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (state.isSubmitting) "Submitting…" else "Submit application")
            }
            }
        }
    }
}

@Preview(showBackground = true, heightDp = 800, widthDp = 400)
@Composable
private fun JoinBusinessPreview() {
    GetProTheme {
        JoinBusinessScreen(
            state = JoinBusinessUiState(),
            onProfessionChange = {},
            onCityChange = {},
            onBusinessNameChange = {},
            onPhoneChange = {},
            onEmailChange = {},
            onSubmit = {},
            onBack = {},
            onDoneAfterSuccess = {},
        )
    }
}
