package com.getpro.app.data.api.dto

/**
 * Proposed `GET /api/v1/categories` response (see docs/android-api-contracts.md).
 * TODO: Align with backend when the endpoint ships.
 */
data class CategoriesResponseDto(
    val categories: List<CategoryDto> = emptyList(),
)

data class CategoryDto(
    val id: String,
    val name: String,
    val slug: String,
    val sort: Int = 0,
)
