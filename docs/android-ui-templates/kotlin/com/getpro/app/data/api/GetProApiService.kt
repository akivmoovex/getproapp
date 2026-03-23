package com.getpro.app.data.api

import com.getpro.app.data.api.dto.CategoriesResponseDto
import com.getpro.app.data.api.dto.CompanyProfileDto
import com.getpro.app.data.api.dto.DirectoryResponseDto
import com.getpro.app.data.api.dto.PostOkResponseDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Retrofit service — **not** wired in this template repo.
 *
 * TODO: Add Retrofit + OkHttp in Gradle; use [Response] wrappers to read errors via [com.getpro.app.data.api.model.ApiErrorBody].
 * Base URL: tenant API host or [BuildConfig.API_BASE_URL].
 */
interface GetProApiService {

    @GET("/api/v1/categories")
    suspend fun getCategories(): Response<CategoriesResponseDto>

    @GET("/api/v1/directory")
    suspend fun getDirectory(
        @Query("q") query: String? = null,
        @Query("city") city: String? = null,
        @Query("category") categorySlug: String? = null,
        @Query("page") page: Int? = null,
        @Query("page_size") pageSize: Int? = null,
    ): Response<DirectoryResponseDto>

    @GET("/api/v1/companies/{id}")
    suspend fun getCompany(@Path("id") id: String): Response<CompanyProfileDto>

    @POST("/api/callback-interest")
    suspend fun postCallbackInterest(@Body body: Map<String, @JvmSuppressWildcards Any?>): Response<PostOkResponseDto>

    @POST("/api/professional-signups")
    suspend fun postProfessionalSignup(@Body body: Map<String, @JvmSuppressWildcards Any?>): Response<PostOkResponseDto>

    @POST("/api/leads")
    suspend fun postLead(@Body body: Map<String, @JvmSuppressWildcards Any?>): Response<PostOkResponseDto>
}
