package com.getpro.app.data.fake

import com.getpro.app.ui.model.CategoryUiModel
import com.getpro.app.ui.model.ProfileUiModel
import com.getpro.app.ui.model.ReviewUiModel
import com.getpro.app.ui.model.ProfessionalUiModel

/**
 * In-memory directory — Zambia-focused fake data for prototype flows.
 * TODO: replace with API DTOs + repository backed by GET /api/v1/directory (when available).
 */
object FakeDataSource {

    val categories: List<CategoryUiModel> = listOf(
        CategoryUiModel("c1", "Electrician", "electrician"),
        CategoryUiModel("c2", "Plumber", "plumber"),
        CategoryUiModel("c3", "Carpenter", "carpenter"),
        CategoryUiModel("c4", "HVAC", "hvac"),
        CategoryUiModel("c5", "Painter", "painter"),
    )

    /**
     * Full records for search + profile detail.
     */
    data class ProfessionalRecord(
        val id: String,
        val slug: String,
        val name: String,
        val categorySlug: String,
        val categoryName: String,
        val city: String,
        val headline: String,
        val about: String,
        val servicesLines: List<String>,
        val phone: String,
        val whatsapp: String?,
        val rating: Float,
        val reviewCount: Int,
        val reviews: List<ReviewUiModel>,
        val yearsInBusiness: Int,
    )

    val professionals: List<ProfessionalRecord> = listOf(
        ProfessionalRecord(
            id = "101",
            slug = "lusaka-spark-electric",
            name = "Spark Electric Ltd",
            categorySlug = "electrician",
            categoryName = "Electrician",
            city = "Lusaka",
            headline = "Residential & commercial electrical",
            about = "Certified installs, fault finding, and compliance certificates across Lusaka.",
            servicesLines = listOf("Rewiring", "New builds", "Emergency call-outs"),
            phone = "+260971234567",
            whatsapp = "https://wa.me/260971234567",
            rating = 4.9f,
            reviewCount = 12,
            reviews = listOf(
                ReviewUiModel("Chanda", 5f, "On time and tidy work.", "Mar 2026"),
                ReviewUiModel("Mwansa", 5f, "Clear quote before starting.", "Feb 2026"),
            ),
            yearsInBusiness = 10,
        ),
        ProfessionalRecord(
            id = "102",
            slug = "flow-plumbing-lusaka",
            name = "Flow Plumbing Co.",
            categorySlug = "plumber",
            categoryName = "Plumber",
            city = "Lusaka",
            headline = "Leaks, geysers, and new fittings",
            about = "Emergency repairs and planned bathroom upgrades.",
            servicesLines = listOf("Burst pipes", "Geysers", "Bathroom refits"),
            phone = "+260977111222",
            whatsapp = null,
            rating = 4.7f,
            reviewCount = 6,
            reviews = listOf(
                ReviewUiModel("Tisa", 5f, "Came out same evening.", "Jan 2026"),
            ),
            yearsInBusiness = 6,
        ),
        ProfessionalRecord(
            id = "103",
            slug = "livingstone-carpentry",
            name = "Livingstone Woodworks",
            categorySlug = "carpenter",
            categoryName = "Carpenter",
            city = "Livingstone",
            headline = "Custom cabinets & doors",
            about = "Workshop and on-site fitting for homes and lodges.",
            servicesLines = listOf("Kitchen units", "Doors", "Decking"),
            phone = "+260966333444",
            whatsapp = "https://wa.me/260966333444",
            rating = 4.8f,
            reviewCount = 9,
            reviews = emptyList(),
            yearsInBusiness = 14,
        ),
        ProfessionalRecord(
            id = "104",
            slug = "ndola-cool-air",
            name = "CoolAir HVAC",
            categorySlug = "hvac",
            categoryName = "HVAC",
            city = "Ndola",
            headline = "Split units & ventilation",
            about = "Supply, install, and service for offices and homes.",
            servicesLines = listOf("Split AC", "Ducting", "Maintenance"),
            phone = "+260955444555",
            whatsapp = null,
            rating = 4.6f,
            reviewCount = 4,
            reviews = emptyList(),
            yearsInBusiness = 8,
        ),
        ProfessionalRecord(
            id = "105",
            slug = "kitwe-finish-paint",
            name = "FinishLine Painters",
            categorySlug = "painter",
            categoryName = "Painter",
            city = "Kitwe",
            headline = "Interior & exterior finishes",
            about = "Prep-first painting for residential projects.",
            servicesLines = listOf("Interior", "Exterior", "Roof coating"),
            phone = "+260977888999",
            whatsapp = "https://wa.me/260977888999",
            rating = 4.5f,
            reviewCount = 11,
            reviews = emptyList(),
            yearsInBusiness = 5,
        ),
        ProfessionalRecord(
            id = "106",
            slug = "lusaka-master-electric",
            name = "Master Electric Solutions",
            categorySlug = "electrician",
            categoryName = "Electrician",
            city = "Lusaka",
            headline = "Industrial & domestic",
            about = "Large-panel work and domestic repairs.",
            servicesLines = listOf("DB upgrades", "Solar tie-in", "Testing"),
            phone = "+260966000111",
            whatsapp = null,
            rating = 4.4f,
            reviewCount = 15,
            reviews = emptyList(),
            yearsInBusiness = 12,
        ),
    )

    fun toListItem(r: ProfessionalRecord): ProfessionalUiModel = ProfessionalUiModel(
        id = r.id,
        name = r.name,
        headline = r.headline,
        categoryName = r.categoryName,
        cityOrLocation = r.city,
        ratingLabel = "${"%.1f".format(r.rating)} · ${r.reviewCount} reviews",
    )

    fun toProfile(r: ProfessionalRecord): ProfileUiModel = ProfileUiModel(
        id = r.id,
        name = r.name,
        headline = r.headline,
        categoryName = r.categoryName,
        location = r.city,
        aboutHtmlOrText = r.about,
        servicesLines = r.servicesLines,
        reviews = r.reviews,
        yearsInBusiness = r.yearsInBusiness,
        phone = r.phone,
        whatsappHref = r.whatsapp,
    )
}
