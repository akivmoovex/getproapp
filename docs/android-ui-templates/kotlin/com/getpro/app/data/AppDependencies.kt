package com.getpro.app.data

import com.getpro.app.data.fake.FakeBusinessOnboardingRepository
import com.getpro.app.data.fake.FakeCallbackRepository
import com.getpro.app.data.fake.FakeCategoryRepository
import com.getpro.app.data.fake.FakeProfessionalRepository
import com.getpro.app.data.fake.FakeSearchRepository
import com.getpro.app.data.repository.BusinessOnboardingRepository
import com.getpro.app.data.repository.CallbackRepository
import com.getpro.app.data.repository.CategoryRepository
import com.getpro.app.data.repository.ProfessionalRepository
import com.getpro.app.data.repository.SearchRepository

/**
 * Simple service locator for prototype — replace with Hilt / manual DI later.
 */
object AppDependencies {
    val categoryRepository: CategoryRepository = FakeCategoryRepository()
    val searchRepository: SearchRepository = FakeSearchRepository()
    val professionalRepository: ProfessionalRepository = FakeProfessionalRepository()
    val callbackRepository: CallbackRepository = FakeCallbackRepository()
    val onboardingRepository: BusinessOnboardingRepository = FakeBusinessOnboardingRepository()
}
