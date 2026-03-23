package com.getpro.app.data.fake

import com.getpro.app.data.repository.ProfessionalRepository
import com.getpro.app.ui.model.ProfileUiModel
import kotlinx.coroutines.delay

class FakeProfessionalRepository : ProfessionalRepository {
    override suspend fun getById(id: String): ProfileUiModel? {
        delay(200)
        val rec = FakeDataSource.professionals.find { it.id == id } ?: return null
        return FakeDataSource.toProfile(rec)
    }

    override suspend fun getByIdOrSlug(idOrSlug: String): ProfileUiModel? {
        delay(200)
        val rec = FakeDataSource.professionals.find { it.id == idOrSlug || it.slug == idOrSlug }
            ?: return null
        return FakeDataSource.toProfile(rec)
    }
}
