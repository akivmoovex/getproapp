package com.getpro.app.data.mapper

import com.getpro.app.data.TenantConfig
import com.getpro.app.data.api.dto.CallbackRequestDto
import com.getpro.app.data.model.CallbackSource
import com.getpro.app.data.repository.CallbackSubmission

/**
 * Maps domain [CallbackSubmission] → transport [CallbackRequestDto].
 * Keeps JSON shape out of ViewModels.
 */
fun CallbackSubmission.toCallbackRequestDto(tenant: TenantConfig): CallbackRequestDto {
    val interest = buildInterestLabel(this).take(120)
    val ctx = buildContextField(this).take(120)
    return CallbackRequestDto(
        name = fullName.trim(),
        phone = phone.trim(),
        tenantId = tenant.tenantId,
        tenantSlug = tenant.tenantSlug,
        context = ctx,
        interest_label = interest,
        cityName = cityName?.trim()?.takeIf { it.isNotBlank() },
    )
}

private fun buildInterestLabel(s: CallbackSubmission): String = when (s.source) {
    CallbackSource.Generic -> s.interestLabel
    CallbackSource.EmptyResults -> {
        val q = s.searchQuery?.trim().orEmpty()
        val c = s.searchCity?.trim().orEmpty()
        val base = "Android — no results"
        val detail = listOf(q, c).filter { it.isNotBlank() }.joinToString(" · ")
        if (detail.isNotBlank()) "$base · $detail" else base
    }
    CallbackSource.Profile -> {
        val id = s.companyId?.trim().orEmpty()
        if (id.isNotBlank()) "Android — profile · company $id" else "Android — profile"
    }
}

private fun buildContextField(s: CallbackSubmission): String {
    val base = s.context.trim().ifBlank { "android_callback" }
    val note = s.note.trim()
    return if (note.isEmpty()) base else "$base · note: ${note.take(80)}"
}
