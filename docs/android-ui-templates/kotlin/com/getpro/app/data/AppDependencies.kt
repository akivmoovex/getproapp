package com.getpro.app.data

import com.getpro.app.data.fake.FakeBusinessOnboardingRepository
import com.getpro.app.data.fake.FakeCallbackRepository
import com.getpro.app.data.fake.FakeCategoryRepository
import com.getpro.app.data.fake.FakeSearchApiService
import com.getpro.app.data.fake.FakeProfessionalRepository
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
 * [com.getpro.app.data.api.GetProApiService] + [com.getpro.app.data.mapper.DtoToUiMappers];
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
    val professionalRepository: ProfessionalRepository = FakeProfessionalRepository()
    val callbackRepository: CallbackRepository = FakeCallbackRepository()
    val onboardingRepository: BusinessOnboardingRepository = FakeBusinessOnboardingRepository()
}
