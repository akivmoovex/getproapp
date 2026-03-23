package com.getpro.app.data.fake

import com.getpro.app.data.api.BusinessOnboardingApiService
import com.getpro.app.data.api.dto.BusinessOnboardingRequestDto
import com.getpro.app.data.api.dto.PostOkResponseDto
import kotlinx.coroutines.delay

/**
 * Stub for `POST /api/professional-signups` — validates DTO shape and simulates latency.
 *
 * **Debug:** set [forceFailure] or [forceValidationError] to exercise UI.
 *
 * TODO: Replace with Retrofit [com.getpro.app.data.api.BusinessOnboardingApiService] implementation.
 */
class FakeBusinessOnboardingApiService(
    private val forceFailure: Boolean = false,
    private val forceValidationError: Boolean = false,
) : BusinessOnboardingApiService {

    override suspend fun submitProfessionalSignup(
        request: BusinessOnboardingRequestDto,
    ): Result<PostOkResponseDto> {
        delay(400)
        if (forceFailure) {
            return Result.failure(IllegalStateException("Simulated network failure"))
        }
        if (forceValidationError) {
            return Result.failure(IllegalArgumentException("Profession, city, name, and phone are required."))
        }
        if (request.profession.isBlank() || request.city.isBlank() || request.name.isBlank() || request.phone.isBlank()) {
            return Result.failure(IllegalArgumentException("Profession, city, name, and phone are required."))
        }
        if (request.phone.trim().length < 8) {
            return Result.failure(IllegalArgumentException("Invalid phone number for this region."))
        }
        if (request.tenantId <= 0 || request.tenantSlug.isBlank()) {
            return Result.failure(IllegalArgumentException("tenantId or tenantSlug is required."))
        }
        return Result.success(PostOkResponseDto(ok = true))
    }
}
