package com.getpro.app.data.mapper

import com.getpro.app.data.api.dto.CategoryDto
import com.getpro.app.data.api.dto.CompanyProfileDto
import com.getpro.app.data.api.dto.DirectoryCompanyDto
import com.getpro.app.ui.model.CategoryUiModel
import com.getpro.app.ui.model.ProfileUiModel
import com.getpro.app.ui.model.ProfessionalUiModel
import com.getpro.app.ui.model.ReviewUiModel

/**
 * DTO → [com.getpro.app.ui.model] mappers for remote repositories.
 * TODO: Implement when [com.getpro.app.data.api.GetProApiService] is wired; keep mapping out of ViewModels.
 */
object DtoToUiMappers {

    fun category(dto: CategoryDto): CategoryUiModel = CategoryUiModel(
        id = dto.id,
        name = dto.name,
        slug = dto.slug,
    )

    fun directoryCompany(dto: DirectoryCompanyDto): ProfessionalUiModel {
        val ratingLabel = when {
            dto.rating != null && dto.review_count != null ->
                "%.1f · %d reviews".format(dto.rating, dto.review_count)
            else -> null
        }
        return ProfessionalUiModel(
            id = dto.id,
            name = dto.name,
            headline = dto.headline,
            categoryName = dto.category_name,
            cityOrLocation = dto.city,
            ratingLabel = ratingLabel,
        )
    }

    fun companyProfile(dto: CompanyProfileDto): ProfileUiModel {
        val location = listOfNotNull(dto.city, dto.address)
            .filter { it.isNotBlank() }
            .distinct()
            .joinToString(" · ")
            .takeIf { it.isNotBlank() }
        return ProfileUiModel(
            id = dto.id,
            name = dto.name,
            headline = dto.headline,
            categoryName = dto.category_name,
            location = location ?: dto.city,
            aboutHtmlOrText = dto.about,
            servicesLines = when {
                dto.services.isNotEmpty() -> dto.services
                dto.service_areas.isNotEmpty() -> dto.service_areas
                else -> emptyList()
            },
            reviews = dto.reviews.map { r ->
                ReviewUiModel(
                    author = r.author,
                    ratingStars = r.rating,
                    body = r.body,
                    dateLabel = r.date_label,
                )
            },
            yearsInBusiness = dto.years_in_business,
            phone = dto.phone,
            whatsappHref = dto.whatsapp_href,
        )
    }
}
