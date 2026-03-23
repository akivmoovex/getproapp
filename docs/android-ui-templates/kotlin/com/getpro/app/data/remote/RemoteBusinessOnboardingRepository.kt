package com.getpro.app.data.remote

import com.getpro.app.data.TenantConfig
import com.getpro.app.data.api.BusinessOnboardingApiService
import com.getpro.app.data.mapper.toBusinessOnboardingRequestDto
import com.getpro.app.data.repository.BusinessOnboardingRepository
import com.getpro.app.data.repository.OnboardingSubmission

/**
 * Real-ready onboarding path: [OnboardingSubmission] → DTO → [BusinessOnboardingApiService].
 *
 * TODO: Swap [com.getpro.app.data.fake.FakeBusinessOnboardingApiService] for Retrofit when wiring production.
 */
class RemoteBusinessOnboardingRepository(
    private val api: BusinessOnboardingApiService,
    private val tenantConfig: TenantConfig,
) : BusinessOnboardingRepository {

    override suspend fun submitOnboarding(data: OnboardingSubmission): Result<Unit> {
        val dto = data.toBusinessOnboardingRequestDto(tenantConfig)
        return api.submitProfessionalSignup(dto).map { }
    }
}
