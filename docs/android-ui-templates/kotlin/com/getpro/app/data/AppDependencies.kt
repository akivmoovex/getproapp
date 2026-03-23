package com.getpro.app.data

import com.getpro.app.data.TenantConfig
import com.getpro.app.data.fake.FakeBusinessOnboardingRepository
import com.getpro.app.data.fake.FakeCallbackApiService
import com.getpro.app.data.fake.FakeCategoryRepository
import com.getpro.app.data.fake.FakeSearchApiService
import com.getpro.app.data.fake.FakeProfileApiService
import com.getpro.app.data.remote.RemoteCallbackRepository
import com.getpro.app.data.remote.RemoteProfessionalRepository
import com.getpro.app.data.remote.RemoteSearchRepository
import com.getpro.app.data.repository.BusinessOnboardingRepository
import com.getpro.app.data.repository.CallbackRepository
import com.getpro.app.data.repository.CategoryRepository
import com.getpro.app.data.repository.ProfessionalRepository
import com.getpro.app.data.repository.SearchRepository

/**
 * Simple service locator for prototype — replace with Hilt / manual DI later.
 *
 * **Swap to real API:** provide [com.getpro.app.data.repository] implementations that call
 * [SearchApiService] / [ProfileApiService] + [com.getpro.app.data.mapper.DtoToUiMappers]
 * (optionally consolidate behind Retrofit [com.getpro.app.data.api.GetProApiService] later);
 * keep ViewModels on the same interfaces. See `docs/android-repository-swap-plan.md`.
 */
object AppDependencies {
    val categoryRepository: CategoryRepository = FakeCategoryRepository()
    // Search vertical slice proof:
    //   SearchViewModel -> SearchRepository -> SearchApiService (DTOs) -> Dto mapper -> UI state.
    // TODO: Swap FakeSearchApiService with a Retrofit-backed implementation when
    //       `GET /api/v1/directory` is available.
    val searchRepository: SearchRepository = RemoteSearchRepository(FakeSearchApiService())
    // If you want the legacy direct mapping path, you can swap back to:
    // val searchRepository: SearchRepository = FakeSearchRepository()
    // Profile vertical slice: ViewModel -> ProfessionalRepository -> ProfileApiService (DTOs) -> mapper -> ProfileUiModel.
    // TODO: Swap FakeProfileApiService for Retrofit [ProfileApiService] when GET /api/v1/companies/:idOrSlug exists.
    val professionalRepository: ProfessionalRepository = RemoteProfessionalRepository(FakeProfileApiService())
    // Legacy direct fake mapping:
    // val professionalRepository: ProfessionalRepository = FakeProfessionalRepository()
    // Callback vertical slice: ViewModel -> CallbackRepository -> CallbackApiService (DTO) -> POST /api/callback-interest.
    // TODO: Swap FakeCallbackApiService for Retrofit; set [TenantConfig] from BuildConfig to match production tenant row.
    val callbackRepository: CallbackRepository = RemoteCallbackRepository(
        FakeCallbackApiService(),
        TenantConfig.prototype,
    )
    // Legacy in-memory fake (no DTO path):
    // val callbackRepository: CallbackRepository = FakeCallbackRepository()
    val onboardingRepository: BusinessOnboardingRepository = FakeBusinessOnboardingRepository()
}
