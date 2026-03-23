package com.getpro.app.data.remote

import com.getpro.app.data.TenantConfig
import com.getpro.app.data.api.CallbackApiService
import com.getpro.app.data.mapper.toCallbackRequestDto
import com.getpro.app.data.repository.CallbackRepository
import com.getpro.app.data.repository.CallbackSubmission

/**
 * Real-ready callback path: [CallbackSubmission] → DTO → [CallbackApiService].
 *
 * TODO: Swap [FakeCallbackApiService] for Retrofit when wiring production.
 */
class RemoteCallbackRepository(
    private val api: CallbackApiService,
    private val tenantConfig: TenantConfig,
) : CallbackRepository {

    override suspend fun submitCallback(submission: CallbackSubmission): Result<Unit> {
        val dto = submission.toCallbackRequestDto(tenantConfig)
        return api.submitCallback(dto).map { }
    }
}
