package com.getpro.app.data.repository

import com.getpro.app.ui.model.ProfileUiModel

interface ProfessionalRepository {
    suspend fun getById(id: String): ProfileUiModel?

    /**
     * Resolves listing by numeric id (e.g. `101`) or slug (e.g. `lusaka-spark-electric`).
     * Backend may expose `GET /api/v1/companies/:id` or slug-based route — see [ProfileApiService].
     */
    suspend fun getByIdOrSlug(idOrSlug: String): ProfileUiModel?
}
