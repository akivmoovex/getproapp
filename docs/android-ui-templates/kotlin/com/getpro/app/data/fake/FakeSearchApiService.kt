package com.getpro.app.data.fake

import com.getpro.app.data.api.SearchApiService
import com.getpro.app.data.api.dto.DirectoryCompanyDto
import com.getpro.app.data.api.dto.DirectoryResponseDto
import com.getpro.app.data.api.dto.SearchRequestDto
import com.getpro.app.data.fake.FakeDataSource.ProfessionalRecord
import kotlinx.coroutines.delay

/**
 * Stubbed JSON API for directory search.
 *
 * This is intentionally "fake network": it returns real DTO shapes and uses
 * the same in-memory professional directory as the existing fake repositories.
 *
 * TODO: Swap this class for a Retrofit-backed implementation calling
 * `GET /api/v1/directory` when the endpoint ships.
 */
class FakeSearchApiService : SearchApiService {
    override suspend fun search(request: SearchRequestDto): DirectoryResponseDto {
        delay(260)

        val service = request.q.trim().lowercase()
        val city = request.city.trim().lowercase()
        val cat = request.category?.trim()?.lowercase()

        val items = FakeDataSource.professionals
            .asSequence()
            .filter { rec: ProfessionalRecord ->
                val matchCat = cat.isNullOrBlank() || rec.categorySlug == cat
                val matchCity =
                    city.isBlank() ||
                        rec.city.lowercase().contains(city) ||
                        city.contains(rec.city.lowercase())
                val matchService =
                    service.isBlank() ||
                        rec.name.lowercase().contains(service) ||
                        rec.headline.lowercase().contains(service) ||
                        rec.categoryName.lowercase().contains(service) ||
                        rec.about.lowercase().contains(service)

                matchCat && matchCity && matchService
            }
            .map { rec -> toDirectoryCompanyDto(rec) }
            .toList()

        return DirectoryResponseDto(
            items = items,
            total = items.size,
        )
    }

    private fun toDirectoryCompanyDto(rec: ProfessionalRecord): DirectoryCompanyDto =
        DirectoryCompanyDto(
            id = rec.id,
            slug = rec.slug,
            name = rec.name,
            headline = rec.headline,
            category_name = rec.categoryName,
            city = rec.city,
            phone = rec.phone,
            whatsapp_href = rec.whatsapp,
            rating = rec.rating,
            review_count = rec.reviewCount,
        )
}

