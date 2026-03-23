package com.getpro.app.data.api

import com.getpro.app.data.api.dto.BusinessOnboardingRequestDto
import com.getpro.app.data.api.dto.PostOkResponseDto

/**
 * Write API for partner join / business onboarding (`professional_signups` row + CRM task).
 *
 * TODO: Retrofit: `@POST("/api/professional-signups") suspend fun postSignup(@Body body: BusinessOnboardingRequestDto): Response<PostOkResponseDto>`
 */
interface BusinessOnboardingApiService {
    /** Network or stub; failure message mirrors server `{ "error": "..." }` when parsed. */
    suspend fun submitProfessionalSignup(request: BusinessOnboardingRequestDto): Result<PostOkResponseDto>
}
