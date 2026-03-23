package com.getpro.app.ui.support

import com.getpro.app.ui.model.CategoryUiModel
import com.getpro.app.ui.model.ProfessionalUiModel
import com.getpro.app.ui.model.ProfileUiModel
import com.getpro.app.ui.model.ReviewUiModel

object SampleData {
    val categories = listOf(
        CategoryUiModel("1", "Electrician", "electrician"),
        CategoryUiModel("2", "Plumber", "plumber"),
        CategoryUiModel("3", "Carpenter", "carpenter"),
    )

    val professionals = listOf(
        ProfessionalUiModel(
            id = "101",
            name = "Spark Electric",
            headline = "Residential & commercial",
            categoryName = "Electrician",
            cityOrLocation = "Lusaka",
            ratingLabel = "4.9 · 12 reviews",
        ),
        ProfessionalUiModel(
            id = "102",
            name = "Flow Plumbing",
            headline = "Emergency repairs",
            categoryName = "Plumber",
            cityOrLocation = "Lusaka",
            ratingLabel = "4.7 · 6 reviews",
        ),
    )

    val profile = ProfileUiModel(
        id = "101",
        name = "Spark Electric",
        headline = "Licensed electricians",
        categoryName = "Electrician",
        location = "Lusaka",
        aboutHtmlOrText = "We install, repair, and certify electrical work.",
        servicesLines = listOf("New installs", "Fault finding", "Certificates"),
        reviews = listOf(
            ReviewUiModel("Amina", 5f, "On time and professional.", "2026"),
        ),
        yearsInBusiness = 10,
    )
}
