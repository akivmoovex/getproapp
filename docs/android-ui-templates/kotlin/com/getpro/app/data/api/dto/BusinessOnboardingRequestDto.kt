package com.getpro.app.data.api.dto

/**
 * JSON body for `POST /api/professional-signups` (see `src/routes/api.js`, `docs/android-onboarding-api.md`).
 * Field names match the server; [name] is the business / listing name.
 *
 * TODO: Retrofit `@SerializedName` if Gson uses camelCase defaults.
 */
data class BusinessOnboardingRequestDto(
    val profession: String,
    val city: String,
    val name: String,
    val phone: String,
    val vat_or_pacra: String = "",
    val tenantId: Long,
    val tenantSlug: String,
)
