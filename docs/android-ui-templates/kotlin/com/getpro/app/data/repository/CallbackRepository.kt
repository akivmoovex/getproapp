package com.getpro.app.data.repository

import com.getpro.app.data.model.CallbackSource

/**
 * Domain payload for callback / request-a-call — maps to [com.getpro.app.data.api.dto.CallbackRequestDto].
 */
data class CallbackSubmission(
    val fullName: String,
    val phone: String,
    val note: String,
    /** Base context segment; combined with note in mapper (server `context` max ~120). */
    val context: String = "android_callback",
    /** Used when [source] is [CallbackSource.Generic]. */
    val interestLabel: String = "Android — callback request",
    /** Optional waitlist city (server may adjust label). */
    val cityName: String? = null,
    val source: CallbackSource = CallbackSource.Generic,
    val companyId: String? = null,
    val searchQuery: String? = null,
    val searchCity: String? = null,
)

interface CallbackRepository {
    suspend fun submitCallback(submission: CallbackSubmission): Result<Unit>
}
