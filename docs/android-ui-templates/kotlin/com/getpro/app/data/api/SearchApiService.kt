package com.getpro.app.data.api

import com.getpro.app.data.api.dto.DirectoryResponseDto
import com.getpro.app.data.api.dto.SearchRequestDto

/**
 * Minimal API abstraction for directory search.
 *
 * Today this template uses an in-memory/stub implementation so the full
 * contract→DTO→mapper→repository→ViewModel chain is testable.
 *
 * TODO: Replace this with a Retrofit implementation of `GET /api/v1/directory`
 * using [SearchRequestDto] mapped to query params.
 */
interface SearchApiService {
    suspend fun search(request: SearchRequestDto): DirectoryResponseDto
}

