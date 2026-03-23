package com.getpro.app.ui.navigation

import android.net.Uri

/**
 * Encodes path segments for [NavHost] routes. Blank values use `__` placeholder.
 */
object NavEncoding {
    const val EMPTY_SEGMENT = "__"

    fun encodeSegment(s: String): String =
        if (s.isBlank()) EMPTY_SEGMENT else Uri.encode(s, "UTF-8")

    fun decodeSegment(s: String): String =
        if (s == EMPTY_SEGMENT) "" else Uri.decode(s)
}
