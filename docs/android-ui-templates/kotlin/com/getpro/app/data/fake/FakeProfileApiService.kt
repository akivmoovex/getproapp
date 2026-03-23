package com.getpro.app.data.fake

import com.getpro.app.data.api.ProfileApiService
import com.getpro.app.data.api.dto.CompanyProfileDto
import com.getpro.app.data.api.dto.ReviewDto
import com.getpro.app.data.fake.FakeDataSource.ProfessionalRecord
import kotlinx.coroutines.delay

/**
 * Stub implementation: builds [CompanyProfileDto] from in-memory [FakeDataSource] records.
 * Same semantics as legacy [FakeProfessionalRepository] but exercises DTO → mapper → [ProfileUiModel].
 */
class FakeProfileApiService : ProfileApiService {

    override suspend fun getCompanyProfile(idOrSlug: String): CompanyProfileDto? {
        delay(200)
        val rec = FakeDataSource.professionals.find { it.id == idOrSlug || it.slug == idOrSlug }
            ?: return null
        return toDto(rec)
    }

    private fun toDto(rec: ProfessionalRecord): CompanyProfileDto = CompanyProfileDto(
        id = rec.id,
        slug = rec.slug,
        name = rec.name,
        headline = rec.headline,
        category_name = rec.categoryName,
        city = rec.city,
        about = rec.about,
        services = rec.servicesLines,
        phone = rec.phone,
        whatsapp_href = rec.whatsapp,
        years_in_business = rec.yearsInBusiness,
        rating = rec.rating,
        review_count = rec.reviewCount,
        reviews = rec.reviews.map { r ->
            ReviewDto(
                author = r.author,
                rating = r.ratingStars,
                body = r.body,
                date_label = r.dateLabel,
            )
        },
    )
}
