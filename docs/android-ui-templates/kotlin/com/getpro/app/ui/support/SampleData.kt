package com.getpro.app.ui.support

import com.getpro.app.data.fake.FakeDataSource
import com.getpro.app.ui.model.CategoryUiModel
import com.getpro.app.ui.model.ProfessionalUiModel
import com.getpro.app.ui.model.ProfileUiModel

/** Static previews — aligned with [FakeDataSource] for consistency. */
object SampleData {
    val categories: List<CategoryUiModel> = FakeDataSource.categories

    val professionals: List<ProfessionalUiModel> =
        FakeDataSource.professionals.map(FakeDataSource::toListItem)

    val profile: ProfileUiModel =
        FakeDataSource.toProfile(FakeDataSource.professionals.first())
}
