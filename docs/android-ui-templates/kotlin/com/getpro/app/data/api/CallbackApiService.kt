package com.getpro.app.data.api

import com.getpro.app.data.api.dto.CallbackRequestDto
import com.getpro.app.data.api.dto.PostOkResponseDto

/**
 * Write API for callback interest capture.
 *
 * TODO: Retrofit: `@POST("/api/callback-interest") suspend fun postCallback(@Body body: CallbackRequestDto): Response<PostOkResponseDto>`
 */
interface CallbackApiService {
    /** Network or stub implementation; failure carries server `error` message when available. */
    suspend fun submitCallback(request: CallbackRequestDto): Result<PostOkResponseDto>
}
