package com.getpro.app.data.api.dto

/**
 * Proposed `GET /api/v1/companies/:id` response (see docs/android-api-contracts.md).
 * TODO: Expand to match full company row + reviews + media from backend.
 */
data class CompanyProfileDto(
    val id: String,
    val name: String,
    val headline: String? = null,
    val category_name: String? = null,
    val city: String? = null,
    val about: String? = null,
    val services: List<String> = emptyList(),
    val phone: String? = null,
    val whatsapp_href: String? = null,
    val years_in_business: Int? = null,
    val reviews: List<ReviewDto> = emptyList(),
)

data class ReviewDto(
    val author: String,
    val rating: Float,
    val body: String,
    val date_label: String? = null,
)
