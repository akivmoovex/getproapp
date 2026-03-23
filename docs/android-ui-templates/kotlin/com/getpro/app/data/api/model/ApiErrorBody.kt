package com.getpro.app.data.api.model

/**
 * Standard error JSON from GetPro APIs: `{ "error": "..." }`.
 * See `src/routes/api.js` responses.
 *
 * TODO: Wire Retrofit + Gson/Moshi/Kotlinx serialization; field name must stay `error`.
 */
data class ApiErrorBody(
    val error: String? = null,
)
