package com.getpro.app.data.repository

data class CallbackSubmission(
    val fullName: String,
    val phone: String,
    val note: String,
    val context: String = "android_callback",
    val interestLabel: String = "Android — callback request",
)

interface CallbackRepository {
    suspend fun submitCallback(submission: CallbackSubmission): Result<Unit>
}
