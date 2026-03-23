package com.getpro.app.data.fake

import com.getpro.app.data.repository.CategoryRepository
import com.getpro.app.ui.model.CategoryUiModel
import kotlinx.coroutines.delay

class FakeCategoryRepository : CategoryRepository {
    override suspend fun getCategories(): List<CategoryUiModel> {
        delay(180)
        return FakeDataSource.categories
    }
}
