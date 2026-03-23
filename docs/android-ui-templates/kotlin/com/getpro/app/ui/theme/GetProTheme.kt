package com.getpro.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// TODO: Replace with tenant/remote brand colors (see web theme / tenant settings).

private val LightColors: ColorScheme = lightColorScheme(
    primary = Color(0xFF1565C0),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD0E4FF),
    secondary = Color(0xFF5C5F62),
    surface = Color(0xFFFDFCFF),
    onSurface = Color(0xFF1A1C1E),
    outline = Color(0xFF73777F),
)

private val DarkColors: ColorScheme = darkColorScheme(
    primary = Color(0xFF9ECAFF),
    onPrimary = Color(0xFF003258),
    surface = Color(0xFF1A1C1E),
    onSurface = Color(0xFFE2E2E6),
)

private val AppTypography = Typography()

@Composable
fun GetProTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = AppTypography,
        content = content,
    )
}
