package com.getpro.app.data.repository

import com.getpro.app.ui.model.CategoryUiModel

interface CategoryRepository {
    suspend fun getCategories(): List<CategoryUiModel>
}
