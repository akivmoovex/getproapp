package com.getpro.app.data.api.dto

/**
 * JSON body for `POST /api/callback-interest` (see `src/routes/api.js`, `docs/android-callback-api.md`).
 * Field names match server expectations (snake_case for `interest_label`, `tenant_slug` optional pairing).
 */
data class CallbackRequestDto(
    val name: String,
    val phone: String,
    val tenantId: Long,
    val tenantSlug: String,
    val context: String,
    val interest_label: String,
    val cityName: String? = null,
)
