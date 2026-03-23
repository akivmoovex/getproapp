package com.getpro.app.data.repository

data class OnboardingSubmission(
    val profession: String,
    val city: String,
    val businessName: String,
    val phone: String,
    val email: String,
)

interface BusinessOnboardingRepository {
    suspend fun submitOnboarding(data: OnboardingSubmission): Result<Unit>
}
