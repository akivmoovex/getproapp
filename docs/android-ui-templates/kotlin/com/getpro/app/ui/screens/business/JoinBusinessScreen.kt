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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.getpro.app.ui.components.GetProTopAppBar
import com.getpro.app.ui.model.JoinFormState
import com.getpro.app.ui.theme.GetProTheme

/**
 * Simplified join vs web `/join`. TODO: POST /api/professional-signups + tenant resolution.
 */
@Composable
fun JoinBusinessScreen(
    initial: JoinFormState = JoinFormState(),
    onBack: () -> Unit,
    onSubmit: (JoinFormState) -> Unit,
    modifier: Modifier = Modifier,
) {
    var profession by remember { mutableStateOf(initial.profession) }
    var city by remember { mutableStateOf(initial.city) }
    var businessName by remember { mutableStateOf(initial.businessName) }
    var phone by remember { mutableStateOf(initial.phone) }
    var email by remember { mutableStateOf(initial.email) }

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
            Text(
                "Tell us about your business",
                style = MaterialTheme.typography.titleMedium,
            )
            OutlinedTextField(
                value = profession,
                onValueChange = { profession = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Service / profession") },
                singleLine = true,
            )
            OutlinedTextField(
                value = city,
                onValueChange = { city = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("City") },
                singleLine = true,
            )
            OutlinedTextField(
                value = businessName,
                onValueChange = { businessName = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Business name") },
                singleLine = true,
            )
            OutlinedTextField(
                value = phone,
                onValueChange = { phone = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Phone") },
                singleLine = true,
            )
            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Email (optional)") },
                singleLine = true,
            )
            Button(
                onClick = {
                    onSubmit(
                        JoinFormState(
                            profession = profession.trim(),
                            city = city.trim(),
                            businessName = businessName.trim(),
                            phone = phone.trim(),
                            email = email.trim(),
                        ),
                    )
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Submit application")
            }
        }
    }
}

@Preview(showBackground = true, heightDp = 800, widthDp = 400)
@Composable
private fun JoinBusinessPreview() {
    GetProTheme {
        JoinBusinessScreen(onBack = {}, onSubmit = {})
    }
}
