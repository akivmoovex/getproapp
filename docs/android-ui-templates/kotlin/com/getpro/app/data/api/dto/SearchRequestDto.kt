package com.getpro.app.data.api.dto

/**
 * Proposed request model for directory search (`GET /api/v1/directory`).
 *
 * Android uses `q`=service/profession, `city`=city filter, `category`=optional category slug.
 *
 * TODO: Align with backend once the JSON/endpoint exists.
 */
data class SearchRequestDto(
    val q: String,
    val city: String,
    val category: String? = null,
    val page: Int? = null,
    val page_size: Int? = null,
)

