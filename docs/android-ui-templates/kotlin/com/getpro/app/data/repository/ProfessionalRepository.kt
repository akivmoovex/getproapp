package com.getpro.app.data.repository

import com.getpro.app.ui.model.ProfileUiModel

interface ProfessionalRepository {
    suspend fun getById(id: String): ProfileUiModel?

    /** Resolves listing by id (e.g. `101`) or slug (e.g. `lusaka-spark-electric`). */
    suspend fun getByIdOrSlug(idOrSlug: String): ProfileUiModel?
}
