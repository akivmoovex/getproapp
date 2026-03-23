package com.getpro.app.data.api

/**
 * Maps HTTP + parsed body failures without throwing across repository boundaries.
 * TODO: use consistently in remote repository implementations; ViewModels map to [com.getpro.app.ui.state] errors.
 */
sealed class NetworkResult<out T> {
    data class Success<T>(val data: T) : NetworkResult<T>()
    data class HttpError(val code: Int, val message: String?) : NetworkResult<Nothing>()
    data class NetworkFailure(val throwable: Throwable) : NetworkResult<Nothing>()
}

fun <T> NetworkResult<T>.toResult(): kotlin.Result<T> = when (this) {
    is NetworkResult.Success -> kotlin.Result.success(data)
    is NetworkResult.HttpError -> kotlin.Result.failure(
        IllegalStateException(message ?: "HTTP $code"),
    )
    is NetworkResult.NetworkFailure -> kotlin.Result.failure(throwable)
}
