package com.getpro.app.ui.navigation

/**
 * Central route strings for [AppNavigation].
 * Profile uses id today on web: /company/:id
 */
object Routes {
    const val HOME = "home"
    const val RESULTS = "results"
    const val CATEGORY_BROWSE = "category_browse"
    const val PROFILE = "profile"
    const val BUSINESS_ENTRY = "business_entry"
    const val JOIN_BUSINESS = "join_business"
    const val ARTICLE_LIST = "articles"
    const val ARTICLE_DETAIL = "article_detail"
    const val QA = "qa"

    const val ARG_SERVICE = "service"
    const val ARG_CITY = "city"
    const val ARG_CATEGORY = "category"
    const val ARG_PROFILE_ID = "profileId"
    const val ARG_SLUG = "slug"

    /** Path args are [NavEncoding]-encoded; blank segments use [NavEncoding.EMPTY_SEGMENT]. */
    const val RESULTS_WITH_ARGS =
        "$RESULTS/{$ARG_SERVICE}/{$ARG_CITY}/{$ARG_CATEGORY}"

    fun profileRoute(id: String) = "$PROFILE/{$ARG_PROFILE_ID}"

    fun buildResultsRoute(service: String, city: String, categorySlug: String?) =
        "$RESULTS/${NavEncoding.encodeSegment(service)}/" +
            "${NavEncoding.encodeSegment(city)}/" +
            NavEncoding.encodeSegment(categorySlug ?: "")

    fun resultsRouteTemplate() =
        "$RESULTS?$ARG_SERVICE={$ARG_SERVICE}&$ARG_CITY={$ARG_CITY}&$ARG_CATEGORY={$ARG_CATEGORY}"
}
