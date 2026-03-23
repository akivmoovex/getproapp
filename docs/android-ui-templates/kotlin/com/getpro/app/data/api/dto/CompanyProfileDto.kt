package com.getpro.app.data.api.dto

/**
 * Proposed `GET /api/v1/companies/:idOrSlug` response (see docs/android-api-contracts.md, docs/android-profile-api.md).
 * TODO: Align field names with backend (snake_case vs camelCase).
 */
data class CompanyProfileDto(
    val id: String,
    val slug: String? = null,
    val name: String,
    val headline: String? = null,
    val category_name: String? = null,
    val city: String? = null,
    val address: String? = null,
    val about: String? = null,
    val services: List<String> = emptyList(),
    val service_areas: List<String> = emptyList(),
    val phone: String? = null,
    val whatsapp_href: String? = null,
    val email: String? = null,
    val logo_url: String? = null,
    val hero_image_url: String? = null,
    val rating: Float? = null,
    val review_count: Int? = null,
    val years_in_business: Int? = null,
    val reviews: List<ReviewDto> = emptyList(),
)

data class ReviewDto(
    val author: String,
    val rating: Float,
    val body: String,
    val date_label: String? = null,
)
