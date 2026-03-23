package com.getpro.app.data.fake

import com.getpro.app.data.api.CallbackApiService
import com.getpro.app.data.api.dto.CallbackRequestDto
import com.getpro.app.data.api.dto.PostOkResponseDto
import kotlinx.coroutines.delay

/**
 * Stub for `POST /api/callback-interest` — validates DTO shape and simulates success/failure.
 *
 * **Debug:** set [forceFailure] or [forceValidationError] in tests (or temporarily here) to exercise UI.
 *
 * TODO: Replace with Retrofit [CallbackApiService] implementation.
 */
class FakeCallbackApiService(
    private val forceFailure: Boolean = false,
    private val forceValidationError: Boolean = false,
) : CallbackApiService {

    override suspend fun submitCallback(request: CallbackRequestDto): Result<PostOkResponseDto> {
        delay(350)
        if (forceFailure) {
            return Result.failure(IllegalStateException("Simulated network failure"))
        }
        if (forceValidationError) {
            return Result.failure(IllegalArgumentException("Invalid phone number for this region."))
        }
        if (request.name.length < 2) {
            return Result.failure(IllegalArgumentException("Name is required"))
        }
        if (request.phone.length < 8) {
            return Result.failure(IllegalArgumentException("Invalid phone number for this region."))
        }
        if (request.tenantId <= 0 || request.tenantSlug.isBlank()) {
            return Result.failure(IllegalArgumentException("tenantId or tenantSlug is required."))
        }
        return Result.success(PostOkResponseDto(ok = true))
    }
}
