package com.getpro.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.getpro.app.data.repository.BusinessOnboardingRepository
import com.getpro.app.data.repository.OnboardingSubmission
import com.getpro.app.ui.state.JoinBusinessUiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Join / onboarding form — submits via [BusinessOnboardingRepository] (remote-ready `POST /api/professional-signups`).
 */
class JoinBusinessViewModel(
    private val onboardingRepository: BusinessOnboardingRepository,
) : ViewModel() {

    private val emailFormatRegex = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")

    private fun isValidOptionalEmail(raw: String): Boolean {
        val s = raw.trim()
        if (s.isEmpty()) return true
        return emailFormatRegex.matches(s)
    }

    private val _uiState = MutableStateFlow(JoinBusinessUiState())
    val uiState: StateFlow<JoinBusinessUiState> = _uiState.asStateFlow()

    fun setProfession(value: String) {
        _uiState.update { it.copy(profession = value, professionError = null, submitError = null) }
    }

    fun setCity(value: String) {
        _uiState.update { it.copy(city = value, cityError = null, submitError = null) }
    }

    fun setBusinessName(value: String) {
        _uiState.update { it.copy(businessName = value, businessNameError = null, submitError = null) }
    }

    fun setPhone(value: String) {
        _uiState.update { it.copy(phone = value, phoneError = null, submitError = null) }
    }

    fun setEmail(value: String) {
        _uiState.update { it.copy(email = value, emailError = null, submitError = null) }
    }

    fun submit() {
        val s = _uiState.value
        var pErr: String? = null
        var cErr: String? = null
        var bErr: String? = null
        var phErr: String? = null
        var emErr: String? = null
        if (s.profession.isBlank()) pErr = "Enter your service or trade"
        if (s.city.isBlank()) cErr = "Enter your city"
        if (s.businessName.isBlank()) bErr = "Enter business name"
        if (s.phone.isBlank()) phErr = "Enter phone number"
        else if (s.phone.trim().length < 8) phErr = "Enter a valid phone number"
        val email = s.email.trim()
        if (!isValidOptionalEmail(s.email)) {
            emErr = "Enter a valid email or leave blank"
        }
        if (pErr != null || cErr != null || bErr != null || phErr != null || emErr != null) {
            _uiState.update {
                it.copy(
                    professionError = pErr,
                    cityError = cErr,
                    businessNameError = bErr,
                    phoneError = phErr,
                    emailError = emErr,
                )
            }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, submitError = null) }
            val result = onboardingRepository.submitOnboarding(
                OnboardingSubmission(
                    profession = s.profession.trim(),
                    city = s.city.trim(),
                    businessName = s.businessName.trim(),
                    phone = s.phone.trim(),
                    email = email,
                ),
            )
            result.fold(
                onSuccess = {
                    _uiState.update { it.copy(isSubmitting = false, completed = true) }
                },
                onFailure = { e ->
                    _uiState.update {
                        it.copy(
                            isSubmitting = false,
                            submitError = e.message ?: "Could not submit",
                        )
                    }
                },
            )
        }
    }

    fun reset() {
        _uiState.value = JoinBusinessUiState()
    }
}
