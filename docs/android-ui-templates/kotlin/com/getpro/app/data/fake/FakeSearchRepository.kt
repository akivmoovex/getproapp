package com.getpro.app.data.fake

import com.getpro.app.data.model.SearchParams
import com.getpro.app.data.repository.SearchRepository
import com.getpro.app.ui.model.ProfessionalUiModel
import kotlinx.coroutines.delay

class FakeSearchRepository : SearchRepository {

    override suspend fun search(params: SearchParams): List<ProfessionalUiModel> {
        delay(220)
        val service = params.service.trim().lowercase()
        val city = params.city.trim().lowercase()
        val cat = params.categorySlug?.trim()?.lowercase()

        return FakeDataSource.professionals
            .asSequence()
            .filter { rec ->
                val matchCat = cat.isNullOrBlank() || rec.categorySlug == cat
                val matchCity = city.isBlank() || rec.city.lowercase().contains(city) || city.contains(rec.city.lowercase())
                val matchService = service.isBlank() ||
                    rec.name.lowercase().contains(service) ||
                    rec.headline.lowercase().contains(service) ||
                    rec.categoryName.lowercase().contains(service) ||
                    rec.about.lowercase().contains(service)
                matchCat && matchCity && matchService
            }
            .map(FakeDataSource::toListItem)
            .toList()
    }
}
