package com.getpro.app.ui.model

/**
 * UI-facing models for Compose templates. Replace with domain models + mappers when wiring APIs.
 */

data class CategoryUiModel(
    val id: String,
    val name: String,
    val slug: String,
)

data class ProfessionalUiModel(
    val id: String,
    val name: String,
    val headline: String?,
    val categoryName: String?,
    val cityOrLocation: String?,
    val ratingLabel: String? = null, // e.g. "4.8 · 12 reviews"
)

data class ReviewUiModel(
    val author: String,
    val ratingStars: Float,
    val body: String,
    val dateLabel: String?,
)

data class ProfileUiModel(
    val id: String,
    val name: String,
    val headline: String?,
    val categoryName: String?,
    val location: String?,
    val aboutHtmlOrText: String?,
    val servicesLines: List<String>,
    val reviews: List<ReviewUiModel>,
    val yearsInBusiness: Int? = null,
)

/** Active query driving [SearchResultsScreen]. */
data class SearchState(
    val queryService: String,
    val queryCity: String,
    val categorySlug: String?,
)

enum class CallbackSheetStage {
    Form,
    Success,
}

data class CallbackFormState(
    val fullName: String = "",
    val phone: String = "",
    val note: String = "",
    val stage: CallbackSheetStage = CallbackSheetStage.Form,
)

data class JoinFormState(
    val profession: String = "",
    val city: String = "",
    val businessName: String = "",
    val phone: String = "",
    val email: String = "",
)

data class ArticleUiModel(
    val slug: String,
    val title: String,
    val excerpt: String?,
)

data class QaItemUiModel(
    val slug: String,
    val question: String,
    val answerPreview: String,
)
