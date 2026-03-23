package com.getpro.app.data.model

/**
 * Where the callback sheet was opened from — maps to [com.getpro.app.data.repository.CallbackSubmission]
 * and server `interest_label` / `context` (see `POST /api/callback-interest`).
 */
enum class CallbackSource {
    Generic,
    /** Directory returned no matches. */
    EmptyResults,
    /** Request contact from a company profile. */
    Profile,
}

/**
 * Session passed when opening the callback sheet so submission includes product context.
 */
data class CallbackSession(
    val source: CallbackSource = CallbackSource.Generic,
    val companyId: String? = null,
    val searchQuery: String? = null,
    val searchCity: String? = null,
)
