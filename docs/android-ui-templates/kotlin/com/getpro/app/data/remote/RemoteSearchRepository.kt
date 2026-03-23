package com.getpro.app.data.remote

import com.getpro.app.data.api.SearchApiService
import com.getpro.app.data.api.dto.SearchRequestDto
import com.getpro.app.data.api.mapper.DtoToUiMappers
import com.getpro.app.data.model.SearchParams
import com.getpro.app.data.repository.SearchRepository
import com.getpro.app.ui.model.ProfessionalUiModel

/**
 * Real-ready search repository path.
 *
 * Vertical slice: ViewModel -> [SearchRepository] -> [SearchApiService] (DTOs)
 * -> [DtoToUiMappers] (mappers) -> [ProfessionalUiModel] (UI models)
 *
 * TODO: Thread tenant/context for read APIs once backend read endpoints are finalized.
 */
class RemoteSearchRepository(
    private val api: SearchApiService,
) : SearchRepository {

    override suspend fun search(params: SearchParams): List<ProfessionalUiModel> {
        val request = SearchRequestDto(
            q = params.service,
            city = params.city,
            category = params.categorySlug,
        )

        val response = api.search(request)
        return response.items.map(DtoToUiMappers::directoryCompany)
    }
}

