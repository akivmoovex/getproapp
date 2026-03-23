package com.getpro.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.getpro.app.data.model.CallbackSession
import com.getpro.app.data.repository.CallbackRepository
import com.getpro.app.data.repository.CallbackSubmission
import com.getpro.app.ui.model.CallbackSheetStage
import com.getpro.app.ui.state.CallbackUiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Callback sheet: client validation + [CallbackRepository] (DTO-backed when using [com.getpro.app.data.remote.RemoteCallbackRepository]).
 */
class CallbackViewModel(
    private val callbackRepository: CallbackRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(CallbackUiState())
    val uiState: StateFlow<CallbackUiState> = _uiState.asStateFlow()

    /** Call when opening the sheet; [session] carries product context for `interest_label` / analytics. */
    fun reset(session: CallbackSession = CallbackSession()) {
        _uiState.value = CallbackUiState(
            source = session.source,
            companyId = session.companyId,
            searchQuery = session.searchQuery,
            searchCity = session.searchCity,
        )
    }

    fun setFullName(value: String) {
        _uiState.update { it.copy(fullName = value, nameError = null, submitError = null) }
    }

    fun setPhone(value: String) {
        _uiState.update { it.copy(phone = value, phoneError = null, submitError = null) }
    }

    fun setNote(value: String) {
        _uiState.update { it.copy(note = value) }
    }

    fun submit() {
        val s = _uiState.value
        var nameErr: String? = null
        var phoneErr: String? = null
        if (s.fullName.isBlank()) nameErr = "Enter your full name"
        if (s.phone.isBlank()) phoneErr = "Enter your phone number"
        else if (s.phone.trim().length < 8) phoneErr = "Enter a valid phone number"
        if (nameErr != null || phoneErr != null) {
            _uiState.update { it.copy(nameError = nameErr, phoneError = phoneErr) }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, submitError = null) }
            val result = callbackRepository.submitCallback(
                CallbackSubmission(
                    fullName = s.fullName.trim(),
                    phone = s.phone.trim(),
                    note = s.note.trim(),
                    source = s.source,
                    companyId = s.companyId,
                    searchQuery = s.searchQuery,
                    searchCity = s.searchCity,
                ),
            )
            result.fold(
                onSuccess = {
                    _uiState.update {
                        it.copy(isSubmitting = false, stage = CallbackSheetStage.Success)
                    }
                },
                onFailure = { e ->
                    _uiState.update {
                        it.copy(
                            isSubmitting = false,
                            submitError = e.message ?: "Submission failed",
                        )
                    }
                },
            )
        }
    }

    /** After success “Done” — caller dismisses sheet; state reset optional. */
    fun acknowledgeSuccess() {
        reset()
    }
}
