package com.getpro.app.data.api

import com.getpro.app.data.api.dto.CompanyProfileDto

/**
 * Read API for a single directory listing (company profile).
 *
 * Proposed backend: `GET /api/v1/companies/:idOrSlug` (see `docs/android-profile-api.md`).
 *
 * TODO: Replace [FakeProfileApiService] with Retrofit when the endpoint exists.
 */
interface ProfileApiService {
    /** Returns `null` when no listing matches. */
    suspend fun getCompanyProfile(idOrSlug: String): CompanyProfileDto?
}
