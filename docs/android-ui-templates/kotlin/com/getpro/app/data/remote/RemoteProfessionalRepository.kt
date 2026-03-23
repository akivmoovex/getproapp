package com.getpro.app.data.remote

import com.getpro.app.data.api.ProfileApiService
import com.getpro.app.data.mapper.DtoToUiMappers
import com.getpro.app.data.repository.ProfessionalRepository
import com.getpro.app.ui.model.ProfileUiModel

/**
 * Real-ready profile path: [ProfileApiService] → DTO → [DtoToUiMappers.companyProfile] → [ProfileUiModel].
 *
 * TODO: Swap [FakeProfileApiService] for Retrofit-backed [ProfileApiService] in [com.getpro.app.data.AppDependencies].
 */
class RemoteProfessionalRepository(
    private val api: ProfileApiService,
) : ProfessionalRepository {

    override suspend fun getById(id: String): ProfileUiModel? = getByIdOrSlug(id)

    override suspend fun getByIdOrSlug(idOrSlug: String): ProfileUiModel? {
        val dto = api.getCompanyProfile(idOrSlug) ?: return null
        return DtoToUiMappers.companyProfile(dto)
    }
}
