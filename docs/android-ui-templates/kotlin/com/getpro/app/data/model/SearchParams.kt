package com.getpro.app.data.model

/**
 * Search / navigation params (parity with web directory query: q, city, category).
 */
data class SearchParams(
    val service: String,
    val city: String,
    val categorySlug: String?,
)
