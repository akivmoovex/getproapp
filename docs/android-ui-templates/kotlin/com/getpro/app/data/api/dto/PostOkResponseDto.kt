package com.getpro.app.data.api.dto

/**
 * Existing POST success shape: `{ "ok": true }` for `/api/callback-interest`, `/api/professional-signups`, `/api/leads`.
 */
data class PostOkResponseDto(
    val ok: Boolean = true,
)
