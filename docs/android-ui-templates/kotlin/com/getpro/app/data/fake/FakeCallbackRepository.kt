package com.getpro.app.data.fake

import com.getpro.app.data.repository.CallbackRepository
import com.getpro.app.data.repository.CallbackSubmission
import kotlinx.coroutines.delay

class FakeCallbackRepository : CallbackRepository {
    override suspend fun submitCallback(submission: CallbackSubmission): Result<Unit> {
        delay(350)
        return if (submission.phone.length >= 8 && submission.fullName.length >= 2) {
            Result.success(Unit)
        } else {
            Result.failure(IllegalArgumentException("Invalid callback payload"))
        }
    }
}
