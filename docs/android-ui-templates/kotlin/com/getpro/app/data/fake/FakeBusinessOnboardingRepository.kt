package com.getpro.app.data.fake

import com.getpro.app.data.repository.BusinessOnboardingRepository
import com.getpro.app.data.repository.OnboardingSubmission
import kotlinx.coroutines.delay

class FakeBusinessOnboardingRepository : BusinessOnboardingRepository {
    override suspend fun submitOnboarding(data: OnboardingSubmission): Result<Unit> {
        delay(400)
        val ok = data.profession.isNotBlank() &&
            data.city.isNotBlank() &&
            data.businessName.isNotBlank() &&
            data.phone.length >= 8
        return if (ok) Result.success(Unit) else Result.failure(IllegalArgumentException("Invalid onboarding"))
    }
}
