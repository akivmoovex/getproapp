package com.getpro.app.data.repository

import com.getpro.app.data.model.SearchParams
import com.getpro.app.ui.model.ProfessionalUiModel

interface SearchRepository {
    suspend fun search(params: SearchParams): List<ProfessionalUiModel>
}
