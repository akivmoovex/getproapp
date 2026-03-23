package com.getpro.app.data.api.dto

/**
 * Proposed `GET /api/v1/directory` response (see docs/android-api-contracts.md).
 * TODO: Align field names with backend (snake_case vs camelCase).
 */
data class DirectoryResponseDto(
    val items: List<DirectoryCompanyDto> = emptyList(),
    val total: Int? = null,
)

data class DirectoryCompanyDto(
    val id: String,
    val slug: String? = null,
    val name: String,
    val headline: String? = null,
    val category_name: String? = null,
    val city: String? = null,
    val phone: String? = null,
    val whatsapp_href: String? = null,
    val rating: Float? = null,
    val review_count: Int? = null,
    val logo_url: String? = null,
)
