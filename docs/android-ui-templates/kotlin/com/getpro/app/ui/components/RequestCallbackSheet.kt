package com.getpro.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.getpro.app.ui.model.CallbackSheetStage
import com.getpro.app.ui.state.CallbackUiState

/**
 * Bottom-sheet capture wired to [CallbackViewModel] / [CallbackUiState].
 * Maps to POST /api/callback-interest (name, phone, context, interest_label, tenantId, tenantSlug).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RequestCallbackSheet(
    state: CallbackUiState,
    onDismiss: () -> Unit,
    onFullNameChange: (String) -> Unit,
    onPhoneChange: (String) -> Unit,
    onNoteChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onSuccessDone: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
    ) {
        when (state.stage) {
            CallbackSheetStage.Form -> {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 24.dp)
                        .padding(bottom = 32.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text("Request a call", style = MaterialTheme.typography.titleLarge)
                    Text(
                        "We’ll reach out to help you find the right professional.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    OutlinedTextField(
                        value = state.fullName,
                        onValueChange = onFullNameChange,
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Full name") },
                        singleLine = true,
                        isError = state.nameError != null,
                        supportingText = { state.nameError?.let { Text(it) } },
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
                        value = state.note,
                        onValueChange = onNoteChange,
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Note (optional)") },
                        minLines = 2,
                    )
                    state.submitError?.let { err ->
                        Text(err, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }
                    // TODO: validate tenant phone rules (e.g. zm) before submit.
                    Button(
                        onClick = onSubmit,
                        enabled = !state.isSubmitting,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(if (state.isSubmitting) "Submitting…" else "Submit")
                    }
                }
            }
            CallbackSheetStage.Success -> {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 24.dp)
                        .padding(bottom = 32.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    Text("Request received", style = MaterialTheme.typography.titleLarge)
                    Text(
                        "Thanks — we’ve received your details.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Button(onClick = onSuccessDone, modifier = Modifier.fillMaxWidth()) {
                        Text("Done")
                    }
                }
            }
        }
    }
}

/** Alias for spec naming — same composable. */
@Composable
fun CallbackSheet(
    state: CallbackUiState,
    onDismiss: () -> Unit,
    onFullNameChange: (String) -> Unit,
    onPhoneChange: (String) -> Unit,
    onNoteChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onSuccessDone: () -> Unit,
) {
    RequestCallbackSheet(
        state = state,
        onDismiss = onDismiss,
        onFullNameChange = onFullNameChange,
        onPhoneChange = onPhoneChange,
        onNoteChange = onNoteChange,
        onSubmit = onSubmit,
        onSuccessDone = onSuccessDone,
    )
}

@Preview(showBackground = true)
@Composable
private fun RequestCallbackSheetPreview() {
    // Preview without ModalBottomSheet: use static content in isolation in real project.
}
